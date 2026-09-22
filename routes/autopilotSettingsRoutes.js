"use strict";

/*
DESTINATION PATH:
server/routes/autopilotSettingsRoutes.js

PURPOSE:
Read and save per-tenant Autopilot switches.

VISIBILITY RULES:
- Operation is always available to eligible tenant staff.
- Broker Operation is available only when an enabled Broker Contract exists.
- Share Service is available only when Broker Contract + SHARED service exist.

SECURITY:
- Tenant identity comes from the signed JWT.
- Dispatcher and Company accounts cannot change Autopilot settings.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const AutopilotSettings =
  require("../models/AutopilotSettings");

const BrokerIntegration =
  require("../models/BrokerIntegration");

const Tenant =
  require("../models/Tenant");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function normalizeRole(value){
  return clean(value)
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function normalizeServiceCode(value){
  const code = clean(value)
    .toUpperCase()
    .replace(/[_-]+/g," ")
    .replace(/\s+/g," ");

  if(
    code === "SH" ||
    code === "SHARED" ||
    code.includes("SHARED")
  ){
    return "SH";
  }

  return code;
}

function readBearerToken(req){
  const header =
    clean(req.headers?.authorization);

  if(
    !header.toLowerCase().startsWith("bearer ")
  ){
    return "";
  }

  return header.slice(7).trim();
}

function requireTenantStaff(req,res,next){
  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{
    const verified =
      jwt.verify(token,JWT_SECRET);

    const tenantId =
      clean(verified?.tenantId);

    if(
      !tenantId ||
      !mongoose.Types.ObjectId.isValid(tenantId)
    ){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser = {
      id:clean(verified?.id),
      name:clean(verified?.name),
      role:normalizeRole(verified?.role),
      tenantId
    };

    return next();

  }catch(err){
    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function canManageAutopilot(role){
  return [
    "ADMIN",
    "SUPER_ADMIN",
    "SUPERADMIN"
  ].includes(
    normalizeRole(role)
  );
}

async function getCapabilities(tenantId){
  const objectId =
    new mongoose.Types.ObjectId(tenantId);

  const [broker,tenant] =
    await Promise.all([
      BrokerIntegration
        .findOne({
          tenantId:objectId,
          enabled:true,
          featureVisible:{ $ne:false }
        })
        .select("_id")
        .lean(),

      Tenant
        .findById(objectId)
        .select("allowedServices")
        .lean()
    ]);

  const allowedServices =
    Array.isArray(tenant?.allowedServices)
      ? tenant.allowedServices
      : [];

  const sharedServiceEnabled =
    allowedServices.some(
      value =>
        normalizeServiceCode(value) === "SH"
    );

  const brokerContractEnabled =
    Boolean(broker);

  return {
    brokerContractEnabled,
    sharedServiceEnabled,
    brokerSharedAvailable:
      brokerContractEnabled &&
      sharedServiceEnabled
  };
}

async function getSavedSettings(tenantId){
  const row =
    await AutopilotSettings
      .findOne({ tenantId })
      .lean();

  /*
    Backward-compatible read:
    old saved switches are used only when the new field is not present.
  */
  const operationEnabled =
    typeof row?.operationEnabled === "boolean"
      ? row.operationEnabled
      : row?.companyAutopilot === true;

  const brokerOperationEnabled =
    typeof row?.brokerOperationEnabled === "boolean"
      ? row.brokerOperationEnabled
      : row?.brokerAutopilot === true;

  const shareServiceEnabled =
    typeof row?.shareServiceEnabled === "boolean"
      ? row.shareServiceEnabled
      : row?.brokerSharedAutopilot === true;

  return {
    operationEnabled,
    operationFinalConfirmation:
      row?.operationFinalConfirmation === true,

    brokerOperationEnabled,
    brokerFinalConfirmation:
      row?.brokerFinalConfirmation === true,

    shareServiceEnabled,

    updatedAt:
      row?.updatedAt || null,

    updatedBy:
      row?.updatedBy || ""
  };
}

router.get(
  "/",
  requireTenantStaff,
  async (req,res)=>{
    try{
      const [settings,capabilities] =
        await Promise.all([
          getSavedSettings(
            req.authUser.tenantId
          ),
          getCapabilities(
            req.authUser.tenantId
          )
        ]);

      return res.json({
        success:true,
        canEdit:
          canManageAutopilot(
            req.authUser.role
          ),
        settings,
        capabilities
      });

    }catch(err){
      console.log(
        "AUTOPILOT SETTINGS GET ERROR:",
        err?.message || err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to load Autopilot settings"
      });
    }
  }
);

router.post(
  "/",
  requireTenantStaff,
  async (req,res)=>{
    try{
      if(
        !canManageAutopilot(
          req.authUser.role
        )
      ){
        return res.status(403).json({
          success:false,
          message:
            "You do not have permission to change Autopilot settings"
        });
      }

      const capabilities =
        await getCapabilities(
          req.authUser.tenantId
        );

      const requestedOperation =
        req.body?.operationEnabled === true;

      const requestedOperationFinal =
        req.body?.operationFinalConfirmation === true;

      const requestedBrokerOperation =
        req.body?.brokerOperationEnabled === true;

      const requestedBrokerFinal =
        req.body?.brokerFinalConfirmation === true;

      const requestedShareService =
        req.body?.shareServiceEnabled === true;

      const brokerOperationEnabled =
        capabilities.brokerContractEnabled
          ? requestedBrokerOperation
          : false;

      const brokerFinalConfirmation =
        capabilities.brokerContractEnabled
          ? requestedBrokerFinal
          : false;

      const shareServiceEnabled =
        capabilities.brokerSharedAvailable
          ? requestedShareService
          : false;

      const update = {
        operationEnabled:
          requestedOperation,

        operationFinalConfirmation:
          requestedOperationFinal,

        brokerOperationEnabled,

        brokerFinalConfirmation,

        shareServiceEnabled,

        /* Keep legacy fields synchronized during migration. */
        companyAutopilot:
          requestedOperation,
        brokerAutopilot:
          brokerOperationEnabled,
        brokerSharedAutopilot:
          shareServiceEnabled,

        updatedBy:
          req.authUser.name ||
          req.authUser.id ||
          ""
      };

      const saved =
        await AutopilotSettings
          .findOneAndUpdate(
            {
              tenantId:
                req.authUser.tenantId
            },
            {
              $set:update
            },
            {
              new:true,
              upsert:true,
              setDefaultsOnInsert:true
            }
          )
          .lean();

      return res.json({
        success:true,
        settings:{
          operationEnabled:
            saved?.operationEnabled === true,
          operationFinalConfirmation:
            saved?.operationFinalConfirmation === true,
          brokerOperationEnabled:
            saved?.brokerOperationEnabled === true,
          brokerFinalConfirmation:
            saved?.brokerFinalConfirmation === true,
          shareServiceEnabled:
            saved?.shareServiceEnabled === true,
          updatedAt:
            saved?.updatedAt || null,
          updatedBy:
            saved?.updatedBy || ""
        },
        capabilities
      });

    }catch(err){
      console.log(
        "AUTOPILOT SETTINGS SAVE ERROR:",
        err?.message || err
      );

      return res.status(500).json({
        success:false,
        message:
          "Unable to save Autopilot settings"
      });
    }
  }
);

module.exports = router;
