const express = require("express");

const router = express.Router();

const Service =
require("../models/Service");

/* =========================
   TEST
========================= */

router.get("/", (req,res)=>{

  res.json({
    ok:true,
    message:"pricing route working"
  });

});

/* =========================
   CALCULATE PRICE
========================= */

router.post(
  "/calculate",
  async (req,res)=>{

    try{

      const {
        serviceKey,
        miles,
        stops
      } = req.body;

      const service =
        await Service.findOne({
          serviceKey:String(serviceKey || "")
            .toUpperCase()
        });

      if(!service){

        return res.status(404).json({
          success:false,
          message:"Service not found"
        });

      }

      const pricingMode =
        String(
          service.pricingMode || "PER_MILE"
        ).toUpperCase();

      let total = 0;

      /* =========================
         SHARED
      ========================== */

      if(pricingMode === "SHARED"){

        total =
          Number(service.sharedPrice || 0);

      }

      /* =========================
         HOURLY
      ========================== */

      else if(pricingMode === "HOURLY"){

        total =
          Number(service.hourlyRate || 0);

      }

      /* =========================
         PER MILE
      ========================== */

      else{

        const baseFare =
          Number(service.baseFare || 0);

        const includedMiles =
          Number(service.includedMiles || 0);

        const perMile =
          Number(service.perMile || 0);

        const stopFee =
          Number(service.stopFee || 0);

        const extraMiles =
          Math.max(
            0,
            Number(miles || 0) - includedMiles
          );

        total =
          baseFare +
          (extraMiles * perMile) +
          (Number(stops || 0) * stopFee);

      }

      res.json({
        success:true,
        total:Number(total.toFixed(2))
      });

    }catch(err){

      console.log(err);

      res.status(500).json({
        success:false,
        message:"Pricing failed"
      });

    }

  }
);

module.exports = router;