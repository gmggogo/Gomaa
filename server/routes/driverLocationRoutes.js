const express = require("express");
const router = express.Router();

const routeMap = require("../utils/routeMapEngine");

/* =========================
   GLOBAL LIVE DRIVERS (SAFE INIT)
========================= */

global.liveDrivers = global.liveDrivers || new Map();

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
       UPDATE ROUTE ENGINE
    ========================= */

    try{
      routeMap.updateLocation(tripId, numLat, numLng);
    }catch(e){
      console.log("Route engine error:", e);
    }

    /* =========================
       UPDATE LIVE MAP (🔥 IMPORTANT)
    ========================= */

    global.liveDrivers.set(tripId,{
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

/* =========================
   OPTIONAL: CLEAN OLD DRIVERS (AUTO)
========================= */

setInterval(()=>{

  const now = Date.now();
  const MAX_AGE = 1000 * 60 * 5; // 5 minutes

  global.liveDrivers.forEach((val,key)=>{

    if(now - val.time > MAX_AGE){
      global.liveDrivers.delete(key);
    }

  });

},60000);

module.exports = router;