const express = require("express");
const jwt = require("jsonwebtoken");
const AttachmentTemplate = require("../models/AttachmentTemplate");
const Tenant = require("../models/Tenant");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

function readBearerToken(req){
  const header = String(req.headers?.authorization || "").trim();
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function requireTenantApi(req,res,next){
  const token = readBearerToken(req);
  if(!token) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const verified = jwt.verify(token,JWT_SECRET);
    req.authUser = {
      id:verified.id || null,
      name:verified.name || "",
      username:verified.username || "",
      role:verified.role || "",
      tenantId:verified.tenantId || null
    };
    if(req.authUser.role === "PLATFORM_ADMIN") return next();
    if(!req.authUser.tenantId) return res.status(403).json({success:false,message:"Tenant Required"});
    next();
  }catch(err){
    return res.status(401).json({success:false,message:"Invalid Token"});
  }
}

function tenantIdFor(req){
  if(req.authUser?.role === "PLATFORM_ADMIN"){
    return String(req.query?.tenantId || req.body?.tenantId || "").trim();
  }
  return String(req.authUser?.tenantId || "").trim();
}

async function ensureFeature(tenantId){
  const tenant = await Tenant.findById(tenantId).lean();
  if(!tenant) return {ok:false,status:404,message:"Tenant not found"};
  if(tenant.attachmentImportEnabled !== true) return {ok:false,status:403,message:"Attachment Import is disabled for this company"};
  return {ok:true,tenant};
}

router.use(requireTenantApi);

router.get("/",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await ensureFeature(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});
    const templates = await AttachmentTemplate.find({tenantId}).sort({updatedAt:-1,name:1}).lean();
    return res.json({success:true,templates});
  }catch(err){
    console.error("ATTACHMENT TEMPLATE LIST ERROR:",err);
    return res.status(500).json({success:false,message:"Failed to load attachment templates"});
  }
});

router.post("/",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await ensureFeature(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});

    const template = await AttachmentTemplate.create({
      tenantId,
      name:String(req.body?.name || "").trim(),
      organizationType:String(req.body?.organizationType || "INSURANCE").toUpperCase(),
      organizationName:String(req.body?.organizationName || "").trim(),
      sourceTypes:Array.isArray(req.body?.sourceTypes) ? req.body.sourceTypes : ["CSV","XLSX","IMAGE","PDF"],
      active:req.body?.active !== false,
      fields:Array.isArray(req.body?.fields) ? req.body.fields : [],
      signaturePosition:req.body?.signaturePosition || {},
      createdBy:req.authUser?.name || req.authUser?.username || "",
      updatedBy:req.authUser?.name || req.authUser?.username || ""
    });

    return res.status(201).json({success:true,template});
  }catch(err){
    console.error("ATTACHMENT TEMPLATE CREATE ERROR:",err);
    return res.status(err?.code === 11000 ? 409 : 500).json({
      success:false,
      message:err?.code === 11000 ? "Template name already exists" : (err?.message || "Failed to create template")
    });
  }
});

router.put("/:id",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await ensureFeature(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});

    const template = await AttachmentTemplate.findOne({_id:req.params.id,tenantId});
    if(!template) return res.status(404).json({success:false,message:"Template not found"});

    for(const key of ["name","organizationName"]){
      if(req.body?.[key] !== undefined) template[key] = String(req.body[key] || "").trim();
    }
    if(req.body?.organizationType !== undefined) template.organizationType = String(req.body.organizationType || "OTHER").toUpperCase();
    if(req.body?.sourceTypes !== undefined) template.sourceTypes = Array.isArray(req.body.sourceTypes) ? req.body.sourceTypes : template.sourceTypes;
    if(req.body?.active !== undefined) template.active = req.body.active === true;
    if(req.body?.fields !== undefined) template.fields = Array.isArray(req.body.fields) ? req.body.fields : [];
    if(req.body?.signaturePosition !== undefined) template.signaturePosition = req.body.signaturePosition || {};
    template.updatedBy = req.authUser?.name || req.authUser?.username || "";

    await template.save();
    return res.json({success:true,template});
  }catch(err){
    console.error("ATTACHMENT TEMPLATE UPDATE ERROR:",err);
    return res.status(err?.code === 11000 ? 409 : 500).json({success:false,message:err?.message || "Failed to update template"});
  }
});

router.delete("/:id",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await ensureFeature(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});
    const deleted = await AttachmentTemplate.findOneAndDelete({_id:req.params.id,tenantId});
    if(!deleted) return res.status(404).json({success:false,message:"Template not found"});
    return res.json({success:true,message:"Template deleted"});
  }catch(err){
    console.error("ATTACHMENT TEMPLATE DELETE ERROR:",err);
    return res.status(500).json({success:false,message:"Failed to delete template"});
  }
});

module.exports = router;
