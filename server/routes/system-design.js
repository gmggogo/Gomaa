const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");

const SystemDesign =
require("../models/SystemDesign");

/* =========================
MULTER DISK STORAGE
========================= */

const storage =
multer.diskStorage({

  destination:(req,file,cb)=>{

    cb(
      null,
      "public/uploads"
    );

  },

  filename:(req,file,cb)=>{

    cb(
      null,
      Date.now() +
      path.extname(
        file.originalname
      )
    );

  }

});

const upload =
multer({

  storage,

  limits:{
    fileSize:
    1 * 1024 * 1024
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

    const size =
    JSON.stringify(
      design
    ).length;

    if(size > 500000){

      return res
      .status(400)
      .json({
        message:
        "System Design Too Large"
      });

    }

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
          message:
          "No file uploaded"
        });

      }

      const image =

      `/uploads/${req.file.filename}`;

      res.json({

        success:true,

        image

      });

    }catch(err){

      console.log(err);

      res.status(500).json({
        message:
        "Upload Failed"
      });

    }

  }
);

module.exports = router;