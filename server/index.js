const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC FILES
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   ROUTES
========================= */
app.use("/api", require("./routes/auth"));
app.use("/api/admins", require("./routes/admins"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/dispatchers", require("./routes/dispatchers"));
app.use("/api/drivers", require("./routes/drivers"));

/* =========================
   FALLBACK
========================= */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Sunbeam Server running on port ${PORT}`);
});