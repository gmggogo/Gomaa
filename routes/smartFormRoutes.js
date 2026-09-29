const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const mongoose = require("mongoose");

const Tenant = require("../models/Tenant");
const SmartFormOrganization = require("../models/SmartFormOrganization");
const SmartFormTemplate = require("../models/SmartFormTemplate");
const SmartFormSubmission = require("../models/SmartFormSubmission");
const { generateFinalPdf } = require("../services/smartFormPdfService");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const upload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:8*1024*1024},
  fileFilter(req,file,cb){
    const ok = file?.mimetype === "application/pdf" || String(file?.originalname||"").toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Only PDF files are allowed"), ok);
  }
});

const clean = v => String(v ?? "").trim();
const allowedRoles = new Set(["SUPER_ADMIN","ADMIN","DISPATCHER","PLATFORM_ADMIN"]);

function auth(req,res,next){
  const h = clean(req.headers.authorization);
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if(!token) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const u = jwt.verify(token,JWT_SECRET);
    req.authUser = {
      id:u.id || null,
      name:u.name || "",
      username:u.username || "",
      role:String(u.role||"").toUpperCase(),
      tenantId:u.tenantId || null
    };
    if(!allowedRoles.has(req.authUser.role)) return res.status(403).json({success:false,message:"Role not allowed"});
    if(req.authUser.role!=="PLATFORM_ADMIN" && !req.authUser.tenantId) return res.status(403).json({success:false,message:"Tenant Required"});
    next();
  }catch{
    res.status(401).json({success:false,message:"Invalid Token"});
  }
}

function tenantIdFor(req){
  return req.authUser?.role==="PLATFORM_ADMIN"
    ? clean(req.query?.tenantId || req.body?.tenantId)
    : clean(req.authUser?.tenantId);
}

async function gate(req,res){
  const tenantId = tenantIdFor(req);
  if(!mongoose.Types.ObjectId.isValid(tenantId)){
    res.status(400).json({success:false,message:"Valid tenantId is required"}); return null;
  }
  const tenant = await Tenant.findById(tenantId).select("_id enabled smartFormsEnabled").lean();
  if(!tenant){ res.status(404).json({success:false,message:"Company not found"}); return null; }
  if(tenant.enabled!==true){ res.status(403).json({success:false,message:"Company is disabled"}); return null; }
  if(tenant.smartFormsEnabled!==true){ res.status(403).json({success:false,message:"Smart Forms is disabled"}); return null; }
  return {tenantId};
}

const actor = req => req.authUser?.name || req.authUser?.username || "";

function normalizeFields(fields){
  const used = new Set();
  return (Array.isArray(fields)?fields:[]).map((f,i)=>{
    let key = clean(f.key) || clean(f.label).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || `field_${i+1}`;
    let k=key,n=2; while(used.has(k)) k=`${key}_${n++}`; used.add(k);
    const m = f.mapping || {};
    return {
      _id:f._id || undefined,
      key:k,
      label:clean(f.label) || `Field ${i+1}`,
      type:clean(f.type || "TEXT").toUpperCase(),
      required:f.required===true,
      placeholder:clean(f.placeholder),
      options:Array.isArray(f.options)?f.options.map(clean).filter(Boolean):[],
      widthPercent:Math.max(20,Math.min(100,Number(f.widthPercent||50))),
      order:i,
      tripBinding:clean(f.tripBinding),
      mapping:{
        mapped:m.mapped===true,
        page:Math.max(1,Number(m.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(m.xPercent||0))),
        yPercent:Math.max(0,Math.min(100,Number(m.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(m.widthPercent||20))),
        heightPercent:Math.max(.1,Math.min(100,Number(m.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(m.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(m.textAlign).toUpperCase()) ? clean(m.textAlign).toUpperCase() : "LEFT"
      }
    };
  });
}

function sanitizeTemplate(t){
  const o=t?.toObject?t.toObject():{...t};
  if(o.originalPdf){ delete o.originalPdf.data; o.originalPdf.hasPdf=!!o.originalPdf.fileName; }
  return o;
}
function sanitizeSubmission(s){
  const o=s?.toObject?s.toObject():{...s};
  if(o.generatedPdf){ delete o.generatedPdf.data; o.generatedPdf.hasPdf=!!o.generatedPdf.fileName; }
  return o;
}

router.use(auth);

router.get("/feature", async (req,res)=>{
  const id = tenantIdFor(req);
  if(!mongoose.Types.ObjectId.isValid(id)) return res.json({success:true,enabled:false});
  const t = await Tenant.findById(id).select("smartFormsEnabled").lean();
  res.json({success:true,enabled:t?.smartFormsEnabled===true});
});

router.get("/organizations", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const organizations=await SmartFormOrganization.find({tenantId:g.tenantId,active:true}).sort({name:1}).lean();
    res.json({success:true,organizations});
  }catch(err){res.status(500).json({success:false,message:"Failed to load organizations"});}
});

router.get("/templates", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const q={tenantId:g.tenantId};
    if(mongoose.Types.ObjectId.isValid(req.query.organizationId)) q.organizationId=req.query.organizationId;
    const templates=await SmartFormTemplate.find(q).sort({active:-1,updatedAt:-1}).lean();
    res.json({success:true,templates:templates.map(sanitizeTemplate)});
  }catch(err){res.status(500).json({success:false,message:"Failed to load templates"});}
});

router.post("/templates", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const organizationId=clean(req.body.organizationId), name=clean(req.body.name);
    if(!mongoose.Types.ObjectId.isValid(organizationId)) return res.status(400).json({success:false,message:"Organization is required"});
    if(!name) return res.status(400).json({success:false,message:"Template name is required"});
    const org=await SmartFormOrganization.findOne({_id:organizationId,tenantId:g.tenantId,active:true}).lean();
    if(!org) return res.status(404).json({success:false,message:"Organization not found"});
    const template=await SmartFormTemplate.create({tenantId:g.tenantId,organizationId,name,description:clean(req.body.description),fields:[],createdBy:actor(req),updatedBy:actor(req)});
    res.status(201).json({success:true,template:sanitizeTemplate(template)});
  }catch(err){
    res.status(err?.code===11000?409:500).json({success:false,message:err?.code===11000?"Template already exists":(err?.message||"Failed to create template")});
  }
});

router.put("/templates/:id/fields", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    t.fields=normalizeFields(req.body.fields);
    t.updatedBy=actor(req);
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save fields"});}
});

router.put("/templates/:id/mapping", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const map=new Map((req.body.fields||[]).filter(x=>x?._id).map(x=>[String(x._id),x.mapping||{}]));
    t.fields.forEach(f=>{
      const m=map.get(String(f._id)); if(!m) return;
      f.mapping={
        mapped:m.mapped===true,page:Math.max(1,Number(m.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(m.xPercent||0))),
        yPercent:Math.max(0,Math.min(100,Number(m.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(m.widthPercent||20))),
        heightPercent:Math.max(.1,Math.min(100,Number(m.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(m.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(m.textAlign).toUpperCase())?clean(m.textAlign).toUpperCase():"LEFT"
      };
    });
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:"Failed to save mapping"});}
});

router.post("/templates/:id/pdf", upload.single("pdf"), async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    if(!req.file?.buffer?.length) return res.status(400).json({success:false,message:"PDF file is required"});
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("+originalPdf.data");
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    t.originalPdf={fileName:req.file.originalname||"official-form.pdf",mimeType:"application/pdf",size:req.file.size,pageCount:0,data:req.file.buffer,uploadedAt:new Date()};
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to upload PDF"});}
});

router.get("/templates/:id/pdf", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("+originalPdf.data originalPdf");
    if(!t?.originalPdf?.data?.length) return res.status(404).json({success:false,message:"Official PDF not found"});
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`inline; filename="${String(t.originalPdf.fileName||"official-form.pdf").replace(/"/g,"")}"`);
    res.end(t.originalPdf.data);
  }catch(err){res.status(500).json({success:false,message:"Failed to load PDF"});}
});

router.post("/submissions", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.body.templateId,tenantId:g.tenantId,active:true}).lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const org=await SmartFormOrganization.findOne({_id:t.organizationId,tenantId:g.tenantId,active:true}).lean();
    if(!org) return res.status(404).json({success:false,message:"Organization not found"});
    const formData=req.body.formData && typeof req.body.formData==="object" ? req.body.formData : {};
    const missing=(t.fields||[]).filter(f=>f.required && f.type!=="SIGNATURE" && (formData[f.key]===undefined || formData[f.key]===null || formData[f.key]==="")).map(f=>f.label);
    if(missing.length) return res.status(400).json({success:false,message:`Required fields missing: ${missing.join(", ")}`});
    const status=String(req.body.status||"").toUpperCase()==="REVIEW"?"REVIEW":"DRAFT";
    const s=await SmartFormSubmission.create({
      tenantId:g.tenantId,organizationId:org._id,templateId:t._id,templateName:t.name,organizationName:org.name,
      status,formData,fieldSnapshot:t.fields||[],signatureRequired:(t.fields||[]).some(f=>f.type==="SIGNATURE"),
      submittedBy:actor(req),submittedAt:status==="REVIEW"?new Date():null
    });
    res.status(201).json({success:true,submission:sanitizeSubmission(s)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save form"});}
});

router.get("/submissions", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const rows=await SmartFormSubmission.find({tenantId:g.tenantId}).sort({createdAt:-1}).limit(500).lean();
    res.json({success:true,submissions:rows.map(sanitizeSubmission)});
  }catch(err){res.status(500).json({success:false,message:"Failed to load review"});}
});

router.post("/submissions/:id/review", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!s) return res.status(404).json({success:false,message:"Submission not found"});
    if(s.status==="CONFIRMED") return res.status(409).json({success:false,message:"Already confirmed"});
    s.status="REVIEW"; s.reviewedBy=actor(req); s.reviewedAt=new Date(); if(!s.submittedAt) s.submittedAt=new Date();
    await s.save();
    res.json({success:true,submission:sanitizeSubmission(s)});
  }catch(err){res.status(500).json({success:false,message:"Failed to send to review"});}
});

router.post("/submissions/:id/confirm", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!s) return res.status(404).json({success:false,message:"Submission not found"});
    s.status="CONFIRMED"; s.confirmedBy=actor(req); s.confirmedAt=new Date();
    await s.save();
    res.json({success:true,submission:sanitizeSubmission(s)});
  }catch(err){res.status(500).json({success:false,message:"Failed to confirm form"});}
});

router.delete("/submissions/:id", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!s) return res.status(404).json({success:false,message:"Submission not found"});
    if(s.status==="CONFIRMED") return res.status(409).json({success:false,message:"Confirmed form cannot be deleted"});
    await s.deleteOne();
    res.json({success:true});
  }catch(err){res.status(500).json({success:false,message:"Failed to delete submission"});}
});

router.post("/submissions/:id/generate-pdf", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const result=await generateFinalPdf({tenantId:g.tenantId,submissionId:req.params.id});
    res.json({success:true,fileName:result.fileName,generatedAt:result.submission.generatedPdf.generatedAt});
  }catch(err){res.status(err?.statusCode||500).json({success:false,message:err?.message||"Failed to generate PDF"});}
});

router.get("/submissions/:id/pdf", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId}).select("+generatedPdf.data generatedPdf");
    if(!s?.generatedPdf?.data?.length) return res.status(404).json({success:false,message:"Generated PDF not found"});
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`inline; filename="${String(s.generatedPdf.fileName||"smart-form.pdf").replace(/"/g,"")}"`);
    res.end(s.generatedPdf.data);
  }catch(err){res.status(500).json({success:false,message:"Failed to load generated PDF"});}
});

module.exports = router;
