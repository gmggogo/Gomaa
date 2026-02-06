const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error("❌ PORT IS NOT DEFINED");
  process.exit(1);
}

// static files
app.use(express.static(path.join(__dirname, "public")));

// health check
app.get("/health", (req, res) => {
  res.send("OK");
});

// الصفحة الرئيسية فقط
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ❌ شيلنا app.get("*") نهائي
// ❌ مفيش redirect عام

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});