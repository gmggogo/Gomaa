const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =======================
   Middlewares
======================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =======================
   Static Folder
======================= */
const publicPath = path.join(__dirname, "public");

if (!fs.existsSync(publicPath)) {
  console.error("❌ PUBLIC FOLDER NOT FOUND");
} else {
  console.log("✅ Public folder found");
}

app.use(express.static(publicPath));

/* =======================
   API TEST ROUTE
======================= */
app.get("/api/test", (req, res) => {
  res.json({ message: "Sunbeam API working 🚀" });
});

/* =======================
   Root Route
======================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

/* =======================
   404 Handler
======================= */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

/* =======================
   Start Server
======================= */
app.listen(PORT, () => {
  console.log("===================================");
  console.log(`🚀 Sunbeam Server running on ${PORT}`);
  console.log("===================================");
});