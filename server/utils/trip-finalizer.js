"use strict";

// =========================================
// FILE: server/utils/trip-finalizer.js
// SINGLE SOURCE OF TRUTH
// CONFIRM / COMPLETE / NOSHOW / CANCEL
// INDIVIDUAL + SHARED
//
// IMPORTANT:
// - This file does NOT call Google.
// - This file does NOT calculate route.
// - This file only saves/locks finalized route data.
// =========================================

/* =========================================
   BASIC HELPERS
========================================= */

function n(v){
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function clean(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return clean(v)
    .replace(/\s+/g,"")
    .toLowerCase();
}

function normalizeAddress(v){
  return clean(v)
    .replace(/\s+/g," ")
    .trim();
}

function normalizeCode(v){

  const c =
    clean(v)
      .toUpperCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(c === "STANDARD") return "ST";
  if(c === "WHEELCHAIR") return "WH";
  if(c === "WHEEL CHAIR") return "WH";
  if(c === "SHARED") return "SH";
  if(c === "LIMO") return "LM";
  if(c === "LIMOUSINE") return "LM";
  if(c === "TAXI") return "TX";

  return c;
}

function isSharedTrip(trip){

  if(!trip){
    return false;
  }

  const serviceKey =
    normalizeCode(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.tripNumberSuffix ||
      ""
    );

  return (
    trip.isShared === true ||
    trip.tripType === "SHARED" ||
    serviceKey === "SH"
  );
}

function isPassengerActive(passenger){

  const status =
    cleanStatus(passenger?.status);

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show") &&
    normalizeAddress(passenger?.pickup) &&
    normalizeAddress(passenger?.dropoff)
  );
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const address =
      normalizeAddress(item);

    if(!address){
      continue;
    }

    const key =
      address.toLowerCase();

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(address);
  }

  return out;
}

/* =========================================
   ROUTE PREP HELPERS
   No Google here.
========================================= */

function buildIndividualRoutePoints(trip){

  return uniqueAddressList([
    trip?.pickup,
    ...(Array.isArray(trip?.stops) ? trip.stops : []),
    trip?.dropoff
  ]);
}

function prepareConfirmRoute(trip){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const shared =
    isSharedTrip(trip);

  if(shared){

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    const activePassengers =
      passengers.filter(isPassengerActive);

    const pickupPoints =
      uniqueAddressList(
        activePassengers.map(p=>p.pickup)
      );

    const dropoffPoints =
      uniqueAddressList(
        activePassengers.map(p=>p.dropoff)
      );

    const routePoints =
      uniqueAddressList([
        ...pickupPoints,
        ...dropoffPoints
      ]);

    if(routePoints.length < 2){
      throw new Error("Shared route is missing pickup/dropoff");
    }

    return {
      isShared:true,
      routePoints,
      passengers,
      activeCount:
        activePassengers.length || 1,
      sharedStopsCount:
        Math.max(0,routePoints.length - 2),
      routeMeta:{
        mode:"PREP_ONLY_NO_GOOGLE"
      }
    };
  }

  const routePoints =
    buildIndividualRoutePoints(trip);

  if(routePoints.length < 2){
    throw new Error("Route is missing pickup/dropoff");
  }

  return {
    isShared:false,
    routePoints,
    passengers:[],
    activeCount:1,
    sharedStopsCount:0,
    routeMeta:{
      mode:"INDIVIDUAL_PREP_ONLY"
    }
  };
}

/* =========================================
   LOCK CONFIRMED TRIP
   Call this after:
   1. route prepared
   2. Google route calculated
   3. price calculated
========================================= */

async function lockConfirmedTrip(trip,data = {}){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const shared =
    data.isShared === true ||
    isSharedTrip(trip);

  const routePoints =
    uniqueAddressList(data.routePoints);

  if(routePoints.length < 2){
    throw new Error("Cannot confirm trip without route points");
  }

  const routeData =
    data.routeData || {};

  const passengers =
    Array.isArray(data.passengers)
      ? data.passengers
      : Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

  const priceAmount =
    n(data.priceAmount ?? data.finalPrice);

  const pricePerPassenger =
    n(data.pricePerPassenger);

  const activeCount =
    Math.max(
      1,
      n(data.activeCount || 1)
    );

  const sharedStopsCount =
    shared
      ? Math.max(0,n(data.sharedStopsCount))
      : 0;

  /* =========================
     MAIN CONFIRM FIELDS
  ========================= */

  trip.status =
    "Confirmed";

  trip.reservationStatus =
    data.reservationStatus ||
    trip.reservationStatus ||
    "RV";

  trip.reviewOnly =
    false;

  trip.dispatchSelected =
    true;

  trip.disabled =
    false;

  trip.isShared =
    shared;

  trip.tripType =
    shared ? "SHARED" : "INDIVIDUAL";

  /* =========================
     ROUTE FIELDS
  ========================= */

  trip.routePoints =
    routePoints;

  trip.googleRoute =
    routeData.googleRoute || {};

  trip.optimizedRoute =
    routeData.googleRoute || {};

  trip.miles =
    n(routeData.miles);

  trip.distanceMeters =
    n(routeData.distanceMeters);

  trip.durationSeconds =
    n(routeData.durationSeconds);

  trip.estimatedMinutes =
    n(routeData.estimatedMinutes);

  trip.routeLocked =
    true;

  trip.routeFinalized =
    true;

  trip.routeSource =
    data.routeSource ||
    (
      shared
        ? "server-smart-shared-confirm"
        : "server-individual-confirm"
    );

  trip.routeUpdatedAt =
    new Date();

  trip.confirmedAt =
    new Date();

  /* =========================
     PRICE FIELDS
  ========================= */

  trip.priceAmount =
    priceAmount;

  trip.finalPrice =
    priceAmount;

  trip.pricePerPassenger =
    pricePerPassenger;

  if(data.pricingSnapshot){
    trip.reservedPriceSnapshot =
      data.pricingSnapshot;
  }

  if(data.reservedPricingMode){
    trip.reservedPricingMode =
      data.reservedPricingMode;
  }

  if(data.cancelFee !== undefined){
    trip.cancelFee =
      n(data.cancelFee);
  }

  if(data.noShowFee !== undefined){
    trip.noShowFee =
      n(data.noShowFee);
  }

  /* =========================
     SHARED FIELDS
  ========================= */

  if(shared){

    trip.passengers =
      passengers;

    trip.totalPassengers =
      passengers.length;

    trip.passengerCount =
      passengers.length;

    trip.passengersCount =
      passengers.length;

    trip.activePassengersCount =
      activeCount;

    trip.sharedStopsCount =
      sharedStopsCount;

    trip.sharedStopTotal =
      n(data.sharedStopTotal);

    trip.sharedStopShare =
      n(data.sharedStopShare);

    trip.sharedRouteMeta =
      data.routeMeta || null;

    trip.pickup =
      routePoints[0] || trip.pickup || "";

    trip.dropoff =
      routePoints[routePoints.length - 1] ||
      trip.dropoff ||
      "";

    trip.stops =
      [];

    trip.groupStatus =
      "Confirmed";

    trip.groupTotal =
      priceAmount;

  }else{

    trip.passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    trip.totalPassengers =
      trip.totalPassengers || 1;

    trip.passengerCount =
      trip.passengerCount || 1;

    trip.passengersCount =
      trip.passengersCount || 1;

    trip.stops =
      Array.isArray(trip.stops)
        ? trip.stops.map(normalizeAddress).filter(Boolean)
        : [];
  }

  /* =========================
     RESERVED SOURCE FIELDS
  ========================= */

  if(data.reservationStatus){
    trip.reservationStatus =
      data.reservationStatus;
  }

  if(data.createdFrom){
    trip.createdFrom =
      data.createdFrom;
  }

  await trip.save();

  return trip;
}

/* =========================================
   INDIVIDUAL FINALIZATION
   COMPLETE / NOSHOW / CANCEL
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
   SHARED PASSENGER FINALIZATION
   COMPLETE / NOSHOW / CANCEL
========================================= */

async function finalizeSharedPassenger(
  trip,
  passengerId,
  action,
  options = {}
){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const passengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  const passenger =
    passengers.find(p=>{
      return (
        String(p.passengerId || p._id || "") ===
        String(passengerId)
      );
    });

  if(!passenger){
    throw new Error("Passenger Missing");
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

      throw new Error("Unknown Action");
  }

  trip.groupTotal =
    calculateGroupTotal(trip);

  updateSharedGroupStatus(trip);

  await trip.save();

  return trip;
}

/* =========================================
   SHARED HELPERS
========================================= */

function calculateGroupTotal(trip){

  return (
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : []
  ).reduce((sum,p)=>{

    return sum + n(p.finalPrice);

  },0);
}

function updateSharedGroupStatus(trip){

  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  if(!passengers.length){
    trip.groupStatus =
      trip.status || "Unknown";

    return;
  }

  const total =
    passengers.length;

  const completedCount =
    passengers.filter(p=>p.status === "Completed").length;

  const cancelledCount =
    passengers.filter(p=>p.status === "Cancelled").length;

  const noShowCount =
    passengers.filter(p=>p.status === "No Show").length;

  if(completedCount === total){

    trip.groupStatus =
      "Completed";

  }else if(cancelledCount === total){

    trip.groupStatus =
      "Cancelled";

  }else if(noShowCount === total){

    trip.groupStatus =
      "No Show";

  }else{

    trip.groupStatus =
      "Mixed";
  }
}

/* =========================================
   EXPORTS
========================================= */

module.exports = {

  prepareConfirmRoute,
  lockConfirmedTrip,

  finalizeIndividualTrip,
  finalizeSharedPassenger,

  calculateGroupTotal,
  updateSharedGroupStatus,

  isSharedTrip,
  isPassengerActive,
  buildIndividualRoutePoints
};