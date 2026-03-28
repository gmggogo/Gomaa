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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
});

/* INDEXES */
tripSchema.index({ tripNumber: 1 }, { unique: true, sparse: true });
tripSchema.index({ company: 1 });
tripSchema.index({ createdAt: -1 });

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
}, { timestamps: true });

const DriverSchedule = mongoose.model("DriverSchedule", driverScheduleSchema);

/* =========================
   LIVE DRIVER TRACKING
========================= */
const liveDrivers = new Map();

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

function getFreshLiveDriversArray() {
  const now = Date.now();
  const maxAge = 1000 * 60 * 5;

  return Array.from(liveDrivers.values()).filter(driver => {
    return now - driver.time <= maxAge;
  });
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
        phone: r.phone || "",
        address: r.address || "",
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        vehicleNumber: r.vehicleNumber || "",
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
          phone: s.phone || "",
          address: s.address || "",
          lat: s.lat !== undefined && s.lat !== null && s.lat !== "" ? Number(s.lat) : null,
          lng: s.lng !== undefined && s.lng !== null && s.lng !== "" ? Number(s.lng) : null,
          vehicleNumber: s.vehicleNumber || "",
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
    const { name, username, password, vehicleNumber, address, phone } = req.body || {};

    if (!["admin", "dispatcher", "driver", "company"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!name || !username || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await User.findOne({ username });

    if (exists) {
      return res.status(400).json({ message: "Username exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      username,
      password: hashed,
      role,
      vehicleNumber: vehicleNumber || "",
      address: address || "",
      phone: phone || ""
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
      name,
      username,
      vehicleNumber,
      address,
      phone
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

    const trip = await Trip.create({
      type,
      tripNumber,

      company: req.body.company || "",

      entryName: req.body.entryName || "",
      entryPhone: req.body.entryPhone || "",

      clientName: req.body.clientName || "",
      clientPhone: req.body.clientPhone || "",

      pickup: req.body.pickup || "",
      dropoff: req.body.dropoff || "",
      stops: Array.isArray(req.body.stops) ? req.body.stops : [],

      tripDate: req.body.tripDate || "",
      tripTime: req.body.tripTime || "",

      notes: req.body.notes || "",
      status: req.body.status || "Booked",
      bookedAt: req.body.bookedAt || new Date(),
      createdAt: new Date()
    });

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
      stops: Array.isArray(req.body.stops) ? req.body.stops : existing.stops,

      tripDate: req.body.tripDate ?? existing.tripDate,
      tripTime: req.body.tripTime ?? existing.tripTime,

      notes: req.body.notes ?? existing.notes,

      dispatchSelected: req.body.dispatchSelected ?? existing.dispatchSelected,
      disabled: req.body.disabled ?? existing.disabled,

      status: req.body.status ?? existing.status,
      bookedAt: req.body.bookedAt ?? existing.bookedAt
    };

    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

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
    const trips = await Trip.find({
      dispatchSelected: true,
      disabled: false
    })
      .sort({ tripDate: 1, tripTime: 1 })
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
        phone: r.phone || "",
        address: r.address || "",
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        vehicleNumber: r.vehicleNumber || "",
        enabled: r.enabled === true,
        days: r.days || {}
      };
    }

    const liveDriversArr = getFreshLiveDriversArray();

    const drivers = rawDrivers.map(driver => {
      const driverId = String(driver._id || "").trim();
      const s = schedule[driverId] || {};
      const live = liveDriversArr.find(
        ld => String(ld.driverId || "").trim() === driverId
      );

      return {
        ...driver,
        _id: driverId,
        address:
          (s.address && s.address.trim() !== "")
            ? s.address
            : (driver.address || ""),
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        vehicleNumber:
          (s.vehicleNumber && s.vehicleNumber.trim() !== "")
            ? s.vehicleNumber
            : (driver.vehicleNumber || ""),
        phone:
          (s.phone && s.phone.trim() !== "")
            ? s.phone
            : (driver.phone || ""),

        /* live data */
        liveLat: live?.lat ?? null,
        liveLng: live?.lng ?? null,
        liveTime: live?.time ?? null,
        liveName: live?.name ?? ""
      };
    });

    res.json({
      trips,
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
    const note = req.body.note || "";

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

/* تعيين سواق */
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

    const driverSchedule = await DriverSchedule.findOne({
      driverId: String(driver._id).trim()
    });

    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      {
        driverId: String(driver._id).trim(),
        driverName: driver.name || "",
        vehicle: driverSchedule?.vehicleNumber || driver.vehicleNumber || "",
        driverAddress: driverSchedule?.address || driver.address || "",
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

    liveDrivers.set(name, {
      driverId: String(driverId || "").trim(),
      name,
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