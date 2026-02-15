// ============================================
// SUNBEAM AUTH SERVER – CLEAN VERSION
// ============================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = "sunbeam_secret_key_2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ============================================
// USERS FILE (خارج public)
// ============================================

const USERS_FILE = path.join(__dirname, "users.json");

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}


// ============================================
// LOGIN
// ============================================

app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username && u.active);

  if (!user) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    role: user.role,
    name: user.name
  });
});


// ============================================
// AUTH MIDDLEWARE
// ============================================

function auth(requiredRole) {
  return (req, res, next) => {

    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, SECRET);

      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: "Not allowed" });
      }

      req.user = decoded;
      next();

    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}


// ============================================
// CREATE USER (ADMIN ONLY)
// ============================================

app.post("/api/users", auth("admin"), async (req, res) => {

  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

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
});


// ============================================
// GET USERS (ADMIN ONLY)
// ============================================

app.get("/api/users", auth("admin"), (req, res) => {
  const users = readUsers();

  const safe = users.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active
  }));

  res.json(safe);
});


// ============================================
// START
// ============================================

app.listen(PORT, () => {
  console.log("🚀 Sunbeam Server Running Clean");
});