"use strict";

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const router = express.Router();

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

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   AUTH
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function bool(value){
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "yes" ||
    String(value) === "1"
  );
}

function num(value){
  const result = Number(value);
  return Number.isFinite(result)
    ? result
    : 0;
}

function escapeRegex(value){
  return clean(value)
    .replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function readBearerToken(req){

  const header =
    clean(
      req.headers?.authorization
    );

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

function requireTenantApi(req,res,next){

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

function tenantIdForRequest(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){
    return clean(
      req.query?.tenantId ||
      req.body?.tenantId
    );
  }

  return clean(
    req.authUser?.tenantId
  );
}

function tenantFilter(req,extra={}){

  const tenantId =
    tenantIdForRequest(req);

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN" &&
    !tenantId
  ){
    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId
  };
}

/* =========================
   SERVICE HELPERS
========================= */

function normalizeCode(value){

  const c =
    upper(value)
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c){
    return "";
  }

  if(
    c === "ST" ||
    c === "STANDARD" ||
    c.includes("STANDARD")
  ){
    return "ST";
  }

  if(
    c === "WH" ||
    c === "WC" ||
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c.includes("WHEELCHAIR") ||
    c.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  if(
    c === "SH" ||
    c === "SHARED" ||
    c === "SHARE" ||
    c.includes("SHARED")
  ){
    return "SH";
  }

  if(
    c === "LM" ||
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c.includes("LIMOUSINE") ||
    c.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(
    c === "TX" ||
    c === "TAXI" ||
    c.includes("TAXI")
  ){
    return "TX";
  }

  if(
    c === "XL" ||
    c === "XL SERVICE" ||
    c.startsWith("XL ")
  ){
    return "XL";
  }

  return c;
}

function getServiceCode(service){

  const candidates = [
    service?.serviceKey,
    service?.key,
    service?.code,
    service?.serviceCode,
    service?.serviceType,
    service?.companySuffix,
    service?.suffix,
    service?.serviceSuffix,
    service?.title,
    service?.name,
    service?.serviceName
  ];

  for(const value of candidates){

    const code =
      normalizeCode(value);

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(code)
    ){
      return code;
    }
  }

  for(const value of candidates){

    if(clean(value)){
      return normalizeCode(value);
    }
  }

  return "";
}

function getServiceName(service){

  return (
    service?.title ||
    service?.name ||
    service?.serviceName ||
    getServiceCode(service) ||
    "Service"
  );
}

function serviceEnabled(service){

  const companyEnabled =
    service?.companyEnabled;

  const enabled =
    service?.enabled;

  return (
    bool(companyEnabled) ||
    bool(enabled)
  );
}

function isSharedService(service){

  const key =
    getServiceCode(service);

  const title =
    upper(
      service?.title ||
      service?.name ||
      service?.serviceName
    );

  const pricing =
    upper(
      service?.companyPricingMode ||
      service?.pricingMode
    );

  return (
    service?.companyShared === true ||
    service?.shared === true ||
    key === "SH" ||
    title.includes("SHARED") ||
    pricing === "SHARED"
  );
}

function serviceDefaultPricing(service){

  const serviceKey =
    getServiceCode(service);

  const shared =
    isSharedService(service);

  return {
    serviceKey,

    serviceName:
      getServiceName(service),

    serviceSuffix:
      normalizeCode(
        service?.companySuffix ||
        service?.suffix ||
        service?.serviceSuffix ||
        serviceKey
      ) || serviceKey,

    shared,

    pricingMode:
      upper(
        service?.companyPricingMode ||
        service?.pricingMode ||
        "MILE"
      ),

    baseFare:
      num(
        service?.companyBaseFare ??
        service?.baseFare
      ),

    includedMiles:
      num(
        service?.companyIncludedMiles ??
        service?.includedMiles
      ),

    perMile:
      num(
        service?.companyPerMile ??
        service?.perMile
      ),

    hourlyRate:
      num(
        service?.companyHourlyRate ??
        service?.hourlyRate
      ),

    hourlyBillingMode:
      upper(
        service?.companyHourlyBillingMode ||
        service?.hourlyBillingMode ||
        "FULL"
      ),

    initialDurationMinutes:
      num(
        service?.companyInitialDurationMinutes ??
        service?.initialDurationMinutes
      ),

    initialPrice:
      num(
        service?.companyInitialPrice ??
        service?.initialPrice
      ),

    stopFee:
      num(
        service?.companyStopFee ??
        service?.stopFee
      ),

    noShowFee:
      num(
        service?.companyNoShowFee ??
        service?.noShowFee
      ),

    sharedPrice:
      num(
        service?.companySharedPrice ??
        service?.sharedPrice
      ),

    disableCancel:
      bool(
        service?.companyDisableCancel ??
        service?.disableCancel
      ),

    warningMinutes:
      num(
        service?.companyWarningMinutes ??
        service?.warningMinutes
      ),

    cancelFee:
      num(
        service?.companyCancelFee ??
        service?.cancelFee
      ),

    addStopEnabled:
      shared
        ? false
        : bool(
            service?.companyAddStopEnabled ??
            service?.addStopEnabled
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            service?.companyAddStopCustomTimeEnabled ??
            service?.addStopCustomTimeEnabled
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : num(
            service?.companyAddStopCutoffMinutes ??
            service?.addStopCutoffMinutes
          )
  };
}

function normalizeServiceInput(service){

  const serviceKey =
    normalizeCode(
      service?.serviceKey ||
      service?.serviceCode ||
      service?.serviceType ||
      service?.serviceSuffix ||
      service?.suffix ||
      service?.serviceName
    );

  const pricingMode =
    upper(
      service?.pricingMode ||
      "MILE"
    );

  const shared =
    bool(service?.shared) ||
    pricingMode === "SHARED" ||
    serviceKey === "SH";

  return {
    serviceKey,

    serviceName:
      clean(
        service?.serviceName
      ),

    serviceSuffix:
      normalizeCode(
        service?.serviceSuffix ||
        service?.suffix ||
        serviceKey
      ) || serviceKey,

    shared,

    pricingMode:
      shared
        ? "SHARED"
        : pricingMode,

    baseFare:
      num(service?.baseFare),

    includedMiles:
      num(service?.includedMiles),

    perMile:
      num(service?.perMile),

    hourlyRate:
      num(service?.hourlyRate),

    hourlyBillingMode:
      upper(
        service?.hourlyBillingMode ||
        "FULL"
      ),

    initialDurationMinutes:
      num(
        service?.initialDurationMinutes
      ),

    initialPrice:
      num(service?.initialPrice),

    stopFee:
      num(service?.stopFee),

    noShowFee:
      num(service?.noShowFee),

    sharedPrice:
      num(service?.sharedPrice),

    disableCancel:
      bool(service?.disableCancel),

    warningMinutes:
      num(service?.warningMinutes),

    cancelFee:
      num(service?.cancelFee),

    addStopEnabled:
      shared
        ? false
        : bool(
            service?.addStopEnabled
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            service?.addStopCustomTimeEnabled
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : num(
            service?.addStopCutoffMinutes
          )
  };
}

/* =========================
   TENANT SERVICE DOCUMENTS
========================= */

function plainServiceCopy(service){

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

function defaultTenantService(code){

  const key =
    normalizeCode(code);

  const titles = {
    ST:"Standard",
    WH:"Wheelchair",
    SH:"Shared",
    LM:"Limousine",
    TX:"Taxi",
    XL:"XL"
  };

  const pricingMode =
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

    enabled:true,
    companyEnabled:true,
    reservedEnabled:false,

    companySuffix:key,
    companyShared:
      key === "SH",
    companyPricingMode:
      pricingMode,

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
    companyAddStopCutoffMinutes:0
  };
}

async function findServiceTemplate(code){

  const key =
    normalizeCode(code);

  const candidates =
    await Service.find({
      $or:[
        { tenantId:null },
        {
          tenantId:{
            $exists:false
          }
        }
      ]
    })
    .sort({
      createdAt:1
    })
    .lean();

  return (
    candidates.find(
      service =>
        getServiceCode(service) ===
        key
    ) ||
    null
  );
}

async function ensureTenantServiceDocuments(
  tenantId,
  allowedServices
){

  if(
    !tenantId ||
    !Array.isArray(
      allowedServices
    ) ||
    !allowedServices.length
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
        .map(getServiceCode)
        .filter(Boolean)
    );

  for(
    const rawCode
    of allowedServices
  ){

    const code =
      normalizeCode(
        rawCode
      );

    if(
      !code ||
      existingCodes.has(code)
    ){
      continue;
    }

    const template =
      await findServiceTemplate(
        code
      );

    const payload =
      template
        ? plainServiceCopy(
            template
          )
        : defaultTenantService(
            code
          );

    payload.tenantId =
      tenantId;

    payload.serviceKey =
      code;

    payload.companySuffix =
      code;

    payload.enabled =
      payload.enabled !== false;

    payload.companyEnabled =
      payload.companyEnabled !== false;

    if(code === "SH"){

      payload.companyShared =
        true;

      payload.companyPricingMode =
        "SHARED";
    }

    try{

      await Service.create(
        payload
      );

    }catch(err){

      if(err?.code !== 11000){
        throw err;
      }
    }

    existingCodes.add(
      code
    );
  }
}

/* =========================
   FACILITY HELPERS
========================= */

function getFacilityName(user){

  return clean(
    user?.facilityName ||
    user?.organizationName ||
    user?.companyName ||
    user?.company ||
    user?.name ||
    user?.fullName ||
    user?.username
  );
}

function isFacilityUser(user){

  const role =
    clean(
      user?.role ||
      user?.type
    ).toLowerCase();

  return (
    role === "company" ||
    role === "facility" ||
    role.includes("company") ||
    role.includes("facility")
  );
}

async function getTenantAllowedServices(
  tenantId
){

  if(!tenantId){
    return [];
  }

  const tenant =
    await Tenant.findById(
      tenantId
    )
    .select({
      allowedServices:1
    })
    .lean();

  if(!tenant){
    return [];
  }

  return Array.isArray(
    tenant.allowedServices
  )
    ? [
        ...new Set(
          tenant.allowedServices
            .map(normalizeCode)
            .filter(Boolean)
        )
      ]
    : [];
}

async function findOverrideByIdOrName({
  facilityId,
  facilityName,
  activeOnly=false,
  req
}){

  const or = [];

  if(
    facilityId &&
    mongoose.Types.ObjectId.isValid(
      facilityId
    )
  ){
    or.push({
      facilityId
    });
  }

  if(facilityName){

    or.push({
      facilityName:
        new RegExp(
          "^" +
          escapeRegex(facilityName) +
          "$",
          "i"
        )
    });
  }

  if(!or.length){
    return null;
  }

  const filter = {
    $or:or
  };

  if(activeOnly){
    filter.active = true;
  }

  return FacilityPricingOverride
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

router.get(
  "/bootstrap",
  requireTenantApi,
  async (req,res)=>{

    try{

      const tenantId =
        tenantIdForRequest(req);

      if(!tenantId){

        return res.status(403).json({
          success:false,
          message:"Tenant Required"
        });
      }

      const allowedServices =
        await getTenantAllowedServices(
          tenantId
        );

      const allowedSet =
        new Set(
          allowedServices
        );

      await ensureTenantServiceDocuments(
        tenantId,
        allowedServices
      );

      const [
        users,
        services,
        overrides
      ] =
        await Promise.all([

          User.find({
            tenantId
          }).lean(),

          /*
            Service Management is tenant-owned in the current SaaS build.
            Facility Pricing must read the same tenant service documents
            used by /api/services/admin.
          */
          Service.find({
            tenantId
          }).lean(),

          FacilityPricingOverride
            .find({
              tenantId
            })
            .lean()
        ]);

      const facilities =
        users
          .filter(isFacilityUser)
          .map(user=>({
            _id:
              String(user._id),

            name:
              getFacilityName(user),

            email:
              user.email || "",

            username:
              user.username || "",

            /*
              Platform Admin controls the services available
              to every facility inside this tenant.
            */
            allowedServices:
              [...allowedServices]
          }))
          .filter(
            facility =>
              facility.name
          )
          .sort(
            (a,b)=>
              a.name.localeCompare(
                b.name
              )
          );

      const activeServices =
        services
          .filter(serviceEnabled)
          .map(serviceDefaultPricing)
          .filter(
            service =>
              service.serviceKey &&
              allowedSet.has(
                service.serviceKey
              )
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
        overrides,
        allowedServices,
        debug:{
          tenantId:
            String(tenantId),
          tenantServiceCount:
            services.length,
          visibleServiceCount:
            activeServices.length
        }
      });

    }catch(err){

      console.error(
        "FACILITY PRICING BOOTSTRAP ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Failed to load facility pricing data"
      });
    }
  }
);

/* =========================
   RESOLVE ACTIVE OVERRIDE
========================= */

router.get(
  "/resolve",
  requireTenantApi,
  async (req,res)=>{

    try{

      const facilityId =
        clean(
          req.query.facilityId ||
          req.query.companyId ||
          req.query.userId
        );

      const facilityName =
        clean(
          req.query.facilityName ||
          req.query.companyName ||
          req.query.company ||
          req.query.facility ||
          req.query.name
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
          override:null
        });
      }

      return res.json({
        success:true,
        override
      });

    }catch(err){

      console.error(
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
  }
);

/* =========================
   GET ONE OVERRIDE
========================= */

router.get(
  "/:facilityId",
  requireTenantApi,
  async (req,res)=>{

    try{

      const facilityId =
        clean(
          req.params.facilityId
        );

      if(
        !mongoose.Types.ObjectId.isValid(
          facilityId
        )
      ){

        return res.status(400).json({
          success:false,
          message:"Invalid facility id"
        });
      }

      const tenantId =
        tenantIdForRequest(req);

      if(!tenantId){

        return res.status(403).json({
          success:false,
          message:"Tenant Required"
        });
      }

      /*
        Compatibility:
        Read a legacy override without tenantId only when the
        facility itself belongs to the authenticated tenant.
      */

      const facilityUser =
        await User.findOne({
          _id:facilityId,
          tenantId
        })
        .lean();

      if(
        !facilityUser ||
        !isFacilityUser(
          facilityUser
        )
      ){

        return res.status(404).json({
          success:false,
          message:"Facility not found"
        });
      }

      const override =
        await FacilityPricingOverride
          .findOne({
            facilityId,
            $or:[
              { tenantId },
              { tenantId:null },
              {
                tenantId:{
                  $exists:false
                }
              }
            ]
          })
          .lean();

      return res.json({
        success:true,
        override
      });

    }catch(err){

      console.error(
        "FACILITY PRICING GET ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Failed to load override"
      });
    }
  }
);

/* =========================
   SAVE FACILITY OVERRIDE
========================= */

router.patch(
  "/:facilityId",
  requireTenantApi,
  async (req,res)=>{

    try{

      const facilityId =
        clean(
          req.params.facilityId
        );

      if(
        !mongoose.Types.ObjectId.isValid(
          facilityId
        )
      ){

        return res.status(400).json({
          success:false,
          message:"Invalid facility id"
        });
      }

      const tenantId =
        tenantIdForRequest(req);

      if(!tenantId){

        return res.status(403).json({
          success:false,
          message:"Tenant Required"
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
        !isFacilityUser(
          facilityUser
        )
      ){

        return res.status(404).json({
          success:false,
          message:"Facility not found"
        });
      }

      const allowedServices =
        await getTenantAllowedServices(
          tenantId
        );

      const allowedSet =
        new Set(
          allowedServices
        );

      const facilityName =
        clean(
          req.body?.facilityName
        ) ||
        getFacilityName(
          facilityUser
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

      const services =
        servicesInput
          .map(normalizeServiceInput)
          .filter(
            service =>
              service.serviceKey &&
              allowedSet.has(
                service.serviceKey
              )
          );

      if(
        active &&
        !services.length
      ){

        return res.status(400).json({
          success:false,
          message:
            "Active override requires at least one Platform Admin enabled service"
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
        );

      /*
        Important legacy migration:
        Older records are unique by facilityId and may not contain
        tenantId. Find by facilityId first, then attach tenantId.
        This prevents an E11000 duplicate-key error on upsert.
      */

      let override =
        await FacilityPricingOverride
          .findOne({
            facilityId
          });

      if(override){

        if(
          override.tenantId &&
          String(
            override.tenantId
          ) !==
          String(
            tenantId
          )
        ){

          return res.status(409).json({
            success:false,
            message:
              "Facility pricing override belongs to another tenant"
          });
        }

        override.tenantId =
          tenantId;

        override.facilityName =
          facilityName;

        override.active =
          active;

        override.services =
          services;

        override.updatedBy =
          updatedBy;

        await override.save();

      }else{

        override =
          await FacilityPricingOverride
            .create({
              tenantId,
              facilityId,
              facilityName,
              active,
              services,
              updatedBy
            });
      }

      return res.json({
        success:true,

        message:
          active
            ? "Facility pricing override activated"
            : "Facility pricing override disabled",

        override
      });

    }catch(err){

      console.error(
        "FACILITY PRICING SAVE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to save facility pricing override"
      });
    }
  }
);

module.exports = router;
