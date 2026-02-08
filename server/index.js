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
  return JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
}

function writeAdmins(data) {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2));
}

/* =========================
   ADD ADMIN
========================= */
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
  admins.push({ name, username, password: hash });

  writeAdmins(admins);
  res.json({ success: true });
});

/* =========================
   GET ADMINS
========================= */
app.get("/api/admins", (req, res) => {
  const admins = readAdmins().map(a => ({
    name: a.name,
    username: a.username
  }));
  res.json(admins);
});

/* =========================
   DELETE ADMIN
========================= */
app.delete("/api/admins/:username", (req, res) => {
  const admins = readAdmins().filter(
    a => a.username !== req.params.username
  );
  writeAdmins(admins);
  res.json({ success: true });
});

/* =========================
   LOGIN
========================= */
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const admins = readAdmins();

  const admin = admins.find(a => a.username === username);
  if (!admin) return res.status(401).json({ error: "Invalid login" });

  const ok = await bcrypt.compare(password, admin.password);
  if (!ok) return res.status(401).json({ error: "Invalid login" });

  res.json({ name: admin.name, username: admin.username });
});

/* ========================= */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});