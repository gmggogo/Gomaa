const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "data", "admins.json");

/* ==============================
   Helpers
============================== */
function readData() {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* ==============================
   GET ALL ADMINS
============================== */
router.get("/", (req, res) => {
  const admins = readData();
  res.json(admins);
});

/* ==============================
   ADD ADMIN
============================== */
router.post("/", (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const admins = readData();

  const newAdmin = {
    id: Date.now(),
    name,
    username,
    password,
    active: true
  };

  admins.push(newAdmin);
  saveData(admins);

  res.json({ success: true });
});

/* ==============================
   DELETE ADMIN
============================== */
router.delete("/:id", (req, res) => {
  const admins = readData();
  const filtered = admins.filter(a => a.id != req.params.id);
  saveData(filtered);
  res.json({ success: true });
});

module.exports = router;