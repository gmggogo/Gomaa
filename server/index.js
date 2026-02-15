const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = "SUNBEAM_SECRET_KEY";

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const usersPath = path.join(__dirname, "users.json");

// ===== Helpers =====
function readUsers() {
  return JSON.parse(fs.readFileSync(usersPath));
}

function saveUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

// ===== AUTH MIDDLEWARE =====
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ===== ROLE CHECK =====
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

// ================= LOGIN =================
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username && u.active);

  if (!user) return res.status(401).json({ error: "Wrong credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Wrong credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    name: user.name,
    role: user.role
  });
});

// ================= CREATE USER (ADMIN ONLY) =================
app.post("/api/users", auth, requireRole("admin"), async (req, res) => {

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

// ================= GET USERS =================
app.get("/api/users", auth, requireRole("admin"), (req, res) => {
  const users = readUsers();
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active
  })));
});

// ================= DELETE USER =================
app.delete("/api/users/:id", auth, requireRole("admin"), (req, res) => {
  let users = readUsers();
  users = users.filter(u => u.id != req.params.id);
  saveUsers(users);
  res.json({ success: true });
});

// ================= UPDATE USER =================
app.put("/api/users/:id", auth, requireRole("admin"), async (req, res) => {
  const { name, role, password } = req.body;
  let users = readUsers();

  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });

  if (name) user.name = name;
  if (role) user.role = role;
  if (password) user.password = await bcrypt.hash(password, 10);

  saveUsers(users);
  res.json({ success: true });
});

// ================= SERVER START =================
app.listen(PORT, () => {
  console.log("Sunbeam Server Running On Port " + PORT);
});