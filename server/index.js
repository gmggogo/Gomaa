require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();

/* =========================
   ENV
========================= */
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =========================
   STATIC
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   MONGO CONNECT
========================= */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Mongo Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

/* =========================
   USER MODEL
========================= */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "dispatcher", "driver", "company"],
    required: true
  },
  active: { type: Boolean, default: true },

  /* OPTIONAL DRIVER / DISPATCH DATA */
  vehicleNumber: { type: String, default: "" },
  address: { type: String, default: "" },
  phone: { type: String, default: "" }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

/* =========================
   TRIP MODEL
========================= */
const tripSchema = new mongoose.Schema({
  tripNumber: { type: String, unique: true, sparse: true },
  type: { type: String, default: "company" },
  company: { type: String, default: "" },

  entryName: { type: String, default: "" },
  entryPhone: { type: String, default: "" },

  clientName: { type: String, default: "" },
  clientPhone: { type: String, default: "" },

  pickup: { type: String, default: "" },
  dropoff: { type: String, default: "" },
  stops: { type: [String], default: [] },

  /* OPTIONAL COORDINATES */
  pickupLat: { type: Number, default: null },
  pickupLng: { type: Number, default: null },
  dropoffLat: { type: Number, default: null },
  dropoffLng: { type: Number, default: null },

  stopCoords: {
    type: [{
      address: { type: String, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    }],
    default: []
  },

  tripDate: { type: String, default: "" },
  tripTime: { type: String, default: "" },

  notes: { type: String, default: "" },

  /* DISPATCH */
  dispatchSelected: { type: Boolean, default: false },

  /* DISABLE / ENABLE */
  disabled: { type: Boolean, default: false },

  driverId: { type: String, default: "" },
  driverName: { type: String, default: "" },
  vehicle: { type: String, default: "" },
  driverAddress: { type: String, default: "" },
  dispatchNote: { type: String, default: "" },

  status: { type: String, default: "Scheduled" },
  bookedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { minimize: false });

/* INDEXES */
tripSchema.index({ tripNumber: 1 }, { unique: true, sparse: true });
tripSchema.index({ company: 1 });
tripSchema.index({ createdAt: -1 });
tripSchema.index({ dispatchSelected: 1, disabled: 1, tripDate: 1, tripTime: 1 });
tripSchema.index({ driverId: 1, status: 1, tripDate: 1, tripTime: 1 });

const Trip = mongoose.model("Trip", tripSchema);

/* =========================
   DRIVER SCHEDULE MODEL
========================= */
const driverScheduleSchema = new mongoose.Schema({
  driverId: { type: String, required: true, unique: true },

  phone: { type: String, default: "" },
  address: { type: String, default: "" },

  /* IMPORTANT: REAL COORDINATES */
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },

  vehicleNumber: { type: String, default: "" },

  enabled: { type: Boolean, default: true },

  days: {
    type: Object,
    default: {}
  }
}, { timestamps: true, minimize: false });

const DriverSchedule = mongoose.model("DriverSchedule", driverScheduleSchema);

/* =========================
   LIVE DRIVER TRACKING
========================= */
const liveDrivers = new Map();

/* =========================
   GEO CACHE
========================= */
const geoCache = new Map();

/* =========================
   HELPERS
========================= */
function getArizonaTime() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
}

function normalizeTripType(rawType) {
  const t = String(rawType || "").trim().toLowerCase();

  if (t === "reserved") return "reserved";
  if (t === "gh") return "gh";
  if (t === "individual") return "individual";
  if (t === "company") return "company";

  return "company";
}

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseStops(stops) {
  if (!Array.isArray(stops)) return [];
  return stops.map(s => normalizeText(s)).filter(Boolean);
}

function parseStopCoords(stopCoords) {
  if (!Array.isArray(stopCoords)) return [];
  return stopCoords.map(sc => ({
    address: normalizeText(sc?.address),
    lat: normalizeNumber(sc?.lat),
    lng: normalizeNumber(sc?.lng)
  }));
}

function getFreshLiveDriversArray() {
  const now = Date.now();
  const maxAge = 1000 * 60 * 5;

  return Array.from(liveDrivers.values()).filter(driver => {
    return now - driver.time <= maxAge;
  });
}

function toRad(v) {
  return v * Math.PI / 180;
}

function calcDistanceKm(lat1, lng1, lat2, lng2) {
  if (
    lat1 === null || lng1 === null ||
    lat2 === null || lng2 === null ||
    lat1 === undefined || lng1 === undefined ||
    lat2 === undefined || lng2 === undefined
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseTripDateTime(tripDate, tripTime) {
  const d = normalizeText(tripDate);
  if (!d) return null;

  const t = normalizeText(tripTime) || "00:00";
  const iso = `${d}T${t}`;
  const dt = new Date(iso);

  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function sortTripsByDateTime(trips) {
  return [...trips].sort((a, b) => {
    const da = parseTripDateTime(a.tripDate, a.tripTime);
    const db = parseTripDateTime(b.tripDate, b.tripTime);

    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;

    if (ta !== tb) return ta - tb;

    const aNum = normalizeText(a.tripNumber);
    const bNum = normalizeText(b.tripNumber);
    return aNum.localeCompare(bNum);
  });
}

function getDayShort(dateStr) {
  const d = normalizeText(dateStr);
  if (!d) return "";

  const dt = new Date(`${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return "";

  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "America/Phoenix"
  });
}

function isDriverEnabledBySchedule(driverId, schedule) {
  const s = schedule[String(driverId)] || null;
  if (!s) return true;
  return s.enabled === true;
}

function isDriverWorkingThatDay(driverId, tripDate, schedule) {
  const s = schedule[String(driverId)] || null;
  if (!s) return true;
  if (s.enabled !== true) return false;

  const days = s.days || {};
  const dayShort = getDayShort(tripDate);

  if (!dayShort) return true;

  if (Object.keys(days).length === 0) return true;

  return days[dayShort] === true;
}

function buildDriverAddress(driver, scheduleRow) {
  const scheduleAddress = normalizeText(scheduleRow?.address);
  const userAddress = normalizeText(driver?.address);
  return scheduleAddress || userAddress || "";
}

function buildDriverVehicle(driver, scheduleRow) {
  const scheduleVehicle = normalizeText(scheduleRow?.vehicleNumber);
  const userVehicle = normalizeText(driver?.vehicleNumber);
  return scheduleVehicle || userVehicle || "";
}

function buildDriverPhone(driver, scheduleRow) {
  const schedulePhone = normalizeText(scheduleRow?.phone);
  const userPhone = normalizeText(driver?.phone);
  return schedulePhone || userPhone || "";
}

async function geocodeAddress(address) {
  const q = normalizeText(address);
  if (!q) return { lat: null, lng: null };

  const cacheKey = q.toLowerCase();
  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey);
  }

  try {
    if (typeof fetch !== "function") {
      return { lat: null, lng: null };
    }

   const GOOGLE_KEY = process.env.GOOGLE_KEY;

const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${GOOGLE_KEY}`;

const resp = await fetch(url);
const data = await resp.json();

const first = data?.results?.[0];

const result = {
  lat: first?.geometry?.location?.lat ?? null,
  lng: first?.geometry?.location?.lng ?? null
};
    geoCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.log("Geocode error:", err?.message || err);
    return { lat: null, lng: null };
  }
}

async function ensureTripCoords(trip) {
  const pickupLat = normalizeNumber(trip.pickupLat);
  const pickupLng = normalizeNumber(trip.pickupLng);
  const dropoffLat = normalizeNumber(trip.dropoffLat);
  const dropoffLng = normalizeNumber(trip.dropoffLng);

  let changed = false;

  let finalPickupLat = pickupLat;
  let finalPickupLng = pickupLng;
  let finalDropoffLat = dropoffLat;
  let finalDropoffLng = dropoffLng;

  if (finalPickupLat === null || finalPickupLng === null) {
    const geo = await geocodeAddress(trip.pickup);
    if (geo.lat !== null && geo.lng !== null) {
      finalPickupLat = geo.lat;
      finalPickupLng = geo.lng;
      changed = true;
    }
  }

  if (finalDropoffLat === null || finalDropoffLng === null) {
    const geo = await geocodeAddress(trip.dropoff);
    if (geo.lat !== null && geo.lng !== null) {
      finalDropoffLat = geo.lat;
      finalDropoffLng = geo.lng;
      changed = true;
    }
  }

  trip.pickupLat = finalPickupLat;
  trip.pickupLng = finalPickupLng;
  trip.dropoffLat = finalDropoffLat;
  trip.dropoffLng = finalDropoffLng;

  if (changed && trip._id) {
    try {
      await Trip.findByIdAndUpdate(trip._id, {
        pickupLat: finalPickupLat,
        pickupLng: finalPickupLng,
        dropoffLat: finalDropoffLat,
        dropoffLng: finalDropoffLng
      });
    } catch (err) {
      console.log("Trip coord save error:", err?.message || err);
    }
  }

  return trip;
}

async function ensureDriverScheduleCoords(driverId, scheduleRow) {
  const lat = normalizeNumber(scheduleRow?.lat);
  const lng = normalizeNumber(scheduleRow?.lng);

  if (lat !== null && lng !== null) {
    return {
      ...scheduleRow,
      lat,
      lng
    };
  }

  const address = normalizeText(scheduleRow?.address);
  if (!address) return scheduleRow;

  const geo = await geocodeAddress(address);
  if (geo.lat === null || geo.lng === null) return scheduleRow;

  try {
    await DriverSchedule.findOneAndUpdate(
      { driverId: String(driverId) },
      { lat: geo.lat, lng: geo.lng }
    );
  } catch (err) {
    console.log("Driver schedule coord save error:", err?.message || err);
  }

  return {
    ...scheduleRow,
    lat: geo.lat,
    lng: geo.lng
  };
}

async function generateTripNumber(type) {
  if (type === "gh") {
    const lastTrip = await Trip.findOne({
      tripNumber: { $regex: /^GH\d+$/ }
    }).sort({ createdAt: -1, _id: -1 });

    let next = 100;

    if (lastTrip?.tripNumber) {
      const num = parseInt(lastTrip.tripNumber.replace("GH", ""), 10);
      if (!isNaN(num)) next = num + 1;
    }

    return "GH" + next;
  }

  if (type === "reserved") {
    const lastTrip = await Trip.findOne({
      tripNumber: { $regex: /^RV-\d+$/ }
    }).sort({ createdAt: -1, _id: -1 });

    let next = 1001;

    if (lastTrip?.tripNumber) {
      const num = parseInt(lastTrip.tripNumber.replace("RV-", ""), 10);
      if (!isNaN(num)) next = num + 1;
    }

    return "RV-" + next;
  }

  if (type === "individual") {
    const lastTrip = await Trip.findOne({
      tripNumber: { $regex: /^IN-\d+$/ }
    }).sort({ createdAt: -1, _id: -1 });

    let next = 1001;

    if (lastTrip?.tripNumber) {
      const num = parseInt(lastTrip.tripNumber.replace("IN-", ""), 10);
      if (!isNaN(num)) next = num + 1;
    }

    return "IN-" + next;
  }

  const now = getArizonaTime();
  const months = [
    "JA", "FE", "MA", "AP", "MY", "JN",
    "JL", "AU", "SE", "OC", "NO", "DE"
  ];

  const monthCode = months[now.getMonth()];
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const lastTrip = await Trip.findOne({
    createdAt: { $gte: startMonth, $lt: endMonth },
    tripNumber: { $regex: new RegExp("^" + monthCode + "-") }
  }).sort({ createdAt: -1, _id: -1 });

  let next = 1000;

  if (lastTrip?.tripNumber) {
    const parts = lastTrip.tripNumber.split("-");
    const num = parseInt(parts[1], 10);
    if (!isNaN(num)) next = num + 1;
  }

  return monthCode + "-" + next;
}

/* =========================
   SMART DISPATCH ENGINE
   - FIRST ROUND: nearest pickup to driver home
   - NEXT ROUNDS: nearest pickup to last dropoff
========================= */
function assignTripToDriverState(ds, trip, scheduleRow) {
  trip.driverId = String(ds.driver._id);
  trip.driverName = normalizeText(ds.driver.name);
  trip.vehicle = buildDriverVehicle(ds.driver, scheduleRow);
  trip.driverAddress = buildDriverAddress(ds.driver, scheduleRow);

  if (
    normalizeText(trip.status) === "" ||
    normalizeText(trip.status).toLowerCase() === "scheduled" ||
    normalizeText(trip.status).toLowerCase() === "booked"
  ) {
    trip.status = "Auto Assigned";
  }

  ds.assignedTrips.push(trip);
  ds.currentLat = normalizeNumber(trip.dropoffLat) ?? ds.currentLat;
  ds.currentLng = normalizeNumber(trip.dropoffLng) ?? ds.currentLng;
  ds.lastTripDate = normalizeText(trip.tripDate);
  ds.lastTripTime = normalizeText(trip.tripTime);
}

function buildLockedAssignedTripMap(trips) {
  const map = new Map();

  for (const trip of trips) {
    const driverId = normalizeText(trip.driverId);
    if (!driverId) continue;

    if (!map.has(driverId)) map.set(driverId, []);
    map.get(driverId).push(trip);
  }

  for (const [driverId, arr] of map.entries()) {
    map.set(driverId, sortTripsByDateTime(arr));
  }

  return map;
}

function getDriverStateBase(driver, scheduleRow) {
  return {
    driver,
    currentLat: normalizeNumber(scheduleRow?.lat),
    currentLng: normalizeNumber(scheduleRow?.lng),
    assignedTrips: [],
    firstRoundDoneByDate: new Set(),
    lastTripDate: "",
    lastTripTime: ""
  };
}

function canDriverTakeTrip(driverState, trip, schedule) {
  const driverId = String(driverState.driver._id);

  if (!isDriverEnabledBySchedule(driverId, schedule)) return false;
  if (!isDriverWorkingThatDay(driverId, trip.tripDate, schedule)) return false;

  return true;
}

function groupTripsByDate(trips) {
  const map = new Map();

  for (const trip of sortTripsByDateTime(trips)) {
    const dateKey = normalizeText(trip.tripDate) || "NO_DATE";
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey).push(trip);
  }

  return map;
}

function getNearestTripFromPoint(pointLat, pointLng, trips) {
  let bestTrip = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  for (const trip of trips) {
    const pLat = normalizeNumber(trip.pickupLat);
    const pLng = normalizeNumber(trip.pickupLng);
    const dist = calcDistanceKm(pointLat, pointLng, pLat, pLng);

    if (dist < bestDistance) {
      bestDistance = dist;
      bestTrip = trip;
    }
  }

  return bestTrip;
}

function removeTripFromArray(arr, targetTrip) {
  const idx = arr.findIndex(t => String(t._id) === String(targetTrip._id));
  if (idx !== -1) arr.splice(idx, 1);
}

async function autoAssignTrips({ trips, drivers, schedule }) {
  const preparedTrips = sortTripsByDateTime([...trips]);

  for (const trip of preparedTrips) {
    await ensureTripCoords(trip);
  }

  const dateGroups = groupTripsByDate(preparedTrips);

  const driverStates = [];
  for (const driver of drivers) {
    const id = String(driver._id);
    const baseSchedule = schedule[id] || {
      phone: "",
      address: normalizeText(driver.address),
      lat: null,
      lng: null,
      vehicleNumber: normalizeText(driver.vehicleNumber),
      enabled: true,
      days: {}
    };

    const safeSchedule = await ensureDriverScheduleCoords(id, baseSchedule);
    schedule[id] = safeSchedule;

    driverStates.push(getDriverStateBase(driver, safeSchedule));
  }

  const lockedMap = buildLockedAssignedTripMap(preparedTrips);

  for (const ds of driverStates) {
    const driverId = String(ds.driver._id);
    const existingTrips = lockedMap.get(driverId) || [];
    const scheduleRow = schedule[driverId] || {};

    for (const trip of existingTrips) {
      assignTripToDriverState(ds, trip, scheduleRow);
      ds.firstRoundDoneByDate.add(normalizeText(trip.tripDate) || "NO_DATE");
    }
  }

  const finalTrips = [];

  for (const [dateKey, allTripsForDate] of dateGroups.entries()) {
    const lockedTrips = [];
    const unassignedTrips = [];

    for (const trip of allTripsForDate) {
      if (normalizeText(trip.driverId)) {
        lockedTrips.push(trip);
      } else {
        unassignedTrips.push(trip);
      }
    }

    const remaining = [...unassignedTrips];

    for (const ds of driverStates) {
      const driverId = String(ds.driver._id);
      const scheduleRow = schedule[driverId] || {};

      if (ds.firstRoundDoneByDate.has(dateKey)) continue;
      if (!isDriverEnabledBySchedule(driverId, schedule)) continue;
      if (!isDriverWorkingThatDay(driverId, dateKey, schedule)) continue;

      const candidateTrips = remaining.filter(trip =>
        canDriverTakeTrip(ds, trip, schedule)
      );

      if (candidateTrips.length === 0) continue;

      const nearest = getNearestTripFromPoint(ds.currentLat, ds.currentLng, candidateTrips);
      if (!nearest) continue;

      assignTripToDriverState(ds, nearest, scheduleRow);
      ds.firstRoundDoneByDate.add(dateKey);
      removeTripFromArray(remaining, nearest);
    }

    while (remaining.length > 0) {
      let assignedThisLoop = false;

      for (const ds of driverStates) {
        const driverId = String(ds.driver._id);
        const scheduleRow = schedule[driverId] || {};

        if (!isDriverEnabledBySchedule(driverId, schedule)) continue;
        if (!isDriverWorkingThatDay(driverId, dateKey, schedule)) continue;

        const candidateTrips = remaining.filter(trip =>
          canDriverTakeTrip(ds, trip, schedule)
        );

        if (candidateTrips.length === 0) continue;

        const nearest = getNearestTripFromPoint(ds.currentLat, ds.currentLng, candidateTrips);
        if (!nearest) continue;

        assignTripToDriverState(ds, nearest, scheduleRow);
        ds.firstRoundDoneByDate.add(dateKey);
        removeTripFromArray(remaining, nearest);
        assignedThisLoop = true;

        if (remaining.length === 0) break;
      }

      if (!assignedThisLoop) {
        break;
      }
    }

    finalTrips.push(...lockedTrips);
  }

  const stateAssignedIds = new Set();
  for (const ds of driverStates) {
    for (const trip of ds.assignedTrips) {
      stateAssignedIds.add(String(trip._id));
      finalTrips.push(trip);
    }
  }

  for (const trip of preparedTrips) {
    if (!stateAssignedIds.has(String(trip._id)) && !finalTrips.find(t => String(t._id) === String(trip._id))) {
      finalTrips.push(trip);
    }
  }

  return sortTripsByDateTime(finalTrips);
}

async function persistAssignedTrips(trips) {
  const ops = [];

  for (const trip of trips) {
  const update = {
  pickupLat: normalizeNumber(trip.pickupLat),
  pickupLng: normalizeNumber(trip.pickupLng),
  dropoffLat: normalizeNumber(trip.dropoffLat),
  dropoffLng: normalizeNumber(trip.dropoffLng),
  driverId: normalizeText(trip.driverId),
  driverName: normalizeText(trip.driverName),
  vehicle: normalizeText(trip.vehicle),
  driverAddress: normalizeText(trip.driverAddress),
  status: normalizeText(trip.status) || "Scheduled"
};

   ops.push({
  updateOne: {
    filter: { _id: trip._id },
    update: { $set: update }
  }
});
  }

  if (ops.length > 0) {
    try {
      await Trip.bulkWrite(ops, { ordered: false });
    } catch (err) {
      console.log("Bulk trip save error:", err?.message || err);
    }
  }
}

/* =========================
   DRIVER SCHEDULE API
========================= */
app.get("/api/driver-schedule", async (req, res) => {
  try {
    const rows = await DriverSchedule.find().lean();
    const result = {};

    for (const r of rows) {
      const id = String(r.driverId || "").trim();
      if (!id) continue;

      result[id] = {
        phone: normalizeText(r.phone),
        address: normalizeText(r.address),
        lat: normalizeNumber(r.lat),
        lng: normalizeNumber(r.lng),
        vehicleNumber: normalizeText(r.vehicleNumber),
        enabled: r.enabled === true,
        days: r.days || {}
      };
    }

    res.json(result);
  } catch (err) {
    console.log("Schedule ERROR:", err);
    res.status(500).json({ message: "Schedule load error" });
  }
});

app.post("/api/driver-schedule", async (req, res) => {
  try {
    const data = req.body || {};

    for (const id in data) {
      const safeId = String(id || "").trim();
      if (!safeId) continue;

      const s = data[id] || {};

      await DriverSchedule.findOneAndUpdate(
        { driverId: safeId },
        {
          driverId: safeId,
          phone: normalizeText(s.phone),
          address: normalizeText(s.address),
          lat: normalizeNumber(s.lat),
          lng: normalizeNumber(s.lng),
          vehicleNumber: normalizeText(s.vehicleNumber),
          enabled: typeof s.enabled === "boolean" ? s.enabled : true,
          days: s.days || {}
        },
        { upsert: true, new: true }
      );
    }

    res.json({ status: "saved" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Schedule save error" });
  }
});

/* =========================
   CREATE ADMIN
========================= */
app.get("/create-admin", async (req, res) => {
  try {
    const existing = await User.findOne({ username: "admin" });

    if (existing) {
      return res.send("Admin already exists");
    }

    const hashed = await bcrypt.hash("111111", 10);

    await User.create({
      name: "Admin",
      username: "admin",
      password: hashed,
      role: "admin"
    });

    res.send("Admin Created (admin / 111111)");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating admin");
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.active) {
      return res.status(403).json({ message: "User disabled" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});