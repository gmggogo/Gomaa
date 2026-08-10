const express = require("express");

const router = express.Router();

const Service = require("../models/Service");

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function isMongoId(v){
  return /^[0-9a-fA-F]{24}$/.test(String(v || ""));
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function getServiceFilter(idOrKey){

  const value = clean(idOrKey);

  if(isMongoId(value)){
    return { _id:value };
  }

  return { serviceKey:upper(value) };
}

function getDriverConfigFilter(idOrKey){

  const value = clean(idOrKey);

  if(isMongoId(value)){
    return { _id:value };
  }

  const exact = new RegExp(
    `^${escapeRegex(value)}$`,
    "i"
  );

  return {
    $or:[
      { serviceKey:upper(value) },
      { title:exact },
      { companySuffix:upper(value) },
      { reservedSuffix:upper(value) }
    ]
  };
}

function bool(v){

  if(v === true || v === false){
    return v;
  }

  const s = clean(v).toLowerCase();

  if(["true","1","yes","on","enabled"].includes(s)){
    return true;
  }

  if(["false","0","no","off","disabled"].includes(s)){
    return false;
  }

  return null;
}

function safeMinutes(v,fallback=0){

  const n = Number(v);

  if(!Number.isFinite(n)){
    return fallback;
  }

  return Math.max(0,Math.min(1440,Math.round(n)));
}

function normalizeDriverTimerPayload(payload){

  const out = { ...payload };

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "driverPickupWaitEnabled"
    )
  ){
    const value = bool(out.driverPickupWaitEnabled);

    if(value !== null){
      out.driverPickupWaitEnabled = value;
    }else{
      delete out.driverPickupWaitEnabled;
    }
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "driverStopWaitEnabled"
    )
  ){
    const value = bool(out.driverStopWaitEnabled);

    if(value !== null){
      out.driverStopWaitEnabled = value;
    }else{
      delete out.driverStopWaitEnabled;
    }
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "driverPickupWaitMinutes"
    )
  ){
    out.driverPickupWaitMinutes =
      safeMinutes(out.driverPickupWaitMinutes,10);
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "driverStopWaitMinutes"
    )
  ){
    out.driverStopWaitMinutes =
      safeMinutes(out.driverStopWaitMinutes,5);
  }

  return out;
}

function isSharedAfterUpdate(current,payload){

  return (
    payload.companyShared === true ||
    payload.reservedShared === true ||

    current.companyShared === true ||
    current.reservedShared === true ||
    current.shared === true ||

    upper(payload.pricingMode || current.pricingMode) === "SHARED" ||
    upper(payload.companyPricingMode || current.companyPricingMode) === "SHARED" ||
    upper(payload.reservedPricingMode || current.reservedPricingMode) === "SHARED" ||

    upper(payload.companySuffix || current.companySuffix) === "SH" ||
    upper(payload.reservedSuffix || current.reservedSuffix) === "SH" ||
    upper(current.serviceKey) === "SH" ||
    upper(current.serviceKey) === "SHARED" ||
    upper(current.title) === "SHARED"
  );
}

function lockAddStopForShared(payload,current){

  if(!isSharedAfterUpdate(current,payload)){
    return payload;
  }

  payload.getQuoteAddStopEnabled = false;
  payload.getQuoteAddStopCustomTimeEnabled = false;
  payload.getQuoteAddStopCutoffMinutes = 0;

  payload.companyAddStopEnabled = false;
  payload.companyAddStopCustomTimeEnabled = false;
  payload.companyAddStopCutoffMinutes = 0;

  payload.reservedAddStopEnabled = false;
  payload.reservedAddStopCustomTimeEnabled = false;
  payload.reservedAddStopCutoffMinutes = 0;

  return payload;
}

/* =========================
   PUBLIC SERVICES
   /api/services
========================= */

router.get("/", async (req,res)=>{

  try{

    const isCompany =
      String(req.query.company || "")
      .toLowerCase() === "true";

    const isReserved =
      String(req.query.reserved || "")
      .toLowerCase() === "true";

    let filter = {};

    if(isReserved){
      filter = { reservedEnabled:true };
    }else if(isCompany){
      filter = { companyEnabled:true };
    }else{
      filter = { enabled:true };
    }

    const services =
      await Service.find(filter)
      .sort({ createdAt:1 });

    return res.json(services);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Services"
    });
  }
});

/* =========================
   ADMIN SERVICES
   /api/services/admin
========================= */

router.get("/admin", async (req,res)=>{

  try{

    const services =
      await Service.find({})
      .sort({ createdAt:1 });

    return res.json(services);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Services"
    });
  }
});

/* =========================
   DRIVER WAIT CONFIG
   /api/services/driver-config/:idOrKey

   Returns only fields needed by Driver Map.
   Works for Individual and Shared services.
========================= */

router.get("/driver-config/:idOrKey", async (req,res)=>{

  try{

    const service =
      await Service.findOne(
        getDriverConfigFilter(
          req.params.idOrKey
        )
      )
      .select({
        _id:1,
        serviceKey:1,
        title:1,
        driverPickupWaitEnabled:1,
        driverPickupWaitMinutes:1,
        driverStopWaitEnabled:1,
        driverStopWaitMinutes:1
      })
      .lean();

    if(!service){
      return res.status(404).json({
        success:false,
        message:"Service Driver Config Not Found"
      });
    }

    return res.json({
      success:true,
      serviceKey:service.serviceKey,
      title:service.title,
      driverPickupWaitEnabled:
        service.driverPickupWaitEnabled !== false,
      driverPickupWaitMinutes:
        safeMinutes(service.driverPickupWaitMinutes,10),
      driverStopWaitEnabled:
        service.driverStopWaitEnabled !== false,
      driverStopWaitMinutes:
        safeMinutes(service.driverStopWaitMinutes,5)
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Driver Timer Config"
    });
  }
});

/* =========================
   UPDATE SERVICE
   /api/services/:idOrKey
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const filter =
      getServiceFilter(
        req.params.idOrKey
      );

    const current =
      await Service.findOne(filter);

    if(!current){
      return res.status(404).json({
        success:false,
        message:"Service Not Found"
      });
    }

    const normalized =
      normalizeDriverTimerPayload(
        { ...req.body }
      );

    const payload =
      lockAddStopForShared(
        normalized,
        current
      );

    const updated =
      await Service.findOneAndUpdate(
        filter,
        { $set:payload },
        {
          new:true,
          runValidators:true
        }
      );

    return res.json({
      success:true,
      service:updated
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Update Failed"
    });
  }
});

module.exports = router;