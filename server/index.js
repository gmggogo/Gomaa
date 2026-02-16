const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   TEMP DATABASE (Memory)
========================= */

let admins = [
  {
    id: 1,
    name: "Main Admin",
    username: "admin",
    password: "123456",
    role: "admin"
  }
];

/* =========================
   LOGIN
========================= */

app.post("/api/login/admin", (req, res) => {
  const { username, password } = req.body;

  const user = admins.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid login" });
  }

  res.json({
    success: true,
    token: "temp-token",
    role: "admin",
    name: user.name
  });
});

/* =========================
   ADMIN CRUD
========================= */

app.get("/api/admins", (req, res) => {
  res.json(admins);
});

app.post("/api/admins", (req, res) => {
  const { name, username, password } = req.body;

  const newAdmin = {
    id: Date.now(),
    name,
    username,
    password,
    role: "admin"
  };

  admins.push(newAdmin);
  res.json({ success: true });
});

app.put("/api/admins/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const admin = admins.find(a => a.id === id);

  if (!admin) return res.status(404).json({ error: "Not found" });

  admin.name = req.body.name;
  admin.username = req.body.username;
  if (req.body.password) admin.password = req.body.password;

  res.json({ success: true });
});

app.delete("/api/admins/:id", (req, res) => {
  const id = parseInt(req.params.id);
  admins = admins.filter(a => a.id !== id);
  res.json({ success: true });
});

/* ========================= */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});