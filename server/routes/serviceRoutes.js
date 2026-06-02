const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Service = require("../models/Service");

/* =========================
   SEED DEFAULT SERVICES
========================= */

async function seedServices(){

  try{

    const count =
      await Service.countDocuments();

    if(count > 0){
      return;
    }

    await Service.insertMany([

      /* ================= STANDARD ================= */

      {
        serviceKey:"STANDARD",
        title:"Standard",
        icon:"🚗",

        enabled:true,
        companyEnabled:true,

        pricingMode:"MILE",
        companyPricingMode:"MILE",

        /* INDIVIDUAL */

        baseFare:20,
        includedMiles:5,
        perMile:2,
        hourlyRate:0,
        hourlyBillingMode:"FULL",
        stopFee:5,
        noShowFee:15,
        sharedPrice:0,

        warningEnabled:true,
        warningMinutes:120,
        cancelFee:15,

        /* COMPANY */

        companyBaseFare:20,
        companyIncludedMiles:5,
        companyPerMile:2,
        companyHourlyRate:0,
        companyHourlyBillingMode:"FULL",
        companyStopFee:5,
        companyNoShowFee:15,
        companySharedPrice:0,

        companyWarningEnabled:true,
        companyWarningMinutes:120,
        companyCancelFee:15,

        companyShared:false,
        companySuffix:"ST"
      },

      /* ================= XL ================= */

      {
        serviceKey:"XL",
        title:"XL",
        icon:"🚐",

        enabled:true,
        companyEnabled:true,

        pricingMode:"MILE",
        companyPricingMode:"MILE",

        baseFare:30,
        includedMiles:5,
        perMile:2.5,
        hourlyRate:0,
        hourlyBillingMode:"FULL",
        stopFee:5,
        noShowFee:15,
        sharedPrice:0,

        warningEnabled:true,
        warningMinutes:120,
        cancelFee:15,

        companyBaseFare:30,
        companyIncludedMiles:5,
        companyPerMile:2.5,
        companyHourlyRate:0,
        companyHourlyBillingMode:"FULL",
        companyStopFee:5,
        companyNoShowFee:15,
        companySharedPrice:0,

        companyWarningEnabled:true,
        companyWarningMinutes:120,
        companyCancelFee:15,

        companyShared:false,
        companySuffix:"XL"
      },

      /* ================= WHEELCHAIR ================= */

      {
        serviceKey:"WHEELCHAIR",
        title:"Wheelchair",
        icon:"🦽",

        enabled:true,
        companyEnabled:true,

        pricingMode:"MILE",
        companyPricingMode:"MILE",

        baseFare:45,
        includedMiles:5,
        perMile:3,
        hourlyRate:0,
        hourlyBillingMode:"FULL",
        stopFee:10,
        noShowFee:25,
        sharedPrice:0,

        warningEnabled:true,
        warningMinutes:120,
        cancelFee:25,

        companyBaseFare:45,
        companyIncludedMiles:5,
        companyPerMile:3,
        companyHourlyRate:0,
        companyHourlyBillingMode:"FULL",
        companyStopFee:10,
        companyNoShowFee:25,
        companySharedPrice:0,

        companyWarningEnabled:true,
        companyWarningMinutes:120,
        companyCancelFee:25,

        companyShared:false,
        companySuffix:"WC"
      },

      /* ================= SHARED ================= */

      {
        serviceKey:"SHARED",
        title:"Shared",
        icon:"👥",

        enabled:true,
        companyEnabled:true,

        pricingMode:"SHARED",
        companyPricingMode:"SHARED",

        baseFare:0,
        includedMiles:0,
        perMile:0,
        hourlyRate:0,
        hourlyBillingMode:"FULL",
        stopFee:5,
        noShowFee:10,
        sharedPrice:15,

        warningEnabled:true,
        warningMinutes:120,
        cancelFee:10,

        companyBaseFare:0,
        companyIncludedMiles:0,
        companyPerMile:0,
        companyHourlyRate:0,
        companyHourlyBillingMode:"FULL",
        companyStopFee:5,
        companyNoShowFee:10,
        companySharedPrice:15,

        companyWarningEnabled:true,
        companyWarningMinutes:120,
        companyCancelFee:10,

        companyShared:true,
        companySuffix:"SH"
      },

      /* ================= TAXI ================= */

      {
        serviceKey:"TAXI",
        title:"Taxi",
        icon:"🚕",

        enabled:true,
        companyEnabled:true,

        pricingMode:"MILE",
        companyPricingMode:"MILE",

        baseFare:15,
        includedMiles:3,
        perMile:1.75,
        hourlyRate:0,
        hourlyBillingMode:"FULL",
        stopFee:3,
        noShowFee:10,
        sharedPrice:0,

        warningEnabled:true,
        warningMinutes:120,
        cancelFee:10,

        companyBaseFare:15,
        companyIncludedMiles:3,
        companyPerMile:1.75,
        companyHourlyRate:0,
        companyHourlyBillingMode:"FULL",
        companyStopFee:3,
        companyNoShowFee:10,
        companySharedPrice:0,

        companyWarningEnabled:true,
        companyWarningMinutes:120,
        companyCancelFee:10,

        companyShared:false,
        companySuffix:"TX"
      },

      /* ================= LIMO ================= */

      {
        serviceKey:"LIMO",
        title:"Limousine",
        icon:"🤵",

        enabled:true,
        companyEnabled:true,

        pricingMode:"HOURLY",
        companyPricingMode:"HOURLY",

        baseFare:120,
        includedMiles:0,
        perMile:0,
        hourlyRate:95,
        hourlyBillingMode:"FULL",
        stopFee:15,
        noShowFee:75,
        sharedPrice:0,

        warningEnabled:true,
        warningMinutes:240,
        cancelFee:75,

        companyBaseFare:120,
        companyIncludedMiles:0,
        companyPerMile:0,
        companyHourlyRate:95,
        companyHourlyBillingMode:"FULL",
        companyStopFee:15,
        companyNoShowFee:75,
        companySharedPrice:0,

        companyWarningEnabled:true,
        companyWarningMinutes:240,
        companyCancelFee:75,

        companyShared:false,
        companySuffix:"LM"
      }

    ]);

    console.log(
      "DEFAULT SERVICES SEEDED"
    );

  }catch(err){

    console.log(err);

  }

}

seedServices();

/* =========================
   GET SERVICES FOR ADMIN
========================= */

router.get("/admin", async (req,res)=>{

  try{

    const services =
    await Service.find({})
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
   GET SERVICES
========================= */

router.get("/", async (req,res)=>{

  try{

    const isCompany =
      String(req.query.company || "")
      .toLowerCase() === "true";

    const services =
      await Service.find(

        isCompany
        ? { companyEnabled:true }
        : { enabled:true }

      )
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
      minutes,
      isCompany
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

console.log("========== PRICING ==========");
console.log("BODY =", req.body);
console.log("SERVICE =", service?.serviceKey);
console.log("IS COMPANY =", isCompany);

console.log("COMPANY BASE =", service?.companyBaseFare);
console.log("COMPANY MILE =", service?.companyPerMile);

console.log("NORMAL BASE =", service?.baseFare);
console.log("NORMAL MILE =", service?.perMile);

console.log("COMPANY MODE =", service?.companyPricingMode);
console.log("NORMAL MODE =", service?.pricingMode);

if(!service){

  return res.json({
    success:false,
    message:"Service Not Found"
  });

}

   const enabled =
      isCompany
      ? service.companyEnabled
      : service.enabled;

    if(enabled !== true){

      return res.json({
        success:false,
        message:"Service Disabled"
      });

    }

    const pricingMode =
      String(

        isCompany
        ? (
            service.companyPricingMode ||
            service.pricingMode
          )
        : service.pricingMode

      )
      .trim()
      .toUpperCase();

    let total = 0;

    /* ================= HOURLY ================= */

    if(pricingMode === "HOURLY"){

      const totalMinutes =
        Number(minutes || 0);

      let hours = 1;

      const billingMode =
        String(

          isCompany
          ? (
              service.companyHourlyBillingMode ||
              service.hourlyBillingMode
            )
          : service.hourlyBillingMode

        ).toUpperCase();

      if(billingMode === "QUARTER"){

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

      const hourlyRate =
        Number(

          isCompany
          ? (
              service.companyHourlyRate ??
              service.hourlyRate
            )
          : service.hourlyRate

        );

      total =
        hours * hourlyRate;

    }

   /* ================= SHARED ================= */

else if(pricingMode === "SHARED"){

  const passengerCount =
  Number(
    req.body.passengersCount ||
    req.body.passengerCount ||
    1
  );
  const includedMiles =
    Number(
      isCompany
      ? (
          service.companyIncludedMiles ??
          service.includedMiles
        )
      : service.includedMiles
    );

  const perMile =
    Number(
      isCompany
      ? (
          service.companyPerMile ??
          service.perMile
        )
      : service.perMile
    );

  const baseFare =
    Number(
      isCompany
      ? (
          service.companyBaseFare ??
          service.baseFare
        )
      : service.baseFare
    );

  const stopFee =
    Number(
      isCompany
      ? (
          service.companyStopFee ??
          service.stopFee
        )
      : service.stopFee
    );

  const extraMiles =
    Math.max(
      0,
      Number(miles || 0) -
      includedMiles
    );

  const passengerPrice =
    baseFare +
    (extraMiles * perMile);

  total =
    (passengerPrice * passengerCount) +
    (Number(stops || 0) * stopFee);

}

    /* ================= MILE ================= */

    else{

      const includedMiles =
        Number(

          isCompany
          ? (
              service.companyIncludedMiles ??
              service.includedMiles
            )
          : service.includedMiles

        );

      const perMile =
        Number(

          isCompany
          ? (
              service.companyPerMile ??
              service.perMile
            )
          : service.perMile

        );

      const baseFare =
        Number(

          isCompany
          ? (
              service.companyBaseFare ??
              service.baseFare
            )
          : service.baseFare

        );

      const stopFee =
        Number(

          isCompany
          ? (
              service.companyStopFee ??
              service.stopFee
            )
          : service.stopFee

        );

      const extraMiles =
        Math.max(
          0,
          Number(miles || 0) -
          includedMiles
        );

      total =
        baseFare +
        (
          extraMiles *
          perMile
        ) +
        (
          Number(stops || 0) *
          stopFee
        );

    }

    /* =========================
       DYNAMIC CANCEL SETTINGS
    ========================= */

   const cancelFee =
Number(

  isCompany
  ? (
      service.companyCancelFee ??
      service.cancelFee
    )
  : service.cancelFee

);

const disableCancel =

  isCompany
  ? service.companyDisableCancel
  : service.disableCancel;

const warningMinutes =
Number(

        isCompany
        ? (
            service.companyWarningMinutes ??
            service.warningMinutes
          )
        : service.warningMinutes

      );

    /* =========================
       RESPONSE
    ========================= */

    return res.json({

      success:true,

      pricingMode,

      total:Number(
        total.toFixed(2)
      ),

   cancelFee,
warningMinutes,
disableCancel,
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
   UPDATE SERVICE
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      String(req.params.idOrKey || "")
      .trim();

    let filter = {};

    if(
      mongoose.Types.ObjectId.isValid(
        idOrKey
      )
    ){

      filter = {
        _id:idOrKey
      };

    }else{

      filter = {
        serviceKey:idOrKey.toUpperCase()
      };

    }

    const updated =
      await Service.findOneAndUpdate(

        filter,

        {
          $set:req.body
        },

        {
          new:true
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

    console.log(err);

    return res.status(500).json({

      success:false,

      message:"Update Failed"

    });

  }

});

module.exports = router;