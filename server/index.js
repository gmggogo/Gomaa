const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== LOGIN API =====
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "users.json"), "utf8")
  );

  const user = users.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid login" });
  }

  res.json({
    success: true,
    role: user.role,
    name: user.username
  });
});

// ===== DRIVER PAGE =====
app.get("/driver/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/driver/login.html"));
});

app.listen(PORT, () => {
  console.log("Sunbeam server running on port", PORT);
});