const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMINS_FILE = path.join(__dirname, "data/admins.json");

function readAdmins() {
  if (!fs.existsSync(ADMINS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ADMINS_FILE));
}

function writeAdmins(data) {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2));
}

app.get("/api/admins", (req, res) => {
  res.json(readAdmins());
});

app.post("/api/admins", async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const admins = readAdmins();
  if (admins.find(a => a.username === username)) {
    return res.status(400).json({ error: "Username exists" });
  }

  const hash = await bcrypt.hash(password, 10);
  admins.push({
    id: Date.now(),
    name,
    username,
    password: hash,
    status: "active"
  });

  writeAdmins(admins);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});