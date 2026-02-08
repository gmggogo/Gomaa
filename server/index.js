const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   HELPERS
========================= */
const dataDir = path.join(__dirname, "data");

function read(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
}

function write(file, data) {
  fs.writeFileSync(
    path.join(dataDir, file),
    JSON.stringify(data, null, 2)
  );
}

/* =========================
   GENERIC CRUD
========================= */
function crud(file) {
  const r = express.Router();

  r.get("/", (req, res) => {
    res.json(read(file));
  });

  r.post("/", (req, res) => {
    const list = read(file);
    const item = {
      id: Date.now(),
      active: true,
      ...req.body
    };
    list.push(item);
    write(file, list);
    res.json(item);
  });

  r.put("/:id", (req, res) => {
    const list = read(file);
    const i = list.findIndex(x => x.id == req.params.id);
    if (i === -1) return res.status(404).json({ error: "Not found" });

    list[i] = { ...list[i], ...req.body };
    write(file, list);
    res.json(list[i]);
  });

  r.delete("/:id", (req, res) => {
    const list = read(file).filter(x => x.id != req.params.id);
    write(file, list);
    res.json({ success: true });
  });

  return r;
}

/* =========================
   API ROUTES (FINAL)
========================= */
app.use("/api/admins", crud("admins.json"));
app.use("/api/companies", crud("companies.json"));
app.use("/api/drivers", crud("drivers.json"));
app.use("/api/dispatchers", crud("dispatchers.json"));

/* =========================
   LOGIN (SAFE – NO MIXING)
========================= */
app.post("/api/login/:role", (req, res) => {
  const { role } = req.params;
  const { username, password } = req.body;

  const map = {
    admin: "admins.json",
    company: "companies.json",
    driver: "drivers.json",
    dispatcher: "dispatchers.json"
  };

  if (!map[role]) return res.status(400).json({ error: "Invalid role" });

  const users = read(map[role]);
  const user = users.find(
    u => u.username === username && u.password === password && u.active
  );

  if (!user) return res.status(401).json({ error: "Invalid login" });

  res.json({
    id: user.id,
    name: user.name,
    role
  });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("SERVER RUNNING ON", PORT);
});