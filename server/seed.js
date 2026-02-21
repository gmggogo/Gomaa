const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

const User = require("./models/User"); // تأكد إن المسار صح

async function seed() {
  try {
    // اتصال بقاعدة البيانات
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Mongo Connected");

    // حذف أي Admin قديم بنفس اليوزر
    await User.deleteMany({ username: "admin" });

    // تشفير الباسورد
    const hashedPassword = await bcrypt.hash("111111", 10);

    // إنشاء Admin جديد
    const adminUser = new User({
      name: "Main Admin",
      username: "admin",
      password: hashedPassword,
      role: "admin"
    });

    await adminUser.save();

    console.log("Admin Created ✅");
    process.exit(0);

  } catch (error) {
    console.error("Seed Error:", error);
    process.exit(1);
  }
}

seed();