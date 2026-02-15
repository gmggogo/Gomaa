const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = "SUNBEAM_SECRET_CHANGE_THIS";

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
   TRIPS DATABASE
========================= */
const TRIPS_DB = "/var/data/trips.json";

function ensureTripsDB() {
  const dir = "/var/data";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TRIPS_DB))
    fs.writeFileSync(TRIPS_DB, JSON.stringify([]));
}

function readTrips() {
  ensureTripsDB();
  return JSON.parse(fs.readFileSync(TRIPS_DB, "utf8"));
}

function saveTrips(trips) {
  ensureTripsDB();
  fs.writeFileSync(TRIPS_DB, JSON.stringify(trips, null, 2));
}

/* =========================
   AUTH MIDDLEWARE
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

/* =========================
   ADMIN USERS API (UNCHANGED ROUTES)
========================= */
app.get("/api/admin/users", auth, (req, res) => {
  const role = req.query.role;
  const users = readUsers();
  const filtered = role ? users.filter(u => u.role === role) : users;

  res.json(filtered.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active
  })));
});

app.post("/api/admin/users", auth, async (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role)
    return res.status(400).json({ error: "Missing fields" });

  const users = readUsers();

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
  saveUsers(users);

  res.json({ success: true });
});

/* =========================
   LOGIN (ROUTE SAME NAME)
========================= */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(
    u => u.username === username && u.active
  );

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
   GET ALL TRIPS (ROUTE SAME)
========================= */
app.get("/api/trips", auth, (req, res) => {
  const trips = readTrips();
  res.json(trips);
});

/* =========================
   ADD NEW TRIP (ROUTE SAME)
========================= */
app.post("/api/trips", auth, (req, res) => {
  const data = req.body;

  if (!data || !data.tripNumber)
    return res.status(400).json({ error: "Missing tripNumber" });

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