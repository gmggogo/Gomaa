const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Service =
  require("../models/Service");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

/* =========================
   NUMBER
========================= */

function n(value, fallback = 0){

  const num = Number(value);

  if(Number.isFinite(num)){
    return num;
  }

  return fallback;
}

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

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function getUserModel(){
  return global.User || mongoose.models.User || null;
}

function buildServiceSearchFilter(idOrKey){

  const raw =
    clean(idOrKey);

  if(
    mongoose.Types.ObjectId.isValid(raw)
  ){
    return {
      _id:raw
    };
  }

  const key =
    normalizeCode(raw);

  const rawUpper =
    upper(raw);

  const rx =
    new RegExp(
      "^" + escapeRegex(raw) + "$",
      "i"
    );

  return {
    $or:[
      { serviceKey:key },
      { serviceKey:rawUpper },

      { serviceCode:key },
      { serviceCode:rawUpper },

      { serviceType:key },
      { serviceType:rawUpper },

      { suffix:key },
      { suffix:rawUpper },

      { companySuffix:key },
      { companySuffix:rawUpper },

      { reservedSuffix:key },
      { reservedSuffix:rawUpper },

      { title:rx },
      { name:rx },
      { serviceName:rx }
    ]
  };
}

async function resolveFacilityId({
  facilityId,
  company
}){

  if(
    facilityId &&
    mongoose.Types.ObjectId.isValid(String(facilityId))
  ){
    return String(facilityId);
  }

  const companyName =
    clean(company);

  if(!companyName){
    return "";
  }

  const User =
    getUserModel();

  if(!User){
    return "";
  }

  const rx =
    new RegExp(
      "^" + escapeRegex(companyName) + "$",
      "i"
    );

  const user =
    await User.findOne({
      role:{
        $in:["company","facility"]
      },
      $or:[
        { name:rx },
        { username:rx },
        { email:rx },
        { company:rx },
        { companyName:rx },
        { facilityName:rx },
        { organizationName:rx }
      ]
    }).lean();

  return user?._id
    ? String(user._id)
    : "";
}

/* =========================
   NORMALIZE SERVICE PRICING
========================= */

function pricingFromServiceManagement(service){

  const pricingMode =
    upper(
      service.companyPricingMode ||
      service.pricingMode ||
      "MILE"
    );

  return {
    source:"SERVICE_MANAGEMENT",

    serviceKey:
      normalizeCode(
        service.serviceKey ||
        service.companySuffix ||
        service.suffix ||
        service.title ||
        service.name
      ),

    pricingMode,

    baseFare:
      n(
        service.companyBaseFare ??
        service.baseFare ??
        0
      ),

    includedMiles:
      n(
        service.companyIncludedMiles ??
        service.includedMiles ??
        0
      ),

    perMile:
      n(
        service.companyPerMile ??
        service.perMile ??
        0
      ),

    stopFee:
      n(
        service.companyStopFee ??
        service.stopFee ??
        0
      ),

    noShowFee:
      n(
        service.companyNoShowFee ??
        service.noShowFee ??
        0
      ),

    sharedPrice:
      n(
        service.companySharedPrice ??
        service.sharedPrice ??
        0
      ),

    hourlyRate:
      n(
        service.companyHourlyRate ??
        service.hourlyRate ??
        0
      ),

    hourlyBillingMode:
      upper(
        service.companyHourlyBillingMode ||
        service.hourlyBillingMode ||
        "FULL"
      ),

    disableCancel:
      bool(
        service.companyDisableCancel ??
        service.disableCancel ??
        false
      ),

    cancelFee:
      n(
        service.companyCancelFee ??
        service.cancelFee ??
        0
      ),

    warningMinutes:
      n(
        service.companyWarningMinutes ??
        service.warningMinutes ??
        0
      ),

    rawService:
      service
  };
}

function pricingFromFacilityOverride(service){

  return {
    source:"FACILITY_OVERRIDE",

    serviceKey:
      normalizeCode(service.serviceKey),

    pricingMode:
      upper(service.pricingMode || "MILE"),

    baseFare:
      n(service.baseFare),

    includedMiles:
      n(service.includedMiles),

    perMile:
      n(service.perMile),

    stopFee:
      n(service.stopFee),

    noShowFee:
      n(service.noShowFee),

    sharedPrice:
      n(service.sharedPrice),

    hourlyRate:
      n(service.hourlyRate),

    hourlyBillingMode:
      upper(service.hourlyBillingMode || "FULL"),

    disableCancel:
      bool(service.disableCancel),

    cancelFee:
      n(service.cancelFee),

    warningMinutes:
      n(service.warningMinutes),

    rawService:
      service
  };
}
async function findActiveFacilityOverride({
  facilityId,
  company
}){

  const or = [];

  const cleanFacilityId =
    clean(facilityId);

  const companyName =
    clean(company);

  if(
    cleanFacilityId &&
    mongoose.Types.ObjectId.isValid(cleanFacilityId)
  ){
    or.push({
      facilityId:cleanFacilityId
    });
  }

  if(companyName){

    const rx =
      new RegExp(
        "^" + escapeRegex(companyName) + "$",
        "i"
      );

    or.push({
      facilityName:rx
    });

  }

  if(or.length === 0){
    return null;
  }

  return await FacilityPricingOverride
    .findOne({
      active:true,
      $or:or
    })
    .lean();
}
/* =========================
   RESOLVE PRICING SOURCE
========================= */

async function resolvePricingService({
  serviceKey,
  facilityId,
  company
}){

  const key =
    normalizeCode(serviceKey);

  const service =
    await Service.findOne(
      buildServiceSearchFilter(serviceKey)
    ).lean();

  if(!service){
    return {
      success:false,
      message:"Service Not Found: " + clean(serviceKey)
    };
  }

 const resolvedFacilityId =
    await resolveFacilityId({
      facilityId,
      company
    });

  const override =
    await findActiveFacilityOverride({
      facilityId:
        resolvedFacilityId || facilityId,
      company
    });

  if(override){

    const overrideService =
      Array.isArray(override.services)
        ? override.services.find(s =>
            normalizeCode(s.serviceKey) === key
          )
        : null;

    if(!overrideService){
      return {
        success:false,
        message:
          "Facility Override Active But Service Pricing Not Found: " +
          clean(serviceKey)
      };
    }

    return {
      success:true,
      pricing:
        pricingFromFacilityOverride(overrideService),
      facilityOverrideActive:true,
      facilityId:
        String(
          override.facilityId ||
          resolvedFacilityId ||
          facilityId ||
          ""
        ),
      facilityName:
        override.facilityName || ""
    };
  }

  if(service.companyEnabled === false){
    return {
      success:false,
      message:"Company Service Disabled"
    };
  }

  return {
    success:true,
    pricing:
      pricingFromServiceManagement(service),
    facilityOverrideActive:false,
    facilityId:resolvedFacilityId,
    facilityName:""
  };
}

/* =========================
   GET SERVICES
========================= */

router.get("/", async (req,res)=>{

  try{

    const services =
      await Service.find({})
        .sort({
          createdAt:1
        });

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
   CALCULATE
========================= */

router.post("/calculate", async (req,res)=>{

  try{

    const {
      serviceKey,
      miles,
      stops,
      minutes
    } = req.body || {};

    const passengersCount =
      req.body?.passengersCount ??
      req.body?.passengerCount ??
      1;

    const company =
      req.body?.company ||
      req.body?.companyName ||
      req.body?.facility ||
      req.body?.facilityName ||
      "";

    const facilityId =
      req.body?.facilityId ||
      req.body?.companyId ||
      req.body?.userId ||
      "";

    if(!serviceKey){

      return res.json({
        success:false,
        message:"Missing Service Key"
      });
    }

    const resolved =
      await resolvePricingService({
        serviceKey,
        facilityId,
        company
      });

    if(!resolved.success){

      return res.json({
        success:false,
        message:
          resolved.message ||
          "Pricing Service Not Found"
      });
    }

    const service =
      resolved.pricing;

    const pricingMode =
      upper(service.pricingMode || "MILE");

    const baseFare =
      n(service.baseFare);

    const includedMiles =
      n(service.includedMiles);

    const perMile =
      n(service.perMile);

    const stopFee =
      n(service.stopFee);

    const sharedPrice =
      n(service.sharedPrice);

    const hourlyRate =
      n(service.hourlyRate);

    let total = 0;

    /* =========================
       HOURLY
    ========================= */

    if(pricingMode === "HOURLY"){

      let hours = 1;

      const hourlyBillingMode =
        upper(
          service.hourlyBillingMode ||
          "FULL"
        );

      if(hourlyBillingMode === "QUARTER"){

        hours =
          Math.max(
            1,
            Math.ceil(
              n(minutes) / 15
            ) / 4
          );

      }else{

        hours =
          Math.max(
            1,
            Math.ceil(
              n(minutes) / 60
            )
          );
      }

      total =
        hours *
        hourlyRate;
    }

    /* =========================
       SHARED
    ========================= */

    else if(pricingMode === "SHARED"){

      const count =
        Math.max(
          1,
          n(passengersCount,1)
        );

      if(sharedPrice > 0){

        total =
          (sharedPrice * count) +
          (n(stops) * stopFee);

      }else{

        const baseTotal =
          count *
          baseFare;

        const includedTotal =
          count *
          includedMiles;

        const extraMiles =
          Math.max(
            0,
            n(miles) -
            includedTotal
          );

        const milesTotal =
          extraMiles *
          perMile;

        const stopsTotal =
          Math.max(
            0,
            count - 1
          ) *
          stopFee;

        total =
          baseTotal +
          milesTotal +
          stopsTotal;
      }
    }

    /* =========================
       INDIVIDUAL
    ========================= */

    else{

      const extraMiles =
        Math.max(
          0,
          n(miles) -
          includedMiles
        );

      total =
        baseFare +
        (extraMiles * perMile) +
        (n(stops) * stopFee);
    }

    return res.json({

      success:true,

      pricingMode,

      total:Number(
        total.toFixed(2)
      ),

      pricingSource:
        service.source,

      facilityOverrideActive:
        resolved.facilityOverrideActive === true,

      facilityId:
        resolved.facilityId || "",

      facilityName:
        resolved.facilityName || "",

      usedPricing:{
        baseFare,
        includedMiles,
        perMile,
        stopFee,
        sharedPrice,
        hourlyRate,

        hourlyBillingMode:
          service.hourlyBillingMode,

        cancelFee:
          service.cancelFee,

        warningMinutes:
          service.warningMinutes,

        disableCancel:
          service.disableCancel
      },

      companyDisableCancel:
        Boolean(service.disableCancel),

      companyCancelFee:
        n(service.cancelFee,0),

      companyWarningMinutes:
        n(service.warningMinutes,0),

      service:
        service.rawService || service
    });

  }catch(err){

    console.log(
      "COMPANY CORE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Pricing Failed"
    });
  }
});

/* =========================
   UPDATE SERVICE
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      clean(req.params.idOrKey);

    const updated =
      await Service.findOneAndUpdate(
        buildServiceSearchFilter(idOrKey),
        {
          $set:req.body
        },
        {
          new:true
        }
      );

    if(!updated){

      return res.json({
        success:false,
        message:"Service Not Found"
      });
    }

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