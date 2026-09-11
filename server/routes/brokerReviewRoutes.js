"use strict";

/*
DESTINATION PATH:
server/routes/brokerReviewRoutes.js

PURPOSE:
Broker Review / Broker Schedule API.

FLOW:
- Shows Trip Split confirmed broker trips for Today and Tomorrow.
- Select All / Unselect All is handled by the frontend.
- Confirm Selected freezes Broker Pricing when available, then releases selected trips to Dispatch.
- Broker Pricing errors never block Dispatch.
- Trips stay visible here after release and continue showing live Trip status.
- Edit is allowed until the trip begins execution.
- Delete requires an explicit warning and is blocked after execution begins.

MOUNT:
app.use("/api/broker-review", brokerReviewRoutes);
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const TripSplitState =
  require("../models/TripSplitState");

const ExternalTrip =
  require("../models/ExternalTrip");

const {
  ensureTripLikeCoordinates,
  ensureExternalTripCoordinates
} = require("../services/externalTripGeoService");

const SharedTripGroup =
  require("../models/SharedTripGroup");

const DispatchAssignment =
  require("../models/DispatchAssignment");

const {
  calculateBrokerPrice,
  resolveBrokerPricing
} = require("../services/brokerPricingEngine");

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
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeServiceKey(value){
  const raw =
    upper(value)
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!raw){
    return "STANDARD";
  }

  if(
    raw === "ST" ||
    raw === "STD" ||
    raw.includes("STANDARD")
  ){
    return "STANDARD";
  }

  if(
    raw === "SH" ||
    raw.includes("SHARED")
  ){
    return "SHARED";
  }

  if(
    raw === "WC" ||
    raw === "WH" ||
    raw.includes("WHEELCHAIR") ||
    raw.includes("WHEEL CHAIR")
  ){
    return "WHEELCHAIR";
  }

  if(
    raw === "TX" ||
    raw.includes("TAXI")
  ){
    return "TAXI";
  }

  if(
    raw === "LM" ||
    raw.includes("LIMO")
  ){
    return "LIMO";
  }

  if(raw === "XL"){
    return "XL";
  }

  return raw.replace(/\s+/g,"_");
}

function serviceSuffix(value){
  const key =
    normalizeServiceKey(value);

  if(key === "STANDARD") return "ST";
  if(key === "SHARED") return "SH";
  if(key === "WHEELCHAIR") return "WH";
  if(key === "TAXI") return "TX";
  if(key === "LIMO") return "LM";
  if(key === "XL") return "XL";

  const compact =
    key.replace(/[^A-Z0-9]/g,"");

  return (
    compact.slice(0,2) ||
    "ST"
  ).padEnd(2,"X");
}

function neutralTripNumber(value,serviceValue=""){
  const raw =
    clean(value)
      .toUpperCase();

  if(!raw){
    return "";
  }

  const returnTrip =
    raw.endsWith("-R");

  const body =
    returnTrip
      ? raw.slice(0,-2)
      : raw;

  const expectedSuffix =
    serviceSuffix(
      serviceValue
    );

  const known =
    new Set([
      "ST","SH","WH","WC","TX","LM","XL",
      expectedSuffix
    ]);

  const parts =
    body.split("-");

  if(
    parts.length > 1 &&
    known.has(
      upper(
        parts[parts.length - 1]
      )
    )
  ){
    parts.pop();
  }

  const base =
    parts.join("-");

  return returnTrip
    ? `${base}-R`
    : base;
}

function finalTripNumber(
  baseValue,
  serviceValue
){
  const suffix =
    serviceSuffix(
      serviceValue
    );

  const neutral =
    neutralTripNumber(
      baseValue,
      serviceValue
    );

  if(!neutral){
    return "";
  }

  if(neutral.endsWith("-R")){
    return (
      neutral.slice(0,-2) +
      `-${suffix}-R`
    );
  }

  return `${neutral}-${suffix}`;
}

function bearerToken(req){
  const auth =
    clean(
      req.headers.authorization
    );

  if(
    !auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

function requireStaff(req,res,next){

  const token =
    bearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const role =
      upper(decoded.role);

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "DISPATCHER"
      ].includes(role)
    ){
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

    req.authUser =
      decoded;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  requireStaff
);

function tenantObjectId(req){

  const value =
    clean(
      req.authUser?.tenantId
    );

  if(
    !mongoose.Types.ObjectId
      .isValid(value)
  ){
    throw new Error(
      "Invalid tenant"
    );
  }

  return new mongoose.Types.ObjectId(
    value
  );
}

function getTripModel(){

  const Trip =
    global.Trip ||
    mongoose.models.Trip ||
    null;

  if(!Trip){
    throw new Error(
      "Trip model not loaded"
    );
  }

  return Trip;
}

function phoenixDateKey(
  offsetDays = 0
){

  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Phoenix",
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    ).formatToParts(now);

  const map = {};

  for(const part of parts){
    map[part.type] =
      part.value;
  }

  const base =
    new Date(
      Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day)
      )
    );

  base.setUTCDate(
    base.getUTCDate() +
    offsetDays
  );

  return [
    base.getUTCFullYear(),
    String(
      base.getUTCMonth() + 1
    ).padStart(2,"0"),
    String(
      base.getUTCDate()
    ).padStart(2,"0")
  ].join("-");
}

function executionLocked(
  trip
){

  const status =
    upper(
      trip?.status ||
      trip?.dispatchStatus ||
      ""
    );

  return [
    "ON_TRIP",
    "ON TRIP",
    "IN_PROGRESS",
    "IN PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "CANCELED",
    "NO_SHOW",
    "NO SHOW",
    "NOT_COMPLETED",
    "NOT COMPLETED"
  ].includes(status);
}


function tripScheduledTimePassed(trip){

  const date =
    clean(trip?.tripDate);

  const rawTime =
    clean(trip?.tripTime);

  if(!date || !rawTime){
    return false;
  }

  const time =
    rawTime
      .replace(/\s+/g," ")
      .trim();

  let hours = null;
  let minutes = null;

  const twelve =
    time.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    );

  if(twelve){
    hours = Number(twelve[1]);
    minutes = Number(twelve[2]);

    if(hours === 12){
      hours = 0;
    }

    if(
      twelve[3]
        .toUpperCase() === "PM"
    ){
      hours += 12;
    }
  }else{
    const twentyFour =
      time.match(
        /^(\d{1,2}):(\d{2})/
      );

    if(twentyFour){
      hours = Number(twentyFour[1]);
      minutes = Number(twentyFour[2]);
    }
  }

  if(
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ){
    return false;
  }

  /*
    Arizona/Phoenix does not observe daylight saving time.
    Broker operations in this tenant use Arizona time.
  */
  const scheduled =
    new Date(
      `${date}T` +
      `${String(hours).padStart(2,"0")}:` +
      `${String(minutes).padStart(2,"0")}:00-07:00`
    );

  if(
    Number.isNaN(
      scheduled.getTime()
    )
  ){
    return false;
  }

  return Date.now() >= scheduled.getTime();
}

function toId(value){
  return String(
    value?._id ||
    value?.id ||
    value ||
    ""
  );
}

function serializeExternal(
  external
){
  if(!external){
    return null;
  }

  return {
    _id:toId(external),
    ghExternalTripNumber:
      external.ghExternalTripNumber ||
      external.externalTripNumber ||
      "",
    externalTripId:
      external.externalTripId ||
      "",
    brokerCode:
      external.brokerCode ||
      "",
    brokerName:
      external.brokerName ||
      "",
    tripDate:
      external.tripDate ||
      "",
    tripTime:
      external.tripTime ||
      "",
    appointmentTime:
      external.appointmentTime ||
      "",
    returnTime:
      external.returnTime ||
      "",
    clientName:
      external.clientName ||
      "",
    clientPhone:
      external.clientPhone ||
      "",
    clientEmail:
      external.clientEmail ||
      "",
    memberId:
      external.memberId ||
      "",
    pickup:
      external.pickup ||
      "",
    pickupLat:
      Number.isFinite(Number(external.pickupLat))
        ? Number(external.pickupLat)
        : null,
    pickupLng:
      Number.isFinite(Number(external.pickupLng))
        ? Number(external.pickupLng)
        : null,
    stops:
      safeArray(
        external.stops
      ),
    dropoff:
      external.dropoff ||
      "",
    dropoffLat:
      Number.isFinite(Number(external.dropoffLat))
        ? Number(external.dropoffLat)
        : null,
    dropoffLng:
      Number.isFinite(Number(external.dropoffLng))
        ? Number(external.dropoffLng)
        : null,
    serviceKey:
      external.serviceKey ||
      "",
    serviceName:
      external.serviceName ||
      "",
    notes:
      external.notes ||
      ""
  };
}

function serializeTrip(
  trip
){
  if(!trip){
    return null;
  }

  return {
    _id:toId(trip),
    tripNumber:
      trip.tripNumber ||
      "",
    tripDate:
      trip.tripDate ||
      "",
    tripTime:
      trip.tripTime ||
      "",
    appointmentTime:
      trip.appointmentTime ||
      "",
    pickup:
      trip.pickup ||
      "",
    pickupLat:
      Number.isFinite(Number(trip.pickupLat))
        ? Number(trip.pickupLat)
        : null,
    pickupLng:
      Number.isFinite(Number(trip.pickupLng))
        ? Number(trip.pickupLng)
        : null,
    dropoff:
      trip.dropoff ||
      "",
    dropoffLat:
      Number.isFinite(Number(trip.dropoffLat))
        ? Number(trip.dropoffLat)
        : null,
    dropoffLng:
      Number.isFinite(Number(trip.dropoffLng))
        ? Number(trip.dropoffLng)
        : null,
    stops:
      safeArray(
        trip.stops
      ),
    stopCoords:
      safeArray(
        trip.stopCoords
      ),
    clientName:
      trip.clientName ||
      "",
    clientPhone:
      trip.clientPhone ||
      "",
    notes:
      trip.notes ||
      "",
    brokerName:
      trip.brokerName ||
      "",
    brokerCode:
      trip.brokerCode ||
      "",
    brokerTripId:
      trip.brokerTripId ||
      "",
    serviceKey:
      trip.serviceKey ||
      "",
    serviceType:
      trip.serviceType ||
      "",
    isShared:
      trip.isShared === true,
    groupId:
      trip.groupId ||
      "",
    passengers:
      safeArray(
        trip.passengers
      ),
    driverId:
      trip.driverId ||
      "",
    driverName:
      trip.driverName ||
      "",
    vehicleNumber:
      trip.vehicleNumber ||
      trip.vehicle ||
      "",
    dispatchStatus:
      trip.dispatchStatus ||
      "",
    status:
      trip.status ||
      "",
    dispatchSelected:
      trip.dispatchSelected === true,
    disabled:
      trip.disabled === true
  };
}

async function buildItems(
  tenantId,
  dateKeys
){

  const Trip =
    getTripModel();

  const externalTrips =
    await ExternalTrip.find({
      tenantId,
      tripDate:{
        $in:dateKeys
      }
    })
      .sort({
        tripDate:1,
        tripTime:1
      })
      .lean();

  if(!externalTrips.length){
    return [];
  }

  const externalIds =
    externalTrips.map(
      trip=>trip._id
    );

  const states =
    await TripSplitState.find({
      tenantId,
      externalTripObjectId:{
        $in:externalIds
      },
      confirmed:true
    })
      .sort({
        confirmedAt:1
      })
      .lean();

  if(!states.length){
    return [];
  }

  const tripIds =
    [...new Set(
      states
        .map(
          row=>
            clean(
              row.dispatchTripId
            )
        )
        .filter(Boolean)
    )];

  const dispatchTrips =
    tripIds.length
      ? await Trip.find({
          _id:{
            $in:tripIds
          },
          tenantId
        }).lean()
      : [];

  const tripMap =
    new Map(
      dispatchTrips.map(
        trip=>[
          toId(trip),
          trip
        ]
      )
    );

  const externalMap =
    new Map(
      externalTrips.map(
        trip=>[
          toId(trip),
          trip
        ]
      )
    );

  /*
    Backfill broker identity on Trip records created before the Trip schema
    carried broker fields. This keeps old Broker Review rows out of the
    normal Trips Hub / Trips pages as soon as Broker Review is loaded.
  */
  for(const state of states){

    const dispatchId =
      clean(
        state.dispatchTripId
      );

    const trip =
      tripMap.get(
        dispatchId
      );

    const external =
      externalMap.get(
        toId(
          state.externalTripObjectId
        )
      );

    if(!trip || !external){
      continue;
    }

    const brokerName =
      clean(
        external.brokerName ||
        state.brokerName ||
        ""
      );

    const brokerCode =
      clean(
        external.brokerCode ||
        state.brokerCode ||
        ""
      );

    const brokerId =
      clean(
        external.brokerId ||
        ""
      );

    const brokerTripId =
      clean(
        external.externalTripId ||
        ""
      );

    const needsBackfill =
      clean(trip.brokerName) !== brokerName ||
      clean(trip.brokerCode) !== brokerCode ||
      clean(trip.brokerId) !== brokerId ||
      clean(trip.brokerTripId) !== brokerTripId ||
      clean(trip.externalSource) !== "BROKER";

    if(needsBackfill){
      await Trip.updateOne(
        {
          _id:trip._id,
          tenantId
        },
        {
          $set:{
            brokerId,
            brokerName,
            brokerCode,
            brokerTripId,
            externalSource:"BROKER"
          }
        }
      );

      trip.brokerId = brokerId;
      trip.brokerName = brokerName;
      trip.brokerCode = brokerCode;
      trip.brokerTripId = brokerTripId;
      trip.externalSource = "BROKER";
    }
  }

  /*
    BROKER REVIEW STATE CONSISTENCY

    TripSplitState.reviewConfirmed is the single source of truth.

    - reviewConfirmed:false => waiting in Broker Review
      => Trip MUST stay out of Dispatch.
    - reviewConfirmed:true  => released from Broker Review
      => Trip may stay available in Dispatch.

    This repairs legacy rows created by older Trip Split versions that
    accidentally left dispatchSelected=true / disabled=false before
    Broker Review Confirm Selected was pressed.
  */
  const stateRowsByDispatchId =
    new Map();

  for(const state of states){
    const dispatchId =
      clean(state.dispatchTripId);

    if(!dispatchId){
      continue;
    }

    if(!stateRowsByDispatchId.has(dispatchId)){
      stateRowsByDispatchId.set(dispatchId,[]);
    }

    stateRowsByDispatchId.get(dispatchId).push(state);
  }

  for(const [dispatchId,rows] of stateRowsByDispatchId.entries()){

    const trip =
      tripMap.get(dispatchId);

    if(!trip){
      continue;
    }

    /*
      A shared Broker Review item remains waiting if ANY source row
      is still waiting review.
    */
    const reviewConfirmed =
      rows.length > 0 &&
      rows.every(
        row=>
          row.reviewConfirmed === true
      );

    if(!reviewConfirmed){

      const needsRepair =
        trip.dispatchSelected === true ||
        trip.disabled !== true;

      if(needsRepair){
        await Trip.updateOne(
          {
            _id:trip._id,
            tenantId
          },
          {
            $set:{
              dispatchSelected:false,
              disabled:true
            }
          }
        );

        trip.dispatchSelected = false;
        trip.disabled = true;
      }
    }
  }

  /*
    Shared groups have multiple TripSplitState rows pointing to one
    dispatchTripId. Aggregate them into one review card/row.
  */
  const itemMap =
    new Map();

  for(const state of states){

    const dispatchId =
      clean(
        state.dispatchTripId
      );

    if(!dispatchId){
      continue;
    }

    let item =
      itemMap.get(
        dispatchId
      );

    if(!item){
      const trip =
        tripMap.get(
          dispatchId
        ) ||
        null;

      item = {
        id:dispatchId,
        dispatchTripId:
          dispatchId,
        processingMode:
          state.processingMode ||
          "NORMAL",
        sharedGroupId:
          state.sharedGroupId ||
          trip?.groupId ||
          "",
        reviewConfirmed:
          state.reviewConfirmed === true,
        reviewConfirmedAt:
          state.reviewConfirmedAt ||
          null,
        confirmedAt:
          state.confirmedAt ||
          null,
        trip:
          serializeTrip(
            trip
          ),
        externalTrips:[]
      };

      itemMap.set(
        dispatchId,
        item
      );
    }

    const external =
      externalMap.get(
        toId(
          state.externalTripObjectId
        )
      );

    if(external){
      item.externalTrips.push(
        serializeExternal(
          external
        )
      );
    }

    /*
      All rows in one shared group should be confirmed together.
      If any row is still waiting, the item remains Waiting Review.
    */
    if(
      state.reviewConfirmed !== true
    ){
      item.reviewConfirmed =
        false;

      item.reviewConfirmedAt =
        null;
    }
  }

  const items =
    [...itemMap.values()];

  items.sort((a,b)=>{
    const ad =
      a.trip?.tripDate ||
      a.externalTrips[0]
        ?.tripDate ||
      "";

    const bd =
      b.trip?.tripDate ||
      b.externalTrips[0]
        ?.tripDate ||
      "";

    if(ad !== bd){
      return ad.localeCompare(bd);
    }

    const at =
      a.trip?.tripTime ||
      a.externalTrips[0]
        ?.tripTime ||
      "";

    const bt =
      b.trip?.tripTime ||
      b.externalTrips[0]
        ?.tripTime ||
      "";

    return at.localeCompare(bt);
  });

  return items;
}

/* =========================
   BOOTSTRAP
========================= */

router.get(
  "/bootstrap",
  async (req,res)=>{

    try{

      const tenantId =
        tenantObjectId(req);

      const today =
        phoenixDateKey(0);

      const tomorrow =
        phoenixDateKey(1);

      const items =
        await buildItems(
          tenantId,
          [
            today,
            tomorrow
          ]
        );

      return res.json({
        success:true,
        today,
        tomorrow,
        items
      });

    }catch(err){

      console.log(
        "BROKER REVIEW BOOTSTRAP ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load Broker Review"
      });
    }
  }
);

/* =========================
   RETURN SELECTED TO TRIP SPLIT
========================= */

router.post(
  "/return-to-trip-split",
  async (req,res)=>{

    const session =
      await mongoose.startSession();

    try{

      const tenantId =
        tenantObjectId(req);

      const Trip =
        getTripModel();

      const ids =
        [...new Set(
          safeArray(
            req.body?.dispatchTripIds
          )
            .map(clean)
            .filter(
              id=>
                mongoose.Types.ObjectId
                  .isValid(id)
            )
        )];

      if(!ids.length){
        return res.status(400).json({
          success:false,
          message:"Select at least one trip"
        });
      }

      let returnedCount = 0;

      await session.withTransaction(
        async()=>{

          const trips =
            await Trip.find({
              _id:{$in:ids},
              tenantId
            })
              .session(session);

          if(
            trips.length !==
            ids.length
          ){
            throw new Error(
              "One or more Broker Review trips were not found"
            );
          }

          for(const trip of trips){

            if(
              executionLocked(
                trip
              )
            ){
              throw new Error(
                "A trip that has started or closed cannot be returned to Trip Split"
              );
            }

            const states =
              await TripSplitState.find({
                tenantId,
                dispatchTripId:
                  trip._id,
                confirmed:true
              })
                .session(session);

            if(!states.length){
              throw new Error(
                "Trip Split source state was not found"
              );
            }

            /*
              RETURN SAFETY:
              Broker Review Confirm alone must NOT make a Scheduled trip
              impossible to return. The user may have confirmed it by mistake.

              Block only after the trip has actually been sent to a driver,
              accepted, started, or closed. An unsent assignment is reversible.
            */
            const assignment =
              await DispatchAssignment.findOne({
                tenantId,
                tripId:trip._id
              })
                .session(session);

            const dispatchStatus =
              upper(
                assignment?.dispatchStatus ||
                ""
              )
              .replace(/[\s-]+/g,"_");

            if(
              [
                "SENT",
                "ACCEPTED",
                "ON_TRIP",
                "IN_PROGRESS",
                "COMPLETED",
                "CANCELLED",
                "CANCELED",
                "NO_SHOW",
                "NOT_COMPLETED"
              ].includes(
                dispatchStatus
              )
            ){
              throw new Error(
                "A trip already sent to the driver or already started/closed cannot be returned to Trip Split"
              );
            }

            /*
              Auto/manual assignment that has NOT been sent is safe to remove.
            */
            if(assignment){
              await DispatchAssignment.deleteOne(
                {
                  _id:assignment._id,
                  tenantId
                },
                {
                  session
                }
              );
            }

            const isShared =
              states.some(
                row=>
                  upper(
                    row.processingMode
                  ) ===
                  "SHARED"
              );

            if(isShared){

              const groupId =
                clean(
                  states.find(
                    row=>
                      clean(
                        row.sharedGroupId
                      )
                  )
                    ?.sharedGroupId
                ) ||
                clean(
                  trip.groupId
                );

              if(!groupId){
                throw new Error(
                  "Shared group link was not found"
                );
              }

              const reopened =
                await SharedTripGroup.findOneAndUpdate(
                  {
                    tenantId,
                    sourceType:"BROKER",
                    $or:[
                      {
                        groupId
                      },
                      {
                        dispatchTripId:
                          trip._id
                      }
                    ]
                  },
                  {
                    $set:{
                      status:"OPEN",
                      confirmedAt:null,
                      confirmedBy:"",
                      dispatchTripId:null
                    }
                  },
                  {
                    new:true,
                    session
                  }
                );

              if(!reopened){
                throw new Error(
                  "Shared group could not be reopened in Trip Split"
                );
              }

              await TripSplitState.updateMany(
                {
                  tenantId,
                  dispatchTripId:
                    trip._id
                },
                {
                  $set:{
                    confirmed:false,
                    confirmedAt:null,
                    confirmedBy:"",
                    reviewConfirmed:false,
                    reviewConfirmedAt:null,
                    reviewConfirmedBy:"",
                    dispatchTripId:null
                  }
                },
                {
                  session
                }
              );

            }else{

              /*
                Individual trip:
                keep NORMAL state, but mark it unconfirmed so Trip Split
                places it back in Individual Trips.
              */
              await TripSplitState.updateMany(
                {
                  tenantId,
                  dispatchTripId:
                    trip._id
                },
                {
                  $set:{
                    processingMode:"NORMAL",
                    sharedGroupId:"",
                    confirmed:false,
                    confirmedAt:null,
                    confirmedBy:"",
                    reviewConfirmed:false,
                    reviewConfirmedAt:null,
                    reviewConfirmedBy:"",
                    dispatchTripId:null
                  }
                },
                {
                  session
                }
              );
            }

            /*
              Close the Dispatch gate first. This also covers trips that had
              already been Confirmed in Broker Review but were never sent.
            */
            trip.dispatchSelected = false;
            trip.disabled = true;

            await trip.save({
              session
            });

            /*
              The Trip document exists only for Broker Review / Dispatch.
              Once returned, Trip Split owns the source again.
            */
            await Trip.deleteOne(
              {
                _id:trip._id,
                tenantId
              },
              {
                session
              }
            );

            returnedCount += 1;
          }
        }
      );

      return res.json({
        success:true,
        returnedCount,
        message:
          `${returnedCount} trip(s) returned to Trip Split.`
      });

    }catch(err){

      console.log(
        "BROKER REVIEW RETURN TO TRIP SPLIT ERROR:",
        err
      );

      return res.status(
        Number(
          err?.statusCode
        ) || 500
      ).json({
        success:false,
        message:
          err.message ||
          "Failed to return selected trips to Trip Split"
      });

    }finally{

      await session.endSession();
    }
  }
);


/* =========================
   BROKER PRICING SNAPSHOT
   Price is locked when Broker Review confirms the trip.
========================= */

function brokerPricingMiles(trip){
  const direct =
    Number(
      trip?.miles ??
      trip?.distanceMiles ??
      trip?.totalMiles ??
      0
    );

  if(Number.isFinite(direct) && direct > 0){
    return direct;
  }

  const meters =
    Number(
      trip?.distanceMeters ??
      trip?.googleRoute?.distanceMeters ??
      trip?.optimizedRoute?.distanceMeters ??
      0
    );

  if(Number.isFinite(meters) && meters > 0){
    return meters / 1609.344;
  }

  return 0;
}

function brokerPricingMinutes(trip){
  const direct =
    Number(
      trip?.estimatedMinutes ??
      trip?.minutes ??
      trip?.totalMinutes ??
      0
    );

  if(Number.isFinite(direct) && direct > 0){
    return direct;
  }

  const seconds =
    Number(
      trip?.durationSeconds ??
      trip?.googleRoute?.durationSeconds ??
      trip?.optimizedRoute?.durationSeconds ??
      0
    );

  if(Number.isFinite(seconds) && seconds > 0){
    return seconds / 60;
  }

  return 0;
}

function brokerStopsCount(trip){
  return Array.isArray(trip?.stops)
    ? trip.stops.filter(Boolean).length
    : 0;
}

function brokerPassengerCount(trip,externalTrips,shared){
  if(shared){
    const fromPassengers =
      Array.isArray(trip?.passengers)
        ? trip.passengers.length
        : 0;

    if(fromPassengers > 0){
      return fromPassengers;
    }

    if(Array.isArray(externalTrips) && externalTrips.length){
      return externalTrips.length;
    }
  }

  return 1;
}

async function priceBrokerTripAtReviewConfirm({
  tenantId,
  trip,
  sourceExternalTrips,
  finalService,
  shared
}){

  const primaryExternal =
    sourceExternalTrips?.[0] ||
    {};

  const miles =
    brokerPricingMiles(trip);

  const minutes =
    brokerPricingMinutes(trip);

  const stops =
    brokerStopsCount(trip);

  const passengersCount =
    brokerPassengerCount(
      trip,
      sourceExternalTrips,
      shared
    );

  const identity = {
    tenantId,
    brokerId:
      primaryExternal.brokerId ||
      trip.brokerId ||
      "",
    brokerCode:
      primaryExternal.brokerCode ||
      trip.brokerCode ||
      "",
    brokerName:
      primaryExternal.brokerName ||
      trip.brokerName ||
      "",
    serviceKey:
      finalService,
    miles,
    minutes,
    stops,
    passengersCount
  };

  const result =
    await calculateBrokerPrice(
      identity
    );

  const resolved =
    await resolveBrokerPricing(
      identity
    );

  const service =
    resolved?.service ||
    {};

  trip.priceAmount =
    Number(result.total || 0);

  trip.finalPrice =
    Number(result.total || 0);

  trip.pricePerPassenger =
    Number(
      result.pricePerPassenger ||
      (
        passengersCount > 0
          ? Number(result.total || 0) /
            passengersCount
          : Number(result.total || 0)
      )
    );

  trip.cancelFee =
    Number(
      service.cancelFee || 0
    );

  trip.noShowFee =
    Number(
      service.noShowFee || 0
    );

  /*
    Shared summary works passenger-by-passenger.
    Freeze each passenger's confirmed broker price and fees now.
  */
  if(
    shared &&
    Array.isArray(trip.passengers)
  ){

    trip.passengers.forEach(
      passenger=>{

        passenger.priceAmount =
          Number(
            result.pricePerPassenger ||
            0
          );

        passenger.finalPrice =
          Number(
            result.pricePerPassenger ||
            0
          );

        passenger.cancelFee =
          Number(
            service.cancelFee || 0
          );

        passenger.noShowFee =
          Number(
            service.noShowFee || 0
          );
      }
    );
  }

  return {
    result,
    service,
    miles,
    minutes,
    stops,
    passengersCount
  };
}


/* =========================
   CONFIRM SELECTED TO DISPATCH
========================= */

router.post(
  "/confirm-selected",
  async (req,res)=>{

    const session =
      await mongoose.startSession();

    try{

      const tenantId =
        tenantObjectId(req);

      const Trip =
        getTripModel();

      const ids =
        [...new Set(
          safeArray(
            req.body?.dispatchTripIds
          )
            .map(clean)
            .filter(
              id=>
                mongoose.Types.ObjectId
                  .isValid(id)
            )
        )];

      if(!ids.length){
        return res.status(400).json({
          success:false,
          message:"Select at least one trip"
        });
      }

      let confirmedCount = 0;

      await session.withTransaction(
        async()=>{

          const trips =
            await Trip.find({
              _id:{
                $in:ids
              },
              tenantId
            })
              .session(session);

          if(
            trips.length !==
            ids.length
          ){
            throw new Error(
              "One or more broker review trips were not found"
            );
          }

          for(const trip of trips){

            if(
              executionLocked(
                trip
              )
            ){
              continue;
            }

            const sourceStates =
              await TripSplitState.find({
                tenantId,
                dispatchTripId:
                  trip._id,
                confirmed:true
              })
                .session(session)
                .lean();

            if(!sourceStates.length){
              throw new Error(
                "Trip Split source state was not found"
              );
            }

            const sourceExternalIds =
              sourceStates
                .map(row=>
                  row.externalTripObjectId
                )
                .filter(Boolean);

            const sourceExternalTrips =
              sourceExternalIds.length
                ? await ExternalTrip.find({
                    tenantId,
                    _id:{
                      $in:sourceExternalIds
                    }
                  })
                    .sort({
                      tripDate:1,
                      tripTime:1,
                      createdAt:1
                    })
                    .session(session)
                : [];

            if(!sourceExternalTrips.length){
              throw new Error(
                "Broker source trip was not found"
              );
            }

            const shared =
              sourceStates.some(
                row=>
                  upper(
                    row.processingMode
                  ) ===
                  "SHARED"
              );

            const primaryExternal =
              sourceExternalTrips[0];

            /*
              Persist broker identity on the Trip itself.
              Trips Hub / Trips use these fields to keep the broker
              workflow isolated. Dispatch is allowed to receive the Trip
              only after this Broker Review confirmation.
            */
            trip.brokerId =
              clean(
                primaryExternal.brokerId ||
                ""
              );

            trip.brokerName =
              clean(
                primaryExternal.brokerName ||
                sourceStates[0]?.brokerName ||
                ""
              );

            trip.brokerCode =
              clean(
                primaryExternal.brokerCode ||
                sourceStates[0]?.brokerCode ||
                ""
              );

            trip.brokerTripId =
              clean(
                primaryExternal.externalTripId ||
                trip.brokerTripId ||
                ""
              );

            trip.externalSource =
              "BROKER";

            const finalService =
              shared
                ? "SHARED"
                : normalizeServiceKey(
                    primaryExternal.serviceKey ||
                    primaryExternal.serviceName ||
                    trip.serviceKey ||
                    trip.serviceType ||
                    "STANDARD"
                  );

            const baseNumber =
              neutralTripNumber(
                primaryExternal.ghExternalTripNumber ||
                primaryExternal.externalTripNumber ||
                primaryExternal.externalTripId ||
                trip.tripNumber,
                primaryExternal.serviceKey ||
                primaryExternal.serviceName ||
                finalService
              );

            const finalizedNumber =
              finalTripNumber(
                baseNumber,
                finalService
              );

            if(!finalizedNumber){
              throw new Error(
                "Unable to finalize trip number"
              );
            }

            const duplicateFinalNumber =
              await Trip.findOne({
                tenantId,
                tripNumber:
                  finalizedNumber,
                _id:{
                  $ne:trip._id
                }
              })
                .session(session)
                .lean();

            if(duplicateFinalNumber){
              throw new Error(
                `Trip number ${finalizedNumber} already exists`
              );
            }

            trip.tripNumber =
              finalizedNumber;

            trip.serviceKey =
              finalService;

            trip.serviceCode =
              finalService;

            trip.serviceType =
              finalService;

            trip.isShared =
              shared;

            trip.tripType =
              shared
                ? "SHARED"
                : "INDIVIDUAL";

            trip.sharedSuffix =
              shared
                ? "SH"
                : "";

            /*
              FINAL COORDINATE GATE
              Dispatch/Driver must never receive a broker trip without
              pickup/dropoff/stop/passenger coordinates.
            */
            await ensureTripLikeCoordinates(
              trip,
              {
                save:false,
                forcePassengers:
                  trip.isShared === true
              }
            );

            /*
              BROKER PRICE LOCK + DISPATCH RELEASE

              Pricing belongs to the broker financial flow only.
              It must NEVER block the operational Dispatch flow.

              If Broker Pricing is configured correctly:
              - full trip price is frozen on the Trip
              - cancelFee / noShowFee are frozen on the Trip
              - Shared passenger pricing is frozen too

              If pricing has a configuration problem:
              - log the pricing error
              - STILL release the trip to Dispatch
              - do not replace broker pricing with Facility or Service
                Management pricing
            */
            try{

              await priceBrokerTripAtReviewConfirm({
                tenantId,
                trip,
                sourceExternalTrips,
                finalService,
                shared
              });

            }catch(pricingErr){

              console.log(
                "BROKER PRICING CONFIRM ERROR:",
                trip.tripNumber,
                pricingErr?.message ||
                pricingErr
              );

              /*
                IMPORTANT:
                Dispatch is operational and independent from Broker Pricing.
                Never throw pricingErr here.
              */
            }

            trip.dispatchSelected =
              true;

            trip.disabled =
              false;

            if(
              !clean(
                trip.status
              )
            ){
              trip.status =
                "Scheduled";
            }

            await trip.save({
              session
            });

            await TripSplitState.updateMany(
              {
                tenantId,
                dispatchTripId:
                  trip._id,
                confirmed:true
              },
              {
                $set:{
                  reviewConfirmed:true,
                  reviewConfirmedAt:
                    new Date(),
                  reviewConfirmedBy:
                    clean(
                      req.authUser?.email ||
                      req.authUser?.id ||
                      ""
                    )
                }
              },
              {
                session
              }
            );

            confirmedCount += 1;
          }
        }
      );

      /*
        FINAL DISPATCH RELEASE SAFETY

        Broker Review confirmation must always leave the selected Trip rows
        visible to /api/dispatch. The Dispatch API reads only:
          dispatchSelected:true
          disabled:false

        Re-assert those two operational flags after the transaction commits.
        This is intentionally independent from Broker Pricing.
      */
      const releaseResult =
        await Trip.updateMany(
          {
            _id:{ $in:ids },
            tenantId
          },
          {
            $set:{
              dispatchSelected:true,
              disabled:false
            }
          }
        );

      const releasedTrips =
        await Trip.find({
          _id:{ $in:ids },
          tenantId,
          dispatchSelected:true,
          disabled:false
        })
          .select(
            "_id tripNumber tripDate tripTime dispatchSelected disabled brokerCode brokerName"
          )
          .lean();

      return res.json({
        success:true,
        confirmedCount,
        dispatchReleasedCount:
          releasedTrips.length,
        dispatchMatchedCount:
          releaseResult.matchedCount ?? 0,
        dispatchModifiedCount:
          releaseResult.modifiedCount ?? 0,
        releasedTrips,
        message:
          `${releasedTrips.length} trip(s) released to Dispatch.`
      });

    }catch(err){

      console.log(
        "BROKER REVIEW CONFIRM ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to confirm selected trips"
      });

    }finally{

      await session.endSession();
    }
  }
);

/* =========================
   EDIT REVIEW TRIP
========================= */

router.patch(
  "/trips/:id",
  async (req,res)=>{

    try{

      const tenantId =
        tenantObjectId(req);

      if(
        !mongoose.Types.ObjectId
          .isValid(req.params.id)
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid trip"
        });
      }

      const Trip =
        getTripModel();

      const trip =
        await Trip.findOne({
          _id:req.params.id,
          tenantId
        });

      if(!trip){
        return res.status(404).json({
          success:false,
          message:"Broker review trip not found"
        });
      }

      if(
        executionLocked(
          trip
        )
      ){
        return res.status(409).json({
          success:false,
          message:
            "A trip that has started or closed cannot be edited here"
        });
      }

      const isShared =
        trip.isShared === true;

      const oldPickup =
        clean(trip.pickup);

      const oldDropoff =
        clean(trip.dropoff);

      const oldStops =
        JSON.stringify(
          safeArray(trip.stops)
            .map(stop=>
              clean(
                stop?.address ||
                stop
              )
            )
        );

      if(
        req.body.tripDate !== undefined
      ){
        trip.tripDate =
          clean(
            req.body.tripDate
          );
      }

      if(
        req.body.tripTime !== undefined
      ){
        trip.tripTime =
          clean(
            req.body.tripTime
          );
      }

      if(
        req.body.notes !== undefined
      ){
        trip.notes =
          clean(
            req.body.notes
          );
      }

      /*
        Shared route addresses are locked because changing one group-level
        address would invalidate the passenger route plan. Individual broker
        trips can still edit pickup/drop-off here.
      */
      if(!isShared){

        if(
          req.body.pickup !== undefined
        ){
          trip.pickup =
            clean(
              req.body.pickup
            );
        }

        if(
          req.body.dropoff !== undefined
        ){
          trip.dropoff =
            clean(
              req.body.dropoff
            );
        }
      }

      if(
        !isShared &&
        req.body.stops !== undefined
      ){
        trip.stops =
          safeArray(req.body.stops)
            .map(stop=>
              clean(
                typeof stop === "string"
                  ? stop
                  : stop?.address
              )
            )
            .filter(Boolean);
      }

      const newStops =
        JSON.stringify(
          safeArray(trip.stops)
            .map(stop=>
              clean(
                stop?.address ||
                stop
              )
            )
        );

      /*
        Broker Review Edit must leave a ready-to-drive Trip.
        Individual address edits receive fresh coordinates immediately.
        Shared trips keep their locked route, but missing passenger/route
        coordinates are repaired before Dispatch.
      */
      await ensureTripLikeCoordinates(
        trip,
        {
          save:false,
          forcePickup:
            !isShared &&
            oldPickup !== clean(trip.pickup),
          forceDropoff:
            !isShared &&
            oldDropoff !== clean(trip.dropoff),
          forceStops:
            !isShared &&
            oldStops !== newStops,
          forcePassengers:
            isShared
        }
      );

      await trip.save();

      const states =
        await TripSplitState.find({
          tenantId,
          dispatchTripId:
            trip._id,
          confirmed:true
        });

      if(
        !isShared &&
        states.length === 1
      ){
        const state =
          states[0];

        const external =
          await ExternalTrip.findOne({
            _id:
              state.externalTripObjectId,
            tenantId
          });

        if(external){

          external.tripDate =
            trip.tripDate ||
            external.tripDate;

          external.tripTime =
            trip.tripTime ||
            external.tripTime;

          external.pickup =
            trip.pickup ||
            external.pickup;

          external.dropoff =
            trip.dropoff ||
            external.dropoff;

          external.stops =
            safeArray(trip.stops)
              .map((stop,index)=>({
                address:
                  clean(
                    stop?.address ||
                    stop
                  ),
                sequence:index + 1
              }))
              .filter(stop=>stop.address);

          await ensureExternalTripCoordinates(
            external,
            {
              save:false,
              forcePickup:
                oldPickup !==
                clean(trip.pickup),
              forceDropoff:
                oldDropoff !==
                clean(trip.dropoff),
              forceStops:
                oldStops !==
                newStops
            }
          );

          external.notes =
            trip.notes ||
            external.notes;

          await external.save();
        }
      }

      return res.json({
        success:true,
        trip:
          serializeTrip(
            trip
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to edit broker review trip"
      });
    }
  }
);

/* =========================
   DELETE REVIEW TRIP
========================= */

router.delete(
  "/trips/:id",
  async (req,res)=>{

    const session =
      await mongoose.startSession();

    try{

      const tenantId =
        tenantObjectId(req);

      if(
        !mongoose.Types.ObjectId
          .isValid(req.params.id)
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid trip"
        });
      }

      const Trip =
        getTripModel();

      await session.withTransaction(
        async()=>{

          const trip =
            await Trip.findOne({
              _id:req.params.id,
              tenantId
            })
              .session(session);

          if(!trip){
            throw new Error(
              "Broker review trip not found"
            );
          }

          if(
            executionLocked(
              trip
            )
          ){
            const err =
              new Error(
                "A trip that has started or closed cannot be deleted"
              );

            err.statusCode =
              409;

            throw err;
          }

          if(
            tripScheduledTimePassed(
              trip
            )
          ){
            const err =
              new Error(
                "A trip whose scheduled time has passed cannot be deleted"
              );

            err.statusCode =
              409;

            throw err;
          }

          const states =
            await TripSplitState.find({
              tenantId,
              dispatchTripId:
                trip._id,
              confirmed:true
            })
              .session(session);

          const externalIds =
            states
              .map(
                row=>
                  row.externalTripObjectId
              )
              .filter(Boolean);

          await Trip.deleteOne(
            {
              _id:trip._id,
              tenantId
            },
            {
              session
            }
          );

          await TripSplitState.deleteMany(
            {
              tenantId,
              dispatchTripId:
                trip._id
            },
            {
              session
            }
          );

          if(externalIds.length){
            await ExternalTrip.deleteMany(
              {
                _id:{
                  $in:externalIds
                },
                tenantId
              },
              {
                session
              }
            );
          }
        }
      );

      return res.json({
        success:true
      });

    }catch(err){

      return res.status(
        err.statusCode ||
        500
      ).json({
        success:false,
        message:
          err.message ||
          "Failed to delete broker review trip"
      });

    }finally{

      await session.endSession();
    }
  }
);

module.exports =
  router;
