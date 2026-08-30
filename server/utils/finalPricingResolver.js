"use strict";

const mongoose = require("mongoose");
const Service = require("../models/Service");
const FacilityPricingOverride = require("../models/FacilityPricingOverride");

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function n(v,fallback=0){
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function bool(v){
  return (
    v === true ||
    String(v).toLowerCase() === "true" ||
    String(v).toLowerCase() === "yes" ||
    String(v).toLowerCase() === "1"
  );
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
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


function getTenantId(trip){

  return clean(
    trip?.tenantId ||
    trip?.tenant?._id ||
    ""
  );
}

function getFacilityName(trip){

  return clean(
    trip?.facilityName ||
    trip?.organizationName ||
    trip?.customerCompany ||
    trip?.companyName ||
    trip?.company ||
    ""
  );
}

function resolveTripSource(trip){

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
    trip?.isReserved ? "reserved" : "",
    trip?.reserved ? "reserved" : "",
    trip?.reservationId ? "reserved" : ""
  ].join(" ").toLowerCase();

  if(
    raw.includes("reserved") ||
    raw.includes("reservation") ||
    String(trip?.tripNumber || "").toUpperCase().startsWith("RV-")
  ){
    return "RV";
  }

  if(
    raw.includes("quote") ||
    raw.includes("get quote") ||
    raw.includes("gq") ||
    raw.includes("website") ||
    raw.includes("public") ||
    String(trip?.type || "").toLowerCase() === "individual"
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

  const num =
    upper(trip?.tripNumber);

  if(num.includes("-SH")) return "SH";
  if(num.includes("-XL")) return "XL";
  if(num.includes("-WH")) return "WH";
  if(num.includes("-TX")) return "TX";
  if(num.includes("-LM")) return "LM";
  if(num.includes("-ST")) return "ST";

  return "ST";
}

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
    service?.serviceName ||
    ""
  );
}

async function findServiceForTrip(trip){

  const code =
    getServiceCodeFromTrip(trip);

  const tenantId =
    getTenantId(trip);

  if(!tenantId){
    return null;
  }

  const services =
    await Service.find({
      tenantId
    }).lean();

  return (
    services.find(s =>
      getServiceCodeFromService(s) === code
    ) ||
    null
  );
}

function servicePricingForSource(service,source){

  const s = service || {};

  if(source === "RV"){

    return {
      pricingMode:
        upper(
          s.reservedPricingMode ??
          s.pricingMode ??
          "MILE"
        ),

      baseFare:
        n(
          s.reservedBaseFare ??
          s.baseFare
        ),

      includedMiles:
        n(
          s.reservedIncludedMiles ??
          s.includedMiles
        ),

      perMile:
        n(
          s.reservedPerMile ??
          s.perMile
        ),

      hourlyRate:
        n(
          s.reservedHourlyRate ??
          s.hourlyRate
        ),

      hourlyBillingMode:
        upper(
          s.reservedHourlyBillingMode ??
          s.hourlyBillingMode ??
          "FULL"
        ),

      initialDurationMinutes:
        n(
          s.reservedInitialDurationMinutes ??
          s.initialDurationMinutes
        ),

      initialPrice:
        n(
          s.reservedInitialPrice ??
          s.initialPrice
        ),

      stopFee:
        n(
          s.reservedStopFee ??
          s.stopFee
        ),

      noShowFee:
        n(
          s.reservedNoShowFee ??
          s.noShowFee
        ),

      sharedPrice:
        n(
          s.reservedSharedPrice ??
          s.sharedPrice
        ),

      warningMinutes:
        n(
          s.reservedWarningMinutes ??
          s.warningMinutes,
          120
        ),

      cancelFee:
        n(
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
        n(
          s.companyBaseFare ??
          s.baseFare
        ),

      includedMiles:
        n(
          s.companyIncludedMiles ??
          s.includedMiles
        ),

      perMile:
        n(
          s.companyPerMile ??
          s.perMile
        ),

      hourlyRate:
        n(
          s.companyHourlyRate ??
          s.hourlyRate
        ),

      hourlyBillingMode:
        upper(
          s.companyHourlyBillingMode ??
          s.hourlyBillingMode ??
          "FULL"
        ),

      initialDurationMinutes:
        n(
          s.companyInitialDurationMinutes ??
          s.initialDurationMinutes
        ),

      initialPrice:
        n(
          s.companyInitialPrice ??
          s.initialPrice
        ),

      stopFee:
        n(
          s.companyStopFee ??
          s.stopFee
        ),

      noShowFee:
        n(
          s.companyNoShowFee ??
          s.noShowFee
        ),

      sharedPrice:
        n(
          s.companySharedPrice ??
          s.sharedPrice
        ),

      warningMinutes:
        n(
          s.companyWarningMinutes ??
          s.warningMinutes,
          120
        ),

      cancelFee:
        n(
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

    baseFare:n(s.baseFare),
    includedMiles:n(s.includedMiles),
    perMile:n(s.perMile),
    hourlyRate:n(s.hourlyRate),

    hourlyBillingMode:
      upper(
        s.hourlyBillingMode ??
        "FULL"
      ),

    initialDurationMinutes:n(s.initialDurationMinutes),
    initialPrice:n(s.initialPrice),

    stopFee:n(s.stopFee),
    noShowFee:n(s.noShowFee),
    sharedPrice:n(s.sharedPrice),

    warningMinutes:
      n(
        s.warningMinutes,
        120
      ),

    cancelFee:n(s.cancelFee),
    disableCancel:bool(s.disableCancel)
  };
}

async function findFacilityOverride(trip){

  const facilityName =
    getFacilityName(trip);

  const possibleId =
    clean(
      trip?.facilityId ||
      trip?.companyId ||
      trip?.organizationId ||
      trip?.customerCompanyId ||
      ""
    );

  const or = [];

  if(
    possibleId &&
    mongoose.Types.ObjectId.isValid(possibleId)
  ){
    or.push({
      facilityId:
        new mongoose.Types.ObjectId(possibleId)
    });

    or.push({
      facilityId:possibleId
    });
  }

  if(facilityName){
    const rx =
      new RegExp(
        "^" +
        escapeRegex(facilityName) +
        "$",
        "i"
      );

    or.push({facilityName:rx});
    or.push({companyName:rx});
    or.push({name:rx});
  }

  if(!or.length){
    return null;
  }

  try{

    const tenantId =
      getTenantId(trip);

    if(!tenantId){
      return null;
    }

    return await FacilityPricingOverride
      .findOne({
        tenantId,
        active:true,
        $or:or
      })
      .lean();

  }catch(err){

    /*
      If the model has a strict ObjectId facilityId and an old string query
      cannot be cast, retry by facility name only.
    */
    if(!facilityName){
      return null;
    }

    const rx =
      new RegExp(
        "^" +
        escapeRegex(facilityName) +
        "$",
        "i"
      );

    const tenantId =
      getTenantId(trip);

    if(!tenantId){
      return null;
    }

    return await FacilityPricingOverride
      .findOne({
        tenantId,
        active:true,
        $or:[
          {facilityName:rx},
          {companyName:rx},
          {name:rx}
        ]
      })
      .lean()
      .catch(()=>null);
  }
}

function findOverrideService(override,serviceCode){

  const code =
    normalizeCode(serviceCode);

  const list =
    Array.isArray(override?.services)
      ? override.services
      : [];

  return (
    list.find(s =>
      normalizeCode(
        s?.serviceKey ||
        s?.serviceCode ||
        s?.serviceType ||
        s?.serviceSuffix ||
        s?.suffix ||
        s?.name ||
        ""
      ) === code
    ) ||
    null
  );
}

function overridePricing(service,base){

  if(!service){
    return base;
  }

  return {
    pricingMode:
      upper(
        service.pricingMode ??
        base.pricingMode ??
        "MILE"
      ),

    baseFare:
      n(
        service.baseFare ??
        base.baseFare
      ),

    includedMiles:
      n(
        service.includedMiles ??
        base.includedMiles
      ),

    perMile:
      n(
        service.perMile ??
        base.perMile
      ),

    hourlyRate:
      n(
        service.hourlyRate ??
        base.hourlyRate
      ),

    hourlyBillingMode:
      upper(
        service.hourlyBillingMode ??
        base.hourlyBillingMode ??
        "FULL"
      ),

    initialDurationMinutes:
      n(
        service.initialDurationMinutes ??
        base.initialDurationMinutes
      ),

    initialPrice:
      n(
        service.initialPrice ??
        base.initialPrice
      ),

    stopFee:
      n(
        service.stopFee ??
        base.stopFee
      ),

    noShowFee:
      n(
        service.noShowFee ??
        base.noShowFee
      ),

    sharedPrice:
      n(
        service.sharedPrice ??
        base.sharedPrice
      ),

    warningMinutes:
      n(
        service.warningMinutes ??
        base.warningMinutes,
        120
      ),

    cancelFee:
      n(
        service.cancelFee ??
        base.cancelFee
      ),

    disableCancel:
      bool(
        service.disableCancel ??
        base.disableCancel
      )
  };
}

async function resolveTripPricing(trip){

  const source =
    resolveTripSource(trip);

  const serviceCode =
    getServiceCodeFromTrip(trip);

  const service =
    await findServiceForTrip(trip);

  const defaultPricing =
    servicePricingForSource(
      service,
      source
    );

  if(source !== "FACILITY"){

    return {
      source,
      serviceCode,
      facilityName:"",
      overrideActive:false,
      pricingSource:
        source === "RV"
          ? "SERVICE_MANAGEMENT_RESERVED"
          : "SERVICE_MANAGEMENT_GET_QUOTE",
      service,
      pricing:defaultPricing
    };
  }

  const facilityName =
    getFacilityName(trip);

  const override =
    await findFacilityOverride(trip);

  const overrideService =
    override
      ? findOverrideService(
          override,
          serviceCode
        )
      : null;

  if(
    override?.active === true &&
    overrideService
  ){

    return {
      source,
      serviceCode,
      facilityName,
      overrideActive:true,
      pricingSource:"FACILITY_OVERRIDE",
      service,
      override,
      overrideService,
      pricing:
        overridePricing(
          overrideService,
          defaultPricing
        )
    };
  }

  return {
    source,
    serviceCode,
    facilityName,
    overrideActive:false,
    pricingSource:"SERVICE_MANAGEMENT_FACILITY",
    service,
    override,
    overrideService:null,
    pricing:defaultPricing
  };
}

function normalizeStatus(v){

  return clean(v)
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .toLowerCase();
}

function getCancelSource(trip,passenger=null){

  return upper(
    passenger?.cancelSource ||
    passenger?.cancellationSource ||
    trip?.cancelSource ||
    trip?.cancellationSource ||
    ""
  );
}

function isCustomerCancellation(trip,passenger=null){

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

function getCompletedAmount(trip,passenger=null){

  if(passenger){

    return n(
      passenger.finalPrice ??
      passenger.priceAmount ??
      passenger.price ??
      0
    );
  }

  return n(
    trip?.finalPrice ??
    trip?.priceAmount ??
    trip?.totalPrice ??
    trip?.price ??
    0
  );
}

function resolveFinalChargeAmount({
  trip,
  passenger=null,
  pricingResult
}){

  const status =
    normalizeStatus(
      passenger?.status ||
      trip?.status
    );

  const pricing =
    pricingResult?.pricing ||
    {};

  if(
    status === "completed" ||
    status === "complete"
  ){
    return {
      amount:getCompletedAmount(trip,passenger),
      fee:0,
      type:"COMPLETED_FARE"
    };
  }

  if(
    status.includes("no show") ||
    status.includes("noshow")
  ){
    const fee =
      n(
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

    /*
      Customer cancellation fee is determined at cancellation time because
      the warning window matters. If finalChargeAmount was already stored,
      keep it. Otherwise use the stored trip/passenger cancelFee, then policy.
    */
    let fee;

    if(
      passenger &&
      passenger.finalChargeAmount !== undefined &&
      passenger.finalChargeAmount !== null
    ){
      fee =
        n(passenger.finalChargeAmount);
    }else if(
      !passenger &&
      trip?.finalChargeAmount !== undefined &&
      trip?.finalChargeAmount !== null &&
      upper(trip?.finalChargeType) === "CANCELLATION_FEE"
    ){
      fee =
        n(trip.finalChargeAmount);
    }else if(
      passenger &&
      passenger.cancelFee !== undefined &&
      passenger.cancelFee !== null
    ){
      fee =
        n(passenger.cancelFee);
    }else if(
      trip?.cancelFee !== undefined &&
      trip?.cancelFee !== null
    ){
      fee =
        n(trip.cancelFee);
    }else{
      fee =
        n(pricing.cancelFee);
    }

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

async function resolveTripFinancials(trip){

  const pricingResult =
    await resolveTripPricing(trip);

  const finalCharge =
    resolveFinalChargeAmount({
      trip,
      pricingResult
    });

  return {
    ...pricingResult,
    finalCharge
  };
}

module.exports = {
  clean,
  n,
  bool,
  normalizeCode,
  resolveTripSource,
  getFacilityName,
  getServiceCodeFromTrip,
  resolveTripPricing,
  resolveTripFinancials,
  resolveFinalChargeAmount,
  getCancelSource,
  isCustomerCancellation
};