const express = require("express");
const router = express.Router();

const LiveDriver = require("../models/LiveDriver");

/* =========================
   RECEIVE DRIVER LOCATION
   POST /api/driver/location
========================= */

router.post("/", async (req, res) => {

  try {

    const {
      driverId,
      name,
      phone,
      vehicleNumber,
      lat,
      lng,
      tripId,
      routeMode
    } = req.body;

    if (!driverId || lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "Missing driverId / lat / lng"
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

    const id = String(driverId);

    const driver = await LiveDriver.findOneAndUpdate(
      { driverId: id },
      {
        $set: {
          driverId: id,
          name: name || "",
          phone: phone || "",
          vehicleNumber: vehicleNumber || "",
          tripId: tripId || "",
          routeMode: routeMode || "",
          lat: numLat,
          lng: numLng,
          online: true,
          lastSeen: new Date()
        }
      },
      {
        new: true,
        upsert: true
      }
    );

    return res.json({
      success: true,
      message: "Driver location saved",
      driver
    });

  } catch (err) {

    console.log("DRIVER LOCATION SAVE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

/* =========================
   GET LIVE DRIVERS
   GET /api/driver/location/live
========================= */

router.get("/live", async (req, res) => {

  try {

    const ONLINE_LIMIT_MS = 1000 * 60 * 5;

    const since =
      new Date(Date.now() - ONLINE_LIMIT_MS);

    const drivers =
      await LiveDriver.find({
        lastSeen: { $gte: since }
      })
      .sort({ lastSeen: -1 })
      .lean();

    return res.json({
      success: true,
      count: drivers.length,
      drivers: drivers.map(d => ({
        driverId: d.driverId,
        name: d.name || "",
        phone: d.phone || "",
        vehicleNumber: d.vehicleNumber || "",
        tripId: d.tripId || "",
        routeMode: d.routeMode || "",
        lat: Number(d.lat),
        lng: Number(d.lng),
        lastSeen: d.lastSeen,
        online: true
      }))
    });

  } catch (err) {

    console.log("LIVE DRIVERS LOAD ERROR:", err);

    return res.status(500).json({
      success: false,
      count: 0,
      drivers: []
    });

  }

});

/* =========================
   GET ONE DRIVER
   GET /api/driver/location/:driverId
========================= */

router.get("/:driverId", async (req, res) => {

  try {

    const driverId =
      String(req.params.driverId || "");

    const driver =
      await LiveDriver.findOne({ driverId }).lean();

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
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
   SET DRIVER OFFLINE
   DELETE /api/driver/location/:driverId
========================= */

router.delete("/:driverId", async (req, res) => {

  try {

    const driverId =
      String(req.params.driverId || "");

    await LiveDriver.deleteOne({ driverId });

    return res.json({
      success: true,
      message: "Driver removed from live map"
    });

  } catch (err) {

    console.log("DELETE LIVE DRIVER ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

module.exports = router;