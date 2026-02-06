const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;

// middleware
app.use(express.json());

// ✅ API routes (مهم تيجي قبل static)
const usersRouter = require("./api/users");
app.use("/api/users", usersRouter);

// ✅ static files
app.use(express.static(path.join(__dirname, "public")));

// health check
app.get("/health", (req, res) => {
  res.send("OK");
});

// ❌ مفيش wildcard redirect
// ❌ متكتبش app.get("*")

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});