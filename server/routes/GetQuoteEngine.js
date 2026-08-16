const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Service = require("../models/Service");

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

  const c =
    upper(value)
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c) return "";

  if(c === "ST" || c === "STANDARD" || c.includes("STANDARD")) return "ST";
  if(c === "WH" || c === "WC" || c === "WHEELCHAIR" || c === "WHEEL CHAIR" || c.includes("WHEELCHAIR") || c.includes("WHEEL CHAIR")) return "WH";
  if(c === "SH" || c === "SHARED" || c.includes("SHARED")) return "SH";

  if(
    c === "LM" ||
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c === "LIMO SERVICE" ||
    c === "LIMOUSINE SERVICE" ||
    c === "LIMOUSINE TRANSPORTATION" ||
    c.includes("LIMOUSINE") ||
    c.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(c === "TX" || c === "TAXI" || c.includes("TAXI")) return "TX";
  if(c === "XL" || c === "XL SERVICE" || c.startsWith("XL ")) return "XL";

  return c;
}

function getServiceCode(service){

  const candidates = [
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.suffix,
    service?.serviceSuffix,
    service?.title,
    service?.name,
    service?.serviceName
  ];

  for(const value of candidates){

    if(!clean(value)) continue;

    const code =
      normalizeCode(value);

    if(["ST","WH","SH","LM","TX","XL"].includes(code)){
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
        getServiceCode(item) === requestedCode
      );

    if(!service){

      return res.json({
        success:false,
        message:"Service Not Found"
      });
    }

    if(service.enabled === false){

      return res.json({
        success:false,
        message:"Service Disabled"
      });
    }

    const resolvedServiceCode =
      getServiceCode(service);

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