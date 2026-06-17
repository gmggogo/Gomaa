const express = require("express");
const router = express.Router();

const routeMap = require("../utils/routeMapEngine");

/* 🔥 نربطه بالـ liveDrivers اللي عندك في index */
const liveDrivers = global.liveDrivers || new Map();
global.liveDrivers = liveDrivers;

/* =========================
   RECEIVE DRIVER LOCATION
========================= */

router.post("/", (req,res)=>{

  try{

    const { tripId, lat, lng } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if(!tripId || lat === undefined || lng === undefined){
      return res.status(400).json({
        success:false,
        message:"Missing data"
      });
    }

    const numLat = Number(lat);
    const numLng = Number(lng);

    if(!Number.isFinite(numLat) || !Number.isFinite(numLng)){
      return res.status(400).json({
        success:false,
        message:"Invalid coordinates"
      });
    }

    /* =========================
       UPDATE ENGINE
    ========================= */

    routeMap.updateLocation(tripId, numLat, numLng);

    /* =========================
       UPDATE LIVE MAP (🔥 مهم)
    ========================= */

    liveDrivers.set(tripId,{
      lat: numLat,
      lng: numLng,
      time: Date.now()
    });

    /* =========================
       RESPONSE
    ========================= */

    return res.json({
      success:true
    });

  }catch(err){

    console.log("DRIVER LOCATION ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Server error"
    });

  }

});

module.exports = router;