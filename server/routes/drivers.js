const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "data", "drivers.json");

/* ================= READ ================= */
function readData() {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/* ================= WRITE ================= */
function writeData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* ================= GET ALL ================= */
router.get("/", (req, res) => {
  res.json(readData());
});

/* ================= ADD DRIVER ================= */
router.post("/", (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const drivers = readData();

  const exists = drivers.find(d => d.username === username);
  if (exists) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newDriver = {
    id: Date.now(),
    name,
    username,
    password,
    active: true
  };

  drivers.push(newDriver);
  writeData(drivers);

  res.json(newDriver);
});

/* ================= DELETE DRIVER ================= */
router.delete("/:id", (req, res) => {
  const drivers = readData();
  const filtered = drivers.filter(d => d.id != req.params.id);
  writeData(filtered);
  res.json({ success: true });
});

module.exports = router;