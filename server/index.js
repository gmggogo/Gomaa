const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   HELPERS
====================== */
function readJSON(file) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", file), "utf8")
  );
}

function writeJSON(file, data) {
  fs.writeFileSync(
    path.join(__dirname, "data", file),
    JSON.stringify(data, null, 2)
  );
}

/* ======================
   USERS API
====================== */
app.get("/api/users", (req, res) => {
  const role = req.query.role;
  if (!role) return res.json([]);

  try {
    const users = readJSON(`${role}s.json`);
    res.json(users);
  } catch {
    res.status(404).json({ error: "Role not found" });
  }
});

app.post("/api/users", (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const file = `${role}s.json`;
  const users = readJSON(file);

  const user = {
    id: Date.now(),
    name,
    username,
    password,
    role,
    active: true
  };

  users.push(user);
  writeJSON(file, users);
  res.json(user);
});

app.put("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const { role, ...updates } = req.body;

  const files = ["admins.json", "companies.json", "dispatchers.json", "drivers.json"];

  for (const file of files) {
    const users = readJSON(file);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      writeJSON(file, users);
      return res.json(users[index]);
    }
  }

  res.status(404).json({ error: "User not found" });
});

app.delete("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const files = ["admins.json", "companies.json", "dispatchers.json", "drivers.json"];

  for (const file of files) {
    let users = readJSON(file);
    const len = users.length;
    users = users.filter(u => u.id !== id);
    if (users.length !== len) {
      writeJSON(file, users);
      return res.json({ success: true });
    }
  }

  res.status(404).json({ error: "User not found" });
});

/* ======================
   FALLBACK
====================== */
app.use((req, res) => {
  res.status(404).json({ error: "API Not Found" });
});

app.listen(PORT, () => {
  console.log("SERVER RUNNING ON", PORT);
});