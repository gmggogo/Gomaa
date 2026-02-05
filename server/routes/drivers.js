const express = require("express");
const router = express.Router();

// لوجن درايفر
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  // مثال ثابت (بعد كده نربطه بقاعدة بيانات)
  if (email === "driver@hotmail.com" && password === "1234") {
    return res.json({
      success: true,
      role: "driver",
      email
    });
  }

  res.status(401).json({ error: "invalid login" });
});

// test
router.get("/test", (req, res) => {
  res.json({ driverRoute: true });
});

module.exports = router;