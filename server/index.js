const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   FILE HELPERS
========================= */
function filePath(file) {
  return path.join(__dirname, "data", file);
}

function readJSON(file) {
  if (!fs.existsSync(filePath(file))) return [];
  return JSON.parse(fs.readFileSync(filePath(file), "utf8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(filePath(file), JSON.stringify(data, null, 2));
}

/* =========================
   GENERIC CRUD (WITH PASSWORD HASH)
========================= */
function registerCRUD(file) {
  const api = `/api/${file.replace(".json", "")}`;

  // GET ALL
  app.get(api, (req, res) => {
    res.json(readJSON(file));
  });

  // CREATE
  app.post(api, async (req, res) => {
    const list = readJSON(file);

    if (!req.body.password) {
      return res.status(400).json({ error: "Password required" });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const item = {
      id: Date.now(),
      name: req.body.name || "",
      username: req.body.username || "",
      password: hashedPassword,   // ✅ HASHED
      active: true
    };

    list.push(item);
    writeJSON(file, list);

    res.json({ ok: true });
  });

  // UPDATE
  app.put(`${api}/:id`, async (req, res) => {
    const list = readJSON(file);
    const idx = list.findIndex(i => i.id == req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    // لو فيه باسورد جديد → نشفره
    if (req.body.password && req.body.password.trim() !== "") {
      req.body.password = await bcrypt.hash(req.body.password, 10);
    } else {
      delete req.body.password;
    }

    list[idx] = { ...list[idx], ...req.body };
    writeJSON(file, list);

    res.json({ ok: true });
  });

  // DELETE
  app.delete(`${api}/:id`, (req, res) => {
    const list = readJSON(file).filter(i => i.id != req.params.id);
    writeJSON(file, list);
    res.json({ ok: true });
  });
}

/* =========================
   REGISTER ALL USER TYPES
========================= */
registerCRUD("admins.json");
registerCRUD("companies.json");
registerCRUD("drivers.json");
registerCRUD("dispatchers.json");

/* =========================
   LOGIN API (اختياري بس مهم)
========================= */
app.post("/api/login", async (req, res) => {
  const { role, username, password } = req.body;

  if (!role || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const file = `${role}s.json`; // admins.json, companies.json...
  const users = readJSON(file);

  const user = users.find(u => u.username === username && u.active);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({
    id: user.id,
    name: user.name,
    role
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});