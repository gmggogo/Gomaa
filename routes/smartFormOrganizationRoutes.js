const express = require("express");
const mongoose = require("mongoose");
const SmartFormOrganization = require("../models/SmartFormOrganization");
const SmartFormTemplate = require("../models/SmartFormTemplate");
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
    const includeInactive = req.query.includeInactive === "true";
    const query = includeInactive
      ? {tenantId}
      : {tenantId, active:{ $ne:false }};
    const organizations = await SmartFormOrganization.find(query).sort({active:-1,name:1}).lean();
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


router.get("/:id/templates", async (req,res)=>{
  try{
    const includeInactive = req.query.includeInactive === "true";
    const organization=await SmartFormOrganization.findById(req.params.id).lean();
    if(!organization)return res.status(404).json({success:false,message:"Organization not found"});
    if(organization.active===false && !includeInactive){
      return res.json({success:true,templates:[]});
    }
    const query = includeInactive
      ? {tenantId:organization.tenantId,organizationId:organization._id}
      : {tenantId:organization.tenantId,organizationId:organization._id,active:{ $ne:false }};
    const templates=await SmartFormTemplate.find(query)
      .sort({active:-1,updatedAt:-1}).select("-originalPdf.data").lean();
    res.json({success:true,templates});
  }catch(err){res.status(500).json({success:false,message:"Failed to load templates"});}
});

router.post("/:id/templates", async (req,res)=>{
  try{
    const organization=await SmartFormOrganization.findById(req.params.id);
    if(!organization||organization.active===false)return res.status(404).json({success:false,message:"Active organization not found"});
    const name=clean(req.body?.name);
    if(!name)return res.status(400).json({success:false,message:"Template name is required"});
    const template=await SmartFormTemplate.create({
      tenantId:organization.tenantId,organizationId:organization._id,name,
      description:clean(req.body?.description),active:true,fields:[],
      createdBy:req.user?.name||req.user?.username||"Platform Admin",
      updatedBy:req.user?.name||req.user?.username||"Platform Admin"
    });
    res.status(201).json({success:true,template});
  }catch(err){
    res.status(err?.code===11000?409:500).json({success:false,message:err?.code===11000?"Template already exists":(err?.message||"Failed to create template")});
  }
});

router.put("/:orgId/templates/:templateId", async (req,res)=>{
  try{
    const organization=await SmartFormOrganization.findById(req.params.orgId).lean();
    if(!organization)return res.status(404).json({success:false,message:"Organization not found"});
    const template=await SmartFormTemplate.findOne({_id:req.params.templateId,tenantId:organization.tenantId,organizationId:organization._id});
    if(!template)return res.status(404).json({success:false,message:"Template not found"});
    if(req.body?.name!==undefined){const name=clean(req.body.name);if(!name)return res.status(400).json({success:false,message:"Template name is required"});template.name=name;}
    if(req.body?.description!==undefined)template.description=clean(req.body.description);
    if(req.body?.active!==undefined)template.active=req.body.active===true;
    template.updatedBy=req.user?.name||req.user?.username||"Platform Admin";
    await template.save();
    res.json({success:true,template});
  }catch(err){res.status(err?.code===11000?409:500).json({success:false,message:err?.message||"Failed to update template"});}
});

router.delete("/:orgId/templates/:templateId", async (req,res)=>{
  try{
    const organization=await SmartFormOrganization.findById(req.params.orgId).lean();
    if(!organization)return res.status(404).json({success:false,message:"Organization not found"});
    const template=await SmartFormTemplate.findOne({
      _id:req.params.templateId,
      tenantId:organization.tenantId,
      organizationId:organization._id
    });
    if(!template)return res.status(404).json({success:false,message:"Template not found"});
    template.active=false;
    template.updatedBy=req.user?.name||req.user?.username||"Platform Admin";
    await template.save();
    res.json({success:true,template});
  }catch(err){
    res.status(500).json({success:false,message:err?.message||"Failed to delete template"});
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

    if(organization.active === false){
      await SmartFormTemplate.updateMany(
        {
          tenantId:organization.tenantId,
          organizationId:organization._id
        },
        {
          $set:{
            active:false,
            updatedBy:req.user?.name || req.user?.username || "",
            updatedAt:new Date()
          }
        }
      );
    }

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
    organization.updatedBy = req.user?.name || req.user?.username || "";
    await organization.save();
    const templateResult = await SmartFormTemplate.updateMany(
      {
        tenantId:organization.tenantId,
        organizationId:organization._id
      },
      {
        $set:{
          active:false,
          updatedBy:req.user?.name || req.user?.username || "",
          updatedAt:new Date()
        }
      }
    );

    res.json({
      success:true,
      disabledTemplates:templateResult.modifiedCount || 0
    });
  }catch(err){
    res.status(500).json({success:false,message:"Failed to disable organization"});
  }
});

module.exports = router;
