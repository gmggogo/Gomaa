const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const SystemDesign =
require("../models/SystemDesign");

/* =========================
CREATE UPLOAD FOLDER
========================= */

const uploadDir =
path.join(
  __dirname,
  "../public/uploads"
);

if(!fs.existsSync(uploadDir)){

  fs.mkdirSync(
    uploadDir,
    { recursive:true }
  );

}

/* =========================
MULTER DISK STORAGE
========================= */

const storage =
multer.diskStorage({

  destination:(req,file,cb)=>{

    cb(
      null,
      uploadDir
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
    2.5 * 1024 * 1024
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
    Buffer.byteLength(
      JSON.stringify(design)
    );

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

      const key =
      req.body.key;

      const image =

      `/uploads/${req.file.filename}`;

      const design =
      await SystemDesign.findOne();

      let oldImage = "";

      /* =========================
      MAIN LOGOS + HERO
      ========================= */

      if(
        design &&
        key &&
        !key.startsWith(
          "services."
        )
      ){

        oldImage =
        design[key];

      }

      /* =========================
      SERVICE CARDS
      ========================= */

      if(
        design &&
        key &&
        key.startsWith(
          "services."
        )
      ){

        const parts =
        key.split(".");

        const index =
        Number(parts[1]);

        if(
          Array.isArray(
            design.services
          ) &&
          design.services[index]
        ){

          oldImage =
          design
          .services[index]
          .image;

        }

      }

      /* =========================
      DELETE OLD IMAGE
      ========================= */

      if(
        oldImage &&
        String(oldImage)
        .startsWith(
          "/uploads/"
        )
      ){

        const oldFile =
        path.join(
          __dirname,
          "../public",
          oldImage
        );

        if(
          fs.existsSync(
            oldFile
          )
        ){

          try{

            fs.unlinkSync(
              oldFile
            );

            console.log(
              "OLD IMAGE DELETED:",
              oldFile
            );

          }catch(err){

            console.log(
              "DELETE OLD IMAGE ERROR",
              err
            );

          }

        }

      }

      res.json({

        success:true,

        image

      });

    }catch(err){

      console.log(err);

      res.status(500).json({

        message:
        err.message ||
        "Upload Failed"

      });

    }

  }
);

module.exports = router;