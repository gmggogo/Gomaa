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

/* =========================
   UPDATE SERVICE
========================= */

router.put("/:idOrKey", async (req,res)=>{

  try{

    const idOrKey =
      String(req.params.idOrKey || "").trim();

    let filter = {};

    if(idOrKey.length === 24){

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