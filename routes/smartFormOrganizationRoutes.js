const express = require("express");
const mongoose = require("mongoose");
const SmartFormOrganization = require("../models/SmartFormOrganization");
const { verifyToken, requireRole } = require("../middleware/authmiddleware");

const router = express.Router();
router.use(verifyToken, requireRole("PLATFORM_ADMIN"));

const clean = v => String(v ?? "").trim();

router.get("/", async (req,res)=>{
  try{
    const tenantId = clean(req.query.tenantId);
    if(!mongoose.Types.ObjectId.isValid(tenantId)){
      return res.status(400).json({success:false,message:"Valid tenantId is required"});
    }
    const organizations = await SmartFormOrganization.find({tenantId}).sort({active:-1,name:1}).lean();
    res.json({success:true,organizations});
  }catch(err){
    console.error("SMART FORM ORG LIST ERROR",err);
    res.status(500).json({success:false,message:"Failed to load organizations"});
  }
});

router.post("/", async (req,res)=>{
  try{
    const tenantId = clean(req.body?.tenantId);
    const name = clean(req.body?.name);
    if(!mongoose.Types.ObjectId.isValid(tenantId)) return res.status(400).json({success:false,message:"Valid tenantId is required"});
    if(!name) return res.status(400).json({success:false,message:"Organization name is required"});
    const organization = await SmartFormOrganization.create({
      tenantId,
      name,
      code:clean(req.body?.code).toUpperCase(),
      type:clean(req.body?.type || "OTHER").toUpperCase(),
      active:req.body?.active !== false,
      createdByPlatformAdmin:true,
      createdBy:req.user?.name || req.user?.username || "",
      updatedBy:req.user?.name || req.user?.username || ""
    });
    res.status(201).json({success:true,organization});
  }catch(err){
    console.error("SMART FORM ORG CREATE ERROR",err);
    res.status(err?.code===11000?409:500).json({
      success:false,
      message:err?.code===11000?"Organization already exists":(err?.message || "Failed to create organization")
    });
  }
});

router.put("/:id", async (req,res)=>{
  try{
    const organization = await SmartFormOrganization.findById(req.params.id);
    if(!organization) return res.status(404).json({success:false,message:"Organization not found"});
    if(req.body?.name !== undefined) organization.name = clean(req.body.name);
    if(req.body?.code !== undefined) organization.code = clean(req.body.code).toUpperCase();
    if(req.body?.type !== undefined) organization.type = clean(req.body.type).toUpperCase();
    if(req.body?.active !== undefined) organization.active = req.body.active === true;
    organization.updatedBy = req.user?.name || req.user?.username || "";
    await organization.save();
    res.json({success:true,organization});
  }catch(err){
    console.error("SMART FORM ORG UPDATE ERROR",err);
    res.status(err?.code===11000?409:500).json({success:false,message:err?.message || "Failed to update organization"});
  }
});

router.delete("/:id", async (req,res)=>{
  try{
    const organization = await SmartFormOrganization.findById(req.params.id);
    if(!organization) return res.status(404).json({success:false,message:"Organization not found"});
    organization.active = false;
    await organization.save();
    res.json({success:true});
  }catch(err){
    res.status(500).json({success:false,message:"Failed to disable organization"});
  }
});

module.exports = router;
