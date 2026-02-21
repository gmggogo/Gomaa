require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ===========================
   Mongo Connection
=========================== */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/* ===========================
   User Schema
=========================== */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "admin" }
});

const User = mongoose.model("User", userSchema);

/* ===========================
   Create Admin (ONCE)
   DELETE AFTER USE
=========================== */
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

    res.send("Admin Created ✅");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ===========================
   Login Route
=========================== */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ===========================
   Test Route
=========================== */
app.get("/", (req, res) => {
  res.send("Sunbeam Server Running 🚀");
});

/* ===========================
   Start Server
=========================== */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});