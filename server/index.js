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
   DATABASE (users.json)
========================= */
const USERS_DB = "/var/data/users.json";

function ensureUsersDB() {
  const dir = "/var/data";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_DB))
    fs.writeFileSync(USERS_DB, JSON.stringify([]));
}

function readUsers() {
  ensureUsersDB();
  return JSON.parse(fs.readFileSync(USERS_DB, "utf8"));
}

function saveUsers(users) {
  ensureUsersDB();
  fs.writeFileSync(USERS_DB, JSON.stringify(users, null, 2));
}

/* =========================
   LIVE LOCATION DB
========================= */
const LOCATION_DB = "/var/data/locations.json";

function ensureLocationDB() {
  const dir = "/var/data";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOCATION_DB))
    fs.writeFileSync(LOCATION_DB, JSON.stringify({}));
}

function readLocations() {
  ensureLocationDB();
  return JSON.parse(fs.readFileSync(LOCATION_DB, "utf8"));
}

function saveLocations(data) {
  ensureLocationDB();
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

  if (typeof req.body.name === "string") user.name = req.body.name;
  if (typeof req.body.username === "string") user.username = req.body.username;
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
   DRIVER SAVE LOCATION
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

/* =========================
   ADMIN GET LIVE DRIVERS
========================= */
app.get("/api/admin/live-drivers", (req, res) => {
  const locations = readLocations();
  const now = Date.now();

  // رجع بس السواقين اللي بعتوا خلال آخر 30 ثانية
  const active = Object.values(locations).filter(
    d => now - d.updated < 30000
  );

  res.json(active);
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam server running on port", PORT);
});