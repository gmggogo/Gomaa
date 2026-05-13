const express = require("express");

const router = express.Router();

const Service =
require("../models/Service");

/* =========================
   GET ALL SERVICES
========================= */

router.get("/", async(req,res)=>{

  try{

    const services =
      await Service.find()
      .sort({createdAt:1});

    res.json({
      success:true,
      services
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false
    });

  }

});

/* =========================
   CALCULATE PRICE
========================= */

router.post("/calculate", async(req,res)=>{

  try{

    const {

      serviceKey = "STANDARD",

      miles = 0,

      stops = 0,

      waitHours = 0

    } = req.body;

    const service =
      await Service.findOne({
        serviceKey
      });

    if(!service){

      return res.status(404).json({
        success:false,
        message:"Service not found"
      });

    }

    // =========================
    // VARIABLES
    // =========================

    const safeMiles =
      Number(miles || 0);

    const safeStops =
      Number(stops || 0);

    const safeWaitHours =
      Number(waitHours || 0);

    let total = 0;

    // =========================
    // HOURLY
    // =========================

    if(
      service.pricingMode ===
      "HOURLY"
    ){

      total =
        Number(service.hourlyRate || 0) *
        Math.max(1,safeWaitHours);

    }

    // =========================
    // SHARED
    // =========================

    else if(
      service.pricingMode ===
      "SHARED"
    ){

      total =
        Number(service.sharedPrice || 0);

      const extraMiles =
        Math.max(
          0,
          safeMiles -
          Number(service.includedMiles || 0)
        );

      total +=
        extraMiles *
        Number(service.perMile || 0);

      total +=
        safeStops *
        Number(service.stopFee || 0);

    }

    // =========================
    // PER MILE
    // =========================

    else{

      total =
        Number(service.baseFare || 0);

      const extraMiles =
        Math.max(
          0,
          safeMiles -
          Number(service.includedMiles || 0)
        );

      total +=
        extraMiles *
        Number(service.perMile || 0);

      total +=
        safeStops *
        Number(service.stopFee || 0);

    }

    // =========================
    // RESPONSE
    // =========================

    res.json({

      success:true,

      service:{

        title:
          service.title,

        pricingMode:
          service.pricingMode

      },

      breakdown:{

        baseFare:
          Number(service.baseFare || 0),

        includedMiles:
          Number(service.includedMiles || 0),

        perMile:
          Number(service.perMile || 0),

        stopFee:
          Number(service.stopFee || 0),

        noShowFee:
          Number(service.noShowFee || 0),

        hourlyRate:
          Number(service.hourlyRate || 0),

        sharedPrice:
          Number(service.sharedPrice || 0)

      },

      total:
        Number(total.toFixed(2))

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false
    });

  }

});

module.exports = router;