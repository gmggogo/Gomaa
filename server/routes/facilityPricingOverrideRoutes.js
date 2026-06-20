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

function normalizeCode(v){
  const c = clean(v).toUpperCase();

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
    s?.suffix ||
    s?.companySuffix ||
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
  return s?.enabled === true || s?.companyEnabled === true;
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
  const r = clean(u?.role || u?.type || "").toLowerCase();

  return (
    r === "company" ||
    r === "facility" ||
    r.includes("company") ||
    r.includes("facility")
  );
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeServiceInput(s){
  return {
    serviceKey: normalizeCode(s.serviceKey),
    serviceName: clean(s.serviceName),
    pricingMode: clean(s.pricingMode || "MILE").toUpperCase(),

    baseFare: num(s.baseFare),
    includedMiles: num(s.includedMiles),
    perMile: num(s.perMile),
    stopFee: num(s.stopFee),
    noShowFee: num(s.noShowFee),
    cancelFee: num(s.cancelFee),

    hourlyRate: num(s.hourlyRate),
    hourlyBillingMode: clean(s.hourlyBillingMode || "FULL").toUpperCase(),

    sharedPrice: num(s.sharedPrice)
  };
}

function serviceDefaultPricing(s){
  return {
    serviceKey: getServiceCode(s),
    serviceName: getServiceName(s),
    pricingMode: clean(s.pricingMode || "MILE").toUpperCase(),

    baseFare: num(s.baseFare),
    includedMiles: num(s.includedMiles),
    perMile: num(s.perMile),
    stopFee: num(s.stopFee),
    noShowFee: num(s.noShowFee),
    cancelFee: num(s.cancelFee),

    hourlyRate: num(s.hourlyRate),
    hourlyBillingMode: clean(s.hourlyBillingMode || "FULL").toUpperCase(),

    sharedPrice: num(s.sharedPrice || s.baseFare)
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
          name:getFacilityName(u),
          email:u.email || "",
          username:u.username || "",
          allowedServices:Array.isArray(u.allowedServices)
            ? u.allowedServices.map(normalizeCode)
            : []
        }))
        .filter(f=>f.name)
        .sort((a,b)=>a.name.localeCompare(b.name));

    const activeServices =
      services
        .filter(serviceEnabled)
        .map(serviceDefaultPricing)
        .filter(s=>s.serviceKey)
        .sort((a,b)=>a.serviceKey.localeCompare(b.serviceKey));

    return res.json({
      success:true,
      facilities,
      services:activeServices,
      overrides
    });

  }catch(err){

    console.log("FACILITY PRICING BOOTSTRAP ERROR:",err);

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

    if(!mongoose.Types.ObjectId.isValid(String(facilityId))){
      return res.status(400).json({
        success:false,
        message:"Invalid facility id"
      });
    }

    const override =
      await FacilityPricingOverride.findOne({
        facilityId
      }).lean();

    return res.json({
      success:true,
      override
    });

  }catch(err){

    console.log("FACILITY PRICING GET ERROR:",err);

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

    if(!mongoose.Types.ObjectId.isValid(String(facilityId))){
      return res.status(400).json({
        success:false,
        message:"Invalid facility id"
      });
    }

    const facilityName = clean(req.body?.facilityName);
    const active = req.body?.active === true;

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
      لو Active لازم الخدمات تتحفظ كلها.
      مفيش رجوع Service Management للخدمات الناقصة.
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
        { facilityId },
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

    console.log("FACILITY PRICING SAVE ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to save facility pricing override"
    });

  }

});

module.exports = router;