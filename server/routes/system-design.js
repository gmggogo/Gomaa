const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const SystemDesign =
require("../models/SystemDesign");

const Tenant =
require("../models/Tenant");

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

function safeTenantFolderName(value){

  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g,"_");
}

/* =========================
SERVICE PERMISSION HELPERS
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function normalizeServiceKey(value){

  const raw =
    clean(value)
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!raw) return "";

  if(raw === "ST" || raw === "STANDARD" || raw.includes("STANDARD")){
    return "ST";
  }

  if(
    raw === "WH" ||
    raw === "WC" ||
    raw === "WHEELCHAIR" ||
    raw === "WHEEL CHAIR" ||
    raw.includes("WHEELCHAIR") ||
    raw.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  if(raw === "SH" || raw === "SHARED" || raw.includes("SHARED")){
    return "SH";
  }

  if(
    raw === "LM" ||
    raw === "LIMO" ||
    raw === "LIMOUSINE" ||
    raw.includes("LIMOUSINE") ||
    raw.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(raw === "TX" || raw === "TAXI" || raw.includes("TAXI")){
    return "TX";
  }

  if(raw === "XL" || raw === "XL SERVICE" || raw.startsWith("XL ")){
    return "XL";
  }

  return raw.replace(/\s+/g,"");
}

function serviceCardKey(service){

  const candidates = [
    service?.serviceKey,
    service?.serviceCode,
    service?.serviceType,
    service?.id,
    service?.key,
    service?.code,
    service?.suffix,
    service?.title,
    service?.name
  ];

  for(const value of candidates){

    const key =
      normalizeServiceKey(value);

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(key)
    ){
      return key;
    }
  }

  return "";
}

async function getTenantOrFail(req,res){

  const tenantId =
    tenantIdForRequest(req);

  if(!tenantId){

    res.status(400).json({
      success:false,
      message:"Tenant Required"
    });

    return null;
  }

  const tenant =
    await Tenant.findById(
      tenantId
    )
    .lean();

  if(!tenant){

    res.status(404).json({
      success:false,
      message:"Tenant Not Found"
    });

    return null;
  }

  return tenant;
}

function getAllowedServices(tenant){

  return [
    ...new Set(
      (
        Array.isArray(
          tenant?.allowedServices
        )
          ? tenant.allowedServices
          : []
      )
      .map(normalizeServiceKey)
      .filter(Boolean)
    )
  ];
}

/*
  Merge only allowed service-card changes.

  The full services array stays stored in SystemDesign so if Platform Admin
  enables another service later, its previous/default card settings are not lost.
*/
function mergeAllowedServiceCards(
  existingServices,
  incomingServices,
  allowedServices
){

  const existing =
    Array.isArray(existingServices)
      ? existingServices.map(item => ({
          ...(item?.toObject
            ? item.toObject()
            : item)
        }))
      : [];

  const incoming =
    Array.isArray(incomingServices)
      ? incomingServices
      : [];

  const allowedSet =
    new Set(
      allowedServices
    );

  const byKey =
    new Map();

  existing.forEach((service,index)=>{

    const key =
      serviceCardKey(service);

    if(key){
      byKey.set(
        key,
        {
          ...service,
          __originalIndex:index
        }
      );
    }
  });

  incoming.forEach(service=>{

    const key =
      serviceCardKey(service);

    if(
      !key ||
      !allowedSet.has(key)
    ){
      return;
    }

    const previous =
      byKey.get(key);

    byKey.set(
      key,
      {
        ...(previous || {}),
        ...service,
        __originalIndex:
          previous?.__originalIndex
      }
    );
  });

  /*
    Keep existing order first.
  */
  const result =
    existing.map(service=>{

      const key =
        serviceCardKey(service);

      if(
        key &&
        byKey.has(key)
      ){
        const item = {
          ...byKey.get(key)
        };

        delete item.__originalIndex;

        return item;
      }

      return service;
    });

  /*
    If an allowed card exists in client defaults but did not exist in DB yet,
    append it. This makes newly-created tenant designs safe on first save.
  */
  incoming.forEach(service=>{

    const key =
      serviceCardKey(service);

    if(
      !key ||
      !allowedSet.has(key)
    ){
      return;
    }

    const exists =
      result.some(row =>
        serviceCardKey(row) === key
      );

    if(!exists){
      result.push({
        ...service
      });
    }
  });

  return result;
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

    const tenant =
      await getTenantOrFail(
        req,
        res
      );

    if(!tenant){
      return;
    }

    const tenantId =
      String(
        tenant._id
      );

    let design =
      await SystemDesign.findOne({
        tenantId
      });

    if(!design){

      design =
      await SystemDesign.create({

        tenantId,

        companyName:
          tenant.branding?.companyName ||
          tenant.name ||
          "Company",

        timezone:
          tenant.timezone ||
          "America/Phoenix"

      });

    }

    const data =
      design.toObject
        ? design.toObject()
        : design;

    return res.json({
      ...data,

      /*
        Frontend uses this only to decide which card editors to render.
        It is never accepted back as permission authority.
      */
      allowedServices:
        getAllowedServices(
          tenant
        )
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({

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

    const tenant =
      await getTenantOrFail(
        req,
        res
      );

    if(!tenant){
      return;
    }

    const tenantId =
      String(
        tenant._id
      );

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

    delete payload.tenantId;
    delete payload.allowedServices;

    const allowedServices =
      getAllowedServices(
        tenant
      );

    if(
      Object.prototype.hasOwnProperty.call(
        payload,
        "services"
      )
    ){

      payload.services =
        mergeAllowedServiceCards(
          design.services || [],
          payload.services,
          allowedServices
        );
    }

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

    return res.json({

      success:true,

      design:{
        ...(
          design.toObject
            ? design.toObject()
            : design
        ),

        allowedServices
      }

    });

  }catch(err){

    console.log(err);

    return res.status(500).json({

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

      const tenant =
        await getTenantOrFail(
          req,
          res
        );

      if(!tenant){

        if(
          req.file?.path &&
          fs.existsSync(req.file.path)
        ){
          try{
            fs.unlinkSync(
              req.file.path
            );
          }catch{}
        }

        return;
      }

      const tenantId =
        String(
          tenant._id
        );

      if(!req.file){

        return res
        .status(400)
        .json({

          message:
          "No file uploaded"

        });

      }

      const key =
        clean(
          req.body.key
        );

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

      const allowedSet =
        new Set(
          getAllowedServices(
            tenant
          )
        );

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
      Verify displayed array index still belongs
      to an allowed service for this tenant.
      ========================= */

      if(
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
          !Number.isInteger(index) ||
          index < 0
        ){

          try{
            fs.unlinkSync(
              req.file.path
            );
          }catch{}

          return res.status(400).json({
            success:false,
            message:"Invalid Service Card"
          });
        }

        /*
          The client sends the full SystemDesign services array index,
          even though it renders only allowed cards.
        */
        const clientServices =
          Array.isArray(
            req.body?.services
          )
            ? req.body.services
            : null;

        let serviceAtIndex =
          design &&
          Array.isArray(
            design.services
          )
            ? design.services[index]
            : null;

        /*
          On a brand-new tenant the default cards may still exist only
          in the browser, so accept explicit serviceKey from the form.
        */
        const requestServiceKey =
          normalizeServiceKey(
            req.body?.serviceKey
          );

        const cardKey =
          requestServiceKey ||
          serviceCardKey(
            serviceAtIndex
          );

        if(
          !cardKey ||
          !allowedSet.has(cardKey)
        ){

          try{
            fs.unlinkSync(
              req.file.path
            );
          }catch{}

          return res.status(403).json({
            success:false,
            message:
              "This service is not enabled for this company"
          });
        }

        if(serviceAtIndex){

          oldImage =
            serviceAtIndex.image;

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

      return res.json({

        success:true,

        image

      });

    }catch(err){

      console.log(err);

      return res.status(500).json({

        message:
        err.message ||
        "Upload Failed"

      });

    }

  }
);

module.exports = router;