const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

function readData(file) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data", file))
  );
}

router.post("/login", (req, res) => {
  const { username, password, role } = req.body;

  let file = "";
  if (role === "driver") file = "drivers.json";
  if (role === "admin") file = "admins.json";
  if (role === "company") file = "companies.json";
  if (role === "dispatcher") file = "dispatchers.json";

  if (!file) return res.status(400).json({ message: "Invalid role" });

  const users = readData(file);

  const user = users.find(
    u => u.username === username && u.password === password && u.active !== false
  );

  if (!user) {
    return res.status(401).json({ message: "Wrong username or password" });
  }

  res.json({
    id: user.id,
    name: user.name,
    role
  });
});

module.exports = router;