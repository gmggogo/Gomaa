"use strict";

const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

function cents(value){
  const amount = Number(value);
  if(!Number.isFinite(amount) || amount < 0){
    throw new Error("Invalid payment amount");
  }
  return Math.round(amount * 100);
}

function dollars(value){
  return Number((Number(value || 0) / 100).toFixed(2));
}

function paymentError(err){
  const message =
    err?.raw?.message ||
    err?.message ||
    "Payment authorization failed";

  const wrapped = new Error(message);
  wrapped.code = err?.code || err?.raw?.code || "PAYMENT_FAILED";
  wrapped.declineCode = err?.decline_code || err?.raw?.decline_code || "";
  wrapped.paymentFailed = true;
  return wrapped;
}

async function ensureStripeCustomer(trip){
  if(trip.stripeCustomerId){
    return trip.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    name: String(trip.clientName || "").trim() || undefined,
    email: String(trip.clientEmail || "").trim() || undefined,
    phone: String(trip.clientPhone || "").trim() || undefined,
    metadata: {
      tripId: String(trip._id),
      tripNumber: String(trip.tripNumber || "")
    }
  });

  trip.stripeCustomerId = customer.id;
  await trip.save();
  return customer.id;
}

async function createTripSetupIntent(trip){
  const customerId = await ensureStripeCustomer(trip);

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: {
      tripId: String(trip._id),
      tripNumber: String(trip.tripNumber || "")
    }
  });

  trip.setupIntentId = setupIntent.id;
  trip.paymentStatus = "SETUP_PENDING";
  await trip.save();

  return setupIntent;
}

async function confirmSavedPaymentMethod(trip, setupIntentId){
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

  if(setupIntent.status !== "succeeded"){
    throw new Error("Card setup has not completed");
  }

  if(String(setupIntent.metadata?.tripId || "") !== String(trip._id)){
    throw new Error("Card setup does not belong to this trip");
  }

  trip.stripeCustomerId = String(setupIntent.customer || trip.stripeCustomerId || "");
  trip.stripePaymentMethodId = String(setupIntent.payment_method || "");
  trip.setupIntentId = setupIntent.id;
  trip.paymentStatus = "PAYMENT_METHOD_SAVED";
  trip.paymentFailureCode = "";
  trip.paymentFailureMessage = "";
  trip.paymentRequiredEmailSentAt = null;
  await trip.save();

  return trip;
}

async function authorizeTripAmount(trip, amount, reason = "TRIP_AUTHORIZATION"){
  const amountCents = cents(amount);

  if(amountCents <= 0){
    throw new Error("Authorization amount must be greater than zero");
  }

  if(!trip.stripeCustomerId || !trip.stripePaymentMethodId){
    throw new Error("Customer payment method is missing");
  }

  try{
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: trip.stripeCustomerId,
      payment_method: trip.stripePaymentMethodId,
      capture_method: "manual",
      confirm: true,
      off_session: true,
      payment_method_types: ["card"],
      metadata: {
        tripId: String(trip._id),
        tripNumber: String(trip.tripNumber || ""),
        purpose: reason
      }
    }, {
      idempotencyKey: `trip-auth-${trip._id}-${amountCents}-${reason}`
    });

    if(intent.status !== "requires_capture"){
      throw new Error(`Unexpected authorization status: ${intent.status}`);
    }

    trip.authorizationPaymentIntentId = intent.id;
    trip.paymentIntentId = intent.id;
    trip.authorizedAmount = dollars(intent.amount_capturable || intent.amount);
    trip.paymentStatus = "AUTHORIZED";
    trip.paymentAuthorizedAt = new Date();
    trip.authorizationExpiresAt = intent.capture_before
      ? new Date(intent.capture_before * 1000)
      : null;
    trip.paymentFailureCode = "";
    trip.paymentFailureMessage = "";
    trip.paymentRequiredEmailSentAt = null;
    await trip.save();

    return intent;
  }catch(err){
    trip.paymentStatus = "PAYMENT_REQUIRED";
    trip.paymentFailureCode = err?.code || err?.raw?.code || "PAYMENT_FAILED";
    trip.paymentFailureMessage = err?.message || "Authorization failed";
    await trip.save();
    throw paymentError(err);
  }
}

async function changeAuthorizedAmount(trip, newAmount){
  const newCents = cents(newAmount);
  const intentId = trip.authorizationPaymentIntentId || trip.paymentIntentId;

  if(!intentId || trip.paymentStatus !== "AUTHORIZED"){
    return authorizeTripAmount(trip, newAmount, "ROUTE_CHANGE");
  }

  const current = await stripe.paymentIntents.retrieve(intentId);
  if(current.status !== "requires_capture"){
    throw new Error("The existing authorization is no longer active");
  }

  const oldCents = Number(current.amount || 0);
  if(newCents === oldCents){
    return current;
  }

  try{
    let updated;

    if(newCents > oldCents){
      /*
        Incremental authorization is not enabled on every Stripe account.
        Authorize the exact replacement amount first. Only after it succeeds
        do we release the old hold, so a decline leaves the old route/hold.
      */
      updated = await stripe.paymentIntents.create({
        amount:newCents,
        currency:"usd",
        customer:trip.stripeCustomerId,
        payment_method:trip.stripePaymentMethodId,
        capture_method:"manual",
        confirm:true,
        off_session:true,
        payment_method_types:["card"],
        metadata:{
          tripId:String(trip._id),
          tripNumber:String(trip.tripNumber || ""),
          purpose:"ROUTE_CHANGE_REPLACEMENT"
        }
      },{
        idempotencyKey:`trip-replacement-auth-${trip._id}-${newCents}`
      });

      if(updated.status !== "requires_capture"){
        throw new Error(`Replacement authorization failed: ${updated.status}`);
      }

      await stripe.paymentIntents.cancel(intentId);

      trip.authorizationPaymentIntentId = updated.id;
      trip.paymentIntentId = updated.id;
    }else{
      updated = await stripe.paymentIntents.update(
        intentId,
        { amount: newCents },
        { idempotencyKey: `trip-decrement-${trip._id}-${newCents}` }
      );
    }

    if(updated.status !== "requires_capture"){
      throw new Error(`Authorization update failed: ${updated.status}`);
    }

    trip.authorizedAmount = dollars(updated.amount_capturable || updated.amount);
    trip.paymentStatus = "AUTHORIZED";
    trip.paymentFailureCode = "";
    trip.paymentFailureMessage = "";
    await trip.save();
    return updated;
  }catch(err){
    // Do not modify the trip route or the old authorization on failure.
    trip.paymentFailureCode = err?.code || err?.raw?.code || "AUTH_UPDATE_FAILED";
    trip.paymentFailureMessage = err?.message || "New trip price was declined";
    await trip.save();
    throw paymentError(err);
  }
}

async function captureAuthorizedTrip(trip, finalAmount){
  const intentId = trip.authorizationPaymentIntentId || trip.paymentIntentId;
  if(!intentId){
    throw new Error("Trip authorization is missing");
  }

  const amountCents = cents(finalAmount);
  try{
    const intent = await stripe.paymentIntents.capture(intentId, {
      amount_to_capture: amountCents,
      metadata: {
        finalTripAmount: String(amountCents),
        finalizedAt: new Date().toISOString()
      }
    }, {
      idempotencyKey: `trip-capture-${trip._id}-${amountCents}`
    });

    trip.paymentStatus = "PAID";
    trip.capturedAmount = dollars(intent.amount_received || amountCents);
    trip.paymentCapturedAt = new Date();
    trip.paymentFailureCode = "";
    trip.paymentFailureMessage = "";
    await trip.save();
    return intent;
  }catch(err){
    trip.paymentStatus = "CAPTURE_FAILED";
    trip.paymentFailureCode = err?.code || err?.raw?.code || "CAPTURE_FAILED";
    trip.paymentFailureMessage = err?.message || "Final payment capture failed";
    await trip.save();
    throw paymentError(err);
  }
}

async function captureFeeAndReleaseRest(trip, fee, reason){
  const amountCents = cents(fee);
  const intentId = trip.authorizationPaymentIntentId || trip.paymentIntentId;

  if(!intentId){
    if(amountCents === 0){
      trip.paymentStatus = "VOIDED";
      await trip.save();
      return null;
    }
    return authorizeTripAmount(trip, fee, reason)
      .then(()=>captureAuthorizedTrip(trip, fee));
  }

  if(amountCents === 0){
    const intent = await stripe.paymentIntents.cancel(intentId);
    trip.paymentStatus = "VOIDED";
    trip.authorizedAmount = 0;
    await trip.save();
    return intent;
  }

  return captureAuthorizedTrip(trip, fee);
}

async function cancelAuthorization(trip){
  const intentId = trip.authorizationPaymentIntentId || trip.paymentIntentId;
  if(!intentId){
    return null;
  }

  const intent = await stripe.paymentIntents.retrieve(intentId);
  if(intent.status === "requires_capture"){
    await stripe.paymentIntents.cancel(intentId);
  }

  trip.paymentStatus = "VOIDED";
  trip.authorizedAmount = 0;
  await trip.save();
  return intent;
}

function hasActiveAuthorization(trip){
  return trip?.paymentStatus === "AUTHORIZED" &&
    !!(trip.authorizationPaymentIntentId || trip.paymentIntentId);
}

module.exports = {
  stripe,
  ensureStripeCustomer,
  createTripSetupIntent,
  confirmSavedPaymentMethod,
  authorizeTripAmount,
  changeAuthorizedAmount,
  captureAuthorizedTrip,
  captureFeeAndReleaseRest,
  cancelAuthorization,
  hasActiveAuthorization
};