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

// Smart Forms entry-page designer layout is intentionally stored separately from
// PDF field mappings so moving/resizing the entry form can never damage the official PDF map.
const SmartFormLayout = mongoose.models.SmartFormLayout || mongoose.model("SmartFormLayout", new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
  templateId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
  canvasHeight:{type:Number,default:1200},
  items:{type:[mongoose.Schema.Types.Mixed],default:[]},
  updatedBy:{type:String,default:""}
},{timestamps:true,collection:"smart_form_layouts"}));


const upload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:8*1024*1024},
  fileFilter(req,file,cb){
    const ok = file?.mimetype === "application/pdf" || String(file?.originalname||"").toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Only PDF files are allowed"), ok);
  }
});

const aiUpload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:4*1024*1024,files:8},
  fileFilter(req,file,cb){const ok=String(file?.mimetype||"").startsWith("image/");cb(ok?null:new Error("Only page images are allowed"),ok);}
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
      widthPercent:Math.max(10,Math.min(100,Number(f.widthPercent||50))),
      order:i,
      tripBinding:clean(f.tripBinding),
      sourceType:["MANUAL","TRIP_DATA","DRIVER_DATA","VEHICLE_DATA","SYSTEM_AFTER_TRIP"].includes(clean(f.sourceType).toUpperCase())?clean(f.sourceType).toUpperCase():"MANUAL",
      repeat:f.repeat===true,
      repeatUserOverride:f.repeatUserOverride===true,
      mapping:{
        mapped:m.mapped===true,
        page:Math.max(1,Number(m.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(m.xPercent||0))),
        yPercent:Math.max(0,Math.min(100,Number(m.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(m.widthPercent||20))),
        heightPercent:Math.max(.1,Math.min(100,Number(m.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(m.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(m.textAlign).toUpperCase()) ? clean(m.textAlign).toUpperCase() : "LEFT"
      },
      mappings:(Array.isArray(f.mappings)?f.mappings:[]).map(mm=>({
        mapped:mm?.mapped===true,page:Math.max(1,Number(mm?.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(mm?.xPercent||0))),yPercent:Math.max(0,Math.min(100,Number(mm?.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(mm?.widthPercent||20))),heightPercent:Math.max(.1,Math.min(100,Number(mm?.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(mm?.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(mm?.textAlign).toUpperCase())?clean(mm.textAlign).toUpperCase():"LEFT"
      }))
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
    const g=await gate(req,res);
    if(!g) return;

    /*
      Compare tenantId by string inside Mongo.
      This also supports any older organization row whose tenantId
      may have been stored with a different BSON representation.
    */
    const organizations =
      await SmartFormOrganization.aggregate([
        {
          $match:{
            active:{ $ne:false }
          }
        },
        {
          $match:{
            $expr:{
              $eq:[
                { $toString:"$tenantId" },
                String(g.tenantId)
              ]
            }
          }
        },
        {
          $sort:{
            name:1
          }
        }
      ]);

    return res.json({
      success:true,
      tenantId:String(g.tenantId),
      organizations
    });

  }catch(err){
    console.error(
      "SMART FORMS ORGANIZATIONS ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to load organizations"
    });
  }
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
    const org=await SmartFormOrganization.findOne({_id:organizationId,tenantId:g.tenantId,active:{ $ne:false }}).lean();
    if(!org) return res.status(404).json({success:false,message:"Organization not found"});
    const template=await SmartFormTemplate.create({tenantId:g.tenantId,organizationId,name,description:clean(req.body.description),fields:[],createdBy:actor(req),updatedBy:actor(req)});
    res.status(201).json({success:true,template:sanitizeTemplate(template)});
  }catch(err){
    res.status(err?.code===11000?409:500).json({success:false,message:err?.code===11000?"Template already exists":(err?.message||"Failed to create template")});
  }
});


router.get("/templates/:id/layout", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("_id").lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const row=await SmartFormLayout.findOne({tenantId:g.tenantId,templateId:t._id}).lean();
    res.json({success:true,layout:row?{canvasHeight:row.canvasHeight||1200,items:Array.isArray(row.items)?row.items:[]}:{canvasHeight:1200,items:[]}});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to load form layout"});}
});

router.put("/templates/:id/layout", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("_id").lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const src=req.body?.layout&&typeof req.body.layout==="object"?req.body.layout:{};
    const canvasHeight=Math.max(500,Math.min(5000,Number(src.canvasHeight||1200)));
    const items=(Array.isArray(src.items)?src.items:[]).slice(0,500).map((i,n)=>({
      id:clean(i?.id)||`item_${n+1}`,
      kind:["FIELD","SECTION","SPACER"].includes(clean(i?.kind).toUpperCase())?clean(i.kind).toUpperCase():"FIELD",
      fieldKey:clean(i?.fieldKey),
      text:clean(i?.text),
      x:Math.max(0,Math.min(100,Number(i?.x||0))),
      y:Math.max(0,Math.min(5000,Number(i?.y||0))),
      w:Math.max(5,Math.min(100,Number(i?.w||30))),
      h:Math.max(34,Math.min(1200,Number(i?.h||90)))
    }));
    const row=await SmartFormLayout.findOneAndUpdate(
      {tenantId:g.tenantId,templateId:t._id},
      {$set:{canvasHeight,items,updatedBy:actor(req)}},
      {new:true,upsert:true,setDefaultsOnInsert:true}
    ).lean();
    res.json({success:true,layout:{canvasHeight:row.canvasHeight,items:row.items||[]}});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save form layout"});}
});

router.put("/templates/:id/fields", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    // Form Builder owns field definitions/order, but it must NOT erase a PDF
    // mapping that was already saved in PDF Map. Preserve the database mapping
    // for every existing field and only give a blank mapping to genuinely new fields.
    const existingById = new Map((t.fields||[]).map(f=>[String(f._id), f]));
    const existingByKey = new Map((t.fields||[]).map(f=>[String(f.key), f]));
    const incoming = Array.isArray(req.body.fields) ? req.body.fields : [];
    const merged = incoming.map(f=>{
      const old = (f?._id && existingById.get(String(f._id))) || existingByKey.get(String(f?.key||""));
      const plain = old?.toObject ? old.toObject() : old;
      return {
        ...f,
        _id: old?._id || f?._id || undefined,
        mapping: plain?.mapping || f?.mapping || undefined,
        mappings: plain?.mappings || f?.mappings || [],
        sourceType:f?.sourceType || plain?.sourceType || "MANUAL",
        // Repeat is controlled by the user after AI detection. False must be saved as false.
        repeat:f?.repeat===true,
        repeatUserOverride:f?.repeatUserOverride===true || plain?.repeatUserOverride===true
      };
    });
    t.fields=normalizeFields(merged);
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
    const map=new Map((req.body.fields||[]).filter(x=>x?._id).map(x=>[String(x._id),x]));
    t.fields.forEach(f=>{
      const row=map.get(String(f._id)); if(!row) return;
      const m=row.mapping||{};
      f.mapping={
        mapped:m.mapped===true,page:Math.max(1,Number(m.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(m.xPercent||0))),
        yPercent:Math.max(0,Math.min(100,Number(m.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(m.widthPercent||20))),
        heightPercent:Math.max(.1,Math.min(100,Number(m.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(m.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(m.textAlign).toUpperCase())?clean(m.textAlign).toUpperCase():"LEFT"
      };
      f.mappings=(Array.isArray(row.mappings)?row.mappings:[]).map(mm=>({mapped:mm?.mapped===true,page:Math.max(1,Number(mm?.page||1)),xPercent:Math.max(0,Math.min(100,Number(mm?.xPercent||0))),yPercent:Math.max(0,Math.min(100,Number(mm?.yPercent||0))),widthPercent:Math.max(.1,Math.min(100,Number(mm?.widthPercent||20))),heightPercent:Math.max(.1,Math.min(100,Number(mm?.heightPercent||4))),fontSize:Math.max(5,Math.min(48,Number(mm?.fontSize||10))),textAlign:["LEFT","CENTER","RIGHT"].includes(clean(mm?.textAlign).toUpperCase())?clean(mm.textAlign).toUpperCase():"LEFT"}));
    });
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:"Failed to save mapping"});}
});

router.post("/templates/:id/ai-detect", aiUpload.array("pages",8), async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const pages=Array.isArray(req.files)?req.files:[];
    if(!pages.length) return res.status(400).json({success:false,message:"PDF page images are required"});
    if(!process.env.GEMINI_API_KEY) return res.status(503).json({success:false,message:"GEMINI_API_KEY is not configured on the server"});

    const prompt=`Analyze this official transportation form. Detect only fields a user/system would fill in. Return JSON only with {fields:[...]}. Each field: label,type,required,widthPercent,sourceType,repeat,page,xPercent,yPercent,widthMapPercent,heightMapPercent. type must be TEXT,NUMBER,PHONE,ADDRESS,DATE,TIME,SELECT,RADIO,CHECKBOX,TEXTAREA,SIGNATURE. sourceType must be MANUAL,TRIP_DATA,DRIVER_DATA,VEHICLE_DATA,SYSTEM_AFTER_TRIP. Use normalized percentages 0-100 for PDF coordinates. Preserve visual reading order. widthPercent is form-entry layout width (10-100). repeat=true only when the same logical value visibly occurs more than once; return one logical field and use occurrences:[{page,xPercent,yPercent,widthMapPercent,heightMapPercent}] for all locations.`;

    const parts=[{text:prompt}];
    for(let i=0;i<pages.length;i++){
      const p=pages[i];
      parts.push({text:`PDF page ${i+1}`});
      parts.push({
        inlineData:{
          mimeType:p.mimetype||"image/jpeg",
          data:p.buffer.toString("base64")
        }
      });
    }

    const geminiModel=clean(process.env.SMART_FORMS_GEMINI_MODEL)||"gemini-3.8-flash";
    const r=await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
      {
        method:"POST",
        headers:{
          "x-goog-api-key":process.env.GEMINI_API_KEY,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          contents:[{role:"user",parts}],
          generationConfig:{
            responseMimeType:"application/json",
            maxOutputTokens:8192
          }
        })
      }
    );

    const raw=await r.json();
    if(!r.ok){
      throw new Error(raw?.error?.message||"Gemini AI request failed");
    }

    const text=(raw?.candidates||[])
      .flatMap(c=>c?.content?.parts||[])
      .map(p=>p?.text||"")
      .join("\n")
      .trim();

    if(!text) throw new Error("Gemini returned an empty response");

    const cleaned=text.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
    const parsed=JSON.parse(cleaned); const detected=Array.isArray(parsed.fields)?parsed.fields:[];
    const existingByKey=new Map((t.fields||[]).map(f=>[String(f.key),f.toObject?f.toObject():f]));
    const fields=detected.map((a,i)=>{
      const label=clean(a.label)||`Field ${i+1}`; const key=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||`field_${i+1}`;
      const old=existingByKey.get(key); const occ=Array.isArray(a.occurrences)&&a.occurrences.length?a.occurrences:[a];
      const maps=occ.map(o=>({mapped:true,page:Number(o.page||1),xPercent:Number(o.xPercent||0),yPercent:Number(o.yPercent||0),widthPercent:Number(o.widthMapPercent||20),heightPercent:Number(o.heightMapPercent||4),fontSize:10,textAlign:"LEFT"}));
      return {_id:old?._id,key,label,type:clean(a.type||"TEXT").toUpperCase(),required:a.required===true,widthPercent:Number(a.widthPercent||50),sourceType:clean(a.sourceType||"MANUAL").toUpperCase(),
        // AI may suggest Repeat only for a brand-new field. Existing fields keep the user's saved choice.
        repeat:old ? old.repeat===true : (a.repeat===true),
        repeatUserOverride:old?.repeatUserOverride===true,
        tripBinding:old?.tripBinding||"",options:old?.options||[],mapping:maps[0]||old?.mapping||{},mappings:maps};
    });
    const detectedKeys=new Set(fields.map(f=>f.key));
    for(const old of (t.fields||[])){const plain=old.toObject?old.toObject():old;if(!detectedKeys.has(String(plain.key)))fields.push(plain);}
    t.fields=normalizeFields(fields); t.updatedBy=actor(req); await t.save();
    res.json({success:true,template:sanitizeTemplate(t),detected:t.fields.length});
  }catch(err){console.error("SMART FORMS AI DETECT ERROR:",err);res.status(500).json({success:false,message:err?.message||"AI field detection failed"});}
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
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("+originalPdf.data");
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
    const org=await SmartFormOrganization.findOne({_id:t.organizationId,tenantId:g.tenantId,active:{ $ne:false }}).lean();
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
