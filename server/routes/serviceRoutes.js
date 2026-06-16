const express = require("express");

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

function isMongoId(v){
  return /^[0-9a-fA-F]{24}$/.test(String(v || ""));
}

function getServiceFilter(idOrKey){

  const value =
    clean(idOrKey);

  if(isMongoId(value)){
    return {
      _id:value
    };
  }

  return {
    serviceKey:upper(value)
  };
}

function isSharedAfterUpdate(current,payload){

  return (
    payload.companyShared === true ||
    payload.reservedShared === true ||

    current.companyShared === true ||
    current.reservedShared === true ||
    current.shared === true ||

    upper(payload.pricingMode || current.pricingMode) === "SHARED" ||
    upper(payload.companyPricingMode || current.companyPricingMode) === "SHARED" ||
    upper(payload.reservedPricingMode || current.reservedPricingMode) === "SHARED" ||

    upper(payload.companySuffix || current.companySuffix) === "SH" ||
    upper(payload.reservedSuffix || current.reservedSuffix) === "SH" ||
    upper(current.serviceKey) === "SH" ||
    upper(current.serviceKey) === "SHARED" ||
    upper(current.title) === "SHARED"
  );
}

function lockAddStopForShared(payload,current){

  if(!isSharedAfterUpdate(current,payload)){
    return payload;
  }

  payload.getQuoteAddStopEnabled = false;
  payload.getQuoteAddStopCustomTimeEnabled = false;
  payload.getQuoteAddStopCutoffMinutes = 0;

  payload.companyAddStopEnabled = false;
  payload.companyAddStopCustomTimeEnabled = false;
  payload.companyAddStopCutoffMinutes = 0;

  payload.reservedAddStopEnabled = false;
  payload.reservedAddStopCustomTimeEnabled = false;
  payload.reservedAddStopCutoffMinutes = 0;

  return payload;
}

/* =========================
   PUBLIC SERVICES
   /api/services
   /api/services?company=true
   /api/services?reserved=true
========================= */

router.get("/", async (req,res)=>{

  try{

    const isCompany =
      String(req.query.company || "")
      .toLowerCase() === "true";

    const isReserved =
      String(req.query.reserved || "")
      .toLowerCase() === "true";

    let filter = {};

    if(isReserved){

      filter = {
        reservedEnabled:true
      };

    }else if(isCompany){

      filter = {
        companyEnabled:true
      };

    }else{

      filter = {
        enabled:true
      };

    }

    const services =
      await Service.find(filter)
      .sort({ createdAt:1 });

    return res.json(services);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Services"
    });

  }

});

/* =========================
   ADMIN SERVICES
   /api/services/admin
========================= */

router.get("/admin", async (req,res)=>{

  try{

    const services =
      await Service.find({})
      .sort({ createdAt:1 });

    return res.json(services);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Services"
    });

  }

});

/* =========================
   UPDATE SERVICE
   GET QUOTE + FACILITY + RESERVED
   /api/services/:idOrKey
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const filter =
      getServiceFilter(req.params.idOrKey);

    const current =
      await Service.findOne(filter);

    if(!current){

      return res.status(404).json({
        success:false,
        message:"Service Not Found"
      });

    }

    const payload =
      lockAddStopForShared(
        { ...req.body },
        current
      );

    const updated =
      await Service.findOneAndUpdate(
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
      service:updated
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