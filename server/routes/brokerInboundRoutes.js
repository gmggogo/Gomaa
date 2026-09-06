"use strict";

/*
DESTINATION PATH:
server/routes/brokerInboundRoutes.js

PURPOSE:
Inbound entry point for broker traffic.
Supports Webhook now and provides test endpoints for API/SFTP/File Import.
This route is isolated from the existing GH Trips Hub.
*/

const express = require("express");

const router =
  express.Router();

const BrokerIntegration =
  require("../models/BrokerIntegration");

const {
  webhookSignatureValid,
  receiveTrip
} = require("../services/brokerIntegrationService");

function clean(value){
  return String(value ?? "").trim();
}

/* =========================
   WEBHOOK
========================= */

router.post(
  "/webhook/:integrationId",
  express.json({
    type:"*/*",
    limit:"10mb"
  }),
  async (req,res) => {

    try{

      const integration =
        await BrokerIntegration.findById(
          req.params.integrationId
        );

      if(
        !integration ||
        integration.enabled !== true ||
        integration.connectionType !== "WEBHOOK"
      ){
        return res.status(404).json({
          success:false,
          message:"Webhook integration not available"
        });
      }

      const signatureHeader =
        clean(
          integration.webhook?.signatureHeader
        );

      const signature =
        signatureHeader
          ? clean(
              req.headers[
                signatureHeader.toLowerCase()
              ]
            )
          : "";

      const rawBody =
        Buffer.from(
          JSON.stringify(
            req.body || {}
          )
        );

      const valid =
        webhookSignatureValid({
          integration,
          rawBody,
          signature
        });

      if(!valid){

        return res.status(401).json({
          success:false,
          message:"Invalid webhook signature"
        });
      }

      const eventType =
        clean(
          req.body?.eventType ||
          req.body?.action ||
          req.body?.type ||
          "CREATE"
        );

      const payload =
        req.body?.trip ||
        req.body?.data ||
        req.body;

      const result =
        await receiveTrip({
          integration,
          payload,
          eventType
        });

      return res.json({
        success:true,
        result
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Webhook processing failed"
      });
    }
  }
);

/* =========================
   MOCK / TEST INGEST
   Platform Admin can use this later through a protected test route.
   Keep disabled in production unless explicitly mounted behind auth.
========================= */

module.exports =
  router;
