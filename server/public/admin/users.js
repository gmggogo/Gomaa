const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
app.use(express.json());

// =========================
// USERS STORAGE (PERSISTENT)
// =========================
const DATA_DIR = "/var/data";
const USERS_FILE = path.join(DATA_DIR, "users.json");

// تأكد إن الفولدر موجود
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// تأكد إن الملف موجود
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// =========================
// ADMIN USERS API
// =========================
app.get("/api/admin/users", (req, res) => {
  const role = req.query.role;
  const users = loadUsers();
  res.json(role ? users.filter(u => u.role === role) : users);
});

app.post("/api/admin/users", (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username exists" });
  }

  const user = {
    id: Date.now(),
    name,
    username,
    password,
    role,
    active: true
  };

  users.push(user);
  saveUsers(users);
  res.json(user);
});

app.put("/api/admin/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const users = loadUsers();
  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Not found" });

  Object.assign(user, req.body);
  saveUsers(users);
  res.json(user);
});

app.delete("/api/admin/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const users = loadUsers().filter(u => u.id !== id);
  saveUsers(users);
  res.json({ success: true });
});

// =========================
// LOGIN
// =========================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  const user = users.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) {
    return res.status(401).json({ success: false });
  }

  res.json({
    success: true,
    username: user.username,
    name: user.name,
    role: user.role
  });
});

// =========================
// START
// =========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});