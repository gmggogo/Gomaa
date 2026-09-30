const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const mongoose = require("mongoose");

const Tenant = require("../models/Tenant");
const SmartFormOrganization = require("../models/SmartFormOrganization");
const SmartFormTemplate = require("../models/SmartFormTemplate");
const SmartFormSubmission = require("../models/SmartFormSubmission");
const Trip = require("../models/Trip");
const { generateFinalPdf } = require("../services/smartFormPdfService");
const { calculateSmartFormPrice } = require("../services/smartFormPricingEngine");

const router = express.Router();
// Atomic per-company Smart Form trip sequence.
const SmartFormTripSequence = mongoose.models.SmartFormTripSequence || mongoose.model("SmartFormTripSequence", new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,required:true,unique:true,index:true},
  seq:{type:Number,default:0}
},{timestamps:true,collection:"smart_form_trip_sequences"}));

function twoLetters(value){
  const x=clean(value).toUpperCase().replace(/[^A-Z0-9]/g,"");
  return (x+"XX").slice(0,2);
}
function normalizedFieldText(f){
  return `${clean(f?.label)} ${clean(f?.key)}`.toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," ").trim();
}
function hasValue(v){
  if(Array.isArray(v)) return v.length>0;
  if(typeof v==="boolean") return v;
  return clean(v)!=="";
}
function explicitBoundField(template,binding){
  return (template.fields||[]).find(x=>clean(x.tripBinding).toUpperCase()===binding) || null;
}
function inferredField(template,binding){
  const fields=template.fields||[];
  const tests={
    CLIENT_NAME:[/\bmember name\b/,/\bclient name\b/,/\bpassenger name\b/,/^name$/],
    PICKUP_ADDRESS:[/\b1st pick up location\b/,/\b1st pickup location\b/,/\bpick up address\b/,/\bpickup address\b/,/\bpickup location\b/],
    DROPOFF_ADDRESS:[/\b1st drop off location\b/,/\b1st dropoff location\b/,/\bdrop off address\b/,/\bdropoff address\b/,/\bdropoff location\b/],
    TRIP_DATE:[/^date$/, /\btrip date\b/,/\bservice date\b/,/\bappointment date\b/],
    PICKUP_TIME:[/\bpick up time\b/,/\bpickup time\b/,/\btrip time\b/,/^time$/],
    SERVICE:[/^service$/, /\bservice type\b/,/\bvehicle type\b/,/\btransportation type\b/]
  };
  for(const re of tests[binding]||[]){
    const f=fields.find(x=>re.test(normalizedFieldText(x)));
    if(f) return f;
  }
  return null;
}
function formDataValueByNames(formData, patterns){
  for(const [key,value] of Object.entries(formData||{})){
    const text=String(key||"").toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," ").trim();
    if(patterns.some(re=>re.test(text)) && hasValue(value)) return value;
  }
  return "";
}
function serviceFromVehicleFields(template,formData){
  const picked=[];
  for(const f of template.fields||[]){
    const text=normalizedFieldText(f);
    if(!(/\bvehicle type\b/.test(text)||/\bservice type\b/.test(text)||/^service\b/.test(text))) continue;
    const raw=formData?.[f.key];
    if(!hasValue(raw)) continue;
    if(typeof raw==="boolean"){
      const label=clean(f.label)
        .replace(/^vehicle\s*type\s*[:\-]?\s*/i,"")
        .replace(/^service\s*type\s*[:\-]?\s*/i,"");
      if(label) picked.push(label);
    }else if(Array.isArray(raw)){
      picked.push(...raw.map(clean).filter(Boolean));
    }else{
      const value=clean(raw);
      if(value && !/^(true|on|yes|1)$/i.test(value)) picked.push(value);
      else {
        const label=clean(f.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"");
        if(label) picked.push(label);
      }
    }
  }
  return picked[0]||"";
}
function fieldValueForBinding(template,formData,binding){
  const f=explicitBoundField(template,binding) || inferredField(template,binding);
  if(f){
    const raw=formData?.[f.key];
    if(binding==="SERVICE"){
      if(typeof raw==="boolean" && raw){
        return clean(f.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"") || "Service";
      }
      if(Array.isArray(raw) && raw.length) return raw.map(clean).filter(Boolean).join(", ");
      if(hasValue(raw)){
        const v=clean(raw);
        if(!/^(true|on|yes|1)$/i.test(v)) return v;
        const label=clean(f.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"");
        if(label) return label;
      }
    }else if(hasValue(raw)){
      if(Array.isArray(raw)) return raw.map(clean).filter(Boolean).join(", ");
      return clean(raw);
    }
  }

  // Final fallbacks for imported/legacy forms whose saved field metadata has no binding.
  if(binding==="TRIP_DATE"){
    const v=formDataValueByNames(formData,[/^date$/, /\btrip date\b/, /\bservice date\b/, /\bappointment date\b/]);
    return clean(v);
  }
  if(binding==="SERVICE"){
    const vehicle=serviceFromVehicleFields(template,formData);
    if(vehicle) return vehicle;
    const v=formDataValueByNames(formData,[/^service$/, /\bservice type\b/, /\bvehicle type\b/, /\btransportation type\b/]);
    return clean(v);
  }
  return "";
}
function stopValues(template,formData){
  const explicit=(template.fields||[]).find(x=>clean(x.tripBinding).toUpperCase()==="STOPS");
  let value=explicit ? formData?.[explicit.key] : undefined;

  if(value===undefined || value===null || value===""){
    const inferred=(template.fields||[]).find(f=>{
      const text=normalizedFieldText(f);
      return /(^|\b)stops?(\b|$)/.test(text);
    });
    if(inferred) value=formData?.[inferred.key];
  }

  if(Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text=clean(value);
  if(!text) return [];
  return text.split(/\r?\n|\s*;\s*/).map(clean).filter(Boolean);
}
function operationalData(template,formData){
  return {
    clientName:fieldValueForBinding(template,formData,"CLIENT_NAME"),
    pickupAddress:fieldValueForBinding(template,formData,"PICKUP_ADDRESS"),
    dropoffAddress:fieldValueForBinding(template,formData,"DROPOFF_ADDRESS"),
    stops:stopValues(template,formData),
    tripDate:fieldValueForBinding(template,formData,"TRIP_DATE"),
    pickupTime:fieldValueForBinding(template,formData,"PICKUP_TIME"),
    serviceName:fieldValueForBinding(template,formData,"SERVICE")
  };
}
async function nextSmartFormTripNumber(tenantId,serviceName){
  const tenant=await Tenant.findById(tenantId).select("name branding.companyName").lean();
  const companyName=clean(tenant?.branding?.companyName)||clean(tenant?.name)||"XX";
  const row=await SmartFormTripSequence.findOneAndUpdate(
    {tenantId},{$inc:{seq:1}},
    {new:true,upsert:true,setDefaultsOnInsert:true}
  ).lean();
  return `SF${twoLetters(companyName)}${String(row.seq).padStart(6,"0")}${twoLetters(serviceName)}`;
}

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
      requiredUserOverride:f.requiredUserOverride===true,
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
            active:{ $ne:false },
            createdByPlatformAdmin:true
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
    const allowedOrganizations=await SmartFormOrganization.find({
      tenantId:g.tenantId,
      active:{ $ne:false },
      createdByPlatformAdmin:true
    }).select("_id").lean();

    const allowedIds=allowedOrganizations.map(o=>o._id);
    const q={tenantId:g.tenantId,active:true,organizationId:{$in:allowedIds}};

    if(mongoose.Types.ObjectId.isValid(req.query.organizationId)){
      const requested=String(req.query.organizationId);
      if(!allowedIds.some(id=>String(id)===requested)){
        return res.json({success:true,templates:[]});
      }
      q.organizationId=req.query.organizationId;
    }

    const templates=await SmartFormTemplate.find(q).sort({updatedAt:-1}).lean();
    res.json({success:true,templates:templates.map(sanitizeTemplate)});
  }catch(err){res.status(500).json({success:false,message:"Failed to load templates"});}
});

router.post("/templates", async (req,res)=>{
  try{
    if(req.authUser?.role!=="PLATFORM_ADMIN"){
      return res.status(403).json({success:false,message:"Templates are created by Platform Admin only"});
    }
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
        // Required and Repeat are manual controls after AI detection. False must remain false.
        required:f?.required===true,
        requiredUserOverride:f?.requiredUserOverride===true || plain?.requiredUserOverride===true,
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
      return {_id:old?._id,key,label,type:clean(a.type||"TEXT").toUpperCase(),
        required:old ? old.required===true : a.required===true,
        requiredUserOverride:old?.requiredUserOverride===true,
        widthPercent:Number(a.widthPercent||50),sourceType:clean(a.sourceType||"MANUAL").toUpperCase(),
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
    const op=operationalData(t,formData);
    if(status==="REVIEW"){
      const requiredOps=[["CLIENT_NAME","Client Name",op.clientName],["PICKUP_ADDRESS","Pickup Address",op.pickupAddress],["DROPOFF_ADDRESS","Dropoff Address",op.dropoffAddress],["TRIP_DATE","Trip Date",op.tripDate],["PICKUP_TIME","Pickup Time",op.pickupTime],["SERVICE","Service",op.serviceName]];
      const empty=requiredOps.filter(([, ,value])=>!value).map(([,label])=>label);
      if(empty.length) return res.status(400).json({success:false,message:`Review fields missing: ${empty.join(", ")}`});
    }
    const tripNumber=status==="REVIEW"?await nextSmartFormTripNumber(g.tenantId,op.serviceName):"";
    const s=await SmartFormSubmission.create({
      tenantId:g.tenantId,organizationId:org._id,templateId:t._id,templateName:t.name,organizationName:org.name,
      status,formData,fieldSnapshot:t.fields||[],tripNumber,...op,signatureRequired:(t.fields||[]).some(f=>f.type==="SIGNATURE"),
      submittedBy:actor(req),submittedAt:status==="REVIEW"?new Date():null
    });
    res.status(201).json({success:true,submission:sanitizeSubmission(s)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save form"});}
});

router.get("/submissions", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;

    const query={tenantId:g.tenantId};
    const requestedStatus=clean(req.query.status).toUpperCase();
    if(["DRAFT","REVIEW","CONFIRMED","ARCHIVED"].includes(requestedStatus)){
      query.status=requestedStatus;
    }

    const rows=await SmartFormSubmission.find(query).sort({createdAt:-1}).limit(500).lean();

    const tripIds=rows.map(x=>x.tripId).filter(Boolean);
    const trips=tripIds.length
      ? await Trip.find({_id:{$in:tripIds},tenantId:g.tenantId})
          .select("_id stops distanceMiles durationMinutes priceAmount")
          .lean()
      : [];
    const tripMap=new Map(trips.map(t=>[String(t._id),t]));

    const submissions=rows.map(row=>{
      const out=sanitizeSubmission(row);
      const trip=row.tripId ? tripMap.get(String(row.tripId)) : null;

      if(trip){
        if(Array.isArray(trip.stops) && trip.stops.length) out.stops=trip.stops;
        if(Number(trip.distanceMiles)>0) out.distanceMiles=Number(trip.distanceMiles);
        if(Number(trip.durationMinutes)>0) out.durationMinutes=Number(trip.durationMinutes);
        if(Number(trip.priceAmount)>0 && !Number(out?.pricing?.amount)){
          out.pricing={...(out.pricing||{}),calculated:true,amount:Number(trip.priceAmount),currency:"USD"};
        }
      }

      return out;
    });

    res.json({success:true,submissions});
  }catch(err){
    res.status(500).json({success:false,message:"Failed to load review"});
  }
});

router.post("/submissions/:id/review", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!s) return res.status(404).json({success:false,message:"Submission not found"});
    if(s.status==="CONFIRMED") return res.status(409).json({success:false,message:"Already confirmed"});
    if(!s.tripNumber){
      const t=await SmartFormTemplate.findOne({_id:s.templateId,tenantId:g.tenantId}).lean();
      if(!t) return res.status(404).json({success:false,message:"Template not found"});
      const op=operationalData(t,s.formData||{});
      const requiredOps=[["CLIENT_NAME","Client Name",op.clientName],["PICKUP_ADDRESS","Pickup Address",op.pickupAddress],["DROPOFF_ADDRESS","Dropoff Address",op.dropoffAddress],["TRIP_DATE","Trip Date",op.tripDate],["PICKUP_TIME","Pickup Time",op.pickupTime],["SERVICE","Service",op.serviceName]];
      const empty=requiredOps.filter(([, ,value])=>!value).map(([,label])=>label);
      if(empty.length) return res.status(400).json({success:false,message:`Review fields missing: ${empty.join(", ")}`});
      Object.assign(s,op);
      s.tripNumber=await nextSmartFormTripNumber(g.tenantId,op.serviceName);
    }
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


// Upload a completed copy of the SAME Smart Form template and extract only configured fields.
const completedFormUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});
router.post("/templates/:id/import-completed", completedFormUpload.single("file"), async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    if(!req.file?.buffer?.length) return res.status(400).json({success:false,message:"Completed form file is required"});
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId,active:true}).lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    if(!process.env.GEMINI_API_KEY) return res.status(503).json({success:false,message:"GEMINI_API_KEY is not configured on the server"});
    const fields=(t.fields||[]).filter(f=>f.type!=="SIGNATURE").map(f=>({key:f.key,label:f.label,type:f.type}));
    const prompt=`This uploaded document is a completed copy of the configured transportation form named ${JSON.stringify(t.name)}. Extract ONLY the configured fields below. Do not invent values. Return JSON only as {formData:{...}} using EXACT keys. If a field is blank or unreadable return an empty string. Configured fields: ${JSON.stringify(fields)}`;
    const model=clean(process.env.SMART_FORMS_GEMINI_MODEL)||"gemini-3.8-flash";
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"x-goog-api-key":process.env.GEMINI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:req.file.mimetype||"application/pdf",data:req.file.buffer.toString("base64")}}]}],generationConfig:{responseMimeType:"application/json",maxOutputTokens:8192}})});
    const raw=await r.json(); if(!r.ok) throw new Error(raw?.error?.message||"Form extraction failed");
    const txt=(raw?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(x=>x?.text||"").join("\n").replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
    const parsed=JSON.parse(txt||"{}"); const incoming=parsed.formData&&typeof parsed.formData==="object"?parsed.formData:{}; const allowed=new Set(fields.map(f=>f.key)); const formData={}; for(const [k,v] of Object.entries(incoming)){if(allowed.has(k))formData[k]=v;}
    const op=operationalData(t,formData);
    res.json({success:true,templateId:String(t._id),templateName:t.name,formData,operationalData:op,importSource:{fileName:req.file.originalname||"completed-form",mimeType:req.file.mimetype||"",imported:true}});
  }catch(err){console.error("SMART FORM IMPORT ERROR",err);res.status(500).json({success:false,message:err?.message||"Failed to extract completed form"});}
});

// Price a Smart Form trip using the selected template's private pricing engine.
router.post("/templates/:id/calculate-price", async (req,res)=>{
  try{const g=await gate(req,res);if(!g)return;const result=await calculateSmartFormPrice({...req.body,tenantId:g.tenantId,templateId:req.params.id});res.json(result);}
  catch(err){res.status(err?.statusCode||500).json({success:false,message:err?.message||"Failed to calculate Smart Form price"});}
});

module.exports = router;
