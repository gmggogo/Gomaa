const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Service = require("../models/Service");
const Tenant = require("../models/Tenant");

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

/* =========================
   TENANT ALLOWED SERVICES
   Platform Admin is the master switch.
========================= */

function normalizeServiceCode(value){

  const c =
    String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ");

  if(!c) return "";

  if(c === "ST" || c === "STANDARD" || c.includes("STANDARD")) return "ST";
  if(c === "WH" || c === "WC" || c === "WHEELCHAIR" || c === "WHEEL CHAIR" || c.includes("WHEELCHAIR") || c.includes("WHEEL CHAIR")) return "WH";
  if(c === "SH" || c === "SHARED" || c.includes("SHARED")) return "SH";
  if(c === "LM" || c === "LIMO" || c === "LIMOUSINE" || c.includes("LIMOUSINE") || c.startsWith("LIMO ")) return "LM";
  if(c === "TX" || c === "TAXI" || c.includes("TAXI")) return "TX";
  if(c === "XL" || c === "XL SERVICE" || c.startsWith("XL ")) return "XL";

  return c;
}

function serviceCode(service){

  const values = [
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.suffix,
    service?.companySuffix,
    service?.reservedSuffix,
    service?.title,
    service?.name,
    service?.serviceName
  ];

  for(const value of values){
    const code = normalizeServiceCode(value);
    if(["ST","WH","SH","LM","TX","XL"].includes(code)){
      return code;
    }
  }

  return normalizeServiceCode(values.find(Boolean));
}

async function allowedServiceSet(req){

  if(req.authUser?.role === "PLATFORM_ADMIN"){
    return null;
  }

  const tenantId = String(req.authUser?.tenantId || "").trim();

  if(!tenantId){
    return new Set();
  }

  const tenant = await Tenant.findById(tenantId)
    .select({ allowedServices:1 })
    .lean();

  if(!tenant){
    return new Set();
  }

  const allowed = Array.isArray(tenant.allowedServices)
    ? tenant.allowedServices
        .map(normalizeServiceCode)
        .filter(Boolean)
    : [];

  return new Set(allowed);
}

async function filterAllowedServices(req,services){

  const allowed = await allowedServiceSet(req);

  if(allowed === null){
    return services;
  }

  return services.filter(service =>
    allowed.has(serviceCode(service))
  );
}

async function ensureServiceAllowed(req,service){

  const allowed = await allowedServiceSet(req);

  if(allowed === null){
    return true;
  }

  return allowed.has(serviceCode(service));
}


/* =========================
   TENANT SERVICE BOOTSTRAP

   Platform Admin only grants permission through
   Tenant.allowedServices.

   Each tenant then receives its OWN Service
   documents. No pricing/settings are copied from
   another tenant.

   Legacy records without tenantId may be used as
   templates. If no legacy template exists, a clean
   zero/default service record is created.
========================= */

function plainCopy(service){

  if(!service){
    return null;
  }

  const raw =
    service.toObject
      ? service.toObject()
      : { ...service };

  delete raw._id;
  delete raw.__v;
  delete raw.createdAt;
  delete raw.updatedAt;
  delete raw.tenantId;

  return raw;
}

async function findLegacyTemplateByCode(code){

  const normalized =
    normalizeServiceCode(code);

  if(!normalized){
    return null;
  }

  const candidates =
    await Service.find({
      $or:[
        { tenantId:null },
        { tenantId:{ $exists:false } }
      ]
    })
    .sort({
      createdAt:1
    })
    .lean();

  return (
    candidates.find(
      item =>
        serviceCode(item) === normalized
    ) ||
    null
  );
}

function cleanDefaultService(code){

  const key =
    normalizeServiceCode(code);

  const titles = {
    ST:"Standard",
    WH:"Wheelchair",
    SH:"Shared",
    LM:"Limousine",
    TX:"Taxi",
    XL:"XL"
  };

  const icons = {
    ST:"🚘",
    WH:"♿",
    SH:"👥",
    LM:"🚙",
    TX:"🚕",
    XL:"🚐"
  };

  const mode =
    key === "SH"
      ? "SHARED"
      : (
          key === "LM"
            ? "HOURLY"
            : "MILE"
        );

  return {
    serviceKey:key,
    title:
      titles[key] ||
      key,

    icon:
      icons[key] ||
      "🚘",

    enabled:true,
    companyEnabled:true,
    reservedEnabled:false,

    showPricingCard:true,

    driverPickupWaitEnabled:true,
    driverPickupWaitMinutes:10,
    driverStopWaitEnabled:true,
    driverStopWaitMinutes:5,

    pricingMode:mode,
    baseFare:0,
    includedMiles:0,
    perMile:0,
    hourlyRate:0,
    hourlyBillingMode:"FULL",
    initialDurationMinutes:0,
    initialPrice:0,
    stopFee:0,
    noShowFee:0,
    sharedPrice:0,

    warningEnabled:true,
    warningMinutes:120,
    cancelFee:15,
    disableCancel:false,

    getQuoteAddStopEnabled:false,
    getQuoteAddStopCustomTimeEnabled:false,
    getQuoteAddStopCutoffMinutes:0,

    companyShared:
      key === "SH",
    companySuffix:key,
    companyPricingMode:mode,
    companyBaseFare:0,
    companyIncludedMiles:0,
    companyPerMile:0,
    companyHourlyRate:0,
    companyHourlyBillingMode:"FULL",
    companyInitialDurationMinutes:0,
    companyInitialPrice:0,
    companyStopFee:0,
    companyNoShowFee:0,
    companySharedPrice:0,
    companyWarningEnabled:true,
    companyWarningMinutes:120,
    companyCancelFee:15,
    companyDisableCancel:false,
    companyAddStopEnabled:false,
    companyAddStopCustomTimeEnabled:false,
    companyAddStopCutoffMinutes:0,

    reservedShared:
      key === "SH",
    reservedSuffix:key,
    reservedPricingMode:mode,
    reservedBaseFare:0,
    reservedIncludedMiles:0,
    reservedPerMile:0,
    reservedHourlyRate:0,
    reservedHourlyBillingMode:"FULL",
    reservedInitialDurationMinutes:0,
    reservedInitialPrice:0,
    reservedStopFee:0,
    reservedNoShowFee:0,
    reservedSharedPrice:0,
    reservedWarningEnabled:true,
    reservedWarningMinutes:120,
    reservedCancelFee:15,
    reservedDisableCancel:false,
    reservedAddStopEnabled:false,
    reservedAddStopCustomTimeEnabled:false,
    reservedAddStopCutoffMinutes:0
  };
}

async function ensureTenantServiceDocuments(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){
    return;
  }

  const tenantId =
    String(
      req.authUser?.tenantId ||
      ""
    ).trim();

  if(!tenantId){
    return;
  }

  const allowed =
    await allowedServiceSet(req);

  if(
    !allowed ||
    !allowed.size
  ){
    return;
  }

  const existing =
    await Service.find({
      tenantId
    })
    .lean();

  const existingCodes =
    new Set(
      existing
        .map(serviceCode)
        .filter(Boolean)
    );

  for(const code of allowed){

    if(existingCodes.has(code)){
      continue;
    }

    const legacyTemplate =
      await findLegacyTemplateByCode(
        code
      );

    const payload =
      legacyTemplate
        ? plainCopy(
            legacyTemplate
          )
        : cleanDefaultService(
            code
          );

    payload.serviceKey =
      code;

    payload.tenantId =
      tenantId;

    /*
      Canonical suffixes for the new tenant copy.
      This prevents an old bad ST suffix from
      leaking into LM / WH / TX / XL.
    */
    payload.companySuffix =
      code;

    payload.reservedSuffix =
      payload.reservedSuffix &&
      payload.reservedSuffix !== "RV"
        ? payload.reservedSuffix
        : code;

    if(code === "SH"){
      payload.companyShared = true;
      payload.reservedShared = true;
      payload.companyPricingMode = "SHARED";
    }

    try{

      await Service.create(
        payload
      );

      console.log(
        "✅ TENANT SERVICE CREATED:",
        tenantId,
        code
      );

    }catch(err){

      /*
        Duplicate means another request created it
        at the same moment. Any other error matters.
      */
      if(err?.code !== 11000){

        console.log(
          "TENANT SERVICE CREATE ERROR:",
          tenantId,
          code,
          err.message
        );
      }
    }
  }
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

function safeNumber(v,fallback=0){

  const n = Number(v);

  if(!Number.isFinite(n)){
    return fallback;
  }

  return Math.max(0,n);
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

/* =========================
   NORMALIZE PRICING
   INCLUDING LIMO INITIAL PACKAGE
========================= */

function normalizePricingPayload(payload){

  const out = { ...payload };

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "initialDurationMinutes"
    )
  ){
    out.initialDurationMinutes =
      safeMinutes(out.initialDurationMinutes,0);
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "initialPrice"
    )
  ){
    out.initialPrice =
      safeNumber(out.initialPrice,0);
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "companyInitialDurationMinutes"
    )
  ){
    out.companyInitialDurationMinutes =
      safeMinutes(out.companyInitialDurationMinutes,0);
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "companyInitialPrice"
    )
  ){
    out.companyInitialPrice =
      safeNumber(out.companyInitialPrice,0);
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "reservedInitialDurationMinutes"
    )
  ){
    out.reservedInitialDurationMinutes =
      safeMinutes(out.reservedInitialDurationMinutes,0);
  }

  if(
    Object.prototype.hasOwnProperty.call(
      out,
      "reservedInitialPrice"
    )
  ){
    out.reservedInitialPrice =
      safeNumber(out.reservedInitialPrice,0);
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
   SERVICES
   /api/services
========================= */

router.get(
  "/",
  requireTenantApi,
  async (req,res)=>{

  try{

    await ensureTenantServiceDocuments(
      req
    );

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
      await Service.find(
        tenantFilter(
          req,
          filter
        )
      )
      .sort({
        createdAt:1
      });

    const visibleServices =
      await filterAllowedServices(
        req,
        services
      );

    return res.json(
      visibleServices
    );

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

router.get(
  "/admin",
  requireTenantApi,
  async (req,res)=>{

  try{

    await ensureTenantServiceDocuments(
      req
    );

    const services =
      await Service.find(
        tenantFilter(req)
      )
      .sort({
        createdAt:1
      });

    const visibleServices =
      await filterAllowedServices(
        req,
        services
      );

    return res.json(
      visibleServices
    );

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
========================= */

router.get(
  "/driver-config/:idOrKey",
  requireTenantApi,
  async (req,res)=>{

  try{

    const service =
      await Service.findOne(
        tenantFilter(
          req,
          getDriverConfigFilter(
            req.params.idOrKey
          )
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

    const allowed =
      await ensureServiceAllowed(
        req,
        service
      );

    if(!allowed){

      return res.status(403).json({
        success:false,
        message:
          "This service is not enabled for this company"
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

router.put(
  "/:idOrKey",
  requireTenantApi,
  async (req,res)=>{

  try{

    const filter =
      tenantFilter(
        req,
        getServiceFilter(
          req.params.idOrKey
        )
      );

    const current =
      await Service.findOne(
        filter
      );

    if(!current){
      return res.status(404).json({
        success:false,
        message:"Service Not Found"
      });
    }

    const allowed =
      await ensureServiceAllowed(
        req,
        current
      );

    if(!allowed){

      return res.status(403).json({
        success:false,
        message:
          "This service is not enabled for this company"
      });
    }

    const driverNormalized =
      normalizeDriverTimerPayload(
        { ...req.body }
      );

    const pricingNormalized =
      normalizePricingPayload(
        driverNormalized
      );

    const payload =
      lockAddStopForShared(
        pricingNormalized,
        current
      );

    /*
      Never allow a normal tenant to move
      a Service to another tenant.
    */
    if(
      req.authUser.role !==
      "PLATFORM_ADMIN"
    ){
      delete payload.tenantId;

      payload.tenantId =
        req.authUser.tenantId;
    }
    else if(
      req.body?.tenantId
    ){
      payload.tenantId =
        req.body.tenantId;
    }

    const updated =
      await Service.findOneAndUpdate(
        filter,
        {
          $set:payload
        },
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