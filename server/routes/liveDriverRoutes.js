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
      String(req.authUser.role || "").trim().toUpperCase() ===
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
    String(req.authUser?.role || "").trim().toUpperCase() ===
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
    String(req.authUser?.role || "").trim().toUpperCase() ===
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
      routeMode
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
    if(activeTripId){

      const Trip =
        getTripModel();

      if(
        Trip &&
        mongoose.Types.ObjectId.isValid(
          activeTripId
        )
      ){

        const trip =
          await Trip.findOne({
            _id:activeTripId,
            tenantId
          })
          .select("_id tenantId")
          .lean();

        if(!trip){

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

    if(activeTripId){

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
            {
              updatedAt:{
                $gte:since
              }
            },
            {
              lastSeen:{
                $gte:since
              }
            }
          ]
        })
      )
      .lean();

    const list =
      drivers
        .map(d => ({

          tenantId:
            d.tenantId || "",

          driverId:
            d.driverId || "",

          tripId:
            d.tripId || "",

          name:
            d.name || "",

          phone:
            d.phone || "",

          vehicleNumber:
            d.vehicleNumber || "",

          routeMode:
            d.routeMode || "",

          lat:
            Number(d.lat),

          lng:
            Number(d.lng),

          updatedAt:
            d.updatedAt ||
            d.lastSeen ||
            null

        }))
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