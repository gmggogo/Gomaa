const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* =========================
   STATIC FILES
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   DATA DIRECTORY
========================= */
const DATA_DIR = "/var/data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* =========================
   USERS DB
========================= */
const USERS_DB = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(USERS_DB)) {
  fs.writeFileSync(USERS_DB, JSON.stringify([]));
}

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_DB, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_DB, JSON.stringify(users, null, 2));
}

/* =========================
   TRIPS DB
========================= */
const TRIPS_DB = path.join(DATA_DIR, "trips.json");

if (!fs.existsSync(TRIPS_DB)) {
  fs.writeFileSync(TRIPS_DB, JSON.stringify([]));
}

function readTrips() {
  return JSON.parse(fs.readFileSync(TRIPS_DB, "utf8"));
}

function saveTrips(trips) {
  fs.writeFileSync(TRIPS_DB, JSON.stringify(trips, null, 2));
}

/* =========================
   LOCATIONS DB
========================= */
const LOCATION_DB = path.join(DATA_DIR, "locations.json");

if (!fs.existsSync(LOCATION_DB)) {
  fs.writeFileSync(LOCATION_DB, JSON.stringify({}));
}

function readLocations() {
  return JSON.parse(fs.readFileSync(LOCATION_DB, "utf8"));
}

function saveLocations(data) {
  fs.writeFileSync(LOCATION_DB, JSON.stringify(data, null, 2));
}

/* =========================
   ADMIN USERS API
========================= */
app.get("/api/admin/users", (req, res) => {
  const role = req.query.role;
  const users = readUsers();
  const filtered = role ? users.filter(u => u.role === role) : users;
  res.json(filtered);
});

app.post("/api/admin/users", (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const users = readUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newUser = {
    id: Date.now(),
    name,
    username,
    password,
    role,
    active: true
  };

  users.push(newUser);
  saveUsers(users);

  res.json(newUser);
});

app.put("/api/admin/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const users = readUsers();
  const user = users.find(u => u.id === id);

  if (!user) return res.status(404).json({ error: "User not found" });

  if (req.body.name) user.name = req.body.name;
  if (req.body.username) user.username = req.body.username;
  if (typeof req.body.active === "boolean") user.active = req.body.active;

  saveUsers(users);
  res.json(user);
});

app.delete("/api/admin/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const users = readUsers().filter(u => u.id !== id);
  saveUsers(users);
  res.json({ success: true });
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) return res.status(401).json({ success: false });

  res.json({
    success: true,
    username: user.username,
    role: user.role,
    name: user.name
  });
});

/* =========================
   DRIVER LOCATION
========================= */
app.post("/api/driver/location", (req, res) => {
  const { name, lat, lng } = req.body;

  if (!name || !lat || !lng) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const locations = readLocations();

  locations[name] = {
    name,
    lat,
    lng,
    updated: Date.now()
  };

  saveLocations(locations);

  res.json({ success: true });
});

app.get("/api/admin/live-drivers", (req, res) => {
  const locations = readLocations();
  const now = Date.now();

  const active = Object.values(locations).filter(
    d => now - d.updated < 30000
  );

  res.json(active);
});

/* =========================
   TRIPS
========================= */
app.get("/api/trips", (req, res) => {
  const trips = readTrips();
  res.json(trips);
});

app.post("/api/trips", (req, res) => {
  const data = req.body;

  if (!data || !data.tripNumber) {
    return res.status(400).json({ error: "Missing tripNumber" });
  }

  const trips = readTrips();
  trips.unshift(data);
  saveTrips(trips);

  res.json({ success: true });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam server running on port", PORT);
});