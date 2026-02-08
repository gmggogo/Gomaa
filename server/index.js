const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs"); // ✅ مهم

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   IN-MEMORY USERS (TEMP)
====================== */
const admins = [];

/* ======================
   ADD ADMIN
====================== */
app.post("/api/admins", async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const hash = await bcrypt.hash(password, 10);

    admins.push({
      id: Date.now(),
      name,
      username,
      password: hash,
      status: "active"
    });

    res.json({ success: true });
  } catch (err) {
    console.error("ADD ADMIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ======================
   GET ADMINS
====================== */
app.get("/api/admins", (req, res) => {
  res.json(admins);
});

/* ======================
   START SERVER
====================== */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});