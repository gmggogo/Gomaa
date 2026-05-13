const express = require("express");

const router = express.Router();

const Service =
require("../models/Service");

/* =========================
   SEED DEFAULT SERVICES
========================= */

async function seedServices(){

  const count =
    await Service.countDocuments();

  if(count > 0){
    return;
  }

  await Service.insertMany([

    {
      serviceKey:"STANDARD",
      title:"Standard",
      icon:"🚗",
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
      title:"XL",
      icon:"🚐",
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
      title:"Wheelchair",
      icon:"🦽",
      enabled:true,
      pricingMode:"MILE",
      baseFare:45,
      includedMiles:5,
      perMile:3,
      hourlyRate:0,
      stopFee:10,
      noShowFee:25,
      sharedPrice:0
    },

    {
      serviceKey:"SHARED",
      title:"Shared",
      icon:"👥",
      enabled:true,
      pricingMode:"SHARED",
      baseFare:0,
      includedMiles:0,
      perMile:0,
      hourlyRate:0,
      stopFee:5,
      noShowFee:10,
      sharedPrice:15
    }

  ]);

}

seedServices();

/* =========================
   GET SERVICES
========================= */

router.get("/", async (req,res)=>{

  try{

    const services =
      await Service.find({})
      .sort({createdAt:1});

    res.json(services);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Failed to load services"
    });

  }

});

/* =========================
   UPDATE SERVICE
========================= */

router.put("/:id", async (req,res)=>{

  try{

    const updated =
      await Service.findByIdAndUpdate(

        req.params.id,

        req.body,

        {
          new:true
        }

      );

    res.json({
      success:true,
      service:updated
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      success:false,
      message:"Update failed"
    });

  }

});

module.exports = router;