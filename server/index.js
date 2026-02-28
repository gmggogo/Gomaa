require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();

/* =========================
   ENV
========================= */
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   MONGO CONNECT
========================= */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Mongo Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

/* =========================
   USER MODEL
========================= */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "dispatcher", "driver", "company"],
    required: true
  },
  active: { type: Boolean, default: true }
});

const User = mongoose.model("User", userSchema);

/* =========================
   TRIP MODEL
========================= */
const tripSchema = new mongoose.Schema({
  tripNumber: String,
  type: String,
  company: String,

  entryName: String,
  entryPhone: String,

  clientName: String,
  clientPhone: String,

  pickup: String,
  dropoff: String,
  stops: [String],

  tripDate: String,
  tripTime: String,

  notes: String,

  status: { type: String, default: "Scheduled" },
  createdAt: { type: Date, default: Date.now }
});

const Trip = mongoose.model("Trip", tripSchema);

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

    res.send("Admin Created (admin / 111111)");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating admin");
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: "Missing credentials" });

    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    if (!user.active)
      return res.status(403).json({ message: "User disabled" });

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
        id: user._id,
        name: user.name,
        role: user.role
      }
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   USERS ROUTES
========================= */

app.get("/api/users/:role", async (req, res) => {
  try {
    const role = req.params.role;

    if (!["admin", "dispatcher", "driver", "company"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    const users = await User.find({ role });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error loading users" });
  }
});

app.post("/api/users/:role", async (req, res) => {
  try {
    const role = req.params.role;

    if (!["admin", "dispatcher", "driver", "company"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    const { name, username, password } = req.body;

    if (!name || !username || !password)
      return res.status(400).json({ message: "Missing fields" });

    const exists = await User.findOne({ username });
    if (exists)
      return res.status(400).json({ message: "Username exists" });

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      username,
      password: hashed,
      role
    });

    res.json(newUser);

  } catch (err) {
    res.status(500).json({ message: "Error creating user" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { name, username, password } = req.body;

    const updateData = { name, username };

    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updated);

  } catch (err) {
    res.status(500).json({ message: "Error updating user" });
  }
});

app.patch("/api/users/:id/toggle", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user)
      return res.status(404).json({ message: "User not found" });

    user.active = !user.active;
    await user.save();

    res.json(user);

  } catch (err) {
    res.status(500).json({ message: "Error toggling user" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user" });
  }
});

/* =========================
   TRIPS ROUTES
========================= */

app.post("/api/trips", async (req, res) => {
  try {
    const trip = await Trip.create(req.body);
    res.status(200).json(trip);
  } catch (err) {
    res.status(500).json({ message: "Error creating trip" });
  }
});

app.get("/api/trips/company/:company", async (req, res) => {
  try {
    const trips = await Trip.find({ company: req.params.company })
      .sort({ createdAt: -1 });

    res.status(200).json(trips);
  } catch (err) {
    res.status(500).json({ message: "Error loading trips" });
  }
});

app.put("/api/trips/:id", async (req, res) => {
  try {
    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: "Error updating trip" });
  }
});

app.delete("/api/trips/:id", async (req, res) => {
  try {
    await Trip.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting trip" });
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
  console.log("🚀 Server running on port " + PORT);
});