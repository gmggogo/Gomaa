const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Service = require("../models/Service");

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

/* =========================
   COMPANY SERVICES ONLY
========================= */

router.get("/", async (req,res)=>{

  try{

    const services =
      await Service.find({
        companyEnabled:true
      })
      .sort({
        createdAt:1
      });

    return res.json(services);

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

});

/* =========================
   COMPANY ADMIN
========================= */

router.get("/admin", async (req,res)=>{

  try{

    const services =
      await Service.find({})
        .sort({
          createdAt:1
        });

    return res.json(services);

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

});

/* =========================
   GET ONE SERVICE
========================= */

router.get("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      clean(req.params.idOrKey);

    const service =
      await Service.findOne(
        buildServiceSearchFilter(idOrKey)
      );

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

});

/* =========================
   UPDATE COMPANY SERVICE
   Facility section inside Service Management
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      clean(req.params.idOrKey);

    const filter =
      buildServiceSearchFilter(idOrKey);

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

    Object.keys(allowedFields).forEach(key=>{

      if(
        allowedFields[key] === undefined
      ){
        delete allowedFields[key];
      }

    });

    const updated =
      await Service.findOneAndUpdate(
        filter,
        {
          $set:allowedFields
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

});

module.exports = router;