const express = require("express");
const app = express();
const path = require("path");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   ROUTES
====================== */
const authRoutes = require("./routes/auth");

app.use("/api/auth", authRoutes);

/* ======================
   USERS API (ADMIN)
====================== */
const fs = require("fs");

function readData(file) {
  const filePath = path.join(__dirname, "data", file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeData(file, data) {
  const filePath = path.join(__dirname, "data", file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

app.get("/api/admins", (req, res) => {
  res.json(readData("admins.json"));
});

app.post("/api/admins", (req, res) => {
  const list = readData("admins.json");
  list.push({ ...req.body, id: Date.now(), active: true });
  writeData("admins.json", list);
  res.json({ success: true });
});

app.get("/api/companies", (req, res) => {
  res.json(readData("companies.json"));
});

app.post("/api/companies", (req, res) => {
  const list = readData("companies.json");
  list.push({ ...req.body, id: Date.now(), active: true });
  writeData("companies.json", list);
  res.json({ success: true });
});

app.get("/api/dispatchers", (req, res) => {
  res.json(readData("dispatchers.json"));
});

app.post("/api/dispatchers", (req, res) => {
  const list = readData("dispatchers.json");
  list.push({ ...req.body, id: Date.now(), active: true });
  writeData("dispatchers.json", list);
  res.json({ success: true });
});

app.get("/api/drivers", (req, res) => {
  res.json(readData("drivers.json"));
});

app.post("/api/drivers", (req, res) => {
  const list = readData("drivers.json");
  list.push({ ...req.body, id: Date.now(), active: true });
  writeData("drivers.json", list);
  res.json({ success: true });
});

/* ======================
   START
====================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});