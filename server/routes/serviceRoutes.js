const express = require("express");

const router = express.Router();

const Service = require("../models/Service");

/* =========================
   PUBLIC SERVICES
========================= */

router.get("/", async (req,res)=>{

  try{

    const isCompany =
      String(req.query.company || "")
      .toLowerCase() === "true";

    const filter =
      isCompany
      ? { companyEnabled:true }
      : { enabled:true };

    const services =
      await Service.find(filter)
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
   ADMIN SERVICES
========================= */

router.get("/admin", async (req,res)=>{

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

module.exports = router;