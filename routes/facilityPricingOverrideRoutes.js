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

const Tenant =
  mongoose.models.Tenant ||
  require("../models/Tenant");

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
   GET SERVICE CODE
========================= */

function getServiceCode(s){

  return (
    serviceIdentity
      .getServiceOperationalCode(
        s
      )
  );
}

/* =========================
   SERVICE NAME
========================= */

function getServiceName(s){

  return (
    serviceIdentity
      .getServiceDisplayName(
        s
      ) ||
    getServiceCode(s) ||
    "Service"
  );
}

function getServiceGate(s){

  return (
    serviceIdentity
      .getServiceGateKey(
        s
      )
  );
}

function isConfiguredCustomService(s){

  return (
    !serviceIdentity
      .isCustomService(s) ||
    serviceIdentity
      .isCustomServiceConfigured(s)
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
    operationalCode(
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

const BOOKING_HOUR_MODES = ["24_HOURS","CUSTOM","DISABLED"];

function safeBookingHourMode(value){
  const mode = upper(value || "24_HOURS");
  return BOOKING_HOUR_MODES.includes(mode)
    ? mode
    : "24_HOURS";
}

function safeBookingTime(value,fallback){
  const time = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ? time
    : fallback;
}

function normalizeBookingHourRule(rule){
  return {
    mode:safeBookingHourMode(rule?.mode),
    from:safeBookingTime(rule?.from,"00:00"),
    to:safeBookingTime(rule?.to,"23:59")
  };
}

function getFacilityOverrideBookingHours(s){
  return normalizeBookingHourRule(
    s?.bookingHours?.facilityOverride
  );
}

function serviceDefaultPricing(s){

  const serviceKey =
    getServiceCode(s);

  const shared =
    isSharedService(s);

  return {

    serviceKey,

    serviceName:
      getServiceName(s),

    serviceIdentity:
      getServiceGate(s),

    customSlot:
      serviceIdentity
        .getCustomSlot(
          s
        ),

    custom:
      serviceIdentity
        .isCustomService(
          s
        ),

    /*
      Facility service switch defaults ON for existing Service Management
      services. A saved Facility Override may explicitly turn it OFF.
    */
    facilityEnabled:
      true,

    serviceSuffix:
      operationalCode(
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
          ),

    bookingHours:{
      facilityOverride:getFacilityOverrideBookingHours(s)
    }
  };
}

/* =========================
   NORMALIZE INPUT
   FROM FRONTEND
========================= */

function normalizeServiceInput(s){

  const serviceKey =
    operationalCode(
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

    serviceIdentity:
      normalizeCode(
        s?.serviceIdentity ||
        s?.gateKey ||
        ""
      ),

    customSlot:
      Number(
        s?.customSlot ||
        0
      ),

    /*
      IMPORTANT:
      false is an explicit facility decision and must be preserved.
      Missing/legacy values remain enabled for backward compatibility.
    */
    facilityEnabled:
      s?.facilityEnabled !== false,

    serviceSuffix:
      operationalCode(
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

function allowedGateSet(values){

  return new Set(
    Array.isArray(values)
      ? values
          .map(
            serviceIdentity
              .normalizeServiceCode
          )
          .filter(Boolean)
      : []
  );
}

function serviceVisibleForTenant(
  service,
  tenantAllowed
){

  if(
    !service ||
    !serviceEnabled(service) ||
    !isConfiguredCustomService(service)
  ){
    return false;
  }

  const gate =
    getServiceGate(
      service
    );

  return (
    Boolean(gate) &&
    tenantAllowed.has(gate)
  );
}

function resolveFacilityAllowedOperationalCodes({
  facilityAllowedServices,
  tenantServices,
  tenantAllowed
}){

  const raw =
    Array.isArray(
      facilityAllowedServices
    )
      ? facilityAllowedServices
      : [];

  if(!raw.length){

    return new Set(
      tenantServices
        .filter(
          service =>
            serviceVisibleForTenant(
              service,
              tenantAllowed
            )
        )
        .map(
          service =>
            getServiceCode(
              service
            )
        )
        .filter(Boolean)
    );
  }

  const requested =
    new Set(
      raw
        .map(
          value =>
            String(value || "")
              .trim()
              .toUpperCase()
        )
        .filter(Boolean)
    );

  const result =
    new Set();

  for(const service of tenantServices){

    if(
      !serviceVisibleForTenant(
        service,
        tenantAllowed
      )
    ){
      continue;
    }

    const gate =
      getServiceGate(
        service
      );

    const operational =
      getServiceCode(
        service
      );

    const aliases =
      serviceIdentity
        .getServiceMatchKeys(
          service
        );

    const matched =
      requested.has(gate) ||
      requested.has(operational) ||
      aliases.some(
        alias =>
          requested.has(alias)
      );

    if(
      matched &&
      operational
    ){
      result.add(
        operational
      );
    }
  }

  return result;
}

function serviceByOperationalCode(
  services,
  code
){

  const target =
    operationalCode(
      code
    );

  if(!target){
    return null;
  }

  return (
    services.find(
      service =>
        getServiceCode(service) ===
        target
    ) ||
    null
  );
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

    if(!Tenant){

      return res.status(500).json({
        success:false,
        message:"Tenant model not loaded"
      });
    }

    /*
      Facility Pricing is tenant-scoped.

      SUPER_ADMIN / ADMIN:
      tenantId always comes from the verified JWT.

      PLATFORM_ADMIN:
      tenantId must be supplied explicitly.
    */

    const tenantId =
      tenantIdForWrite(req);

    if(!tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    if(
      !mongoose.Types.ObjectId.isValid(
        String(tenantId)
      )
    ){

      return res.status(400).json({
        success:false,
        message:"Invalid tenant id"
      });
    }

    const [
      tenant,
      users,
      services,
      overrides
    ] =
      await Promise.all([

        Tenant
          .findById(
            tenantId
          )
          .lean(),

        User
          .find({
            tenantId
          })
          .lean(),

        Service
          .find({
            tenantId
          })
          .lean(),

        FacilityPricingOverride
          .find({
            tenantId
          })
          .lean()

      ]);

    if(!tenant){

      return res.status(404).json({
        success:false,
        message:"Tenant not found"
      });
    }

    /*
      Platform Admin controls the services available
      to this tenant through Tenant.allowedServices.
    */

    const tenantAllowedSet =
      allowedGateSet(
        tenant.allowedServices
      );

    const tenantAllowedServices =
      [...tenantAllowedSet];

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

          /*
            Optional per-facility restriction.
            If empty, the frontend falls back to the
            tenant-level Platform Admin permissions.
          */
          allowedServices:
            [
              ...resolveFacilityAllowedOperationalCodes({
                facilityAllowedServices:
                  u.allowedServices,
                tenantServices:
                  services,
                tenantAllowed:
                  tenantAllowedSet
              })
            ]

        }))
        .filter(
          f=>f.name
        )
        .sort(
          (a,b)=>
            a.name.localeCompare(b.name)
        );

    /*
      Pricing defaults continue to come from
      Service Management for this same tenant.
    */

    const activeServices =
      services
        .filter(
          service =>
            serviceVisibleForTenant(
              service,
              tenantAllowedSet
            )
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

      tenant:{
        id:
          String(tenant._id),
        name:
          tenant.name || "",
        slug:
          tenant.slug || ""
      },

      tenantAllowedServices,

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

    const tenant =
      await Tenant.findById(
        tenantId
      )
      .lean();

    if(!tenant){

      return res.status(404).json({

        success:false,

        message:
          "Tenant not found"

      });
    }

    const tenantAllowedSet =
      allowedGateSet(
        tenant.allowedServices
      );

    const tenantServices =
      await Service
        .find({
          tenantId
        })
        .lean();

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

    const effectiveAllowedServices =
      resolveFacilityAllowedOperationalCodes({
        facilityAllowedServices:
          facilityUser.allowedServices,
        tenantServices,
        tenantAllowed:
          tenantAllowedSet
      });

    let invalidService = null;

    const normalizedServices = [];

    for(const inputService of services){

      const definition =
        serviceByOperationalCode(
          tenantServices,
          inputService.serviceKey
        );

      if(
        !definition ||
        !serviceVisibleForTenant(
          definition,
          tenantAllowedSet
        ) ||
        !effectiveAllowedServices.has(
          getServiceCode(
            definition
          )
        )
      ){
        invalidService =
          inputService;
        break;
      }

      const operational =
        getServiceCode(
          definition
        );

      normalizedServices.push({
        ...inputService,

        serviceKey:
          operational,

        serviceName:
          getServiceName(
            definition
          ),

        serviceSuffix:
          operational,

        serviceIdentity:
          getServiceGate(
            definition
          ),

        customSlot:
          serviceIdentity
            .getCustomSlot(
              definition
            )
      });
    }

    if(invalidService){

      return res.status(403).json({

        success:false,

        message:
          "Service is not enabled for this facility"

      });
    }

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
            services:
              normalizedServices,
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