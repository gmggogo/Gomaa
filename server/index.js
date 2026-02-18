require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

/* ================= SECURITY ================= */

app.use(helmet());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many requests"
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ================= STATIC ================= */

app.use(express.static(path.join(__dirname, "public")));

/* ================= USERS STORAGE ================= */

const usersPath = path.join(__dirname, "data/users.json");

if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, JSON.stringify([]));
}

function readUsers() {
  return JSON.parse(fs.readFileSync(usersPath));
}

function saveUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

/* ================= AUTH ================= */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid Token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role)
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

/* ================= ROUTES ================= */

/* Register */
app.post("/api/register", async (req, res) => {
  const { username, password, role } = req.body;

  const users = readUsers();
  if (users.find(u => u.username === username))
    return res.status(400).json({ message: "User Exists" });

  const hashed = await bcrypt.hash(password, 12);

  users.push({ username, password: hashed, role });
  saveUsers(users);

  res.json({ message: "User Created" });
});

/* Login */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const users = readUsers();
  const user = users.find(u => u.username === username);

  if (!user)
    return res.status(400).json({ message: "User Not Found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)
    return res.status(400).json({ message: "Wrong Password" });

  const token = jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict"
  });

  res.json({ message: "Login Success", role: user.role });
});

/* Get All Users (Admin Only) */
app.get("/api/users", verifyToken, requireRole("admin"), (req, res) => {
  const users = readUsers().map(u => ({
    username: u.username,
    role: u.role
  }));

  res.json(users);
});

/* Logout */
app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged Out" });
});

/* ================= ERROR HANDLING ================= */

app.use((req, res) => {
  res.status(404).send("Page Not Found");
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server Error" });
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`Sunbeam Secure Server Running on ${PORT}`);
});