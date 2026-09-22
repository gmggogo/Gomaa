const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){
  const header =
    String(req.headers?.authorization || "").trim();

  if(!header.toLowerCase().startsWith("bearer ")){
    return "";
  }

  return header.slice(7).trim();
}

function requireTenantApi(req,res,next){

  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(token,JWT_SECRET);

    req.authUser = {
      id:verified.id || null,
      role:verified.role || "",
      tenantId:verified.tenantId || null
    };

    if(req.authUser.role === "PLATFORM_ADMIN"){
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

function tenantFilter(req,extra={}){

  if(req.authUser?.role === "PLATFORM_ADMIN"){

    const requestedTenantId =
      clean(req.query?.tenantId || req.body?.tenantId || "");

    if(requestedTenantId){
      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {...extra};
  }

  return {
    ...extra,
    tenantId:req.authUser.tenantId
  };
}

const Service =
  require("../models/Service");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const Tenant =
  require("../models/Tenant");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

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
  return serviceIdentity.normalizeServiceCode(v);
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function getUserModel(){
  return global.User || mongoose.models.User || null;
}

async function allowedServiceSet(req){

  const tenantId =
    req.authUser?.role === "PLATFORM_ADMIN"
      ? clean(
          req.query?.tenantId ||
          req.body?.tenantId ||
          ""
        )
      : clean(
          req.authUser?.tenantId ||
          ""
        );

  if(!tenantId){
    return new Set();
  }

  const tenant =
    await Tenant
      .findById(tenantId)
      .select({
        allowedServices:1
      })
      .lean();

  if(!tenant){
    return new Set();
  }

  return new Set(
    (
      Array.isArray(
        tenant.allowedServices
      )
        ? tenant.allowedServices
        : []
    )
    .map(
      serviceIdentity
        .normalizeServiceCode
    )
    .filter(Boolean)
  );
}

function serviceMatchesInput(
  service,
  input
){

  const raw =
    clean(input)
      .toUpperCase();

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        input
      );

  const gate =
    serviceIdentity
      .getServiceGateKey(
        service
      );

  const operational =
    serviceIdentity
      .getServiceOperationalCode(
        service
      );

  const aliases =
    serviceIdentity
      .getServiceMatchKeys(
        service
      );

  return (
    raw === gate ||
    normalized === gate ||
    raw === operational ||
    normalized === operational ||
    aliases.includes(raw) ||
    aliases.includes(normalized)
  );
}

function serviceAvailableForCompany(
  service,
  allowed
){

  if(!service){
    return false;
  }

  const gate =
    serviceIdentity
      .getServiceGateKey(
        service
      );

  if(
    !gate ||
    !allowed.has(gate)
  ){
    return false;
  }

  if(
    serviceIdentity
      .isCustomService(service) &&
    !serviceIdentity
      .isCustomServiceConfigured(service)
  ){
    return false;
  }

  return (
    service.companyEnabled === true
  );
}

async function resolveCompanyService(
  req,
  input
){

  const services =
    await Service
      .find(
        tenantFilter(req)
      )
      .lean();

  const allowed =
    await allowedServiceSet(req);

  return (
    services.find(
      service =>
        serviceMatchesInput(
          service,
          input
        ) &&
        serviceAvailableForCompany(
          service,
          allowed
        )
    ) ||
    null
  );
}

/* =========================
   SERVICE SEARCH
========================= */

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

  if(!s){
    return "";
  }

  const candidates = [
    s?.serviceKey,
    s?.serviceCode,
    s?.serviceType,
    s?.serviceSuffix,
    s?.suffix,
    s?.companySuffix,
    s?.reservedSuffix,
    s?.key,
    s?.code,
    s?.title,
    s?.name,
    s?.serviceName
  ];

  for(const value of candidates){

    const normalized =
      serviceIdentity
        .normalizeOperationalCode(
          value
        );

    if(
      normalized &&
      !serviceIdentity
        .isCustomGate(normalized)
    ){
      return normalized;
    }
  }

  return "";
}

function isOverrideServiceEnabled(s){

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
  company,
  req
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
    await User.findOne(
      tenantFilter(req,{
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
      })
    ).lean();

  return user?._id
    ? String(user._id)
    : "";
}

/* =========================
   PRICING FROM SERVICE MANAGEMENT
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
      serviceIdentity
        .getServiceOperationalCode(
          service
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

    initialDurationMinutes:
      n(
        service.companyInitialDurationMinutes ??
        service.initialDurationMinutes ??
        0
      ),

    initialPrice:
      n(
        service.companyInitialPrice ??
        service.initialPrice ??
        0
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

    addStopEnabled:
      bool(
        service.companyAddStopEnabled ??
        service.addStopEnabled ??
        false
      ),

    addStopCustomTimeEnabled:
      bool(
        service.companyAddStopCustomTimeEnabled ??
        service.addStopCustomTimeEnabled ??
        false
      ),

    addStopCutoffMinutes:
      n(
        service.companyAddStopCutoffMinutes ??
        service.addStopCutoffMinutes ??
        0
      ),

    rawService:
      service
  };
}

/* =========================
   PRICING FROM FACILITY OVERRIDE
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

    initialDurationMinutes:
      n(
        service.initialDurationMinutes ??
        service.companyInitialDurationMinutes ??
        0
      ),

    initialPrice:
      n(
        service.initialPrice ??
        service.companyInitialPrice ??
        0
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

    addStopEnabled:
      bool(
        service.addStopEnabled ??
        service.companyAddStopEnabled ??
        false
      ),

    addStopCustomTimeEnabled:
      bool(
        service.addStopCustomTimeEnabled ??
        service.companyAddStopCustomTimeEnabled ??
        false
      ),

    addStopCutoffMinutes:
      n(
        service.addStopCutoffMinutes ??
        service.companyAddStopCutoffMinutes ??
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
  company,
  req
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
    .findOne(
      tenantFilter(req,{
        active:true,
        $or:or
      })
    )
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
  company,
  req
}){

  /*
    Resolve Service Management FIRST.

    This makes Platform Admin's master gate authoritative.
    A Facility Pricing Override can change the price, but it
    cannot resurrect a disabled or unavailable service.
  */
  const service =
    await resolveCompanyService(
      req,
      serviceKey
    );

  if(!service){
    return {
      success:false,
      message:
        "Company Service Not Found Or Disabled: " +
        clean(serviceKey)
    };
  }

  const key =
    serviceIdentity
      .getServiceOperationalCode(
        service
      );

  if(!key){
    return {
      success:false,
      message:
        "Service Code Not Configured"
    };
  }

  const resolvedFacilityId =
    await resolveFacilityId({
      facilityId,
      company,
      req
    });

  /*
    1) Platform gate + Company enabled service are already validated.
    2) Active Facility Pricing Override can override that service's price.
    3) Otherwise Service Management company pricing is used.
  */
  const override =
    await findActiveFacilityOverride({
      facilityId:
        resolvedFacilityId ||
        facilityId,
      company,
      req
    });

  if(override){

    const overrideServices =
      Array.isArray(
        override.services
      )
        ? override.services
        : [];

    const overrideService =
      overrideServices.find(
        row =>
          getOverrideServiceCode(
            row
          ) === key
      );

    if(
      overrideService &&
      isOverrideServiceEnabled(
        overrideService
      )
    ){
      return {
        success:true,

        pricing:
          pricingFromFacilityOverride(
            overrideService
          ),

        resolvedService:
          service,

        serviceIdentity:
          serviceIdentity
            .resolveServiceIdentity(
              service
            ),

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
  }

  return {
    success:true,

    pricing:
      pricingFromServiceManagement(
        service
      ),

    resolvedService:
      service,

    serviceIdentity:
      serviceIdentity
        .resolveServiceIdentity(
          service
        ),

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

router.get("/", requireTenantApi, async (req,res)=>{

  try{

    const [
      services,
      allowed
    ] =
      await Promise.all([
        Service
          .find(
            tenantFilter(req)
          )
          .sort({
            createdAt:1
          })
          .lean(),

        allowedServiceSet(req)
      ]);

    const visible =
      services
        .filter(
          service =>
            serviceAvailableForCompany(
              service,
              allowed
            )
        )
        .map(
          service => ({
            ...service,
            serviceIdentity:
              serviceIdentity
                .getServiceGateKey(
                  service
                ),
            serviceCode:
              serviceIdentity
                .getServiceOperationalCode(
                  service
                ),
            serviceSuffix:
              serviceIdentity
                .getServiceOperationalCode(
                  service
                ),
            tripNumberSuffix:
              serviceIdentity
                .getServiceOperationalCode(
                  service
                )
          })
        );

    return res.json(visible);

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

router.post("/calculate", requireTenantApi, async (req,res)=>{

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
        company,
        req
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

    const initialDurationMinutes =
      Math.max(
        0,
        n(service.initialDurationMinutes)
      );

    const initialPrice =
      Math.max(
        0,
        n(service.initialPrice)
      );

    const resolvedServiceCode =
      serviceIdentity
        .getServiceOperationalCode(
          resolved.resolvedService ||
          service.rawService ||
          service
        );

    if(!resolvedServiceCode){

      return res.json({
        success:false,
        message:
          "Service Code Not Configured"
      });
    }

    let total = 0;

    /* =========================
       HOURLY
    ========================= */

    if(pricingMode === "HOURLY"){

      const hourlyBillingMode =
        upper(
          service.hourlyBillingMode ||
          "FULL"
        );

      const totalMinutes =
        Math.max(
          0,
          n(minutes)
        );

      /*
        LIMOUSINE INITIAL PACKAGE

        Example:
        Initial Duration = 90 minutes
        Initial Price    = $150
        Hourly Rate      = $100

        Up to 90 minutes = $150.
        After 90 minutes, extra time is billed
        by FULL or QUARTER.
      */

      if(
        resolvedServiceCode === "LM" &&
        initialDurationMinutes > 0
      ){

        if(totalMinutes <= initialDurationMinutes){

          total =
            initialPrice;

        }else{

          const extraMinutes =
            totalMinutes -
            initialDurationMinutes;

          let extraHours = 0;

          if(hourlyBillingMode === "QUARTER"){

            extraHours =
              Math.ceil(
                extraMinutes / 15
              ) / 4;

          }else{

            extraHours =
              Math.ceil(
                extraMinutes / 60
              );
          }

          total =
            initialPrice +
            (extraHours * hourlyRate);
        }

      }else{

        /*
          EXISTING HOURLY RULE
          Minimum first hour remains unchanged.
        */

        let hours = 1;

        if(hourlyBillingMode === "QUARTER"){

          hours =
            Math.max(
              1,
              Math.ceil(
                totalMinutes / 15
              ) / 4
            );

        }else{

          hours =
            Math.max(
              1,
              Math.ceil(
                totalMinutes / 60
              )
            );
        }

        total =
          hours *
          hourlyRate;
      }
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
       INDIVIDUAL / MILE
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

      serviceCode:
        resolvedServiceCode,

      serviceIdentity:
        resolved.serviceIdentity ||
        serviceIdentity
          .resolveServiceIdentity(
            resolved.resolvedService ||
            service.rawService ||
            service
          ),

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
        initialDurationMinutes,
        initialPrice,

        hourlyBillingMode:
          service.hourlyBillingMode,

        noShowFee:
          service.noShowFee,

        cancelFee:
          service.cancelFee,

        warningMinutes:
          service.warningMinutes,

        disableCancel:
          service.disableCancel,

        addStopEnabled:
          service.addStopEnabled,

        addStopCustomTimeEnabled:
          service.addStopCustomTimeEnabled,

        addStopCutoffMinutes:
          service.addStopCutoffMinutes
      },

      companyDisableCancel:
        Boolean(service.disableCancel),

      companyCancelFee:
        n(service.cancelFee,0),

      companyWarningMinutes:
        n(service.warningMinutes,0),

      companyAddStopEnabled:
        Boolean(service.addStopEnabled),

      companyAddStopCustomTimeEnabled:
        Boolean(service.addStopCustomTimeEnabled),

      companyAddStopCutoffMinutes:
        n(service.addStopCutoffMinutes,0),

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

router.put("/:idOrKey", requireTenantApi, async (req,res)=>{

  try{

    const idOrKey =
      clean(
        req.params.idOrKey
      );

    const filter =
      tenantFilter(
        req,
        buildServiceSearchFilter(
          idOrKey
        )
      );

    const current =
      await Service.findOne(
        filter
      );

    if(!current){

      return res.json({
        success:false,
        message:"Service Not Found"
      });
    }

    if(
      req.authUser?.role !==
      "PLATFORM_ADMIN"
    ){

      const allowed =
        await allowedServiceSet(req);

      const gate =
        serviceIdentity
          .getServiceGateKey(
            current
          );

      if(
        !gate ||
        !allowed.has(gate)
      ){

        return res.status(403).json({
          success:false,
          message:
            "This service is not enabled for this company"
        });
      }
    }

    const payload = {
      ...req.body
    };

    if(
      req.authUser?.role !==
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
    else{
      delete payload.tenantId;
    }

    /*
      Identity fields of a configured custom service are managed
      by /api/services/custom-slot/:slot, not by Company Core.
    */
    if(
      serviceIdentity
        .isCustomService(
          current
        )
    ){
      delete payload.customSlot;
      delete payload.customServiceCode;
      delete payload.serviceKey;
      delete payload.serviceCode;
      delete payload.serviceType;
      delete payload.companySuffix;
      delete payload.reservedSuffix;
    }

    const updated =
      await Service
        .findOneAndUpdate(
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
      service:updated,
      serviceIdentity:
        serviceIdentity
          .resolveServiceIdentity(
            updated
          )
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