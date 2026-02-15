require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* =========================
   DATA STORAGE (Render Safe)
========================= */
const DATA_DIR = "/var/data";
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_DB = path.join(DATA_DIR, "users.json");

function ensureUsersDB() {
  if (!fs.existsSync(USERS_DB)) {
    fs.writeFileSync(USERS_DB, JSON.stringify([]));
  }
}

function readUsers() {
  ensureUsersDB();
  return JSON.parse(fs.readFileSync(USERS_DB));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_DB, JSON.stringify(users, null, 2));
}

/* =========================
   AUTH MIDDLEWARE
========================= */
function auth(requiredRoles = []) {
  return (req, res, next) => {

    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (requiredRoles.length && !requiredRoles.includes(decoded.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      req.user = decoded;
      next();

    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}

/* =========================
   CREATE FIRST ADMIN
========================= */
app.post("/api/setup-admin", async (req, res) => {

  const users = readUsers();
  if (users.find(u => u.role === "admin")) {
    return res.status(400).json({ error: "Admin already exists" });
  }

  const { name, username, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  users.push({
    id: Date.now(),
    name,
    username,
    password: hashed,
    role: "admin",
    active: true
  });

  saveUsers(users);

  res.json({ success: true });
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username && u.active);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    role: user.role,
    name: user.name
  });
});

/* =========================
   CREATE USER (Admin Only)
========================= */
app.post("/api/admin/users",
  auth(["admin"]),
  async (req, res) => {

    const { name, username, password, role } = req.body;

    const users = readUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: "Username exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    users.push({
      id: Date.now(),
      name,
      username,
      password: hashed,
      role,
      active: true
    });

    saveUsers(users);

    res.json({ success: true });
  }
);

/* =========================
   GET USERS (Admin Only)
========================= */
app.get("/api/admin/users",
  auth(["admin"]),
  (req, res) => {

    const users = readUsers().map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      active: u.active
    }));

    res.json(users);
  }
);

/* =========================
   SERVER START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam Secure Server Running");
});