const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "data", "companies.json");

function readData() {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

router.get("/", (req, res) => {
  res.json(readData());
});

router.post("/", (req, res) => {
  const users = readData();
  const { name, username, password } = req.body;

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newUser = {
    id: Date.now(),
    name,
    username,
    password,
    active: true
  };

  users.push(newUser);
  saveData(users);
  res.json(newUser);
});

router.delete("/:id", (req, res) => {
  let users = readData();
  users = users.filter(u => u.id != req.params.id);
  saveData(users);
  res.json({ success: true });
});

module.exports = router;