// ======================================================
// 1️⃣ LOAD ENV
// ======================================================
require("dotenv").config();


// ======================================================
// 2️⃣ IMPORTS
// ======================================================
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");


// ======================================================
// 3️⃣ APP INIT
// ======================================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ======================================================
// 4️⃣ DATABASE (Render Safe)
// ======================================================
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


// ======================================================
// 5️⃣ AUTH MIDDLEWARE
// ======================================================
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
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}


// ======================================================
// 6️⃣ HELPERS
// ======================================================
function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function cleanUser(u) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    active: u.active,
    companyId: u.companyId || null
  };
}


// ======================================================
// 7️⃣ ROOT
// ======================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ======================================================
// 8️⃣ SETUP FIRST ADMIN
// ======================================================
app.post("/api/setup-admin", async (req, res) => {

  const users = readUsers();
  if (users.find(u => u.role === "admin")) {
    return res.status(400).json({ error: "Admin already exists" });
  }

  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

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


// ======================================================
// 9️⃣ LOGIN
// ======================================================
app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username && u.active);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = generateToken(user);

  res.json({
    token,
    role: user.role,
    name: user.name
  });
});


// ======================================================
// 🔟 CREATE USER
// ======================================================
app.post("/api/users",
  auth(["admin", "company"]),
  async (req, res) => {

    const { name, username, password, role } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const users = readUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: "Username exists" });
    }

    if (req.user.role === "company" && role === "admin") {
      return res.status(403).json({ error: "Company cannot create admin" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now(),
      name,
      username,
      password: hashed,
      role,
      active: true
    };

    if (req.user.role === "company") {
      newUser.companyId = req.user.id;
    }

    users.push(newUser);
    saveUsers(users);

    res.json({ success: true });
  }
);


// ======================================================
// 1️⃣1️⃣ GET USERS (WITH ROLE FILTER)
// ======================================================
app.get("/api/users",
  auth(["admin", "company"]),
  (req, res) => {

    const users = readUsers();
    const roleFilter = req.query.role;

    // ADMIN
    if (req.user.role === "admin") {

      let result = users;

      if (roleFilter) {
        result = users.filter(u => u.role === roleFilter);
      }

      return res.json(result.map(cleanUser));
    }

    // COMPANY
    if (req.user.role === "company") {

      let result = users.filter(
        u => u.companyId === req.user.id
      );

      if (roleFilter) {
        result = result.filter(u => u.role === roleFilter);
      }

      return res.json(result.map(cleanUser));
    }
  }
);


// ======================================================
// 1️⃣2️⃣ UPDATE USER
// ======================================================
app.put("/api/users/:id",
  auth(["admin", "company"]),
  (req, res) => {

    const id = Number(req.params.id);
    const users = readUsers();
    const user = users.find(u => u.id === id);

    if (!user) return res.status(404).json({ error: "User not found" });

    if (req.user.role === "company" && user.companyId !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (req.body.name) user.name = req.body.name;
    if (req.body.username) user.username = req.body.username;
    if (typeof req.body.active === "boolean") user.active = req.body.active;

    saveUsers(users);
    res.json({ success: true });
  }
);


// ======================================================
// 1️⃣3️⃣ UPDATE PASSWORD
// ======================================================
app.put("/api/users/:id/password",
  auth(["admin", "company"]),
  async (req, res) => {

    const id = Number(req.params.id);
    const { password } = req.body;

    if (!password) return res.status(400).json({ error: "Missing password" });

    const users = readUsers();
    const user = users.find(u => u.id === id);

    if (!user) return res.status(404).json({ error: "User not found" });

    if (req.user.role === "company" && user.companyId !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;

    saveUsers(users);
    res.json({ success: true });
  }
);


// ======================================================
// 1️⃣4️⃣ DELETE USER
// ======================================================
app.delete("/api/users/:id",
  auth(["admin", "company"]),
  (req, res) => {

    const id = Number(req.params.id);
    let users = readUsers();

    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.role === "admin" && req.user.id !== user.id) {
      return res.status(403).json({ error: "Cannot delete another admin" });
    }

    if (req.user.role === "company" && user.companyId !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    users = users.filter(u => u.id !== id);
    saveUsers(users);

    res.json({ success: true });
  }
);


// ======================================================
// 1️⃣5️⃣ START SERVER
// ======================================================
app.listen(PORT, () => {
  console.log("🚀 Sunbeam FULL RBAC Server Running");
});