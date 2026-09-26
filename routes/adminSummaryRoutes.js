/* ==========================================================================
   ADMIN SUMMARY ROUTES - HISTORICAL ARCHIVE V5
   Admin / SuperAdmin / Dispatcher

   LOW REQUEST DESIGN:
   - 1 HTTP request from Admin Summary page
   - 3 Mongo queries TOTAL, executed in parallel:
       1) Trips
       2) Services
       3) Active Facility Overrides
   - ZERO Mongo queries per trip

   PRICING PRIORITY:
   FACILITY:
     Facility Pricing Override ACTIVE -> use override service
     otherwise -> Service Management Facility pricing

   GET QUOTE:
     Service Management Get Quote pricing

   RESERVED:
     Service Management Reserved pricing
   ========================================================================== */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Service =
  require("../models/Service");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const router = express.Router();

/* =========================
   SHORT-LIVED SUMMARY CACHE

   A short server-side cache prevents
   duplicate page opens / refreshes from re-reading the same large Trip
   documents repeatedly. It does not change stored data or API shape.
========================= */

const SUMMARY_CACHE_TTL_MS = 10 * 1000;
const summaryCache = new Map();

/* =========================
   PERSISTENT SUMMARY ARCHIVE
   Historical closed trips are calculated once and stored.
   Normal requests calculate only today's/live rows.
========================= */

const summaryHistoryMemory = new Map();

const AdminSummaryArchive =
  mongoose.models.AdminSummaryArchive ||
  mongoose.model(
    "AdminSummaryArchive",
    new mongoose.Schema(
      {
        tenantKey:{
          type:String,
          required:true,
          index:true
        },
        sourceTripId:{
          type:String,
          required:true
        },
        tripDate:{
          type:String,
          default:"",
          index:true
        },
        payload:{
          type:mongoose.Schema.Types.Mixed,
          required:true
        },
        archivedAt:{
          type:Date,
          default:Date.now
        }
      },
      {
        timestamps:true,
        collection:"admin_summary_archive"
      }
    ).index(
      {
        tenantKey:1,
        sourceTripId:1
      },
      {
        unique:true
      }
    )
  );

const AdminSummaryArchiveState =
  mongoose.models.AdminSummaryArchiveState ||
  mongoose.model(
    "AdminSummaryArchiveState",
    new mongoose.Schema(
      {
        tenantKey:{
          type:String,
          required:true,
          unique:true,
          index:true
        },
        cutoffDate:{
          type:String,
          default:""
        },
        updatedAt:{
          type:Date,
          default:Date.now
        }
      },
      {
        timestamps:true,
        collection:"admin_summary_archive_state"
      }
    )
  );

function clearSummaryHistoryMemory(tenantKey=null){
  if(tenantKey){
    summaryHistoryMemory.delete(String(tenantKey));
    return;
  }

  summaryHistoryMemory.clear();
}

function summaryTenantKey(req){
  return summaryCacheKey(req);
}

let ADMIN_SUMMARY_TIMEZONE =
  process.env.APP_TIMEZONE ||
  "America/Phoenix";

function setArchiveTimeZone(value){
  const candidate =
    String(value || "").trim();

  if(!candidate){
    return ADMIN_SUMMARY_TIMEZONE;
  }

  try{
    new Intl.DateTimeFormat(
      "en-US",
      { timeZone:candidate }
    ).format(new Date());

    ADMIN_SUMMARY_TIMEZONE =
      candidate;
  }catch(err){
    /* Keep the current valid program timezone. */
  }

  return ADMIN_SUMMARY_TIMEZONE;
}

function summaryDateKey(
  date = new Date(),
  timeZone = ADMIN_SUMMARY_TIMEZONE
){
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    ).formatToParts(date);

  const map = {};

  for(const part of parts){
    if(part.type !== "literal"){
      map[part.type] = part.value;
    }
  }

  return `${map.year}-${map.month}-${map.day}`;
}


function summaryCacheKey(req){
  if(req.authUser?.role === "PLATFORM_ADMIN"){
    return `platform:${String(req.query?.tenantId || "ALL")}`;
  }
  return `tenant:${String(req.authUser?.tenantId || "")}`;
}

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
   MODEL
========================= */

function getTripModel(){

  const Trip =
    mongoose.models.Trip ||
    global.Trip;

  if(!Trip){
    throw new Error(
      "Trip model is not ready"
    );
  }

  return Trip;
}

/* =========================
   BASIC HELPERS
========================= */

function text(v){
  return String(v ?? "").trim();
}

function lower(v){
  return text(v).toLowerCase();
}

function upper(v){
  return text(v).toUpperCase();
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n)
    ? n
    : 0;
}

function bool(v){
  return (
    v === true ||
    lower(v) === "true" ||
    lower(v) === "yes" ||
    lower(v) === "1"
  );
}

function normalizeStatus(v){

  return text(v)
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .toLowerCase();
}

function compactStatus(v){
  return normalizeStatus(v)
    .replace(/\s+/g,"");
}

function normalizeCode(v){
  return serviceIdentity.normalizeServiceCode(v);
}

function operationalCode(v){

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        v
      );

  if(
    ["ST","WH","SH","LM","TX","XL"]
      .includes(normalized)
  ){
    return normalized;
  }

  if(
    serviceIdentity
      .isCustomGate(
        normalized
      )
  ){
    return "";
  }

  const code =
    serviceIdentity
      .normalizeOperationalCode(
        v
      );

  return (
    code.length === 2
      ? code
      : ""
  );
}


/* =========================
   STATUS
========================= */

function isCompleted(status){
  const s = normalizeStatus(status);
  return s === "completed" || s === "complete";
}

function isCancelled(status){
  return normalizeStatus(status)
    .includes("cancel");
}

function isNoShow(status){
  const s = normalizeStatus(status);
  return (
    s.includes("no show") ||
    s.includes("noshow")
  );
}

function isScheduled(status){
  return normalizeStatus(status) === "scheduled";
}

function isConfirmed(status){
  return normalizeStatus(status) === "confirmed";
}

function parseTripDateTime(trip){

  if(
    !trip ||
    !trip.tripDate
  ){
    return null;
  }

  const date =
    text(trip.tripDate);

  const time =
    text(trip.tripTime) ||
    "00:00";

  let d =
    new Date(
      `${date}T${time}`
    );

  if(
    Number.isNaN(
      d.getTime()
    )
  ){
    d =
      new Date(
        `${date} ${time}`
      );
  }

  if(
    Number.isNaN(
      d.getTime()
    )
  ){
    return null;
  }

  return d;
}

function isNotCompleted(status,trip){

  const s =
    normalizeStatus(status);

  const c =
    compactStatus(status);

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return true;
  }

  if(
    isCompleted(status) ||
    isCancelled(status) ||
    isNoShow(status)
  ){
    return false;
  }

  if(
    !isScheduled(status) &&
    !isConfirmed(status)
  ){
    return false;
  }

  const dt =
    parseTripDateTime(trip);

  if(!dt){
    return false;
  }

  return (
    Date.now() -
    dt.getTime()
  ) >=
  10 * 60 * 60 * 1000;
}

function isClosedStatus(status,trip){

  return (
    isCompleted(status) ||
    isCancelled(status) ||
    isNoShow(status) ||
    isNotCompleted(status,trip)
  );
}

/* =========================
   SHARED
========================= */

function isSharedTrip(trip){

  return (
    trip?.isShared === true ||
    upper(trip?.tripType) === "SHARED" ||
    lower(trip?.type) === "shared" ||
    upper(trip?.tripNumber).includes("-SH") ||
    (
      Array.isArray(trip?.passengers) &&
      trip.passengers.length > 0
    )
  );
}

function passengerIsClosed(passenger,trip){

  return isClosedStatus(
    passenger?.status ||
    trip?.status ||
    "",
    trip
  );
}

function tripIsClosed(trip){

  if(!trip){
    return false;
  }

  if(isSharedTrip(trip)){

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    if(passengers.length){

      return passengers.some(
        passenger =>
          passengerIsClosed(
            passenger,
            trip
          )
      );
    }
  }

  return isClosedStatus(
    trip.status,
    trip
  );
}

/* =========================
   SOURCE
========================= */

function getFacilityName(trip){

  return text(
    trip?.facilityName ||
    trip?.organizationName ||
    trip?.customerCompany ||
    trip?.companyName ||
    trip?.company ||
    ""
  );
}

function getSourceCode(trip){

  const raw = [
    trip?.source,
    trip?.from,
    trip?.bookingSource,
    trip?.createdBy,
    trip?.type,
    trip?.tripType,
    trip?.reservationStatus,
    trip?.reservationType,
    trip?.sourceType,
    trip?.tripNumber,
    trip?.isReserved
      ? "reserved"
      : "",
    trip?.reserved
      ? "reserved"
      : "",
    trip?.reservationId
      ? "reserved"
      : ""
  ]
  .join(" ")
  .toLowerCase();

  if(
    raw.includes("reserved") ||
    raw.includes("reservation") ||
    upper(trip?.tripNumber)
      .startsWith("RV-")
  ){
    return "RV";
  }

  if(
    raw.includes("quote") ||
    raw.includes("gq") ||
    raw.includes("website") ||
    raw.includes("public") ||
    lower(trip?.type) === "individual"
  ){
    return "GQ";
  }

  if(getFacilityName(trip)){
    return "FACILITY";
  }

  if(
    raw.includes("company") ||
    raw.includes("facility") ||
    raw.includes("portal")
  ){
    return "FACILITY";
  }

  return "GQ";
}

/* =========================
   SERVICE
========================= */

function getServiceCodeFromService(service){

  return (
    serviceIdentity
      .getServiceOperationalCode(
        service
      )
  );
}

function getServiceCodeFromTrip(trip){

  const direct = [
    trip?.serviceCode,
    trip?.serviceKey,
    trip?.serviceSuffix,
    trip?.tripNumberSuffix,
    trip?.serviceType,
    trip?.vehicleTypeFromQuote
  ];

  for(const value of direct){

    const code =
      operationalCode(
        value
      );

    if(code){
      return code;
    }
  }

  const named = [
    trip?.serviceName,
    trip?.serviceTitle,
    trip?.service
  ];

  for(const value of named){

    const normalized =
      normalizeCode(
        value
      );

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(normalized)
    ){
      return normalized;
    }
  }

  const legacyVehicle =
    normalizeCode(
      trip?.vehicle
    );

  if(
    ["ST","WH","SH","LM","TX","XL"]
      .includes(legacyVehicle)
  ){
    return legacyVehicle;
  }

  const number =
    upper(
      trip?.tripNumber
    );

  const suffixMatch =
    number.match(
      /-([A-Z]{2})$/
    );

  if(suffixMatch?.[1]){
    return suffixMatch[1];
  }

  return "ST";
}

function getServiceNameFromTrip(
  trip,
  service
){

  const snapshot =
    text(
      trip?.serviceName ||
      trip?.serviceTitle
    );

  if(snapshot){
    return snapshot;
  }

  return (
    serviceIdentity
      .getServiceDisplayName(
        service
      ) ||
    getServiceCodeFromTrip(
      trip
    )
  );
}


/* =========================
   PRICING
========================= */

function servicePricing(
  service,
  source
){

  const s =
    service || {};

  if(source === "RV"){

    return {
      pricingMode:
        upper(
          s.reservedPricingMode ??
          s.pricingMode ??
          "MILE"
        ),

      baseFare:
        num(
          s.reservedBaseFare ??
          s.baseFare
        ),

      includedMiles:
        num(
          s.reservedIncludedMiles ??
          s.includedMiles
        ),

      perMile:
        num(
          s.reservedPerMile ??
          s.perMile
        ),

      hourlyRate:
        num(
          s.reservedHourlyRate ??
          s.hourlyRate
        ),

      hourlyBillingMode:
        upper(
          s.reservedHourlyBillingMode ??
          s.hourlyBillingMode ??
          "FULL"
        ),

      stopFee:
        num(
          s.reservedStopFee ??
          s.stopFee
        ),

      noShowFee:
        num(
          s.reservedNoShowFee ??
          s.noShowFee
        ),

      sharedPrice:
        num(
          s.reservedSharedPrice ??
          s.sharedPrice
        ),

      warningMinutes:
        num(
          s.reservedWarningMinutes ??
          s.warningMinutes
        ),

      cancelFee:
        num(
          s.reservedCancelFee ??
          s.cancelFee
        ),

      disableCancel:
        bool(
          s.reservedDisableCancel ??
          s.disableCancel
        )
    };
  }

  if(source === "FACILITY"){

    return {
      pricingMode:
        upper(
          s.companyPricingMode ??
          s.pricingMode ??
          "MILE"
        ),

      baseFare:
        num(
          s.companyBaseFare ??
          s.baseFare
        ),

      includedMiles:
        num(
          s.companyIncludedMiles ??
          s.includedMiles
        ),

      perMile:
        num(
          s.companyPerMile ??
          s.perMile
        ),

      hourlyRate:
        num(
          s.companyHourlyRate ??
          s.hourlyRate
        ),

      hourlyBillingMode:
        upper(
          s.companyHourlyBillingMode ??
          s.hourlyBillingMode ??
          "FULL"
        ),

      stopFee:
        num(
          s.companyStopFee ??
          s.stopFee
        ),

      noShowFee:
        num(
          s.companyNoShowFee ??
          s.noShowFee
        ),

      sharedPrice:
        num(
          s.companySharedPrice ??
          s.sharedPrice
        ),

      warningMinutes:
        num(
          s.companyWarningMinutes ??
          s.warningMinutes
        ),

      cancelFee:
        num(
          s.companyCancelFee ??
          s.cancelFee
        ),

      disableCancel:
        bool(
          s.companyDisableCancel ??
          s.disableCancel
        )
    };
  }

  /* GET QUOTE */
  return {
    pricingMode:
      upper(
        s.pricingMode ??
        "MILE"
      ),

    baseFare:
      num(s.baseFare),

    includedMiles:
      num(s.includedMiles),

    perMile:
      num(s.perMile),

    hourlyRate:
      num(s.hourlyRate),

    hourlyBillingMode:
      upper(
        s.hourlyBillingMode ??
        "FULL"
      ),

    stopFee:
      num(s.stopFee),

    noShowFee:
      num(s.noShowFee),

    sharedPrice:
      num(s.sharedPrice),

    warningMinutes:
      num(s.warningMinutes),

    cancelFee:
      num(s.cancelFee),

    disableCancel:
      bool(s.disableCancel)
  };
}

function overrideServicePricing(
  overrideService,
  fallback
){

  if(!overrideService){
    return fallback;
  }

  return {
    pricingMode:
      upper(
        overrideService.pricingMode ??
        fallback.pricingMode ??
        "MILE"
      ),

    baseFare:
      num(
        overrideService.baseFare ??
        fallback.baseFare
      ),

    includedMiles:
      num(
        overrideService.includedMiles ??
        fallback.includedMiles
      ),

    perMile:
      num(
        overrideService.perMile ??
        fallback.perMile
      ),

    hourlyRate:
      num(
        overrideService.hourlyRate ??
        fallback.hourlyRate
      ),

    hourlyBillingMode:
      upper(
        overrideService.hourlyBillingMode ??
        fallback.hourlyBillingMode ??
        "FULL"
      ),

    stopFee:
      num(
        overrideService.stopFee ??
        fallback.stopFee
      ),

    noShowFee:
      num(
        overrideService.noShowFee ??
        fallback.noShowFee
      ),

    sharedPrice:
      num(
        overrideService.sharedPrice ??
        fallback.sharedPrice
      ),

    warningMinutes:
      num(
        overrideService.warningMinutes ??
        fallback.warningMinutes
      ),

    cancelFee:
      num(
        overrideService.cancelFee ??
        fallback.cancelFee
      ),

    disableCancel:
      bool(
        overrideService.disableCancel ??
        fallback.disableCancel
      )
  };
}

/* =========================
   CACHE BUILDERS
========================= */

function buildServiceMap(services){

  const map =
    new Map();

  for(const service of services){

    const identity =
      serviceIdentity
        .resolveServiceIdentity(
          service
        );

    const identities = [
      service?._id,
      identity.operationalCode,
      identity.gateKey,
      service?.serviceKey,
      service?.serviceCode,
      service?.serviceType,
      service?.serviceSuffix,
      service?.suffix,
      service?.companySuffix,
      service?.reservedSuffix,
      service?.customServiceCode,
      ...serviceIdentity
        .getServiceMatchKeys(
          service
        )
    ];

    for(const rawIdentity of identities){

      if(!rawIdentity){
        continue;
      }

      const key =
        rawIdentity === service?._id
          ? text(rawIdentity)
          : (
              operationalCode(
                rawIdentity
              ) ||
              normalizeCode(
                rawIdentity
              )
            );

      if(
        key &&
        !map.has(key)
      ){
        map.set(
          key,
          service
        );
      }
    }
  }

  return map;
}

function normalizeFacilityKey(v){
  return lower(v);
}

function buildOverrideMaps(overrides){

  const byId =
    new Map();

  const byName =
    new Map();

  for(const override of overrides){

    if(override?.active !== true){
      continue;
    }

    const id =
      text(
        override.facilityId
      );

    const name =
      normalizeFacilityKey(
        override.facilityName ||
        override.companyName ||
        override.name
      );

    if(id){
      byId.set(
        id,
        override
      );
    }

    if(name){
      byName.set(
        name,
        override
      );
    }
  }

  return {
    byId,
    byName
  };
}

function findOverrideForTrip(
  trip,
  overrideMaps
){

  const possibleId =
    text(
      trip?.facilityId ||
      trip?.companyId ||
      trip?.organizationId ||
      trip?.customerCompanyId ||
      ""
    );

  if(
    possibleId &&
    overrideMaps.byId.has(
      possibleId
    )
  ){
    return overrideMaps.byId.get(
      possibleId
    );
  }

  const facilityName =
    normalizeFacilityKey(
      getFacilityName(trip)
    );

  if(
    facilityName &&
    overrideMaps.byName.has(
      facilityName
    )
  ){
    return overrideMaps.byName.get(
      facilityName
    );
  }

  return null;
}

function findOverrideService(
  override,
  serviceCode
){

  const rows =
    Array.isArray(
      override?.services
    )
      ? override.services
      : [];

  return (
    rows.find(row =>{

      const candidates = [
        row?.serviceKey,
        row?.serviceCode,
        row?.serviceType,
        row?.serviceSuffix,
        row?.suffix
      ];

      return candidates.some(
        value =>
          operationalCode(
            value
          ) === serviceCode
      );
    }) ||
    null
  );
}


/* =========================
   CANCELLATION SOURCE
========================= */

function getCancelSource(
  trip,
  passenger=null
){

  return upper(
    passenger?.cancelSource ||
    passenger?.cancellationSource ||
    trip?.cancelSource ||
    trip?.cancellationSource ||
    ""
  );
}

function isCustomerCancellation(
  trip,
  passenger=null
){

  const src =
    getCancelSource(
      trip,
      passenger
    );

  return (
    src === "CUSTOMER" ||
    src === "CLIENT" ||
    passenger?.customerCancelled === true ||
    trip?.customerCancelled === true
  );
}

function isExplicitOperatorCancellation(
  trip,
  passenger=null
){

  const src =
    getCancelSource(
      trip,
      passenger
    );

  return (
    src === "OPERATOR" ||
    src === "ADMIN" ||
    src === "DISPATCH" ||
    src === "DISPATCHER" ||
    src === "SYSTEM" ||
    passenger?.operatorCancelled === true ||
    trip?.operatorCancelled === true
  );
}

function firstPositiveMoney(...values){

  for(const value of values){

    if(
      value === undefined ||
      value === null ||
      text(value) === ""
    ){
      continue;
    }

    const amount =
      num(value);

    if(amount > 0){
      return amount;
    }
  }

  return 0;
}

/* =========================
   FINAL MONEY
========================= */

function completedAmount(
  trip,
  passenger=null
){

  if(passenger){

    return num(
      passenger.finalPrice ??
      passenger.priceAmount ??
      passenger.price ??
      0
    );
  }

  return num(
    trip?.finalPrice ??
    trip?.priceAmount ??
    trip?.totalPrice ??
    trip?.price ??
    0
  );
}

function isEndedAtStop(trip){

  return (
    trip?.endedAtStop === true ||
    upper(trip?.completionType) === "ENDED_AT_STOP" ||
    Boolean(trip?.stopEndAt) ||
    Boolean(trip?.stopExecution?.endedAt)
  );
}

function calculateEndedAtStopCharge(
  trip,
  pricing
){

  const savedFinal =
    firstPositiveMoney(
      trip?.finalPrice,
      trip?.priceAmount,
      trip?.summaryFinalAmount,
      trip?.stopExecution?.finalPrice
    );

  const stopCount = Math.max(
    1,
    Math.floor(
      num(
        trip?.stopEndIndex ??
        trip?.stopExecution?.stopIndex ??
        1
      )
    )
  );

  const stopFee =
    firstPositiveMoney(
      trip?.stopExecution?.stopFee,
      pricing?.stopFee,
      trip?.stopFee,
      trip?.companyStopFee
    );

  const savedStopTotal =
    firstPositiveMoney(
      trip?.stopFeeApplied,
      trip?.stopExecution?.stopTotal
    );

  const stopTotal =
    savedStopTotal > 0
      ? savedStopTotal
      : stopCount * stopFee;

  const mode = upper(
    pricing?.pricingMode ||
    trip?.pricingMode ||
    "MILE"
  );

  const miles = Math.max(
    0,
    num(
      trip?.stopEndMiles ??
      trip?.stopExecution?.miles ??
      0
    )
  );

  const minutes = Math.max(
    0,
    num(
      trip?.stopEndMinutes ??
      trip?.stopExecution?.minutes ??
      0
    )
  );

  let rideFare =
    firstPositiveMoney(
      trip?.stopExecution?.rideFare
    );

  if(rideFare <= 0 && mode === "HOURLY"){
    const initialMinutes = Math.max(
      0,
      num(pricing?.initialDurationMinutes)
    );

    const initialPrice = Math.max(
      0,
      num(pricing?.initialPrice)
    );

    const hourlyRate = Math.max(
      0,
      num(pricing?.hourlyRate)
    );

    const billingMode = upper(
      pricing?.hourlyBillingMode ||
      "FULL"
    );

    if(initialMinutes > 0){
      if(minutes <= initialMinutes){
        rideFare = initialPrice;
      }else{
        const extraMinutes =
          minutes - initialMinutes;

        const extraHours =
          billingMode === "QUARTER"
            ? Math.ceil(extraMinutes / 15) / 4
            : Math.ceil(extraMinutes / 60);

        rideFare =
          initialPrice +
          extraHours * hourlyRate;
      }
    }else{
      const hours =
        billingMode === "QUARTER"
          ? Math.max(1,Math.ceil(minutes / 15) / 4)
          : Math.max(1,Math.ceil(minutes / 60));

      rideFare = hours * hourlyRate;
    }
  }

  if(rideFare <= 0 && mode !== "HOURLY"){
    const baseFare = Math.max(
      0,
      num(pricing?.baseFare ?? trip?.baseFare)
    );

    const includedMiles = Math.max(
      0,
      num(
        pricing?.includedMiles ??
        trip?.includedMiles
      )
    );

    const perMile = Math.max(
      0,
      num(pricing?.perMile ?? trip?.perMile)
    );

    rideFare =
      baseFare +
      Math.max(0,miles - includedMiles) * perMile;
  }

  const calculatedFinal =
    rideFare + stopTotal;

  return {
    amount:
      savedFinal > 0
        ? savedFinal
        : Number(calculatedFinal.toFixed(2)),
    fee:Number(stopTotal.toFixed(2)),
    rideFare:Number(rideFare.toFixed(2)),
    miles:Number(miles.toFixed(2)),
    stopCount,
    stopFee:Number(stopFee.toFixed(2)),
    type:"ENDED_AT_STOP_FARE"
  };
}

function finalCharge(
  trip,
  pricing,
  passenger=null
){

  const status =
    normalizeStatus(
      passenger?.status ||
      trip?.status
    );

  if(
    status === "completed" ||
    status === "complete"
  ){

    if(!passenger && isEndedAtStop(trip)){
      return calculateEndedAtStopCharge(
        trip,
        pricing
      );
    }

    return {
      amount:
        completedAmount(
          trip,
          passenger
        ),
      fee:0,
      type:"COMPLETED_FARE"
    };
  }

  if(
    status.includes("no show") ||
    status.includes("noshow")
  ){

    const fee =
      firstPositiveMoney(
        passenger?.noShowFee,
        passenger?.finalChargeAmount,
        !passenger
          ? trip?.noShowFee
          : undefined,
        !passenger
          ? trip?.finalChargeAmount
          : undefined,
        pricing.noShowFee,
        trip?.noShowFee
      );

    return {
      amount:fee,
      fee,
      type:"NO_SHOW_FEE"
    };
  }

  if(status.includes("cancel")){

    /*
      Legacy cancelled trips often have no cancelSource at all.
      Missing source must not be treated as an operator cancellation.
      Only an explicit operator/admin/dispatch/system source is free.
    */
    if(
      isExplicitOperatorCancellation(
        trip,
        passenger
      )
    ){

      return {
        amount:0,
        fee:0,
        type:"OPERATOR_CANCEL_NO_FEE"
      };
    }

    const fee =
      firstPositiveMoney(
        passenger?.finalChargeAmount,
        passenger?.cancelFee,
        !passenger
          ? trip?.finalChargeAmount
          : undefined,
        !passenger
          ? trip?.cancelFee
          : undefined,
        pricing.cancelFee,
        trip?.cancelFee
      );

    return {
      amount:fee,
      fee,
      type:
        isCustomerCancellation(
          trip,
          passenger
        )
          ? "CANCELLATION_FEE"
          : "LEGACY_CANCELLATION_FEE"
    };
  }

  if(
    status === "not completed" ||
    status === "notcompleted" ||
    status.includes("not complete")
  ){

    return {
      amount:0,
      fee:0,
      type:"NOT_COMPLETED_NO_CHARGE"
    };
  }

  return {
    amount:0,
    fee:0,
    type:"NONE"
  };
}

/* =========================
   ENRICH ONE TRIP - MEMORY ONLY
========================= */

function enrichTrip(
  trip,
  serviceMap,
  overrideMaps
){

  const source =
    getSourceCode(trip);

  const serviceCode =
    getServiceCodeFromTrip(
      trip
    );

  const service =
    serviceMap.get(
      text(trip?.serviceId)
    ) ||
    serviceMap.get(serviceCode) ||
    null;

  let pricing =
    servicePricing(
      service,
      source
    );

  let pricingSource =
    source === "RV"
      ? "SERVICE_MANAGEMENT_RESERVED"
      : source === "FACILITY"
        ? "SERVICE_MANAGEMENT_FACILITY"
        : "SERVICE_MANAGEMENT_GET_QUOTE";

  let overrideActive =
    false;

  if(source === "FACILITY"){

    const override =
      findOverrideForTrip(
        trip,
        overrideMaps
      );

    if(
      override?.active === true
    ){

      const overrideService =
        findOverrideService(
          override,
          serviceCode
        );

      if(overrideService){

        pricing =
          overrideServicePricing(
            overrideService,
            pricing
          );

        pricingSource =
          "FACILITY_OVERRIDE";

        overrideActive =
          true;
      }
    }
  }

  trip.summaryPricingSource =
    pricingSource;

  trip.summarySource =
    source;

  trip.summaryServiceCode =
    serviceCode;

  trip.summaryServiceName =
    getServiceNameFromTrip(
      trip,
      service
    );

  trip.summaryServiceIdentity =
    text(
      trip?.serviceIdentity
    ) ||
    serviceIdentity
      .getServiceGateKey(
        service
      ) ||
    serviceCode;

  trip.summaryOverrideActive =
    overrideActive;

  trip.summaryResolvedPricing =
    pricing;

  if(isSharedTrip(trip)){

    const passengers =
      Array.isArray(
        trip.passengers
      )
        ? trip.passengers
        : [];

    trip.passengers =
      passengers.map(
        passenger => {

          if(
            !passengerIsClosed(
              passenger,
              trip
            )
          ){
            return passenger;
          }

          const charge =
            finalCharge(
              trip,
              pricing,
              passenger
            );

          return {
            ...passenger,

            summaryFee:
              charge.fee,

            summaryFinalAmount:
              charge.amount,

            summaryChargeType:
              charge.type,

            summaryPricingSource:
              pricingSource
          };
        }
      );

    trip.summaryFinalAmount =
      trip.passengers.reduce(
        (sum,passenger) =>
          sum +
          num(
            passenger
              .summaryFinalAmount
          ),
        0
      );

    trip.summaryFee =
      trip.passengers.reduce(
        (sum,passenger) =>
          sum +
          num(
            passenger
              .summaryFee
          ),
        0
      );

    return trip;
  }

  const charge =
    finalCharge(
      trip,
      pricing
    );

  trip.summaryFee =
    charge.fee;

  trip.summaryFinalAmount =
    charge.amount;

  trip.summaryChargeType =
    charge.type;

  if(charge.type === "ENDED_AT_STOP_FARE"){
    trip.summaryExecutedMiles =
      charge.miles;

    trip.summaryRideFare =
      charge.rideFare;

    trip.summaryStopCount =
      charge.stopCount;

    trip.summaryStopFee =
      charge.stopFee;

    trip.stopFeeApplied =
      charge.fee;
  }

  return trip;
}

/* =========================
   NORMALIZE COMPANY
========================= */

function normalizeTripCompany(trip){

  if(
    (
      !trip.company ||
      trip.company ===
        "Sunbeam Transportation"
    ) &&
    (
      trip.companyName ||
      trip.facilityName ||
      trip.organizationName ||
      trip.customerCompany
    )
  ){

    trip.company =
      trip.companyName ||
      trip.facilityName ||
      trip.organizationName ||
      trip.customerCompany;
  }

  return trip;
}

/* =========================
   SUMMARY ARCHIVE HELPERS
========================= */

async function querySummaryTripsForRange(
  req,
  rangeFilter,
  serviceMap,
  overrideMaps
){
  const Trip =
    getTripModel();

  const filter =
    tenantFilter(
      req,
      rangeFilter
    );

  let query =
    Trip.find(filter)
      .select({
    _id:1,
    tenantId:1,

    tripNumber:1,
    bookingNumber:1,
    attachmentImport:1,
    attachmentImportId:1,
    attachmentTemplateId:1,
    attachmentRowIndex:1,
    customerSignatureCaptured:1,
    customerSignatureAt:1,
    attachmentArchived:1,
    attachmentArchivedAt:1,
    tripDate:1,
    tripTime:1,
    pickupTime:1,
    bookedAt:1,
    bookingDate:1,
    bookingTime:1,
    createdAt:1,
    updatedAt:1,

    status:1,
    passengers:1,
    isShared:1,
    groupId:1,
    sharedGroupId:1,
    passengerIndex:1,

    tripType:1,
    type:1,
    source:1,
    from:1,
    bookingSource:1,
    createdBy:1,
    reservationStatus:1,
    reservationType:1,
    sourceType:1,
    isReserved:1,
    reserved:1,
    reservationId:1,

    brokerId:1,
    brokerName:1,
    brokerCode:1,
    externalSource:1,

    serviceId:1,
    service:1,
    serviceKey:1,
    serviceCode:1,
    serviceType:1,
    serviceIdentity:1,
    customServiceSlot:1,
    serviceSuffix:1,
    tripNumberSuffix:1,
    serviceName:1,
    serviceTitle:1,
    vehicleTypeFromQuote:1,
    vehicle:1,

    facilityId:1,
    companyId:1,
    organizationId:1,
    customerCompanyId:1,
    facilityName:1,
    organizationName:1,
    customerCompany:1,
    companyName:1,
    company:1,

    name:1,
    clientName:1,
    clientPhone:1,
    clientEmail:1,
    phone:1,
    email:1,
    passengerEmail:1,
    entryName:1,
    entryPhone:1,
    entryEmail:1,

    pickup:1,
    pickupAddress:1,
    dropoff:1,
    dropoffAddress:1,
    stops:1,
    stopAddresses:1,
    extraStops:1,

    notes:1,
    tripNotes:1,
    note:1,

    miles:1,
    distanceMiles:1,
    totalMiles:1,

    price:1,
    priceAmount:1,
    totalPrice:1,
    finalPrice:1,
    finalChargeAmount:1,
    cancelFee:1,
    noShowFee:1,

    pricingMode:1,
    baseFare:1,
    includedMiles:1,
    perMile:1,
    stopFee:1,
    companyStopFee:1,
    pricingSnapshot:1,
    priceSnapshot:1,

    endedAtStop:1,
    completionType:1,
    stopEndAt:1,
    stopEndIndex:1,
    stopEndMiles:1,
    stopEndMinutes:1,
    stopFeeApplied:1,
    stopExecution:1,

    cancelSource:1,
    cancellationSource:1,
    cancelledByRole:1,
    cancellationChargeable:1,
    customerCancelled:1,
    operatorCancelled:1,

    dispatchReviewConfirmed:1,
    dispatchReviewConfirmedAt:1,
    dispatchReviewFinalized:1,
    dispatchReviewFinalizedAt:1,
    dispatchFinalConfirmed:1,
    dispatchFinalConfirmedAt:1,
    finalStatusConfirmed:1,
    finalStatusConfirmedAt:1,
    sharedFinalConfirmed:1,
    sharedFinalConfirmedAt:1,
    adminSummaryReady:1,
    summaryReady:1,
    billingReady:1
  })
      .lean();

  if(filter && filter.tenantId){
    query =
      query.hint({
        tenantId:1,
        tripDate:-1,
        tripTime:-1
      });
  }

  const trips =
    await query;

  const closedTrips = [];

  for(const rawTrip of trips){
    const trip =
      normalizeTripCompany(
        rawTrip
      );

    if(!tripIsClosed(trip)){
      continue;
    }

    closedTrips.push(
      enrichTrip(
        trip,
        serviceMap,
        overrideMaps
      )
    );
  }

  return closedTrips;
}

async function upsertSummaryArchiveRows(
  req,
  rows
){
  if(!rows.length){
    return;
  }

  const tenantKey =
    summaryTenantKey(req);

  const ops =
    rows
      .filter(row=>row?._id)
      .map(row=>({
        updateOne:{
          filter:{
            tenantKey,
            sourceTripId:String(row._id)
          },
          update:{
            $set:{
              tripDate:String(row.tripDate || ""),
              payload:row,
              archivedAt:new Date()
            }
          },
          upsert:true
        }
      }));

  if(ops.length){
    await AdminSummaryArchive.bulkWrite(
      ops,
      {
        ordered:false
      }
    );
  }
}

async function rebuildSummaryHistory(
  req,
  todayKey,
  serviceMap,
  overrideMaps
){
  const tenantKey =
    summaryTenantKey(req);

  const rows =
    await querySummaryTripsForRange(
      req,
      {
        tripDate:{
          $lt:todayKey
        }
      },
      serviceMap,
      overrideMaps
    );

  await AdminSummaryArchive.deleteMany({
    tenantKey
  });

  await upsertSummaryArchiveRows(
    req,
    rows
  );

  await AdminSummaryArchiveState.findOneAndUpdate(
    {
      tenantKey
    },
    {
      $set:{
        cutoffDate:todayKey,
        updatedAt:new Date()
      }
    },
    {
      upsert:true,
      new:true,
      setDefaultsOnInsert:true
    }
  );

  summaryHistoryMemory.set(
    tenantKey,
    {
      day:todayKey,
      rows
    }
  );

  return rows;
}

async function syncSummaryHistory(
  req,
  todayKey,
  serviceMap,
  overrideMaps
){
  const tenantKey =
    summaryTenantKey(req);

  const memory =
    summaryHistoryMemory.get(
      tenantKey
    );

  if(
    memory &&
    memory.day === todayKey &&
    Array.isArray(memory.rows)
  ){
    return memory.rows;
  }

  const state =
    await AdminSummaryArchiveState.findOne({
      tenantKey
    }).lean();

  if(!state){
    return rebuildSummaryHistory(
      req,
      todayKey,
      serviceMap,
      overrideMaps
    );
  }

  const cutoff =
    String(
      state.cutoffDate ||
      ""
    ).trim();

  if(!cutoff){
    return rebuildSummaryHistory(
      req,
      todayKey,
      serviceMap,
      overrideMaps
    );
  }

  if(cutoff < todayKey){
    const deltaRows =
      await querySummaryTripsForRange(
        req,
        {
          tripDate:{
            $gte:cutoff,
            $lt:todayKey
          }
        },
        serviceMap,
        overrideMaps
      );

    await upsertSummaryArchiveRows(
      req,
      deltaRows
    );

    await AdminSummaryArchiveState.updateOne(
      {
        tenantKey
      },
      {
        $set:{
          cutoffDate:todayKey,
          updatedAt:new Date()
        }
      }
    );
  }else if(cutoff > todayKey){
    return rebuildSummaryHistory(
      req,
      todayKey,
      serviceMap,
      overrideMaps
    );
  }

  const archived =
    await AdminSummaryArchive.find({
      tenantKey
    })
      .select({
        _id:0,
        payload:1
      })
      .lean();

  const rows =
    archived
      .map(row=>row?.payload)
      .filter(Boolean);

  summaryHistoryMemory.set(
    tenantKey,
    {
      day:todayKey,
      rows
    }
  );

  return rows;
}

/* =========================
   BACKGROUND ARCHIVE WARMUP

   This is intentionally NOT an HTTP route.
   index.js calls it from archiveWarmupWorker after Mongo connects.

   Normal daily operation:
   - cutoffDate === todayKey -> zero Trip recalculation
   - cutoffDate < todayKey  -> calculate only the missing closed date range
   - missing state          -> one-time historical build
   - cutoffDate > todayKey  -> never delete/rebuild historical data here
========================= */

async function warmArchiveForTenant({
  tenantId,
  todayKey,
  timeZone
} = {}){
  const cleanTenantId =
    String(tenantId || "").trim();

  if(!cleanTenantId){
    return {
      success:false,
      skipped:true,
      reason:"TENANT_REQUIRED"
    };
  }

  if(timeZone){
    setArchiveTimeZone(timeZone);
  }

  const effectiveTodayKey =
    String(todayKey || "").trim() ||
    summaryDateKey();

  const req = {
    authUser:{
      role:"SUPER_ADMIN",
      tenantId:cleanTenantId
    },
    query:{},
    body:{}
  };

  const tenantKey =
    summaryTenantKey(req);

  const state =
    await AdminSummaryArchiveState
      .findOne({ tenantKey })
      .lean();

  const cutoff =
    String(
      state?.cutoffDate ||
      ""
    ).trim();

  /* Already current: do absolutely no historical recalculation. */
  if(cutoff === effectiveTodayKey){
    return {
      success:true,
      tenantId:cleanTenantId,
      todayKey:effectiveTodayKey,
      cutoffDate:cutoff,
      action:"CURRENT"
    };
  }

  /*
    If the configured timezone moved backwards, keep the archive intact.
    A daily warmup must never delete already archived work.
  */
  if(
    cutoff &&
    cutoff > effectiveTodayKey
  ){
    return {
      success:true,
      tenantId:cleanTenantId,
      todayKey:effectiveTodayKey,
      cutoffDate:cutoff,
      action:"SKIPPED_FUTURE_CUTOFF"
    };
  }

  const [
    services,
    activeOverrides
  ] = await Promise.all([
    Service.find(
      tenantFilter(req)
    ).lean(),

    FacilityPricingOverride
      .find(
        tenantFilter(
          req,
          { active:true }
        )
      )
      .lean()
  ]);

  const serviceMap =
    buildServiceMap(services);

  const overrideMaps =
    buildOverrideMaps(
      activeOverrides
    );

  if(!cutoff){
    const rows =
      await rebuildSummaryHistory(
        req,
        effectiveTodayKey,
        serviceMap,
        overrideMaps
      );

    summaryCache.delete(tenantKey);

    return {
      success:true,
      tenantId:cleanTenantId,
      todayKey:effectiveTodayKey,
      cutoffDate:effectiveTodayKey,
      action:"INITIAL_BUILD",
      rows:Array.isArray(rows)
        ? rows.length
        : 0
    };
  }

  const deltaRows =
    await querySummaryTripsForRange(
      req,
      {
        tripDate:{
          $gte:cutoff,
          $lt:effectiveTodayKey
        }
      },
      serviceMap,
      overrideMaps
    );

  await upsertSummaryArchiveRows(
    req,
    deltaRows
  );

  await AdminSummaryArchiveState
    .updateOne(
      { tenantKey },
      {
        $set:{
          cutoffDate:effectiveTodayKey,
          updatedAt:new Date()
        }
      }
    );

  /* Next page read can repopulate memory from the finished archive. */
  clearSummaryHistoryMemory(
    tenantKey
  );

  summaryCache.delete(tenantKey);

  return {
    success:true,
    tenantId:cleanTenantId,
    todayKey:effectiveTodayKey,
    previousCutoff:cutoff,
    cutoffDate:effectiveTodayKey,
    action:"APPEND_MISSING_DAYS",
    rows:Array.isArray(deltaRows)
      ? deltaRows.length
      : 0
  };
}

/* =========================
   FAST ADMIN DASHBOARD FEED

   Dashboard only needs a small projection of Trip fields.
   This endpoint intentionally does NOT run pricing/archive enrichment.
   It preserves tenant isolation and returns both normal + broker Trip rows
   because the dashboard separates those rows in the browser.
========================= */

router.get(
  "/dashboard",
  requireTenantApi,
  async (req,res)=>{

    try{

      const cacheKey =
        `dashboard:${summaryCacheKey(req)}`;

      const cached =
        summaryCache.get(cacheKey);

      if(
        cached &&
        (Date.now() - cached.at) <
          SUMMARY_CACHE_TTL_MS
      ){
        return res.json(
          cached.payload
        );
      }

      const Trip =
        getTripModel();

      /*
        IMPORTANT:
        Keep this projection aligned with public/admin/dashboard.js.
        Do not return large route, geocode, payment, stop-execution,
        notes, document or audit payloads that the dashboard never reads.
      */
      const projection = {
        _id:1,
        tenantId:1,

        tripNumber:1,
        tripDate:1,
        tripTime:1,

        status:1,
        tripStatus:1,
        finalStatus:1,
        dispatchStatus:1,

        createdAt:1,
        updatedAt:1,
        receivedAt:1,

        tripType:1,
        type:1,
        isShared:1,
        groupId:1,

        passengers:1,
        passengerCount:1,
        passengersCount:1,
        totalPassengers:1,

        serviceKey:1,
        serviceCode:1,
        serviceType:1,
        serviceIdentity:1,
        customServiceSlot:1,
        serviceSuffix:1,
        tripNumberSuffix:1,
        serviceName:1,
        serviceTitle:1,

        miles:1,
        distanceMiles:1,
        routeMiles:1,
        tripMiles:1,
        totalMiles:1,
        distance:1,
        sharedRouteMiles:1,

        priceAmount:1,
        finalPrice:1,
        groupTotal:1,
        capturedAmount:1,

        isFinalized:1,
        finalStatusConfirmed:1,
        finalStatusConfirmedAt:1,
        sharedFinalConfirmed:1,
        sharedFinalConfirmedAt:1,
        dispatchFinalConfirmedAt:1,

        refundAmount:1,
        refundedAmount:1,
        refunded:1,
        refundProcessed:1,
        refundStatus:1,
        paymentStatus:1,
        refundedAt:1,
        refundDateTime:1,
        refundProcessedAt:1,
        paymentRefundedAt:1,
        refundDate:1,

        externalSource:1,
        integrationSource:1,
        tripSource:1,
        sharedSource:1,
        routeSource:1,
        brokerCode:1,
        brokerName:1,
        brokerTripId:1,
        brokerStatus:1,

        source:1,
        bookingSource:1,
        createdBy:1,
        from:1,

        externalTripId:1,
        externalTripNumber:1,
        ghExternalTripNumber:1,
        externalStatus:1,
        rideStatus:1,

        serviceDate:1,
        appointmentDate:1,
        pickupDate:1,
        scheduledDate:1,
        date:1,
        rideDate:1,
        requestedDate:1
      };

      const trips =
        await Trip.find(
          tenantFilter(req)
        )
          .select(projection)
          .lean();

      const payload = {
        success:true,
        count:trips.length,
        trips,
        requestStats:{
          httpRequests:1,
          optimizedProjection:true,
          pricingEnrichment:false,
          archiveEnrichment:false
        }
      };

      summaryCache.set(
        cacheKey,
        {
          at:Date.now(),
          payload
        }
      );

      if(summaryCache.size > 100){
        const oldestKey =
          summaryCache.keys()
            .next()
            .value;

        if(oldestKey){
          summaryCache.delete(oldestKey);
        }
      }

      return res.json(payload);

    }catch(err){

      console.log(
        "ADMIN DASHBOARD FEED ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Failed to load admin dashboard",
        error:
          err.message
      });
    }
  }
);


/* =========================
   GET FAST SUMMARY BUNDLE
========================= */

router.get("/", requireTenantApi, async (req,res)=>{

  try{

    const cacheKey =
      summaryCacheKey(req);

    const cached =
      summaryCache.get(cacheKey);

    if(
      cached &&
      (Date.now() - cached.at) <
        SUMMARY_CACHE_TTL_MS
    ){
      return res.json(
        cached.payload
      );
    }

    /*
      Services and active facility overrides are small lookup tables.
      Historical rows already contain frozen Summary calculations.
      They are only needed to calculate today's/live rows and to archive
      a newly-finished day.
    */
    const [
      services,
      activeOverrides
    ] =
      await Promise.all([
        Service.find(
          tenantFilter(req)
        ).lean(),

        FacilityPricingOverride
          .find(
            tenantFilter(
              req,
              {
                active:true
              }
            )
          )
          .lean()
      ]);

    const serviceMap =
      buildServiceMap(
        services
      );

    const overrideMaps =
      buildOverrideMaps(
        activeOverrides
      );

    const todayKey =
      summaryDateKey();

    /*
      HISTORY + TODAY LIVE

      - Historical Summary rows are persisted in admin_summary_archive.
      - After the first build, old trips are not recalculated on every request.
      - On a new day, only the newly-finished day is appended to the archive.
      - Today's rows stay live.
    */
    const [
      historicalTrips,
      todayTrips
    ] =
      await Promise.all([
        syncSummaryHistory(
          req,
          todayKey,
          serviceMap,
          overrideMaps
        ),

        querySummaryTripsForRange(
          req,
          {
            tripDate:{
              $gte:todayKey
            }
          },
          serviceMap,
          overrideMaps
        )
      ]);

    const seen =
      new Set();

    const closedTrips =
      [
        ...todayTrips,
        ...historicalTrips
      ]
        .filter(trip=>{

          const id =
            String(
              trip?._id ||
              ""
            );

          if(!id){
            return true;
          }

          if(seen.has(id)){
            return false;
          }

          seen.add(id);
          return true;
        });

    const facilities =
      [
        ...new Set(
          closedTrips
            .filter(
              trip =>
                getSourceCode(trip) ===
                "FACILITY"
            )
            .map(
              getFacilityName
            )
            .filter(Boolean)
        )
      ]
      .sort(
        (a,b) =>
          a.localeCompare(b)
      );

    const payload = {
      success:true,

      count:
        closedTrips.length,

      trips:
        closedTrips,

      services,

      facilities,

      requestStats:{
        httpRequests:1,
        historicalArchive:true,
        liveWindow:"TODAY",
        perTripQueries:0
      }
    };

    summaryCache.set(
      cacheKey,
      {
        at:Date.now(),
        payload
      }
    );

    if(summaryCache.size > 100){
      const oldestKey =
        summaryCache.keys()
          .next()
          .value;

      if(oldestKey){
        summaryCache.delete(
          oldestKey
        );
      }
    }

    return res.json(payload);

  }catch(err){

    console.log(
      "ADMIN SUMMARY ARCHIVE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to load admin summary",
      error:
        err.message
    });
  }
});

router.setArchiveTimeZone =
  setArchiveTimeZone;

router.getArchiveDateKey =
  summaryDateKey;

router.warmArchiveForTenant =
  warmArchiveForTenant;

module.exports = router;