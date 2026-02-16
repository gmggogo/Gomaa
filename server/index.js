const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

/* ==============================
   Middlewares
============================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==============================
   Static Public Folder
============================== */
app.use(express.static(path.join(__dirname, "public")));

/* ==============================
   Routes
============================== */
const adminsRoute = require("./routes/admins");
const authRoute = require("./routes/auth");

app.use("/api/admins", adminsRoute);
app.use("/api/auth", authRoute);

/* ==============================
   Default Route
============================== */
app.get("/", (req, res) => {
  res.send("Sunbeam Server Running");
});

/* ==============================
   Start Server
============================== */
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});