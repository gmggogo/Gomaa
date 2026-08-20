const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const User =
  global.User ||
  mongoose.models.User ||
  require("../models/User");

const Service =
  mongoose.models.Service ||
  require("../models/Service");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,
      name:
        verified.name || "",
      username:
        verified.username || "",
      role:
        verified.role || "",
      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(
  req,
  extra={}
){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){

      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId:
      req.authUser.tenantId
  };
}

function tenantIdForWrite(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){
    return String(
      req.body?.tenantId ||
      req.query?.tenantId ||
      ""
    ).trim();
  }

  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
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

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

/* =========================
   NORMALIZE SERVICE CODE
========================= */

function normalizeCode(v){

  const original =
    upper(v);

  if(!original){
    return "";
  }

  const c =
    original
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  /* STANDARD */

  if(
    c === "ST" ||
    c === "STANDARD" ||
    c === "STANDARD SERVICE" ||
    c.includes("STANDARD")
  ){
    return "ST";
  }

  /* WHEELCHAIR */

  if(
    c === "WH" ||
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c.includes("WHEELCHAIR") ||
    c.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  /* SHARED */

  if(
    c === "SH" ||
    c === "SHARED" ||
    c === "SHARE" ||
    c.includes("SHARED")
  ){
    return "SH";
  }

  /* LIMOUSINE */

  if(
    c === "LM" ||
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c === "LIMO SERVICE" ||
    c === "LIMOUSINE SERVICE" ||
    c === "LIMOUSINE TRANSPORTATION" ||
    c.includes("LIMOUSINE") ||
    c.startsWith("LIMO ")
  ){
    return "LM";
  }

  /* TAXI */

  if(
    c === "TX" ||
    c === "TAXI" ||
    c === "TAXI SERVICE" ||
    c.includes("TAXI")
  ){
    return "TX";
  }

  /* XL */

  if(
    c === "XL" ||
    c === "XL SERVICE" ||
    c.startsWith("XL ")
  ){
    return "XL";
  }

  return c;
}

/* =========================
   GET SERVICE CODE
========================= */

function getServiceCode(s){

  const candidates = [
    s?.serviceKey,
    s?.key,
    s?.code,
    s?.serviceCode,
    s?.serviceType,
    s?.companySuffix,
    s?.suffix,
    s?.serviceSuffix,
    s?.title,
    s?.name,
    s?.serviceName
  ];

  /*
    First look for a known system service.

    Important:
    Do not just use the first existing field,
    because Limousine may have a long title
    while its real code is LM in another field.
  */

  for(const value of candidates){

    if(!clean(value)){
      continue;
    }

    const code =
      normalizeCode(value);

    if(
      code === "ST" ||
      code === "WH" ||
      code === "SH" ||
      code === "LM" ||
      code === "TX" ||
      code === "XL"
    ){
      return code;
    }
  }

  /*
    Custom service fallback
  */

  for(const value of candidates){

    if(clean(value)){
      return normalizeCode(value);
    }
  }

  return "";
}

/* =========================
   SERVICE NAME
========================= */

function getServiceName(s){

  return (
    s?.title ||
    s?.name ||
    s?.serviceName ||
    getServiceCode(s) ||
    "Service"
  );
}

/* =========================
   SERVICE ENABLED
========================= */

function serviceEnabled(s){

  return (
    s?.companyEnabled === true ||
    s?.enabled === true
  );
}

/* =========================
   FACILITY NAME
========================= */

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

/* =========================
   FACILITY USER
========================= */

function isFacilityUser(u){

  const r =
    clean(
      u?.role ||
      u?.type ||
      ""
    ).toLowerCase();

  return (
    r === "company" ||
    r === "facility" ||
    r.includes("company") ||
    r.includes("facility")
  );
}

/* =========================
   SHARED SERVICE
========================= */

function isSharedService(s){

  const key =
    getServiceCode(s);

  const title =
    upper(
      s?.title ||
      s?.name ||
      s?.serviceName
    );

  const pricing =
    upper(
      s?.companyPricingMode ||
      s?.pricingMode
    );

  const suffix =
    normalizeCode(
      s?.companySuffix ||
      s?.suffix ||
      s?.serviceSuffix
    );

  return (
    s?.companyShared === true ||
    s?.shared === true ||
    key === "SH" ||
    title === "SHARED" ||
    title.includes("SHARED") ||
    suffix === "SH" ||
    pricing === "SHARED"
  );
}

/* =========================
   DEFAULT PRICING
   FROM SERVICE MANAGEMENT
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
      normalizeCode(
        s?.companySuffix ||
        s?.suffix ||
        s?.serviceSuffix ||
        serviceKey
      ) || serviceKey,

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

    initialDurationMinutes:
      num(
        s?.companyInitialDurationMinutes ??
        s?.initialDurationMinutes ??
        0
      ),

    initialPrice:
      num(
        s?.companyInitialPrice ??
        s?.initialPrice ??
        0
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
            s?.addStopEnabled ??
            false
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            s?.companyAddStopCustomTimeEnabled ??
            s?.addStopCustomTimeEnabled ??
            false
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : num(
            s?.companyAddStopCutoffMinutes ??
            s?.addStopCutoffMinutes ??
            0
          )
  };
}

/* =========================
   NORMALIZE INPUT
   FROM FRONTEND
========================= */

function normalizeServiceInput(s){

  const serviceKey =
    normalizeCode(
      s?.serviceKey ||
      s?.serviceCode ||
      s?.serviceType ||
      s?.serviceSuffix ||
      s?.suffix ||
      s?.serviceName
    );

  const pricingMode =
    upper(
      s?.pricingMode ||
      "MILE"
    );

  const shared =
    bool(s?.shared) ||
    pricingMode === "SHARED" ||
    serviceKey === "SH";

  return {

    serviceKey,

    serviceName:
      clean(
        s?.serviceName
      ),

    serviceSuffix:
      normalizeCode(
        s?.serviceSuffix ||
        s?.suffix ||
        serviceKey
      ) || serviceKey,

    shared,

    pricingMode,

    baseFare:
      num(
        s?.baseFare
      ),

    includedMiles:
      num(
        s?.includedMiles
      ),

    perMile:
      num(
        s?.perMile
      ),

    hourlyRate:
      num(
        s?.hourlyRate
      ),

    hourlyBillingMode:
      upper(
        s?.hourlyBillingMode ||
        "FULL"
      ),

    initialDurationMinutes:
      num(
        s?.initialDurationMinutes
      ),

    initialPrice:
      num(
        s?.initialPrice
      ),

    stopFee:
      num(
        s?.stopFee
      ),

    noShowFee:
      num(
        s?.noShowFee
      ),

    sharedPrice:
      num(
        s?.sharedPrice
      ),

    disableCancel:
      bool(
        s?.disableCancel
      ),

    warningMinutes:
      num(
        s?.warningMinutes
      ),

    cancelFee:
      num(
        s?.cancelFee
      ),

    addStopEnabled:
      shared
        ? false
        : bool(
            s?.addStopEnabled
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            s?.addStopCustomTimeEnabled
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : num(
            s?.addStopCutoffMinutes
          )
  };
}

/* =========================
   FIND FACILITY OVERRIDE
========================= */

async function findOverrideByIdOrName({
  facilityId,
  facilityName,
  activeOnly = false,
  req
}){

  const or = [];

  const cleanFacilityId =
    clean(facilityId);

  const cleanFacilityName =
    clean(facilityName);

  if(
    cleanFacilityId &&
    mongoose.Types.ObjectId.isValid(
      cleanFacilityId
    )
  ){

    or.push({
      facilityId:
        cleanFacilityId
    });
  }

  if(cleanFacilityName){

    const rx =
      new RegExp(
        "^" +
        escapeRegex(cleanFacilityName) +
        "$",
        "i"
      );

    or.push({
      facilityName:
        rx
    });
  }

  if(or.length === 0){

    return null;
  }

  const filter = {
    $or:or
  };

  if(activeOnly){

    filter.active =
      true;
  }

  return await FacilityPricingOverride
    .findOne(
      tenantFilter(
        req,
        filter
      )
    )
    .sort({
      updatedAt:-1,
      createdAt:-1
    })
    .lean();
}

/* =========================
   BOOTSTRAP
========================= */

router.get("/bootstrap", requireTenantApi, async (req,res)=>{

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

    const [
      users,
      services,
      overrides
    ] =
      await Promise.all([

        User
          .find(
            tenantFilter(req)
          )
          .lean(),

        Service
          .find(
            tenantFilter(req)
          )
          .lean(),

        FacilityPricingOverride
          .find(
            tenantFilter(req)
          )
          .lean()

      ]);

    const facilities =
      users
        .filter(
          isFacilityUser
        )
        .map(u=>({

          _id:
            String(u._id),

          name:
            getFacilityName(u),

          email:
            u.email || "",

          username:
            u.username || "",

          allowedServices:
            Array.isArray(
              u.allowedServices
            )
              ? u.allowedServices
                  .map(normalizeCode)
                  .filter(Boolean)
              : []

        }))
        .filter(
          f=>f.name
        )
        .sort(
          (a,b)=>
            a.name.localeCompare(b.name)
        );

    const activeServices =
      services
        .filter(
          serviceEnabled
        )
        .map(
          serviceDefaultPricing
        )
        .filter(
          s=>s.serviceKey
        )
        .sort(
          (a,b)=>
            a.serviceKey.localeCompare(
              b.serviceKey
            )
        );

    return res.json({

      success:true,

      facilities,

      services:
        activeServices,

      overrides

    });

  }catch(err){

    console.log(
      "FACILITY PRICING BOOTSTRAP ERROR:",
      err
    );

    return res.status(500).json({

      success:false,

      message:
        "Failed to load facility pricing data"

    });

  }

});

/* =========================
   RESOLVE ACTIVE
   FACILITY OVERRIDE

   IMPORTANT:
   MUST STAY BEFORE
   /:facilityId
========================= */

router.get("/resolve", requireTenantApi, async (req,res)=>{

  try{

    const facilityId =
      clean(
        req.query.facilityId ||
        req.query.companyId ||
        req.query.userId ||
        ""
      );

    const facilityName =
      clean(
        req.query.facilityName ||
        req.query.companyName ||
        req.query.company ||
        req.query.facility ||
        req.query.name ||
        ""
      );

    const override =
      await findOverrideByIdOrName({

        facilityId,

        facilityName,

        activeOnly:true,
        req

      });

    if(!override){

      return res.json({

        success:false,

        message:
          "No active facility pricing override found",

        override:null,

        debug:{
          facilityId,
          facilityName
        }

      });
    }

    return res.json({

      success:true,

      override,

      debug:{

        facilityId,

        facilityName,

        matchedFacilityId:
          String(
            override.facilityId ||
            ""
          ),

        matchedFacilityName:
          override.facilityName ||
          ""

      }

    });

  }catch(err){

    console.log(
      "FACILITY PRICING RESOLVE ERROR:",
      err
    );

    return res.status(500).json({

      success:false,

      message:
        "Failed to resolve facility pricing override",

      override:null

    });

  }

});

/* =========================
   GET ONE FACILITY
   OVERRIDE
========================= */

router.get("/:facilityId", requireTenantApi, async (req,res)=>{

  try{

    const {
      facilityId
    } =
      req.params;

    if(
      !mongoose.Types.ObjectId
        .isValid(
          String(facilityId)
        )
    ){

      return res.status(400).json({

        success:false,

        message:
          "Invalid facility id"

      });
    }

    const override =
      await FacilityPricingOverride
        .findOne(
          tenantFilter(req,{
            facilityId
          })
        )
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

      message:
        "Failed to load override"

    });

  }

});

/* =========================
   SAVE FACILITY
   OVERRIDE
========================= */

router.patch("/:facilityId", requireTenantApi, async (req,res)=>{

  try{

    const {
      facilityId
    } =
      req.params;

    if(
      !mongoose.Types.ObjectId
        .isValid(
          String(facilityId)
        )
    ){

      return res.status(400).json({

        success:false,

        message:
          "Invalid facility id"

      });
    }

    const tenantId =
      tenantIdForWrite(req);

    if(!tenantId){

      return res.status(403).json({

        success:false,

        message:
          "Tenant Required"

      });
    }

    const facilityUser =
      await User.findOne({
        _id:facilityId,
        tenantId
      })
      .lean();

    if(
      !facilityUser ||
      !isFacilityUser(facilityUser)
    ){

      return res.status(404).json({

        success:false,

        message:
          "Facility not found"

      });
    }

    const facilityName =
      clean(
        req.body?.facilityName
      );

    const active =
      bool(
        req.body?.active
      );

    const servicesInput =
      Array.isArray(
        req.body?.services
      )
        ? req.body.services
        : [];

    if(!facilityName){

      return res.status(400).json({

        success:false,

        message:
          "Facility name is required"

      });
    }

    if(
      active &&
      !servicesInput.length
    ){

      return res.status(400).json({

        success:false,

        message:
          "Active override requires services pricing"

      });
    }

    const services =
      servicesInput
        .map(
          normalizeServiceInput
        )
        .filter(
          s=>s.serviceKey
        );

    const updatedBy =
      clean(
        req.authUser?.name
      ) ||
      clean(
        req.authUser?.username
      ) ||
      clean(
        req.body?.updatedBy
      ) ||
      "";

    const override =
      await FacilityPricingOverride
        .findOneAndUpdate(

          {
            tenantId,
            facilityId
          },

          {
            tenantId,
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

      message:
        active
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

      message:
        "Failed to save facility pricing override"

    });

  }

});

module.exports = router;