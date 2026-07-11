"use strict";

const express = require("express");
const mongoose = require("mongoose");

const {
  createTripSetupIntent,
  confirmSavedPaymentMethod,
  authorizeTripAmount
} = require("../utils/tripPaymentEngine");

const router = express.Router();

const {
  sendTripStatusEmail
} = require("../utils/tripEmailEngine");

function Trip(){
  const model = global.Trip || mongoose.models.Trip;
  if(!model){
    throw new Error("tripPaymentRoutes must be mounted after the Trip model");
  }
  return model;
}

function clean(value){
  return String(value ?? "").trim();
}

function tripStartDate(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);
  if(!date || !time){
    return null;
  }

  // Sunbeam currently operates in America/Phoenix (UTC-07 year-round).
  const parsed = new Date(`${date}T${time}:00-07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isClosed(trip){
  const status = clean(trip.status).toLowerCase();
  return ["completed", "cancelled", "no show", "not completed"]
    .includes(status);
}

router.post("/:tripId/setup-intent", async (req,res)=>{
  try{
    const trip = await Trip().findById(req.params.tripId);
    if(!trip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }
    if(isClosed(trip)){
      return res.status(400).json({success:false,message:"Trip is closed"});
    }

    const setupIntent = await createTripSetupIntent(trip);
    return res.json({
      success:true,
      clientSecret:setupIntent.client_secret,
      customerId:trip.stripeCustomerId,
      paymentStatus:trip.paymentStatus
    });
  }catch(err){
    console.error("SETUP INTENT ERROR:",err);
    return res.status(400).json({success:false,message:err.message});
  }
});

router.post("/:tripId/setup-success", async (req,res)=>{
  try{
    const trip = await Trip().findById(req.params.tripId);
    if(!trip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }

    const setupIntentId = clean(req.body?.setupIntentId);
    if(!setupIntentId){
      return res.status(400).json({success:false,message:"Missing SetupIntent"});
    }

    await confirmSavedPaymentMethod(trip,setupIntentId);

    if(!trip.confirmationEmailSent){
      const sent = await sendTripStatusEmail(trip,"CONFIRMED");
      if(sent){
        trip.confirmationEmailSent = true;
        await trip.save();
      }
    }

    return res.json({
      success:true,
      paymentStatus:trip.paymentStatus,
      message:"Payment method saved. No charge has been made."
    });
  }catch(err){
    console.error("SETUP SUCCESS ERROR:",err);
    return res.status(400).json({success:false,message:err.message});
  }
});

let authorizationJobRunning = false;

async function authorizeTripsDueWithin24Hours(){
  if(authorizationJobRunning){
    return;
  }

  authorizationJobRunning = true;
  try{
    const now = new Date();
    const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const trips = await Trip().find({
      paymentStatus:{
        $in:["PAYMENT_METHOD_SAVED","PAYMENT_REQUIRED"]
      },
      stripeCustomerId:{$ne:""},
      stripePaymentMethodId:{$ne:""},
      status:{$nin:["Completed","Cancelled","No Show","Not Completed"]}
    });

    for(const trip of trips){
      const startsAt = tripStartDate(trip);
      if(!startsAt || startsAt <= now || startsAt > limit){
        continue;
      }

      try{
        await authorizeTripAmount(
          trip,
          Number(trip.priceAmount || trip.finalPrice || 0),
          "TWENTY_FOUR_HOUR_HOLD"
        );
        console.log("PAYMENT AUTHORIZED:",trip.tripNumber);
      }catch(err){
        // The engine preserves PAYMENT_REQUIRED and the decline reason.
        console.error("PAYMENT AUTHORIZATION FAILED:",trip.tripNumber,err.message);
        if(!trip.paymentRequiredEmailSentAt){
          const sent = await sendTripStatusEmail(trip,"PAYMENT_REQUIRED");
          if(sent){
            trip.paymentRequiredEmailSentAt = new Date();
            await trip.save();
          }
        }
      }
    }
  }finally{
    authorizationJobRunning = false;
  }
}

function startTripAuthorizationScheduler(){
  // Run once after startup, then every five minutes.
  setTimeout(()=>{
    authorizeTripsDueWithin24Hours().catch(console.error);
  },5000);

  const timer = setInterval(()=>{
    authorizeTripsDueWithin24Hours().catch(console.error);
  },5 * 60 * 1000);

  if(typeof timer.unref === "function"){
    timer.unref();
  }

  return timer;
}

router.authorizeTripsDueWithin24Hours = authorizeTripsDueWithin24Hours;
router.startTripAuthorizationScheduler = startTripAuthorizationScheduler;

module.exports = router;