const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const User = require("./models/User"); // تأكد المسار صح

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Mongo Connected");

    const hashedPassword = await bcrypt.hash("111111", 10);

    await User.deleteMany({ username: "admin" });

    await User.create({
      username: "admin",
      password: hashedPassword,
      role: "admin"
    });

    console.log("Admin Created ✅");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();