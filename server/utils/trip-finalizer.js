
const {
  captureAuthorizedTrip,
  captureFeeAndReleaseRest
} = require("./tripPaymentEngine");

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
// - Shared route ordering must already be calculated before lockConfirmedTrip.
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
  if(c === "XL") return "XL";

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

function getRoutePointAddress(item){

  if(typeof item === "string"){
    return normalizeAddress(item);
  }

  if(item && typeof item === "object"){
    return normalizeAddress(item.address || item.formattedAddress || "");
  }

  return "";
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const address =
      getRoutePointAddress(item);

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

function safeArray(v){
  return Array.isArray(v) ? v : [];
}

/* =========================================
   ROUTE PLAN HELPERS
========================================= */

function normalizeRoutePlanPoint(point,index){

  if(!point || typeof point !== "object"){
    return null;
  }

  const type =
    clean(point.type || "")
      .toLowerCase();

  const address =
    normalizeAddress(point.address);

  if(!address){
    return null;
  }

  const order =
    Number.isFinite(Number(point.order))
      ? Number(point.order)
      : index + 1;

  const passengerIndexes =
    Array.isArray(point.passengerIndexes)
      ? point.passengerIndexes
      : point.passengerIndex !== undefined
        ? [point.passengerIndex]
        : [];

  return {
    type:
      type === "dropoff"
        ? "dropoff"
        : "pickup",

    address,

    lat:
      Number.isFinite(Number(point.lat))
        ? Number(point.lat)
        : undefined,

    lng:
      Number.isFinite(Number(point.lng))
        ? Number(point.lng)
        : undefined,

    passengerIndex:
      Number.isFinite(Number(point.passengerIndex))
        ? Number(point.passengerIndex)
        : undefined,

    passengerIndexes,

    passengerId:
      point.passengerId || "",

    passengerName:
      point.passengerName || point.name || "",

    phone:
      point.phone || "",

    group:
      point.group === true ||
      passengerIndexes.length > 1,

    order,

    pickupOrder:
      point.pickupOrder !== undefined
        ? n(point.pickupOrder)
        : undefined,

    dropoffOrder:
      point.dropoffOrder !== undefined
        ? n(point.dropoffOrder)
        : undefined,

    distanceFromAnchor:
      point.distanceFromAnchor !== undefined
        ? n(point.distanceFromAnchor)
        : undefined
  };
}

function normalizeRoutePlan(routePlan){

  return safeArray(routePlan)
    .map(normalizeRoutePlanPoint)
    .filter(Boolean)
    .sort((a,b)=>{
      return n(a.order) - n(b.order);
    })
    .map((point,index)=>{
      return {
        ...point,
        order:index + 1
      };
    });
}

function routePointsFromRoutePlan(routePlan){

  return uniqueAddressList(
    safeArray(routePlan)
      .sort((a,b)=>n(a.order) - n(b.order))
      .map(p=>p.address)
  );
}

function getFirstAddressFromRoutePlan(routePlan){

  const list =
    normalizeRoutePlan(routePlan);

  return list[0]?.address || "";
}

function getLastAddressFromRoutePlan(routePlan){

  const list =
    normalizeRoutePlan(routePlan);

  return list[list.length - 1]?.address || "";
}

/* =========================================
   ROUTE PREP HELPERS
   No Google here.
========================================= */

function buildIndividualRoutePoints(trip){

  return uniqueAddressList([
    trip?.pickup,
    ...safeArray(trip?.stops),
    trip?.dropoff
  ]);
}

function prepareConfirmRoute(trip){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const shared =
    isSharedTrip(trip);

  /*
     If route is already locked, return saved route.
     This prevents accidental recalculation in caller files.
  */
  const existingRoutePlan =
    normalizeRoutePlan(
      trip.sharedRoutePlan ||
      trip.routePlan ||
      []
    );

  const existingRoutePoints =
    existingRoutePlan.length
      ? routePointsFromRoutePlan(existingRoutePlan)
      : uniqueAddressList(trip.routePoints || []);

  if(
    shared &&
    (
      trip.sharedRouteLocked === true ||
      trip.routeLocked === true
    ) &&
    existingRoutePoints.length >= 2
  ){

    return {
      isShared:true,
      alreadyLocked:true,

      routePoints:existingRoutePoints,
      routePlan:existingRoutePlan,

      passengers:safeArray(trip.passengers),

      activeCount:
        n(trip.activePassengersCount) ||
        safeArray(trip.passengers).filter(isPassengerActive).length ||
        1,

      sharedStopsCount:
        n(trip.sharedStopsCount) ||
        Math.max(0,existingRoutePoints.length - 2),

      routeMeta:
        trip.sharedRouteMeta || {
          mode:"ALREADY_LOCKED"
        }
    };
  }

  if(shared){

    const passengers =
      safeArray(trip.passengers);

    const activePassengers =
      passengers.filter(isPassengerActive);

    if(!activePassengers.length){
      throw new Error("Shared route requires active passengers.");
    }

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
      alreadyLocked:false,

      routePoints,

      /*
         routePlan is empty here because this file does not calculate shared order.
         The confirm route must call sharedRouteEngine before lockConfirmedTrip.
      */
      routePlan:[],

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
    alreadyLocked:
      trip.routeLocked === true,

    routePoints,
    routePlan:[],

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

  const routePlan =
    normalizeRoutePlan(
      data.routePlan ||
      data.sharedRoutePlan ||
      []
    );

  let routePoints =
    routePlan.length
      ? routePointsFromRoutePlan(routePlan)
      : uniqueAddressList(data.routePoints);

  if(!routePoints.length){
    routePoints =
      uniqueAddressList(trip.routePoints || []);
  }

  if(routePoints.length < 2){
    throw new Error("Cannot confirm trip without route points");
  }

  const routeData =
    data.routeData || {};

  const passengers =
    safeArray(data.passengers).length
      ? safeArray(data.passengers)
      : safeArray(trip.passengers);

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
      ? Math.max(
          0,
          n(
            data.sharedStopsCount !== undefined
              ? data.sharedStopsCount
              : routePoints.length - 2
          )
        )
      : 0;

  const miles =
    n(
      routeData.miles ??
      routeData.distanceMiles ??
      data.miles ??
      data.sharedRouteMiles
    );

  const distanceMeters =
    n(
      routeData.distanceMeters ??
      routeData.meters ??
      data.distanceMeters
    );

  const durationSeconds =
    n(
      routeData.durationSeconds ??
      routeData.seconds ??
      data.durationSeconds
    );

  const estimatedMinutes =
    n(
      routeData.estimatedMinutes ??
      routeData.minutes ??
      data.estimatedMinutes ??
      data.sharedRouteMinutes
    );

  const polyline =
    routeData.polyline ||
    routeData.overviewPolyline ||
    routeData.overview_polyline ||
    data.polyline ||
    data.sharedRoutePolyline ||
    "";

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

  trip.routePlan =
    routePlan;

  trip.googleRoute =
    routeData.googleRoute ||
    routeData.route ||
    routeData ||
    {};

  trip.optimizedRoute =
    routeData.googleRoute ||
    routeData.route ||
    routeData ||
    {};

  trip.miles =
    miles;

  trip.distanceMeters =
    distanceMeters;

  trip.durationSeconds =
    durationSeconds;

  trip.estimatedMinutes =
    estimatedMinutes;

  trip.routePolyline =
    polyline;

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
      data.routeMeta ||
      data.sharedRouteMeta ||
      {
        mode:
          data.routeCase ||
          data.mode ||
          "SHARED_ROUTE_LOCKED",

        routeCase:
          data.routeCase ||
          data.mode ||
          "",

        calculationSource:
          data.calculationSource ||
          "",

        googleRequestsUsed:
          n(data.googleRequestsUsed)
      };

    trip.sharedRoutePlan =
      routePlan;

    trip.sharedRouteLocked =
      true;

    trip.sharedRouteLockedAt =
      new Date();

    trip.sharedRouteMiles =
      miles;

    trip.sharedRouteMinutes =
      estimatedMinutes;

    trip.sharedRoutePolyline =
      polyline;

    trip.sharedRouteCase =
      data.routeCase ||
      data.mode ||
      trip.sharedRouteMeta?.routeCase ||
      "";

    trip.sharedRouteSource =
      data.calculationSource ||
      data.routeSource ||
      "";

    trip.sharedGoogleRequestsUsed =
      n(data.googleRequestsUsed);

    trip.pickup =
      getFirstAddressFromRoutePlan(routePlan) ||
      routePoints[0] ||
      trip.pickup ||
      "";

    trip.dropoff =
      getLastAddressFromRoutePlan(routePlan) ||
      routePoints[routePoints.length - 1] ||
      trip.dropoff ||
      "";

    /*
       For shared trips, stops stay empty.
       The real route is routePoints + sharedRoutePlan.
    */
    trip.stops =
      [];

    trip.groupStatus =
      "Confirmed";

    trip.groupTotal =
      priceAmount;

  }else{

    trip.passengers =
      safeArray(trip.passengers);

    trip.totalPassengers =
      trip.totalPassengers || 1;

    trip.passengerCount =
      trip.passengerCount || 1;

    trip.passengersCount =
      trip.passengersCount || 1;

    trip.activePassengersCount =
      1;

    trip.sharedStopsCount =
      0;

    trip.sharedRouteLocked =
      false;

    trip.sharedRoutePlan =
      [];

    trip.sharedRouteMeta =
      null;

    trip.stops =
      safeArray(trip.stops)
        .map(normalizeAddress)
        .filter(Boolean);
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
   UNLOCK ROUTE AFTER EDIT
   Use this when pickup/dropoff/passengers/stops changed.
========================================= */

async function unlockTripRouteAfterEdit(trip){

  if(!trip){
    throw new Error("Trip Missing");
  }

  trip.routeLocked =
    false;

  trip.routeFinalized =
    false;

  trip.routeUpdatedAt =
    new Date();

  trip.routeSource =
    "route-edit-unlocked";

  if(isSharedTrip(trip)){

    trip.sharedRouteLocked =
      false;

    trip.sharedRouteLockedAt =
      null;

    trip.sharedRoutePlan =
      [];

    trip.sharedRouteMeta =
      null;

    trip.sharedRoutePolyline =
      "";

    trip.sharedRouteMiles =
      0;

    trip.sharedRouteMinutes =
      0;

    trip.sharedGoogleRequestsUsed =
      0;
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

  /*
    PAYMENT FIRST, DATABASE STATUS SECOND.
    If Stripe fails, this function throws and the old trip status/route remains.
  */

  const normalizedAction =
    String(action || "").toUpperCase();

  const usesDeferredPayment =
    !!trip.stripePaymentMethodId ||
    [
      "PAYMENT_METHOD_SAVED",
      "PAYMENT_REQUIRED",
      "AUTHORIZED",
      "CAPTURE_FAILED"
    ].includes(String(trip.paymentStatus || "").toUpperCase());

  if(usesDeferredPayment && normalizedAction === "COMPLETE"){
    await captureAuthorizedTrip(
      trip,
      finalPrice
    );
  }

  if(usesDeferredPayment && normalizedAction === "NOSHOW"){
    await captureFeeAndReleaseRest(
      trip,
      noShowFee,
      "NO_SHOW_FEE"
    );
  }

  if(usesDeferredPayment && normalizedAction === "CANCEL"){
    await captureFeeAndReleaseRest(
      trip,
      cancelFee,
      "CANCELLATION_FEE"
    );
  }

  switch(
    normalizedAction
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
    safeArray(trip.passengers);

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

  return safeArray(trip?.passengers)
    .reduce((sum,p)=>{
      return sum + n(p.finalPrice);
    },0);
}

function updateSharedGroupStatus(trip){

  const passengers =
    safeArray(trip?.passengers);

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
  unlockTripRouteAfterEdit,

  finalizeIndividualTrip,
  finalizeSharedPassenger,

  calculateGroupTotal,
  updateSharedGroupStatus,

  isSharedTrip,
  isPassengerActive,
  buildIndividualRoutePoints,

  uniqueAddressList,
  normalizeRoutePlan,
  routePointsFromRoutePlan
};
Library
/
trip-finalizer.txt


"use strict";

const {
  captureAuthorizedTrip,
  captureFeeAndReleaseRest
} = require("./tripPaymentEngine");

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
// - Shared route ordering must already be calculated before lockConfirmedTrip.
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
  if(c === "XL") return "XL";

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

function getRoutePointAddress(item){

  if(typeof item === "string"){
    return normalizeAddress(item);
  }

  if(item && typeof item === "object"){
    return normalizeAddress(item.address || item.formattedAddress || "");
  }

  return "";
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const address =
      getRoutePointAddress(item);

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

function safeArray(v){
  return Array.isArray(v) ? v : [];
}

/* =========================================
   ROUTE PLAN HELPERS
========================================= */

function normalizeRoutePlanPoint(point,index){

  if(!point || typeof point !== "object"){
    return null;
  }

  const type =
    clean(point.type || "")
      .toLowerCase();

  const address =
    normalizeAddress(point.address);

  if(!address){
    return null;
  }

  const order =
    Number.isFinite(Number(point.order))
      ? Number(point.order)
      : index + 1;

  const passengerIndexes =
    Array.isArray(point.passengerIndexes)
      ? point.passengerIndexes
      : point.passengerIndex !== undefined
        ? [point.passengerIndex]
        : [];

  return {
    type:
      type === "dropoff"
        ? "dropoff"
        : "pickup",

    address,

    lat:
      Number.isFinite(Number(point.lat))
        ? Number(point.lat)
        : undefined,

    lng:
      Number.isFinite(Number(point.lng))
        ? Number(point.lng)
        : undefined,

    passengerIndex:
      Number.isFinite(Number(point.passengerIndex))
        ? Number(point.passengerIndex)
        : undefined,

    passengerIndexes,

    passengerId:
      point.passengerId || "",

    passengerName:
      point.passengerName || point.name || "",

    phone:
      point.phone || "",

    group:
      point.group === true ||
      passengerIndexes.length > 1,

    order,

    pickupOrder:
      point.pickupOrder !== undefined
        ? n(point.pickupOrder)
        : undefined,

    dropoffOrder:
      point.dropoffOrder !== undefined
        ? n(point.dropoffOrder)
        : undefined,

    distanceFromAnchor:
      point.distanceFromAnchor !== undefined
        ? n(point.distanceFromAnchor)
        : undefined
  };
}

function normalizeRoutePlan(routePlan){

  return safeArray(routePlan)
    .map(normalizeRoutePlanPoint)
    .filter(Boolean)
    .sort((a,b)=>{
      return n(a.order) - n(b.order);
    })
    .map((point,index)=>{
      return {
        ...point,
        order:index + 1
      };
    });
}

function routePointsFromRoutePlan(routePlan){

  return uniqueAddressList(
    safeArray(routePlan)
      .sort((a,b)=>n(a.order) - n(b.order))
      .map(p=>p.address)
  );
}

function getFirstAddressFromRoutePlan(routePlan){

  const list =
    normalizeRoutePlan(routePlan);

  return list[0]?.address || "";
}

function getLastAddressFromRoutePlan(routePlan){

  const list =
    normalizeRoutePlan(routePlan);

  return list[list.length - 1]?.address || "";
}

/* =========================================
   ROUTE PREP HELPERS
   No Google here.
========================================= */

function buildIndividualRoutePoints(trip){

  return uniqueAddressList([
    trip?.pickup,
    ...safeArray(trip?.stops),
    trip?.dropoff
  ]);
}

function prepareConfirmRoute(trip){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const shared =
    isSharedTrip(trip);

  /*
     If route is already locked, return saved route.
     This prevents accidental recalculation in caller files.
  */
  const existingRoutePlan =
    normalizeRoutePlan(
      trip.sharedRoutePlan ||
      trip.routePlan ||
      []
    );

  const existingRoutePoints =
    existingRoutePlan.length
      ? routePointsFromRoutePlan(existingRoutePlan)
      : uniqueAddressList(trip.routePoints || []);

  if(
    shared &&
    (
      trip.sharedRouteLocked === true ||
      trip.routeLocked === true
    ) &&
    existingRoutePoints.length >= 2
  ){

    return {
      isShared:true,
      alreadyLocked:true,

      routePoints:existingRoutePoints,
      routePlan:existingRoutePlan,

      passengers:safeArray(trip.passengers),

      activeCount:
        n(trip.activePassengersCount) ||
        safeArray(trip.passengers).filter(isPassengerActive).length ||
        1,

      sharedStopsCount:
        n(trip.sharedStopsCount) ||
        Math.max(0,existingRoutePoints.length - 2),

      routeMeta:
        trip.sharedRouteMeta || {
          mode:"ALREADY_LOCKED"
        }
    };
  }

  if(shared){

    const passengers =
      safeArray(trip.passengers);

    const activePassengers =
      passengers.filter(isPassengerActive);

    if(!activePassengers.length){
      throw new Error("Shared route requires active passengers.");
    }

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
      alreadyLocked:false,

      routePoints,

      /*
         routePlan is empty here because this file does not calculate shared order.
         The confirm route must call sharedRouteEngine before lockConfirmedTrip.
      */
      routePlan:[],

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
    alreadyLocked:
      trip.routeLocked === true,

    routePoints,
    routePlan:[],

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

  const routePlan =
    normalizeRoutePlan(
      data.routePlan ||
      data.sharedRoutePlan ||
      []
    );

  let routePoints =
    routePlan.length
      ? routePointsFromRoutePlan(routePlan)
      : uniqueAddressList(data.routePoints);

  if(!routePoints.length){
    routePoints =
      uniqueAddressList(trip.routePoints || []);
  }

  if(routePoints.length < 2){
    throw new Error("Cannot confirm trip without route points");
  }

  const routeData =
    data.routeData || {};

  const passengers =
    safeArray(data.passengers).length
      ? safeArray(data.passengers)
      : safeArray(trip.passengers);

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
      ? Math.max(
          0,
          n(
            data.sharedStopsCount !== undefined
              ? data.sharedStopsCount
              : routePoints.length - 2
          )
        )
      : 0;

  const miles =
    n(
      routeData.miles ??
      routeData.distanceMiles ??
      data.miles ??
      data.sharedRouteMiles
    );

  const distanceMeters =
    n(
      routeData.distanceMeters ??
      routeData.meters ??
      data.distanceMeters
    );

  const durationSeconds =
    n(
      routeData.durationSeconds ??
      routeData.seconds ??
      data.durationSeconds
    );

  const estimatedMinutes =
    n(
      routeData.estimatedMinutes ??
      routeData.minutes ??
      data.estimatedMinutes ??
      data.sharedRouteMinutes
    );

  const polyline =
    routeData.polyline ||
    routeData.overviewPolyline ||
    routeData.overview_polyline ||
    data.polyline ||
    data.sharedRoutePolyline ||
    "";

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

  trip.routePlan =
    routePlan;

  trip.googleRoute =
    routeData.googleRoute ||
    routeData.route ||
    routeData ||
    {};

  trip.optimizedRoute =
    routeData.googleRoute ||
    routeData.route ||
    routeData ||
    {};

  trip.miles =
    miles;

  trip.distanceMeters =
    distanceMeters;

  trip.durationSeconds =
    durationSeconds;

  trip.estimatedMinutes =
    estimatedMinutes;

  trip.routePolyline =
    polyline;

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
      data.routeMeta ||
      data.sharedRouteMeta ||
      {
        mode:
          data.routeCase ||
          data.mode ||
          "SHARED_ROUTE_LOCKED",

        routeCase:
          data.routeCase ||
          data.mode ||
          "",

        calculationSource:
          data.calculationSource ||
          "",

        googleRequestsUsed:
          n(data.googleRequestsUsed)
      };

    trip.sharedRoutePlan =
      routePlan;

    trip.sharedRouteLocked =
      true;

    trip.sharedRouteLockedAt =
      new Date();

    trip.sharedRouteMiles =
      miles;

    trip.sharedRouteMinutes =
      estimatedMinutes;

    trip.sharedRoutePolyline =
      polyline;

    trip.sharedRouteCase =
      data.routeCase ||
      data.mode ||
      trip.sharedRouteMeta?.routeCase ||
      "";

    trip.sharedRouteSource =
      data.calculationSource ||
      data.routeSource ||
      "";

    trip.sharedGoogleRequestsUsed =
      n(data.googleRequestsUsed);

    trip.pickup =
      getFirstAddressFromRoutePlan(routePlan) ||
      routePoints[0] ||
      trip.pickup ||
      "";

    trip.dropoff =
      getLastAddressFromRoutePlan(routePlan) ||
      routePoints[routePoints.length - 1] ||
      trip.dropoff ||
      "";

    /*
       For shared trips, stops stay empty.
       The real route is routePoints + sharedRoutePlan.
    */
    trip.stops =
      [];

    trip.groupStatus =
      "Confirmed";

    trip.groupTotal =
      priceAmount;

  }else{

    trip.passengers =
      safeArray(trip.passengers);

    trip.totalPassengers =
      trip.totalPassengers || 1;

    trip.passengerCount =
      trip.passengerCount || 1;

    trip.passengersCount =
      trip.passengersCount || 1;

    trip.activePassengersCount =
      1;

    trip.sharedStopsCount =
      0;

    trip.sharedRouteLocked =
      false;

    trip.sharedRoutePlan =
      [];

    trip.sharedRouteMeta =
      null;

    trip.stops =
      safeArray(trip.stops)
        .map(normalizeAddress)
        .filter(Boolean);
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
   UNLOCK ROUTE AFTER EDIT
   Use this when pickup/dropoff/passengers/stops changed.
========================================= */

async function unlockTripRouteAfterEdit(trip){

  if(!trip){
    throw new Error("Trip Missing");
  }

  trip.routeLocked =
    false;

  trip.routeFinalized =
    false;

  trip.routeUpdatedAt =
    new Date();

  trip.routeSource =
    "route-edit-unlocked";

  if(isSharedTrip(trip)){

    trip.sharedRouteLocked =
      false;

    trip.sharedRouteLockedAt =
      null;

    trip.sharedRoutePlan =
      [];

    trip.sharedRouteMeta =
      null;

    trip.sharedRoutePolyline =
      "";

    trip.sharedRouteMiles =
      0;

    trip.sharedRouteMinutes =
      0;

    trip.sharedGoogleRequestsUsed =
      0;
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

  /*
    PAYMENT FIRST, DATABASE STATUS SECOND.
    If Stripe fails, this function throws and the old trip status/route remains.
  */

  const normalizedAction =
    String(action || "").toUpperCase();

  const usesDeferredPayment =
    !!trip.stripePaymentMethodId ||
    [
      "PAYMENT_METHOD_SAVED",
      "PAYMENT_REQUIRED",
      "AUTHORIZED",
      "CAPTURE_FAILED"
    ].includes(String(trip.paymentStatus || "").toUpperCase());

  if(usesDeferredPayment && normalizedAction === "COMPLETE"){
    await captureAuthorizedTrip(
      trip,
      finalPrice
    );
  }

  if(usesDeferredPayment && normalizedAction === "NOSHOW"){
    await captureFeeAndReleaseRest(
      trip,
      noShowFee,
      "NO_SHOW_FEE"
    );
  }

  if(usesDeferredPayment && normalizedAction === "CANCEL"){
    await captureFeeAndReleaseRest(
      trip,
      cancelFee,
      "CANCELLATION_FEE"
    );
  }

  switch(
    normalizedAction
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
    safeArray(trip.passengers);

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

  return safeArray(trip?.passengers)
    .reduce((sum,p)=>{
      return sum + n(p.finalPrice);
    },0);
}

function updateSharedGroupStatus(trip){

  const passengers =
    safeArray(trip?.passengers);

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
  unlockTripRouteAfterEdit,

  finalizeIndividualTrip,
  finalizeSharedPassenger,

  calculateGroupTotal,
  updateSharedGroupStatus,

  isSharedTrip,
  isPassengerActive,
  buildIndividualRoutePoints,

  uniqueAddressList,
  normalizeRoutePlan,
  routePointsFromRoutePlan
};