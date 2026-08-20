const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const DriverSchedule =
require("../models/DriverSchedule");

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
   DEFAULT DAYS
========================= */

function defaultDays(){

  return {
    sun:false,
    mon:false,
    tue:false,
    wed:false,
    thu:false,
    fri:false,
    sat:false
  };

}

/* =========================
   GET ALL SCHEDULE
========================= */

router.get(
  "/",
  requireTenantApi,
  async (req,res)=>{

  try{

    const items =
      await DriverSchedule
        .find(
          tenantFilter(req)
        )
        .lean();

    const result = {};

    items.forEach(item=>{

      result[item.driverId] = {

        phone:
          item.phone || "",

        address:
          item.address || "",

        lat:
          item.lat ?? null,

        lng:
          item.lng ?? null,

        vehicleNumber:
          item.vehicleNumber || "",

        enabled:
          item.enabled !== false,

        days:
          item.days || defaultDays(),

        services:
          Array.isArray(item.services)
            ? item.services
            : ["ALL"]

      };

    });

    return res.json(result);

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Load Driver Schedule"
    });

  }

});

/* =========================
   SAVE SCHEDULE
========================= */

router.post(
  "/",
  requireTenantApi,
  async (req,res)=>{

  try{

    const payload =
      req.body || {};

    const tenantId =
      tenantIdForWrite(req);

    if(!tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    /*
      If PLATFORM_ADMIN sends:
      {
        tenantId:"...",
        driverId1:{...},
        driverId2:{...}
      }

      tenantId is metadata, not a driver schedule row.
    */
    for(const driverId in payload){

      if(driverId === "tenantId"){
        continue;
      }

      const data =
        payload[driverId] || {};

      const incomingAddress =
        String(data.address || "").trim();

      const existing =
        await DriverSchedule.findOne({
          tenantId,
          driverId
        }).lean();

      const oldAddress =
        String(existing?.address || "").trim();

      const addressChanged =
        oldAddress.toLowerCase() !==
        incomingAddress.toLowerCase();

      /* Address changed => old coordinates are invalid. */
      const nextLat =
        addressChanged
          ? null
          : (data.lat ?? existing?.lat ?? null);

      const nextLng =
        addressChanged
          ? null
          : (data.lng ?? existing?.lng ?? null);

      await DriverSchedule.findOneAndUpdate(

        {
          tenantId,
          driverId
        },

        {
          $set:{

            tenantId,

            phone:
              data.phone || "",

            address:
              incomingAddress,

            lat:
              nextLat,

            lng:
              nextLng,

            vehicleNumber:
              data.vehicleNumber || "",

            enabled:
              data.enabled !== false,

            days:
              data.days || defaultDays(),

            services:
              Array.isArray(data.services)
                ? data.services
                : ["ALL"]

          }
        },

        {
          upsert:true,
          new:true,
          setDefaultsOnInsert:true
        }

      );

    }

    return res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    return res.status(500).json({
      success:false,
      message:"Failed To Save Driver Schedule"
    });

  }

});

module.exports = router;