// ===============================
// IMPORTS
// ===============================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// ===============================
// APP CONFIG
// ===============================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ===============================
// MONGODB CONNECTION
// ===============================
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("✅ MongoDB Connected");
})
.catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err.message);
});

// ===============================
// TEST ROUTE
// ===============================
app.get("/api/test", (req, res) => {
    res.json({ message: "Server & MongoDB working 🚀" });
});

// ===============================
// LOAD ROUTES
// ===============================
try {
    app.use("/api/admins", require("./routes/admins"));
    app.use("/api/companies", require("./routes/companies"));
    app.use("/api/drivers", require("./routes/drivers"));
    app.use("/api/dispatchers", require("./routes/dispatchers"));
    console.log("✅ Routes Loaded");
} catch (err) {
    console.log("⚠️ Routes not loaded yet");
}

// ===============================
// STATIC FILES (مهم جداً)
// ===============================
const publicPath = path.join(__dirname, "../public");
app.use(express.static(publicPath));

// أي Route مش API يرجع index.html
app.get("*", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
    console.log(`🚀 Sunbeam Server running on port ${PORT}`);
});