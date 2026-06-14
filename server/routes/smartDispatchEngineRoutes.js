const express = require("express");
const router = express.Router();

const SmartDispatchEngine =
require("../models/SmartDispatchEngine");

/* =========================
   GET SETTINGS
========================= */

router.get("/", async(req,res)=>{

  try{

    let settings =
      await SmartDispatchEngine.findOne();

    if(!settings){

      settings =
      await SmartDispatchEngine.create({});

    }

    return res.json(settings);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Settings"
    });

  }

});

/* =========================
   SAVE SETTINGS
========================= */

router.post("/", async(req,res)=>{

  try{

    let settings =
      await SmartDispatchEngine.findOne();

    if(!settings){

      settings =
      new SmartDispatchEngine();

    }

    Object.assign(
      settings,
      req.body
    );

    await settings.save();

    return res.json({
      success:true,
      message:"Settings Saved",
      settings
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Save Settings"
    });

  }

});

module.exports = router;