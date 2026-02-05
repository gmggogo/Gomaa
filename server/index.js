// ========================
// IMPORTS
// ========================
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// ========================
// APP INIT
// ========================
const app = express();
const PORT = process.env.PORT || 4000;

// ========================
// MIDDLEWARE
// ========================
app.use(cors());
app.use(express.json());

// ========================
// STATIC FILES (FRONTEND)
// ========================
app.use(express.static(path.join(__dirname, "../public")));

// ========================
// TEST ROUTE
// ========================
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", server: "Sunbeam API running" });
});

// ========================
// USERS API (LOGIN)
// ========================
const usersFile = path.join(__dirname, "users.json");

app.get("/api/users", (req, res) => {
  try {
    if (!fs.existsSync(usersFile)) {
      return res.json([]);
    }
    const data = fs.readFileSync(usersFile, "utf8");
    res.json(JSON.parse(data || "[]"));
  } catch (err) {
    res.status(500).json({ error: "Failed to read users" });
  }
});

// ========================
// FALLBACK → MAIN PAGE
// ========================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ========================
// START SERVER
// ========================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Sunbeam server running on port ${PORT}`);
});