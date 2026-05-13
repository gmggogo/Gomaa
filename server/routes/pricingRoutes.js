const express = require("express");

const router = express.Router();

/* =========================
   SERVICES MEMORY
========================= */

const services = [

  {
    serviceKey:"STANDARD",
    enabled:true,
    pricingMode:"MILE",
    baseFare:20,
    includedMiles:5,
    perMile:2,
    hourlyRate:0,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    serviceKey:"XL",
    enabled:true,
    pricingMode:"MILE",
    baseFare:30,
    includedMiles:5,
    perMile:2.5,
    hourlyRate:0,
    stopFee:5,
    noShowFee:15,
    sharedPrice:0
  },

  {
    serviceKey:"WHEELCHAIR",
    enabled:true,
    pricingMode:"MILE",
    baseFare:45,
    includedMiles:5,
    perMile:3,
    hourlyRate:0,
    stopFee:10,
    noShowFee:25,
    sharedPrice:0
  }

];

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
   CALCULATE
========================= */

router.post("/calculate", (req,res)=>{

  try{

    const {
      serviceKey,
      miles,
      stops
    } = req.body;

    const service =
      services.find(s=>
        s.serviceKey === serviceKey
      );

    if(!service){

      return res.json({
        success:false,
        message:"Service not found"
      });

    }

    if(service.enabled !== true){

      return res.json({
        success:false,
        message:"Service disabled"
      });

    }

    let total = 0;

    if(service.pricingMode === "MILE"){

      const extraMiles =
        Math.max(
          0,
          Number(miles || 0)
          - Number(service.includedMiles || 0)
        );

      total =
        Number(service.baseFare || 0)
        +
        (
          extraMiles
          *
          Number(service.perMile || 0)
        )
        +
        (
          Number(stops || 0)
          *
          Number(service.stopFee || 0)
        );

    }

    else if(
      service.pricingMode === "SHARED"
    ){

      total =
        Number(service.sharedPrice || 0)
        +
        (
          Number(stops || 0)
          *
          Number(service.stopFee || 0)
        );

    }

    else if(
      service.pricingMode === "HOURLY"
    ){

      total =
        Number(service.hourlyRate || 0);

    }

    return res.json({
      success:true,
      total:Number(total.toFixed(2))
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Pricing failed"
    });

  }

});

module.exports = router;