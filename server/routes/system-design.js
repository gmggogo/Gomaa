// =========================================
// FILE: routes/system-design.js
// CLOUDINARY + MULTI-TENANT IMAGE STORAGE
// FINAL VERSION
// =========================================

const express = require("express");
const router = express.Router();

const multer = require("multer");
const jwt = require("jsonwebtoken");
const { v2: cloudinary } = require("cloudinary");

const SystemDesign =
require("../models/SystemDesign");

const Tenant =
require("../models/Tenant");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
CLOUDINARY
========================= */

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME,

  api_key:
    process.env.CLOUDINARY_API_KEY,

  api_secret:
    process.env.CLOUDINARY_API_SECRET,

  secure:true
});

function cloudinaryReady(){

  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

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

/* =========================
HELPERS
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function slugPart(value){

  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,80);
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
CLOUDINARY IMAGE HELPERS
========================= */

/*
  One fixed public_id per tenant + image slot.

  Example:
  gh-mobility/sony/main-logo
  gh-mobility/sony/driver-logo
  gh-mobility/sony/hero-image
  gh-mobility/sony/service-st

  A replacement reuses the same public_id, so old uploads do not accumulate.
*/
function tenantCloudFolder(tenant){

  const slug =
    slugPart(
      tenant?.slug ||
      tenant?.tenantSlug ||
      tenant?.name
    );

  const fallback =
    slugPart(
      tenant?._id
    );

  return `gh-mobility/${slug || fallback}`;
}

function publicIdForUpload(
  tenant,
  key,
  serviceKey
){

  const folder =
    tenantCloudFolder(
      tenant
    );

  if(key === "mainLogo"){
    return `${folder}/main-logo`;
  }

  if(key === "driverLogo"){
    return `${folder}/driver-logo`;
  }

  if(key === "heroImage"){
    return `${folder}/hero-image`;
  }

  if(
    key &&
    key.startsWith("services.")
  ){

    const safeService =
      slugPart(
        normalizeServiceKey(
          serviceKey
        )
      );

    if(!safeService){
      return "";
    }

    return `${folder}/service-${safeService}`;
  }

  return "";
}

async function uploadBufferToCloudinary(
  buffer,
  publicId
){

  return new Promise(
    (resolve,reject)=>{

      const stream =
        cloudinary.uploader.upload_stream(
          {
            public_id:publicId,
            resource_type:"image",

            /*
              Fixed public_id = replacement.
              No random filenames, no orphan copies.
            */
            overwrite:true,
            invalidate:true,

            /*
              Let Cloudinary keep original format behavior.
            */
            unique_filename:false,
            use_filename:false
          },
          (error,result)=>{

            if(error){
              reject(error);
              return;
            }

            resolve(result);
          }
        );

      stream.end(buffer);
    }
  );
}

/* =========================
MULTER MEMORY STORAGE
NO RENDER DISK
========================= */

const upload =
multer({

  storage:
    multer.memoryStorage(),

  limits:{
    fileSize:
      2.5 * 1024 * 1024
  },

  fileFilter:(req,file,cb)=>{

    const type =
      String(
        file.mimetype ||
        ""
      ).toLowerCase();

    if(
      !type.startsWith("image/")
    ){
      return cb(
        new Error(
          "Only image files are allowed"
        )
      );
    }

    cb(null,true);
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
UPLOAD IMAGE TO CLOUDINARY
========================= */

router.post(
  "/upload",
  requireTenantApi,
  upload.single("image"),
  async(req,res)=>{

    try{

      if(!cloudinaryReady()){

        return res.status(500).json({
          success:false,
          message:
            "Cloudinary environment variables are missing"
        });
      }

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

      if(
        !req.file ||
        !req.file.buffer
      ){

        return res
        .status(400)
        .json({
          success:false,
          message:
            "No file uploaded"
        });
      }

      const key =
        clean(
          req.body.key
        );

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

      let finalServiceKey = "";

      /* =========================
      ALLOWED MAIN IMAGE KEYS
      ========================= */

      if(
        ![
          "mainLogo",
          "driverLogo",
          "heroImage"
        ].includes(key) &&
        !key.startsWith("services.")
      ){

        return res.status(400).json({
          success:false,
          message:"Invalid Image Key"
        });
      }

      /* =========================
      SERVICE CARD SECURITY
      ========================= */

      if(
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

          return res.status(400).json({
            success:false,
            message:"Invalid Service Card"
          });
        }

        const serviceAtIndex =
          design &&
          Array.isArray(
            design.services
          )
            ? design.services[index]
            : null;

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

          return res.status(403).json({
            success:false,
            message:
              "This service is not enabled for this company"
          });
        }

        finalServiceKey =
          cardKey;
      }

      const publicId =
        publicIdForUpload(
          tenant,
          key,
          finalServiceKey
        );

      if(!publicId){

        return res.status(400).json({
          success:false,
          message:"Invalid Image Destination"
        });
      }

      /*
        overwrite:true replaces the existing asset at the same public_id.
        This keeps exactly one current image for each tenant/image slot.
      */
      const result =
        await uploadBufferToCloudinary(
          req.file.buffer,
          publicId
        );

      if(
        !result ||
        !result.secure_url
      ){

        return res.status(500).json({
          success:false,
          message:"Cloudinary Upload Failed"
        });
      }

      console.log(
        "CLOUDINARY IMAGE SAVED:",
        {
          tenantId,
          key,
          publicId
        }
      );

      return res.json({
        success:true,
        image:
          result.secure_url,
        publicId:
          result.public_id
      });

    }catch(err){

      console.log(
        "CLOUDINARY UPLOAD ERROR:",
        err
      );

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Upload Failed"
      });

    }

  }
);

module.exports = router;