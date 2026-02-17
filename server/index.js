const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

const PORT = process.env.PORT || 10000;

/* ===========================
   MongoDB Connect
=========================== */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log("Mongo Error:",err));

/* ===========================
   User Schema
=========================== */
const userSchema = new mongoose.Schema({
  name:String,
  username:String,
  password:String,
  role:String
},{timestamps:true});

const User = mongoose.model("User",userSchema);

/* ===========================
   GET Users by Role
=========================== */
app.get("/api/users/:role", async (req,res)=>{
  const users = await User.find({role:req.params.role});
  res.json(users);
});

/* ===========================
   Add User
=========================== */
app.post("/api/users/:role", async (req,res)=>{
  const {name,username,password} = req.body;

  const hashed = await bcrypt.hash(password,10);

  const newUser = new User({
    name,
    username,
    password:hashed,
    role:req.params.role
  });

  await newUser.save();
  res.json({message:"User added"});
});

/* ===========================
   Delete User
=========================== */
app.delete("/api/users/:role/:id", async (req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({message:"Deleted"});
});

/* ===========================
   Login
=========================== */
app.post("/api/login", async (req,res)=>{
  const {username,password,role} = req.body;

  const user = await User.findOne({username,role});
  if(!user) return res.status(400).json({message:"User not found"});

  const match = await bcrypt.compare(password,user.password);
  if(!match) return res.status(400).json({message:"Wrong password"});

  res.json({message:"Login success",user});
});

app.listen(PORT,()=>console.log("Server running on",PORT));