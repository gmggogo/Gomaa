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
    String(v).toLowerCase() === "true" ||
    String(v).toLowerCase() === "yes" ||
    String(v).toLowerCase() === "1"
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

function getOverrideServiceCode(s){

  return normalizeCode(
    s?.serviceKey ||
    s?.serviceCode ||
    s?.serviceType ||
    s?.serviceSuffix ||
    s?.suffix ||
    s?.companySuffix ||
    s?.reservedSuffix ||
    s?.key ||
    s?.code ||
    s?.title ||
    s?.name ||
    s?.serviceName ||
    ""
  );
}

function isOverrideServiceEnabled(s){

  /*
    في صفحة Facility Pricing اللي بعتهالي،
    الخدمة نفسها مفيهاش active مستقل.
    عشان كده لو الخدمة موجودة داخل override active
    يبقى نعتبرها شغالة.

    لو بعدين ضفت enabled/active جوه كل خدمة،
    الشرط ده هيحترمه.
  */

  if(!s){
    return false;
  }

  if(s.active !== undefined){
    return bool(s.active);
  }

  if(s.enabled !== undefined){
    return bool(s.enabled);
  }

  if(s.companyEnabled !== undefined){
    return bool(s.companyEnabled);
  }

  return true;
}

/* =========================
   RESOLVE FACILITY ID
========================= */

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
   FROM SERVICE MANAGEMENT
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
        service.serviceCode ||
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

/* =========================
   NORMALIZE SERVICE PRICING
   FROM FACILITY OVERRIDE
========================= */

function pricingFromFacilityOverride(service){

  return {
    source:"FACILITY_OVERRIDE",

    serviceKey:
      getOverrideServiceCode(service),

    pricingMode:
      upper(
        service.pricingMode ||
        service.companyPricingMode ||
        "MILE"
      ),

    baseFare:
      n(
        service.baseFare ??
        service.companyBaseFare ??
        0
      ),

    includedMiles:
      n(
        service.includedMiles ??
        service.companyIncludedMiles ??
        0
      ),

    perMile:
      n(
        service.perMile ??
        service.companyPerMile ??
        0
      ),

    stopFee:
      n(
        service.stopFee ??
        service.companyStopFee ??
        0
      ),

    noShowFee:
      n(
        service.noShowFee ??
        service.companyNoShowFee ??
        0
      ),

    sharedPrice:
      n(
        service.sharedPrice ??
        service.companySharedPrice ??
        0
      ),

    hourlyRate:
      n(
        service.hourlyRate ??
        service.companyHourlyRate ??
        0
      ),

    hourlyBillingMode:
      upper(
        service.hourlyBillingMode ||
        service.companyHourlyBillingMode ||
        "FULL"
      ),

    disableCancel:
      bool(
        service.disableCancel ??
        service.companyDisableCancel ??
        false
      ),

    cancelFee:
      n(
        service.cancelFee ??
        service.companyCancelFee ??
        0
      ),

    warningMinutes:
      n(
        service.warningMinutes ??
        service.companyWarningMinutes ??
        0
      ),

    rawService:
      service
  };
}

/* =========================
   FIND ACTIVE FACILITY OVERRIDE
========================= */

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
    .sort({
      updatedAt:-1,
      createdAt:-1
    })
    .lean();
}

/* =========================
   RESOLVE PRICING SOURCE
   FACILITY FIRST
   SERVICE MANAGEMENT FALLBACK
========================= */

async function resolvePricingService({
  serviceKey,
  facilityId,
  company
}){

  const key =
    normalizeCode(serviceKey);

  const resolvedFacilityId =
    await resolveFacilityId({
      facilityId,
      company
    });

  /*
    المسار الصح:
    1) Facility Pricing Override الأول
    2) لو active:true وموجودة الخدمة جوه services
       يحسب من الصفحة الجديدة
    3) لو مفيش override أو active:false
       يرجع Service Management
  */

  const override =
    await findActiveFacilityOverride({
      facilityId:
        resolvedFacilityId || facilityId,
      company
    });

  if(override){

    const overrideServices =
      Array.isArray(override.services)
        ? override.services
        : [];

    const overrideService =
      overrideServices.find(s =>
        getOverrideServiceCode(s) === key
      );

    if(overrideService && isOverrideServiceEnabled(overrideService)){

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
          override.facilityName || "",

        pricingSource:
          "FACILITY_OVERRIDE",

        pricingReason:
          "ACTIVE_FACILITY_OVERRIDE_USED"
      };
    }

    /*
      لو Facility active بس الخدمة مش موجودة جوه الصفحة،
      هنرجع Service Management كـ fallback.
      عشان لو الصفحة مش متسجلة فيها كل الخدمات ما يوقفش الحساب.
    */
  }

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

    facilityId:
      resolvedFacilityId || "",

    facilityName:"",

    pricingSource:
      "SERVICE_MANAGEMENT",

    pricingReason:
      override
        ? "FACILITY_OVERRIDE_ACTIVE_BUT_SERVICE_NOT_FOUND_FALLBACK"
        : "NO_ACTIVE_FACILITY_OVERRIDE_FALLBACK"
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

      pricingReason:
        resolved.pricingReason || "",

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