const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const SmartDispatchEngine =
require("../models/SmartDispatchEngine");

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
    header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return header
      .slice(7)
      .trim();
  }

  return String(
    req.headers?.["x-access-token"] ||
    ""
  ).trim();
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

function tenantFilter(
  req,
  extra={}
){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){

      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId:
      req.authUser.tenantId
  };
}

function tenantIdForWrite(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    return String(
      req.body?.tenantId ||
      req.query?.tenantId ||
      ""
    ).trim();
  }

  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
}

/* =========================
   GET SETTINGS
========================= */

router.get(
  "/",
  requireTenantApi,
  async(req,res)=>{

  try{

    const tenantId =
      tenantIdForWrite(req);

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN" &&
      !tenantId
    ){

      return res.status(400).json({
        success:false,
        message:"tenantId is required"
      });
    }

    let settings =
      await SmartDispatchEngine.findOne(
        tenantFilter(req)
      );

    if(!settings){

      settings =
        await SmartDispatchEngine.create({
          tenantId
        });

    }

    return res.json(
      settings
    );

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

router.post(
  "/",
  requireTenantApi,
  async(req,res)=>{

  try{

    const tenantId =
      tenantIdForWrite(req);

    if(!tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    let settings =
      await SmartDispatchEngine.findOne({
        tenantId
      });

    if(!settings){

      settings =
        new SmartDispatchEngine({
          tenantId
        });

    }

    /*
      Never allow normal tenant requests
      to move Smart Dispatch settings
      to another tenant.
    */
    const payload = {
      ...(req.body || {})
    };

    delete payload.tenantId;

    Object.assign(
      settings,
      payload
    );

    settings.tenantId =
      tenantId;

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