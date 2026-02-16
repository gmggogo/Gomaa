const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "data", "companies.json");

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
   GET ALL COMPANIES
========================= */
router.get("/", (req, res) => {
  res.json(readData());
});

/* =========================
   ADD COMPANY
========================= */
router.post("/", (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const companies = readData();

  const exists = companies.find(c => c.username === username);
  if (exists) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newCompany = {
    id: Date.now(),
    name,
    username,
    password,
    active: true
  };

  companies.push(newCompany);
  writeData(companies);

  res.json(newCompany);
});

/* =========================
   DELETE COMPANY
========================= */
router.delete("/:id", (req, res) => {
  const companies = readData();
  const filtered = companies.filter(c => c.id != req.params.id);
  writeData(filtered);
  res.json({ success: true });
});

module.exports = router;