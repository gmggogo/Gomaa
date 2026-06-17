const express = require("express");
const router = express.Router();
console.log("✅ liveDriverRoutes FILE LOADED");
const LiveDriver = require("../models/LiveDriver");
const routeMap = require("../utils/routeMapEngine");

/* =========================
   DRIVER MOBILE SEND LOCATION
   POST /api/driver/location
========================= */

router.post("/driver/location", async (req,res)=>{

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

    const id = String(driverId || "");
    const activeTripId = String(tripId || "");

    const numLat = Number(lat);
    const numLng = Number(lng);

    if(!id || !Number.isFinite(numLat) || !Number.isFinite(numLng)){
      return res.status(400).json({
        success:false,
        message:"Missing driverId / lat / lng"
      });
    }

    /* =========================
       SAVE LIVE DRIVER IN MONGO
    ========================= */

    const saved = await LiveDriver.findOneAndUpdate(
      { driverId:id },
      {
        driverId:id,
        tripId:activeTripId,
        name:name || "",
        phone:phone || "",
        vehicleNumber:vehicleNumber || "",
        routeMode:routeMode || "",
        lat:numLat,
        lng:numLng,
        updatedAt:new Date(),
        lastSeen:new Date()
      },
      {
        upsert:true,
        new:true
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
        console.log("ROUTE MAP UPDATE ERROR:", e.message);
      }
    }

    return res.json({
      success:true,
      message:"Driver location saved",
      driver:saved
    });

  }catch(err){

    console.log("LIVE DRIVER SAVE ERROR:",err);

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

router.get("/admin/live-drivers", async (req,res)=>{

  try{

    const ONLINE_LIMIT = 1000 * 60 * 5;

    const since =
      new Date(Date.now() - ONLINE_LIMIT);

    const drivers = await LiveDriver.find({
      $or:[
        { updatedAt:{ $gte:since } },
        { lastSeen:{ $gte:since } }
      ]
    }).lean();

    const list = drivers
      .map(d => ({
        driverId:d.driverId || "",
        tripId:d.tripId || "",
        name:d.name || "",
        phone:d.phone || "",
        vehicleNumber:d.vehicleNumber || "",
        routeMode:d.routeMode || "",
        lat:Number(d.lat),
        lng:Number(d.lng),
        updatedAt:d.updatedAt || d.lastSeen || null
      }))
      .filter(d =>
        Number.isFinite(d.lat) &&
        Number.isFinite(d.lng)
      );

    return res.json(list);

  }catch(err){

    console.log("LIVE DRIVERS LOAD ERROR:",err);

    return res.json([]);

  }

});

/* =========================
   GET REAL DRIVEN MILES
   GET /api/driver/route/:tripId
========================= */

router.get("/driver/route/:tripId", (req,res)=>{

  try{

    const tripId =
      String(req.params.tripId || "");

    return res.json({
      success:true,
      tripId,
      miles:routeMap.getDrivenMiles(tripId),
      lastLocation:routeMap.getLastLocation(tripId),
      path:routeMap.getPath(tripId)
    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Route map error"
    });

  }

});

module.exports = router;