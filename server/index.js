const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

/* =======================
   MIDDLEWARE
======================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =======================
   STATIC FILES
======================= */
app.use(express.static(path.join(__dirname, "public")));

/* =======================
   ROUTES
======================= */

// AUTH
app.use("/api/auth", require("./routes/auth"));

// ADMINS
app.use("/api/admins", require("./routes/admins"));

// COMPANIES
app.use("/api/companies", require("./routes/companies"));

// DISPATCHERS
app.use("/api/dispatchers", require("./routes/dispatchers"));

// DRIVERS
app.use("/api/drivers", require("./routes/drivers"));

/* =======================
   HEALTH CHECK
======================= */
app.get("/api/health", (req, res) => {
  res.json({ status: "Sunbeam Server Running ✅" });
});

/* =======================
   FALLBACK
======================= */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* =======================
   START SERVER
======================= */
app.listen(PORT, () => {
  console.log("Sunbeam Server running on port " + PORT);
});