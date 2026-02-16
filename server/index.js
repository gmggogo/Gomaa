const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = "SUNBEAM_SECRET_KEY";

// ===== DEV MODE =====
// خليها true دلوقتي عشان تدخل من غير لوجين
// لما تخلص رجعها false
const DEV_MODE = true;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ================= FILE PATHS =================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  admin: path.join(DATA_DIR, "admins.json"),
  company: path.join(DATA_DIR, "companies.json"),
  driver: path.join(DATA_DIR, "drivers.json"),
  dispatcher: path.join(DATA_DIR, "dispatchers.json")
};

// ================= HELPERS =================
function readFile(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file));
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================= AUTH =================
function auth(req, res, next) {

  if (DEV_MODE) {
    req.user = { role: "admin", name: "Dev Admin" };
    return next();
  }

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

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

// ================= LOGIN =================
app.post("/api/login/:role", async (req, res) => {

  const { role } = req.params;
  const { username, password } = req.body;

  if (!FILES[role])
    return res.status(400).json({ error: "Invalid role" });

  const users = readFile(FILES[role]);
  const user = users.find(u => u.username === username && u.active);

  if (!user)
    return res.status(401).json({ error: "Wrong credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match)
    return res.status(401).json({ error: "Wrong credentials" });

  const token = jwt.sign(
    { id: user.id, role: role, name: user.name },
    SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    role,
    name: user.name
  });
});

// ================= USERS CRUD =================

// GET USERS
app.get("/api/users/:role", auth, requireRole("admin"), (req, res) => {

  const { role } = req.params;
  if (!FILES[role])
    return res.status(400).json({ error: "Invalid role" });

  const users = readFile(FILES[role]);

  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    active: u.active
  })));
});

// CREATE USER
app.post("/api/users/:role", auth, requireRole("admin"), async (req, res) => {

  const { role } = req.params;
  const { name, username, password } = req.body;

  if (!FILES[role])
    return res.status(400).json({ error: "Invalid role" });

  if (!name || !username || !password)
    return res.status(400).json({ error: "Missing fields" });

  const users = readFile(FILES[role]);

  if (users.find(u => u.username === username))
    return res.status(400).json({ error: "Username exists" });

  const hashed = await bcrypt.hash(password, 10);

  const newUser = {
    id: Date.now(),
    name,
    username,
    password: hashed,
    active: true
  };

  users.push(newUser);
  saveFile(FILES[role], users);

  res.json({ success: true });
});

// UPDATE USER
app.put("/api/users/:role/:id", auth, requireRole("admin"), async (req, res) => {

  const { role, id } = req.params;
  const { name, password } = req.body;

  if (!FILES[role])
    return res.status(400).json({ error: "Invalid role" });

  let users = readFile(FILES[role]);
  const user = users.find(u => u.id == id);

  if (!user)
    return res.status(404).json({ error: "User not found" });

  if (name) user.name = name;
  if (password) user.password = await bcrypt.hash(password, 10);

  saveFile(FILES[role], users);

  res.json({ success: true });
});

// DELETE USER
app.delete("/api/users/:role/:id", auth, requireRole("admin"), (req, res) => {

  const { role, id } = req.params;

  if (!FILES[role])
    return res.status(400).json({ error: "Invalid role" });

  let users = readFile(FILES[role]);
  users = users.filter(u => u.id != id);

  saveFile(FILES[role], users);

  res.json({ success: true });
});

// ================= SERVER =================
app.listen(PORT, () => {
  console.log("Sunbeam Server Running On Port " + PORT);
  if (DEV_MODE) console.log("⚠ DEV MODE ENABLED – Login disabled temporarily");
});