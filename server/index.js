const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function filePath(name) {
  return path.join(dataDir, name);
}

function read(file) {
  if (!fs.existsSync(filePath(file))) return [];
  return JSON.parse(fs.readFileSync(filePath(file), "utf8"));
}

function write(file, data) {
  fs.writeFileSync(filePath(file), JSON.stringify(data, null, 2));
}

function crud(file) {
  const api = `/api/${file.replace(".json", "")}`;

  app.get(api, (req, res) => {
    res.json(read(file));
  });

  app.post(api, async (req, res) => {
    const list = read(file);
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = {
      id: Date.now(),
      name,
      username,
      password: hash,
      active: true
    };

    list.push(user);
    write(file, list);
    res.json(user);
  });

  app.delete(`${api}/:id`, (req, res) => {
    const list = read(file).filter(u => u.id != req.params.id);
    write(file, list);
    res.json({ ok: true });
  });
}

crud("admins.json");
crud("companies.json");
crud("drivers.json");
crud("dispatchers.json");

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});