const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* =========================
   STATIC FILES
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   DATABASE (users.json)
========================= */
const DB_PATH = path.join(__dirname, "users.json");

function readUsers() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

/* =========================
   ADMIN USERS API (USED BY users.js)
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

  Object.assign(user, req.body);
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
   LOGIN API
========================= */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({
    success: true,
    username: user.username,
    role: user.role,
    name: user.name
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam server running on port", PORT);
});