require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

/* ======================
   MONGODB CONNECTION
====================== */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log("Mongo Error:",err));

/* ======================
   USER MODEL
====================== */
const userSchema = new mongoose.Schema({
  name:String,
  username:String,
  password:String,
  role:String,
  active:{ type:Boolean, default:true }
});

const User = mongoose.model("User", userSchema);

/* ======================
   AUTH MIDDLEWARE
====================== */
function auth(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.status(401).json({msg:"No token"});

  try{
    const decoded = jwt.verify(token,process.env.JWT_SECRET);
    req.user = decoded;
    next();
  }catch{
    res.status(401).json({msg:"Invalid token"});
  }
}

/* ======================
   ADD USER
====================== */
app.post("/api/users", auth, async(req,res)=>{
  const {name,username,password,role} = req.body;

  const hash = await bcrypt.hash(password,10);

  const newUser = new User({
    name,
    username,
    password:hash,
    role
  });

  await newUser.save();
  res.json({msg:"User created"});
});

/* ======================
   GET USERS BY ROLE
====================== */
app.get("/api/users/:role", auth, async(req,res)=>{
  const users = await User.find({role:req.params.role});
  res.json(users);
});

/* ======================
   LOGIN
====================== */
app.post("/api/login", async(req,res)=>{
  const {username,password} = req.body;

  const user = await User.findOne({username});
  if(!user) return res.status(400).json({msg:"User not found"});
  if(!user.active) return res.status(400).json({msg:"Account disabled"});

  const valid = await bcrypt.compare(password,user.password);
  if(!valid) return res.status(400).json({msg:"Wrong password"});

  const token = jwt.sign(
    {id:user._id,role:user.role},
    process.env.JWT_SECRET,
    {expiresIn:"8h"}
  );

  res.json({token,role:user.role});
});

/* ======================
   ENABLE / DISABLE
====================== */
app.put("/api/users/toggle/:id", auth, async(req,res)=>{
  const user = await User.findById(req.params.id);
  user.active = !user.active;
  await user.save();
  res.json({msg:"Updated"});
});

/* ======================
   EDIT USER
====================== */
app.put("/api/users/:id", auth, async(req,res)=>{
  const {name,username,password} = req.body;

  const updateData = {name,username};

  if(password){
    updateData.password = await bcrypt.hash(password,10);
  }

  await User.findByIdAndUpdate(req.params.id,updateData);
  res.json({msg:"Updated"});
});

/* ======================
   DELETE
====================== */
app.delete("/api/users/:id", auth, async(req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({msg:"Deleted"});
});

/* ======================
   STATIC
====================== */
app.use(express.static(path.join(__dirname,"../public")));

app.listen(process.env.PORT || 10000,()=>{
  console.log("Server Running...");
});