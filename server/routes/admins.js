const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "data", "admins.json");

/* =========================
   READ
========================= */
function readData() {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/* =========================
   WRITE
========================= */
function writeData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* =========================
   GET ADMINS
========================= */
router.get("/", (req, res) => {
  res.json(readData());
});

/* =========================
   ADD ADMIN
========================= */
router.post("/", (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const admins = readData();

  const exists = admins.find(a => a.username === username);
  if (exists) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newAdmin = {
    id: Date.now(),
    name,
    username,
    password,
    active: true
  };

  admins.push(newAdmin);
  writeData(admins);

  res.json(newAdmin);
});

/* =========================
   DELETE ADMIN
========================= */
router.delete("/:id", (req, res) => {
  const admins = readData();
  const filtered = admins.filter(a => a.id != req.params.id);
  writeData(filtered);
  res.json({ success: true });
});

module.exports = router;