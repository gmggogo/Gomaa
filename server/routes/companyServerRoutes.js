const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Service = require("../models/Service");

/* =========================
   COMPANY SERVICES ONLY
========================= */

router.get("/", async (req,res)=>{

  try{

    const services =
      await Service.find({
        companyEnabled:true
      }).sort({createdAt:1});

    return res.json(services);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Company Services"
    });

  }

});

/* =========================
   COMPANY ADMIN
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
      message:"Failed To Load Company Services"
    });

  }

});

/* =========================
   UPDATE COMPANY SERVICE
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      String(req.params.idOrKey || "")
      .trim();

    let filter = {};

    if(
      mongoose.Types.ObjectId.isValid(idOrKey)
    ){

      filter = {
        _id:idOrKey
      };

    }else{

      filter = {
        serviceKey:idOrKey.toUpperCase()
      };

    }

    const allowedFields = {

      companyEnabled:req.body.companyEnabled,

      companyPricingMode:req.body.companyPricingMode,

      companyBaseFare:req.body.companyBaseFare,

      companyIncludedMiles:req.body.companyIncludedMiles,

      companyPerMile:req.body.companyPerMile,

      companyHourlyRate:req.body.companyHourlyRate,

      companyHourlyBillingMode:req.body.companyHourlyBillingMode,

      companyStopFee:req.body.companyStopFee,

      companyNoShowFee:req.body.companyNoShowFee,

      companyCancelFee:req.body.companyCancelFee,

      companyWarningMinutes:req.body.companyWarningMinutes,

      companyWarningEnabled:req.body.companyWarningEnabled,

      companyDisableCancel:req.body.companyDisableCancel,

      companyShared:req.body.companyShared,

      companySharedPrice:req.body.companySharedPrice,

      companySuffix:req.body.companySuffix

    };

    Object.keys(allowedFields).forEach(key=>{

      if(
        allowedFields[key] === undefined
      ){
        delete allowedFields[key];
      }

    });

    const updated =
      await Service.findOneAndUpdate(

        filter,

        {
          $set:allowedFields
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