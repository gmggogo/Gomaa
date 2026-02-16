const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ===================================
   MEMORY DATABASE (Separate Arrays)
=================================== */

let admins = [
  { id: 1, name: "Main Admin", username: "admin", password: "123456" }
];

let companies = [];
let dispatchers = [];
let drivers = [];

/* ===================================
   HELPER FUNCTION
=================================== */

function getArray(role) {
  if (role === "admin") return admins;
  if (role === "company") return companies;
  if (role === "dispatcher") return dispatchers;
  if (role === "driver") return drivers;
  return null;
}

/* ===================================
   GENERIC CRUD API
=================================== */

app.get("/api/:role", (req, res) => {
  const arr = getArray(req.params.role);
  if (!arr) return res.status(400).json({ error: "Invalid role" });
  res.json(arr);
});

app.post("/api/:role", (req, res) => {
  const arr = getArray(req.params.role);
  if (!arr) return res.status(400).json({ error: "Invalid role" });

  const { name, username, password } = req.body;

  const newUser = {
    id: Date.now(),
    name,
    username,
    password
  };

  arr.push(newUser);
  res.json({ success: true });
});

app.put("/api/:role/:id", (req, res) => {
  const arr = getArray(req.params.role);
  if (!arr) return res.status(400).json({ error: "Invalid role" });

  const id = parseInt(req.params.id);
  const user = arr.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "Not found" });

  user.name = req.body.name;
  user.username = req.body.username;
  if (req.body.password) user.password = req.body.password;

  res.json({ success: true });
});

app.delete("/api/:role/:id", (req, res) => {
  const arr = getArray(req.params.role);
  if (!arr) return res.status(400).json({ error: "Invalid role" });

  const id = parseInt(req.params.id);
  const index = arr.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  arr.splice(index, 1);
  res.json({ success: true });
});

/* =================================== */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});