"use strict";

const express = require("express");

const router = express.Router();

const Tenant = require("../models/Tenant");
const SystemDesign = require("../models/SystemDesign");

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

  const tenants =
    await Tenant.find({
      enabled:true,
      subscriptionStatus:{
        $in:["ACTIVE","TRIAL"]
      }
    })
    .sort({createdAt:1})
    .limit(2)
    .lean();

  if(tenants.length === 1){
    return tenants[0];
  }

  return null;
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