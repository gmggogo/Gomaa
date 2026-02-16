const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = "SUNBEAM_SECRET_KEY";

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  admin: path.join(DATA_DIR, "admins.json"),
  dispatcher: path.join(DATA_DIR, "dispatchers.json")
};

function readFile(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return JSON.parse(fs.readFileSync(file));
}

function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function createDefaultAdmin() {
  const admins = readFile(FILES.admin);
  if (admins.length === 0) {
    const hashed = await bcrypt.hash("admin123", 10);
    admins.push({
      id: Date.now(),
      name: "Super Admin",
      username: "admin",
      password: hashed,
      active: true
    });
    saveFile(FILES.admin, admins);
    console.log("Default Admin Created → username: admin / password: admin123");
  }
}
createDefaultAdmin();

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

app.post("/api/login", async (req, res) => {

  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });

  let roleFound = null;
  let userFound = null;

  for (let role of Object.keys(FILES)) {
    const users = readFile(FILES[role]);
    const user = users.find(u => u.username === username && u.active);
    if (user) {
      roleFound = role;
      userFound = user;
      break;
    }
  }

  if (!userFound)
    return res.status(401).json({ error: "Wrong credentials" });

  const match = await bcrypt.compare(password, userFound.password);
  if (!match)
    return res.status(401).json({ error: "Wrong credentials" });

  const token = jwt.sign(
    { id: userFound.id, role: roleFound, name: userFound.name },
    SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    name: userFound.name,
    role: roleFound
  });
});

app.listen(PORT, () => {
  console.log("Sunbeam Server Running On Port " + PORT);
});