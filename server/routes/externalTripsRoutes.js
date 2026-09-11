"use strict";

/*
DESTINATION PATH:
server/routes/externalTripsRoutes.js

REPLACE THE PREVIOUS VERSION WITH THIS FILE.

PURPOSE:
Tenant-facing External Trips Hub API.
Does not modify the existing Trips Hub.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router =
  express.Router();

const ExternalTrip =
  require("../models/ExternalTrip");

const BrokerIntegration =
  require("../models/BrokerIntegration");

const Tenant =
  require("../models/Tenant");

const {
  createExternalTrip,
  normalizeServiceKey
} = require("../services/externalTripService");

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

function requireStaff(req,res,next){

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

    req.authUser = {
      id:
        decoded.id || "",
      role:
        decoded.role || "",
      tenantId:
        decoded.tenantId || ""
    };

    const allowed = [
      "SUPER_ADMIN",
      "ADMIN",
      "DISPATCHER"
    ];

    if(
      !allowed.includes(
        String(
          req.authUser.role
        ).toUpperCase()
      )
    ){
      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
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

async function featureEnabled(req,res,next){

  try{

    const exists =
      await BrokerIntegration.exists({
        tenantId:
          req.authUser.tenantId,
        enabled:true,
        featureVisible:{ $ne:false }
      });

    if(!exists){

      return res.status(403).json({
        success:false,
        message:"External Trips feature is disabled"
      });
    }

    next();

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Feature check failed"
    });
  }
}

router.use(
  requireStaff,
  featureEnabled
);

/* =========================
   ENABLED BROKERS FOR TENANT
========================= */

router.get(
  "/brokers",
  async (req,res) => {

    try{

      const brokers =
        await BrokerIntegration.find({
          tenantId:
            req.authUser.tenantId,
          enabled:true,
          featureVisible:{ $ne:false }
        })
        .select(
          "_id brokerName brokerCode connectionType connectionStatus"
        )
        .sort({
          brokerName:1
        })
        .lean();

      return res.json({
        success:true,
        brokers
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to load enabled brokers"
      });
    }
  }
);

/* =========================
   TENANT SERVICES
========================= */

router.get(
  "/services",
  async (req,res) => {

    try{

      const tenant =
        await Tenant.findById(
          req.authUser.tenantId
        )
        .select(
          "allowedServices"
        )
        .lean();

      const allowed =
        Array.isArray(
          tenant?.allowedServices
        )
          ? tenant.allowedServices
          : [];

      const serviceKeys =
        [
          "STANDARD",
          ...allowed.map(
            normalizeServiceKey
          )
        ]
        .filter(Boolean);

      const unique =
        [...new Set(serviceKeys)];

      const services =
        unique.map(
          key => ({
            key,
            name:
              key
                .toLowerCase()
                .split("_")
                .map(
                  part =>
                    part
                      ? part[0]
                          .toUpperCase() +
                        part.slice(1)
                      : ""
                )
                .join(" ")
          })
        );

      return res.json({
        success:true,
        services
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to load tenant services"
      });
    }
  }
);

/* =========================
   GET EXTERNAL TRIPS
========================= */

router.get(
  "/",
  async (req,res) => {

    try{

      const filter = {
        tenantId:
          req.authUser.tenantId
      };

      if(req.query.status){
        filter.status =
          String(
            req.query.status
          ).toUpperCase();
      }

      if(req.query.brokerCode){
        filter.brokerCode =
          String(
            req.query.brokerCode
          ).toUpperCase();
      }

      if(req.query.tripDate){
        filter.tripDate =
          clean(
            req.query.tripDate
          );
      }

      const trips =
        await ExternalTrip.find(
          filter
        )
        .sort({
          tripDate:1,
          tripTime:1,
          createdAt:1
        })
        .lean();

      return res.json({
        success:true,
        count:trips.length,
        trips
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to load external trips"
      });
    }
  }
);

/* =========================
   MANUAL ADD
========================= */

router.post(
  "/manual",
  async (req,res) => {

    try{

      const brokerCode =
        clean(
          req.body?.brokerCode
        )
        .toUpperCase();

      const integration =
        await BrokerIntegration.findOne({
          tenantId:
            req.authUser.tenantId,
          brokerCode,
          enabled:true,
          featureVisible:{ $ne:false }
        });

      if(!integration){
        return res.status(400).json({
          success:false,
          message:"Selected broker is not enabled for this tenant"
        });
      }

      const result =
        await createExternalTrip({
          tenantId:
            req.authUser.tenantId,

          tenantSlug:
            integration.tenantSlug ||
            "",

          integrationId:
            integration._id,

          brokerCode:
            integration.brokerCode,

          brokerName:
            integration.brokerName,

          connectionType:
            "MANUAL",

          payload:
            req.body,

          source:
            "MANUAL"
        });

      return res.status(
        result.created
          ? 201
          : 200
      ).json({
        success:true,
        ...result
      });

    }catch(err){

      return res.status(
        err.statusCode ||
        500
      ).json({
        success:false,
        message:
          err.message ||
          "Failed to create external trip",
        errors:
          err.validationErrors ||
          []
      });
    }
  }
);

/* =========================
   EDIT EXTERNAL TRIP
========================= */

router.patch(
  "/:id",
  async (req,res) => {

    try{

      if(
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid external trip id"
        });
      }

      const trip =
        await ExternalTrip.findOne({
          _id:req.params.id,
          tenantId:
            req.authUser.tenantId
        });

      if(!trip){
        return res.status(404).json({
          success:false,
          message:"External trip not found"
        });
      }

      if(
        trip.transferredToTripsHub
      ){
        return res.status(409).json({
          success:false,
          message:"Transferred external trip cannot be edited here"
        });
      }

      const allowed = [
        "tripDate",
        "tripTime",
        "appointmentTime",
        "returnTime",
        "clientName",
        "clientPhone",
        "clientEmail",
        "memberId",
        "pickup",
        "dropoff",
        "stops",
        "passengers",
        "notes",
        "serviceKey",
        "serviceName",
        "transferEligible",
        "status"
      ];

      for(const key of allowed){

        if(
          !Object.prototype
            .hasOwnProperty
            .call(
              req.body,
              key
            )
        ){
          continue;
        }

        if(key === "serviceKey"){
          trip.serviceKey =
            normalizeServiceKey(
              req.body.serviceKey ||
              "STANDARD"
            );

          continue;
        }

        if(key === "stops"){
          const stops =
            Array.isArray(
              req.body.stops
            )
              ? req.body.stops
              : [];

          trip.stops =
            stops.slice(0,5);

          continue;
        }

        trip[key] =
          req.body[key];
      }

      if(!trip.serviceKey){
        trip.serviceKey =
          "STANDARD";
      }

      if(!trip.serviceName){
        trip.serviceName =
          trip.serviceKey ===
          "STANDARD"
            ? "Standard"
            : trip.serviceKey;
      }

      await trip.save();

      return res.json({
        success:true,
        trip
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to update external trip"
      });
    }
  }
);

/* =========================
   DELETE BEFORE TRANSFER
========================= */

router.delete(
  "/:id",
  async (req,res) => {

    try{

      if(
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ){
        return res.status(400).json({
          success:false,
          message:"Invalid external trip id"
        });
      }

      const trip =
        await ExternalTrip.findOne({
          _id:req.params.id,
          tenantId:
            req.authUser.tenantId
        });

      if(!trip){
        return res.status(404).json({
          success:false,
          message:"External trip not found"
        });
      }

      if(
        trip.transferredToTripsHub
      ){
        return res.status(409).json({
          success:false,
          message:"Transferred trip cannot be deleted from External Trips Hub"
        });
      }

      await trip.deleteOne();

      return res.json({
        success:true
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:"Failed to delete external trip"
      });
    }
  }
);

module.exports =
  router;
