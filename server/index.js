require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("MongoDB Connected 🔥"))
.catch(err=> console.log(err));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));

app.use(express.static(path.join(__dirname, "../public")));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> console.log("Sunbeam Server running on", PORT));