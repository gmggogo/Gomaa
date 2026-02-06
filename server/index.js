const express = require("express");
const app = express();

// مهم جدًا لRender
const PORT = process.env.PORT || 3000;

// middleware
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("Sunbeam Server is running ✅");
});

// health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// لازم listen على PORT
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});