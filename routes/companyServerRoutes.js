const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Service = require("../models/Service");
const Tenant = require("../models/Tenant");

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
      clean(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      );

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
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function normalizeCode(v){

  const c = upper(v);

  if(c === "STANDARD") return "ST";
  if(c === "WHEELCHAIR") return "WH";
  if(c === "SHARED") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE") return "LM";
  if(c === "TAXI") return "TX";
  if(c === "XL") return "XL";

  return c;
}

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

      { customServiceCode:key },
      { customServiceCode:rawUpper },

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

async function getAllowedServiceSet(
  tenantId
){

  const id =
    clean(tenantId);

  if(!id){
    return new Set();
  }

  const tenant =
    await Tenant
      .findById(id)
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

function serviceResponse(
  service
){

  const identity =
    serviceIdentity
      .resolveServiceIdentity(
        service
      );

  return {
    ...service,

    serviceIdentity:
      identity.gateKey,

    operationalCode:
      identity.operationalCode,

    displayName:
      identity.displayName,

    custom:
      identity.isCustom,

    customSlot:
      identity.customSlot,

    customConfigured:
      identity.configured
  };
}

function serviceAllowedForSurface(
  service,
  allowed,
  surface=""
){

  const identity =
    serviceIdentity
      .resolveServiceIdentity(
        service
      );

  if(
    !identity.gateKey ||
    !allowed.has(
      identity.gateKey
    )
  ){
    return false;
  }

  if(
    identity.isCustom &&
    identity.configured !== true
  ){
    return false;
  }

  const key =
    clean(surface)
      .toLowerCase();

  if(
    key === "company" ||
    key === "facility"
  ){
    return service.companyEnabled === true;
  }

  if(key === "reserved"){
    return service.reservedEnabled === true;
  }

  if(key === "getquote"){
    return service.enabled === true;
  }

  return true;
}

async function listAllowedTenantServices({
  tenantId,
  surface=""
}){

  const id =
    clean(tenantId);

  if(!id){
    return [];
  }

  const [
    allowed,
    services
  ] =
    await Promise.all([
      getAllowedServiceSet(id),

      Service
        .find({
          tenantId:id
        })
        .sort({
          createdAt:1
        })
        .lean()
    ]);

  return services
    .filter(
      service =>
        serviceAllowedForSurface(
          service,
          allowed,
          surface
        )
    )
    .map(
      serviceResponse
    );
}

async function resolveTenantService({
  tenantId,
  input,
  requireAllowed=true,
  surface=""
}){

  const id =
    clean(tenantId);

  if(!id){
    return null;
  }

  const all =
    await Service
      .find({
        tenantId:id
      })
      .lean();

  const raw =
    clean(input);

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        raw
      );

  const service =
    all.find(
      row => {

        const matchKeys =
          serviceIdentity
            .getServiceMatchKeys(
              row
            );

        const operational =
          serviceIdentity
            .getServiceOperationalCode(
              row
            );

        const gate =
          serviceIdentity
            .getServiceGateKey(
              row
            );

        return (
          String(row?._id || "") === raw ||
          matchKeys.includes(
            raw.toUpperCase()
          ) ||
          matchKeys.includes(
            normalized
          ) ||
          operational ===
            serviceIdentity
              .normalizeOperationalCode(
                raw
              ) ||
          gate === normalized
        );
      }
    ) ||
    null;

  if(!service){
    return null;
  }

  if(requireAllowed){

    const allowed =
      await getAllowedServiceSet(
        id
      );

    if(
      !serviceAllowedForSurface(
        service,
        allowed,
        surface
      )
    ){
      return null;
    }
  }

  return serviceResponse(
    service
  );
}

/* =========================
   COMPANY SERVICES ONLY
========================= */

router.get(
  "/",
  requireTenantApi,
  async (req,res)=>{

    try{

      const tenantId =
        req.authUser?.role === "PLATFORM_ADMIN"
          ? clean(req.query?.tenantId || "")
          : clean(req.authUser?.tenantId || "");

      const services =
        await listAllowedTenantServices({
          tenantId,
          surface:"company"
        });

      return res.json(
        services
      );

    }catch(err){

      console.log(
        "COMPANY SERVICES LOAD ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Failed To Load Company Services"
      });

    }

  }
);

/* =========================
   COMPANY ADMIN
========================= */

router.get(
  "/admin",
  requireTenantApi,
  async (req,res)=>{

    try{

      const tenantId =
        req.authUser?.role === "PLATFORM_ADMIN"
          ? clean(req.query?.tenantId || "")
          : clean(req.authUser?.tenantId || "");

      const services =
        await listAllowedTenantServices({
          tenantId
        });

      return res.json(
        services
      );

    }catch(err){

      console.log(
        "COMPANY SERVICES ADMIN LOAD ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Failed To Load Company Services"
      });

    }

  }
);

/* =========================
   GET ONE SERVICE
========================= */

router.get(
  "/:idOrKey",
  requireTenantApi,
  async (req,res)=>{

    try{

      const idOrKey =
        clean(
          req.params.idOrKey
        );

      const tenantId =
        req.authUser?.role === "PLATFORM_ADMIN"
          ? clean(req.query?.tenantId || req.body?.tenantId || "")
          : clean(req.authUser?.tenantId || "");

      const service =
        await resolveTenantService({
          tenantId,
          input:idOrKey,
          requireAllowed:true
        });

      if(!service){

        return res.status(404).json({
          success:false,
          message:"Service Not Found"
        });

      }

      return res.json({
        success:true,
        service
      });

    }catch(err){

      console.log(
        "COMPANY SERVICE GET ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Failed To Load Service"
      });

    }

  }
);

/* =========================
   UPDATE COMPANY SERVICE
   Facility section inside Service Management
========================= */

router.put(
  "/:idOrKey",
  requireTenantApi,
  async (req,res)=>{

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

      const allowedFields = {

        /* =========================
           VISIBILITY
        ========================= */

        companyEnabled:
          req.body.companyEnabled,

        /* =========================
           BASIC FACILITY PRICING
        ========================= */

        companyPricingMode:
          req.body.companyPricingMode,

        companyBaseFare:
          req.body.companyBaseFare,

        companyIncludedMiles:
          req.body.companyIncludedMiles,

        companyPerMile:
          req.body.companyPerMile,

        companyHourlyRate:
          req.body.companyHourlyRate,

        companyHourlyBillingMode:
          req.body.companyHourlyBillingMode,

        companyStopFee:
          req.body.companyStopFee,

        companyNoShowFee:
          req.body.companyNoShowFee,

        companyShared:
          req.body.companyShared,

        companySharedPrice:
          req.body.companySharedPrice,

        companySuffix:
          req.body.companySuffix,

        /* =========================
           WARNING / CANCEL
        ========================= */

        companyCancelFee:
          req.body.companyCancelFee,

        companyWarningMinutes:
          req.body.companyWarningMinutes,

        companyWarningEnabled:
          req.body.companyWarningEnabled,

        companyDisableCancel:
          req.body.companyDisableCancel,

        /* =========================
           ADD STOP POLICY
        ========================= */

        companyAddStopEnabled:
          req.body.companyAddStopEnabled,

        companyAddStopCustomTimeEnabled:
          req.body.companyAddStopCustomTimeEnabled,

        companyAddStopCutoffMinutes:
          req.body.companyAddStopCutoffMinutes
      };

      Object.keys(
        allowedFields
      ).forEach(key=>{

        if(
          allowedFields[key] ===
          undefined
        ){
          delete allowedFields[key];
        }

      });

      /*
        Keep tenant ownership on the service.
        Never trust tenantId from normal tenant body.
      */
      if(
        req.authUser.role !==
        "PLATFORM_ADMIN"
      ){
        allowedFields.tenantId =
          req.authUser.tenantId;
      }
      else if(
        req.body?.tenantId
      ){
        allowedFields.tenantId =
          req.body.tenantId;
      }

      const updated =
        await Service.findOneAndUpdate(
          filter,
          {
            $set:
              allowedFields
          },
          {
            new:true,
            runValidators:false
          }
        );

      if(!updated){

        return res.status(404).json({
          success:false,
          message:"Service Not Found"
        });

      }

      return res.json({
        success:true,
        service:updated
      });

    }catch(err){

      console.log(
        "COMPANY SERVICE UPDATE ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:"Update Failed"
      });

    }

  }
);

module.exports = router;