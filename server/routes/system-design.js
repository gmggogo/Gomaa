const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const SystemDesign =
require("../models/SystemDesign");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantIdForRequest(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    return String(
      req.query?.tenantId ||
      req.body?.tenantId ||
      ""
    ).trim();
  }

  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
}

function tenantFilter(
  req,
  extra={}
){

  const tenantId =
    tenantIdForRequest(req);

  if(!tenantId){

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId
  };
}

function safeTenantFolderName(value){

  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g,"_");
}

/* =========================
CREATE UPLOAD ROOT
========================= */

const uploadRoot =
path.join(
  __dirname,
  "../public/uploads"
);

if(!fs.existsSync(uploadRoot)){

  fs.mkdirSync(
    uploadRoot,
    { recursive:true }
  );

}

/* =========================
MULTER DISK STORAGE
TENANT-SCOPED FOLDER
========================= */

const storage =
multer.diskStorage({

  destination:(req,file,cb)=>{

    const tenantId =
      tenantIdForRequest(req);

    if(!tenantId){

      return cb(
        new Error("Tenant Required")
      );
    }

    const tenantFolder =
      safeTenantFolderName(
        tenantId
      );

    const tenantUploadDir =
      path.join(
        uploadRoot,
        tenantFolder
      );

    if(
      !fs.existsSync(
        tenantUploadDir
      )
    ){

      fs.mkdirSync(
        tenantUploadDir,
        { recursive:true }
      );
    }

    cb(
      null,
      tenantUploadDir
    );

  },

  filename:(req,file,cb)=>{

    const ext =
      path.extname(
        file.originalname ||
        ""
      );

    const random =
      Math.random()
        .toString(36)
        .slice(2,10);

    cb(
      null,
      Date.now() +
      "-" +
      random +
      ext
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

router.get(
  "/",
  requireTenantApi,
  async(req,res)=>{

  try{

    const tenantId =
      tenantIdForRequest(req);

    if(!tenantId){

      return res.status(400).json({
        success:false,
        message:"tenantId is required"
      });
    }

    let design =
    await SystemDesign.findOne({
      tenantId
    });

    if(!design){

      design =
      await SystemDesign.create({

        tenantId,

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

router.post(
  "/",
  requireTenantApi,
  async(req,res)=>{

  try{

    const tenantId =
      tenantIdForRequest(req);

    if(!tenantId){

      return res.status(400).json({
        success:false,
        message:"Tenant Required"
      });
    }

    let design =
    await SystemDesign.findOne({
      tenantId
    });

    if(!design){

      design =
      new SystemDesign({
        tenantId
      });

    }

    const payload = {
      ...(req.body || {})
    };

    /*
      Never allow normal tenant request
      to move SystemDesign to another tenant.
    */
    delete payload.tenantId;

    Object.assign(
      design,
      payload
    );

    design.tenantId =
      tenantId;

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
  requireTenantApi,
  upload.single("image"),
  async(req,res)=>{

    try{

      const tenantId =
        tenantIdForRequest(req);

      if(!tenantId){

        return res
        .status(403)
        .json({

          message:
          "Tenant Required"

        });

      }

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

      const tenantFolder =
        safeTenantFolderName(
          tenantId
        );

      const image =

      `/uploads/${tenantFolder}/${req.file.filename}`;

      const design =
      await SystemDesign.findOne({
        tenantId
      });

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
      ONLY INSIDE SAME TENANT
      ========================= */

      const tenantPrefix =
        `/uploads/${tenantFolder}/`;

      if(
        oldImage &&
        String(oldImage)
        .startsWith(
          tenantPrefix
        )
      ){

        const relativeOldImage =
          String(oldImage)
            .replace(/^\/+/,"");

        const oldFile =
        path.join(
          __dirname,
          "../public",
          relativeOldImage
        );

        const tenantUploadDir =
          path.join(
            uploadRoot,
            tenantFolder
          );

        const resolvedOldFile =
          path.resolve(oldFile);

        const resolvedTenantDir =
          path.resolve(
            tenantUploadDir
          ) +
          path.sep;

        if(
          resolvedOldFile
            .startsWith(
              resolvedTenantDir
            ) &&
          fs.existsSync(
            resolvedOldFile
          )
        ){

          try{

            fs.unlinkSync(
              resolvedOldFile
            );

            console.log(
              "OLD TENANT IMAGE DELETED:",
              resolvedOldFile
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