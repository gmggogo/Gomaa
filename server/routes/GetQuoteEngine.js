const express = require("express");

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

    if(service.enabled === false){

      return res.json({
        success:false,
        message:"Service Disabled"
      });

    }

    const pricingMode =
      String(
        service.pricingMode || ""
      )
      .trim()
      .toUpperCase();

    const baseFare =
      n(service.baseFare);

    const includedMiles =
      n(service.includedMiles);

    const perMile =
      n(service.perMile);

    const stopFee =
      n(service.stopFee);

    const sharedPrice =
      n(service.sharedPrice);

    const hourlyRate =
      n(service.hourlyRate);

    let total = 0;

    /* =========================
       HOURLY
    ========================= */

    if(pricingMode === "HOURLY"){

      let hours = 1;

      const hourlyBillingMode =
        String(
          service.hourlyBillingMode || ""
        ).toUpperCase();

      if(hourlyBillingMode === "QUARTER"){

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