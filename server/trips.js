const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

/* =========================
   DB FILE
========================= */
const TRIPS_DB = path.join(__dirname, "trips.json");

function readTrips() {
  if (!fs.existsSync(TRIPS_DB)) return [];
  return JSON.parse(fs.readFileSync(TRIPS_DB, "utf8"));
}

function saveTrips(trips) {
  fs.writeFileSync(TRIPS_DB, JSON.stringify(trips, null, 2));
}

/* =========================
   CREATE / SEND TRIP
   (من الديسبتشر)
========================= */
router.post("/", (req, res) => {
  const trip = req.body;

  if (!trip.tripNumber || !trip.driverId) {
    return res.status(400).json({ error: "Missing tripNumber or driverId" });
  }

  const trips = readTrips();

  // منع تكرار نفس الرحلة
  if (trips.find(t => t.tripNumber === trip.tripNumber)) {
    return res.status(400).json({ error: "Trip already exists" });
  }

  const newTrip = {
    ...trip,
    status: "assigned",
    createdAt: Date.now()
  };

  trips.push(newTrip);
  saveTrips(trips);

  res.json({ success: true, trip: newTrip });
});

/* =========================
   GET TRIPS FOR DRIVER
========================= */
router.get("/", (req, res) => {
  const driverId = Number(req.query.driverId);
  const trips = readTrips();

  if (!driverId) {
    return res.json(trips);
  }

  const driverTrips = trips.filter(
    t => Number(t.driverId) === driverId && t.status !== "completed"
  );

  res.json(driverTrips);
});

/* =========================
   UPDATE TRIP STATUS
========================= */
router.put("/:tripNumber", (req, res) => {
  const { tripNumber } = req.params;
  const { status, note } = req.body;

  const trips = readTrips();
  const trip = trips.find(t => t.tripNumber === tripNumber);

  if (!trip) {
    return res.status(404).json({ error: "Trip not found" });
  }

  if (status) trip.status = status;
  if (note) trip.note = note;

  saveTrips(trips);
  res.json({ success: true, trip });
});

module.exports = router;