// ==========================================
// SUNBEAM TRANSPORTATION SERVER
// Stable Production Index
// ==========================================

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// Security Headers
// ==========================================
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ==========================================
// Middleware
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Static Files
// ==========================================
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// API ROUTES
// ==========================================
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admins", require("./routes/admins"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/dispatchers", require("./routes/dispatchers"));
app.use("/api/drivers", require("./routes/drivers"));

// ==========================================
// Health Check (مهم للـ Render)
// ==========================================
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// ==========================================
// 404 Handler
// ==========================================
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ==========================================
// Global Error Handler
// ==========================================
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
  console.log("=================================");
  console.log("Sunbeam Server Running");
  console.log("Port:", PORT);
  console.log("=================================");
});