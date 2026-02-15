const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

/* ✅ ADD: session (important for /api/company/me + dashboard) */
const session = require("express-session");
const FileStore = require("session-file-store")(session);

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   CORS + JSON
========================= */
/*
  ✅ مهم:
  - لو صفحاتك و API على نفس الدومين في Render: الأمور سهلة.
  - لو بتفتح من دومين مختلف لازم origin مضبوط + credentials.
*/
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json());

/* ✅ Render behind proxy */
app.set("trust proxy", 1);

/* =========================
   SESSION (Persist to /var/data)
========================= */
const SESSION_DIR = "/var/data/sessions";
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

app.use(
  session({
    store: new FileStore({ path: SESSION_DIR }),
    secret: process.env.SESSION_SECRET || "sunbeam_secret_2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" // Render = production
    }
  })
);

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
  if (!fs.existsSync(USERS_DB)) fs.writeFileSync(USERS_DB, JSON.stringify([]));
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
  if (!fs.existsSync(LOCATION_DB)) fs.writeFileSync(LOCATION_DB, JSON.stringify({}));
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
   TRIPS DATABASE
========================= */
const TRIPS_DB = "/var/data/trips.json";

function ensureTripsDB() {
  const dir = "/var/data";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TRIPS_DB)) fs.writeFileSync(TRIPS_DB, JSON.stringify([]));
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
   LOGIN (UPDATED: saves session)
========================= */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) return res.status(401).json({ success: false });

  // ✅ save to session (this is the key)
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
  };

  res.json({
    success: true,
    username: user.username,
    role: user.role,
    name: user.name
  });
});

/* ✅ OPTIONAL: logout */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* =========================
   ✅ COMPANY ME (NEW)
   used by layout.js to show company name
========================= */
app.get("/api/company/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  // لو عايز تقصرها على الشركات فقط
  if (req.session.user.role !== "companies" && req.session.user.role !== "company") {
    return res.status(403).json({ error: "Not a company account" });
  }

  res.json({
    id: req.session.user.id,
    username: req.session.user.username,
    name: req.session.user.name,
    role: req.session.user.role
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

  const active = Object.values(locations).filter(
    d => now - d.updated < 30000
  );

  res.json(active);
});

/* =========================
   GET ALL TRIPS
========================= */
app.get("/api/trips", (req, res) => {
  const trips = readTrips();
  res.json(trips);
});

/* =========================
   ADD NEW TRIP
========================= */
app.post("/api/trips", (req, res) => {

  const data = req.body;

  if (!data) {
    return res.status(400).json({ error: "No data received" });
  }

  // لو جاله Array كامل
  if (Array.isArray(data)) {
    saveTrips(data);
    return res.json({ success: true });
  }

  // لو جاله Trip واحدة
  if (!data.tripNumber) {
    return res.status(400).json({ error: "Missing tripNumber" });
  }

  const trips = readTrips();
  trips.unshift(data);
  saveTrips(trips);

  res.json({ success: true });
});

/* =========================
   ✅ COMPANY DASHBOARD (NEW)
   used by dashboard.html
========================= */
app.get("/api/company/dashboard", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });

  // لو عايز تقصرها على الشركات فقط
  if (req.session.user.role !== "companies" && req.session.user.role !== "company") {
    return res.status(403).json({ error: "Not a company account" });
  }

  const companyUser = req.session.user;

  const tripsAll = readTrips();

  // ✅ فلترة مرنة حسب اللي عندك في بيانات الرحلات
  const trips = tripsAll.filter(t => {
    const cId = t.companyId ?? t.companyID ?? t.company_id;
    const cName = t.companyName ?? t.company ?? t.company_name;
    const cUser = t.companyUsername ?? t.companyUser ?? t.company_username;

    if (cId != null && Number(cId) === Number(companyUser.id)) return true;
    if (cUser && String(cUser).toLowerCase() === String(companyUser.username).toLowerCase()) return true;
    if (cName && String(cName).toLowerCase() === String(companyUser.name).toLowerCase()) return true;

    // لو مفيش أي fields خاصة بالشركة في التريب (قديم) هنرجع false عشان ما نخلطش بيانات شركات
    return false;
  });

  const today = new Date().toISOString().split("T")[0];
  const month = today.slice(0, 7); // YYYY-MM

  const getTripDate = (t) => t.date || t.tripDate || t.pickupDate || "";

  const todayTrips = trips.filter(t => String(getTripDate(t)) === today);
  const monthTrips = trips.filter(t => String(getTripDate(t)).startsWith(month));

  const statusOf = (t) => (t.status || t.tripStatus || "").trim();

  const lastTrips = trips
    .slice(0, 200) // احتياط
    .sort((a,b) => {
      const da = String(getTripDate(a));
      const db = String(getTripDate(b));
      if (da === db) return 0;
      return da > db ? -1 : 1;
    })
    .slice(0, 5)
    .map(t => ({
      date: getTripDate(t) || "",
      pickup: t.pickup || t.pickupAddress || t.pickup_location || "",
      status: statusOf(t) || "Scheduled"
    }));

  res.json({
    today: {
      total: todayTrips.length,
      completed: todayTrips.filter(t => statusOf(t) === "Completed").length,
      noShow: todayTrips.filter(t => statusOf(t) === "No Show").length,
      cancelled: todayTrips.filter(t => statusOf(t) === "Cancelled").length
    },
    month: {
      total: monthTrips.length
    },
    lastTrips
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam server running on port", PORT);
});