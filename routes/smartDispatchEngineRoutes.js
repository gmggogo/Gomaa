const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const SmartDispatchEngine =
require("../models/SmartDispatchEngine");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function readBearerToken(req){
  const header = String(req.headers?.authorization || "").trim();
  if(header.toLowerCase().startsWith("bearer ")){
    return header.slice(7).trim();
  }
  return String(req.headers?.["x-access-token"] || "").trim();
}

function requireTenantApi(req,res,next){
  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({success:false,message:"Access Denied"});
  }

  try{
    const verified = jwt.verify(token,JWT_SECRET);

    req.authUser = {
      id:verified.id || null,
      role:verified.role || "",
      tenantId:verified.tenantId || null
    };

    if(req.authUser.role === "PLATFORM_ADMIN"){
      return next();
    }

    if(!req.authUser.tenantId){
      return res.status(403).json({success:false,message:"Tenant Required"});
    }

    next();
  }catch(err){
    return res.status(401).json({success:false,message:"Invalid Token"});
  }
}

function getTenantId(req){
  if(req.authUser?.role === "PLATFORM_ADMIN"){
    return String(
      req.query?.tenantId ||
      req.body?.tenantId ||
      ""
    ).trim();
  }
  return String(req.authUser?.tenantId || "").trim();
}

const ALLOWED_FIELDS = [
  "enabled","strategy",
  "requireActiveDriver","requireScheduleMatch","requireServiceMatch",
  "maxPickupDistanceMiles","maxDeadheadMiles",
  "useGoogleDistance","topDriversToCheck",
  "minBufferMinutes","maxTripsPerDriver","enableTimeConflict",
  "enableFairDistribution","maxDriverLoadPercent",
  "autoAssignNewTrips","autoReassignUnassigned","autoAssignSharedTrips",
  "distanceWeight","travelTimeWeight","loadWeight","conflictWeight"
];

function cleanPayload(body={}){
  const out = {};
  for(const key of ALLOWED_FIELDS){
    if(Object.prototype.hasOwnProperty.call(body,key)){
      out[key] = body[key];
    }
  }
  return out;
}

router.get("/",requireTenantApi,async(req,res)=>{
  try{
    const tenantId = getTenantId(req);

    if(!tenantId){
      return res.status(403).json({success:false,message:"Tenant Required"});
    }

    let settings = await SmartDispatchEngine.findOne({tenantId});

    if(!settings){
      settings = await SmartDispatchEngine.create({tenantId});
    }

    return res.json(settings);

  }catch(err){
    console.error("SMART DISPATCH LOAD:",err);
    return res.status(500).json({
      success:false,
      message:err?.message || "Failed To Load Settings"
    });
  }
});

router.post("/",requireTenantApi,async(req,res)=>{
  try{
    const tenantId = getTenantId(req);

    if(!tenantId){
      return res.status(403).json({success:false,message:"Tenant Required"});
    }

    const payload = cleanPayload(req.body || {});

    const settings = await SmartDispatchEngine.findOneAndUpdate(
      {tenantId},
      {
        $set:{
          ...payload,
          tenantId
        }
      },
      {
        new:true,
        upsert:true,
        setDefaultsOnInsert:true,
        runValidators:true
      }
    );

    return res.json({
      success:true,
      message:"Settings Saved",
      settings
    });

  }catch(err){
    console.error("SMART DISPATCH SAVE:",err);
    return res.status(500).json({
      success:false,
      message:err?.message || "Failed To Save Settings"
    });
  }
});

module.exports = router;