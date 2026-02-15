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
app.use(express.static(path.join(__dirname, "public")));

// ================= DATABASE =================
const DATA_FILE = path.join(__dirname, "users.json");

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

function readUsers() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveUsers(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ================= AUTH =================
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ================= LOGIN =================
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: "Wrong credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Wrong credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token, role: user.role });
});

// ================= CREATE USER =================
app.post("/api/users", auth, async (req, res) => {

  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Only admin allowed" });

  const { name, username, password, role } = req.body;

  const users = readUsers();

  if (users.find(u => u.username === username))
    return res.status(400).json({ error: "Username exists" });

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

// ================= GET USERS BY ROLE =================
app.get("/api/users", auth, (req, res) => {

  const roleFilter = req.query.role;
  const users = readUsers();

  const filtered = roleFilter
    ? users.filter(u => u.role === roleFilter)
    : users;

  res.json(filtered.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active
  })));
});

// ================= UPDATE PASSWORD =================
app.put("/api/users/:id/password", auth, async (req, res) => {

  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Only admin allowed" });

  const id = Number(req.params.id);
  const { password } = req.body;

  const users = readUsers();
  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Not found" });

  user.password = await bcrypt.hash(password, 10);
  saveUsers(users);

  res.json({ success: true });
});

// ================= START =================
app.listen(PORT, () => {
  console.log("Server running clean.");
});