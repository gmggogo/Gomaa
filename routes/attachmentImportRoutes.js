const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const AttachmentImport = require("../models/AttachmentImport");
const AttachmentTemplate = require("../models/AttachmentTemplate");
const Tenant = require("../models/Tenant");
const attachmentParserService = require("../services/attachmentParserService");
const attachmentImportService = require("../services/attachmentImportService");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const upload = multer({
  storage:multer.memoryStorage(),
  limits:{ fileSize:8*1024*1024, files:10 }
});

function readBearerToken(req){
  const header = String(req.headers?.authorization || "").trim();
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}
function requireTenantApi(req,res,next){
  const token = readBearerToken(req);
  if(!token) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const v = jwt.verify(token,JWT_SECRET);
    req.authUser = {id:v.id||null,name:v.name||"",username:v.username||"",role:v.role||"",tenantId:v.tenantId||null};
    if(req.authUser.role === "PLATFORM_ADMIN") return next();
    if(!req.authUser.tenantId) return res.status(403).json({success:false,message:"Tenant Required"});
    next();
  }catch(err){ return res.status(401).json({success:false,message:"Invalid Token"}); }
}
function tenantIdFor(req){
  if(req.authUser?.role === "PLATFORM_ADMIN") return String(req.query?.tenantId || req.body?.tenantId || "").trim();
  return String(req.authUser?.tenantId || "").trim();
}
async function featureTenant(tenantId){
  const tenant = await Tenant.findById(tenantId).lean();
  if(!tenant) return {ok:false,status:404,message:"Tenant not found"};
  if(tenant.attachmentImportEnabled !== true) return {ok:false,status:403,message:"Attachment Import is disabled for this company"};
  return {ok:true,tenant};
}
function cleanImport(doc){
  const o = doc?.toObject ? doc.toObject() : {...doc};
  if(Array.isArray(o.sourceFiles)){
    o.sourceFiles = o.sourceFiles.map(f=>({
      _id:f._id,
      originalName:f.originalName,
      mimeType:f.mimeType,
      size:f.size,
      page:f.page,
      side:f.side
    }));
  }
  if(Array.isArray(o.archiveEntries)){
    o.archiveEntries = o.archiveEntries.map(e=>({
      _id:e._id,tripId:e.tripId,tripNumber:e.tripNumber,rowIndex:e.rowIndex,
      signedAt:e.signedAt,completedAt:e.completedAt,archivedAt:e.archivedAt,
      documentType:e.documentType,finalDocumentMimeType:e.finalDocumentMimeType
    }));
  }
  return o;
}

router.use(requireTenantApi);

router.get("/feature",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const tenant = await Tenant.findById(tenantId).select("attachmentImportEnabled").lean();
    return res.json({success:true,enabled:tenant?.attachmentImportEnabled === true});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load Attachment Import feature"}); }
});

router.get("/services",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await featureTenant(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});
    const services = await attachmentImportService.enabledServicesForTenant(tenantId);
    return res.json({success:true,services});
  }catch(err){ return res.status(500).json({success:false,message:err.message || "Failed to load enabled services"}); }
});

router.get("/",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await featureTenant(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});
    const status = String(req.query?.status || "").trim().toUpperCase();
    const filter = {tenantId};
    if(status) filter.status = status;
    const imports = await AttachmentImport.find(filter).sort({createdAt:-1}).limit(200);
    return res.json({success:true,imports:imports.map(cleanImport)});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load attachment imports"}); }
});

router.post("/upload",upload.array("files",20),async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const feature = await featureTenant(tenantId);
    if(!feature.ok) return res.status(feature.status).json({success:false,message:feature.message});

    const template = await AttachmentTemplate.findOne({_id:req.body?.templateId,tenantId,active:true});
    if(!template) return res.status(404).json({success:false,message:"Attachment template not found"});
    if(!Array.isArray(req.files) || !req.files.length) return res.status(400).json({success:false,message:"Select at least one file"});
    const totalBytes = req.files.reduce((sum,file)=>sum+Number(file.size||0),0);
    if(totalBytes > 12*1024*1024){
      return res.status(413).json({success:false,message:"Attachment document is too large. Keep the full front/back packet under 12 MB."});
    }

    const parsed = attachmentParserService.parseAttachment({files:req.files,template});
    const sourceFiles = req.files.map((file,index)=>({
      originalName:file.originalname,
      mimeType:file.mimetype,
      size:file.size,
      page:index+1,
      side:req.files.length === 2 ? (index === 0 ? "FRONT" : "BACK") : "PAGE",
      data:file.buffer
    }));

    const importDoc = await AttachmentImport.create({
      tenantId,
      tenantSlug:feature.tenant.slug || "",
      templateId:template._id,
      templateName:template.name,
      sourceType:parsed.sourceType,
      sourceFiles,
      reviewRows:parsed.rows.map(r=>({
        rowIndex:r.rowIndex,
        data:r.data,
        rawData:r.rawData,
        serviceResolution:"UNRESOLVED"
      })),
      status:"REVIEW",
      createdBy:req.authUser?.name || req.authUser?.username || ""
    });

    const services = await attachmentImportService.prepareReviewRows({importDoc,template});
    await importDoc.save();

    return res.status(201).json({success:true,import:cleanImport(importDoc),services});
  }catch(err){
    console.error("ATTACHMENT UPLOAD ERROR:",err);
    return res.status(err?.statusCode || 500).json({success:false,message:err?.message || "Attachment upload failed"});
  }
});

router.get("/:id",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
    if(!importDoc) return res.status(404).json({success:false,message:"Import not found"});
    const [template,services] = await Promise.all([
      AttachmentTemplate.findById(importDoc.templateId).lean(),
      attachmentImportService.enabledServicesForTenant(tenantId)
    ]);
    return res.json({success:true,import:cleanImport(importDoc),template,services});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load import"}); }
});

router.put("/:id/review",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
    if(!importDoc) return res.status(404).json({success:false,message:"Import not found"});
    if(["CONFIRMED","ARCHIVED"].includes(importDoc.status)) return res.status(409).json({success:false,message:"Confirmed import cannot be edited"});

    const updates = Array.isArray(req.body?.rows) ? req.body.rows : [];
    for(const update of updates){
      const row = importDoc.reviewRows.find(r=>Number(r.rowIndex) === Number(update.rowIndex));
      if(!row) continue;
      if(update.data && typeof update.data === "object") row.data = update.data;
      if(update.serviceKey !== undefined){
        row.serviceKey = String(update.serviceKey || "").trim().toUpperCase();
        row.serviceResolution = row.serviceKey ? "MANUAL" : "UNRESOLVED";
      }
    }

    const template = await AttachmentTemplate.findById(importDoc.templateId);
    const services = await attachmentImportService.prepareReviewRows({importDoc,template});
    await importDoc.save();
    return res.json({success:true,import:cleanImport(importDoc),services});
  }catch(err){ return res.status(500).json({success:false,message:err.message || "Failed to save review"}); }
});

router.post("/:id/confirm",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
    if(!importDoc) return res.status(404).json({success:false,message:"Import not found"});
    const template = await AttachmentTemplate.findById(importDoc.templateId);
    if(!template) return res.status(404).json({success:false,message:"Template not found"});

    await attachmentImportService.prepareReviewRows({importDoc,template});
    await importDoc.save();
    const result = await attachmentImportService.confirmImport({importDoc,template});

    return res.json({
      success:true,
      createdCount:result.created.length,
      trips:result.created.map(t=>({id:t._id,tripNumber:t.tripNumber,serviceKey:t.serviceKey})),
      import:cleanImport(result.importDoc)
    });
  }catch(err){
    console.error("ATTACHMENT CONFIRM ERROR:",err);
    return res.status(err?.statusCode || 500).json({success:false,message:err?.message || "Failed to confirm attachment trips"});
  }
});

router.get("/:id/source/:fileId",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
    if(!importDoc) return res.status(404).end();
    const file = importDoc.sourceFiles.id(req.params.fileId);
    if(!file?.data) return res.status(404).end();
    res.setHeader("Content-Type",file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition",`inline; filename="${String(file.originalName || "document").replace(/"/g,"")}"`);
    return res.send(file.data);
  }catch(err){ return res.status(500).end(); }
});

module.exports = router;
