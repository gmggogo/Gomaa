const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Service = require("../models/Service");
const Tenant = require("../models/Tenant");
const BrokerIntegration = require("../models/BrokerIntegration");
const BookingDataConfig = require("../models/BookingDataConfig");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

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
  return serviceIdentity.normalizeServiceCode(value);
}

function customGateCode(slot){
  return serviceIdentity.customGateFromSlot(slot);
}

function isCustomGateCode(value){
  return serviceIdentity.isCustomGate(value);
}

function serviceGateCode(service){
  return serviceIdentity.getServiceGateKey(service);
}

function serviceCode(service){

  const operational =
    serviceIdentity.getServiceOperationalCode(
      service
    );

  if(operational){
    return operational;
  }

  /*
    Unconfigured custom slots intentionally have no operational
    two-letter code yet. Keep their master identity available only
    to the Platform Admin gate and never treat CUSTOM_1...4 as a
    trip/pricing suffix.
  */
  if(
    serviceIdentity.isCustomService(service)
  ){
    return "";
  }

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

  return normalizeServiceCode(
    values.find(Boolean)
  );
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

async function filterAllowedServices(
  req,
  services,
  allowedOverride=undefined
){

  const allowed =
    allowedOverride !== undefined
      ? allowedOverride
      : await allowedServiceSet(req);

  if(allowed === null){
    return services;
  }

  return services.filter(service =>
    allowed.has(serviceGateCode(service))
  );
}

async function ensureServiceAllowed(req,service){

  const allowed = await allowedServiceSet(req);

  if(allowed === null){
    return true;
  }

  return allowed.has(serviceGateCode(service));
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

function customSlotDefault(slot){

  return {
    ...cleanDefaultService("ST"),
    serviceKey:`CUSTOM_${slot}`,
    title:`Custom Service ${slot}`,
    icon:"🚘",
    enabled:false,
    companyEnabled:false,
    reservedEnabled:false,
    showPricingCard:false,
    customSlot:slot,
    customConfigured:false,
    customServiceCode:"",
    companySuffix:"",
    reservedSuffix:""
  };
}

function generatedCustomCode(title){
  return serviceIdentity.generateCustomServiceCode(title);
}

async function ensureCustomServiceSlots(tenantId){

  if(!tenantId) return;

  /*
    PERFORMANCE:
    Old code executed four sequential Mongo queries on every GET.
    Read all four slots in one query, then create only missing slots.
  */
  const existingSlots =
    await Service.find({
      tenantId,
      customSlot:{ $in:[1,2,3,4] }
    })
    .select({
      _id:1,
      customSlot:1
    })
    .lean();

  const existingSet =
    new Set(
      existingSlots
        .map(item=>Number(item?.customSlot || 0))
        .filter(Boolean)
    );

  const missing = [];

  for(let slot=1; slot<=4; slot++){
    if(!existingSet.has(slot)){
      missing.push({
        tenantId,
        ...customSlotDefault(slot)
      });
    }
  }

  if(!missing.length){
    return;
  }

  try{
    await Service.insertMany(
      missing,
      { ordered:false }
    );
  }catch(err){
    /*
      Duplicate means another request created the same
      slot concurrently. Other errors still matter.
    */
    if(
      err?.code !== 11000 &&
      !Array.isArray(err?.writeErrors)
    ){
      throw err;
    }
  }
}

async function ensureTenantServiceDocuments(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){
    return null;
  }

  const tenantId =
    String(
      req.authUser?.tenantId ||
      ""
    ).trim();

  if(!tenantId){
    return new Set();
  }

  /*
    Run the independent bootstrap reads together.
    This removes avoidable sequential waits from
    /api/services and /api/services/admin.
  */
  const [
    allowed,
    existing
  ] = await Promise.all([
    allowedServiceSet(req),
    Service.find({
      tenantId
    })
    .lean()
  ]);

  await ensureCustomServiceSlots(tenantId);

  if(
    !allowed ||
    !allowed.size
  ){
    return allowed || new Set();
  }

  const existingCodes =
    new Set(
      existing
        .map(serviceCode)
        .filter(Boolean)
    );

  const missingCodes =
    Array
      .from(allowed)
      .filter(
        code =>
          !isCustomGateCode(code) &&
          !existingCodes.has(code)
      );

  if(!missingCodes.length){
    return allowed;
  }

  /*
    Old code re-ran the same legacy-template query
    once for every missing service. Load templates once.
  */
  const legacyCandidates =
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

  const payloads = [];

  for(const code of missingCodes){

    const legacyTemplate =
      legacyCandidates.find(
        item =>
          serviceCode(item) === code
      ) ||
      null;

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

    payloads.push(payload);
  }

  if(payloads.length){

    try{

      await Service.insertMany(
        payloads,
        { ordered:false }
      );

      for(const code of missingCodes){
        console.log(
          "✅ TENANT SERVICE CREATED:",
          tenantId,
          code
        );
      }

    }catch(err){

      /*
        Duplicate means another request created one
        of the same services concurrently.
      */
      const onlyDuplicate =
        err?.code === 11000 ||
        (
          Array.isArray(err?.writeErrors) &&
          err.writeErrors.every(
            item => item?.code === 11000
          )
        );

      if(!onlyDuplicate){
        console.log(
          "TENANT SERVICE CREATE ERROR:",
          tenantId,
          err?.message || err
        );
      }
    }
  }

  return allowed;
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

const TRANSPORT_SERVICE_CATEGORIES =
  new Set(["PASSENGER","CARGO","MIXED"]);

const TRANSPORT_VEHICLE_CATEGORIES =
  new Set([
    "GENERIC","SEDAN","SUV","MINIVAN","WHEELCHAIR_VAN",
    "LIMOUSINE","TAXI","CARGO_VAN","SPRINTER_VAN",
    "PICKUP_TRUCK","BOX_TRUCK","MOVING_TRUCK","FLATBED",
    "SEMI_TRUCK","TRACTOR_TRAILER","HEAVY_DUTY","COURIER"
  ]);

const TRANSPORT_ICON_KEYS =
  new Set([
    "GENERIC_TRANSPORT","SEDAN","SUV","MINIVAN","WHEELCHAIR",
    "LIMOUSINE","TAXI","SHARED","CARGO_VAN","SPRINTER_VAN",
    "PICKUP_TRUCK","BOX_TRUCK","MOVING_TRUCK","FLATBED",
    "SEMI_TRUCK","TRACTOR_TRAILER","HEAVY_DUTY","COURIER",
    "MEDICAL","ESCORT"
  ]);

function normalizeTransportProfilePayload(payload){

  const out = { ...payload };

  if(Object.prototype.hasOwnProperty.call(out,"serviceCategory")){
    const v = upper(out.serviceCategory);
    out.serviceCategory =
      TRANSPORT_SERVICE_CATEGORIES.has(v) ? v : "PASSENGER";
  }

  if(Object.prototype.hasOwnProperty.call(out,"vehicleCategory")){
    const v = upper(out.vehicleCategory);
    out.vehicleCategory =
      TRANSPORT_VEHICLE_CATEGORIES.has(v) ? v : "GENERIC";
  }

  if(Object.prototype.hasOwnProperty.call(out,"iconKey")){
    const v = upper(out.iconKey);
    out.iconKey =
      TRANSPORT_ICON_KEYS.has(v) ? v : "GENERIC_TRANSPORT";
  }

  if(Object.prototype.hasOwnProperty.call(out,"requiresCDL")){
    out.requiresCDL = bool(out.requiresCDL) === true;
  }

  if(Object.prototype.hasOwnProperty.call(out,"cdlClass")){
    const v = upper(out.cdlClass);
    out.cdlClass = ["A","B","C"].includes(v) ? v : "";
  }

  if(out.requiresCDL !== true){
    out.cdlClass = "";
  }

  if(Object.prototype.hasOwnProperty.call(out,"minimumVehicleCapacityLb")){
    out.minimumVehicleCapacityLb =
      safeNumber(out.minimumVehicleCapacityLb,0);
  }

  for(const key of [
    "requiresLiftGate",
    "refrigeratedRequired",
    "hazmatRequired"
  ]){
    if(Object.prototype.hasOwnProperty.call(out,key)){
      out[key] = bool(out[key]) === true;
    }
  }

  return out;
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

/* =========================
   BOOKING HOURS
========================= */

const BOOKING_HOUR_SOURCES = [
  "getQuote",
  "facility",
  "reserved",
  "facilityOverride"
];

function safeBookingTime(value,fallback){

  const text = clean(value);

  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(text)){
    return text;
  }

  return fallback;
}

function normalizeBookingHourRule(value){

  const source =
    value && typeof value === "object"
      ? value
      : {};

  const requestedMode =
    upper(source.mode || "24_HOURS");

  const mode =
    ["24_HOURS","CUSTOM","DISABLED"].includes(requestedMode)
      ? requestedMode
      : "24_HOURS";

  return {
    mode,
    from:safeBookingTime(source.from,"00:00"),
    to:safeBookingTime(source.to,"23:59")
  };
}

function normalizeBookingHoursPayload(payload){

  const out = { ...payload };

  if(
    !Object.prototype.hasOwnProperty.call(
      out,
      "bookingHours"
    )
  ){
    return out;
  }

  const incoming =
    out.bookingHours &&
    typeof out.bookingHours === "object"
      ? out.bookingHours
      : {};

  const normalized = {};

  for(const source of BOOKING_HOUR_SOURCES){
    normalized[source] =
      normalizeBookingHourRule(
        incoming[source]
      );
  }

  out.bookingHours = normalized;

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

    const allowed =
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
        services,
        allowed
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
   BOOKING HOURS CONTEXT
   /api/services/booking-hours-context
========================= */

router.get(
  "/booking-hours-context",
  requireTenantApi,
  async (req,res)=>{

  try{

    if(
      req.authUser?.role ===
      "PLATFORM_ADMIN"
    ){
      return res.json({
        success:true,
        brokerEnabled:true
      });
    }

    const brokerEnabled =
      Boolean(
        await BrokerIntegration.exists({
          tenantId:req.authUser.tenantId,
          enabled:true
        })
      );

    return res.json({
      success:true,
      brokerEnabled
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Booking Hours Context"
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

    const allowed =
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
        services,
        allowed
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
   COMPANY / FACILITY BOOKING FIELDS
========================= */

router.get(
  "/booking-data/company",
  requireTenantApi,
  async (req,res)=>{
    try{
      const tenantId =
        req.authUser?.role === "PLATFORM_ADMIN"
          ? clean(req.query?.tenantId || "")
          : clean(req.authUser?.tenantId || "");

      if(!tenantId){
        return res.status(400).json({ success:false, message:"Tenant Required" });
      }

      const config = await BookingDataConfig.findOne({ tenantId }).lean();

      return res.json({
        success:true,
        standardCatalog:[
          { key:"appointmentTime", label:"Appointment Time", type:"TIME" },
          { key:"returnTime", label:"Return Time", type:"TIME" },
          { key:"clientEmail", label:"Passenger Email", type:"EMAIL" },
          { key:"memberId", label:"Member ID", type:"TEXT" },
          { key:"serviceType", label:"Service Type", type:"TEXT" },
          { key:"tripType", label:"Trip Type", type:"TEXT" },
          { key:"company", label:"Company / Facility Name", type:"TEXT" },
          { key:"entryName", label:"Data Entry Name", type:"TEXT" },
          { key:"entryPhone", label:"Data Entry Phone", type:"PHONE" },
          { key:"brokerName", label:"Broker Name", type:"TEXT" },
          { key:"brokerCode", label:"Broker Code", type:"TEXT" },
          { key:"brokerTripId", label:"Broker Trip ID", type:"TEXT" },
          { key:"externalSource", label:"External Source", type:"TEXT" },
          { key:"brokerNotes", label:"Broker Notes", type:"LONG_TEXT" },
          { key:"totalPassengers", label:"Total Passengers", type:"NUMBER" }
        ],
        config:{
          standardFields:Array.isArray(config?.standardFields) ? config.standardFields : [],
          customFields:Array.isArray(config?.customFields) ? config.customFields : []
        }
      });
    }catch(err){
      console.log("COMPANY BOOKING FIELDS LOAD ERROR:", err);
      return res.status(500).json({ success:false, message:"Failed To Load Company Booking Fields" });
    }
  }
);

/* =========================
   CUSTOM SERVICE SLOT NAME
   PUT /api/services/custom-slot/:slot
========================= */

router.put(
  "/custom-slot/:slot",
  requireTenantApi,
  async (req,res)=>{

    return res.status(403).json({
      success:false,
      message:
        "Custom Service names are controlled by GH Mobility Platform Admin"
    });
  }
);


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

    const bookingHoursNormalized =
      normalizeBookingHoursPayload(
        pricingNormalized
      );

    const transportNormalized =
      normalizeTransportProfilePayload(
        bookingHoursNormalized
      );

    const payload =
      lockAddStopForShared(
        transportNormalized,
        current
      );

    /*
      PLATFORM-OWNED CUSTOM SERVICE IDENTITY

      Platform Admin owns the permanent name/code/slot.
      Tenant admins may configure pricing, surfaces, hours, icon/vehicle
      requirements, etc., but cannot rename or re-key a custom service.
    */
    if(
      current?.customSlot &&
      req.authUser?.role !== "PLATFORM_ADMIN"
    ){
      delete payload.title;
      delete payload.serviceKey;
      delete payload.serviceCode;
      delete payload.customSlot;
      delete payload.customConfigured;
      delete payload.customServiceCode;
      delete payload.companySuffix;
      delete payload.reservedSuffix;
      delete payload.serviceIdentity;
    }

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

    /*
      Booking Hours are written with explicit Mongo dot paths.
      This prevents the nested bookingHours object from being replaced,
      defaulted, or lost by a partial service update.
    */
    const updateSet = { ...payload };

    if(
      payload.bookingHours &&
      typeof payload.bookingHours === "object"
    ){
      const hours = payload.bookingHours;
      delete updateSet.bookingHours;

      for(const source of BOOKING_HOUR_SOURCES){
        const rule = normalizeBookingHourRule(hours[source]);

        updateSet[`bookingHours.${source}.mode`] = rule.mode;
        updateSet[`bookingHours.${source}.from`] = rule.from;
        updateSet[`bookingHours.${source}.to`] = rule.to;
      }
    }

    const updated =
      await Service.findOneAndUpdate(
        filter,
        {
          $set:updateSet
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