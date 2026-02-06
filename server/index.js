const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error("❌ PORT IS NOT DEFINED");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.send("OK");
});

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});