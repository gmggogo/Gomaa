// ======================================================
// SUNBEAM AUTH SERVER – CLEAN VERSION
// ======================================================

const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = "SUNBEAM_SECRET_2026";

app.use(express.json());
app.use(express.static("public"));

const DB_FILE = path.join(__dirname, "users.json");


// ======================================================
// READ / WRITE USERS
// ======================================================

function readUsers() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeUsers(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}


// ======================================================
// AUTH MIDDLEWARE
// ======================================================

function auth(roles = []) {
  return (req, res, next) => {

    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, SECRET);

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      req.user = decoded;
      next();

    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}


// ======================================================
// LOGIN
// ======================================================

app.post("/api/login", (req, res) => {

  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username);

  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token, role: user.role });
});


// ======================================================
// GET USERS (FILTER BY ROLE)
// ======================================================

app.get("/api/users", auth(["admin"]), (req, res) => {

  const users = readUsers();
  const role = req.query.role;

  if (role) {
    return res.json(users.filter(u => u.role === role));
  }

  res.json(users);
});


// ======================================================
// ADD USER (ADMIN ONLY)
// ======================================================

app.post("/api/users", auth(["admin"]), (req, res) => {

  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const users = readUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username exists" });
  }

  const hashed = bcrypt.hashSync(password, 10);

  users.push({
    id: Date.now(),
    name,
    username,
    password: hashed,
    role,
    active: true
  });

  writeUsers(users);

  res.json({ success: true });
});


// ======================================================
// UPDATE USER
// ======================================================

app.put("/api/users/:id", auth(["admin"]), (req, res) => {

  const id = Number(req.params.id);
  const users = readUsers();

  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Not found" });

  if (req.body.name) user.name = req.body.name;
  if (req.body.username) user.username = req.body.username;
  if (req.body.active !== undefined) user.active = req.body.active;

  writeUsers(users);

  res.json({ success: true });
});


// ======================================================
// UPDATE PASSWORD
// ======================================================

app.put("/api/users/:id/password", auth(["admin"]), (req, res) => {

  const id = Number(req.params.id);
  const { password } = req.body;

  if (!password) return res.status(400).json({ error: "No password" });

  const users = readUsers();
  const user = users.find(u => u.id === id);

  if (!user) return res.status(404).json({ error: "Not found" });

  user.password = bcrypt.hashSync(password, 10);

  writeUsers(users);

  res.json({ success: true });
});


// ======================================================
// DELETE USER
// ======================================================

app.delete("/api/users/:id", auth(["admin"]), (req, res) => {

  const id = Number(req.params.id);
  let users = readUsers();

  users = users.filter(u => u.id !== id);

  writeUsers(users);

  res.json({ success: true });
});


// ======================================================
// START
// ======================================================

app.listen(PORT, () => {
  console.log("Sunbeam server running on port", PORT);
});