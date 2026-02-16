const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   BASIC SECURITY HEADERS
========================= */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

/* =========================
   MIDDLEWARE
========================= */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

/* =========================
   STATIC FILES
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   ROUTES (Plug & Play)
========================= */
function safeUse(base, routePath) {
  try {
    const route = require(routePath);
    app.use(base, route);
    console.log(`✔ Loaded route: ${base}`);
  } catch (err) {
    console.log(`⚠ Route not found: ${base}`);
  }
}

// Auth
safeUse("/api", "./routes/auth");

// Roles
safeUse("/api/admins", "./routes/admins");
safeUse("/api/companies", "./routes/companies");
safeUse("/api/dispatchers", "./routes/dispatchers");
safeUse("/api/drivers", "./routes/drivers");

/* =========================
   DEFAULT ROUTE
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Sunbeam Server running on port " + PORT);
});