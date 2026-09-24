const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

console.log("✅ liveDriverRoutes FILE LOADED");

const LiveDriver =
  require("../models/LiveDriver");

const routeMap =
  require("../utils/routeMapEngine");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

if(
  !global.liveDrivers ||
  typeof global.liveDrivers.set !== "function"
){
  global.liveDrivers = new Map();
}

function cleanStatus(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g,"");
}

function tripIsInProgress(trip){
  return [
    "ontrip",
    "started",
    "inprogress",
    "pickedup",
    "pickupcompleted",
    "passengerpickedup",
    "enroute",
    "active"
  ].includes(
    cleanStatus(trip?.status)
  );
}

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(
  req,
  extra={}
){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){

      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId:
      req.authUser.tenantId
  };
}

function tenantIdForWrite(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    return String(
      req.body?.tenantId ||
      req.query?.tenantId ||
      ""
    ).trim();
  }

  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
}

function getTripModel(){

  return (
    global.Trip ||
    mongoose.models.Trip ||
    null
  );
}

/* =========================
   DRIVER MOBILE SEND LOCATION
   POST /api/driver/location
========================= */

router.post(
  "/driver/location",
  requireTenantApi,
  async (req,res)=>{

  try{

    const {
      driverId,
      tripId,
      lat,
      lng,
      name,
      phone,
      vehicleNumber,
      routeMode,
      currentStopId,
      currentStopIndex
    } = req.body;

    const id =
      String(
        driverId || ""
      );

    const activeTripId =
      String(
        tripId || ""
      );

    const numLat =
      Number(lat);

    const numLng =
      Number(lng);

    const safeCurrentStopIndex =
      Number.isInteger(
        Number(currentStopIndex)
      ) &&
      Number(currentStopIndex) >= 0
        ? Number(currentStopIndex)
        : 0;

    if(
      !id ||
      !Number.isFinite(numLat) ||
      !Number.isFinite(numLng)
    ){

      return res.status(400).json({
        success:false,
        message:
          "Missing driverId / lat / lng"
      });
    }

    const tenantId =
      tenantIdForWrite(req);

    if(!tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    /*
      Driver users cannot post location
      under another driver id.
    */
    if(
      String(req.authUser.role || "")
        .toLowerCase() === "driver" &&
      req.authUser.id &&
      String(req.authUser.id) !== id
    ){

      return res.status(403).json({
        success:false,
        message:
          "Driver ID does not match login"
      });
    }

    /*
      If tripId exists, verify that the trip
      belongs to the same tenant before
      linking live location to it.
    */
    let activeTrip = null;

    if(activeTripId){

      const Trip =
        getTripModel();

      if(
        Trip &&
        mongoose.Types.ObjectId.isValid(
          activeTripId
        )
      ){

        activeTrip =
          await Trip.findOne({
            _id:activeTripId,
            tenantId
          })
          .select("_id tenantId status")
          .lean();

        if(!activeTrip){

          return res.status(404).json({
            success:false,
            message:
              "Trip not found for this tenant"
          });
        }
      }
    }

    /* =========================
       SAVE LIVE DRIVER IN MONGO
    ========================= */

    const saved =
      await LiveDriver.findOneAndUpdate(

        {
          tenantId,
          driverId:id
        },

        {
          $set:{

            tenantId,

            driverId:id,

            tripId:
              activeTripId,

            name:
              name || "",

            phone:
              phone || "",

            vehicleNumber:
              vehicleNumber || "",

            routeMode:
              routeMode || "",

            currentStopId:
              String(currentStopId || ""),

            currentStopIndex:
              safeCurrentStopIndex,

            lat:
              numLat,

            lng:
              numLng,

            online:
              true,

            updatedAt:
              new Date(),

            lastSeen:
              new Date()

          }
        },

        {
          upsert:true,
          new:true,
          setDefaultsOnInsert:true
        }

      );

    /* =========================
       UPDATE ROUTE MAP ENGINE
       يحسب الميلز الحقيقي لو فيه tripId
    ========================= */

    if(
      activeTripId &&
      tripIsInProgress(activeTrip)
    ){

      try{

        routeMap.updateLocation(
          activeTripId,
          numLat,
          numLng
        );

      }catch(e){

        console.log(
          "ROUTE MAP UPDATE ERROR:",
          e.message
        );
      }
    }

    global.liveDrivers.set(
      `${String(tenantId)}:${id}`,
      {
        tenantId:String(tenantId),
        driverId:id,
        tripId:activeTripId,
        name:name || "",
        lat:numLat,
        lng:numLng,
        currentStopId:String(currentStopId || ""),
        currentStopIndex:safeCurrentStopIndex,
        time:Date.now()
      }
    );

    return res.json({
      success:true,
      message:
        "Driver location saved",
      driver:saved
    });

  }catch(err){

    console.log(
      "LIVE DRIVER SAVE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Server error"
    });

  }

});

/* =========================
   ADMIN MAP READ LIVE DRIVERS
   GET /api/admin/live-drivers

   ONE HTTP REQUEST FROM MAP:
   - returns all online drivers
   - also attaches pickup/dropoff coordinates
     for each active trip in the same response
   - NO extra /api/trips/:id request is needed
========================= */

router.get(
  "/admin/live-drivers",
  requireTenantApi,
  async (req,res)=>{

  try{

    const ONLINE_LIMIT =
      1000 * 60 * 5;

    const since =
      new Date(
        Date.now() -
        ONLINE_LIMIT
      );

    const drivers =
      await LiveDriver.find(
        tenantFilter(req,{
          $or:[
            { updatedAt:{ $gte:since } },
            { lastSeen:{ $gte:since } }
          ]
        })
      )
      .lean();

    const tripObjectIds = [
      ...new Set(
        drivers
          .map(d => String(d?.tripId || "").trim())
          .filter(id =>
            id &&
            mongoose.Types.ObjectId.isValid(id)
          )
      )
    ].map(id => new mongoose.Types.ObjectId(id));

    const tripById = new Map();

    if(tripObjectIds.length){

      const Trip = getTripModel();

      if(Trip){

        const trips =
          await Trip.find(
            tenantFilter(req,{
              _id:{ $in:tripObjectIds }
            })
          )
          .select([
            "_id",
            "tenantId",
            "status",

            "pickupLat",
            "pickupLng",
            "pickupLatitude",
            "pickupLongitude",

            "dropoffLat",
            "dropoffLng",
            "dropLat",
            "dropLng",
            "dropoffLatitude",
            "dropoffLongitude",

            "passengers.pickupLat",
            "passengers.pickupLng",
            "passengers.dropoffLat",
            "passengers.dropoffLng",
            "passengers.status"
          ].join(" "))
          .lean();

        for(const trip of trips){
          tripById.set(
            String(trip._id),
            trip
          );
        }
      }
    }

    function safePoint(latValue,lngValue){

      const lat = Number(latValue);
      const lng = Number(lngValue);

      if(
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180 ||
        (lat === 0 && lng === 0)
      ){
        return null;
      }

      return { lat, lng };
    }

    function firstPassengerPoint(trip,type){

      const passengers =
        Array.isArray(trip?.passengers)
          ? trip.passengers
          : [];

      for(const passenger of passengers){

        const status =
          cleanStatus(passenger?.status);

        if(
          status.includes("cancel") ||
          status.includes("noshow")
        ){
          continue;
        }

        const point =
          type === "pickup"
            ? safePoint(
                passenger?.pickupLat,
                passenger?.pickupLng
              )
            : safePoint(
                passenger?.dropoffLat,
                passenger?.dropoffLng
              );

        if(point){
          return point;
        }
      }

      return null;
    }

    function tripPickupPoint(trip){

      if(!trip){
        return null;
      }

      return (
        safePoint(
          trip.pickupLat ??
          trip.pickupLatitude,

          trip.pickupLng ??
          trip.pickupLongitude
        ) ||
        firstPassengerPoint(
          trip,
          "pickup"
        )
      );
    }

    function tripDropoffPoint(trip){

      if(!trip){
        return null;
      }

      return (
        safePoint(
          trip.dropoffLat ??
          trip.dropLat ??
          trip.dropoffLatitude,

          trip.dropoffLng ??
          trip.dropLng ??
          trip.dropoffLongitude
        ) ||
        firstPassengerPoint(
          trip,
          "dropoff"
        )
      );
    }

    const list =
      drivers
        .map(d => {

          const tripId =
            String(
              d.tripId ||
              ""
            ).trim();

          const trip =
            tripById.get(
              tripId
            ) || null;

          const pickup =
            tripPickupPoint(trip);

          const dropoff =
            tripDropoffPoint(trip);

          return {

            tenantId:
              d.tenantId || "",

            driverId:
              d.driverId || "",

            tripId,

            name:
              d.name || "",

            phone:
              d.phone || "",

            vehicleNumber:
              d.vehicleNumber || "",

            routeMode:
              d.routeMode || "",

            currentStopId:
              d.currentStopId || "",

            currentStopIndex:
              Number(
                d.currentStopIndex ||
                0
              ),

            lat:
              Number(d.lat),

            lng:
              Number(d.lng),

            pickupLat:
              pickup
                ? pickup.lat
                : null,

            pickupLng:
              pickup
                ? pickup.lng
                : null,

            dropoffLat:
              dropoff
                ? dropoff.lat
                : null,

            dropoffLng:
              dropoff
                ? dropoff.lng
                : null,

            activeTrip:
              trip
                ? {
                    _id:
                      String(
                        trip._id
                      ),

                    status:
                      trip.status ||
                      "",

                    pickupLat:
                      pickup
                        ? pickup.lat
                        : null,

                    pickupLng:
                      pickup
                        ? pickup.lng
                        : null,

                    dropoffLat:
                      dropoff
                        ? dropoff.lat
                        : null,

                    dropoffLng:
                      dropoff
                        ? dropoff.lng
                        : null
                  }
                : null,

            updatedAt:
              d.updatedAt ||
              d.lastSeen ||
              null

          };
        })
        .filter(d =>
          Number.isFinite(d.lat) &&
          Number.isFinite(d.lng)
        );

    return res.json(
      list
    );

  }catch(err){

    console.log(
      "LIVE DRIVERS LOAD ERROR:",
      err
    );

    return res.json([]);

  }

});

/* =========================
   GET REAL DRIVEN MILES
   GET /api/driver/route/:tripId
========================= */

router.get(
  "/driver/route/:tripId",
  requireTenantApi,
  async (req,res)=>{

  try{

    const tripId =
      String(
        req.params.tripId ||
        ""
      );

    if(
      !mongoose.Types.ObjectId.isValid(
        tripId
      )
    ){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const Trip =
      getTripModel();

    if(!Trip){

      return res.status(500).json({
        success:false,
        message:"Trip model not loaded"
      });
    }

    const trip =
      await Trip.findOne(
        tenantFilter(req,{
          _id:tripId
        })
      )
      .select("_id tenantId")
      .lean();

    if(!trip){

      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    return res.json({

      success:true,

      tripId,

      miles:
        routeMap.getDrivenMiles(
          tripId
        ),

      lastLocation:
        routeMap.getLastLocation(
          tripId
        ),

      path:
        routeMap.getPath(
          tripId
        )

    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Route map error"
    });

  }

});

module.exports =
  router;