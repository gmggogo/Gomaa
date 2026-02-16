// ===============================
// SUNBEAM TRANSPORTATION SERVER
// FINAL STABLE VERSION
// ===============================

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// ROUTES
// ===============================

app.use("/api/auth", require("./routes/auth"));
app.use("/api/admins", require("./routes/admins"));
app.use("/api/companies", require("./routes/companies"));
app.use("/api/dispatchers", require("./routes/dispatchers"));
app.use("/api/drivers", require("./routes/drivers"));

// ===============================
// DEFAULT ROUTE
// ===============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// ERROR HANDLER
// ===============================

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log("=================================");
  console.log("Sunbeam Server Running");
  console.log("Port:", PORT);
  console.log("=================================");
});