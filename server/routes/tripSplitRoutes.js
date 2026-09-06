"use strict";

/*
DESTINATION PATH:
server/routes/tripSplitRoutes.js

PURPOSE:
Broker Trip Split backend.

ENDPOINTS AFTER MOUNT:
GET    /api/trip-split/bootstrap
POST   /api/trip-split/share
POST   /api/trip-split/confirm
PATCH  /api/trip-split/trips/:id
DELETE /api/trip-split/trips/:id

IMPORTANT:
- Broker trips confirmed here go DIRECTLY to Dispatch.
- Trips Hub is not used.
- Trips with stops remain normal and are excluded from Share.
- Shared Engine returns route proposals.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const ExternalTrip = require("../models/ExternalTrip");
const BrokerIntegration = require("../models/BrokerIntegration");
const SharedEngineSettings = require("../models/SharedEngineSettings");
const TripSplitState = require("../models/TripSplitState");

const {
  mergeSettings,
  planSharedTrips
} = require("../services/sharedEngine");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function bearerToken(req){
  const auth = clean(req.headers.authorization);

  if(!auth.toLowerCase().startsWith("bearer ")){
    return "";
  }

  return auth.slice(7).trim();
}

function requireStaff(req,res,next){
  const token = bearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{
    const decoded = jwt.verify(token,JWT_SECRET);
    const role = upper(decoded.role);

    if(!["SUPER_ADMIN","ADMIN","DISPATCHER"].includes(role)){
      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
    }

    if(!decoded.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser = decoded;
    next();
  }catch(err){
    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(requireStaff);

function tenantObjectId(req){
  const value = clean(req.authUser?.tenantId);

  if(!mongoose.Types.ObjectId.isValid(value)){
    throw new Error("Invalid tenant");
  }

  return new mongoose.Types.ObjectId(value);
}

function getTripModel(){
  const Trip =
    global.Trip ||
    mongoose.models.Trip ||
    null;

  if(!Trip){
    throw new Error("Trip model not loaded");
  }

  return Trip;
}

function phoenixDateKey(offsetDays = 0){
  const now = new Date();

  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:"America/Phoenix",
      year:"numeric",
      month:"2-digit",
      day:"2-digit"
    }
  ).formatToParts(now);

  const map = {};

  for(const part of parts){
    map[part.type] = part.value;
  }

  const base = new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day)
    )
  );

  base.setUTCDate(base.getUTCDate() + offsetDays);

  return [
    base.getUTCFullYear(),
    String(base.getUTCMonth() + 1).padStart(2,"0"),
    String(base.getUTCDate()).padStart(2,"0")
  ].join("-");
}

async function brokerCapabilities(tenantId){
  const integration = await BrokerIntegration.findOne({
    tenantId,
    enabled:true,
    featureVisible:{$ne:false}
  }).lean();

  const settings =
    await SharedEngineSettings
      .findOne({tenantId})
      .lean();

  return {
    brokerContractEnabled:Boolean(integration),
    sharedServiceFound:
      settings?.enabled !== false &&
      settings?.sources?.broker?.enabled !== false
  };
}

async function getProcessedSet(tenantId,tripIds){
  if(!tripIds.length){
    return new Set();
  }

  const rows = await TripSplitState.find({
    tenantId,
    externalTripObjectId:{$in:tripIds},
    confirmed:true
  })
    .select("externalTripObjectId")
    .lean();

  return new Set(
    rows.map(row=>String(row.externalTripObjectId))
  );
}

function originalTripPayload(externalTrip){
  return {
    tenantId:externalTrip.tenantId,
    type:"company",

    tripNumber:
      externalTrip.ghExternalTripNumber ||
      externalTrip.externalTripNumber ||
      externalTrip.externalTripId,

    externalSource:"BROKER",
    brokerName:externalTrip.brokerName,
    brokerCode:externalTrip.brokerCode,
    brokerTripId:externalTrip.externalTripId,

    serviceKey:
      externalTrip.serviceKey ||
      "STANDARD",
    serviceCode:
      externalTrip.serviceKey ||
      "STANDARD",
    serviceType:
      externalTrip.serviceKey ||
      "STANDARD",

    tripDate:externalTrip.tripDate,
    tripTime:externalTrip.tripTime,

    clientName:externalTrip.clientName,
    clientPhone:externalTrip.clientPhone,
    clientEmail:externalTrip.clientEmail,

    pickup:externalTrip.pickup,
    dropoff:externalTrip.dropoff,
    stops:safeArray(externalTrip.stops),

    notes:externalTrip.notes,

    isShared:false,
    groupId:"",
    tripType:"INDIVIDUAL",

    dispatchSelected:true,
    disabled:false,
    status:"Scheduled",

    source:"EXTERNAL"
  };
}

function passengerPayload(externalTrip,index){
  return {
    passengerId:String(externalTrip._id),
    clientName:externalTrip.clientName || "",
    name:externalTrip.clientName || "",
    clientPhone:externalTrip.clientPhone || "",
    phone:externalTrip.clientPhone || "",
    pickup:externalTrip.pickup || "",
    dropoff:externalTrip.dropoff || "",
    pickupOrder:0,
    dropoffOrder:0,
    routeOrder:index + 1,
    status:"Scheduled",
    priceAmount:0,
    finalPrice:0,
    cancelFee:0,
    noShowFee:0
  };
}

function applyOrders(passengers,routePlan){
  const plan = safeArray(routePlan)
    .slice()
    .sort((a,b)=>Number(a.order || 0)-Number(b.order || 0));

  function orderFor(type,address){
    const target = clean(address).toLowerCase();

    const index = plan.findIndex(point=>{
      return (
        clean(point.type).toLowerCase() === type &&
        clean(point.address).toLowerCase() === target
      );
    });

    return index < 0 ? 9999 : index + 1;
  }

  return passengers
    .map((passenger,index)=>({
      ...passenger,
      pickupOrder:orderFor("pickup",passenger.pickup),
      dropoffOrder:orderFor("dropoff",passenger.dropoff),
      routeOrder:index + 1
    }))
    .sort((a,b)=>
      Number(a.pickupOrder) - Number(b.pickupOrder) ||
      Number(a.dropoffOrder) - Number(b.dropoffOrder) ||
      Number(a.routeOrder) - Number(b.routeOrder)
    )
    .map((passenger,index)=>({
      ...passenger,
      routeOrder:index + 1
    }));
}

function sharedTripPayload(group,externalTrips,tenantId){
  let passengers = externalTrips.map(passengerPayload);

  passengers = applyOrders(
    passengers,
    group.routePlan
  );

  const first =
    passengers[0] ||
    {};

  const last =
    passengers[passengers.length - 1] ||
    {};

  const groupId =
    "BR-SH-" +
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2,7)
      .toUpperCase();

  const tripNumber =
    "BRSH-" +
    Date.now()
      .toString()
      .slice(-8);

  return {
    tenantId,
    type:"company",
    tripNumber,

    externalSource:"BROKER",
    brokerName:
      [...new Set(externalTrips.map(t=>clean(t.brokerName)).filter(Boolean))]
        .join(" / "),
    brokerCode:
      [...new Set(externalTrips.map(t=>clean(t.brokerCode)).filter(Boolean))]
        .join("-"),

    serviceKey:"SHARED",
    serviceCode:"SHARED",
    serviceType:"SHARED",
    vehicle:"SHARED",

    isShared:true,
    groupId,
    tripType:"SHARED",
    sharedSuffix:"SH",
    sharedSource:"BROKER",

    passengers,
    totalPassengers:passengers.length,
    passengerCount:passengers.length,
    passengersCount:passengers.length,

    clientName:"Shared Trip",
    clientPhone:"",

    pickup:first.pickup || "",
    dropoff:last.dropoff || "",
    stops:[],

    tripDate:group.tripDate || externalTrips[0]?.tripDate || "",
    tripTime:
      group.calculatedFirstPickupTime ||
      externalTrips[0]?.tripTime ||
      "",

    routePoints:safeArray(group.routePoints),
    sharedRoutePlan:safeArray(group.routePlan),
    routePlan:safeArray(group.routePlan),

    routeLocked:true,
    routeFinalized:true,
    routeSource:"shared-engine-broker",
    routeUpdatedAt:new Date(),

    sharedRouteMiles:Number(group.routeMiles || 0),
    sharedRouteMinutes:Number(group.routeMinutes || 0),
    miles:Number(group.routeMiles || 0),
    estimatedMinutes:Number(group.routeMinutes || 0),

    overviewPolyline:group.polyline || "",
    sharedRoutePolyline:group.polyline || "",

    dispatchSelected:true,
    disabled:false,
    status:"Scheduled"
  };
}

router.get("/bootstrap",async(req,res)=>{
  try{
    const tenantId = tenantObjectId(req);
    const today = phoenixDateKey(0);
    const tomorrow = phoenixDateKey(1);

    const [integrations,capabilities] =
      await Promise.all([
        BrokerIntegration.find({
          tenantId,
          enabled:true,
          featureVisible:{$ne:false}
        })
          .select("brokerCode brokerName enabled featureVisible")
          .sort({brokerName:1})
          .lean(),

        brokerCapabilities(tenantId)
      ]);

    if(!capabilities.brokerContractEnabled){
      return res.json({
        success:true,
        today,
        tomorrow,
        integrations:[],
        trips:[],
        confirmedCount:0,
        capabilities
      });
    }

    const trips = await ExternalTrip.find({
      tenantId,
      tripDate:{$in:[today,tomorrow]},
      status:{$nin:["CANCELLED","REJECTED","ERROR"]}
    })
      .sort({tripDate:1,tripTime:1,brokerCode:1})
      .lean();

    const ids = trips.map(t=>t._id);
    const processed = await getProcessedSet(tenantId,ids);

    const openTrips = trips.filter(
      trip=>!processed.has(String(trip._id))
    );

    const confirmedCount = await TripSplitState.countDocuments({
      tenantId,
      confirmed:true,
      confirmedAt:{
        $gte:new Date(Date.now() - (3 * 24 * 60 * 60 * 1000))
      }
    });

    return res.json({
      success:true,
      today,
      tomorrow,
      integrations,
      trips:openTrips,
      confirmedCount,
      capabilities
    });
  }catch(err){
    console.log("TRIP SPLIT BOOTSTRAP ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Failed to load Trip Split"
    });
  }
});

router.post("/share",async(req,res)=>{
  try{
    const tenantId = tenantObjectId(req);

    const tripIds = safeArray(req.body?.tripIds)
      .map(clean)
      .filter(id=>mongoose.Types.ObjectId.isValid(id));

    if(tripIds.length < 2){
      return res.status(400).json({
        success:false,
        message:"Select at least two trips"
      });
    }

    const trips = await ExternalTrip.find({
      _id:{$in:tripIds},
      tenantId,
      status:{$nin:["CANCELLED","REJECTED","ERROR"]}
    }).lean();

    const settingsDoc =
      await SharedEngineSettings
        .findOne({tenantId})
        .lean();

    const result = await planSharedTrips({
      trips,
      source:"BROKER",
      settings:mergeSettings(settingsDoc || {})
    });

    return res.json(result);
  }catch(err){
    console.log("TRIP SPLIT SHARE ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Shared Engine failed"
    });
  }
});

router.post("/confirm",async(req,res)=>{
  const session = await mongoose.startSession();

  try{
    const tenantId = tenantObjectId(req);
    const Trip = getTripModel();

    const groups = safeArray(req.body?.groups);
    const normalIds = safeArray(req.body?.tripIds)
      .map(clean)
      .filter(id=>mongoose.Types.ObjectId.isValid(id));

    if(!groups.length && !normalIds.length){
      return res.status(400).json({
        success:false,
        message:"Nothing selected to confirm"
      });
    }

    const confirmedExternalTripIds = [];
    let confirmedCount = 0;

    await session.withTransaction(async()=>{
      for(const group of groups){
        const ids = safeArray(group.tripIds)
          .map(clean)
          .filter(id=>mongoose.Types.ObjectId.isValid(id));

        if(ids.length < 2){
          throw new Error("Invalid shared group");
        }

        const externalTrips = await ExternalTrip.find({
          _id:{$in:ids},
          tenantId,
          status:{$nin:["CANCELLED","REJECTED","ERROR"]}
        })
          .session(session);

        if(externalTrips.length !== ids.length){
          throw new Error("One or more broker trips are missing");
        }

        if(externalTrips.some(trip=>safeArray(trip.stops).length > 0)){
          throw new Error("Trips with stops cannot be shared");
        }

        const existingStates = await TripSplitState.find({
          tenantId,
          externalTripObjectId:{$in:ids},
          confirmed:true
        })
          .session(session)
          .lean();

        if(existingStates.length){
          throw new Error("One or more broker trips were already confirmed");
        }

        const dispatchTrip = await Trip.create(
          [sharedTripPayload(group,externalTrips,tenantId)],
          {session}
        );

        const createdTrip = dispatchTrip[0];

        for(const externalTrip of externalTrips){
          await TripSplitState.create(
            [{
              tenantId,
              externalTripObjectId:externalTrip._id,
              externalTripId:externalTrip.externalTripId || "",
              brokerCode:externalTrip.brokerCode || "",
              brokerName:externalTrip.brokerName || "",
              source:"BROKER",
              processingMode:"SHARED",
              sharedGroupId:createdTrip.groupId || group.groupId || "",
              dispatchTripId:createdTrip._id,
              confirmed:true,
              confirmedAt:new Date(),
              confirmedBy:
                clean(
                  req.authUser?.email ||
                  req.authUser?.id ||
                  ""
                )
            }],
            {session}
          );

          confirmedExternalTripIds.push(String(externalTrip._id));
        }

        confirmedCount += 1;
      }

      for(const id of normalIds){
        const externalTrip = await ExternalTrip.findOne({
          _id:id,
          tenantId,
          status:{$nin:["CANCELLED","REJECTED","ERROR"]}
        }).session(session);

        if(!externalTrip){
          throw new Error("Broker trip not found");
        }

        const existingState = await TripSplitState.findOne({
          tenantId,
          externalTripObjectId:externalTrip._id,
          confirmed:true
        })
          .session(session)
          .lean();

        if(existingState){
          continue;
        }

        const existingTrip = await Trip.findOne({
          tenantId,
          brokerCode:externalTrip.brokerCode,
          brokerTripId:externalTrip.externalTripId
        })
          .session(session);

        let dispatchTrip = existingTrip;

        if(!dispatchTrip){
          const created = await Trip.create(
            [originalTripPayload(externalTrip)],
            {session}
          );

          dispatchTrip = created[0];
        }else{
          dispatchTrip.dispatchSelected = true;
          dispatchTrip.disabled = false;
          await dispatchTrip.save({session});
        }

        await TripSplitState.create(
          [{
            tenantId,
            externalTripObjectId:externalTrip._id,
            externalTripId:externalTrip.externalTripId || "",
            brokerCode:externalTrip.brokerCode || "",
            brokerName:externalTrip.brokerName || "",
            source:"BROKER",
            processingMode:"NORMAL",
            sharedGroupId:"",
            dispatchTripId:dispatchTrip._id,
            confirmed:true,
            confirmedAt:new Date(),
            confirmedBy:
              clean(
                req.authUser?.email ||
                req.authUser?.id ||
                ""
              )
          }],
          {session}
        );

        confirmedExternalTripIds.push(String(externalTrip._id));
        confirmedCount += 1;
      }
    });

    return res.json({
      success:true,
      confirmedCount,
      confirmedExternalTripIds
    });
  }catch(err){
    console.log("TRIP SPLIT CONFIRM ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Failed to confirm Trip Split"
    });
  }finally{
    await session.endSession();
  }
});

router.patch("/trips/:id",async(req,res)=>{
  try{
    const tenantId = tenantObjectId(req);

    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip"
      });
    }

    const alreadyConfirmed = await TripSplitState.findOne({
      tenantId,
      externalTripObjectId:req.params.id,
      confirmed:true
    }).lean();

    if(alreadyConfirmed){
      return res.status(409).json({
        success:false,
        message:"Confirmed trip cannot be edited here"
      });
    }

    const update = {};

    if(req.body.tripTime !== undefined){
      update.tripTime = clean(req.body.tripTime);
    }

    if(req.body.appointmentTime !== undefined){
      update.appointmentTime = clean(req.body.appointmentTime);
    }

    if(req.body.pickup !== undefined){
      update.pickup = clean(req.body.pickup);
    }

    if(req.body.dropoff !== undefined){
      update.dropoff = clean(req.body.dropoff);
    }

    const trip = await ExternalTrip.findOneAndUpdate(
      {
        _id:req.params.id,
        tenantId
      },
      {$set:update},
      {new:true}
    );

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Broker trip not found"
      });
    }

    return res.json({
      success:true,
      trip
    });
  }catch(err){
    return res.status(500).json({
      success:false,
      message:err.message || "Failed to edit trip"
    });
  }
});

router.delete("/trips/:id",async(req,res)=>{
  try{
    const tenantId = tenantObjectId(req);

    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip"
      });
    }

    const alreadyConfirmed = await TripSplitState.findOne({
      tenantId,
      externalTripObjectId:req.params.id,
      confirmed:true
    }).lean();

    if(alreadyConfirmed){
      return res.status(409).json({
        success:false,
        message:"Confirmed trip cannot be deleted here"
      });
    }

    const deleted = await ExternalTrip.findOneAndDelete({
      _id:req.params.id,
      tenantId
    });

    if(!deleted){
      return res.status(404).json({
        success:false,
        message:"Broker trip not found"
      });
    }

    return res.json({
      success:true
    });
  }catch(err){
    return res.status(500).json({
      success:false,
      message:err.message || "Failed to delete trip"
    });
  }
});

module.exports = router;
