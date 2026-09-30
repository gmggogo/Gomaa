"use strict";

/*
DESTINATION PATH:
server/routes/brokerPricingRoutes.js
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const SmartFormTemplate =
  require("../models/SmartFormTemplate");

const SmartFormPricing =
  require("../models/SmartFormPricing");

const Tenant =
  require("../models/Tenant");

const Service =
  require("../models/Service");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

const {
  calculateBrokerPrice,
  normalizeServiceCode
} = require(
  "../services/brokerPricingEngine"
);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const CORE_SERVICE_CATALOG = [
  {serviceKey:"ST",serviceName:"Standard",serviceSuffix:"ST",pricingMode:"MILE",shared:false},
  {serviceKey:"WH",serviceName:"Wheelchair",serviceSuffix:"WH",pricingMode:"MILE",shared:false},
  {serviceKey:"SH",serviceName:"Shared",serviceSuffix:"SH",pricingMode:"SHARED",shared:true},
  {serviceKey:"LM",serviceName:"Limousine",serviceSuffix:"LM",pricingMode:"HOURLY",shared:false},
  {serviceKey:"TX",serviceName:"Taxi",serviceSuffix:"TX",pricingMode:"MILE",shared:false},
  {serviceKey:"XL",serviceName:"XL",serviceSuffix:"XL",pricingMode:"MILE",shared:false}
];

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function num(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value){
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value) === "1"
  );
}

function readToken(req){
  const auth =
    clean(
      req.headers.authorization
    );

  if(
    auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return auth.slice(7).trim();
  }

  return "";
}

function requireStaff(req,res,next){

  const token =
    readToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:decoded.id || "",
      name:decoded.name || "",
      username:decoded.username || "",
      email:decoded.email || "",
      role:upper(decoded.role),
      tenantId:decoded.tenantId || ""
    };

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "PLATFORM_ADMIN"
      ].includes(
        req.authUser.role
      )
    ){
      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
    }

    if(
      req.authUser.role !==
        "PLATFORM_ADMIN" &&
      !req.authUser.tenantId
    ){
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

function tenantIdFromRequest(req){

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

function normalizeServiceInput(
  row={},
  catalog=[]
){

  const serviceKey =
    serviceIdentity
      .normalizeOperationalCode(
        row.serviceKey ||
        row.serviceCode ||
        row.serviceName ||
        row.serviceSuffix
      ) ||
    normalizeServiceCode(
      row.serviceKey ||
      row.serviceCode ||
      row.serviceName ||
      row.serviceSuffix
    );

  const shared =
    serviceKey === "SH" ||
    bool(row.shared) ||
    upper(row.pricingMode) ===
      "SHARED";

  const catalogRow =
    (
      Array.isArray(catalog)
        ? catalog
        : []
    ).find(
      item =>
        item.serviceKey ===
        serviceKey
    );

  const defaultName =
    catalogRow?.serviceName ||
    serviceKey;

  const defaultMode =
    upper(
      catalogRow?.pricingMode
    );

  return {
    serviceKey,

    serviceName:
      clean(row.serviceName) ||
      defaultName,

    serviceSuffix:
      serviceKey,

    enabled:
      bool(row.enabled),

    shared,

    pricingMode:
      shared
        ? "SHARED"
        : (
            ["MILE","HOURLY"].includes(
              upper(row.pricingMode)
            )
              ? upper(row.pricingMode)
              : (
                  ["MILE","HOURLY"].includes(
                    defaultMode
                  )
                    ? defaultMode
                    : "MILE"
                )
          ),

    baseFare:
      Math.max(
        0,
        num(row.baseFare)
      ),

    includedMiles:
      Math.max(
        0,
        num(row.includedMiles)
      ),

    perMile:
      Math.max(
        0,
        num(row.perMile)
      ),

    hourlyRate:
      Math.max(
        0,
        num(row.hourlyRate)
      ),

    hourlyBillingMode:
      upper(
        row.hourlyBillingMode
      ) === "QUARTER"
        ? "QUARTER"
        : "FULL",

    /*
      Keep the existing Limo-only initial package behavior unchanged.
      Custom hourly broker services use the normal hourly calculation.
    */
    initialDurationMinutes:
      serviceKey === "LM"
        ? Math.max(
            0,
            num(
              row.initialDurationMinutes
            )
          )
        : 0,

    initialPrice:
      serviceKey === "LM"
        ? Math.max(
            0,
            num(row.initialPrice)
          )
        : 0,

    stopFee:
      Math.max(
        0,
        num(row.stopFee)
      ),

    noShowFee:
      Math.max(
        0,
        num(row.noShowFee)
      ),

    sharedPrice:
      shared
        ? Math.max(
            0,
            num(row.sharedPrice)
          )
        : 0,

    sharedStopChargeEnabled:
      shared
        ? bool(
            row.sharedStopChargeEnabled
          )
        : false,

    cancelEnabled:
      row.cancelEnabled === undefined
        ? true
        : bool(row.cancelEnabled),

    warningMinutes:
      Math.max(
        0,
        num(row.warningMinutes)
      ),

    cancelFee:
      Math.max(
        0,
        num(row.cancelFee)
      ),

    addStopEnabled:
      shared
        ? false
        : bool(
            row.addStopEnabled
          ),

    addStopCustomTimeEnabled:
      shared
        ? false
        : bool(
            row.addStopCustomTimeEnabled
          ),

    addStopCutoffMinutes:
      shared
        ? 0
        : Math.max(
            0,
            num(
              row.addStopCutoffMinutes
            )
          )
  };
}

function normalizeAllowedGateSet(
  allowedServices
){

  return new Set(
    Array.isArray(allowedServices)
      ? allowedServices
          .map(
            serviceIdentity
              .normalizeServiceCode
          )
          .filter(Boolean)
      : []
  );
}

function coreVisibleCatalog(
  allowedServices
){

  const allowed =
    normalizeAllowedGateSet(
      allowedServices
    );

  return CORE_SERVICE_CATALOG
    .filter(
      item =>
        allowed.has(
          item.serviceKey
        )
    )
    .map(
      item => ({
        ...item,
        serviceIdentity:
          item.serviceKey,
        customSlot:0,
        custom:false
      })
    );
}

async function buildVisibleServiceCatalog(
  tenantId,
  allowedServices
){

  const visible =
    coreVisibleCatalog(
      allowedServices
    );

  const allowed =
    normalizeAllowedGateSet(
      allowedServices
    );

  const customServices =
    await Service
      .find({
        tenantId,
        customSlot:{
          $in:[1,2,3,4]
        }
      })
      .sort({
        customSlot:1
      })
      .lean();

  for(const service of customServices){

    const identity =
      serviceIdentity
        .resolveServiceIdentity(
          service
        );

    if(
      identity.isCustom !== true ||
      identity.configured !== true ||
      !identity.gateKey ||
      !identity.operationalCode ||
      !allowed.has(
        identity.gateKey
      )
    ){
      continue;
    }

    visible.push({
      serviceKey:
        identity.operationalCode,

      serviceName:
        identity.displayName ||
        identity.operationalCode,

      serviceSuffix:
        identity.operationalCode,

      /*
        Broker Pricing remains independent. This is only a UI/default
        mode and does not copy Get Quote/Company/Reserved prices.
      */
      pricingMode:
        "MILE",

      shared:false,

      serviceIdentity:
        identity.gateKey,

      customSlot:
        identity.customSlot,

      custom:true
    });
  }

  return visible;
}

function defaultServices(
  catalog=[]
){

  return (
    Array.isArray(catalog)
      ? catalog
      : []
  ).map(
    item =>
      normalizeServiceInput(
        {
          ...item,
          enabled:false
        },
        catalog
      )
  );
}

function mergeServices(
  saved=[],
  catalog=[]
){

  const map =
    new Map();

  for(
    const service of
      defaultServices(catalog)
  ){
    map.set(
      service.serviceKey,
      service
    );
  }

  const allowedKeys =
    new Set(
      (
        Array.isArray(catalog)
          ? catalog
          : []
      )
      .map(
        item =>
          serviceIdentity
            .normalizeOperationalCode(
              item?.serviceKey
            )
      )
      .filter(Boolean)
    );

  for(
    const raw of
      Array.isArray(saved)
        ? saved
        : []
  ){

    const service =
      normalizeServiceInput(
        raw,
        catalog
      );

    if(
      service.serviceKey &&
      allowedKeys.has(
        service.serviceKey
      )
    ){
      map.set(
        service.serviceKey,
        service
      );
    }
  }

  return [...map.values()];
}

function filterServicesByCatalog(
  services,
  catalog
){

  const visibleKeys =
    new Set(
      (
        Array.isArray(catalog)
          ? catalog
          : []
      )
      .map(
        item =>
          serviceIdentity
            .normalizeOperationalCode(
              item?.serviceKey
            )
      )
      .filter(Boolean)
    );

  return (
    Array.isArray(services)
      ? services
      : []
  ).filter(
    service =>
      visibleKeys.has(
        serviceIdentity
          .normalizeOperationalCode(
            service?.serviceKey
          )
      )
  );
}

router.use(requireStaff);


router.get("/bootstrap",async(req,res)=>{
  try{
    const tenantId=tenantIdFromRequest(req);
    if(!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)){
      return res.status(400).json({success:false,message:"Valid tenant is required"});
    }

    const [tenant,templates,pricingRows]=await Promise.all([
      Tenant.findById(tenantId).select("allowedServices").lean(),
      SmartFormTemplate.find({tenantId,active:true})
        .select("_id name organizationId")
        .sort({name:1})
        .lean(),
      SmartFormPricing.collection.find({
        tenantId:new mongoose.Types.ObjectId(tenantId)
      }).sort({templateName:1}).toArray()
    ]);

    if(!tenant){
      return res.status(404).json({success:false,message:"Tenant not found"});
    }

    const allowedServices=Array.isArray(tenant.allowedServices)
      ? [...new Set(tenant.allowedServices.map(normalizeServiceCode).filter(Boolean))]
      : [];

    const visibleCatalog=await buildVisibleServiceCatalog(tenantId,allowedServices);

    const pricingByTemplate=new Map(
      pricingRows.map(row=>[
        String(row.templateId),
        {
          ...row,
          services:filterServicesByCatalog(
            mergeServices(row.services,visibleCatalog).map(service=>(
              service.serviceKey==="SH"
                ? {...service,sharedStopChargeEnabled:row.sharedStopChargeEnabled===true}
                : service
            )),
            visibleCatalog
          )
        }
      ])
    );

    // The frontend deliberately receives Broker-compatible keys so the proven
    // Broker Pricing card renderer stays unchanged. These rows are templates.
    const brokers=templates.map(template=>{
      const saved=pricingByTemplate.get(String(template._id));
      return {
        _id:String(template._id),
        brokerCode:String(template.name||"").trim(),
        brokerName:String(template.name||"").trim() || "Smart Form Template",
        pricing:saved || {
          templateId:String(template._id),
          templateCode:String(template.name||"").trim().toUpperCase(),
          templateName:String(template.name||"").trim(),
          active:false,
          services:filterServicesByCatalog(defaultServices(visibleCatalog),visibleCatalog)
        }
      };
    });

    return res.json({
      success:true,
      brokers,
      allowedServices,
      serviceCodes:visibleCatalog.map(item=>item.serviceKey),
      serviceCatalog:visibleCatalog
    });
  }catch(err){
    console.log("SMART FORM PRICING BOOTSTRAP ERROR:",err);
    return res.status(500).json({success:false,message:"Failed to load Smart Form pricing"});
  }
});

router.patch("/:templateId",async(req,res)=>{
  try{
    const tenantId=tenantIdFromRequest(req);
    const templateId=clean(req.params.templateId);

    if(!tenantId || !mongoose.Types.ObjectId.isValid(tenantId) ||
       !templateId || !mongoose.Types.ObjectId.isValid(templateId)){
      return res.status(400).json({success:false,message:"Valid tenant and template are required"});
    }

    const [tenant,template]=await Promise.all([
      Tenant.findById(tenantId).select("allowedServices").lean(),
      SmartFormTemplate.findOne({_id:templateId,tenantId,active:true}).select("_id name").lean()
    ]);

    if(!tenant || !template){
      return res.status(404).json({success:false,message:"Smart Form template not found"});
    }

    const allowedServices=Array.isArray(tenant.allowedServices)
      ? [...new Set(tenant.allowedServices.map(normalizeServiceCode).filter(Boolean))]
      : [];
    const visibleCatalog=await buildVisibleServiceCatalog(tenantId,allowedServices);
    const normalizedServices=filterServicesByCatalog(
      mergeServices(
        Array.isArray(req.body.services)
          ? req.body.services.map(row=>normalizeServiceInput(row,visibleCatalog))
          : [],
        visibleCatalog
      ),
      visibleCatalog
    );

    const pricing=await SmartFormPricing.findOneAndUpdate(
      {tenantId,templateId},
      {$set:{
        templateCode:String(template.name||"").trim().toUpperCase(),
        templateName:String(template.name||"").trim(),
        active:req.body.active===true,
        services:normalizedServices,
        sharedStopChargeEnabled:normalizedServices.find(x=>x.serviceKey==="SH")?.sharedStopChargeEnabled===true,
        updatedBy:clean(req.body.updatedBy || req.authUser?.name || req.authUser?.username)
      }},
      {new:true,upsert:true,setDefaultsOnInsert:true}
    ).lean();

    return res.json({success:true,pricing});
  }catch(err){
    console.log("SMART FORM PRICING SAVE ERROR:",err);
    return res.status(500).json({success:false,message:"Failed to save Smart Form pricing"});
  }
});

module.exports=router;
