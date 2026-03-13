require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();

/* =========================
   ENV
========================= */

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC
========================= */

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   MONGO CONNECT
========================= */

mongoose.connect(MONGO_URI)
.then(()=>console.log("✅ Mongo Connected"))
.catch(err=>console.log("❌ Mongo Error:",err));

/* =========================
   USER MODEL
========================= */

const userSchema = new mongoose.Schema({

name:{type:String,required:true},
username:{type:String,unique:true,required:true},
password:{type:String,required:true},

role:{
type:String,
enum:["admin","dispatcher","driver","company"],
required:true
},

active:{type:Boolean,default:true}

})

const User = mongoose.model("User",userSchema)

/* =========================
   TRIP MODEL
========================= */

const tripSchema = new mongoose.Schema({

tripNumber:{type:String,unique:true,sparse:true},

type:{type:String,default:"company"},
company:{type:String,default:""},

entryName:{type:String,default:""},
entryPhone:{type:String,default:""},

clientName:{type:String,default:""},
clientPhone:{type:String,default:""},

pickup:{type:String,default:""},
dropoff:{type:String,default:""},

stops:{type:[String],default:[]},

tripDate:{type:String,default:""},
tripTime:{type:String,default:""},

notes:{type:String,default:""},

status:{type:String,default:"Scheduled"},

bookedAt:{type:Date,default:Date.now},
createdAt:{type:Date,default:Date.now}

})

tripSchema.index({tripNumber:1},{unique:true,sparse:true})
tripSchema.index({company:1})
tripSchema.index({createdAt:-1})

const Trip = mongoose.model("Trip",tripSchema)

/* =========================
   DRIVER SCHEDULE MODEL
========================= */

const driverScheduleSchema = new mongoose.Schema({

driverId:String,

phone:String,
address:String,

enabled:{
type:Boolean,
default:true
},

days:{
type:Object,
default:{}
}

})

const DriverSchedule = mongoose.model("DriverSchedule",driverScheduleSchema)

/* =========================
   DRIVER SCHEDULE API
========================= */

app.get("/api/driver-schedule",async(req,res)=>{

try{

const rows = await DriverSchedule.find()

const result={}

rows.forEach(r=>{

result[r.driverId]={

phone:r.phone,
address:r.address,
enabled:r.enabled,
days:r.days

}

})

res.json(result)

}catch(err){

console.log(err)
res.status(500).json({message:"schedule error"})

}

})

app.post("/api/driver-schedule",async(req,res)=>{

try{

const data=req.body

for(const id in data){

const s=data[id]

await DriverSchedule.findOneAndUpdate(

{driverId:id},

{

driverId:id,
phone:s.phone,
address:s.address,
enabled:s.enabled,
days:s.days

},

{upsert:true}

)

}

res.json({status:"saved"})

}catch(err){

console.log(err)
res.status(500).json({message:"save error"})

}

})

/* =========================
   CREATE ADMIN
========================= */

app.get("/create-admin",async(req,res)=>{

try{

const existing = await User.findOne({username:"admin"})

if(existing){

return res.send("Admin already exists")

}

const hashed = await bcrypt.hash("111111",10)

await User.create({

name:"Admin",
username:"admin",
password:hashed,
role:"admin"

})

res.send("Admin Created (admin / 111111)")

}catch(err){

console.log(err)
res.status(500).send("Error creating admin")

}

})

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login",async(req,res)=>{

try{

const {username,password}=req.body||{}

if(!username || !password){

return res.status(400).json({message:"Missing credentials"})

}

const user = await User.findOne({username})

if(!user){

return res.status(400).json({message:"Invalid credentials"})

}

if(!user.active){

return res.status(403).json({message:"User disabled"})

}

const match = await bcrypt.compare(password,user.password)

if(!match){

return res.status(400).json({message:"Invalid credentials"})

}

const token = jwt.sign(

{id:user._id,role:user.role,name:user.name},
JWT_SECRET,
{expiresIn:"1d"}

)

res.json({

token,

user:{
id:user._id,
name:user.name,
username:user.username,
role:user.role
}

})

}catch(err){

console.log(err)
res.status(500).json({message:"Server error"})

}

})

/* =========================
   USERS ROUTES
========================= */

app.get("/api/users/:role",async(req,res)=>{

try{

const role=req.params.role

if(!["admin","dispatcher","driver","company"].includes(role)){
return res.status(400).json({message:"Invalid role"})
}

const users = await User.find({role}).sort({name:1})

res.json(users)

}catch(err){

console.log(err)
res.status(500).json({message:"Error loading users"})

}

})

/* =========================
   TRIPS API
========================= */

app.post("/api/trips",async(req,res)=>{

try{

const trip = await Trip.create(req.body)

res.json(trip)

}catch(err){

console.log(err)
res.status(500).json({message:"Error creating trip"})

}

})

app.get("/api/trips",async(req,res)=>{

try{

const trips = await Trip.find().sort({createdAt:-1})

res.json(trips)

}catch(err){

console.log(err)
res.status(500).json({message:"Error loading trips"})

}

})

app.put("/api/trips/:id",async(req,res)=>{

try{

const trip = await Trip.findByIdAndUpdate(
req.params.id,
req.body,
{new:true}
)

res.json(trip)

}catch(err){

console.log(err)
res.status(500).json({message:"Error updating trip"})

}

})

app.delete("/api/trips/:id",async(req,res)=>{

try{

await Trip.findByIdAndDelete(req.params.id)

res.json({message:"Deleted"})

}catch(err){

console.log(err)
res.status(500).json({message:"Error deleting trip"})

}

})

/* =========================
   ROOT
========================= */

app.get("/",(req,res)=>{

res.sendFile(path.join(__dirname,"public","index.html"))

})

/* =========================
   START SERVER
========================= */

app.listen(PORT,()=>{

console.log("🚀 Server running on port "+PORT)

})