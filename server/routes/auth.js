const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const router = express.Router();

function getFileByRole(role) {
  const map = {
    admin: "admins.json",
    company: "companies.json",
    driver: "drivers.json",
    dispatcher: "dispatchers.json"
  };

  return path.join(__dirname, "../data", map[role]);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath);
  return JSON.parse(data);
}

function saveFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// =====================
// REGISTER
// =====================
router.post("/register", async (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const filePath = getFileByRole(role);
  if (!filePath) return res.status(400).json({ message: "Invalid role" });

  const users = readFile(filePath);

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: "Username exists" });
  }

  const hashed = await bcrypt.hash(password, 10);

  const newUser = {
    id: Date.now(),
    name,
    username,
    password: hashed,
    active: true
  };

  users.push(newUser);
  saveFile(filePath, users);

  res.json({ message: `${role} created successfully` });
});

// =====================
// LOGIN
// =====================
router.post("/login", async (req, res) => {
  const { username, password, role } = req.body;

  if (!role) return res.status(400).json({ message: "Role required" });

  const filePath = getFileByRole(role);
  if (!filePath) return res.status(400).json({ message: "Invalid role" });

  const users = readFile(filePath);
  const user = users.find(u => u.username === username);

  if (!user) return res.status(400).json({ message: "Invalid username" });

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.status(400).json({ message: "Invalid password" });

  if (!user.active) return res.status(403).json({ message: "Account disabled" });

  res.json({
    message: "Login success",
    user: {
      id: user.id,
      name: user.name,
      role
    }
  });
});

module.exports = router;