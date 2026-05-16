const express = require("express");

const router = express.Router();

const multer = require("multer");

const path = require("path");

const fs = require("fs");

const SystemDesign =
require("../models/SystemDesign");

/* =========================
UPLOAD FOLDER
========================= */

const uploadPath =
path.join(
  __dirname,
  "../public/assets/uploads"
);

if(!fs.existsSync(uploadPath)){

  fs.mkdirSync(
    uploadPath,
    { recursive:true }
  );

}

/* =========================
MULTER
========================= */

const storage =
multer.diskStorage({

  destination:
  function(req,file,cb){

    cb(null,uploadPath);

  },

  filename:
  function(req,file,cb){

    const unique =
    Date.now() +
    "-" +
    Math.round(
      Math.random()*1e9
    );

    cb(
      null,
      unique +
      path.extname(file.originalname)
    );

  }

});

const upload =
multer({ storage });

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

    const imageUrl =

    "/assets/uploads/" +
    req.file.filename;

    res.json({

      success:true,

      image:imageUrl

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Upload Failed"
    });

  }

});

module.exports = router;