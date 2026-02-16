// ========================================
// IMPORTS
// ========================================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// ========================================
// APP CONFIG
// ========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ========================================
// MONGODB CONNECTION
// ========================================
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("✅ MongoDB Connected");
})
.catch((err) => {
  console.error("❌ MongoDB Connection Failed:", err.message);
});

// ========================================
// HEALTH / TEST ROUTE
// ========================================
app.get("/api/test", (req, res) => {
  res.json({
    server: "running",
    mongo: mongoose.connection.readyState === 1
  });
});

// ========================================
// ROUTES (لو عندك فولدر routes)
// ========================================
try {
  app.use("/api/admins", require("./routes/admins"));
  app.use("/api/companies", require("./routes/companies"));
  app.use("/api/drivers", require("./routes/drivers"));
  app.use("/api/dispatchers", require("./routes/dispatchers"));

  console.log("✅ Routes Loaded");
} catch (err) {
  console.log("⚠️ Routes not loaded (maybe not created yet)");
}

// ========================================
// STATIC FILES (Frontend)
// ========================================
app.use(express.static(path.join(__dirname, "../public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ========================================
// START SERVER
// ========================================
app.listen(PORT, () => {
  console.log(`🚀 Sunbeam Server running on port ${PORT}`);
});