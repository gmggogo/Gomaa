const express = require("express");
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

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function normalizeCode(value){
  return serviceIdentity.normalizeServiceCode(value);
}

function getServiceCode(service){

  return (
    serviceIdentity
      .getServiceOperationalCode(service)
  );
}

function serviceMatchesRequest(
  service,
  requestedValue
){

  const raw =
    clean(requestedValue)
      .toUpperCase();

  const normalized =
    normalizeCode(requestedValue);

  const operational =
    serviceIdentity
      .getServiceOperationalCode(service);

  const gate =
    serviceIdentity
      .getServiceGateKey(service);

  const keys =
    serviceIdentity
      .getServiceMatchKeys(service);

  return (
    (
      operational &&
      (
        operational === raw ||
        operational === normalized
      )
    ) ||
    (
      gate &&
      (
        gate === raw ||
        gate === normalized
      )
    ) ||
    keys.includes(raw) ||
    keys.includes(normalized)
  );
}

async function customServiceAllowed(
  req,
  service
){

  if(
    !serviceIdentity
      .isCustomService(service)
  ){
    return true;
  }

  if(
    !serviceIdentity
      .isCustomServiceConfigured(service)
  ){
    return false;
  }

  /*
    PLATFORM_ADMIN may inspect a tenant explicitly.
    The normal Get Quote calculation path is tenant-scoped.
  */
  const tenantId =
    req.authUser?.role === "PLATFORM_ADMIN"
      ? String(
          req.query?.tenantId ||
          req.body?.tenantId ||
          service?.tenantId ||
          ""
        ).trim()
      : String(
          req.authUser?.tenantId ||
          service?.tenantId ||
          ""
        ).trim();

  if(!tenantId){
    return false;
  }

  const tenant =
    await Tenant
      .findById(tenantId)
      .select({
        allowedServices:1
      })
      .lean();

  if(!tenant){
    return false;
  }

  const gate =
    serviceIdentity
      .getServiceGateKey(service);

  const allowed =
    new Set(
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

  return (
    Boolean(gate) &&
    allowed.has(gate)
  );
}


/* =========================
   CALCULATE
========================= */

router.post(
  "/calculate",
  requireTenantApi,
  async (req,res)=>{

  try{

    const {
      serviceKey,
      miles,
      stops,
      minutes,
      passengersCount
    } = req.body || {};

    if(!serviceKey){

      return res.json({
        success:false,
        message:"Missing Service Key"
      });
    }

    const requestedCode =
      normalizeCode(serviceKey);

    const services =
      await Service
        .find(
          tenantFilter(req)
        )
        .lean();

    const service =
      services.find(item =>
        serviceMatchesRequest(
          item,
          serviceKey
        )
      );

    if(!service){

      return res.json({
        success:false,
        message:"Service Not Found"
      });
    }

    if(
      serviceIdentity
        .isCustomService(service)
    ){

      const allowed =
        await customServiceAllowed(
          req,
          service
        );

      if(!allowed){

        return res.json({
          success:false,
          message:
            "Custom Service Not Available"
        });
      }
    }

    if(service.enabled === false){

      return res.json({
        success:false,
        message:"Service Disabled"
      });
    }

    const resolvedServiceCode =
      getServiceCode(service);

    if(!resolvedServiceCode){

      return res.json({
        success:false,
        message:"Service Code Not Configured"
      });
    }

    const resolvedIdentity =
      serviceIdentity
        .resolveServiceIdentity(
          service
        );

    const pricingMode =
      String(
        service.pricingMode || ""
      )
      .trim()
      .toUpperCase();

    const baseFare = n(service.baseFare);
    const includedMiles = n(service.includedMiles);
    const perMile = n(service.perMile);
    const stopFee = n(service.stopFee);
    const sharedPrice = n(service.sharedPrice);
    const hourlyRate = n(service.hourlyRate);

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

    let total = 0;

    /* =========================
       HOURLY
    ========================= */

    if(pricingMode === "HOURLY"){

      const totalMinutes =
        Math.max(
          0,
          n(minutes)
        );

      const hourlyBillingMode =
        String(
          service.hourlyBillingMode || ""
        ).toUpperCase();

      if(
        resolvedServiceCode === "LM" &&
        initialDurationMinutes > 0
      ){

        if(totalMinutes <= initialDurationMinutes){
          total = initialPrice;
        }else{

          const extraMinutes =
            totalMinutes -
            initialDurationMinutes;

          let extraHours = 0;

          if(hourlyBillingMode === "QUARTER"){
            extraHours =
              Math.ceil(extraMinutes / 15) / 4;
          }else{
            extraHours =
              Math.ceil(extraMinutes / 60);
          }

          total =
            initialPrice +
            (extraHours * hourlyRate);
        }

      }else{

        let hours = 1;

        if(hourlyBillingMode === "QUARTER"){
          hours =
            Math.max(
              1,
              Math.ceil(totalMinutes / 15) / 4
            );
        }else{
          hours =
            Math.max(
              1,
              Math.ceil(totalMinutes / 60)
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
       INDIVIDUAL
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

      serviceKey:
        resolvedServiceCode,

      serviceIdentity:
        resolvedIdentity,

      pricingMode,

      total:Number(
        total.toFixed(2)
      ),

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
          service.hourlyBillingMode
      },

      disableCancel:
        Boolean(
          service.disableCancel
        ),

      cancelFee:
        n(
          service.cancelFee,
          0
        ),

      warningMinutes:
        n(
          service.warningMinutes,
          0
        ),

      noShowFee:
        n(
          service.noShowFee,
          0
        ),

      service

    });

  }catch(err){

    console.log(
      "GETQUOTE ENGINE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Pricing Failed"
    });
  }
});

module.exports = router;