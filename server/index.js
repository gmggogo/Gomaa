const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// serve static
app.use(express.static(path.join(__dirname, "public")));

// ====== USERS DB (JSON file) ======
const DB_PATH = path.join(__dirname, "data", "users.json");

function ensureDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}
function readUsers() {
  ensureDB();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8") || "[]");
  } catch {
    return [];
  }
}
function writeUsers(list) {
  ensureDB();
  fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2));
}
function nextId(list) {
  return list.length ? Math.max(...list.map(u => Number(u.id) || 0)) + 1 : 1;
}

// ===============================
// HEALTH
// ===============================
app.get("/health", (req, res) => res.send("OK"));

// ===============================
// LOGIN  ✅ (المهم)
// ===============================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Missing credentials" });
  }

  const users = readUsers();

  const user = users.find(
    u =>
      u.username === username &&
      u.password === password &&
      u.active === true
  );

  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid login" });
  }

  res.json({
    success: true,
    user
  });
});

// ===============================
// USERS CRUD
// ===============================
app.get("/api/users", (req, res) => {
  const role = (req.query.role || "").toLowerCase();
  let users = readUsers();
  if (role) users = users.filter(u => (u.role || "").toLowerCase() === role);
  res.json(users);
});

app.post("/api/users", (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name || !username || !password || !role) {
    return res.status(400).send("Missing fields");
  }

  const users = readUsers();
  const exists = users.some(
    u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.role.toLowerCase() === role.toLowerCase()
  );
  if (exists) return res.status(409).send("User already exists");

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

app.put("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const patch = req.body || {};

  const users = readUsers();
  const idx = users.findIndex(u => Number(u.id) === id);
  if (idx === -1) return res.status(404).send("User not found");

  users[idx] = {
    ...users[idx],
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.username !== undefined ? { username: patch.username } : {}),
    ...(patch.password !== undefined ? { password: patch.password } : {}),
    ...(patch.active !== undefined ? { active: !!patch.active } : {}),
  };

  writeUsers(users);
  res.json(users[idx]);
});

app.delete("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const users = readUsers();
  const next = users.filter(u => Number(u.id) !== id);
  writeUsers(next);
  res.json({ ok: true });
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});