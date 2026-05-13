const express = require("express");

const router = express.Router();

const Service =
require("../models/Service");

/* =========================
   GET SERVICES
========================= */

router.get("/", async(req,res)=>{

  try{

    let services =
      await Service.find()
      .sort({createdAt:1});

    if(!services.length){

      const defaults = [

        {
          serviceKey:"STANDARD",
          title:"Standard",
          description:"Visible To Customers",
          enabled:true,
          pricingMode:"PER_MILE",
          baseFare:20,
          includedMiles:5,
          perMile:2,
          stopFee:5,
          noShowFee:15
        },

        {
          serviceKey:"XL",
          title:"XL",
          description:"Visible To Customers",
          enabled:true,
          pricingMode:"PER_MILE",
          baseFare:30,
          includedMiles:5,
          perMile:2.5,
          stopFee:5,
          noShowFee:15
        },

        {
          serviceKey:"WHEELCHAIR",
          title:"Wheelchair",
          description:"Medical Transport",
          enabled:true,
          pricingMode:"PER_MILE",
          baseFare:45,
          includedMiles:5,
          perMile:3,
          stopFee:5,
          noShowFee:15
        },

        {
          serviceKey:"SHARED",
          title:"Shared",
          description:"Shared Ride",
          enabled:true,
          pricingMode:"SHARED",
          sharedPrice:15,
          noShowFee:15
        },

        {
          serviceKey:"TAXI",
          title:"Taxi",
          description:"Hidden From Customers",
          enabled:false,
          pricingMode:"PER_MILE",
          baseFare:15,
          includedMiles:3,
          perMile:2
        },

        {
          serviceKey:"LIMO",
          title:"Limousine",
          description:"Hidden From Customers",
          enabled:false,
          pricingMode:"HOURLY",
          hourlyRate:80
        }

      ];

      await Service.insertMany(defaults);

      services =
        await Service.find()
        .sort({createdAt:1});

    }

    res.json(services);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"services error"
    });

  }

});

/* =========================
   UPDATE SERVICE
========================= */

router.put("/:id", async(req,res)=>{

  try{

    const updated =
      await Service.findByIdAndUpdate(

        req.params.id,

        req.body,

        {new:true}

      );

    res.json(updated);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"update error"
    });

  }

});

module.exports = router;