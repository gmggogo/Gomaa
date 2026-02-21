require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();

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
   ENV SAFE DEFAULTS
========================= */
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "temporary_secret_key";

/* =========================
   MONGO CONNECT
========================= */
if (!MONGO_URI) {
  console.log("❌ MONGO_URI NOT FOUND");
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Mongo Connected"))
    .catch(err => console.log("Mongo Error:", err));
}

/* =========================
   USER MODEL
========================= */
const userSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  password: String,
  role: { type: String, default: "admin" }
});

const User = mongoose.model("User", userSchema);

/* =========================
   CREATE ADMIN (RUN ONCE)
========================= */
app.get("/create-admin", async (req, res) => {
  try {
    const existing = await User.findOne({ username: "admin" });
    if (existing) return res.send("Admin already exists");

    const hashed = await bcrypt.hash("111111", 10);

    await User.create({
      name: "Admin",
      username: "admin",
      password: hashed,
      role: "admin"
    });

    res.send("Admin Created ✅ username: admin password: 111111");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating admin");
  }
});

/* =========================
   LOGIN
========================= */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: "Missing credentials" });

    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        name: user.name,
        role: user.role
      }
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});