const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const TripSignature = require("../models/TripSignature");
const Service = require("../models/Service");
const FacilityPricingOverride = require("../models/FacilityPricingOverride");
const AttachmentImport = require("../models/AttachmentImport");
const signatureDocumentService = require("../services/signatureDocumentService");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

function token(req){
  const h = String(req.headers?.authorization || "").trim();
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}
function auth(req,res,next){
  try{
    const t = token(req);
    if(!t) return res.status(401).json({success:false,message:"Access Denied"});
    const v = jwt.verify(t,JWT_SECRET);
    req.authUser = {id:v.id||null,name:v.name||"",role:v.role||"",tenantId:v.tenantId||null};
    if(!req.authUser.tenantId && req.authUser.role !== "PLATFORM_ADMIN") return res.status(403).json({success:false,message:"Tenant Required"});
    next();
  }catch(err){ return res.status(401).json({success:false,message:"Invalid Token"}); }
}
function Trip(){ return mongoose.models.Trip || require("../models/Trip"); }
function clean(v){ return String(v ?? "").trim(); }
function upper(v){ return clean(v).toUpperCase(); }

async function getTrip(req,id){
  const filter = {_id:id};
  if(req.authUser.role !== "PLATFORM_ADMIN") filter.tenantId = req.authUser.tenantId;
  return Trip().findOne(filter);
}

async function signatureRequiredForTrip(trip){
  if(trip?.attachmentSignatureRequired === true) return true;
  const serviceKey = upper(trip?.serviceKey || trip?.serviceCode || trip?.serviceSuffix);
  if(!serviceKey) return false;

  if(clean(trip?.company)){
    const override = await FacilityPricingOverride.findOne({
      tenantId:trip.tenantId,
      active:true,
      facilityName:{ $regex:`^${clean(trip.company).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`, $options:"i" }
    }).sort({updatedAt:-1}).lean();
    const os = override?.services?.find(s=>upper(s.serviceKey || s.serviceSuffix) === serviceKey);
    if(os && os.facilityEnabled !== false && typeof os.customerSignatureRequired === "boolean"){
      return os.customerSignatureRequired === true;
    }
  }

  const service = await Service.findOne({tenantId:trip.tenantId,$or:[{serviceKey},{customServiceCode:serviceKey}]}).lean();
  return service?.customerSignatureRequired === true;
}

router.use(auth);

router.get("/:tripId/requirement",async(req,res)=>{
  try{
    const trip = await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const [required,signature] = await Promise.all([
      signatureRequiredForTrip(trip),
      TripSignature.findOne({tripId:trip._id}).select("signedAt signerName").lean()
    ]);
    return res.json({success:true,required,signed:!!signature,signature:signature || null});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load signature requirement"}); }
});

router.post("/:tripId",express.json({limit:"3mb"}),async(req,res)=>{
  try{
    const trip = await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const required = await signatureRequiredForTrip(trip);
    if(!required) return res.status(409).json({success:false,message:"Customer signature is not enabled for this service"});

    const dataUrl = clean(req.body?.signatureDataUrl);
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(dataUrl);
    if(!match) return res.status(400).json({success:false,message:"Valid PNG/JPEG signature is required"});
    const buffer = Buffer.from(match[2],"base64");
    if(!buffer.length || buffer.length > 2*1024*1024) return res.status(400).json({success:false,message:"Signature image is invalid or too large"});

    const signature = await TripSignature.findOneAndUpdate(
      {tripId:trip._id},
      {
        tenantId:trip.tenantId,
        tripId:trip._id,
        tripNumber:trip.tripNumber || "",
        signerName:clean(req.body?.signerName || trip.clientName),
        signatureData:buffer,
        signatureMimeType:match[1].toLowerCase(),
        signedAt:new Date(),
        driverId:clean(req.authUser?.id || trip.driverId),
        driverName:clean(req.authUser?.name || trip.driverName),
        serviceKey:upper(trip.serviceKey),
        source:"DRIVER_APP"
      },
      {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true}
    );

    trip.customerSignatureCaptured = true;
    trip.customerSignatureAt = signature.signedAt;
    trip.customerSignatureId = signature._id;
    await trip.save();

    return res.json({success:true,signed:true,signedAt:signature.signedAt});
  }catch(err){
    console.error("TRIP SIGNATURE SAVE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message || "Failed to save signature"});
  }
});

router.post("/:tripId/archive",async(req,res)=>{
  try{
    const trip = await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const required = await signatureRequiredForTrip(trip);
    if(required){
      const signature = await TripSignature.findOne({tripId:trip._id}).lean();
      if(!signature) return res.status(409).json({success:false,message:"Customer signature is required before archive"});
    }
    if(!trip.attachmentImportId) return res.json({success:true,archived:false,message:"Trip is not an Attachment Import trip"});
    const html = await signatureDocumentService.archiveTrip(trip);
    if(!html) return res.status(409).json({success:false,message:"Signed document could not be generated"});
    trip.attachmentArchived = true;
    trip.attachmentArchivedAt = new Date();
    await trip.save();
    return res.json({success:true,archived:true});
  }catch(err){
    console.error("TRIP SIGNATURE ARCHIVE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message || "Failed to archive signed document"});
  }
});

router.get("/:tripId/document",async(req,res)=>{
  try{
    const trip = await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).send("Trip not found");
    if(!trip.attachmentImportId) return res.status(404).send("No attachment document for this trip");

    const importDoc = await AttachmentImport.findById(trip.attachmentImportId).lean();
    const archived = importDoc?.archiveEntries?.find(e=>String(e.tripId) === String(trip._id));
    let html = archived?.finalDocumentHtml || "";
    if(!html){
      const built = await signatureDocumentService.buildForTrip(trip);
      html = built?.html || "";
    }
    if(!html) return res.status(404).send("Signed document is not available yet");
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.send(html);
  }catch(err){ return res.status(500).send("Failed to load signed document"); }
});

router.get("/:tripId",async(req,res)=>{
  try{
    const trip = await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const signature = await TripSignature.findOne({tripId:trip._id}).select("-signatureData").lean();
    return res.json({success:true,signature:signature || null});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load signature"}); }
});

module.exports = router;
