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

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "SunbeamTransportation/1.0"
      }
    });

    if (!resp.ok) {
      return { lat: null, lng: null };
    }

    const data = await resp.json();
    const first = Array.isArray(data) ? data[0] : null;

    const result = {
      lat: first?.lat ? Number(first.lat) : null,
      lng: first?.lon ? Number(first.lon) : null
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

  /* Seed driver states with existing assigned trips */
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

    /* FIRST ROUND
       only drivers who are active+enabled+working that day
       and still have not taken first job for this date
    */
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

    /* NEXT ROUNDS
       after first round, keep assigning by nearest pickup to last dropoff
    */
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

      /* avoid infinite loop */
      if (!assignedThisLoop) {
        break;
      }
    }

    finalTrips.push(...lockedTrips);
  }

  /* collect all trips from driver states */
  const stateAssignedIds = new Set();
  for (const ds of driverStates) {
    for (const trip of ds.assignedTrips) {
      stateAssignedIds.add(String(trip._id));
      finalTrips.push(trip);
    }
  }

  /* if any trip still untouched, keep it as-is */
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
   USERS ROUTES
========================= */
app.get("/api/users/:role", async (req, res) => {
  try {
    const role = req.params.role;

    if (!["admin", "dispatcher", "driver", "company"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const users = await User.find({ role }).sort({ createdAt: -1, name: 1 });
    res.json(users);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading users" });
  }
});

app.post("/api/users/:role", async (req, res) => {
  try {
    const role = req.params.role;
    const {
      name,
      username,
      password,
      vehicleNumber,
      address,
      phone
    } = req.body || {};

    if (!["admin", "dispatcher", "driver", "company"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!name || !username || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await User.findOne({ username: normalizeText(username) });

    if (exists) {
      return res.status(400).json({ message: "Username exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: normalizeText(name),
      username: normalizeText(username),
      password: hashed,
      role,
      vehicleNumber: normalizeText(vehicleNumber),
      address: normalizeText(address),
      phone: normalizeText(phone)
    });

    res.json(newUser);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error creating user" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { name, username, password, vehicleNumber, address, phone } = req.body || {};

    const updateData = {
      name: normalizeText(name),
      username: normalizeText(username),
      vehicleNumber: normalizeText(vehicleNumber),
      address: normalizeText(address),
      phone: normalizeText(phone)
    };

    if (password && String(password).trim() !== "") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error updating user" });
  }
});

app.patch("/api/users/:id/toggle", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.active = !user.active;
    await user.save();

    res.json(user);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error toggling user" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error deleting user" });
  }
});

/* =========================
   GET DRIVERS
========================= */
app.get("/api/drivers", async (req, res) => {
  try {
    const drivers = await User.find({
      role: "driver",
      active: true
    }).sort({ name: 1 });

    res.json(drivers);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading drivers" });
  }
});

/* =========================
   CREATE TRIP
========================= */
app.post("/api/trips", async (req, res) => {
  try {
    const type = normalizeTripType(req.body.type);
    const tripNumber = await generateTripNumber(type);

    const pickup = normalizeText(req.body.pickup);
    const dropoff = normalizeText(req.body.dropoff);

    const trip = await Trip.create({
      type,
      tripNumber,

      company: normalizeText(req.body.company),

      entryName: normalizeText(req.body.entryName),
      entryPhone: normalizeText(req.body.entryPhone),

      clientName: normalizeText(req.body.clientName),
      clientPhone: normalizeText(req.body.clientPhone),

      pickup,
      dropoff,
      stops: parseStops(req.body.stops),

      pickupLat: normalizeNumber(req.body.pickupLat),
      pickupLng: normalizeNumber(req.body.pickupLng),
      dropoffLat: normalizeNumber(req.body.dropoffLat),
      dropoffLng: normalizeNumber(req.body.dropoffLng),
      stopCoords: parseStopCoords(req.body.stopCoords),

      tripDate: normalizeText(req.body.tripDate),
      tripTime: normalizeText(req.body.tripTime),

      notes: normalizeText(req.body.notes),
      status: normalizeText(req.body.status) || "Booked",
      bookedAt: req.body.bookedAt || new Date(),
      createdAt: new Date()
    });

    await ensureTripCoords(trip);

    res.status(200).json(trip);
  } catch (err) {
    console.log(err);

    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Duplicate trip number" });
    }

    res.status(500).json({ message: "Error creating trip" });
  }
});

/* =========================
   GET ALL TRIPS
========================= */
app.get("/api/trips", async (req, res) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1, _id: -1 });
    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   GET ALL TRIPS FOR HUB
========================= */
app.get("/api/trips/company", async (req, res) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1, _id: -1 });
    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   GET COMPANY TRIPS ONLY
========================= */
app.get("/api/trips/company/:company", async (req, res) => {
  try {
    const trips = await Trip.find({
      company: req.params.company
    }).sort({ createdAt: -1, _id: -1 });

    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   GET ONE TRIP
========================= */
app.get("/api/trips/:id", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trip" });
  }
});

/* =========================
   UPDATE TRIP
========================= */
app.put("/api/trips/:id", async (req, res) => {
  try {
    const existing = await Trip.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const updateData = {
      type: normalizeTripType(req.body.type || existing.type),
      company: req.body.company ?? existing.company,

      entryName: req.body.entryName ?? existing.entryName,
      entryPhone: req.body.entryPhone ?? existing.entryPhone,

      clientName: req.body.clientName ?? existing.clientName,
      clientPhone: req.body.clientPhone ?? existing.clientPhone,

      pickup: req.body.pickup ?? existing.pickup,
      dropoff: req.body.dropoff ?? existing.dropoff,
      stops: Array.isArray(req.body.stops) ? parseStops(req.body.stops) : existing.stops,

      pickupLat: req.body.pickupLat !== undefined ? normalizeNumber(req.body.pickupLat) : existing.pickupLat,
      pickupLng: req.body.pickupLng !== undefined ? normalizeNumber(req.body.pickupLng) : existing.pickupLng,
      dropoffLat: req.body.dropoffLat !== undefined ? normalizeNumber(req.body.dropoffLat) : existing.dropoffLat,
      dropoffLng: req.body.dropoffLng !== undefined ? normalizeNumber(req.body.dropoffLng) : existing.dropoffLng,
      stopCoords: Array.isArray(req.body.stopCoords) ? parseStopCoords(req.body.stopCoords) : existing.stopCoords,

      tripDate: req.body.tripDate ?? existing.tripDate,
      tripTime: req.body.tripTime ?? existing.tripTime,

      notes: req.body.notes ?? existing.notes,

      dispatchSelected: req.body.dispatchSelected ?? existing.dispatchSelected,
      disabled: req.body.disabled ?? existing.disabled,

      driverId: req.body.driverId ?? existing.driverId,
      driverName: req.body.driverName ?? existing.driverName,
      vehicle: req.body.vehicle ?? existing.vehicle,
      driverAddress: req.body.driverAddress ?? existing.driverAddress,
      dispatchNote: req.body.dispatchNote ?? existing.dispatchNote,

      status: req.body.status ?? existing.status,
      bookedAt: req.body.bookedAt ?? existing.bookedAt
    };

    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    await ensureTripCoords(updated);

    res.json(updated);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error updating trip" });
  }
});

/* =========================
   DELETE TRIP
========================= */
app.delete("/api/trips/:id", async (req, res) => {
  try {
    const deleted = await Trip.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Trip not found" });
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error deleting trip" });
  }
});

/* =========================
   DISPATCH API
========================= */

/* الرحلات المختارة للديسبتش + السواقين + الشيدول + اللايف */
app.get("/api/dispatch", async (req, res) => {
  try {
    const rawTrips = await Trip.find({
      dispatchSelected: true,
      disabled: false
    })
      .sort({ tripDate: 1, tripTime: 1, createdAt: 1 })
      .lean();

    const rawDrivers = await User.find({
      role: "driver",
      active: true
    })
      .sort({ name: 1 })
      .lean();

    const scheduleRows = await DriverSchedule.find().lean();
    const schedule = {};

    for (const r of scheduleRows) {
      const id = String(r.driverId || "").trim();
      if (!id) continue;

      schedule[id] = {
        phone: normalizeText(r.phone),
        address: normalizeText(r.address),
        lat: normalizeNumber(r.lat),
        lng: normalizeNumber(r.lng),
        vehicleNumber: normalizeText(r.vehicleNumber),
        enabled: r.enabled === true,
        days: r.days || {}
      };
    }

    /* فلترة السواقين:
       لازم يكون active في users
       وكمان enabled في driver schedule لو موجود
    */
    const filteredDrivers = rawDrivers.filter(driver => {
      const driverId = String(driver._id || "").trim();
      const s = schedule[driverId];

      if (!s) return true;
      return s.enabled === true;
    });

    const liveDriversArr = getFreshLiveDriversArray();

    const drivers = filteredDrivers.map(driver => {
      const driverId = String(driver._id || "").trim();
      const s = schedule[driverId] || {};
      const live = liveDriversArr.find(
        ld => String(ld.driverId || "").trim() === driverId
      );

      return {
        ...driver,
        _id: driverId,
        address: buildDriverAddress(driver, s),
        lat: normalizeNumber(s.lat),
        lng: normalizeNumber(s.lng),
        vehicleNumber: buildDriverVehicle(driver, s),
        phone: buildDriverPhone(driver, s),

        /* live data */
        liveLat: live?.lat ?? null,
        liveLng: live?.lng ?? null,
        liveTime: live?.time ?? null,
        liveName: live?.name ?? ""
      };
    });

    /* SMART AUTO ASSIGN */
    const assignedTrips = await autoAssignTrips({
      trips: rawTrips,
      drivers,
      schedule
    });

    await persistAssignedTrips(assignedTrips);

    res.json({
      trips: assignedTrips,
      drivers,
      schedule,
      liveDrivers: liveDriversArr
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Dispatch load error" });
  }
});

/* إرسال الرحلات المختارة */
app.patch("/api/dispatch/send", async (req, res) => {
  try {
    const ids = req.body.ids || [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No trips selected" });
    }

    const result = await Trip.updateMany(
      { _id: { $in: ids } },
      { status: "Dispatched" }
    );

    res.json({ status: "ok", updated: result.modifiedCount });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Dispatch update error" });
  }
});

/* حفظ نوت */
app.patch("/api/dispatch/:id/note", async (req, res) => {
  try {
    const note = normalizeText(req.body.note);

    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      {
        notes: note,
        dispatchNote: note
      },
      { new: true }
    );

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Note save error" });
  }
});

/* تعيين سواق يدوي */
app.patch("/api/dispatch/:id/driver", async (req, res) => {
  try {
    const { driverId } = req.body || {};
    const safeDriverId = String(driverId || "").trim();

    if (!safeDriverId) {
      return res.status(400).json({ message: "Driver ID required" });
    }

    const driver = await User.findById(safeDriverId);

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    if (driver.role !== "driver") {
      return res.status(400).json({ message: "User is not a driver" });
    }

    if (!driver.active) {
      return res.status(400).json({ message: "Driver is disabled" });
    }

    const driverSchedule = await DriverSchedule.findOne({
      driverId: String(driver._id).trim()
    }).lean();

    if (driverSchedule && driverSchedule.enabled !== true) {
      return res.status(400).json({ message: "Driver disabled in schedule" });
    }

    const safeSchedule = driverSchedule
      ? await ensureDriverScheduleCoords(String(driver._id), {
          phone: normalizeText(driverSchedule.phone),
          address: normalizeText(driverSchedule.address),
          lat: normalizeNumber(driverSchedule.lat),
          lng: normalizeNumber(driverSchedule.lng),
          vehicleNumber: normalizeText(driverSchedule.vehicleNumber),
          enabled: driverSchedule.enabled === true,
          days: driverSchedule.days || {}
        })
      : null;

    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      {
        driverId: String(driver._id).trim(),
        driverName: normalizeText(driver.name),
        vehicle: buildDriverVehicle(driver, safeSchedule),
        driverAddress: buildDriverAddress(driver, safeSchedule),
        status: "Driver Assigned"
      },
      { new: true }
    );

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Driver assign error" });
  }
});

/* =========================
   LIVE DRIVER TRACKING
========================= */
app.post("/api/driver/location", (req, res) => {
  try {
    const { driverId, name, lat, lng } = req.body || {};

    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "missing location data" });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ message: "invalid coordinates" });
    }

    const key = String(driverId || name || "").trim();
    if (!key) {
      return res.status(400).json({ message: "missing driver key" });
    }

    liveDrivers.set(key, {
      driverId: String(driverId || "").trim(),
      name: normalizeText(name),
      lat: latNum,
      lng: lngNum,
      time: Date.now()
    });

    res.json({ status: "ok" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "location save error" });
  }
});

app.get("/api/admin/live-drivers", (req, res) => {
  try {
    const drivers = getFreshLiveDriversArray();
    res.json(drivers);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "live drivers load error" });
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