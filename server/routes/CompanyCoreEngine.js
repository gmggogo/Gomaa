const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Service = require("../models/Service");

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

/* =========================
   GET SERVICES
========================= */

router.get("/", async (req,res)=>{

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
   CALCULATE
========================= */

router.post("/calculate", async (req,res)=>{

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

    const service =
      await Service.findOne({
        serviceKey:
          String(serviceKey)
          .trim()
          .toUpperCase()
      });

    if(!service){

      return res.json({
        success:false,
        message:"Service Not Found"
      });

    }

    if(service.companyEnabled === false){

      return res.json({
        success:false,
        message:"Company Service Disabled"
      });

    }

    const pricingMode =
      String(
        service.companyPricingMode ||
        service.pricingMode ||
        ""
      )
      .trim()
      .toUpperCase();

    const baseFare =
      n(service.companyBaseFare);

    const includedMiles =
      n(service.companyIncludedMiles);

    const perMile =
      n(service.companyPerMile);

    const stopFee =
      n(service.companyStopFee);

    const sharedPrice =
      n(service.companySharedPrice);

    const hourlyRate =
      n(service.companyHourlyRate);

    let total = 0;

    /* =========================
       HOURLY
    ========================= */

    if(pricingMode === "HOURLY"){

      let hours = 1;

      if(
        String(service.hourlyBillingMode || "")
        .toUpperCase() === "QUARTER"
      ){

        hours =
          Math.max(
            1,
            Math.ceil(
              n(minutes) / 15
            ) / 4
          );

      }else{

        hours =
          Math.max(
            1,
            Math.ceil(
              n(minutes) / 60
            )
          );

      }

      total =
        hours *
        hourlyRate;

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
        hourlyRate
      },

      companyDisableCancel:
        Boolean(
          service.companyDisableCancel
        ),

      companyCancelFee:
        n(
          service.companyCancelFee,
          0
        ),

      companyWarningMinutes:
        n(
          service.companyWarningMinutes,
          0
        ),

      service

    });

  }catch(err){

    console.log(
      "COMPANY CORE ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Pricing Failed"
    });

  }

});

/* =========================
   UPDATE SERVICE
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      String(
        req.params.idOrKey || ""
      ).trim();

    let filter = {};

    if(
      mongoose.Types.ObjectId
      .isValid(idOrKey)
    ){

      filter = {
        _id:idOrKey
      };

    }else{

      filter = {
        serviceKey:
          idOrKey.toUpperCase()
      };

    }

    const updated =
      await Service.findOneAndUpdate(
        filter,
        { $set:req.body },
        { new:true }
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

});

module.exports = router;