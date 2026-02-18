const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin","company","dispatcher","driver"],
    required: true
  },
  enabled: { type: Boolean, default: true }
},{ timestamps:true });

module.exports = mongoose.model("User", userSchema);