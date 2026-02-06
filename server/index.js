const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// serve public folder
app.use(express.static(path.join(__dirname, "public")));

// health check
app.get("/health", (req, res) => {
  res.send("Sunbeam server running");
});

// fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});