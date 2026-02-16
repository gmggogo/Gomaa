// ===============================
// SUNBEAM TRANSPORTATION SERVER
// FINAL CLEAN VERSION
// ===============================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// STATIC FILES
// ===============================

// public folder inside /server
const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

// Home route
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ===============================
// ROUTES
// ===============================

try {
  app.use("/api/admins", require("./routes/admins"));
  console.log("Loaded route: /api/admins");
} catch (e) {
  console.log("Admins route not found");
}

try {
  app.use("/api/companies", require("./routes/companies"));
  console.log("Loaded route: /api/companies");
} catch (e) {
  console.log("Companies route not found");
}

try {
  app.use("/api/drivers", require("./routes/drivers"));
  console.log("Loaded route: /api/drivers");
} catch (e) {
  console.log("Drivers route not found");
}

try {
  app.use("/api/dispatchers", require("./routes/dispatchers"));
  console.log("Loaded route: /api/dispatchers");
} catch (e) {
  console.log("Dispatchers route not found");
}

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Sunbeam Transportation",
    port: PORT,
  });
});

// ===============================
// 404 HANDLER
// ===============================

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// ===============================
// GLOBAL ERROR HANDLER
// ===============================

app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({
    error: "Internal Server Error",
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log("=================================");
  console.log("Sunbeam Server running on port", PORT);
  console.log("Public folder:", publicPath);
  console.log("=================================");
});