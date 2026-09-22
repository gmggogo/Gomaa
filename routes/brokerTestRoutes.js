"use strict";

/*
DESTINATION PATH:
server/routes/brokerTestRoutes.js

PURPOSE:
Development-only test tool for the four supported connection methods.
DO NOT expose this route publicly in production.
Mount it only while testing, then disable it.

This lets GH test broker intake without a real MTM account.
*/

const express = require("express");
const jwt = require("jsonwebtoken");

const router =
  express.Router();

const BrokerIntegration =
  require("../models/BrokerIntegration");

const {
  receiveTrip
} = require("../services/brokerIntegrationService");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function bearerToken(req){

  const auth =
    clean(
      req.headers.authorization
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

function requirePlatformAdmin(req,res,next){

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

    if(
      String(
        decoded.role ||
        ""
      ).toUpperCase() !==
      "PLATFORM_ADMIN"
    ){
      return res.status(403).json({
        success:false,
        message:"Platform Admin only"
      });
    }

    req.authUser =
      decoded;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  requirePlatformAdmin
);

router.post(
  "/:integrationId/trip",
  async (req,res) => {

    try{

      const integration =
        await BrokerIntegration.findById(
          req.params.integrationId
        );

      if(!integration){
        return res.status(404).json({
          success:false,
          message:"Integration not found"
        });
      }

      const payload =
        req.body?.trip ||
        req.body;

      const eventType =
        req.body?.eventType ||
        "CREATE";

      const result =
        await receiveTrip({
          integration,
          payload,
          eventType
        });

      return res.json({
        success:true,
        connectionType:
          integration.connectionType,
        result
      });

    }catch(err){

      return res.status(400).json({
        success:false,
        message:
          err.message ||
          "Broker test failed"
      });
    }
  }
);

module.exports =
  router;
