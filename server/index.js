const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ================= DATA SETUP =================

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  admin: path.join(DATA_DIR, "admins.json"),
  company: path.join(DATA_DIR, "companies.json"),
  driver: path.join(DATA_DIR, "drivers.json"),
  dispatcher: path.join(DATA_DIR, "dispatchers.json")
};

function readFile(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file));
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================= USERS CRUD (NO LOGIN) =================

// GET USERS
app.get("/api/users/:role", (req, res) => {
  const { role } = req.params;
  if (!FILES[role]) return res.status(400).json({ error: "Invalid role" });

  const users = readFile(FILES[role]);
  res.json(users);
});

// CREATE USER
app.post("/api/users/:role", async (req, res) => {
  const { role } = req.params;
  const { name, username, password } = req.body;

  if (!FILES[role]) return res.status(400).json({ error: "Invalid role" });
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
app.put("/api/users/:role/:id", async (req, res) => {
  const { role, id } = req.params;
  const { name, password } = req.body;

  if (!FILES[role]) return res.status(400).json({ error: "Invalid role" });

  let users = readFile(FILES[role]);
  const user = users.find(u => u.id == id);

  if (!user) return res.status(404).json({ error: "User not found" });

  if (name) user.name = name;
  if (password) user.password = await bcrypt.hash(password, 10);

  saveFile(FILES[role], users);

  res.json({ success: true });
});

// DELETE USER
app.delete("/api/users/:role/:id", (req, res) => {
  const { role, id } = req.params;

  if (!FILES[role]) return res.status(400).json({ error: "Invalid role" });

  let users = readFile(FILES[role]);
  users = users.filter(u => u.id != id);

  saveFile(FILES[role], users);

  res.json({ success: true });
});

// TEST ROUTE
app.get("/api/test", (req, res) => {
  res.send("SERVER RUNNING CLEAN VERSION");
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log("Sunbeam Server Running On Port " + PORT);
});