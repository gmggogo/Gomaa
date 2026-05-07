require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const app = express();

/* =========================
   ENV
========================= */
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
   MIDDLEWARE (FINAL CLEAN)
========================= */

app.use(cors());

// 🔥 مهم: webhook قبل أي json
app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

  } catch (err) {
    console.log("❌ Webhook Error:", err.message);
    return res.sendStatus(400);
  }

  try {
    if (event.type === "payment_intent.succeeded") {

      const paymentIntent = event.data.object;
      const tripId = paymentIntent.metadata?.tripId;

      if (!tripId) return res.sendStatus(200);

      const trip = await Trip.findById(tripId);
      if (!trip) return res.sendStatus(200);

      if (trip.status === "Paid") return res.sendStatus(200);

      if (!trip.cancelToken) {
        trip.cancelToken = crypto.randomBytes(32).toString("hex");
      }

      trip.status = "Paid";
      trip.paymentIntentId = paymentIntent.id;
      trip.dispatchSelected = true;

      await trip.save();

      console.log("✅ Trip Paid:", trip.tripNumber);
    }

    res.sendStatus(200);

  } catch (err) {
    console.log("🔥 Webhook Processing Error:", err);
    res.sendStatus(500);
  }
});

// ✅ باقي الميدل وير
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));/* =========================
   PUBLIC CONFIG - GOOGLE KEY
========================= */
app.get("/api/config", (req, res) => {
  res.json({
    googleKey: process.env.GOOGLE_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

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
   TRIP MODEL (FINAL PRO VERSION + SHARED SUPPORT)
========================= */
const tripSchema = new mongoose.Schema({

  tripNumber: { type: String, unique: true, sparse: true },

  type: { type: String, default: "company" },
  company: { type: String, default: "" },

  entryName: { type: String, default: "" },
  entryPhone: { type: String, default: "" },

  clientName: { type: String, default: "" },
  clientPhone: { type: String, default: "" },

  // 💰 PRICE
  clientEmail: { type: String, default: "" },

  priceAmount: { type: Number, default: 0 },

  // 🚗 ROUTE DATA
  miles: { type: Number, default: 0 },

  estimatedMinutes: { type: Number, default: 0 },

  durationSeconds: { type: Number, default: 0 },

  distanceMeters: { type: Number, default: 0 },

  googleRoute: {
    type: Object,
    default: {}
  },

  finalPrice: { type: Number, default: 0 },
  isFinalized: { type: Boolean, default: false },

  // 🚗 VEHICLE
  vehicleTypeFromQuote: { type: String, default: "X" },

  // 📍 LOCATIONS
  pickup: { type: String, default: "" },
  dropoff: { type: String, default: "" },
  stops: { type: [String], default: [] },

  // 📍 COORDINATES
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

  /* =========================
     🔥 SHARED SUPPORT (IMPORTANT)
  ========================= */

  isShared: { type: Boolean, default: false },

  // 🔗 بيربط كل الركاب في نفس الرحلة
  groupId: { type: String, default: "" },

  // نوع الرحلة
  tripType: {
    type: String,
    enum: ["INDIVIDUAL", "SHARED"],
    default: "INDIVIDUAL"
  },

  // suffix يظهر في الرقم
  sharedSuffix: { type: String, default: "" },

  // ترتيب الراكب داخل الشير
  passengerIndex: { type: Number, default: 0 },

  // عدد الركاب في الجروب
  totalPassengers: { type: Number, default: 1 },

  /* =========================
     🧍 PASSENGERS (🔥 أهم إضافة)
  ========================= */

  passengers: {
    type: [
      {
        passengerId: { type: String, default: "" },

        name: { type: String, default: "" },
        phone: { type: String, default: "" },

        clientName: { type: String, default: "" },
        clientPhone: { type: String, default: "" },

        pickup: { type: String, default: "" },
        dropoff: { type: String, default: "" },

        pickupLat: { type: Number, default: null },
        pickupLng: { type: Number, default: null },
        dropoffLat: { type: Number, default: null },
        dropoffLng: { type: Number, default: null },

        status: { type: String, default: "Scheduled" },

        priceAmount: { type: Number, default: 0 }
      }
    ],
    default: []
  },

  /* =========================
     💳 PAYMENT
  ========================= */

  paymentIntentId: { type: String, default: "" },

  /* =========================
     🔗 CANCEL
  ========================= */

  cancelToken: { type: String, default: "" },

  /* =========================
     💰 REFUND SYSTEM
  ========================= */

  refundId: { type: String, default: "" },
  simpleRefundId: { type: String, default: "" },
  refundAmount: { type: Number, default: 0 },
  cancelFee: { type: Number, default: 0 },

  cancelDateTime: { type: Date, default: null },

  refundStatus: {
    type: String,
    enum: ["none", "processing", "refunded", "failed"],
    default: "none"
  },

  /* =========================
     📅 TIME
  ========================= */

  tripDate: { type: String, default: "" },
  tripTime: { type: String, default: "" },

  notes: { type: String, default: "" },

  /* =========================
     🚗 DISPATCH
  ========================= */

  dispatchSelected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },

  driverId: { type: String, default: "" },
  driverName: { type: String, default: "" },
  vehicle: { type: String, default: "" },
  driverAddress: { type: String, default: "" },
  dispatchNote: { type: String, default: "" },

  status: { type: String, default: "Scheduled" },

  /* =========================
     🔔 REMINDER
  ========================= */

  reminderSent: { type: Boolean, default: false },

  bookedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }

}, { minimize: false });

/* =========================
   INDEXES
========================= */
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
  if (t === "shared") return "shared";
  if (t === "quote") return "quote";

  return "company";
}

function normalizeText(v) {
  return String(v || "").trim();
}

/* =========================
   PRICE ENGINE
========================= */
function calculatePriceServer(trip) {

  const type = String(trip.tripType || trip.type || "").toLowerCase();
  const vehicleType = String(
    trip.vehicleType ||
    trip.vehicleTypeFromQuote ||
    trip.vehicle ||
    ""
  ).toUpperCase();

  const miles = Math.max(0, Number(trip.miles) || 0);
  const stopsCount = Array.isArray(trip.stops) ? trip.stops.length : 0;

  /* ================= GET QUOTE (X / XL) ================= */
  if (type === "quote" || vehicleType === "X" || vehicleType === "XL") {

    const STOP_PRICE = 5;

    if (vehicleType === "XL") {
      const BASE = 30;
      const INCLUDED = 5;
      const PER_MILE = 2.5;

      const extraMiles = Math.max(0, miles - INCLUDED);

      return Number(
        (BASE + (extraMiles * PER_MILE) + (stopsCount * STOP_PRICE)).toFixed(2)
      );
    }

    const BASE = 20;
    const INCLUDED = 5;
    const PER_MILE = 2;

    const extraMiles = Math.max(0, miles - INCLUDED);

    return Number(
      (BASE + (extraMiles * PER_MILE) + (stopsCount * STOP_PRICE)).toFixed(2)
    );
  }

  /* ================= COMPANY SHARED ================= */
  if (trip.isShared === true || type === "shared") {

    const passengersArr = Array.isArray(trip.passengers) ? trip.passengers : [];

    const activePassengers = passengersArr.filter(p => p.status !== "NoShow");
    const noShowPassengers = passengersArr.filter(p => p.status === "NoShow");

    const count = activePassengers.length;

    const BASE_PER_PERSON = 15;
    const INCLUDED_PER_PERSON = 3;
    const PER_MILE = 2;
    const STOP_PRICE = 5;
    const NO_SHOW = 15;

    if (count === 0) {
      return Number((noShowPassengers.length * NO_SHOW).toFixed(2));
    }

    const baseTotal = count * BASE_PER_PERSON;
    const includedMiles = count * INCLUDED_PER_PERSON;

    const extraMiles = Math.max(0, miles - includedMiles);
    const milesTotal = extraMiles * PER_MILE;

    const stopsTotal = Math.max(0, count - 1) * STOP_PRICE;
    const noShowTotal = noShowPassengers.length * NO_SHOW;

    const total = baseTotal + milesTotal + stopsTotal + noShowTotal;

    return Number(total.toFixed(2));
  }

  /* ================= COMPANY INDIVIDUAL ================= */

  const BASE = 20;
  const INCLUDED = 3;
  const PER_MILE = 2.5;
  const STOP_PRICE = 5;
  const NO_SHOW = 15;

  if (trip.status === "NoShow") {
    return NO_SHOW;
  }

  const extraMiles = Math.max(0, miles - INCLUDED);
  const milesTotal = extraMiles * PER_MILE;
  const stopsTotal = stopsCount * STOP_PRICE;

  return Number((BASE + milesTotal + stopsTotal).toFixed(2));
}


/* =========================
   FINAL PRICE (🔥 مهم جدًا)
========================= */
function calculateFinalPrice(trip){

  // 🚨 Cancel
  if (trip.status === "Cancelled") {
    return Number(trip.finalPrice || 0);
  }

  // 🚨 No Show
  if (trip.status === "NoShow") {
    return 15;
  }

  // ✅ Completed
  if (trip.status === "Completed") {

    // 🔥 أهم تعديل
    if (!trip.priceAmount || trip.priceAmount === 0) {
      return calculatePriceServer(trip);
    }

    return Number(trip.priceAmount);
  }

  return 0;
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

  let tripNumber = monthCode + "-" + next;

  if (type === "shared" || type === "SHARED") {
    tripNumber += "-SH";
  }

  return tripNumber;
}
/* =========================
   SMART DISPATCH ENGINE
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
   CREATE TRIP (FINAL + SHARED)
========================= */
app.post("/api/trips", async (req, res) => {
  try {

    const type = normalizeTripType(req.body.type);

    // 🔥 هل شيرد؟
    const isShared = req.body.isShared === true;

    // 🔥 رقم الرحلة (لو شيرد يضيف SH)
    const tripNumber = await generateTripNumber(
      isShared ? "shared" : type
    );

    const pickup = normalizeText(req.body.pickup);
    const dropoff = normalizeText(req.body.dropoff);

    const vehicleTypeFromQuote =
      ["X", "XL"].includes(req.body.vehicleTypeFromQuote)
        ? req.body.vehicleTypeFromQuote
        : "X";

    /* =========================
       🧠 SHARED DATA
    ========================= */

    let groupId = "";
    let passengers = [];
    let totalPassengers = 1;

    if (isShared) {
      groupId = "GR-" + Date.now();

      if (Array.isArray(req.body.passengers)) {
        passengers = req.body.passengers;
        totalPassengers = passengers.length;
      }
    }

    /* =========================
   🔴 SHARED CREATE (FINAL CLEAN)
========================= */

if (isShared && passengers.length > 0) {

  const groupId = "GR-" + Date.now();

  const trip = await Trip.create({

    type,
    tripNumber,

    // 🔥 SHARED
    isShared: true,
    groupId,
    tripType: "SHARED",
    sharedSuffix: "-SH",

    company: normalizeText(req.body.company),

    entryName: normalizeText(req.body.entryName),
    entryPhone: normalizeText(req.body.entryPhone),

    // 🔥 كل الركاب هنا
    passengers: passengers,

    totalPassengers: passengers.length,

    // 👇 عرض سريع
    clientName: "Shared Trip",
    clientPhone: "",

    // 👇 route
    pickup: passengers[0]?.pickup || "",
    dropoff: passengers[passengers.length - 1]?.dropoff || "",

    pickupLat: null,
    pickupLng: null,
    dropoffLat: null,
    dropoffLng: null,

    stops: [],
    stopCoords: [],

    tripDate: normalizeText(req.body.tripDate),
    tripTime: normalizeText(req.body.tripTime),

    notes: normalizeText(req.body.notes),

    priceAmount: 0,

    status: "Scheduled",

    createdAt: new Date()
  });

  await ensureTripCoords(trip);

  return res.status(200).json(trip);
}

    /* =========================
       🟢 INDIVIDUAL CREATE
    ========================= */

    const trip = await Trip.create({

      type,
      tripNumber,

      isShared: false,
      groupId: "",
      tripType: "INDIVIDUAL",

      company: normalizeText(req.body.company),

      entryName: normalizeText(req.body.entryName),
      entryPhone: normalizeText(req.body.entryPhone),

      clientName: normalizeText(req.body.clientName),
      clientPhone: normalizeText(req.body.clientPhone),

      priceAmount: Number(req.body.priceAmount || 0),
      clientEmail: normalizeText(req.body.clientEmail),

      vehicle: vehicleTypeFromQuote,

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
});/* =========================
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
   SUMMARY TRIPS (FINAL REAL)
========================= */
app.get("/api/trips/summary", async (req, res) => {
  try {

    const company = normalizeText(req.query.company || "");

const filter = {};

if (company) {

  filter.company = {
    $regex: "^" + company.trim() + "$",
    $options: "i"
  };

}

const trips = await Trip.find(filter)
  .sort({ tripDate: -1, tripTime: -1 })
  .lean();

    const result = [];

    for (const t of trips) {
console.log(
  "TRIP:",
  t.tripNumber,
  "STATUS:",
  t.status,
  "FINAL:",
  t.finalPrice
);
      // =========================
      // STATUS
      // =========================
      let status = String(t.status || "")
        .toLowerCase();

      if (status.includes("cancel")) {
        status = "Cancelled";
      }
      else if (
        status.includes("no")
      ) {
        status = "NoShow";
      }
      else if (
        status.includes("complete")
      ) {
        status = "Completed";
      }
      else {
        continue;
      }

      // =========================
      // MILES
      // =========================
      let miles = 0;

      if (t.miles && t.miles > 0) {

        miles = Number(t.miles);

      } else if (
        t.pickupLat &&
        t.pickupLng &&
        t.dropoffLat &&
        t.dropoffLng
      ) {

        miles =
          calcDistanceKm(
            t.pickupLat,
            t.pickupLng,
            t.dropoffLat,
            t.dropoffLng
          ) * 0.621371;

      }

      miles = Math.round(miles);

      // =========================
      // BOOKING DATE/TIME
      // =========================
      let bookingDate = "";
      let bookingTime = "";

      if (t.createdAt) {

        const d = new Date(t.createdAt);

        bookingDate =
          d.toLocaleDateString("en-US", {
            timeZone: "America/Phoenix"
          });

        bookingTime =
          d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Phoenix"
          });

      }

      // =========================
      // SHARED
      // =========================
      if (
        t.isShared &&
        Array.isArray(t.passengers)
      ) {

        const passengers =
          t.passengers.map(p => {

            let pStatus =
              String(
                p.status ||
                status
              ).toLowerCase();

            if (pStatus.includes("cancel")) {
              pStatus = "Cancelled";
            }
            else if (
              pStatus.includes("no")
            ) {
              pStatus = "NoShow";
            }
            else if (
              pStatus.includes("complete")
            ) {
              pStatus = "Completed";
            }
            else {
              pStatus = status;
            }

            let passengerPrice = 0;

            if (
              pStatus === "Cancelled"
            ) {
              passengerPrice = 15;
            }

            if (
              pStatus === "NoShow"
            ) {
              passengerPrice = 15;
            }

            return {

              clientName:
                p.clientName || "",

              clientPhone:
                p.clientPhone || "",

              pickup:
                p.pickup || "",

              dropoff:
                p.dropoff || "",

              status:
                pStatus,

              price:
                passengerPrice
            };

          });

        const total =
          passengers.reduce(
            (a,b)=>a+b.price,
            0
          );

        result.push({

          _id: t._id,

          isShared: true,

          tripNumber:
            t.tripNumber || "",

          company:
            t.company || "",

          entryName:
            t.entryName || "",

          entryPhone:
            t.entryPhone || "",

          tripDate:
            t.tripDate || "",

          tripTime:
            t.tripTime || "",

          bookingDate,
          bookingTime,

          miles,

          passengers,

          totalPassengers:
            passengers.length,

          totalPrice:
            total
        });

      }

      // =========================
      // INDIVIDUAL
      // =========================
      else {

        let finalPrice = 0;

        if (status === "Cancelled") {
          finalPrice = 15;
        }

        if (status === "NoShow") {
          finalPrice = 15;
        }

        result.push({

          _id: t._id,

          isShared: false,

          tripNumber:
            t.tripNumber || "",

          company:
            t.company || "",

          entryName:
            t.entryName || "",

          entryPhone:
            t.entryPhone || "",

          clientName:
            t.clientName || "",

          clientPhone:
            t.clientPhone || "",

          pickup:
            t.pickup || "",
stops:
  Array.isArray(t.stops)
    ? t.stops
    : [],
          dropoff:
            t.dropoff || "",

          tripDate:
            t.tripDate || "",

          tripTime:
            t.tripTime || "",

          bookingDate,
          bookingTime,

          miles,

          status,

          totalPrice:
            finalPrice
        });

      }

    }

    res.json(result);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "summary error"
    });

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
   UPDATE TRIP (FINAL CLEAN)
========================= */
app.put("/api/trips/:id", async (req, res) => {
  try {

    const existing = await Trip.findById(req.params.id);

    // 1️⃣ لو مش موجود
    if (!existing) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // 2️⃣ منع التعديل لو الرحلة خلصت أو اتلغت
    if (["Completed", "Cancelled"].includes(existing.status)) {
      return res.status(400).json({
        message: "Cannot edit completed or cancelled trip"
      });
    }
   

    /* =========================
       UPDATE DATA
    ========================= */
    const updateData = {

      // BASIC
      type: normalizeTripType(req.body.type || existing.type),
      company: req.body.company ?? existing.company,

      entryName: req.body.entryName ?? existing.entryName,
      entryPhone: req.body.entryPhone ?? existing.entryPhone,

      clientName: req.body.clientName ?? existing.clientName,
      clientPhone: req.body.clientPhone ?? existing.clientPhone,

      // LOCATIONS
      pickup: req.body.pickup ?? existing.pickup,
      dropoff: req.body.dropoff ?? existing.dropoff,

      stops: Array.isArray(req.body.stops)
        ? parseStops(req.body.stops)
        : existing.stops,

      pickupLat: req.body.pickupLat !== undefined
        ? normalizeNumber(req.body.pickupLat)
        : existing.pickupLat,

      pickupLng: req.body.pickupLng !== undefined
        ? normalizeNumber(req.body.pickupLng)
        : existing.pickupLng,

      dropoffLat: req.body.dropoffLat !== undefined
        ? normalizeNumber(req.body.dropoffLat)
        : existing.dropoffLat,

      dropoffLng: req.body.dropoffLng !== undefined
        ? normalizeNumber(req.body.dropoffLng)
        : existing.dropoffLng,

      stopCoords: Array.isArray(req.body.stopCoords)
        ? parseStopCoords(req.body.stopCoords)
        : existing.stopCoords,

      // PRICE
      priceAmount: req.body.priceAmount ?? existing.priceAmount,
      pricePerPassenger: req.body.pricePerPassenger ?? existing.pricePerPassenger,

      // ROUTE
      miles: req.body.miles ?? existing.miles,
      distanceMeters: req.body.distanceMeters ?? existing.distanceMeters,
      durationSeconds: req.body.durationSeconds ?? existing.durationSeconds,
      estimatedMinutes: req.body.estimatedMinutes ?? existing.estimatedMinutes,

      googleRoute:
  req.body.googleRoute !== undefined
    ? req.body.googleRoute
    : existing.googleRoute,

routePoints:
  req.body.routePoints !== undefined
    ? req.body.routePoints
    : existing.routePoints,

optimizedRoute:
  req.body.optimizedRoute !== undefined
    ? req.body.optimizedRoute
    : existing.optimizedRoute,

      // SHARED
      passengers: Array.isArray(req.body.passengers)
        ? req.body.passengers.map((p, i) => ({
            ...p,
            passengerId: p.passengerId || "P" + (i + 1)
          }))
        : existing.passengers,

      totalPassengers: req.body.totalPassengers ?? existing.totalPassengers,
      sharedStopsCount: req.body.sharedStopsCount ?? existing.sharedStopsCount,

      isShared: req.body.isShared ?? existing.isShared,
      tripType: req.body.tripType ?? existing.tripType,

      // TIME
      tripDate: req.body.tripDate ?? existing.tripDate,
      tripTime: req.body.tripTime ?? existing.tripTime,

      notes: req.body.notes ?? existing.notes,

      // DISPATCH
      dispatchSelected: req.body.dispatchSelected ?? existing.dispatchSelected,
      disabled: req.body.disabled ?? existing.disabled,

      driverId: req.body.driverId ?? existing.driverId,
      driverName: req.body.driverName ?? existing.driverName,
      vehicle: req.body.vehicle ?? existing.vehicle,
      driverAddress: req.body.driverAddress ?? existing.driverAddress,
      dispatchNote: req.body.dispatchNote ?? existing.dispatchNote,

      // STATUS
status: req.body.status ?? existing.status,
bookedAt: req.body.bookedAt ?? existing.bookedAt
};

// 🔥 FINAL PRICE LOGIC
if (updateData.status === "Cancelled") {

  const now = getArizonaTime();

  if (!updateData.tripDate || !updateData.tripTime) {
    updateData.finalPrice = 0;
    updateData.isFinalized = true;
  } else {

    const tripTimeRaw = new Date(`${updateData.tripDate}T${updateData.tripTime}:00`);

    const tripTime = new Date(
      tripTimeRaw.toLocaleString("en-US", { timeZone: "America/Phoenix" })
    );

    const diffMinutes = (tripTime - now) / 60000;

    let fee = 0;

    if (diffMinutes <= 120 && diffMinutes > 0) {
      fee = 15;
    }

    updateData.finalPrice = fee;
    updateData.isFinalized = true;
  }
}
    /* =========================
       CLEAN STOPS
    ========================= */
    updateData.stops = (updateData.stops || []).filter(s => s && s.trim() !== "");

    /* =========================
       SHARED FIX
    ========================= */
    if (updateData.isShared && Array.isArray(updateData.passengers)) {
      const p = updateData.passengers;
      if (p.length > 0) {
        updateData.pickup = p[0].pickup || updateData.pickup;
        updateData.dropoff = p[p.length - 1].dropoff || updateData.dropoff;
      }
    }

    /* =========================
       ROUTE FIX
    ========================= */
    if (updateData.googleRoute && Array.isArray(updateData.googleRoute.legs)) {
      const legs = updateData.googleRoute.legs;
      if (legs.length > 0) {
        updateData.pickup = legs[0].startAddress || updateData.pickup;
        updateData.dropoff = legs[legs.length - 1].endAddress || updateData.dropoff;
      }
    }

  
    /* =========================
       SAVE
    ========================= */
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

        liveLat: live?.lat ?? null,
        liveLng: live?.lng ?? null,
        liveTime: live?.time ?? null,
        liveName: live?.name ?? ""
      };
    });

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

app.patch("/api/dispatch/send", async (req, res) => {
  try {
    const ids = req.body.ids || [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No trips selected" });
    }

    const trips = await Trip.find({ _id: { $in: ids } });

    if (!trips.length) {
      return res.status(404).json({ message: "Trips not found" });
    }

    for (const t of trips) {
      if (!normalizeText(t.driverId)) {
        return res.status(400).json({
          message: `Trip ${t.tripNumber || t._id} has no driver assigned`
        });
      }
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
   DRIVER API
========================= */
app.get("/api/driver/my-trips/:driverId", async (req, res) => {
  try {
    const driverId = String(req.params.driverId || "").trim();

    if (!driverId) {
      return res.status(400).json({ message: "Driver ID required" });
    }

    const trips = await Trip.find({
      driverId: driverId,
      disabled: false,
      status: { $ne: "Cancelled" }
    }).sort({ tripDate: 1, tripTime: 1 });

    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Driver trips error" });
  }
});

app.patch("/api/driver/trips/:id/accept", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    trip.status = "Accepted";
    await trip.save();

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Accept trip error" });
  }
});

app.patch("/api/driver/trips/:id/start", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    trip.status = "On Trip";
    await trip.save();

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Start trip error" });
  }
});

app.patch("/api/driver/trips/:id/complete", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }
if (trip.isFinalized) {
  return res.json(trip);
}

   trip.status = "Completed";

// 🔥 احسب السعر النهائي
const final = calculateFinalPrice(trip);

// 🔥 لو priceAmount فاضي
if (!trip.priceAmount || trip.priceAmount === 0) {
  trip.priceAmount = final;
}

// 🔥 خزن النهائي
trip.finalPrice = final;
trip.isFinalized = true;

await trip.save();

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Complete trip error" });
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
   CREATE PAYMENT INTENT (STABLE)
========================= */
app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { tripId } = req.body;

    // تحقق
    if (!tripId) {
      return res.status(400).json({ message: "Missing tripId" });
    }

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // لو مدفوعة قبل كده
    if (trip.paymentIntentId) {
      return res.status(400).json({
        message: "Payment already created"
      });
    }

    const amount = Number(trip.priceAmount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // إنشاء الدفع (سحب فوري - زي سيستمك الحالي)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",

      automatic_payment_methods: {
        enabled: true
      },

      metadata: {
        tripId: trip._id.toString()
      }
    });

    // حفظ الربط
    trip.paymentIntentId = paymentIntent.id;

    await trip.save();

    res.json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {
    console.log("Stripe Error:", err);
    res.status(500).json({ message: "Payment error" });
  }
});

 /* =========================
   PAYMENT SUCCESS → SEND EMAIL + CANCEL LINK (FINAL)
========================= */
app.post("/api/payment-success", async (req, res) => {
  try {
    const { tripId, paymentIntentId } = req.body;

    if (!tripId) {
      return res.status(400).json({ message: "Missing tripId" });
    }

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // =========================
    // 🔐 CREATE CANCEL TOKEN
    // =========================

    if (!trip.cancelToken) {
      trip.cancelToken = crypto.randomBytes(32).toString("hex");
    }

    // =========================
    // 💳 SAVE PAYMENT
    // =========================
    trip.paymentIntentId = paymentIntentId || "";
    trip.status = "Paid";
    trip.dispatchSelected = true;

    await trip.save();

    console.log("✅ Payment saved:", paymentIntentId);

    // =========================
    // 🔥 CORRECT CANCEL LINK
    // =========================
    const cancelLink = `https://sunbeam-933q.onrender.com/booking/cancel.html?token=${trip.cancelToken}`;

    // =========================
    // 📧 SEND EMAIL (SAFE MODE)
    // =========================
    if (trip.clientEmail) {

      try {

        await transporter.sendMail({
          from: `"Sunbeam Transportation" <${process.env.EMAIL_USER}>`,
          to: trip.clientEmail,
          subject: "Booking Confirmation",

          html: `
            <h2>Payment Successful ✅</h2>
            <p>Your trip is confirmed.</p>

            <hr/>

            <p><b>Trip Number:</b> ${trip.tripNumber}</p>
            <p><b>Pickup:</b> ${trip.pickup}</p>
            <p><b>Dropoff:</b> ${trip.dropoff}</p>
            <p><b>Date:</b> ${trip.tripDate}</p>
            <p><b>Time:</b> ${trip.tripTime}</p>
            <p><b>Vehicle Type:</b> ${trip.vehicle || "X"}</p>

            <p><b>Amount Paid:</b> $${trip.priceAmount}</p>

            <hr/>

            <h3>Cancel your trip</h3>

            <p style="color:red;">
              Free cancellation up to 2 hours before trip time.<br/>
              After that, $15 fee will apply.
            </p>

            <a href="${cancelLink}" style="
              display:inline-block;
              padding:14px 22px;
              background:#dc2626;
              color:#fff;
              text-decoration:none;
              border-radius:10px;
              font-weight:bold;
              font-size:16px;
            ">
              Cancel Trip
            </a>

            <hr/>

            <p>Thank you for choosing Sunbeam Transportation 🚗</p>
          `
        });

        console.log("📧 Email sent:", trip.clientEmail);

      } catch (emailErr) {
        console.log("❌ EMAIL ERROR:", emailErr.message);
      }
    }

    // =========================
    // RESPONSE
    // =========================
    res.json({ success: true });

  } catch (err) {
    console.log("🔥 SERVER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

 /* =========================
   CANCEL TRIP + REFUND (FINAL FIXED)
========================= */
app.post("/api/cancel-trip", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Missing token" });
    }

    const trip = await Trip.findOne({ cancelToken: token });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // لو متكنسلة قبل كده
    if (trip.status === "Cancelled") {
      return res.json({
        success: true,
        refund: trip.refundAmount || 0,
        fee: trip.cancelFee || 0,
        refundId: trip.simpleRefundId || "",
        refundStatus: trip.refundStatus || "none"
      });
    }

    // ⏰ Arizona Time
    function getArizonaNow() {
      return new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
      );
    }

    const now = getArizonaNow();

    // 🔥 FIX TIMEZONE (أهم تعديل)
    const tripTimeRaw = new Date(`${trip.tripDate}T${trip.tripTime}:00`);

    const tripTime = new Date(
      tripTimeRaw.toLocaleString("en-US", { timeZone: "America/Phoenix" })
    );

    if (isNaN(tripTime.getTime())) {
      return res.status(400).json({ message: "Invalid trip time" });
    }

    const diffMinutes = (tripTime - now) / 60000;

    const totalAmount = Number(trip.priceAmount || 0);
    let refundAmount = 0;
    let fee = 0;

    if (diffMinutes > 120) {
      refundAmount = totalAmount;
    } else {
      fee = 15;
      refundAmount = totalAmount - fee;
      if (refundAmount < 0) refundAmount = 0;
    }

    const simpleRefundId = "RF-" + (trip.tripNumber || "0000");

    // =========================
    // 🔥 SAVE BEFORE STRIPE
    // =========================
    trip.status = "Cancelled";

trip.cancelDateTime = new Date();

trip.cancelFee = fee;

trip.finalPrice = fee;

trip.isFinalized = true;

trip.refundAmount = refundAmount;

trip.simpleRefundId = simpleRefundId;
    // أول حالة
    trip.refundStatus = refundAmount > 0 ? "processing" : "none";

    await trip.save(); // 🔥 مهم جدًا

    // =========================
    // 💳 STRIPE REFUND
    // =========================
    let stripeRefundId = null;

    if (trip.paymentIntentId && refundAmount > 0 && !trip.refundId) {
      try {

        const refund = await stripe.refunds.create({
          payment_intent: trip.paymentIntentId,
          amount: Math.round(refundAmount * 100)
        });

        stripeRefundId = refund.id;

        trip.refundStatus = "refunded";

      } catch (err) {

        console.log("Stripe Refund Error:", err.message);

        trip.refundStatus = "failed";
      }
    }

    trip.refundId = stripeRefundId || trip.refundId;

    await trip.save(); // 🔥 save تاني بعد Stripe

    // =========================
    // 📧 EMAIL
    // =========================
    if (trip.clientEmail) {
      try {

        let refundSection = "";

        if (refundAmount > 0) {
          refundSection = `
            <p><b>Refund Amount:</b> $${refundAmount.toFixed(2)}</p>
            <p><b>Refund ID:</b> ${simpleRefundId}</p>
            <p style="color:green;">
              Your refund is being processed.<br/>
              It may take 5–10 business days.
            </p>
          `;
        } else {
          refundSection = `
            <p style="color:red;">
              Cancelled within 2 hours.<br/>
              $15 fee applied.<br/>
              No refund available.
            </p>
          `;
        }

        await transporter.sendMail({
          from: `"Sunbeam Transportation" <${process.env.EMAIL_USER}>`,
          to: trip.clientEmail,
          subject: "Trip Cancelled & Refund Update",
          html: `
            <h2>Trip Cancelled ❌</h2>

            <p>Your trip has been cancelled.</p>

            <hr/>

            <p><b>Trip #:</b> ${trip.tripNumber}</p>
            <p><b>Pickup:</b> ${trip.pickup}</p>
            <p><b>Dropoff:</b> ${trip.dropoff}</p>
            <p><b>Date:</b> ${trip.tripDate}</p>
            <p><b>Time:</b> ${trip.tripTime}</p>

            <hr/>

            <h3>Refund Status</h3>

            ${refundSection}

            <hr/>

            <p>Sunbeam Transportation 🚗</p>
          `
        });

      } catch (emailErr) {
        console.log("EMAIL ERROR:", emailErr.message);
      }
    }

    // =========================
    // RESPONSE
    // =========================
    res.json({
      success: true,
      refund: refundAmount,
      fee: fee,
      refundId: simpleRefundId,
      refundStatus: trip.refundStatus
    });

  } catch (err) {
  console.log("🔥 CANCEL ERROR FULL:", err);

  res.status(500).json({
    message: err.message || "Server error",
    error: err.toString()
  });
}

}); // 🔥🔥🔥 مهم جدًا

/* =========================
   CHECK CANCEL TOKEN (FINAL FIX - TIME SAFE)
========================= */
app.post("/api/cancel-trip-check", async (req, res) => {
  try {

    const token = req.body?.token || req.query?.token;

    if (!token) {
      return res.status(400).json({ message: "Missing token" });
    }

    const trip = await Trip.findOne({ cancelToken: token });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // ⏰ Arizona time
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
    );

    let fee = 0;

    if (trip.tripDate && trip.tripTime) {

      // 🔥 FIX TIMEZONE
      const tripTimeRaw = new Date(`${trip.tripDate}T${trip.tripTime}:00`);

      const tripTime = new Date(
        tripTimeRaw.toLocaleString("en-US", { timeZone: "America/Phoenix" })
      );

      if (isNaN(tripTime.getTime())) {
        return res.status(400).json({ message: "Invalid trip time" });
      }

      const diffMinutes = (tripTime - now) / 60000;
if (diffMinutes <= 1) {
  return res.status(400).json({
    message: "Trip already started or expired"
  });
}

      // 🔴 لو الرحلة فاتت → الكنسلة مقفولة
      if (diffMinutes <= 0) {
        return res.json({
          success: false,
          expired: true,
          message: "Trip already started or expired"
        });
      }

      // ⏰ أقل من ساعتين → في fee
      if (diffMinutes <= 120) {
        fee = 15;
      }
    }

    res.json({
      success: true,
      tripNumber: trip.tripNumber,
      clientName: trip.clientName,
      tripDate: trip.tripDate,
      tripTime: trip.tripTime,
      status: trip.status,
      fee: fee,
      alreadyCancelled: trip.status === "Cancelled"
    });

  } catch (err) {
    console.log("CHECK ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   GET REFUNDS
========================= */
app.get("/api/refunds", async (req, res) => {
  try {
    const refunds = await Trip.find({
      status: "Cancelled"
    })
    .sort({ createdAt: -1 })
    .lean();

    res.json(refunds);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading refunds" });
  }
});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

 /* =========================
   TRIP REMINDER (FINAL FIXED 100%)
========================= */
setInterval(async () => {
  try {

    // ⏰ Arizona Time
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
    );

    const trips = await Trip.find({
      reminderSent: false,
      clientEmail: { $ne: "" },
      status: { $ne: "Cancelled" }
    });

    for (const trip of trips) {

      if (!trip.tripDate || !trip.tripTime) continue;

      // ✅ FIX TIME (بدون T)
      const tripTime = new Date(`${trip.tripDate} ${trip.tripTime}`);

      if (isNaN(tripTime.getTime())) continue;

      const diffMinutes = (tripTime - now) / 60000;

      console.log("CHECK:", trip.tripNumber, diffMinutes);

      // ✅ الحل النهائي (مش هيفوت)
      if (diffMinutes <= 120 && diffMinutes > 0) {

        // 🔒 lock
        const locked = await Trip.findOneAndUpdate(
          { _id: trip._id, reminderSent: false },
          { reminderSent: true },
          { new: true }
        );

        if (!locked) continue;

        console.log("🔥 SENDING REMINDER:", trip.tripNumber);

        try {

          await transporter.sendMail({
            from: `"Sunbeam Transportation" <${process.env.EMAIL_USER}>`,
            to: trip.clientEmail,
            subject: "Trip Reminder ⏰",
            html: `
              <h2>Reminder 🚗</h2>
              <p>Your trip is in less than 2 hours.</p>

              <hr/>

              <p><b>Trip #:</b> ${trip.tripNumber}</p>
              <p><b>Pickup:</b> ${trip.pickup}</p>
              <p><b>Dropoff:</b> ${trip.dropoff}</p>
              <p><b>Date:</b> ${trip.tripDate}</p>
              <p><b>Time:</b> ${trip.tripTime}</p>

              <hr/>

              <p>Sunbeam Transportation 🚗</p>
            `
          });

          console.log("✅ Reminder sent:", trip.tripNumber);

        } catch (err) {
          console.log("❌ Email error:", err.message);
        }
      }
    }

  } catch (err) {
    console.log("🔥 Reminder error:", err.message);
  }

}, 60000);

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});