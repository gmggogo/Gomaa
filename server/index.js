require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

/* =====================
   CONNECT MONGO
===================== */
mongoose.connect(MONGO_URI)
.then(()=>console.log("Mongo Connected"))
.catch(err=>console.log(err));

/* =====================
   USER MODEL
===================== */
const userSchema = new mongoose.Schema({
  name:String,
  username:{type:String,unique:true},
  password:String,
  role:String,
  active:{type:Boolean,default:true}
});

const User = mongoose.model("User",userSchema);

/* =====================
   LOGIN
===================== */
app.post("/api/auth/login",async(req,res)=>{
  try{
    const { username,password } = req.body;

    const user = await User.findOne({ username });
    if(!user) return res.status(400).json({message:"Invalid credentials"});
    if(!user.active) return res.status(403).json({message:"User disabled"});

    const match = await bcrypt.compare(password,user.password);
    if(!match) return res.status(400).json({message:"Invalid credentials"});

    res.json({ role:user.role });
  }catch(err){
    console.log(err);
    res.status(500).json({message:"Server error"});
  }
});

/* =====================
   GET USERS
===================== */
app.get("/api/users/:role",async(req,res)=>{
  const role = req.params.role.slice(0,-1);
  const users = await User.find({ role });
  res.json(users);
});

/* =====================
   ADD USER
===================== */
app.post("/api/users/:role",async(req,res)=>{
  const role = req.params.role.slice(0,-1);
  const { name,username,password } = req.body;

  const exists = await User.findOne({ username });
  if(exists)
    return res.status(400).json({message:"Username exists"});

  const hashed = await bcrypt.hash(password,10);

  const newUser = await User.create({
    name,
    username,
    password:hashed,
    role
  });

  res.json(newUser);
});

/* =====================
   UPDATE USER
===================== */
app.put("/api/users/:role/:id",async(req,res)=>{
  const { name,username,password } = req.body;

  const updateData = { name,username };

  if(password && password.trim()!==""){
    updateData.password = await bcrypt.hash(password,10);
  }

  await User.findByIdAndUpdate(req.params.id,updateData);
  res.json({message:"Updated"});
});

/* =====================
   TOGGLE ACTIVE
===================== */
app.patch("/api/users/:role/:id/toggle",async(req,res)=>{
  const user = await User.findById(req.params.id);
  user.active = !user.active;
  await user.save();
  res.json(user);
});

/* =====================
   DELETE USER
===================== */
app.delete("/api/users/:role/:id",async(req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({message:"Deleted"});
});

/* =====================
   ROOT
===================== */
app.get("/",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,()=>{
  console.log("Server running on "+PORT);
});