const express = require("express");
const router = express.Router();

/* =========================
   GLOBAL LIVE DRIVERS (SAFE INIT)
========================= */

global.liveDrivers = global.liveDrivers || new Map();

/* =========================
   RECEIVE DRIVER LOCATION
   POST /api/driver-location
========================= */

router.post("/", (req, res) => {

  try {

    const {
      driverId,
      lat,
      lng,
      name,
      phone,
      vehicleNumber
    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if (!driverId || lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "Missing data"
      });
    }

    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates"
      });
    }

    /* =========================
       UPDATE LIVE DRIVER
    ========================= */

    const id = String(driverId);

    global.liveDrivers.set(id, {
      driverId: id,
      name: name || "",
      phone: phone || "",
      vehicleNumber: vehicleNumber || "",
      lat: numLat,
      lng: numLng,
      time: Date.now(),
      online: true
    });

    /* =========================
       RESPONSE
    ========================= */

    return res.json({
      success: true,
      driver: {
        driverId: id,
        lat: numLat,
        lng: numLng
      }
    });

  } catch (err) {

    console.log("DRIVER LOCATION ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

/* =========================
   GET LIVE DRIVERS
   GET /api/driver-location/live
========================= */

router.get("/live", (req, res) => {

  try {

    const now = Date.now();
    const MAX_AGE = 1000 * 60 * 5; // 5 minutes

    const drivers = [];

    global.liveDrivers.forEach((val, key) => {

      if (!val || !val.time) return;

      if (now - val.time > MAX_AGE) {
        global.liveDrivers.delete(key);
        return;
      }

      drivers.push({
        driverId: val.driverId || String(key),
        name: val.name || "",
        phone: val.phone || "",
        vehicleNumber: val.vehicleNumber || "",
        lat: Number(val.lat),
        lng: Number(val.lng),
        time: val.time,
        online: true
      });

    });

    return res.json({
      success: true,
      count: drivers.length,
      drivers
    });

  } catch (err) {

    console.log("LIVE DRIVERS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load live drivers",
      count: 0,
      drivers: []
    });

  }

});

/* =========================
   GET ONE DRIVER
   GET /api/driver-location/:driverId
========================= */

router.get("/:driverId", (req, res) => {

  try {

    const driverId = String(req.params.driverId || "");
    const driver = global.liveDrivers.get(driverId);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not online"
      });
    }

    return res.json({
      success: true,
      driver
    });

  } catch (err) {

    console.log("ONE DRIVER LOCATION ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

/* =========================
   CLEAN OLD DRIVERS (AUTO)
========================= */

if (!global.liveDriversCleanerStarted) {

  global.liveDriversCleanerStarted = true;

  setInterval(() => {

    const now = Date.now();
    const MAX_AGE = 1000 * 60 * 5; // 5 minutes

    global.liveDrivers.forEach((val, key) => {

      if (!val || !val.time || now - val.time > MAX_AGE) {
        global.liveDrivers.delete(key);
      }

    });

  }, 60000);

}

/* =========================
   EXPORT
========================= */

module.exports = router;