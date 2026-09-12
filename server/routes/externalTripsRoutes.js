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

const TripSplitState =
  require("../models/TripSplitState");

const {
  createExternalTrip,
  normalizeServiceKey:normalizeExternalServiceKey,
  replaceExternalTripServiceSuffix
} = require("../services/externalTripService");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}


function safeArray(value){
  return Array.isArray(value)
    ? value
    : [];
}

function boolFlag(value){
  return (
    value === true ||
    String(value ?? "").toLowerCase() === "true" ||
    String(value ?? "").toLowerCase() === "yes" ||
    String(value ?? "").toLowerCase() === "1"
  );
}

function passengerHasFinalConfirmation(passenger){
  return (
    boolFlag(passenger?.finalStatusConfirmed) ||
    boolFlag(passenger?.dispatchFinalConfirmed) ||
    !!passenger?.finalStatusConfirmedAt ||
    !!passenger?.dispatchFinalConfirmedAt
  );
}

function hasFinalConfirmation(trip){
  if(!trip){
    return false;
  }

  if(
    boolFlag(trip.finalStatusConfirmed) ||
    boolFlag(trip.dispatchFinalConfirmed) ||
    boolFlag(trip.sharedFinalConfirmed) ||
    boolFlag(trip.finalConfirmed) ||
    !!trip.finalStatusConfirmedAt ||
    !!trip.dispatchFinalConfirmedAt ||
    !!trip.sharedFinalConfirmedAt ||
    !!trip.finalConfirmedAt
  ){
    return true;
  }

  return safeArray(trip.passengers)
    .some(passengerHasFinalConfirmation);
}

async function getFinalConfirmedExternalIdSet(
  tenantId,
  externalTrips
){
  const rows =
    safeArray(externalTrips);

  if(!rows.length){
    return new Set();
  }

  const Trip =
    getTripModel();

  const externalIds =
    rows.map(row=>row._id);

  const states =
    await TripSplitState.find({
      tenantId,
      externalTripObjectId:{
        $in:externalIds
      },
      dispatchTripId:{
        $exists:true,
        $ne:null
      }
    })
      .select(
        "externalTripObjectId dispatchTripId"
      )
      .lean();

  const dispatchIds =
    [...new Set(
      states
        .map(row=>clean(row.dispatchTripId))
        .filter(Boolean)
    )];

  const directlyTransferredIds =
    rows
      .map(row=>clean(row.transferredTripId))
      .filter(Boolean);

  const allTripIds =
    [...new Set([
      ...dispatchIds,
      ...directlyTransferredIds
    ])];

  if(!allTripIds.length){
    return new Set();
  }

  const finalTrips =
    await Trip.find({
      tenantId,
      _id:{
        $in:allTripIds
      }
    })
      .select(
        "_id finalStatusConfirmed dispatchFinalConfirmed sharedFinalConfirmed finalConfirmed finalStatusConfirmedAt dispatchFinalConfirmedAt sharedFinalConfirmedAt finalConfirmedAt passengers"
      )
      .lean();

  const finalTripIds =
    new Set(
      finalTrips
        .filter(hasFinalConfirmation)
        .map(trip=>String(trip._id))
    );

  if(!finalTripIds.size){
    return new Set();
  }

  const result =
    new Set();

  for(const state of states){
    if(
      finalTripIds.has(
        clean(state.dispatchTripId)
      )
    ){
      result.add(
        String(state.externalTripObjectId)
      );
    }
  }

  for(const row of rows){
    if(
      clean(row.transferredTripId) &&
      finalTripIds.has(
        clean(row.transferredTripId)
      )
    ){
      result.add(
        String(row._id)
      );
    }
  }

  return result;
}

function getTripModel(){

  const Trip =
    global.Trip ||
    mongoose.models.Trip ||
    null;

  if(!Trip){
    throw new Error(
      "Trip model not loaded"
    );
  }

  return Trip;
}

function isFinalOrRunningStatus(value){

  const status =
    upper(value)
      .replace(/[\s-]+/g,"_");

  return [
    "ON_TRIP",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "CANCELED",
    "NO_SHOW",
    "NOT_COMPLETED"
  ].includes(status);
}

function phoenixPickupMillis(trip){

  const date =
    clean(trip?.tripDate);

  const time =
    clean(trip?.tripTime);

  if(
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(time)
  ){
    return null;
  }

  const normalizedTime =
    time.length === 5
      ? `${time}:00`
      : time;

  const value =
    new Date(
      `${date}T${normalizedTime}-07:00`
    ).getTime();

  return Number.isFinite(value)
    ? value
    : null;
}

function externalReviewTripPayload(
  externalTrip
){

  const now =
    new Date();

  const serviceKey =
    normalizeServiceKey(
      externalTrip.serviceKey ||
      externalTrip.serviceName ||
      "STANDARD"
    );

  return {
    tenantId:
      externalTrip.tenantId,

    type:"company",

    tripNumber:
      clean(
        externalTrip.ghExternalTripNumber ||
        externalTrip.externalTripNumber ||
        externalTrip.externalTripId
      ),

    externalSource:"BROKER",
    source:"BROKER",
    bookingSource:"BROKER",

    brokerName:
      clean(externalTrip.brokerName),
    brokerCode:
      clean(externalTrip.brokerCode),
    brokerTripId:
      clean(externalTrip.externalTripId),

    serviceKey,
    serviceCode:serviceKey,
    serviceType:serviceKey,

    tripDate:
      clean(externalTrip.tripDate),
    tripTime:
      clean(externalTrip.tripTime),
    appointmentTime:
      clean(externalTrip.appointmentTime),
    returnTime:
      clean(externalTrip.returnTime),

    clientName:
      clean(externalTrip.clientName),
    clientPhone:
      clean(externalTrip.clientPhone),
    clientEmail:
      clean(externalTrip.clientEmail),
    memberId:
      clean(externalTrip.memberId),

    pickup:
      clean(externalTrip.pickup),
    pickupLat:
      Number.isFinite(
        Number(externalTrip.pickupLat)
      )
        ? Number(externalTrip.pickupLat)
        : null,
    pickupLng:
      Number.isFinite(
        Number(externalTrip.pickupLng)
      )
        ? Number(externalTrip.pickupLng)
        : null,

    dropoff:
      clean(externalTrip.dropoff),
    dropoffLat:
      Number.isFinite(
        Number(externalTrip.dropoffLat)
      )
        ? Number(externalTrip.dropoffLat)
        : null,
    dropoffLng:
      Number.isFinite(
        Number(externalTrip.dropoffLng)
      )
        ? Number(externalTrip.dropoffLng)
        : null,

    stops:
      Array.isArray(externalTrip.stops)
        ? externalTrip.stops
        : [],

    notes:
      clean(externalTrip.notes),

    isShared:false,
    tripType:"INDIVIDUAL",

    status:"Not Completed",
    dispatchReviewStatus:"Not Completed",

    dispatchSelected:false,
    disabled:true,

    finalStatusConfirmed:true,
    finalStatusConfirmedAt:now,

    dispatchFinalConfirmed:true,
    dispatchFinalConfirmedAt:now,

    finalConfirmed:true,
    finalConfirmedAt:now
  };
}

async function expireOverdueExternalTrips(
  tenantId
){

  const Trip =
    getTripModel();

  const candidates =
    await ExternalTrip.find({
      tenantId,
      status:{
        $in:[
          "RECEIVED",
          "READY",
          "HELD",
          "UPDATED"
        ]
      }
    });

  if(!candidates.length){
    return 0;
  }

  const nowMs =
    Date.now();

  const graceMs =
    2 * 60 * 60 * 1000;

  let expiredCount = 0;

  for(const externalTrip of candidates){

    const pickupMs =
      phoenixPickupMillis(
        externalTrip
      );

    if(
      pickupMs === null ||
      nowMs <
        pickupMs + graceMs
    ){
      continue;
    }

    const tripNumber =
      clean(
        externalTrip.ghExternalTripNumber ||
        externalTrip.externalTripNumber
      );

    let reviewTrip = null;

    if(tripNumber){
      reviewTrip =
        await Trip.findOne({
          tenantId,
          tripNumber
        });
    }

    if(
      !reviewTrip &&
      clean(
        externalTrip.externalTripId
      )
    ){
      reviewTrip =
        await Trip.findOne({
          tenantId,
          brokerCode:
            externalTrip.brokerCode,
          brokerTripId:
            externalTrip.externalTripId
        });
    }

    if(
      reviewTrip &&
      isFinalOrRunningStatus(
        reviewTrip.status ||
        reviewTrip.dispatchStatus
      )
    ){
      if(
        upper(
          reviewTrip.status ||
          reviewTrip.dispatchStatus
        )
          .replace(/[\s-]+/g,"_") ===
        "NOT_COMPLETED"
      ){
        externalTrip.status =
          "TRANSFERRED";
        externalTrip.transferEligible =
          false;
        externalTrip.transferredToTripsHub =
          true;
        externalTrip.transferredTripId =
          reviewTrip._id;
        externalTrip.transferredAt =
          new Date();

        await externalTrip.save();
        expiredCount += 1;
      }

      continue;
    }

    const confirmedAt =
      new Date();

    if(!reviewTrip){

      const created =
        await Trip.create(
          externalReviewTripPayload(
            externalTrip
          )
        );

      reviewTrip =
        created;

    }else{

      reviewTrip.status =
        "Not Completed";

      reviewTrip.dispatchReviewStatus =
        "Not Completed";

      reviewTrip.dispatchSelected =
        false;

      reviewTrip.disabled =
        true;

      reviewTrip.finalStatusConfirmed =
        true;

      reviewTrip.finalStatusConfirmedAt =
        confirmedAt;

      reviewTrip.dispatchFinalConfirmed =
        true;

      reviewTrip.dispatchFinalConfirmedAt =
        confirmedAt;

      reviewTrip.finalConfirmed =
        true;

      reviewTrip.finalConfirmedAt =
        confirmedAt;

      await reviewTrip.save();
    }

    externalTrip.status =
      "TRANSFERRED";

    externalTrip.brokerStatus =
      "NOT_COMPLETED";

    externalTrip.transferEligible =
      false;

    externalTrip.transferredToTripsHub =
      true;

    externalTrip.transferredTripId =
      reviewTrip._id;

    externalTrip.transferredAt =
      new Date();

    externalTrip.lastBrokerUpdateAt =
      new Date();

    await externalTrip.save();

    expiredCount += 1;
  }

  return expiredCount;
}

function normalizeServiceKey(value){

  const raw =
    clean(value)
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!raw){
    return "STANDARD";
  }

  if(
    raw === "ST" ||
    raw === "STD" ||
    raw.includes("STANDARD")
  ){
    return "STANDARD";
  }

  if(
    raw === "SH" ||
    raw.includes("SHARED")
  ){
    return "SHARED";
  }

  if(
    raw === "WC" ||
    raw === "WH" ||
    raw.includes("WHEELCHAIR") ||
    raw.includes("WHEEL CHAIR")
  ){
    return "WHEELCHAIR";
  }

  if(
    raw === "TX" ||
    raw.includes("TAXI")
  ){
    return "TAXI";
  }

  if(
    raw === "LM" ||
    raw.includes("LIMO")
  ){
    return "LIMO";
  }

  if(raw === "XL"){
    return "XL";
  }

  return raw.replace(/\s+/g,"_");
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

      await expireOverdueExternalTrips(
        req.authUser.tenantId
      );

      const filter = {
        tenantId:
          req.authUser.tenantId
      };

      if(req.query.status){
        filter.status =
          String(
            req.query.status
          ).toUpperCase();
      }else{
        filter.status = {
          $ne:"TRANSFERRED"
        };
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

      let trips =
        await ExternalTrip.find(
          filter
        )
        .sort({
          tripDate:1,
          tripTime:1,
          createdAt:1
        })
        .lean();

      /*
        FINAL CONFIRMATION EXIT RULE

        Once the dispatcher performs Final Confirmation, the source trip leaves
        External Trips Hub regardless of the final result:
        Completed / Cancelled / No Show / Not Completed.
      */
      const finalConfirmedExternalIds =
        await getFinalConfirmedExternalIdSet(
          req.authUser.tenantId,
          trips
        );

      if(finalConfirmedExternalIds.size){
        trips =
          trips.filter(
            trip=>
              !finalConfirmedExternalIds.has(
                String(trip._id)
              )
          );
      }

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
            normalizeExternalServiceKey(
              req.body.serviceKey ||
              "STANDARD"
            );

          trip.ghExternalTripNumber =
            replaceExternalTripServiceSuffix(
              trip.ghExternalTripNumber,
              trip.serviceKey
            ) ||
            trip.ghExternalTripNumber;

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
