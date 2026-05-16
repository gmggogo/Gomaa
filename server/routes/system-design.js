const express = require("express");

const router = express.Router();

const multer = require("multer");

const SystemDesign =
require("../models/SystemDesign");

/* =========================
MULTER MEMORY STORAGE
========================= */

const storage =
multer.memoryStorage();

const upload =
multer({

  storage,

  limits:{
    fileSize:
    10 * 1024 * 1024
  }

});

/* =========================
GET SYSTEM DESIGN
========================= */

router.get("/", async(req,res)=>{

  try{

    let design =
    await SystemDesign.findOne();

    if(!design){

      design =
      await SystemDesign.create({
        companyName:
        "Sunbeam Transportation"
      });

    }

    res.json(design);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Server Error"
    });

  }

});

/* =========================
SAVE SYSTEM DESIGN
========================= */

router.post("/", async(req,res)=>{

  try{

    let design =
    await SystemDesign.findOne();

    if(!design){

      design =
      new SystemDesign();

    }

    Object.assign(
      design,
      req.body
    );

    await design.save();

    res.json({
      success:true,
      design
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Save Failed"
    });

  }

});

/* =========================
UPLOAD IMAGE
========================= */

router.post(
"/upload",
upload.single("image"),
async(req,res)=>{

  try{

    if(!req.file){

      return res
      .status(400)
      .json({
        message:"No file uploaded"
      });

    }

    const image =

    `data:${req.file.mimetype};base64,${
      req.file.buffer.toString("base64")
    }`;

    res.json({

      success:true,

      image

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Upload Failed"
    });

  }

});

module.exports = router;