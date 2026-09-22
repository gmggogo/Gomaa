const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT HELPERS
========================= */

function clean(value){
  return String(
    value ?? ""
  ).trim();
}

function readBearerToken(req){

  const header =
    clean(
      req.headers?.authorization
    );

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function readAuthUser(req){

  const token =
    readBearerToken(req);

  if(!token){
    return null;
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    return {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

  }catch(err){

    return null;
  }
}

/*
  PAYMENT SUCCESS can be called by the customer
  after Stripe, so a staff JWT may not exist.

  Tenant is resolved in this order:

  1) Valid logged-in JWT tenant
  2) Stripe PaymentIntent metadata.tenantId

  PLATFORM_ADMIN may use tenantId from body only
  when a valid PLATFORM_ADMIN JWT is present.
*/
async function resolvePaymentTenant({
  req,
  stripe,
  tripId,
  paymentIntentId
}){

  const authUser =
    readAuthUser(req);

  if(
    authUser &&
    authUser.role ===
    "PLATFORM_ADMIN"
  ){

    const tenantId =
      clean(
        req.body?.tenantId
      );

    if(!tenantId){

      throw new Error(
        "Tenant Required"
      );
    }

    return {
      tenantId,
      authUser,
      paymentIntent:null
    };
  }

  if(
    authUser?.tenantId
  ){

    return {
      tenantId:
        clean(
          authUser.tenantId
        ),

      authUser,
      paymentIntent:null
    };
  }

  /*
    Public customer payment callback:
    trust Stripe metadata, never raw tenantId
    from an unauthenticated request body.
  */

  if(
    !stripe ||
    !paymentIntentId
  ){

    throw new Error(
      "Payment verification required"
    );
  }

  const paymentIntent =
    await stripe.paymentIntents.retrieve(
      paymentIntentId
    );

  if(!paymentIntent){

    throw new Error(
      "Payment Intent not found"
    );
  }

  const metadataTripId =
    clean(
      paymentIntent.metadata?.tripId
    );

  if(
    metadataTripId &&
    metadataTripId !==
    clean(tripId)
  ){

    throw new Error(
      "Payment does not match trip"
    );
  }

  const tenantId =
    clean(
      paymentIntent.metadata?.tenantId
    );

  if(!tenantId){

    throw new Error(
      "Tenant missing from payment metadata"
    );
  }

  return {
    tenantId,
    authUser:null,
    paymentIntent
  };
}

module.exports = ({
  Trip,
  stripe,
  sendTripStatusEmail
}) => {

  router.post(
    "/payment-success",
    async (req, res) => {

      try {

        const {
          tripId,
          paymentIntentId
        } = req.body;

        if (!tripId) {

          return res.status(400).json({
            message: "Missing tripId"
          });

        }

        /*
          Resolve tenant before reading/updating Trip.
          This prevents a payment callback from touching
          a trip belonging to another tenant.
        */

        let tenantContext;

        try{

          tenantContext =
            await resolvePaymentTenant({
              req,
              stripe,
              tripId,
              paymentIntentId
            });

        }catch(tenantErr){

          return res.status(403).json({
            message:
              tenantErr.message ||
              "Tenant verification failed"
          });
        }

        const tenantId =
          tenantContext.tenantId;

        const trip =
          await Trip.findOne({
            _id:tripId,
            tenantId
          });

        if (!trip) {

          return res.status(404).json({
            message: "Trip not found"
          });

        }

        /*
          If this trip already has a PaymentIntent,
          never allow a different PaymentIntent
          to overwrite it.
        */

        if(
          paymentIntentId &&
          trip.paymentIntentId &&
          String(trip.paymentIntentId) !==
          String(paymentIntentId)
        ){

          return res.status(409).json({
            message:
              "Payment Intent does not match this trip"
          });
        }

        /*
          When Stripe was used for tenant resolution,
          also require the payment to belong to this trip
          when metadata.tripId exists.
        */

        const verifiedIntent =
          tenantContext.paymentIntent;

        if(
          verifiedIntent &&
          verifiedIntent.metadata?.tripId &&
          String(
            verifiedIntent.metadata.tripId
          ) !==
          String(trip._id)
        ){

          return res.status(403).json({
            message:
              "Payment does not belong to this trip"
          });
        }

        if (paymentIntentId) {

          trip.paymentIntentId =
            paymentIntentId;

        }

        /*
          Keep tenant ownership permanently.
        */

        trip.tenantId =
          tenantId;

        trip.dispatchSelected =
          true;

        if (!trip.cancelToken) {

          trip.cancelToken =
            crypto
              .randomBytes(32)
              .toString("hex");

        }

        await trip.save();

        sendTripStatusEmail(
          trip,
          "CONFIRMED"
        ).catch(err => {

          console.log(
            "EMAIL ERROR:",
            err
          );

        });

        console.log(
          "✅ PAYMENT SUCCESS:",
          trip.tripNumber,
          "TENANT:",
          tenantId
        );

        return res.json({
          success: true
        });

      } catch (err) {

        console.log(
          "PAYMENT SUCCESS ERROR:",
          err
        );

        return res.status(500).json({
          message: "Server error"
        });

      }

    }
  );

  return router;

};