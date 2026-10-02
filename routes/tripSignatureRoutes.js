const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const TripSignature = require("../models/TripSignature");
const Service = require("../models/Service");
const FacilityPricingOverride = require("../models/FacilityPricingOverride");
const BrokerPricing = require("../models/BrokerPricing");
const SmartFormPricing = require("../models/SmartFormPricing");
const SmartFormSubmission = require("../models/SmartFormSubmission");

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
  const serviceKey = upper(trip?.serviceKey || trip?.serviceCode || trip?.serviceSuffix);
  if(!serviceKey) return false;

  /*
    Source-specific signature options take priority over the tenant-wide
    Service Management setting. This lets each Broker / Smart Form template
    independently turn customer signature ON or OFF for the same service.
  */
  const source = upper(trip?.source || trip?.bookingSource || trip?.externalSource);

  /*
    Smart Form is identified by its actual SmartFormSubmission -> tripId link.
    Do not depend on trip.source because confirmed Smart Form trips may not
    carry SMART_FORM in that field.
  */
  const smartSubmission = await SmartFormSubmission.findOne({
    tenantId:trip.tenantId,
    tripId:trip._id
  }).select("templateId signatureRequired serviceName").lean();

  if(smartSubmission?.templateId){
    const pricing = await SmartFormPricing.findOne({
      tenantId:trip.tenantId,
      templateId:smartSubmission.templateId
    }).sort({updatedAt:-1}).lean();

    const tripServiceName = upper(
      trip?.serviceName ||
      trip?.service ||
      smartSubmission?.serviceName
    );

    const os = pricing?.services?.find(s=>{
      const keys = [
        upper(s?.serviceKey),
        upper(s?.serviceSuffix),
        upper(s?.serviceName)
      ].filter(Boolean);

      return (
        keys.includes(serviceKey) ||
        (tripServiceName && keys.includes(tripServiceName))
      );
    });

    if(
      os &&
      os.enabled !== false &&
      typeof os.customerSignatureRequired === "boolean"
    ){
      return os.customerSignatureRequired === true;
    }

    if(smartSubmission.signatureRequired === true){
      return true;
    }
  }

  if(source === "BROKER" || clean(trip?.brokerCode) || clean(trip?.brokerName)){
    const brokerCode = upper(trip?.brokerCode);
    const brokerName = clean(trip?.brokerName);
    const brokerMatch = {tenantId:trip.tenantId,active:true};
    if(brokerCode) brokerMatch.brokerCode = brokerCode;
    else if(brokerName) brokerMatch.brokerName = {
      $regex:`^${brokerName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,
      $options:"i"
    };

    if(brokerCode || brokerName){
      const pricing = await BrokerPricing.findOne(brokerMatch).sort({updatedAt:-1}).lean();
      const os = pricing?.services?.find(s=>upper(s.serviceKey || s.serviceSuffix) === serviceKey);
      if(os && os.enabled !== false && typeof os.customerSignatureRequired === "boolean"){
        return os.customerSignatureRequired === true;
      }
    }
  }

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


async function odometerRequiredForTrip(trip){
  const serviceKey = upper(trip?.serviceKey || trip?.serviceCode || trip?.serviceSuffix);
  if(!serviceKey) return false;

  const smartSubmission = await SmartFormSubmission.findOne({
    tenantId:trip.tenantId,
    tripId:trip._id
  }).select("templateId serviceName").lean();

  if(smartSubmission?.templateId){
    const pricing = await SmartFormPricing.findOne({tenantId:trip.tenantId,templateId:smartSubmission.templateId}).sort({updatedAt:-1}).lean();
    const tripServiceName = upper(trip?.serviceName || trip?.service || smartSubmission?.serviceName);
    const os = pricing?.services?.find(s=>{
      const keys=[upper(s?.serviceKey),upper(s?.serviceSuffix),upper(s?.serviceName)].filter(Boolean);
      return keys.includes(serviceKey) || (tripServiceName && keys.includes(tripServiceName));
    });
    if(os && os.enabled !== false) return os.odometerRequired === true;
  }

  const source = upper(trip?.source || trip?.bookingSource || trip?.externalSource);
  if(source === "BROKER" || clean(trip?.brokerCode) || clean(trip?.brokerName)){
    const brokerCode=upper(trip?.brokerCode), brokerName=clean(trip?.brokerName);
    const brokerMatch={tenantId:trip.tenantId,active:true};
    if(brokerCode) brokerMatch.brokerCode=brokerCode;
    else if(brokerName) brokerMatch.brokerName={$regex:`^${brokerName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,$options:"i"};
    if(brokerCode || brokerName){
      const pricing=await BrokerPricing.findOne(brokerMatch).sort({updatedAt:-1}).lean();
      const os=pricing?.services?.find(s=>upper(s.serviceKey || s.serviceSuffix)===serviceKey);
      if(os && os.enabled !== false) return os.odometerRequired === true;
    }
  }

  if(clean(trip?.company)){
    const override=await FacilityPricingOverride.findOne({tenantId:trip.tenantId,active:true,facilityName:{$regex:`^${clean(trip.company).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,$options:"i"}}).sort({updatedAt:-1}).lean();
    const os=override?.services?.find(s=>upper(s.serviceKey || s.serviceSuffix)===serviceKey);
    if(os && os.facilityEnabled !== false) return os.odometerRequired === true;
  }
  return false;
}

router.use(auth);

router.get("/:tripId/odometer-requirement",async(req,res)=>{
  try{
    const trip=await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const required=await odometerRequiredForTrip(trip);
    if(trip.odometerRequired !== required){ trip.odometerRequired=required; await trip.save(); }
    return res.json({success:true,required,pickupOdometer:trip.pickupOdometer ?? null,dropoffOdometer:trip.dropoffOdometer ?? null,odometerMiles:trip.odometerMiles ?? null});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load odometer requirement"}); }
});

router.post("/:tripId/odometer",express.json(),async(req,res)=>{
  try{
    const trip=await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const required=await odometerRequiredForTrip(trip);
    if(!required) return res.status(409).json({success:false,message:"Odometer is not enabled for this service"});
    const stage=upper(req.body?.stage);
    const value=Number(req.body?.value);
    if(!Number.isFinite(value) || value < 0) return res.status(400).json({success:false,message:"Valid odometer reading is required"});
    if(stage === "PICKUP"){
      trip.odometerRequired=true; trip.pickupOdometer=value; trip.pickupOdometerAt=new Date();
    }else if(stage === "DROPOFF"){
      if(trip.pickupOdometer === null || trip.pickupOdometer === "" || !Number.isFinite(Number(trip.pickupOdometer))) return res.status(409).json({success:false,message:"Pickup odometer is required first"});
      if(value < Number(trip.pickupOdometer)) return res.status(400).json({success:false,message:"Dropoff odometer cannot be lower than pickup odometer"});
      trip.odometerRequired=true; trip.dropoffOdometer=value; trip.dropoffOdometerAt=new Date(); trip.odometerMiles=value-Number(trip.pickupOdometer);
    }else return res.status(400).json({success:false,message:"Invalid odometer stage"});
    await trip.save();
    return res.json({success:true,pickupOdometer:trip.pickupOdometer ?? null,dropoffOdometer:trip.dropoffOdometer ?? null,odometerMiles:trip.odometerMiles ?? null});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to save odometer"}); }
});

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

router.get("/:tripId",async(req,res)=>{
  try{
    const trip = await getTrip(req,req.params.tripId);
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    const signature = await TripSignature.findOne({tripId:trip._id}).select("-signatureData").lean();
    return res.json({success:true,signature:signature || null});
  }catch(err){ return res.status(500).json({success:false,message:"Failed to load signature"}); }
});

module.exports = router;
