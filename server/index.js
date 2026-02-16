const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// AUTH ROUTES
app.use("/api/auth", require("./routes/auth"));

app.listen(PORT, () => {
    console.log("Sunbeam Server running on port " + PORT);
});