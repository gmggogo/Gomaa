require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* ==============================
   MONGODB CONNECT
============================== */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => {
  console.error("❌ MongoDB Error:", err);
  process.exit(1);
});

/* ==============================
   USER SCHEMA
============================== */

const userSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  password: String,
  role: {
    type: String,
    enum: ["admin", "company", "dispatcher", "driver"]
  }
});

const User = mongoose.model("User", userSchema);

/* ==============================
   AUTH MIDDLEWARE
============================== */

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ message: "Invalid token" });
  }
}

/* ==============================
   REGISTER
============================== */

app.post("/api/register", async (req, res) => {
  try {
    const { name, username, password, role } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      username,
      password: hashed,
      role
    });

    await newUser.save();

    res.json({ message: "User created successfully" });

  } catch (err) {
    res.status(400).json({ message: "User exists or error" });
  }
});

/* ==============================
   LOGIN
============================== */

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });

  if (!user) return res.status(400).json({ message: "User not found" });

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.status(400).json({ message: "Wrong password" });

  const token = jwt.sign(
    { id: user._id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    role: user.role,
    name: user.name
  });
});

/* ==============================
   TEST ROUTE
============================== */

app.get("/api/test", (req, res) => {
  res.json({ message: "Sunbeam Mongo API Working 🚀" });
});

/* ==============================
   SERVE PUBLIC
============================== */

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

/* ==============================
   START SERVER
============================== */

app.listen(PORT, () => {
  console.log("=====================================");
  console.log(`🚀 Sunbeam Mongo Server running on ${PORT}`);
  console.log("=====================================");
});