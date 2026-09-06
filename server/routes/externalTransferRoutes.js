"use strict";

/*
DESTINATION PATH:
server/routes/externalTransferRoutes.js

PURPOSE:
Transfers tenant External Trips into the existing GH Trips Hub.

IMPORTANT:
Because the current GH Trip model is registered inside server.js,
mount this route ONLY AFTER:
  mongoose.model("Trip", tripSchema)

Do not mount this route before the Trip model exists.
*/

const express = require("express");
const jwt = require("jsonwebtoken");

const router =
  express.Router();

const {
  transferExternalTrip,
  transferDueExternalTrips
} = require(
  "../services/externalTransferService"
);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function bearerToken(req){

  const auth =
    clean(
      req.headers?.authorization
    );

  if(
    !auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

function normalizeRole(value){

  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function requireTenantStaff(
  req,
  res,
  next
){

  const token =
    bearerToken(req);

  if(!token){

    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const role =
      normalizeRole(
        decoded?.role
      );

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "DISPATCHER"
      ].includes(role)
    ){

      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
    }

    if(!decoded?.tenantId){

      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser = {
      ...decoded,
      role
    };

    return next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  requireTenantStaff
);

/* =========================
   TRANSFER ONE TRIP
========================= */

router.post(
  "/:id",
  async (req,res)=>{

    try{

      const result =
        await transferExternalTrip({
          externalTripId:
            req.params.id,

          tenantId:
            req.authUser.tenantId
        });

      return res.json({
        success:true,
        ...result
      });

    }catch(err){

      console.log(
        "EXTERNAL TRANSFER ERROR:",
        err?.message || err
      );

      return res.status(
        Number(err?.statusCode) || 500
      ).json({
        success:false,
        message:
          err?.message ||
          "External trip transfer failed"
      });
    }
  }
);

/* =========================
   TRANSFER DUE / READY TRIPS
========================= */

router.post(
  "/due/run",
  async (req,res)=>{

    try{

      const results =
        await transferDueExternalTrips({
          tenantId:
            req.authUser.tenantId,

          tripDate:
            clean(
              req.body?.tripDate ||
              req.query?.tripDate
            )
        });

      const transferred =
        results.filter(
          row =>
            row?.transferred === true
        ).length;

      const alreadyTransferred =
        results.filter(
          row =>
            row?.alreadyTransferred === true
        ).length;

      const failed =
        results.filter(
          row =>
            row?.error
        ).length;

      return res.json({
        success:true,
        total:
          results.length,
        transferred,
        alreadyTransferred,
        failed,
        results
      });

    }catch(err){

      console.log(
        "EXTERNAL DUE TRANSFER ERROR:",
        err?.message || err
      );

      return res.status(500).json({
        success:false,
        message:
          err?.message ||
          "External due transfer failed"
      });
    }
  }
);

module.exports =
  router;
