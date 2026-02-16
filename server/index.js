/* =========================
   TEMP DATABASE (Memory)
========================= */

let admins = [
  { id: 1, name: "Main Admin", username: "admin", password: "123456", role: "admin" }
];

let companies = [];
let dispatchers = [];
let drivers = [];

/* =========================
   HELPER
========================= */

function getCollection(role) {
  if (role === "admin") return admins;
  if (role === "company") return companies;
  if (role === "dispatcher") return dispatchers;
  if (role === "driver") return drivers;
  return null;
}

/* =========================
   LOGIN
========================= */

app.post("/api/login/:role", (req, res) => {
  const { role } = req.params;
  const { username, password } = req.body;

  const collection = getCollection(role);
  if (!collection) return res.status(400).json({ error: "Invalid role" });

  const user = collection.find(
    u => u.username === username && u.password === password
  );

  if (!user) return res.status(401).json({ error: "Invalid login" });

  res.json({
    success: true,
    role: role,
    name: user.name
  });
});

/* =========================
   CRUD BY ROLE
========================= */

app.get("/api/:role", (req, res) => {
  const collection = getCollection(req.params.role);
  if (!collection) return res.status(400).json({ error: "Invalid role" });
  res.json(collection);
});

app.post("/api/:role", (req, res) => {
  const collection = getCollection(req.params.role);
  if (!collection) return res.status(400).json({ error: "Invalid role" });

  const { name, username, password } = req.body;

  const newUser = {
    id: Date.now(),
    name,
    username,
    password,
    role: req.params.role
  };

  collection.push(newUser);
  res.json({ success: true });
});

app.put("/api/:role/:id", (req, res) => {
  const collection = getCollection(req.params.role);
  if (!collection) return res.status(400).json({ error: "Invalid role" });

  const user = collection.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });

  user.name = req.body.name;
  user.username = req.body.username;
  if (req.body.password) user.password = req.body.password;

  res.json({ success: true });
});

app.delete("/api/:role/:id", (req, res) => {
  const collection = getCollection(req.params.role);
  if (!collection) return res.status(400).json({ error: "Invalid role" });

  const index = collection.findIndex(u => u.id == req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  collection.splice(index, 1);
  res.json({ success: true });
});