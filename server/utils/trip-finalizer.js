// =========================================
// FILE: server/utils/trip-finalizer.js
// SINGLE SOURCE OF TRUTH
// COMPLETE / NOSHOW / CANCEL
// INDIVIDUAL + SHARED
// =========================================

function n(v){
  return Number(v || 0);
}

/* =========================================
INDIVIDUAL
========================================= */

async function finalizeIndividualTrip(
  trip,
  action,
  options = {}
){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const finalPrice =
    n(options.finalPrice);

  const cancelFee =
    n(options.cancelFee);

  const noShowFee =
    n(options.noShowFee);

  const refundAmount =
    n(options.refundAmount);

  switch(
    String(action || "")
      .toUpperCase()
  ){

    /* =====================
       COMPLETE
    ===================== */

    case "COMPLETE":

      trip.status =
        "Completed";

      trip.finalPrice =
        finalPrice;

      trip.isFinalized =
        true;

      trip.finalizedAt =
        new Date();

      break;

    /* =====================
       NO SHOW
    ===================== */

    case "NOSHOW":

      trip.status =
        "No Show";

      trip.noShowFee =
        noShowFee;

      trip.finalPrice =
        noShowFee;

      trip.isFinalized =
        true;

      trip.finalizedAt =
        new Date();

      break;

    /* =====================
       CANCEL
    ===================== */

    case "CANCEL":

      trip.status =
        "Cancelled";

      trip.cancelFee =
        cancelFee;

      trip.finalPrice =
        cancelFee;

      trip.refundAmount =
        refundAmount;

      trip.cancelDateTime =
        new Date();

      trip.isFinalized =
        true;

      trip.finalizedAt =
        new Date();

      break;

    default:

      throw new Error(
        "Unknown Action"
      );

  }

  await trip.save();

  return trip;

}

/* =========================================
SHARED PASSENGER
========================================= */

async function finalizeSharedPassenger(
  trip,
  passengerId,
  action,
  options = {}
){

  if(!trip){
    throw new Error(
      "Trip Missing"
    );
  }

  const passenger =
    (trip.passengers || [])
    .find(p =>

      String(
        p.passengerId
      ) ===
      String(
        passengerId
      )

    );

  if(!passenger){

    throw new Error(
      "Passenger Missing"
    );

  }

  const finalPrice =
    n(options.finalPrice);

  const cancelFee =
    n(options.cancelFee);

  const noShowFee =
    n(options.noShowFee);

  switch(
    String(action || "")
      .toUpperCase()
  ){

    /* =====================
       COMPLETE
    ===================== */

    case "COMPLETE":

      passenger.status =
        "Completed";

      passenger.finalPrice =
        finalPrice;

      passenger.isFinalized =
        true;

      passenger.finalizedAt =
        new Date();

      break;

    /* =====================
       NO SHOW
    ===================== */

    case "NOSHOW":

      passenger.status =
        "No Show";

      passenger.noShowFee =
        noShowFee;

      passenger.finalPrice =
        noShowFee;

      passenger.isFinalized =
        true;

      passenger.finalizedAt =
        new Date();

      break;

    /* =====================
       CANCEL
    ===================== */

    case "CANCEL":

      passenger.status =
        "Cancelled";

      passenger.cancelFee =
        cancelFee;

      passenger.finalPrice =
        cancelFee;

      passenger.isFinalized =
        true;

      passenger.finalizedAt =
        new Date();

      break;

    default:

      throw new Error(
        "Unknown Action"
      );

  }

  /* =====================
     GROUP TOTAL
  ===================== */

  trip.groupTotal =

    (trip.passengers || [])
    .reduce((sum,p)=>{

      return (
        sum +
        n(p.finalPrice)
      );

    },0);

  /* =====================
     GROUP STATUS
  ===================== */

  const totalPassengers =
    trip.passengers.length;

  const completedCount =
    trip.passengers.filter(
      p =>
      p.status ===
      "Completed"
    ).length;

  const cancelledCount =
    trip.passengers.filter(
      p =>
      p.status ===
      "Cancelled"
    ).length;

  const noShowCount =
    trip.passengers.filter(
      p =>
      p.status ===
      "No Show"
    ).length;

  if(
    completedCount ===
    totalPassengers
  ){

    trip.groupStatus =
      "Completed";

  }

  else if(
    cancelledCount ===
    totalPassengers
  ){

    trip.groupStatus =
      "Cancelled";

  }

  else if(
    noShowCount ===
    totalPassengers
  ){

    trip.groupStatus =
      "No Show";

  }

  else{

    trip.groupStatus =
      "Mixed";

  }

  await trip.save();

  return trip;

}

/* =========================================
HELPERS
========================================= */

function calculateGroupTotal(
  trip
){

  return (
    trip.passengers || []
  ).reduce((sum,p)=>{

    return (
      sum +
      n(p.finalPrice)
    );

  },0);

}

module.exports = {

  finalizeIndividualTrip,

  finalizeSharedPassenger,

  calculateGroupTotal

};