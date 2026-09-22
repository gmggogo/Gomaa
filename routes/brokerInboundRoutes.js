"use strict";

/*
DESTINATION PATH:
server/routes/brokerInboundRoutes.js

PURPOSE:
Receives inbound broker webhook events and routes them through the
broker integration normalization service.

IMPORTANT:
This route does not expose broker credentials.
The integration must be enabled before inbound trips are accepted.
*/

const express = require("express");

const router =
  express.Router();

const BrokerIntegration =
  require("../models/BrokerIntegration");

const {
  receiveTrip
} = require(
  "../services/brokerIntegrationService"
);

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function safeEventType(value){

  const type =
    upper(value);

  if(
    [
      "CREATE",
      "UPDATE",
      "CANCEL"
    ].includes(type)
  ){
    return type;
  }

  return "CREATE";
}

/* =========================
   HEALTH
========================= */

router.get(
  "/health",
  (req,res)=>{
    return res.json({
      success:true,
      service:"broker-inbound"
    });
  }
);

/* =========================
   BROKER WEBHOOK INBOUND
========================= */

router.post(
  "/webhook/:tenantSlug/:brokerCode",
  async (req,res)=>{

    try{

      const tenantSlug =
        clean(
          req.params.tenantSlug
        ).toLowerCase();

      const brokerCode =
        upper(
          req.params.brokerCode
        );

      if(
        !tenantSlug ||
        brokerCode.length !== 2
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid broker webhook path"
        });
      }

      const integration =
        await BrokerIntegration.findOne({
          tenantSlug,
          brokerCode,
          connectionType:"WEBHOOK",
          enabled:true
        });

      if(!integration){
        return res.status(404).json({
          success:false,
          message:"Enabled webhook integration not found"
        });
      }

      if(
        integration.featureVisible !== true
      ){
        return res.status(403).json({
          success:false,
          message:"External Trips feature is disabled"
        });
      }

      /*
        Broker-specific signature verification can be added here later
        when the broker supplies the exact signing specification.
        Until then, configured webhook secrets are not guessed or applied
        using an unsupported signature format.
      */

      const payload =
        req.body?.trip ||
        req.body?.payload ||
        req.body;

      const eventType =
        safeEventType(
          req.body?.eventType ||
          req.body?.event ||
          req.body?.action ||
          req.headers["x-event-type"]
        );

      const result =
        await receiveTrip({
          integration,
          payload,
          eventType
        });

      return res.json({
        success:true,
        brokerCode:
          integration.brokerCode,
        eventType,
        result
      });

    }catch(err){

      console.log(
        "BROKER INBOUND ERROR:",
        err?.message || err
      );

      return res.status(
        Number(err?.statusCode) || 400
      ).json({
        success:false,
        message:
          err?.message ||
          "Broker inbound processing failed"
      });
    }
  }
);

module.exports =
  router;
