const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

router.post("/login", async (req,res)=>{
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if(!user) return res.status(400).json({message:"Invalid credentials"});

  if(!user.enabled)
    return res.status(403).json({message:"Account Disabled"});

  const validPass = await bcrypt.compare(password, user.password);
  if(!validPass)
    return res.status(400).json({message:"Invalid credentials"});

  const token = jwt.sign(
    { id:user._id, role:user.role },
    process.env.JWT_SECRET,
    { expiresIn:"1d" }
  );

  res.cookie("token", token, {
    httpOnly:true,
    secure:true,
    sameSite:"None"
  });

  res.json({message:"Login success", role:user.role});
});

router.post("/logout",(req,res)=>{
  res.clearCookie("token");
  res.json({message:"Logged out"});
});

module.exports = router;