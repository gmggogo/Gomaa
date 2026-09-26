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


function cleanText(value){
  return String(value ?? "").trim();
}

function normalizeAddressList(value){
  if(Array.isArray(value)){
    return value.map(cleanText).filter(Boolean);
  }

  const text = cleanText(value);
  if(!text) return [];

  return text
    .split(/\r?\n|\s*;\s*|\s*\|\s*/)
    .map(cleanText)
    .filter(Boolean);
}

async function googleGeocodeAddress(address){
  const cleanAddress = cleanText(address);
  if(!cleanAddress){
    return {
      ok:false,
      original:"",
      formattedAddress:"",
      lat:null,
      lng:null,
      partialMatch:false,
      status:"EMPTY"
    };
  }

  const key =
    process.env.GOOGLE_KEY ||
    process.env.GOOGLE_SERVER_KEY ||
    "";

  if(!key){
    const err = new Error("Google Maps server key is missing");
    err.statusCode = 503;
    throw err;
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(cleanAddress) +
    "&key=" +
    encodeURIComponent(key);

  const response = await fetch(url);
  const json = await response.json().catch(()=>({}));

  if(
    !response.ok ||
    json?.status !== "OK" ||
    !Array.isArray(json?.results) ||
    !json.results.length
  ){
    return {
      ok:false,
      original:cleanAddress,
      formattedAddress:cleanAddress,
      lat:null,
      lng:null,
      partialMatch:false,
      status:json?.status || `HTTP_${response.status}`
    };
  }

  const first = json.results[0] || {};
  const location = first?.geometry?.location || {};

  return {
    ok:true,
    original:cleanAddress,
    formattedAddress:cleanText(first.formatted_address) || cleanAddress,
    lat:Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
    lng:Number.isFinite(Number(location.lng)) ? Number(location.lng) : null,
    partialMatch:first.partial_match === true,
    status:"OK"
  };
}

async function validateImportAddresses(importDoc,rowIndexes=null){
  const requested = Array.isArray(rowIndexes)
    ? new Set(rowIndexes.map(Number).filter(Number.isFinite))
    : null;

  const targetRows = (importDoc.reviewRows || []).filter(row=>{
    if(row.confirmed) return false;
    if(requested && !requested.has(Number(row.rowIndex))) return false;
    return true;
  });

  const uniqueAddresses = new Map();

  for(const row of targetRows){
    const data = row.data || {};
    const pickup = cleanText(data.pickup);
    const dropoff = cleanText(data.dropoff);
    const stops = normalizeAddressList(data.stops);

    [pickup,...stops,dropoff].filter(Boolean).forEach(address=>{
      const key = address.toLowerCase();
      if(!uniqueAddresses.has(key)){
        uniqueAddresses.set(key,address);
      }
    });
  }

  const resolvedPairs = await Promise.all(
    [...uniqueAddresses.entries()].map(async([key,address])=>[
      key,
      await googleGeocodeAddress(address)
    ])
  );

  const resolved = new Map(resolvedPairs);
  const results = [];

  for(const row of targetRows){
    const data = row.data || {};
    const rowResult = {
      rowIndex:Number(row.rowIndex),
      pickup:null,
      dropoff:null,
      stops:[]
    };

    const applySingle = (field,latField,lngField)=>{
      const original = cleanText(data[field]);
      if(!original) return null;

      const result = resolved.get(original.toLowerCase()) || null;
      if(!result) return null;

      /*
        Exact Google result: safely normalize the displayed address.
        Partial result: keep the user's/OCR text and expose the suggestion
        instead of silently guessing.
      */
      if(result.ok && result.partialMatch !== true){
        data[field] = result.formattedAddress;
      }

      if(result.ok){
        data[latField] = result.lat;
        data[lngField] = result.lng;
      }

      return {
        original,
        value:data[field],
        suggested:result.formattedAddress,
        ok:result.ok,
        partialMatch:result.partialMatch,
        status:result.status
      };
    };

    rowResult.pickup = applySingle("pickup","pickupLat","pickupLng");
    rowResult.dropoff = applySingle("dropoff","dropoffLat","dropoffLng");

    const originalStops = normalizeAddressList(data.stops);
    const normalizedStops = [];
    const stopCoords = [];

    for(const stop of originalStops){
      const result = resolved.get(stop.toLowerCase()) || null;
      const value =
        result?.ok && result?.partialMatch !== true
          ? result.formattedAddress
          : stop;

      normalizedStops.push(value);

      if(result?.ok){
        stopCoords.push({
          address:value,
          lat:result.lat,
          lng:result.lng
        });
      }

      rowResult.stops.push({
        original:stop,
        value,
        suggested:result?.formattedAddress || stop,
        ok:result?.ok === true,
        partialMatch:result?.partialMatch === true,
        status:result?.status || "NOT_CHECKED"
      });
    }

    data.stops = normalizedStops;
    data.stopCoords = stopCoords;
    row.data = data;
    results.push(rowResult);
  }

  return results;
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
    const importDoc = await AttachmentImport.findOne({_id:req.params.id,tenantId});
    if(!importDoc) return res.status(404).json({success:false,message:"Import not found"});
    if(["CONFIRMED","ARCHIVED"].includes(importDoc.status)) return res.status(409).json({success:false,message:"Confirmed import cannot be edited"});

    const updates = Array.isArray(req.body?.rows) ? req.body.rows : [];
    for(const update of updates){
      const row = importDoc.reviewRows.find(r=>Number(r.rowIndex) === Number(update.rowIndex));
      if(!row || row.confirmed) continue;
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

router.post("/:id/validate-addresses",async(req,res)=>{
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
      : null;

    const results = await validateImportAddresses(importDoc,rowIndexes);
    const template = await AttachmentTemplate.findById(importDoc.templateId);
    const services = await attachmentImportService.prepareReviewRows({
      importDoc,
      template
    });

    await importDoc.save();

    return res.json({
      success:true,
      checkedRows:results.length,
      addressResults:results,
      import:cleanImport(importDoc),
      services
    });
  }catch(err){
    console.error("ATTACHMENT ADDRESS VALIDATION ERROR:",err);
    return res.status(err?.statusCode || 500).json({
      success:false,
      message:err?.message || "Failed to validate attachment addresses"
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
    const result = await attachmentImportService.confirmImport({importDoc,template,rowIndexes});

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
