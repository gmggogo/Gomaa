const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   TEMP DATABASE (Memory)
====================== */

let db = {
  admins: [
    { id: 1, name: "Main Admin", username: "admin", password: "123456" }
  ],
  companies: [],
  dispatchers: [],
  drivers: []
};

/* ======================
   LOGIN (TEMP)
====================== */

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  for (let role in db) {
    const user = db[role].find(
      u => u.username === username && u.password === password
    );

    if (user) {
      return res.json({ success: true, role });
    }
  }

  res.status(401).json({ error: "Invalid login" });
});

/* ======================
   GENERIC CRUD
====================== */

app.get("/api/:role", (req, res) => {
  const role = req.params.role;
  if (!db[role]) return res.status(400).json({ error: "Invalid role" });
  res.json(db[role]);
});

app.post("/api/:role", (req, res) => {
  const role = req.params.role;
  if (!db[role]) return res.status(400).json({ error: "Invalid role" });

  const newUser = {
    id: Date.now(),
    name: req.body.name,
    username: req.body.username,
    password: req.body.password
  };

  db[role].push(newUser);
  res.json({ success: true });
});

app.delete("/api/:role/:id", (req, res) => {
  const role = req.params.role;
  const id = parseInt(req.params.id);

  if (!db[role]) return res.status(400).json({ error: "Invalid role" });

  db[role] = db[role].filter(u => u.id !== id);
  res.json({ success: true });
});

/* ====================== */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});