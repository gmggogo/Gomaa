"use strict";

const express = require("express");
const mongoose = require("mongoose");

const {
  stripe,
  ensureStripeCustomer,
  confirmSavedPaymentMethod,
  authorizeTripAmount
} = require("../utils/tripPaymentEngine");

const {
  sendTripStatusEmail
} = require("../utils/tripEmailEngine");

const router = express.Router();

const PUBLIC_BASE_URL = String(
  process.env.PUBLIC_BASE_URL ||
  "https://sunbeam-933q.onrender.com"
).trim().replace(/\/+$/, "");

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

function isClosed(trip){
  const status = clean(trip.status).toLowerCase();
  return ["completed", "cancelled", "no show", "not completed"]
    .includes(status);
}

function tripStartDate(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);
  if(!date || !time){
    return null;
  }

  const parsed = new Date(`${date}T${time}:00-07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* =========================================
   CREATE STRIPE-HOSTED CHECKOUT
   No card field is rendered by Sunbeam.
========================================= */

router.post("/:tripId/checkout-session", async (req,res)=>{
  try{
    const trip = await Trip().findById(req.params.tripId);

    if(!trip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }

    if(isClosed(trip)){
      return res.status(400).json({success:false,message:"Trip is closed"});
    }

    if(trip.stripePaymentMethodId){
      return res.json({
        success:true,
        alreadySaved:true,
        redirectUrl:
          `${PUBLIC_BASE_URL}/booking/payment.html?tripId=${encodeURIComponent(trip._id)}&saved=1`
      });
    }

    const customerId = await ensureStripeCustomer(trip);

    const successUrl =
      `${PUBLIC_BASE_URL}/booking/payment.html` +
      `?tripId=${encodeURIComponent(trip._id)}` +
      `&session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl =
      `${PUBLIC_BASE_URL}/booking/payment.html` +
      `?tripId=${encodeURIComponent(trip._id)}` +
      `&cancelled=1`;

    const session = await stripe.checkout.sessions.create({
      mode:"setup",
      customer:customerId,
      payment_method_types:["card"],
      client_reference_id:String(trip._id),
      metadata:{
        tripId:String(trip._id),
        tripNumber:String(trip.tripNumber || "")
      },
      setup_intent_data:{
        metadata:{
          tripId:String(trip._id),
          tripNumber:String(trip.tripNumber || "")
        }
      },
      success_url:successUrl,
      cancel_url:cancelUrl
    });

    trip.paymentStatus = "SETUP_PENDING";
    await trip.save();

    return res.json({
      success:true,
      checkoutUrl:session.url
    });

  }catch(err){
    console.error("CHECKOUT SESSION ERROR:",err);
    return res.status(400).json({
      success:false,
      message:err.message || "Unable to open Stripe Checkout"
    });
  }
});

/* =========================================
   VERIFY STRIPE CHECKOUT RETURN
========================================= */

router.post("/:tripId/checkout-success", async (req,res)=>{
  try{
    const trip = await Trip().findById(req.params.tripId);

    if(!trip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }

    const sessionId = clean(req.body?.sessionId);
    if(!sessionId){
      return res.status(400).json({success:false,message:"Missing Stripe session"});
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if(
      session.status !== "complete" ||
      String(session.metadata?.tripId || session.client_reference_id || "") !== String(trip._id)
    ){
      return res.status(400).json({success:false,message:"Stripe setup was not completed"});
    }

    if(
      trip.stripeCustomerId &&
      String(session.customer || "") !== String(trip.stripeCustomerId)
    ){
      return res.status(403).json({success:false,message:"Stripe customer mismatch"});
    }

    const setupIntentId = clean(session.setup_intent);
    if(!setupIntentId){
      return res.status(400).json({success:false,message:"Stripe payment method is missing"});
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
      message:"Booking confirmed"
    });

  }catch(err){
    console.error("CHECKOUT SUCCESS ERROR:",err);
    return res.status(400).json({
      success:false,
      message:err.message || "Unable to confirm Stripe setup"
    });
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
      paymentStatus:{$in:["PAYMENT_METHOD_SAVED","PAYMENT_REQUIRED"]},
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