const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =====================================
   TEMP ADMIN USER (FOR FIRST LOGIN)
===================================== */

const TEMP_ADMIN = {
  id: 1,
  name: "Main Admin",
  username: "admin",
  password: "123456",
  role: "admin"
};

/* =====================================
   LOGIN ROUTE
===================================== */

app.post("/api/login/admin", (req, res) => {
  const { username, password } = req.body;

  if (
    username === TEMP_ADMIN.username &&
    password === TEMP_ADMIN.password
  ) {
    return res.json({
      success: true,
      token: "temp-token-123",
      role: "admin",
      name: TEMP_ADMIN.name
    });
  }

  return res.status(401).json({
    success: false,
    error: "Invalid username or password"
  });
});

/* =====================================
   TEST ROUTE
===================================== */

app.get("/api/test", (req, res) => {
  res.send("Server is working");
});

/* =====================================
   START SERVER
===================================== */

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});