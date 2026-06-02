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
   NUMBER HELPER
========================= */

function n(value, fallback = 0){

  const num = Number(value);

  if(Number.isFinite(num)){
    return num;
  }

  return fallback;

}

/* =========================
   FIELD PICKER
========================= */

function pick(companyMode, companyValue, normalValue, fallback = 0){

  if(companyMode){

    if(companyValue !== undefined && companyValue !== null && companyValue !== ""){
      return n(companyValue, fallback);
    }

    return n(normalValue, fallback);

  }

  return n(normalValue, fallback);

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

  // accepted aliases from company pages
  isCompany,
  companyMode,
  pricingScope,
  source,
  tripSource,

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

    const requestIsCompany =
      isCompany === true ||
      companyMode === true ||
      String(pricingScope || "").toLowerCase() === "company" ||
      String(source || "").toLowerCase() === "company" ||
      String(tripSource || "").toLowerCase() === "company";

    if(requestIsCompany){

      if(service.companyEnabled === false){

        return res.json({
          success:false,
          message:"Company Service Disabled"
        });

      }

    }else{

      if(service.enabled !== true){

        return res.json({
          success:false,
          message:"Service Disabled"
        });

      }

    }

    const pricingMode =
      String(
        requestIsCompany
          ? (service.companyPricingMode || service.pricingMode || "")
          : (service.pricingMode || "")
      )
      .trim()
      .toUpperCase();

    /* =========================
       COMPANY / PUBLIC VALUES
    ========================= */

    const baseFare =
      pick(
        requestIsCompany,
        service.companyBaseFare,
        service.baseFare,
        0
      );

    const includedMiles =
      pick(
        requestIsCompany,
        service.companyIncludedMiles,
        service.includedMiles,
        0
      );

    const perMile =
      pick(
        requestIsCompany,
        service.companyPerMile,
        service.perMile,
        0
      );

    const stopFee =
      pick(
        requestIsCompany,
        service.companyStopFee,
        service.stopFee,
        0
      );

    const sharedPrice =
      pick(
        requestIsCompany,
        service.companySharedPrice,
        service.sharedPrice,
        0
      );

    const hourlyRate =
      pick(
        requestIsCompany,
        service.companyHourlyRate,
        service.hourlyRate,
        0
      );

    let total = 0;

const sharedPassengers =
  Math.max(
    1,
    n(passengersCount, 1)
  );

    /* =========================
       HOURLY
    ========================= */

    if(pricingMode === "HOURLY"){

      const totalMinutes =
        n(minutes, 0);

      let hours = 1;

      if(

        String(
          service.hourlyBillingMode || ""
        )
        .toUpperCase() === "QUARTER"

      ){

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
        hours * hourlyRate;

    }

    /* =========================
       SHARED
       company uses companySharedPrice
    ========================= */

  else if(pricingMode === "SHARED"){

  total =

    (
      baseFare *
      sharedPassengers
    ) +

    (
      n(stops, 0) *
      stopFee
    );

}

    /* =========================
       STANDARD / MILE
       company uses companyBaseFare etc
    ========================= */

    else{

      const extraMiles =

        Math.max(
          0,
          n(miles, 0) - includedMiles
        );

      total =

        baseFare +

        (
          extraMiles *
          perMile
        ) +

        (
          n(stops, 0) *
          stopFee
        );

    }

    /* =========================
       RESPONSE
    ========================= */

    return res.json({

      success:true,

      isCompany:requestIsCompany,

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

      /* =========================
         INDIVIDUAL / PUBLIC
      ========================= */

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

      /* =========================
         COMPANY
      ========================= */

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
      "PRICING ERROR:",
      err
    );

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