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
function readJSON(file) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", file), "utf8")
  );
}

function writeJSON(file, data) {
  fs.writeFileSync(
    path.join(__dirname, "data", file),
    JSON.stringify(data, null, 2)
  );
}

function apiFor(file) {
  return `/api/${file.replace(".json", "")}`;
}

/* =========================
   GENERIC CRUD
========================= */
function registerCRUD(file) {
  const api = apiFor(file);

  app.get(api, (req, res) => {
    res.json(readJSON(file));
  });

  app.post(api, (req, res) => {
    const list = readJSON(file);
    const item = {
      id: Date.now(),
      active: true,
      ...req.body
    };
    list.push(item);
    writeJSON(file, list);
    res.json(item);
  });

  app.put(`${api}/:id`, (req, res) => {
    const list = readJSON(file);
    const idx = list.findIndex(i => i.id == req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });

    list[idx] = { ...list[idx], ...req.body };
    writeJSON(file, list);
    res.json(list[idx]);
  });

  app.delete(`${api}/:id`, (req, res) => {
    const list = readJSON(file).filter(i => i.id != req.params.id);
    writeJSON(file, list);
    res.json({ ok: true });
  });
}

/* =========================
   REGISTER ALL USERS
========================= */
registerCRUD("admins.json");
registerCRUD("companies.json");
registerCRUD("drivers.json");
registerCRUD("dispatchers.json");

/* =========================
   FALLBACK
========================= */
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API Not Found" });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});