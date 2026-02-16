const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

function readData(file) {
  const filePath = path.join(__dirname, "..", "data", file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

router.post("/login", (req, res) => {
  const { username, password, role } = req.body;

  let file = null;

  if (role === "admin") file = "admins.json";
  if (role === "company") file = "companies.json";
  if (role === "dispatcher") file = "dispatchers.json";
  if (role === "driver") file = "drivers.json";

  if (!file) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const users = readData(file);

  const user = users.find(
    u =>
      u.username === username &&
      u.password === password &&
      u.active !== false
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role
    }
  });
});

module.exports = router;