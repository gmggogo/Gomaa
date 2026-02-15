const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = "SUNBEAM_SUPER_SECRET_2026";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const USERS_FILE = path.join(__dirname, "users.json");

/* ===========================
   HELPERS
=========================== */
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* ===========================
   AUTH MIDDLEWARE
=========================== */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function roleCheck(role) {
  return (req, res, next) => {
    if (req.user.role !== role)
      return res.status(403).json({ error: "Access denied" });
    next();
  };
}

/* ===========================
   LOGIN
=========================== */
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing data" });

  const users = readUsers();
  const user = users.find(u => u.username === username && u.active);

  if (!user)
    return res.status(401).json({ error: "Wrong username or password" });

  const match = await bcrypt.compare(password, user.password);
  if (!match)
    return res.status(401).json({ error: "Wrong username or password" });

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

/* ===========================
   CREATE USER (ADMIN ONLY)
=========================== */
app.post("/api/users", authMiddleware, roleCheck("admin"), async (req, res) => {

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

  res.json({ message: "User created" });
});

/* ===========================
   GET USERS (ADMIN)
=========================== */
app.get("/api/users", authMiddleware, roleCheck("admin"), (req, res) => {
  const users = readUsers();
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active
  })));
});

/* ===========================
   PROTECTED TEST ROUTE
=========================== */
app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

/* ===========================
   START SERVER
=========================== */
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});