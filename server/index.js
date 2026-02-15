// ===========================================
// SIMPLE WORKING AUTH SYSTEM – NO TOKENS
// ===========================================

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const USERS_FILE = path.join(__dirname, "users.json");

// ===========================================
// READ USERS
// ===========================================
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]");
  }
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ===========================================
// LOGIN
// ===========================================
app.post("/api/login", (req, res) => {

  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(
    u =>
      u.username === username &&
      u.password === password &&
      u.active === true
  );

  if (!user) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  res.json({
    name: user.name,
    role: user.role
  });
});

// ===========================================
// GET USERS BY ROLE
// ===========================================
app.get("/api/users", (req, res) => {

  const role = req.query.role;
  const users = readUsers();

  const filtered = users.filter(u => u.role === role);

  res.json(filtered);
});

// ===========================================
// ADD USER
// ===========================================
app.post("/api/users", (req, res) => {

  const { name, username, password, role } = req.body;
  const users = readUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username exists" });
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

  res.json({ success: true });
});

// ===========================================
// UPDATE USER
// ===========================================
app.put("/api/users/:id", (req, res) => {

  const users = readUsers();
  const id = parseInt(req.params.id);

  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Not found" });

  user.name = req.body.name ?? user.name;
  user.username = req.body.username ?? user.username;
  user.password = req.body.password ?? user.password;
  user.active = req.body.active ?? user.active;

  saveUsers(users);

  res.json({ success: true });
});

// ===========================================
// DELETE USER
// ===========================================
app.delete("/api/users/:id", (req, res) => {

  let users = readUsers();
  const id = parseInt(req.params.id);

  users = users.filter(u => u.id !== id);
  saveUsers(users);

  res.json({ success: true });
});

// ===========================================
app.listen(3000, () => {
  console.log("Server running on port 3000");
});