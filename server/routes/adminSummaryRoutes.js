/* ==========================================================================
   ADMIN SUMMARY ROUTES - FAST BUNDLE
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

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const router = express.Router();

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

  const c =
    upper(v)
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(c === "STANDARD" || c === "ST") return "ST";
  if(c === "WHEELCHAIR" || c === "WHEEL CHAIR" || c === "WC" || c === "WH") return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";

  return c;
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

  return normalizeCode(
    service?.serviceKey ||
    service?.serviceCode ||
    service?.serviceType ||
    service?.serviceSuffix ||
    service?.suffix ||
    service?.companySuffix ||
    service?.reservedSuffix ||
    service?.key ||
    service?.code ||
    service?.title ||
    service?.name ||
    ""
  );
}

function getServiceCodeFromTrip(trip){

  const direct =
    normalizeCode(
      trip?.serviceKey ||
      trip?.serviceCode ||
      trip?.serviceType ||
      trip?.serviceSuffix ||
      trip?.vehicleTypeFromQuote ||
      trip?.vehicle ||
      ""
    );

  if(direct){
    return direct;
  }

  const number =
    upper(
      trip?.tripNumber
    );

  if(number.includes("-SH")) return "SH";
  if(number.includes("-XL")) return "XL";
  if(number.includes("-WH")) return "WH";
  if(number.includes("-TX")) return "TX";
  if(number.includes("-LM")) return "LM";
  if(number.includes("-ST")) return "ST";

  return "ST";
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

    const code =
      getServiceCodeFromService(
        service
      );

    if(
      code &&
      !map.has(code)
    ){
      map.set(
        code,
        service
      );
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
    rows.find(row =>
      normalizeCode(
        row?.serviceKey ||
        row?.serviceCode ||
        row?.serviceType ||
        row?.serviceSuffix ||
        row?.suffix ||
        ""
      ) === serviceCode
    ) ||
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
      num(
        passenger?.noShowFee ??
        pricing.noShowFee ??
        trip?.noShowFee ??
        0
      );

    return {
      amount:fee,
      fee,
      type:"NO_SHOW_FEE"
    };
  }

  if(status.includes("cancel")){

    if(
      !isCustomerCancellation(
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
      num(
        passenger?.finalChargeAmount ??
        passenger?.cancelFee ??
        (
          !passenger
            ? (
                trip?.finalChargeAmount ??
                trip?.cancelFee
              )
            : undefined
        ) ??
        pricing.cancelFee ??
        0
      );

    return {
      amount:fee,
      fee,
      type:"CANCELLATION_FEE"
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
      serviceCode
    ) ||
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
   GET FAST SUMMARY BUNDLE
========================= */

router.get("/", requireTenantApi, async (req,res)=>{

  try{

    const Trip =
      getTripModel();

    /*
      ONLY 3 DATABASE REQUESTS.
      They run at the same time.
    */
    const [
      trips,
      services,
      activeOverrides
    ] =
      await Promise.all([

        Trip.find(tenantFilter(req))
          .sort({
            tripDate:-1,
            tripTime:-1,
            bookedAt:-1,
            createdAt:-1
          })
          .lean(),

        Service.find(tenantFilter(req))
          .lean(),

        FacilityPricingOverride
          .find(
            tenantFilter(req,{
              active:true
            })
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

    /*
      Facility dropdown can be built from the same loaded trips.
      No /api/users request is needed from Summary.
    */
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

    return res.json({
      success:true,

      count:
        closedTrips.length,

      trips:
        closedTrips,

      /*
        Same HTTP response contains the data that the front-end needs
        to render service cards and facility filter.
      */
      services,

      facilities,

      requestStats:{
        httpRequests:1,
        mongoQueries:3,
        perTripQueries:0
      }
    });

  }catch(err){

    console.log(
      "ADMIN SUMMARY FAST ERROR:",
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

module.exports = router;