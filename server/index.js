/* =====================================================
   SUNBEAM TRANSPORTATION – SECURE SERVER
   VERSION 1.0 FINAL (ROLE BASED SECURITY)
===================================================== */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = "SUNBEAM_PRODUCTION_SECRET_CHANGE_THIS";

/* =========================
   ① MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   ② DATABASE SETUP
========================= */
const DATA_DIR = "/var/data";
const USERS_DB = path.join(DATA_DIR, "users.json");
const TRIPS_DB = path.join(DATA_DIR, "trips.json");
const LOCATION_DB = path.join(DATA_DIR, "locations.json");

function ensureFile(file, defaultValue) {
  if (!fs.existsSync(DATA_DIR))
    fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(file))
    fs.writeFileSync(file, JSON.stringify(defaultValue));
}

function readDB(file, def) {
  ensureFile(file, def);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveDB(file, data) {
  ensureFile(file, []);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* =========================
   ③ AUTH MIDDLEWARE
========================= */
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Access denied" });
    next();
  };
}

/* =========================
   ④ LOGIN SYSTEM
========================= */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const users = readDB(USERS_DB, []);

  const user = users.find(u => u.username === username && u.active);
  if (!user) return res.status(401).json({ success: false });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ success: false });

  const token = jwt.sign(
    { username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    success: true,
    token,
    username: user.username,
    role: user.role,
    name: user.name
  });
});

/* =========================
   ⑤ ADMIN USERS (ADMIN ONLY)
========================= */
app.get("/api/admin/users",
  auth,
  allowRoles("admin"),
  (req, res) => {

  const role = req.query.role;
  const users = readDB(USERS_DB, []);

  const filtered = role
    ? users.filter(u => u.role === role)
    : users;

  res.json(filtered.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active
  })));
});

app.post("/api/admin/users",
  auth,
  allowRoles("admin"),
  async (req, res) => {

  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role)
    return res.status(400).json({ error: "Missing fields" });

  const users = readDB(USERS_DB, []);

  if (users.find(u => u.username === username))
    return res.status(400).json({ error: "Username exists" });

  const hashed = await bcrypt.hash(password, 10);

  const newUser = {
    id: Date.now(),
    name,
    username,
    password: hashed,
    role,
    active: true
  };

  users.push(newUser);
  saveDB(USERS_DB, users);

  res.json({ success: true });
});

/* =========================
   ⑥ TRIPS SYSTEM
========================= */

/* COMPANY – See Own Trips */
app.get("/api/company/trips",
  auth,
  allowRoles("company"),
  (req, res) => {

  const trips = readDB(TRIPS_DB, []);
  const myTrips = trips.filter(t => t.company === req.user.username);
  res.json(myTrips);
});

/* DISPATCHER – See All Trips */
app.get("/api/dispatcher/trips",
  auth,
  allowRoles("dispatcher"),
  (req, res) => {

  const trips = readDB(TRIPS_DB, []);
  res.json(trips);
});

/* ADMIN – See All Trips */
app.get("/api/admin/trips",
  auth,
  allowRoles("admin"),
  (req, res) => {

  const trips = readDB(TRIPS_DB, []);
  res.json(trips);
});

/* COMPANY – Create Trip */
app.post("/api/company/trips",
  auth,
  allowRoles("company"),
  (req, res) => {

  const data = req.body;
  if (!data.tripNumber)
    return res.status(400).json({ error: "Missing tripNumber" });

  const trips = readDB(TRIPS_DB, []);

  trips.unshift({
    ...data,
    company: req.user.username,
    status: "Scheduled",
    createdAt: new Date().toISOString()
  });

  saveDB(TRIPS_DB, trips);
  res.json({ success: true });
});

/* =========================
   ⑦ DRIVER LIVE LOCATION
========================= */
app.post("/api/driver/location",
  auth,
  allowRoles("driver"),
  (req, res) => {

  const { lat, lng } = req.body;
  if (!lat || !lng)
    return res.status(400).json({ error: "Missing fields" });

  const locations = readDB(LOCATION_DB, {});

  locations[req.user.username] = {
    lat,
    lng,
    updated: Date.now()
  };

  saveDB(LOCATION_DB, locations);
  res.json({ success: true });
});

/* =========================
   ⑧ DASHBOARD STATS
========================= */
app.get("/api/company/dashboard",
  auth,
  allowRoles("company"),
  (req, res) => {

  const trips = readDB(TRIPS_DB, []);
  const myTrips = trips.filter(t => t.company === req.user.username);

  const today = new Date().toISOString().split("T")[0];

  const todayTrips = myTrips.filter(t => t.tripDate === today);

  res.json({
    totalToday: todayTrips.length,
    completed: todayTrips.filter(t => t.status === "Completed").length,
    noShow: todayTrips.filter(t => t.status === "No Show").length,
    cancelled: todayTrips.filter(t => t.status === "Cancelled").length
  });
});

/* =========================
   ⑨ SERVER START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam Secure Server Running on port", PORT);
});