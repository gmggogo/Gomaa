const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const User =
  global.User ||
  mongoose.models.User;

const Service =
  mongoose.models.Service;

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function bool(v){
  return (
    v === true ||
    String(v).toLowerCase() === "true"
  );
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCode(v){
  const c = upper(v);

  if(c === "STANDARD") return "ST";
  if(c === "WHEELCHAIR") return "WH";
  if(c === "SHARED") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE") return "LM";
  if(c === "TAXI") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function getServiceCode(s){
  return normalizeCode(
    s?.serviceKey ||
    s?.key ||
    s?.code ||
    s?.companySuffix ||
    s?.suffix ||
    s?.title ||
    s?.name ||
    ""
  );
}

function getServiceName(s){
  return (
    s?.title ||
    s?.name ||
    s?.serviceName ||
    getServiceCode(s) ||
    "Service"
  );
}

function serviceEnabled(s){

  /*
    الصفحة دي Facility Pricing Override
    فالأهم companyEnabled.
    لكن لو الشركة القديمة عندها enabled بس، برضه نعرضها.
  */

  return (
    s?.companyEnabled === true ||
    s?.enabled === true
  );
}

function getFacilityName(u){
  return clean(
    u?.facilityName ||
    u?.organizationName ||
    u?.companyName ||
    u?.company ||
    u?.name ||
    u?.fullName ||
    u?.username ||
    ""
  );
}

function isFacilityUser(u){

  const r =
    clean(u?.role || u?.type || "")
      .toLowerCase();

  return (
    r === "company" ||
    r === "facility" ||
    r.includes("company") ||
    r.includes("facility")
  );
}

function isSharedService(s){

  const key =
    getServiceCode(s);

  const title =
    upper(s?.title || s?.name || s?.serviceName);

  const pricing =
    upper(
      s?.companyPricingMode ||
      s?.pricingMode
    );

  const suffix =
    upper(
      s?.companySuffix ||
      s?.suffix ||
      s?.serviceSuffix
    );

  return (
    s?.companyShared === true ||
    s?.shared === true ||
    key === "SH" ||
    key === "SHARED" ||
    title === "SHARED" ||
    suffix === "SH" ||
    pricing === "SHARED"
  );
}

/* =========================
   DEFAULT PRICING FROM SERVICE MANAGEMENT
   FACILITY SECTION ONLY
========================= */

function serviceDefaultPricing(s){

  const serviceKey =
    getServiceCode(s);

  const shared =
    isSharedService(s);

  return {
    serviceKey,

    serviceName:
      getServiceName(s),

    serviceSuffix:
      clean(
        s?.companySuffix ||
        s?.suffix ||
        serviceKey
      ),

    shared,

    pricingMode:
      upper(
        s?.companyPricingMode ||
        s?.pricingMode ||
        "MILE"
      ),

    baseFare:
      num(
        s?.companyBaseFare ??
        s?.baseFare ??
        0
      ),

    includedMiles:
      num(
        s?.companyIncludedMiles ??
        s?.includedMiles ??
        0
      ),

    perMile:
      num(
        s?.companyPerMile ??
        s?.perMile ??
        0
      ),

    hourlyRate:
      num(
        s?.companyHourlyRate ??
        s?.hourlyRate ??
        0
      ),

    hourlyBillingMode:
      upper(
        s?.companyHourlyBillingMode ||
        s?.hourlyBillingMode ||
        "FULL"
      ),

    stopFee:
      num(
        s?.companyStopFee ??
        s?.stopFee ??
        0
      ),

    noShowFee:
      num(
        s?.companyNoShowFee ??
        s?.noShowFee ??
        0
      ),

    sharedPrice:
      num(
        s?.companySharedPrice ??
        s?.sharedPrice ??
        0
      ),

    disableCancel:
      bool(
        s?.companyDisableCancel ??
        s?.disableCancel ??
        false
      ),

    warningMinutes:
      num(
        s?.companyWarningMinutes ??
        s?.warningMinutes ??
        0
      ),

    cancelFee:
      num(
        s?.companyCancelFee ??
        s?.cancelFee ??
        0
      ),

    addStopEnabled:
      shared
        ? false
        : bool(
            s?.companyAddStopEnabled ??
            false
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            s?.companyAddStopCustomTimeEnabled ??
            false
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : num(
            s?.companyAddStopCutoffMinutes ??
            0
          )
  };
}

/* =========================
   NORMALIZE INPUT FROM FRONTEND
========================= */

function normalizeServiceInput(s){

  const serviceKey =
    normalizeCode(s?.serviceKey);

  const pricingMode =
    upper(s?.pricingMode || "MILE");

  const shared =
    bool(s?.shared) ||
    pricingMode === "SHARED" ||
    serviceKey === "SH";

  return {
    serviceKey,

    serviceName:
      clean(s?.serviceName),

    serviceSuffix:
      clean(
        s?.serviceSuffix ||
        s?.suffix ||
        serviceKey
      ),

    shared,

    pricingMode,

    baseFare:
      num(s?.baseFare),

    includedMiles:
      num(s?.includedMiles),

    perMile:
      num(s?.perMile),

    hourlyRate:
      num(s?.hourlyRate),

    hourlyBillingMode:
      upper(s?.hourlyBillingMode || "FULL"),

    stopFee:
      num(s?.stopFee),

    noShowFee:
      num(s?.noShowFee),

    sharedPrice:
      num(s?.sharedPrice),

    disableCancel:
      bool(s?.disableCancel),

    warningMinutes:
      num(s?.warningMinutes),

    cancelFee:
      num(s?.cancelFee),

    addStopEnabled:
      shared
        ? false
        : bool(s?.addStopEnabled),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(s?.addStopCustomTimeEnabled),

    addStopCutoffMinutes:
      shared
        ? 0
        : num(s?.addStopCutoffMinutes)
  };
}

/* =========================
   BOOTSTRAP
========================= */

router.get("/bootstrap", async (req,res)=>{

  try{

    if(!User){
      return res.status(500).json({
        success:false,
        message:"User model not loaded"
      });
    }

    if(!Service){
      return res.status(500).json({
        success:false,
        message:"Service model not loaded"
      });
    }

    const [users, services, overrides] =
      await Promise.all([
        User.find({}).lean(),
        Service.find({}).lean(),
        FacilityPricingOverride.find({}).lean()
      ]);

    const facilities =
      users
        .filter(isFacilityUser)
        .map(u=>({
          _id:String(u._id),

          name:
            getFacilityName(u),

          email:
            u.email || "",

          username:
            u.username || "",

          allowedServices:
            Array.isArray(u.allowedServices)
              ? u.allowedServices
                  .map(normalizeCode)
                  .filter(Boolean)
              : []
        }))
        .filter(f=>f.name)
        .sort((a,b)=>
          a.name.localeCompare(b.name)
        );

    const activeServices =
      services
        .filter(serviceEnabled)
        .map(serviceDefaultPricing)
        .filter(s=>s.serviceKey)
        .sort((a,b)=>
          a.serviceKey.localeCompare(b.serviceKey)
        );

    return res.json({
      success:true,
      facilities,
      services:activeServices,
      overrides
    });

  }catch(err){

    console.log(
      "FACILITY PRICING BOOTSTRAP ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to load facility pricing data"
    });

  }

});

/* =========================
   GET ONE FACILITY OVERRIDE
========================= */

router.get("/:facilityId", async (req,res)=>{

  try{

    const { facilityId } = req.params;

    if(
      !mongoose.Types.ObjectId.isValid(
        String(facilityId)
      )
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid facility id"
      });
    }

    const override =
      await FacilityPricingOverride
        .findOne({
          facilityId
        })
        .lean();

    return res.json({
      success:true,
      override
    });

  }catch(err){

    console.log(
      "FACILITY PRICING GET ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to load override"
    });

  }

});

/* =========================
   SAVE FACILITY OVERRIDE
========================= */

router.patch("/:facilityId", async (req,res)=>{

  try{

    const { facilityId } = req.params;

    if(
      !mongoose.Types.ObjectId.isValid(
        String(facilityId)
      )
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid facility id"
      });
    }

    const facilityName =
      clean(req.body?.facilityName);

    const active =
      req.body?.active === true ||
      String(req.body?.active).toLowerCase() === "true";

    const servicesInput =
      Array.isArray(req.body?.services)
        ? req.body.services
        : [];

    if(!facilityName){
      return res.status(400).json({
        success:false,
        message:"Facility name is required"
      });
    }

    /*
      لو Active لازم نحفظ كل أسعار الخدمات الظاهرة.
      مفيش خدمة ناقصة ترجع Service Management.
    */

    if(active && !servicesInput.length){
      return res.status(400).json({
        success:false,
        message:"Active override requires services pricing"
      });
    }

    const services =
      servicesInput
        .map(normalizeServiceInput)
        .filter(s=>s.serviceKey);

    const updatedBy =
      clean(req.body?.updatedBy) ||
      clean(req.user?.name) ||
      clean(req.user?.username) ||
      "";

    const override =
      await FacilityPricingOverride.findOneAndUpdate(
        {
          facilityId
        },
        {
          facilityId,
          facilityName,
          active,
          services,
          updatedBy
        },
        {
          new:true,
          upsert:true,
          runValidators:true
        }
      );

    return res.json({
      success:true,
      message:active
        ? "Facility pricing override activated"
        : "Facility pricing override disabled",
      override
    });

  }catch(err){

    console.log(
      "FACILITY PRICING SAVE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to save facility pricing override"
    });

  }

});

module.exports = router;