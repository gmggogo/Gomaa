const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   HELPERS
========================= */
function readJSON(file) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", file), "utf8")
  );
}

/* =========================
   LOGIN ROUTES
========================= */

// ADMIN LOGIN
app.post("/api/login/admin", (req, res) => {
  const { username, password } = req.body;
  const admins = readJSON("admins.json");

  const user = admins.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) return res.status(401).json({ error: "Invalid admin login" });

  res.json({ success: true, user });
});

// DRIVER LOGIN
app.post("/api/login/driver", (req, res) => {
  const { username, password } = req.body;
  const drivers = readJSON("drivers.json");

  const user = drivers.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) return res.status(401).json({ error: "Invalid driver login" });

  res.json({ success: true, user });
});

// COMPANY LOGIN
app.post("/api/login/company", (req, res) => {
  const { username, password } = req.body;
  const companies = readJSON("companies.json");

  const user = companies.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) return res.status(401).json({ error: "Invalid company login" });

  res.json({ success: true, user });
});

/* =========================
   USERS LIST (ADMIN)
========================= */

app.get("/api/admin/drivers", (req, res) => {
  res.json(readJSON("drivers.json"));
});

app.get("/api/admin/companies", (req, res) => {
  res.json(readJSON("companies.json"));
});

app.get("/api/admin/dispatchers", (req, res) => {
  res.json(readJSON("dispatchers.json"));
});

/* =========================
   FALLBACK
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "API Not Found" });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("✅ Sunbeam Server running on port", PORT);
});