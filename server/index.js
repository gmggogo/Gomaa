const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// STATIC FILES
// ===============================
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// ===============================
// DATABASE
// ===============================
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function nextId(users) {
  return users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
}

// ===============================
// API – LOGIN
// ===============================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(
    u =>
      u.username === username &&
      u.password === password &&
      u.active !== false
  );

  if (!user) {
    return res.status(401).json({ success: false });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

// ===============================
// API – USERS (CRUD)
// ===============================
app.get("/api/users", (req, res) => {
  res.json(readUsers());
});

app.post("/api/users", (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const users = readUsers();

  if (users.some(u => u.username === username && u.role === role)) {
    return res.status(409).json({ message: "User exists" });
  }

  const user = {
    id: nextId(users),
    name,
    username,
    password,
    role,
    active: true
  };

  users.push(user);
  writeUsers(users);
  res.json(user);
});

// ===============================
// HEALTH
// ===============================
app.get("/health", (req, res) => {
  res.send("OK");
});

// ===============================
// FALLBACK
// ===============================
app.use((req, res) => {
  res.status(404).send("Not Found");
});

// ===============================
// START
// ===============================
app.listen(PORT, () => {
  console.log("🚀 Sunbeam server running on", PORT);
});