const mongoose = require("mongoose");
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
  limits:{ fileSize:8*1024*1024, files:20 }
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



const ATTACHMENT_FIELD_TARGETS = Object.freeze([
  { internalKey:"clientName", label:"Customer Name", aliases:["client name","customer name","patient","patient name","member name","passenger","rider"] },
  { internalKey:"clientPhone", label:"Phone", aliases:["phone","phone number","phone #","telephone","member phone","mobile"] },
  { internalKey:"pickup", label:"Pickup Address", aliases:["pickup","pickup address","pick up","pick up address","origin","from address"] },
  { internalKey:"stops", label:"Stops", aliases:["stop","stops","additional stop","additional stops","waypoint","waypoints"] },
  { internalKey:"dropoff", label:"Dropoff Address", aliases:["dropoff","drop off","dropoff address","drop off address","destination","to address"] },
  { internalKey:"tripDate", label:"Trip Date", aliases:["date","trip date","pickup date","pick up date","service date"] },
  { internalKey:"tripTime", label:"Pickup Time", aliases:["time","pickup time","pick up time","pu time"] },
  { internalKey:"service", label:"Service", aliases:["service","service type","vehicle type","transport type"] },
  { internalKey:"appointmentTime", label:"Appointment Time", aliases:["appointment","appointment time","appt","appt time"] },
  { internalKey:"returnTime", label:"Return Time", aliases:["return","return time","will call return"] },
  { internalKey:"memberId", label:"Member ID", aliases:["member id","member #","medicaid id","insurance id"] },
  { internalKey:"notes", label:"Notes", aliases:["notes","note","comments","comment","special instructions"] }
]);

function attachmentFieldTargetByKey(key){
  return ATTACHMENT_FIELD_TARGETS.find(
    item=>item.internalKey===String(key||"").trim()
  ) || null;
}

async function geminiMapUnknownAttachmentFields(fields){
  const apiKey=String(process.env.GEMINI_API_KEY||"").trim();

  if(!apiKey){
    const err=new Error(
      "Unknown field names require GEMINI_API_KEY on the server"
    );
    err.statusCode=503;
    throw err;
  }

  const model=
    String(process.env.ATTACHMENT_GEMINI_MODEL||"").trim() ||
    "gemini-3.5-flash-lite";

  const allowed=ATTACHMENT_FIELD_TARGETS.map(item=>({
    internalKey:item.internalKey,
    meaning:item.label,
    examples:item.aliases
  }));

  const prompt=[
    "Map unfamiliar transportation document column labels to GH Mobility canonical fields.",
    "Choose ONLY from the allowed internalKey values below.",
    "Do not invent a new key.",
    "Return JSON only.",
    `Allowed targets: ${JSON.stringify(allowed)}`,
    `Unknown document fields: ${JSON.stringify(fields)}`,
    'Required JSON: {"mappings":[{"index":0,"internalKey":"pickup"}]}'
  ].join("\n");

  const response=await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method:"POST",
      headers:{
        "x-goog-api-key":apiKey,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        contents:[{
          role:"user",
          parts:[{text:prompt}]
        }],
        generationConfig:{
          responseMimeType:"application/json",
          temperature:0
        }
      })
    }
  );

  const payload=await response.json().catch(()=>({}));

  if(!response.ok){
    const err=new Error(
      String(payload?.error?.message||"Gemini field mapping failed")
    );
    err.statusCode=502;
    throw err;
  }

  const modelText=(payload?.candidates?.[0]?.content?.parts||[])
    .map(part=>String(part?.text||""))
    .join("")
    .trim();

  let parsed={};
  try{
    parsed=JSON.parse(modelText);
  }catch(_){
    parsed={};
  }

  const incoming=Array.isArray(parsed?.mappings)
    ? parsed.mappings
    : [];

  return incoming
    .map(item=>({
      index:Number(item?.index),
      internalKey:String(item?.internalKey||"").trim()
    }))
    .filter(item=>
      Number.isFinite(item.index) &&
      attachmentFieldTargetByKey(item.internalKey)
    );
}


router.use(requireTenantApi);

router.get("/feature",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const tenant = await Tenant.findById(tenantId).select("attachmentImportEnabled").lean();
    return res.json({success:true,enabled:tenant?.attachmentImportEnabled === true});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load Attachment Import feature"}); }
});


router.post("/map-template-fields",async(req,res)=>{
  try{
    const tenantId=tenantIdFor(req);
    const feature=await featureTenant(tenantId);

    if(!feature.ok){
      return res.status(feature.status).json({
        success:false,
        message:feature.message
      });
    }

    const fields=Array.isArray(req.body?.fields)
      ? req.body.fields
          .map(item=>({
            index:Number(item?.index),
            label:String(item?.label||"").trim()
          }))
          .filter(item=>Number.isFinite(item.index) && item.label)
          .slice(0,50)
      : [];

    if(!fields.length){
      return res.json({
        success:true,
        mappings:[],
        aiUsed:false
      });
    }

    const mappings=await geminiMapUnknownAttachmentFields(fields);

    return res.json({
      success:true,
      mappings,
      aiUsed:true
    });
  }catch(err){
    console.error("ATTACHMENT FIELD MAP ERROR:",err);
    return res.status(err?.statusCode || 500).json({
      success:false,
      message:err?.message || "Failed to identify document fields"
    });
  }
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
    const openOnly = String(req.query?.open || "").trim().toLowerCase() === "true";
    const filter = {tenantId};
    if(status) filter.status = status;
    else if(openOnly) filter.status = {$in:["UPLOADED","REVIEW","PARTIAL"]};
    const templateId = String(req.query?.templateId || "").trim();
    if(templateId){
      if(!mongoose.Types.ObjectId.isValid(templateId)){
        return res.status(400).json({success:false,message:"Invalid templateId"});
      }
      filter.templateId = templateId;
    }
    const imports = await AttachmentImport.find(filter).sort({updatedAt:-1,createdAt:-1}).limit(200);
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

    const parsed = await attachmentParserService.parseAttachment({files:req.files,template});
    const sourceFiles = req.files.map((file,index)=>({
      originalName:file.originalname,
      mimeType:file.mimetype,
      size:file.size,
      page:index+1,
      side:req.files.length === 2 ? (index === 0 ? "FRONT" : "BACK") : "PAGE",
      data:file.buffer
    }));

    const documentNumber = await attachmentImportService.nextDocumentNumber(tenantId);
    const daily = await attachmentImportService.allocateDailyEntryNumbers(tenantId,parsed.rows.length);

    const importDoc = await AttachmentImport.create({
      tenantId,
      tenantSlug:feature.tenant.slug || "",
      documentNumber,
      dailyEntryDate:daily.dayKey,
      templateId:template._id,
      templateName:template.name,
      sourceType:parsed.sourceType,
      sourceFiles,
      reviewRows:parsed.rows.map((r,index)=>({
        rowIndex:r.rowIndex,
        dailyEntryNumber:daily.numbers[index] ?? null,
        extractionConfidence:r.extractionConfidence ?? null,
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
    const updates=Array.isArray(req.body?.rows) ? req.body.rows : [];

    if(!updates.length){
      return res.status(400).json({success:false,message:"No review rows were sent to save"});
    }

    const templateCache = { value:null };

    async function applyAndSave(){
      const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
      if(!importDoc) return {notFound:true};
      if(["CONFIRMED","ARCHIVED"].includes(importDoc.status)) return {locked:true};

      let changed=0;
      for(const update of updates){
        const row=importDoc.reviewRows.find(
          r=>Number(r.rowIndex)===Number(update.rowIndex)
        );
        if(!row || row.confirmed) continue;

        if(update.data && typeof update.data==="object"){
          row.data={...update.data};
          changed+=1;
        }

        if(update.serviceKey!==undefined){
          row.serviceKey=String(update.serviceKey||"").trim().toUpperCase();
          row.serviceResolution=row.serviceKey ? "MANUAL" : "UNRESOLVED";
          changed+=1;
        }
      }

      if(!changed) return {noChanges:true};

      if(!templateCache.value){
        templateCache.value=await AttachmentTemplate.findById(importDoc.templateId);
      }
      if(!templateCache.value) return {templateMissing:true};

      const services=await attachmentImportService.prepareReviewRows({
        importDoc,
        template:templateCache.value
      });

      importDoc.markModified("reviewRows");
      await importDoc.save();
      return {importDoc,services};
    }

    let result;
    try{
      result=await applyAndSave();
    }catch(err){
      // A second browser action may have saved the same import milliseconds
      // earlier. Reload the newest Mongo document and apply this request once
      // more instead of returning Mongoose's stale __v VersionError.
      if(err?.name!=="VersionError") throw err;
      result=await applyAndSave();
    }

    if(result?.notFound) return res.status(404).json({success:false,message:"Import not found"});
    if(result?.locked) return res.status(409).json({success:false,message:"Confirmed import cannot be edited"});
    if(result?.noChanges) return res.status(400).json({success:false,message:"No editable review rows were updated"});
    if(result?.templateMissing) return res.status(404).json({success:false,message:"Template not found"});

    return res.json({
      success:true,
      savedCount:updates.length,
      import:cleanImport(result.importDoc),
      services:result.services
    });
  }catch(err){
    console.error("ATTACHMENT REVIEW SAVE ERROR:",err);
    return res.status(500).json({
      success:false,
      message:err?.message || "Failed to save review"
    });
  }
});


router.post("/:id/review-rows/accept",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const rowIndexes = Array.isArray(req.body?.rowIndexes)
      ? req.body.rowIndexes.map(Number).filter(Number.isFinite)
      : [];
    if(!rowIndexes.length){
      return res.status(400).json({success:false,message:"Select at least one extracted trip"});
    }

    const importDoc = await AttachmentImport.findOneAndUpdate(
      {_id:req.params.id,tenantId,status:{$nin:["CONFIRMED","ARCHIVED"]}},
      {$set:{"reviewRows.$[row].acceptedForReview":true}},
      {new:true,arrayFilters:[{"row.rowIndex":{$in:rowIndexes},"row.confirmed":{$ne:true}}]}
    );
    if(!importDoc) return res.status(404).json({success:false,message:"Import not found or locked"});
    return res.json({success:true,import:cleanImport(importDoc)});
  }catch(err){
    console.error("ATTACHMENT REVIEW ACCEPT ERROR:",err);
    return res.status(500).json({success:false,message:err?.message || "Failed to move trip to Import Review"});
  }
});

router.delete("/:id/review-rows",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const importDoc = await AttachmentImport.findOne({
      _id:req.params.id,
      tenantId
    });

    if(!importDoc){
      return res.status(404).json({
        success:false,
        message:"Import not found"
      });
    }

    const rowIndexes = Array.isArray(req.body?.rowIndexes)
      ? req.body.rowIndexes.map(Number).filter(Number.isFinite)
      : [];

    if(!rowIndexes.length){
      return res.status(400).json({
        success:false,
        message:"Select at least one trip to delete"
      });
    }

    const requested = new Set(rowIndexes);
    const blocked = [];
    const before = importDoc.reviewRows.length;

    importDoc.reviewRows = importDoc.reviewRows.filter(row=>{
      const rowIndex = Number(row.rowIndex);

      if(!requested.has(rowIndex)){
        return true;
      }

      /*
        A row that already created a real Trip must never be deleted from
        Import Review, because that would break the attachment audit trail.
      */
      if(row.confirmed || row.tripId){
        blocked.push(rowIndex);
        return true;
      }

      return false;
    });

    const deletedCount = before - importDoc.reviewRows.length;

    if(!importDoc.reviewRows.length){
      importDoc.status = "REVIEW";
    }

    await importDoc.save();

    return res.json({
      success:true,
      deletedCount,
      blocked,
      import:cleanImport(importDoc)
    });
  }catch(err){
    console.error("ATTACHMENT REVIEW DELETE ERROR:",err);
    return res.status(500).json({
      success:false,
      message:err?.message || "Failed to delete selected review trips"
    });
  }
});


router.post("/:id/confirm",async(req,res)=>{
  try{
    const tenantId = tenantIdFor(req);
    const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
    if(!importDoc) return res.status(404).json({success:false,message:"Import not found"});
    const template = await AttachmentTemplate.findById(importDoc.templateId);
    if(!template) return res.status(404).json({success:false,message:"Template not found"});

    const rowIndexes = Array.isArray(req.body?.rowIndexes)
      ? req.body.rowIndexes.map(Number).filter(Number.isFinite)
      : null;

    if(rowIndexes && !rowIndexes.length){
      return res.status(400).json({success:false,message:"Select at least one trip to submit"});
    }

    await attachmentImportService.prepareReviewRows({importDoc,template});
    await importDoc.save();
    const result = await attachmentImportService.confirmImport({
      importDoc,
      template,
      rowIndexes
    });

    const requestedSet = Array.isArray(rowIndexes)
      ? new Set(rowIndexes.map(Number))
      : null;

    const failedRows = (result.importDoc.reviewRows || [])
      .filter(row=>{
        if(requestedSet && !requestedSet.has(Number(row.rowIndex))){
          return false;
        }
        return !row.confirmed || !row.tripId || !row.tripNumber;
      })
      .map(row=>({
        rowIndex:Number(row.rowIndex),
        errors:Array.isArray(row.validationErrors)
          ? row.validationErrors
          : []
      }));

    if(failedRows.length){
      return res.status(422).json({
        success:false,
        createdCount:result.created.length,
        trips:result.created.map(t=>({
          id:t._id,
          tripNumber:t.tripNumber,
          serviceKey:t.serviceKey
        })),
        failedRows,
        import:cleanImport(result.importDoc),
        message:failedRows
          .map(row=>`Row ${row.rowIndex}: ${row.errors.join(" • ") || "Trip was not created"}`)
          .join(" | ")
      });
    }

    return res.json({
      success:true,
      createdCount:result.created.length,
      trips:result.created.map(t=>({
        id:t._id,
        tripNumber:t.tripNumber,
        serviceKey:t.serviceKey
      })),
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
