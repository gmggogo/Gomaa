const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/", requireRole("admin"), async (req,res)=>{
  const users = await User.find();
  res.json(users);
});

router.post("/", requireRole("admin"), async (req,res)=>{
  const { name, username, password, role } = req.body;

  const hashed = await bcrypt.hash(password,10);

  const newUser = new User({
    name,
    username,
    password: hashed,
    role
  });

  await newUser.save();
  res.json({message:"User Created"});
});

router.put("/:id/toggle", requireRole("admin"), async (req,res)=>{
  const user = await User.findById(req.params.id);
  user.enabled = !user.enabled;
  await user.save();
  res.json({message:"Status Updated"});
});

router.delete("/:id", requireRole("admin"), async (req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({message:"Deleted"});
});

module.exports = router;