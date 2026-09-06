"use strict";

/*
DESTINATION PATH:
server/routes/brokerIntegrationRoutes.js

PURPOSE:
Platform Admin only.
Creates, enables, disables, and tests broker connections per tenant.
*/

const express = require("express");
const jwt = require("jsonwebtoken");

const router =
  express.Router();

const BrokerIntegration =
  require("../models/BrokerIntegration");

const {
  upsertIntegration,
  sanitizeIntegrationForClient,
  testIntegration
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

    req.authUser = decoded;

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

/* =========================
   LIST ALL / FILTER TENANT
========================= */

router.get(
  "/",
  async (req,res) => {

    try{

      const filter = {};

      if(req.query.tenantId){
        filter.tenantId =
          clean(
            req.query.tenantId
          );
      }

      const items =
        await BrokerIntegration.find(
          filter
        )
        .sort({
          tenantId:1,
          brokerName:1
        });

      return res.json({
        success:true,
        integrations:
          items.map(
            sanitizeIntegrationForClient
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to load broker integrations"
      });
    }
  }
);

/* =========================
   CREATE / UPDATE
========================= */

router.post(
  "/",
  async (req,res) => {

    try{

      const {
        tenantId,
        tenantSlug,
        brokerCode,
        brokerName,
        connectionType
      } = req.body || {};

      if(
        !tenantId ||
        !brokerCode ||
        !brokerName ||
        !connectionType
      ){
        return res.status(400).json({
          success:false,
          message:"tenantId, brokerCode, brokerName, and connectionType are required"
        });
      }

      const integration =
        await upsertIntegration({
          ...req.body,
          updatedBy:
            req.authUser?.id ||
            req.authUser?.email ||
            "PLATFORM_ADMIN"
        });

      return res.json({
        success:true,
        integration:
          sanitizeIntegrationForClient(
            integration
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to save broker integration"
      });
    }
  }
);

/* =========================
   ENABLE / DISABLE FEATURE
========================= */

router.patch(
  "/:id/access",
  async (req,res) => {

    try{

      const integration =
        await BrokerIntegration.findById(
          req.params.id
        );

      if(!integration){
        return res.status(404).json({
          success:false,
          message:"Integration not found"
        });
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "enabled"
          )
      ){
        integration.enabled =
          Boolean(
            req.body.enabled
          );
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "featureVisible"
          )
      ){
        integration.featureVisible =
          Boolean(
            req.body.featureVisible
          );
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "billingEnabled"
          )
      ){
        integration.billingEnabled =
          Boolean(
            req.body.billingEnabled
          );
      }

      if(
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "monthlyFlatFee"
          )
      ){
        integration.monthlyFlatFee =
          Number(
            req.body.monthlyFlatFee ||
            0
          );
      }

      integration.connectionStatus =
        integration.enabled
          ? (
              integration.connectionStatus === "DISABLED"
                ? "CONFIGURED"
                : integration.connectionStatus
            )
          : "DISABLED";

      await integration.save();

      return res.json({
        success:true,
        integration:
          sanitizeIntegrationForClient(
            integration
          )
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to update integration access"
      });
    }
  }
);

/* =========================
   TEST CONFIGURATION
========================= */

router.post(
  "/:id/test",
  async (req,res) => {

    try{

      const integration =
        await BrokerIntegration.findById(
          req.params.id
        );

      if(!integration){

        return res.status(404).json({
          success:false,
          message:"Integration not found"
        });
      }

      const result =
        await testIntegration(
          integration
        );

      return res.json({
        success:true,
        result,
        integration:
          sanitizeIntegrationForClient(
            integration
          )
      });

    }catch(err){

      return res.status(400).json({
        success:false,
        message:
          err.message ||
          "Integration test failed"
      });
    }
  }
);

module.exports =
  router;
