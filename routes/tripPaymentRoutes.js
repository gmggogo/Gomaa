"use strict";

const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

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
    throw new Error(
      "tripPaymentRoutes must be mounted after the Trip model"
    );
  }

  return model;
}

function clean(value){
  return String(value ?? "").trim();
}

function tenantSlugFromTrip(trip){

  return clean(
    trip?.tenantSlug ||
    ""
  ).toLowerCase();
}

function tenantQueryString(trip){

  const slug =
    tenantSlugFromTrip(trip);

  if(slug){

    return (
      `&tenant=${encodeURIComponent(slug)}`
    );
  }

  return "";
}

function isClosed(trip){

  const status =
    clean(
      trip.status
    ).toLowerCase();

  return [
    "completed",
    "cancelled",
    "no show",
    "not completed"
  ].includes(status);
}

function tripStartDate(trip){

  const date =
    clean(
      trip.tripDate
    );

  const time =
    clean(
      trip.tripTime
    );

  if(!date || !time){
    return null;
  }

  const parsed =
    new Date(
      `${date}T${time}:00-07:00`
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

async function confirmTripAfterCardSaved(trip){

  const currentStatus =
    clean(
      trip.status
    ).toLowerCase();

  if(
    !currentStatus ||
    currentStatus === "booked" ||
    currentStatus === "scheduled" ||
    currentStatus === "pending payment"
  ){
    trip.status = "Confirmed";
  }

  trip.dispatchSelected = true;

  if(
    !clean(
      trip.paymentStatus
    ) ||
    clean(
      trip.paymentStatus
    ).toUpperCase() === "SETUP_PENDING"
  ){
    trip.paymentStatus =
      "PAYMENT_METHOD_SAVED";
  }

  trip.paymentFailureCode = "";
  trip.paymentFailureMessage = "";
  trip.paymentRequiredEmailSentAt = null;

  if(!trip.cancelToken){
    trip.cancelToken =
      crypto
        .randomBytes(32)
        .toString("hex");
  }

  await trip.save();
  return trip;
}

/* =========================================
   CREATE STRIPE-HOSTED CHECKOUT
========================================= */

router.post(
  "/:tripId/checkout-session",
  async (req,res)=>{

    try{

      const trip =
        await Trip().findById(
          req.params.tripId
        );

      if(!trip){

        return res.status(404).json({
          success:false,
          message:"Trip not found"
        });
      }

      const tenantId =
        clean(
          trip.tenantId
        );

      if(!tenantId){

        return res.status(403).json({
          success:false,
          message:"Trip tenant is missing"
        });
      }

      const tenantSlug =
        tenantSlugFromTrip(
          trip
        );

      const tenantPart =
        tenantQueryString(
          trip
        );

      if(isClosed(trip)){

        return res.status(400).json({
          success:false,
          message:"Trip is closed"
        });
      }

      if(
        trip.stripePaymentMethodId
      ){

        await confirmTripAfterCardSaved(
          trip
        );

        return res.json({
          success:true,
          alreadySaved:true,

          redirectUrl:
            `${PUBLIC_BASE_URL}/booking/payment.html` +
            `?tripId=${encodeURIComponent(trip._id)}` +
            tenantPart +
            `&saved=1`
        });
      }

      const customerId =
        await ensureStripeCustomer(
          trip
        );

      const successUrl =
        `${PUBLIC_BASE_URL}/booking/payment.html` +
        `?tripId=${encodeURIComponent(trip._id)}` +
        tenantPart +
        `&session_id={CHECKOUT_SESSION_ID}`;

      const cancelUrl =
        `${PUBLIC_BASE_URL}/booking/payment.html` +
        `?tripId=${encodeURIComponent(trip._id)}` +
        tenantPart +
        `&cancelled=1`;

      const session =
        await stripe.checkout.sessions.create({

          mode:"setup",

          customer:
            customerId,

          payment_method_types:[
            "card"
          ],

          client_reference_id:
            String(
              trip._id
            ),

          metadata:{

            tenantId:
              String(
                tenantId
              ),

            tenantSlug:
              String(
                tenantSlug ||
                ""
              ),

            tripId:
              String(
                trip._id
              ),

            tripNumber:
              String(
                trip.tripNumber ||
                ""
              )
          },

          setup_intent_data:{
            metadata:{

              tenantId:
                String(
                  tenantId
                ),

              tripId:
                String(
                  trip._id
                ),

              tripNumber:
                String(
                  trip.tripNumber ||
                  ""
                )
            }
          },

          success_url:
            successUrl,

          cancel_url:
            cancelUrl
        });

      trip.paymentStatus =
        "SETUP_PENDING";

      await trip.save();

      return res.json({
        success:true,
        checkoutUrl:
          session.url
      });

    }catch(err){

      console.error(
        "CHECKOUT SESSION ERROR:",
        err
      );

      return res.status(400).json({
        success:false,

        message:
          err.message ||
          "Unable to open Stripe Checkout"
      });
    }
  }
);

/* =========================================
   VERIFY STRIPE CHECKOUT RETURN
========================================= */

router.post(
  "/:tripId/checkout-success",
  async (req,res)=>{

    try{

      const sessionId =
        clean(
          req.body?.sessionId
        );

      if(!sessionId){

        return res.status(400).json({
          success:false,
          message:"Missing Stripe session"
        });
      }

      const session =
        await stripe.checkout.sessions.retrieve(
          sessionId
        );

      const tenantId =
        clean(
          session.metadata?.tenantId
        );

      if(!tenantId){

        return res.status(403).json({
          success:false,
          message:
            "Tenant missing from Stripe session"
        });
      }

      const trip =
        await Trip().findOne({

          _id:
            req.params.tripId,

          tenantId
        });

      if(!trip){

        return res.status(404).json({
          success:false,
          message:"Trip not found"
        });
      }

      if(
        session.status !==
        "complete" ||

        String(
          session.metadata?.tripId ||
          session.client_reference_id ||
          ""
        ) !==
        String(
          trip._id
        )
      ){

        return res.status(400).json({
          success:false,
          message:
            "Stripe setup was not completed"
        });
      }

      if(
        String(
          session.metadata?.tenantId ||
          ""
        ) !==
        String(
          trip.tenantId ||
          ""
        )
      ){

        return res.status(403).json({
          success:false,
          message:
            "Stripe tenant mismatch"
        });
      }

      if(
        trip.stripeCustomerId &&
        String(
          session.customer ||
          ""
        ) !==
        String(
          trip.stripeCustomerId
        )
      ){

        return res.status(403).json({
          success:false,
          message:
            "Stripe customer mismatch"
        });
      }

      const setupIntentId =
        clean(
          session.setup_intent
        );

      if(!setupIntentId){

        return res.status(400).json({
          success:false,
          message:
            "Stripe payment method is missing"
        });
      }

      await confirmSavedPaymentMethod(
        trip,
        setupIntentId
      );

      await confirmTripAfterCardSaved(
        trip
      );

      if(
        !trip.confirmationEmailSent
      ){

        const sent =
          await sendTripStatusEmail(
            trip,
            "CONFIRMED"
          );

        if(sent){

          trip.confirmationEmailSent =
            true;

          await trip.save();
        }
      }

      return res.json({

        success:true,

        paymentStatus:
          trip.paymentStatus,

        message:
          "Booking confirmed"
      });

    }catch(err){

      console.error(
        "CHECKOUT SUCCESS ERROR:",
        err
      );

      return res.status(400).json({

        success:false,

        message:
          err.message ||
          "Unable to confirm Stripe setup"
      });
    }
  }
);

let authorizationJobRunning =
  false;

/* =========================================
   24-HOUR AUTHORIZATION SCHEDULER
========================================= */

async function authorizeTripsDueWithin24Hours(){

  if(
    authorizationJobRunning
  ){
    return;
  }

  authorizationJobRunning =
    true;

  try{

    const now =
      new Date();

    const limit =
      new Date(
        now.getTime() +
        24 * 60 * 60 * 1000
      );

    /*
      IMPORTANT:
      tenantId is an ObjectId field.

      Never put an empty string inside $nin for an ObjectId field.
      Mongoose tries to cast "" to ObjectId and throws CastError.

      Missing/null tenant values are safely excluded with:
      $exists:true + $ne:null
    */

    const trips =
      await Trip().find({

        tenantId:{
          $exists:true,
          $ne:null
        },

        paymentStatus:{
          $in:[
            "PAYMENT_METHOD_SAVED",
            "PAYMENT_REQUIRED"
          ]
        },

        stripeCustomerId:{
          $ne:""
        },

        stripePaymentMethodId:{
          $ne:""
        },

        status:{
          $nin:[
            "Completed",
            "Cancelled",
            "No Show",
            "Not Completed"
          ]
        }
      });

    for(
      const trip
      of trips
    ){

      const startsAt =
        tripStartDate(
          trip
        );

      if(
        !startsAt ||
        startsAt <= now ||
        startsAt > limit
      ){
        continue;
      }

      try{

        await authorizeTripAmount(

          trip,

          Number(
            trip.priceAmount ||
            trip.finalPrice ||
            0
          ),

          "TWENTY_FOUR_HOUR_HOLD"
        );

        console.log(
          "PAYMENT AUTHORIZED:",
          trip.tripNumber,
          "TENANT:",
          trip.tenantId
        );

      }catch(err){

        console.error(
          "PAYMENT AUTHORIZATION FAILED:",
          trip.tripNumber,
          "TENANT:",
          trip.tenantId,
          err.message
        );

        if(
          !trip.paymentRequiredEmailSentAt
        ){

          const sent =
            await sendTripStatusEmail(
              trip,
              "PAYMENT_REQUIRED"
            );

          if(sent){

            trip.paymentRequiredEmailSentAt =
              new Date();

            await trip.save();
          }
        }
      }
    }

  }finally{

    authorizationJobRunning =
      false;
  }
}

function startTripAuthorizationScheduler(){

  setTimeout(
    ()=>{

      authorizeTripsDueWithin24Hours()
        .catch(
          console.error
        );

    },
    5000
  );

  const timer =
    setInterval(
      ()=>{

        authorizeTripsDueWithin24Hours()
          .catch(
            console.error
          );

      },
      5 * 60 * 1000
    );

  if(
    typeof timer.unref ===
    "function"
  ){
    timer.unref();
  }

  return timer;
}

router.authorizeTripsDueWithin24Hours =
  authorizeTripsDueWithin24Hours;

router.startTripAuthorizationScheduler =
  startTripAuthorizationScheduler;

module.exports =
  router;