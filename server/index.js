// ===============================
// IMPORTS
// ===============================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// ===============================
// APP CONFIG
// ===============================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ===============================
// MONGODB CONNECTION
// ===============================
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing. Add it in Render Environment Variables.");
} else {
  mongoose
    .connect(MONGO_URI) // ✅ no deprecated options
    .then(() => console.log("🔥 MongoDB Connected Successfully"))
    .catch((err) => console.error("❌ MongoDB Connection Failed:", err.message));
}

// ===============================
// HEALTH / TEST ROUTES
// ===============================
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    mongoConnected: mongoose.connection.readyState === 1,
    message: "Server is running",
  });
});

// ===============================
// API ROUTES
// ===============================
const safeUse = (routePath, modulePath) => {
  try {
    app.use(routePath, require(modulePath));
    console.log(`✅ Loaded route: ${routePath} -> ${modulePath}`);
  } catch (err) {
    console.log(`⚠ Route not loaded: ${routePath} (${modulePath}) - ${err.message}`);
  }
};

safeUse("/api/admins", "./routes/admins");
safeUse("/api/companies", "./routes/companies");
safeUse("/api/drivers", "./routes/drivers");
safeUse("/api/dispatchers", "./routes/dispatchers");

// ===============================
// STATIC FILES
// ===============================
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// لو عندك Frontend SPA: أي رابط غير /api يروح على index.html
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Sunbeam Server running on port ${PORT}`);
});