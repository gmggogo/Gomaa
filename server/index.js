// ===============================
// SUNBEAM TRANSPORTATION SERVER
// ===============================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// ===============================
// INIT
// ===============================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ===============================
// DATABASE (Optional MongoDB)
// ===============================
const mongoose = require("mongoose");

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ MongoDB Connection Failed:", err.message));
} else {
  console.log("⚠️ No MONGO_URI found. Running without MongoDB.");
}

// ===============================
// TEST ROUTE
// ===============================
app.get("/api/test", (req, res) => {
  res.json({ message: "Sunbeam API working 🚀" });
});

// ===============================
// LOAD ROUTES (if exist)
// ===============================
const routesPath = path.join(__dirname, "routes");

if (fs.existsSync(routesPath)) {
  fs.readdirSync(routesPath).forEach(file => {
    if (file.endsWith(".js")) {
      const route = require(`./routes/${file}`);
      app.use("/api", route);
      console.log(`📦 Loaded route: /api/${file.replace(".js","")}`);
    }
  });
} else {
  console.log("⚠️ No routes folder found");
}

// ===============================
// STATIC PUBLIC FOLDER
// ===============================
const publicPath = path.join(__dirname, "public");

if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log("📂 Public folder loaded");
} else {
  console.log("⚠️ Public folder not found");
}

// ===============================
// DEFAULT ROUTE (Homepage)
// ===============================
app.get("/", (req, res) => {
  const indexFile = path.join(__dirname, "public", "index.html");

  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.send("Sunbeam Server Running 🚀");
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log("===================================");
  console.log(`🚀 Sunbeam Server running on port ${PORT}`);
  console.log(`🌍 Available at: http://localhost:${PORT}`);
  console.log("===================================");
});