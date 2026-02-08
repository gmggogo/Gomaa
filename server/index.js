const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ===============================
// STATIC FILES
// ===============================
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// USERS DB (واحد بس)
// ===============================
const DB_PATH = path.join(__dirname, "data", "users.json");

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return [];
  }
}

// ===============================
// HEALTH
// ===============================
app.get("/health", (req, res) => res.send("OK"));

// ===============================
// LOGIN API  ✅ صح
// ===============================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false });
  }

  const users = readUsers();

  const user = users.find(
    u =>
      String(u.username).toLowerCase() === String(username).toLowerCase() &&
      String(u.password) === String(password) &&
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
      username: user.username,
      role: user.role
    }
  });
});

// ===============================
// USERS API (للديسبتش/الأدمن)
// ===============================
app.get("/api/users", (req, res) => {
  const role = (req.query.role || "").toLowerCase();
  let users = readUsers();

  if (role) {
    users = users.filter(u => (u.role || "").toLowerCase() === role);
  }

  res.json(users);
});

// ===============================
// START
// ===============================
app.listen(PORT, () => {
  console.log("🚀 Sunbeam running on port", PORT);
});