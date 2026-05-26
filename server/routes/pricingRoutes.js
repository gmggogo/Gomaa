const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Service = require("../models/Service");

/* =========================
   GET SERVICES
========================= */

router.get("/", async (req,res)=>{

  try{

    const services = await Service.find({})
      .sort({createdAt:1});

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
   OLD ALIAS SUPPORT
========================= */

router.get("/services", async (req,res)=>{

  try{

    const services = await Service.find({})
      .sort({createdAt:1});

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
   CALCULATE
========================= */

router.post("/calculate", async (req,res)=>{

  try{

    const {
      serviceKey,
      miles,
      stops,
      minutes
    } = req.body || {};

    if(!serviceKey){
      return res.json({
        success:false,
        message:"Missing Service Key"
      });
    }

    const service = await Service.findOne({
      serviceKey:String(serviceKey).trim().toUpperCase()
    });

    if(!service){
      return res.json({
        success:false,
        message:"Service Not Found"
      });
    }

    if(service.enabled !== true){
      return res.json({
        success:false,
        message:"Service Disabled"
      });
    }

    const pricingMode =
      String(service.pricingMode || "")
      .trim()
      .toUpperCase();

    let total = 0;

    if(pricingMode === "HOURLY"){

      const totalMinutes = Number(minutes || 0);
      let hours = 1;

      if(
        String(service.hourlyBillingMode || "")
        .toUpperCase() === "QUARTER"
      ){
        hours = Math.max(1, Math.ceil(totalMinutes / 15) / 4);
      }else{
        hours = Math.max(1, Math.ceil(totalMinutes / 60));
      }

      total =
        hours *
        Number(service.hourlyRate || 0);

    }else if(pricingMode === "SHARED"){

      total =
        Number(service.sharedPrice || 0) +
        (
          Number(stops || 0) *
          Number(service.stopFee || 0)
        );

    }else{

      const extraMiles =
        Math.max(
          0,
          Number(miles || 0) -
          Number(service.includedMiles || 0)
        );

      total =
        Number(service.baseFare || 0) +
        (
          extraMiles *
          Number(service.perMile || 0)
        ) +
        (
          Number(stops || 0) *
          Number(service.stopFee || 0)
        );

    }

  return res.json({

  success:true,

  pricingMode,

  total:Number(
    total.toFixed(2)
  ),

  disableCancel:

  Boolean(
    service.disableCancel
  ),

  cancelFee:

  Number(
    service.cancelFee || 0
  ),

  warningMinutes:

  Number(
    service.warningMinutes || 0
  ),

  service

});

  }catch(err){

    console.log("PRICING ERROR:", err);

    return res.status(500).json({
      success:false,
      message:"Pricing Failed"
    });

  }

});

/* =========================
   UPDATE HELPER
========================= */

async function updateService(req,res){

  try{

    const idOrKey =
      String(req.params.idOrKey || "")
      .trim();

    let filter = {};

    if(mongoose.Types.ObjectId.isValid(idOrKey)){
      filter = {_id:idOrKey};
    }else{
      filter = {
        serviceKey:idOrKey.toUpperCase()
      };
    }

    const updated =
      await Service.findOneAndUpdate(
        filter,
        {$set:req.body},
        {new:true}
      );

    if(!updated){
      return res.json({
        success:false,
        message:"Service Not Found"
      });
    }

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

}

/* =========================
   UPDATE SERVICE
========================= */

router.put("/:idOrKey", updateService);

/* OLD ALIAS SUPPORT */
router.put("/services/:idOrKey", updateService);

module.exports = router;