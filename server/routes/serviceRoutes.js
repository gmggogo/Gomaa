const express = require("express");

const router = express.Router();

const Service =
require("../models/service");

/* =========================
   GET SERVICES
========================= */

router.get("/", async (req,res)=>{

  try{

    const services =
      await Service.find({})
      .sort({ createdAt:1 });

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
        { new:true }
      );

    res.json(updated);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Update failed"
    });

  }

});

module.exports = router;