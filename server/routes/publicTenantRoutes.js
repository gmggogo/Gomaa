"use strict";

const express = require("express");

const router = express.Router();

const Tenant = require("../models/Tenant");
const SystemDesign = require("../models/SystemDesign");
const Service = require("../models/Service");

function clean(value){
  return String(value ?? "").trim();
}

function normalizeServiceKey(value){

  const raw =
    clean(value)
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!raw) return "";

  if(raw === "ST" || raw === "STANDARD" || raw.includes("STANDARD")){
    return "ST";
  }

  if(
    raw === "WH" ||
    raw === "WC" ||
    raw === "WHEELCHAIR" ||
    raw === "WHEEL CHAIR" ||
    raw.includes("WHEELCHAIR") ||
    raw.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  if(raw === "SH" || raw === "SHARED" || raw.includes("SHARED")){
    return "SH";
  }

  if(
    raw === "LM" ||
    raw === "LIMO" ||
    raw === "LIMOUSINE" ||
    raw.includes("LIMOUSINE") ||
    raw.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(raw === "TX" || raw === "TAXI" || raw.includes("TAXI")){
    return "TX";
  }

  if(raw === "XL" || raw === "XL SERVICE" || raw.startsWith("XL ")){
    return "XL";
  }

  return raw.replace(/\s+/g,"");
}

function serviceCardKey(service){

  const candidates = [
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.key,
    service?.code,
    service?.suffix,
    service?.companySuffix,
    service?.reservedSuffix,
    service?.title,
    service?.title_en,
    service?.titleEs,
    service?.title_es,
    service?.name
  ];

  for(const value of candidates){

    const key =
      normalizeServiceKey(value);

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(key)
    ){
      return key;
    }
  }

  return "";
}

function publicDesignObject(design,tenant){

  const data =
    design?.toObject
      ? design.toObject()
      : (design || {});

  const allowedServices =
    Array.isArray(tenant?.allowedServices)
      ? tenant.allowedServices
          .map(normalizeServiceKey)
          .filter(Boolean)
      : [];

  const allowedSet =
    new Set(allowedServices);

  const designServices =
    Array.isArray(data.services)
      ? data.services
      : [];

  const services =
    designServices
      .map(service=>{

        const serviceKey =
          serviceCardKey(service);

        return {
          ...service,
          serviceKey
        };
      })
      .filter(service=>
        service.serviceKey &&
        allowedSet.has(service.serviceKey)
      );

  const safe = {
    ...data,

    companyName:
      data.companyName ||
      tenant?.branding?.companyName ||
      tenant?.name ||
      "",

    mainLogo:
      data.mainLogo ||
      tenant?.branding?.logo ||
      "",

    timezone:
      data.timezone ||
      tenant?.timezone ||
      "America/Phoenix",

    services
  };

  delete safe._id;
  delete safe.__v;
  delete safe.tenantId;
  delete safe.createdAt;
  delete safe.updatedAt;

  return safe;
}

async function findPublicTenantBySlug(slug){

  const cleanSlug =
    clean(slug)
      .toLowerCase();

  if(!cleanSlug){
    return null;
  }

  return await Tenant.findOne({
    slug:cleanSlug,
    enabled:true,
    subscriptionStatus:{
      $in:["ACTIVE","TRIAL"]
    }
  }).lean();
}

async function resolveDefaultTenant(){

  /*
    Root "/" must stay the main Sunbeam site.

    Priority:
    1) DEFAULT_TENANT_SLUG from Render env
    2) tenant slug "sunbeam"
    3) first active tenant as a safety fallback
  */

  const envSlug =
    clean(
      process.env.DEFAULT_TENANT_SLUG
    )
    .toLowerCase();

  if(envSlug){

    const tenant =
      await findPublicTenantBySlug(
        envSlug
      );

    if(tenant){
      return tenant;
    }
  }

  const sunbeam =
    await findPublicTenantBySlug(
      "sunbeam"
    );

  if(sunbeam){
    return sunbeam;
  }

  return await Tenant.findOne({
    enabled:true,
    subscriptionStatus:{
      $in:["ACTIVE","TRIAL"]
    }
  })
  .sort({createdAt:1})
  .lean();
}


function numberValue(value,fallback=0){

  const num =
    Number(value);

  return Number.isFinite(num)
    ? num
    : fallback;
}

function getServiceCode(service){

  const candidates = [
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

  for(const value of candidates){

    const key =
      normalizeServiceKey(value);

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(key)
    ){
      return key;
    }
  }

  return "";
}

function publicService(service){

  return {
    _id:service._id,
    serviceKey:
      getServiceCode(service),

    title:
      service.title || "",

    titleEs:
      service.titleEs || "",

    icon:
      service.icon || "🚘",

    enabled:
      service.enabled === true,

    showPricingCard:
      service.showPricingCard !== false,

    pricingMode:
      service.pricingMode || "MILE",

    baseFare:
      numberValue(service.baseFare),

    includedMiles:
      numberValue(service.includedMiles),

    perMile:
      numberValue(service.perMile),

    hourlyRate:
      numberValue(service.hourlyRate),

    hourlyBillingMode:
      service.hourlyBillingMode || "FULL",

    initialDurationMinutes:
      numberValue(
        service.initialDurationMinutes
      ),

    initialPrice:
      numberValue(
        service.initialPrice
      ),

    stopFee:
      numberValue(service.stopFee),

    noShowFee:
      numberValue(service.noShowFee),

    sharedPrice:
      numberValue(service.sharedPrice),

    warningEnabled:
      service.warningEnabled !== false,

    warningMinutes:
      numberValue(
        service.warningMinutes
      ),

    cancelFee:
      numberValue(
        service.cancelFee
      ),

    disableCancel:
      service.disableCancel === true
  };
}

async function getTenantServices(tenant){

  const allowed =
    new Set(
      (
        Array.isArray(
          tenant?.allowedServices
        )
          ? tenant.allowedServices
          : []
      )
      .map(normalizeServiceKey)
      .filter(Boolean)
    );

  if(!allowed.size){
    return [];
  }

  const rows =
    await Service.find({
      tenantId:tenant._id
    })
    .sort({
      createdAt:1
    })
    .lean();

  return rows
    .filter(service =>
      allowed.has(
        getServiceCode(service)
      )
    )
    .map(publicService);
}

async function resolveTenantForPublicRequest(
  req,
  slug
){

  if(
    slug &&
    slug !== "default"
  ){
    return await findPublicTenantBySlug(
      slug
    );
  }

  return await resolveDefaultTenant();
}

function calculateServicePrice(
  service,
  body={}
){

  const code =
    getServiceCode(service);

  const pricingMode =
    String(
      service.pricingMode || ""
    )
    .trim()
    .toUpperCase();

  const miles =
    Math.max(
      0,
      numberValue(body.miles)
    );

  const minutes =
    Math.max(
      0,
      numberValue(body.minutes)
    );

  const stops =
    Math.max(
      0,
      numberValue(body.stops)
    );

  const passengersCount =
    Math.max(
      1,
      numberValue(
        body.passengersCount,
        1
      )
    );

  const baseFare =
    numberValue(service.baseFare);

  const includedMiles =
    numberValue(
      service.includedMiles
    );

  const perMile =
    numberValue(service.perMile);

  const stopFee =
    numberValue(service.stopFee);

  const sharedPrice =
    numberValue(
      service.sharedPrice
    );

  const hourlyRate =
    numberValue(
      service.hourlyRate
    );

  const initialDurationMinutes =
    Math.max(
      0,
      numberValue(
        service.initialDurationMinutes
      )
    );

  const initialPrice =
    Math.max(
      0,
      numberValue(
        service.initialPrice
      )
    );

  const hourlyBillingMode =
    String(
      service.hourlyBillingMode ||
      "FULL"
    )
    .trim()
    .toUpperCase();

  let total = 0;

  if(pricingMode === "HOURLY"){

    if(
      code === "LM" &&
      initialDurationMinutes > 0
    ){

      if(
        minutes <=
        initialDurationMinutes
      ){
        total =
          initialPrice;
      }else{

        const extraMinutes =
          minutes -
          initialDurationMinutes;

        const extraHours =
          hourlyBillingMode ===
          "QUARTER"
            ? Math.ceil(
                extraMinutes / 15
              ) / 4
            : Math.ceil(
                extraMinutes / 60
              );

        total =
          initialPrice +
          (
            extraHours *
            hourlyRate
          );
      }

    }else{

      const hours =
        hourlyBillingMode ===
        "QUARTER"
          ? Math.max(
              1,
              Math.ceil(
                minutes / 15
              ) / 4
            )
          : Math.max(
              1,
              Math.ceil(
                minutes / 60
              )
            );

      total =
        hours *
        hourlyRate;
    }

  }else if(
    pricingMode === "SHARED"
  ){

    if(sharedPrice > 0){

      total =
        (
          sharedPrice *
          passengersCount
        ) +
        (
          stops *
          stopFee
        );

    }else{

      const includedTotal =
        passengersCount *
        includedMiles;

      total =
        (
          passengersCount *
          baseFare
        ) +
        (
          Math.max(
            0,
            miles -
            includedTotal
          ) *
          perMile
        ) +
        (
          Math.max(
            0,
            passengersCount - 1
          ) *
          stopFee
        );
    }

  }else{

    total =
      baseFare +
      (
        Math.max(
          0,
          miles -
          includedMiles
        ) *
        perMile
      ) +
      (
        stops *
        stopFee
      );
  }

  return {
    success:true,
    serviceKey:code,
    pricingMode,
    total:
      Number(
        total.toFixed(2)
      ),

    disableCancel:
      service.disableCancel === true,

    service:
      publicService(service)
  };
}

async function sendTenantBootstrap(
  req,
  res,
  tenant
){

  if(!tenant){

    return res.status(404).json({
      success:false,
      message:"Company not found"
    });
  }

  const design =
    await SystemDesign.findOne({
      tenantId:tenant._id
    }).lean();

  const publicDesign =
    publicDesignObject(
      design || {},
      tenant
    );

  return res.json({
    success:true,

    tenant:{
      id:tenant._id,
      name:tenant.name,
      slug:tenant.slug,
      timezone:
        tenant.timezone ||
        "America/Phoenix",
      allowedServices:
        Array.isArray(tenant.allowedServices)
          ? tenant.allowedServices
          : []
    },

    design:
      publicDesign
  });
}

/* =========================================
   PUBLIC GET QUOTE SERVICES
========================================= */

router.get(
  "/default/services",
  async (req,res)=>{

    try{

      const tenant =
        await resolveDefaultTenant();

      if(!tenant){

        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const services =
        await getTenantServices(
          tenant
        );

      return res.json({
        success:true,
        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug,
          timezone:
            tenant.timezone ||
            "America/Phoenix"
        },
        services
      });

    }catch(err){

      console.error(
        "PUBLIC DEFAULT SERVICES ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Failed To Load Services"
      });
    }
  }
);

router.get(
  "/:slug/services",
  async (req,res)=>{

    try{

      const tenant =
        await findPublicTenantBySlug(
          req.params.slug
        );

      if(!tenant){

        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const services =
        await getTenantServices(
          tenant
        );

      return res.json({
        success:true,
        tenant:{
          id:tenant._id,
          name:tenant.name,
          slug:tenant.slug,
          timezone:
            tenant.timezone ||
            "America/Phoenix"
        },
        services
      });

    }catch(err){

      console.error(
        "PUBLIC TENANT SERVICES ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          "Failed To Load Services"
      });
    }
  }
);

/* =========================================
   PUBLIC GET QUOTE CALCULATE
========================================= */

router.post(
  "/default/calculate",
  async (req,res)=>{

    try{

      const tenant =
        await resolveDefaultTenant();

      if(!tenant){

        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const requestedCode =
        normalizeServiceKey(
          req.body?.serviceKey
        );

      const allowed =
        new Set(
          (
            tenant.allowedServices ||
            []
          )
          .map(normalizeServiceKey)
        );

      if(
        !allowed.has(
          requestedCode
        )
      ){

        return res.status(403).json({
          success:false,
          message:
            "Service is not enabled for this company"
        });
      }

      const services =
        await Service.find({
          tenantId:tenant._id
        })
        .lean();

      const service =
        services.find(
          item =>
            getServiceCode(item) ===
            requestedCode
        );

      if(
        !service ||
        service.enabled !== true
      ){

        return res.status(404).json({
          success:false,
          message:
            "Service not available"
        });
      }

      return res.json(
        calculateServicePrice(
          service,
          req.body
        )
      );

    }catch(err){

      console.error(
        "PUBLIC DEFAULT CALCULATE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Pricing Failed"
      });
    }
  }
);

router.post(
  "/:slug/calculate",
  async (req,res)=>{

    try{

      const tenant =
        await findPublicTenantBySlug(
          req.params.slug
        );

      if(!tenant){

        return res.status(404).json({
          success:false,
          message:"Company not found"
        });
      }

      const requestedCode =
        normalizeServiceKey(
          req.body?.serviceKey
        );

      const allowed =
        new Set(
          (
            tenant.allowedServices ||
            []
          )
          .map(normalizeServiceKey)
        );

      if(
        !allowed.has(
          requestedCode
        )
      ){

        return res.status(403).json({
          success:false,
          message:
            "Service is not enabled for this company"
        });
      }

      const services =
        await Service.find({
          tenantId:tenant._id
        })
        .lean();

      const service =
        services.find(
          item =>
            getServiceCode(item) ===
            requestedCode
        );

      if(
        !service ||
        service.enabled !== true
      ){

        return res.status(404).json({
          success:false,
          message:
            "Service not available"
        });
      }

      return res.json(
        calculateServicePrice(
          service,
          req.body
        )
      );

    }catch(err){

      console.error(
        "PUBLIC TENANT CALCULATE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Pricing Failed"
      });
    }
  }
);

/* =========================================
   DEFAULT PUBLIC TENANT
   Used for the existing root homepage.

   With multiple tenants, set:
   DEFAULT_TENANT_SLUG=sunbeam
========================================= */

router.get(
  "/default",
  async (req,res)=>{

    try{

      const tenant =
        await resolveDefaultTenant();

      if(!tenant){

        return res.status(400).json({
          success:false,
          message:
            "Tenant slug required. Set DEFAULT_TENANT_SLUG or use ?tenant=<slug>."
        });
      }

      return await sendTenantBootstrap(
        req,
        res,
        tenant
      );

    }catch(err){

      console.error(
        "PUBLIC DEFAULT TENANT ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Failed To Load Company"
      });
    }

  }
);

/* =========================================
   PUBLIC TENANT BY SLUG
========================================= */

router.get(
  "/:slug",
  async (req,res)=>{

    try{

      const tenant =
        await findPublicTenantBySlug(
          req.params.slug
        );

      return await sendTenantBootstrap(
        req,
        res,
        tenant
      );

    }catch(err){

      console.error(
        "PUBLIC TENANT ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Failed To Load Company"
      });
    }

  }
);

module.exports = router;