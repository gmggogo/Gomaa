const express=require("express");
const jwt=require("jsonwebtoken");
const multer=require("multer");

const Tenant=require("../models/Tenant");
const Trip=require("../models/Trip");
const Service=require("../models/Service");
const SmartFormTemplate=require("../models/SmartFormTemplate");
const SmartFormDocument=require("../models/SmartFormDocument");
const SmartFormCounter=require("../models/SmartFormCounter");

const analyzer=require("../services/smartFormAnalyzerService");
const converter=require("../services/smartFormConverterService");
const generator=require("../services/smartFormGeneratorService");
const builder=require("../services/smartFormBuilderService");
const mapping=require("../services/smartFormMappingService");

const router=express.Router();
const JWT_SECRET=process.env.JWT_SECRET||"dev_secret";
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});

function clean(v){return String(v??"").trim();}
function upper(v){return clean(v).toUpperCase();}
function bearer(req){const h=clean(req.headers.authorization);return h.toLowerCase().startsWith("bearer ")?h.slice(7).trim():"";}
function escapeRegex(v){return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

function auth(req,res,next){
  try{
    const v=jwt.verify(bearer(req),JWT_SECRET);
    req.authUser={
      id:v.id||null,
      name:v.name||v.username||"",
      role:v.role||"",
      tenantId:v.tenantId||null
    };
    if(req.authUser.role!=="PLATFORM_ADMIN"&&!req.authUser.tenantId){
      return res.status(403).json({success:false,message:"Tenant Required"});
    }
    next();
  }catch(_){
    return res.status(401).json({success:false,message:"Invalid Token"});
  }
}

function tenantId(req){
  return req.authUser.role==="PLATFORM_ADMIN"
    ?clean(req.query.tenantId||req.body?.tenantId)
    :clean(req.authUser.tenantId);
}

async function gate(req,res,next){
  try{
    const id=tenantId(req);
    if(!id)return res.status(400).json({success:false,message:"tenantId is required"});
    const t=await Tenant.findById(id);
    if(!t)return res.status(404).json({success:false,message:"Tenant not found"});
    if(t.smartFormsEnabled!==true){
      return res.status(403).json({success:false,message:"Smart Forms is disabled for this company"});
    }
    req.smartTenant=t;
    next();
  }catch(err){
    return res.status(400).json({success:false,message:err.message||"Invalid tenant"});
  }
}

function serviceIdentity(service){
  if(Number(service?.customSlot)>0)return `CUSTOM_${Number(service.customSlot)}`;
  return upper(service?.serviceKey);
}

function serviceOperationalKey(service){
  return upper(
    service?.customServiceCode||
    service?.serviceKey||
    service?.companySuffix||
    service?.reservedSuffix
  );
}

function serviceTitle(service){
  return clean(service?.title||service?.name||service?.serviceKey);
}

async function enabledServices(tenant){
  const allowed=new Set((Array.isArray(tenant?.allowedServices)?tenant.allowedServices:[]).map(upper).filter(Boolean));
  const docs=await Service.find({tenantId:tenant._id,enabled:{$ne:false}}).sort({createdAt:1}).lean();
  const seen=new Set();
  return docs.filter(s=>{
    const identity=serviceIdentity(s);
    const key=serviceOperationalKey(s);
    if(!identity||!key)return false;
    if(Number(s.customSlot)>0&&s.customConfigured!==true)return false;
    if(allowed.size&& !allowed.has(identity))return false;
    if(seen.has(identity))return false;
    seen.add(identity);
    return true;
  }).map(s=>({
    id:String(s._id),
    key:serviceOperationalKey(s),
    name:serviceTitle(s),
    identity:serviceIdentity(s),
    customSlot:Number(s.customSlot||0),
    customerSignatureRequired:s.customerSignatureRequired===true
  }));
}

async function counterReady(tenantIdValue){
  await SmartFormCounter.updateOne(
    {tenantId:tenantIdValue},
    {$setOnInsert:{tenantId:tenantIdValue,nextTripSequence:100,nextSheetSequence:1}},
    {upsert:true}
  );
}

async function nextSheetNumber(tenantIdValue){
  await counterReady(tenantIdValue);
  const c=await SmartFormCounter.findOneAndUpdate(
    {tenantId:tenantIdValue},
    {$inc:{nextSheetSequence:1}},
    {new:false}
  ).lean();
  const n=Math.max(1,Number(c?.nextSheetSequence)||1);
  return `SF-SHEET-${String(n).padStart(6,"0")}`;
}

function twoLetters(value,fallback="SV"){
  const s=upper(value).replace(/[^A-Z0-9]/g,"");
  if(s.length>=2)return s.slice(0,2);
  if(s.length===1)return `${s}X`;
  return fallback;
}

async function nextTripNumber(tenantIdValue,serviceName){
  await counterReady(tenantIdValue);
  for(let attempt=0;attempt<50;attempt+=1){
    const c=await SmartFormCounter.findOneAndUpdate(
      {tenantId:tenantIdValue},
      {$inc:{nextTripSequence:1}},
      {new:false}
    ).lean();
    const n=Math.max(100,Number(c?.nextTripSequence)||100);
    const candidate=`SF${n}${twoLetters(serviceName)}`;
    const exists=await Trip.exists({tripNumber:candidate});
    if(!exists)return candidate;
  }
  throw new Error("Unable to generate a unique Smart Form trip number");
}

function templateSourceValue(template,fieldId){
  const f=(template?.fields||[]).find(x=>clean(x.fieldId)===clean(fieldId));
  return f?clean(f.sourcePath):"";
}

function valueByCanonical(template,commonValues,tripValues,canonical){
  const all={...(commonValues||{}),...(tripValues||{})};
  for(const [fieldId,value] of Object.entries(all)){
    if(templateSourceValue(template,fieldId)===canonical&&clean(value)!=="")return value;
  }
  return "";
}

function buildDraftTrip(template,commonValues,row,service){
  const values=row?.values&&typeof row.values==="object"?row.values:{};
  const clientName=clean(row?.clientName||valueByCanonical(template,commonValues,values,"clientName"));
  const clientPhone=clean(row?.clientPhone||valueByCanonical(template,commonValues,values,"clientPhone"));
  const memberId=clean(row?.memberId||valueByCanonical(template,commonValues,values,"memberId"));
  const pickup=clean(row?.pickup||valueByCanonical(template,commonValues,values,"pickup"));
  const dropoff=clean(row?.dropoff||valueByCanonical(template,commonValues,values,"dropoff"));
  const tripDate=clean(row?.tripDate||valueByCanonical(template,commonValues,values,"tripDate"));
  const tripTime=clean(row?.tripTime||valueByCanonical(template,commonValues,values,"tripTime"));
  return {
    slot:Math.max(1,Number(row?.slot)||1),
    clientName,
    clientPhone,
    memberId,
    pickup,
    dropoff,
    tripDate,
    tripTime,
    serviceKey:service.key,
    serviceName:service.name,
    values,
    confirmed:false,
    tripId:null,
    tripNumber:""
  };
}

router.use(auth);

router.get("/feature",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id)return res.status(400).json({success:false,enabled:false,message:"tenantId is required"});
    const t=await Tenant.findById(id).select("smartFormsEnabled").lean();
    return res.json({success:true,enabled:t?.smartFormsEnabled===true});
  }catch(err){
    return res.status(500).json({success:false,enabled:false,message:err.message});
  }
});

router.use(gate);

/* =========================================================
   SERVICE LIST USED BY THE SMART FORM DATA-ENTRY SHEET
========================================================= */
router.get("/services",async(req,res)=>{
  try{
    const services=await enabledServices(req.smartTenant);
    return res.json({success:true,services});
  }catch(err){
    console.error("SMART FORM SERVICES ERROR",err);
    return res.status(500).json({success:false,message:err.message});
  }
});

/* =========================================================
   TEMPLATES
========================================================= */
router.get("/templates",async(req,res)=>{
  const q={tenantId:req.smartTenant._id,archived:{$ne:true}};
  if(req.query.organizationId)q.organizationId=clean(req.query.organizationId);
  const templates=await SmartFormTemplate.find(q)
    .select("-sourceFile.data")
    .sort({updatedAt:-1})
    .lean();
  return res.json({success:true,templates});
});

router.get("/templates/:id/source",async(req,res)=>{
  const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:req.smartTenant._id});
  if(!t||!t.sourceFile?.data)return res.status(404).end();
  return res.type(t.sourceFile.mimeType||"application/octet-stream").send(t.sourceFile.data);
});

router.get("/templates/:id/editable",async(req,res)=>{
  try{
    const q={_id:req.params.id,tenantId:req.smartTenant._id,archived:{$ne:true}};
    if(req.query.organizationId)q.organizationId=clean(req.query.organizationId);
    const t=await SmartFormTemplate.findOne(q);
    if(!t||!t.sourceFile?.data){
      return res.status(404).json({success:false,message:"Template source not found"});
    }
    const made=await converter.buildEditablePdfFromTemplate(t);
    res.set("Cache-Control","no-store");
    res.set("X-Smart-Form-Fields",String(made.created));
    return res.type("application/pdf").send(made.buffer);
  }catch(err){
    console.error("SMART FORM EDITABLE ERROR",err);
    return res.status(err.code==="SMART_FORM_UNSUPPORTED_SOURCE"?415:500).json({success:false,message:err.message});
  }
});

router.post("/templates/analyze",upload.single("file"),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({success:false,message:"Blank form file is required"});
    const organizationId=clean(req.body.organizationId);
    const organizationName=clean(req.body.organizationName);
    if(!organizationId||!organizationName){
      return res.status(400).json({success:false,message:"Organization is required"});
    }
    const analysis=await analyzer.analyzeBlankForm(req.file);
    const mapped=mapping.applyAutoMappings(analysis.fields);
    await converter.buildEditablePdf(req.file,mapped);
    const doc=await SmartFormTemplate.create({
      tenantId:req.smartTenant._id,
      organizationId,
      organizationName,
      organizationType:upper(req.body.organizationType||"INSURANCE"),
      name:clean(req.body.name||organizationName),
      active:true,
      archived:false,
      sourceFile:{
        originalName:req.file.originalname,
        mimeType:req.file.mimetype,
        size:req.file.size,
        data:req.file.buffer
      },
      pageCount:analysis.pageCount,
      sections:analysis.sections,
      fields:mapped,
      analysisProvider:analysis.analysisProvider,
      analyzedAt:new Date(),
      createdBy:req.authUser.name,
      updatedBy:req.authUser.name
    });
    const out=doc.toObject();
    if(out.sourceFile)delete out.sourceFile.data;
    return res.status(201).json({success:true,template:out,editableReady:true});
  }catch(err){
    console.error("SMART FORM ANALYZE ERROR",err);
    return res.status(err?.code===11000?409:err?.code==="SMART_FORM_UNSUPPORTED_SOURCE"?415:500).json({
      success:false,
      message:err?.code===11000
        ?"A form template already exists with this name for this organization"
        :err.message
    });
  }
});

router.put("/templates/:id",async(req,res)=>{
  try{
    const orgId=clean(req.body.organizationId||req.query.organizationId);
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:req.smartTenant._id,organizationId:orgId});
    if(!t)return res.status(404).json({success:false,message:"Template not found"});
    for(const k of ["name","organizationName","organizationType","active"]){
      if(req.body[k]!==undefined)t[k]=req.body[k];
    }
    if(Array.isArray(req.body.fields))t.fields=req.body.fields;
    if(Array.isArray(req.body.sections))t.sections=req.body.sections;
    t.updatedBy=req.authUser.name;
    await t.save();
    const out=t.toObject();
    if(out.sourceFile)delete out.sourceFile.data;
    return res.json({success:true,template:out});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

router.delete("/templates/:id",async(req,res)=>{
  try{
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:req.smartTenant._id});
    if(!t)return res.status(404).json({success:false,message:"Template not found"});
    t.active=false;
    t.archived=true;
    t.updatedBy=req.authUser.name;
    await t.save();
    await SmartFormDocument.updateMany(
      {tenantId:req.smartTenant._id,templateId:t._id,status:"ENTRY_REVIEW"},
      {$set:{status:"ARCHIVED"}}
    );
    return res.json({success:true,archived:true});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

router.delete("/organizations/:organizationId",async(req,res)=>{
  try{
    const organizationId=clean(req.params.organizationId);
    const result=await SmartFormTemplate.updateMany(
      {tenantId:req.smartTenant._id,organizationId},
      {$set:{active:false,archived:true,updatedBy:req.authUser.name}}
    );
    await SmartFormDocument.updateMany(
      {tenantId:req.smartTenant._id,organizationId,status:"ENTRY_REVIEW"},
      {$set:{status:"ARCHIVED"}}
    );
    return res.json({success:true,archivedForms:result.modifiedCount||0});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

/* =========================================================
   MEMBER / CLIENT LOOKUP FROM THIS TENANT'S PRIOR TRIPS
========================================================= */
router.get("/clients/lookup",async(req,res)=>{
  try{
    const q=clean(req.query.q);
    if(q.length<2)return res.json({success:true,clients:[]});
    const re=new RegExp(escapeRegex(q),"i");
    const trips=await Trip.find({
      tenantId:req.smartTenant._id,
      $or:[{memberId:re},{clientName:re},{clientPhone:re}]
    })
      .select("memberId clientName clientPhone")
      .sort({_id:-1})
      .limit(40)
      .lean();
    const seen=new Set();
    const clients=[];
    for(const t of trips){
      const key=clean(t.memberId)||`${clean(t.clientName)}|${clean(t.clientPhone)}`;
      if(!key||seen.has(key))continue;
      seen.add(key);
      clients.push({memberId:clean(t.memberId),clientName:clean(t.clientName),clientPhone:clean(t.clientPhone)});
      if(clients.length>=20)break;
    }
    return res.json({success:true,clients});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

/* =========================================================
   DATA ENTRY SHEET -> FORM REVIEW
========================================================= */
router.post("/sheets",async(req,res)=>{
  try{
    const organizationId=clean(req.body.organizationId);
    const templateId=clean(req.body.templateId);
    const commonValues=req.body.commonValues&&typeof req.body.commonValues==="object"?req.body.commonValues:{};
    const rows=Array.isArray(req.body.trips)?req.body.trips:[];
    if(!organizationId||!templateId)return res.status(400).json({success:false,message:"Organization and template are required"});
    if(!rows.length)return res.status(400).json({success:false,message:"At least one trip is required"});

    const template=await SmartFormTemplate.findOne({
      _id:templateId,
      tenantId:req.smartTenant._id,
      organizationId,
      active:{$ne:false},
      archived:{$ne:true}
    });
    if(!template)return res.status(404).json({success:false,message:"Template not found"});

    const services=await enabledServices(req.smartTenant);
    const serviceMap=new Map(services.map(s=>[upper(s.key),s]));
    const draftTrips=[];
    for(const row of rows){
      const service=serviceMap.get(upper(row?.serviceKey));
      if(!service)return res.status(422).json({success:false,message:`Trip ${row?.slot||draftTrips.length+1}: Service is not enabled`});
      const draft=buildDraftTrip(template,commonValues,row,service);
      for(const [field,label] of [["pickup","Pickup"],["dropoff","Drop-off"],["tripDate","Date"],["tripTime","Time"]]){
        if(!clean(draft[field]))return res.status(422).json({success:false,message:`Trip ${draft.slot}: ${label} is required`});
      }
      draftTrips.push(draft);
    }

    const sheetNumber=await nextSheetNumber(req.smartTenant._id);
    const document=await SmartFormDocument.create({
      tenantId:req.smartTenant._id,
      organizationId,
      organizationName:template.organizationName,
      templateId:template._id,
      templateVersion:Number(template.version||1),
      sheetNumber,
      commonValues,
      draftTrips,
      status:"ENTRY_REVIEW"
    });
    const out=document.toObject();
    if(out.generatedFile)delete out.generatedFile.data;
    return res.status(201).json({success:true,document:out});
  }catch(err){
    console.error("SMART FORM SHEET ERROR",err);
    return res.status(500).json({success:false,message:err.message});
  }
});

router.get("/review",async(req,res)=>{
  try{
    const q={tenantId:req.smartTenant._id,status:"ENTRY_REVIEW"};
    if(req.query.organizationId)q.organizationId=clean(req.query.organizationId);
    const documents=await SmartFormDocument.find(q)
      .select("-generatedFile.data")
      .sort({createdAt:1})
      .lean();
    return res.json({success:true,documents});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

router.delete("/documents/:id/draft-trip/:slot",async(req,res)=>{
  try{
    const d=await SmartFormDocument.findOne({_id:req.params.id,tenantId:req.smartTenant._id,status:"ENTRY_REVIEW"});
    if(!d)return res.status(404).json({success:false,message:"Review sheet not found"});
    const slot=Number(req.params.slot);
    const before=d.draftTrips.length;
    d.draftTrips=d.draftTrips.filter(t=>Number(t.slot)!==slot);
    if(d.draftTrips.length===before)return res.status(404).json({success:false,message:"Trip row not found"});
    if(!d.draftTrips.length)d.status="ARCHIVED";
    await d.save();
    return res.json({success:true,remaining:d.draftTrips.length});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

/* =========================================================
   CONFIRM REVIEW SHEET -> CREATE NORMAL GH TRIPS
========================================================= */
router.post("/documents/:id/confirm",async(req,res)=>{
  try{
    const d=await SmartFormDocument.findOne({_id:req.params.id,tenantId:req.smartTenant._id});
    if(!d)return res.status(404).json({success:false,message:"Review sheet not found"});
    if(d.status!=="ENTRY_REVIEW"){
      const already=(d.draftTrips||[]).filter(t=>t.confirmed&&t.tripId).map(t=>({tripId:t.tripId,tripNumber:t.tripNumber}));
      return res.json({success:true,created:already,alreadyConfirmed:true});
    }

    const template=await SmartFormTemplate.findOne({_id:d.templateId,tenantId:req.smartTenant._id});
    if(!template)return res.status(404).json({success:false,message:"Template not found"});
    const services=await enabledServices(req.smartTenant);
    const serviceMap=new Map(services.map(s=>[upper(s.key),s]));
    const created=[];

    for(const draft of d.draftTrips){
      if(draft.confirmed&&draft.tripId){
        created.push({tripId:draft.tripId,tripNumber:draft.tripNumber});
        continue;
      }
      const service=serviceMap.get(upper(draft.serviceKey));
      if(!service)return res.status(422).json({success:false,message:`Trip ${draft.slot}: Service is no longer enabled`});

      const tripNumber=await nextTripNumber(req.smartTenant._id,service.name);
      const allValues={...(d.commonValues||{}),...(draft.values||{})};
      const trip=await Trip.create({
        tenantId:req.smartTenant._id,
        tenantSlug:clean(req.smartTenant.slug),
        type:"company",
        company:clean(template.organizationName),
        entryName:clean(req.authUser.name),
        clientName:clean(draft.clientName),
        clientPhone:clean(draft.clientPhone),
        memberId:clean(draft.memberId),
        tripNumber,
        pickup:clean(draft.pickup),
        dropoff:clean(draft.dropoff),
        tripDate:clean(draft.tripDate),
        tripTime:clean(draft.tripTime),
        pickupTime:clean(draft.tripTime),
        serviceType:service.name,
        serviceKey:service.key,
        serviceCode:service.key,
        serviceName:service.name,
        customServiceSlot:Number(service.customSlot||0),
        serviceSuffix:service.key,
        tripNumberSuffix:twoLetters(service.name),
        status:"Scheduled",
        dispatchSelected:false,
        source:"smart_form",
        bookingSource:"SMART_FORM",
        bookingData:{
          smartForm:true,
          smartFormDocumentId:String(d._id),
          smartFormTemplateId:String(template._id),
          smartFormSheetNumber:d.sheetNumber,
          smartFormOrganizationId:d.organizationId,
          smartFormOrganizationName:d.organizationName,
          values:allValues
        }
      });

      draft.confirmed=true;
      draft.tripId=trip._id;
      draft.tripNumber=tripNumber;
      d.tripIds.push(trip._id);
      created.push({tripId:trip._id,tripNumber});
    }

    d.status="CONFIRMED";
    d.confirmedAt=new Date();
    await d.save();
    return res.status(201).json({success:true,created});
  }catch(err){
    console.error("SMART FORM CONFIRM ERROR",err);
    return res.status(500).json({success:false,message:err.message});
  }
});

/* =========================================================
   EXISTING COMPLETED-TRIP / PDF DOCUMENT WORKFLOW
   KEPT FROM THE CURRENT ROUTE FILE
========================================================= */
router.get("/completed-trips",async(req,res)=>{
  const organizationId=clean(req.query.organizationId);
  const template=await SmartFormTemplate.findOne({tenantId:req.smartTenant._id,organizationId,active:true,archived:{$ne:true}}).lean();
  if(!template)return res.json({success:true,trips:[]});
  const q={tenantId:req.smartTenant._id,status:/^completed$/i};
  if(template.organizationType==="BROKER")q.brokerName=template.organizationName;
  else if(template.organizationType==="COMPANY")q.company=template.organizationName;
  const trips=await Trip.find(q).sort({tripDate:-1,tripTime:-1}).limit(250).lean();
  return res.json({success:true,trips});
});

router.post("/documents/generate",async(req,res)=>{
  try{
    const organizationId=clean(req.body.organizationId);
    const template=await SmartFormTemplate.findOne({_id:req.body.templateId,tenantId:req.smartTenant._id,organizationId});
    if(!template)return res.status(404).json({success:false,message:"Template not found"});
    const ids=Array.isArray(req.body.tripIds)?req.body.tripIds:[];
    const trips=await Trip.find({_id:{$in:ids},tenantId:req.smartTenant._id,status:/^completed$/i}).sort({tripDate:1,tripTime:1});
    if(trips.length!==ids.length){
      return res.status(422).json({success:false,message:"Every selected trip must exist in this tenant and be Completed"});
    }
    const doc=await generator.generate({tenant:req.smartTenant,template,trips,userName:req.authUser.name});
    return res.status(201).json({
      success:true,
      document:{
        ...doc.toObject(),
        generatedFile:{
          mimeType:doc.generatedFile.mimeType,
          generatedAt:doc.generatedFile.generatedAt,
          available:!!doc.generatedFile.data
        }
      }
    });
  }catch(err){
    console.error("SMART FORM GENERATE ERROR",err);
    return res.status(500).json({success:false,message:err.message});
  }
});

router.get("/documents",async(req,res)=>{
  const q={tenantId:req.smartTenant._id};
  if(req.query.organizationId)q.organizationId=clean(req.query.organizationId);
  if(req.query.status)q.status=upper(req.query.status);
  const docs=await SmartFormDocument.find(q).select("-generatedFile.data").sort({updatedAt:-1}).lean();
  return res.json({success:true,documents:docs});
});

router.put("/documents/:id",async(req,res)=>{
  try{
    const d=await SmartFormDocument.findOne({_id:req.params.id,tenantId:req.smartTenant._id,organizationId:clean(req.body.organizationId)});
    if(!d)return res.status(404).json({success:false,message:"Document not found"});
    if(req.body.manualOverrides&&typeof req.body.manualOverrides==="object")d.manualOverrides=req.body.manualOverrides;
    const t=await SmartFormTemplate.findOne({_id:d.templateId,tenantId:req.smartTenant._id,organizationId:d.organizationId});
    if(t){
      try{
        d.generatedFile.data=await builder.buildPdf(t,d.values,d.manualOverrides);
        d.generatedFile.generatedAt=new Date();
      }catch(err){
        if(err.code!=="PDF_LIB_MISSING")throw err;
      }
    }
    await d.save();
    return res.json({success:true,document:d});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

router.post("/documents/:id/finalize",async(req,res)=>{
  try{
    const d=await SmartFormDocument.findOne({_id:req.params.id,tenantId:req.smartTenant._id,organizationId:clean(req.body.organizationId)});
    if(!d)return res.status(404).json({success:false,message:"Document not found"});
    d.status="FINALIZED";
    d.finalizedAt=new Date();
    d.finalizedBy=req.authUser.name;
    await d.save();
    return res.json({success:true,document:d});
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

router.get("/documents/:id/file",async(req,res)=>{
  try{
    const d=await SmartFormDocument.findOne({_id:req.params.id,tenantId:req.smartTenant._id,organizationId:clean(req.query.organizationId)});
    if(!d?.generatedFile?.data){
      return res.status(404).json({success:false,message:"Generated PDF is not available. Install pdf-lib on the server if generation is pending."});
    }
    return res.type(d.generatedFile.mimeType||"application/pdf").send(d.generatedFile.data);
  }catch(err){
    return res.status(500).json({success:false,message:err.message});
  }
});

module.exports=router;
