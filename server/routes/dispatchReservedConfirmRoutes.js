"use strict";

/* =====================================================
   FILE: server/routes/dispatchReservedConfirmRoutes.js
   RESERVED CONFIRM ROUTE
   Server-only confirm logic

   RULES:
   - Add/Edit/Review = no map requests
   - Confirm button is allowed even if route is already saved
   - If route signature did NOT change = reuse saved route = 0 Google requests
   - If pickup/dropoff/stops changed = rebuild route
   - Name/phone/notes/date/time changes do NOT rebuild route
   - Shared route:
       SAME pickup + SAME dropoff       -> final route only
       SAME pickup + DIFFERENT dropoffs -> optimize dropoffs, then final route
       DIFFERENT pickups + SAME dropoff -> optimize pickups, then final route
       DIFFERENT pickups + DIFFERENT dropoffs -> optimize pickups, optimize dropoffs, final route
   - Never allow dropoff phase before pickup phase
===================================================== */

const express = require("express");
const router = express.Router();

const tripFinalizer =
  require("../utils/trip-finalizer");

const routeMapEngine =
  require("../utils/routeMapEngine");

const Service =
  require("../models/Service");

/* =========================
   BASIC HELPERS
========================= */

function n(value){
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function clean(value){
  return String(value ?? "").trim();
}

function normalizeAddress(value){
  return clean(value)
    .replace(/\s+/g," ")
    .trim();
}

function addressKey(value){
  return normalizeAddress(value)
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}

function cleanStatus(value){
  return clean(value)
    .replace(/\s+/g,"")
    .toLowerCase();
}

function bool(value){
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "yes" ||
    String(value).toLowerCase() === "1"
  );
}

function normalizeCode(value){

  const c =
    clean(value)
      .toUpperCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c) return "";

  if(c === "STANDARD") return "ST";
  if(c === "ST") return "ST";

  if(c === "WHEELCHAIR") return "WH";
  if(c === "WHEEL CHAIR") return "WH";
  if(c === "WC") return "WH";
  if(c === "WH") return "WH";

  if(c === "SHARED") return "SH";
  if(c === "SH") return "SH";

  if(c === "LIMO") return "LM";
  if(c === "LIMOUSINE") return "LM";
  if(c === "LM") return "LM";

  if(c === "TAXI") return "TX";
  if(c === "TX") return "TX";

  if(c === "XL") return "XL";

  return c;
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const address =
      typeof item === "string"
        ? normalizeAddress(item)
        : normalizeAddress(item?.address || item?.formattedAddress || "");

    if(!address){
      continue;
    }

    const key =
      addressKey(address);

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(address);
  }

  return out;
}

function compactRoutePoints(list){

  const out = [];
  let lastKey = "";

  for(const item of Array.isArray(list) ? list : []){

    const address =
      typeof item === "string"
        ? normalizeAddress(item)
        : normalizeAddress(item?.address || "");

    if(!address){
      continue;
    }

    const key = addressKey(address);

    if(key === lastKey){
      continue;
    }

    out.push(address);
    lastKey = key;
  }

  return out;
}

function getTripModel(){

  if(!global.Trip){
    throw new Error("Trip model not loaded");
  }

  return global.Trip;
}

function isSharedTrip(trip){

  if(!trip){
    return false;
  }

  const code =
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
    code === "SH"
  );
}

function passengerIsActive(passenger){

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

function sameAddress(a,b){
  return addressKey(a) === addressKey(b);
}

function allSameAddress(list){

  const arr =
    uniqueAddressList(list);

  return arr.length <= 1;
}

/* =========================
   ROUTE SIGNATURE
   This controls when Google is called again.
========================= */

function buildIndividualRouteSignature(trip){

  return JSON.stringify({
    type:"INDIVIDUAL",
    pickup:addressKey(trip?.pickup),
    stops:safeArray(trip?.stops)
      .map(addressKey)
      .filter(Boolean),
    dropoff:addressKey(trip?.dropoff)
  });
}

function buildSharedRouteSignature(trip){

  const passengers =
    safeArray(trip?.passengers)
      .map((p,index)=>({
        id:String(p.passengerId || p._id || index),
        pickup:addressKey(p.pickup),
        dropoff:addressKey(p.dropoff),
        active:passengerIsActive(p) ? "1" : "0"
      }))
      .filter(p=>p.pickup || p.dropoff)
      .sort((a,b)=>{
        return String(a.id).localeCompare(String(b.id));
      });

  return JSON.stringify({
    type:"SHARED",
    passengers
  });
}

function buildCurrentRouteSignature(trip){
  return isSharedTrip(trip)
    ? buildSharedRouteSignature(trip)
    : buildIndividualRouteSignature(trip);
}

function getSavedRouteSignature(trip){
  return clean(
    trip?.routeSignature ||
    trip?.sharedRouteSignature ||
    ""
  );
}

function savedRoutePlan(trip){

  const plan =
    safeArray(trip?.sharedRoutePlan).length
      ? safeArray(trip.sharedRoutePlan)
      : safeArray(trip?.routePlan);

  return plan
    .filter(p=>normalizeAddress(p?.address))
    .sort((a,b)=>n(a.order) - n(b.order));
}

function savedRoutePoints(trip){

  const plan =
    savedRoutePlan(trip);

  if(plan.length >= 2){
    return compactRoutePoints(
      plan.map(p=>p.address)
    );
  }

  return compactRoutePoints(trip?.routePoints || []);
}

function hasUsableSavedRoute(trip,currentSignature){

  const points =
    savedRoutePoints(trip);

  if(points.length < 2){
    return false;
  }

  if(n(trip?.miles) <= 0 && n(trip?.sharedRouteMiles) <= 0){
    return false;
  }

  if(
    trip?.routeChangePending === true ||
    clean(trip?.routeChangeStatus).toUpperCase() === "ROUTE_CHANGED"
  ){
    return false;
  }

  const savedSignature =
    getSavedRouteSignature(trip);

  if(savedSignature){
    return savedSignature === currentSignature;
  }

  /*
    Old confirmed trips may not have a signature yet.
    If they are locked and no route-change flag exists, reuse once and save signature.
  */
  return (
    trip?.routeLocked === true ||
    trip?.routeFinalized === true ||
    trip?.sharedRouteLocked === true
  );
}

function buildRouteDataFromSavedTrip(trip){

  return {
    miles:n(trip?.miles || trip?.sharedRouteMiles),
    distanceMeters:n(trip?.distanceMeters),
    durationSeconds:n(trip?.durationSeconds),
    estimatedMinutes:n(trip?.estimatedMinutes || trip?.sharedRouteMinutes),
    polyline:
      trip?.routePolyline ||
      trip?.sharedRoutePolyline ||
      "",
    googleRoute:
      trip?.googleRoute ||
      trip?.optimizedRoute ||
      {}
  };
}

/* =========================
   ROUTE MAP ENGINE WRAPPERS
========================= */

async function calculateRoute(routePoints){

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRouteMiles === "function"
  ){
    return await routeMapEngine.calculateRouteMiles(routePoints);
  }

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRoute === "function"
  ){
    return await routeMapEngine.calculateRoute(routePoints);
  }

  throw new Error(
    "routeMapEngine calculate function not found"
  );
}

async function optimizeAddressOrder(routePoints, options = {}){

  if(
    !routeMapEngine ||
    typeof routeMapEngine.optimizeAddressOrder !== "function"
  ){
    throw new Error(
      "routeMapEngine optimizeAddressOrder function not found"
    );
  }

  return await routeMapEngine.optimizeAddressOrder(
    routePoints,
    options
  );
}

function extractOrderedAddresses(result,fallback){

  return uniqueAddressList(
    result?.orderedAddresses ||
    result?.routePoints ||
    result?.optimizedRoutePoints ||
    fallback ||
    []
  );
}

/* =========================
   SERVICE / PRICING
========================= */

function resolveServiceCodeFromTrip(trip){

  if(isSharedTrip(trip)){
    return "SH";
  }

  return normalizeCode(
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.tripNumberSuffix ||
    trip.vehicleTypeFromQuote ||
    ""
  );
}

async function getReservedServiceForTrip(trip){

  const code =
    resolveServiceCodeFromTrip(trip);

  if(!code){
    throw new Error("Reserved service code missing");
  }

  const services =
    await Service.find({}).lean();

  const found =
    services.find(service=>{

      const fields = [
        service.reservedSuffix,
        service.serviceSuffix,
        service.suffix,
        service.companySuffix,
        service.getQuoteSuffix,
        service.reservedServiceSuffix,
        service.tripNumberSuffix,

        service.reservedServiceCode,
        service.serviceCode,
        service.code,

        service.reservedServiceKey,
        service.serviceKey,
        service.serviceType,
        service.vehicle
      ];

      return fields.some(field=>{
        return normalizeCode(field) === code;
      });

    });

  if(!found){
    throw new Error("Reserved service not found: " + code);
  }

  return found;
}

function getReservedPricing(service){

  return {
    pricingMode:
      clean(service?.reservedPricingMode || "MILE").toUpperCase(),

    baseFare:
      n(service?.reservedBaseFare),

    includedMiles:
      n(service?.reservedIncludedMiles),

    perMile:
      n(service?.reservedPerMile),

    hourlyRate:
      n(service?.reservedHourlyRate),

    hourlyBillingMode:
      clean(service?.reservedHourlyBillingMode || "FULL").toUpperCase(),

    stopFee:
      n(service?.reservedStopFee),

    noShowFee:
      n(service?.reservedNoShowFee),

    cancelFee:
      n(service?.reservedCancelFee),

    sharedPrice:
      n(service?.reservedSharedPrice),

    warningMinutes:
      Number(service?.reservedWarningMinutes ?? 120),

    disableCancel:
      bool(service?.reservedDisableCancel)
  };
}

function calculateReservedPrice({pricing,miles,minutes,stops}){

  const mode =
    clean(pricing.pricingMode || "MILE").toUpperCase();

  const stopCount =
    n(stops);

  let total = 0;

  if(mode === "HOURLY"){

    const mins =
      Math.max(0,n(minutes));

    let billableHours = 0;

    if(pricing.hourlyBillingMode === "QUARTER"){
      billableHours =
        Math.ceil(mins / 15) * 0.25;
    }else{
      billableHours =
        Math.ceil(mins / 60);
    }

    total =
      (billableHours * n(pricing.hourlyRate)) +
      (stopCount * n(pricing.stopFee));

  }else{

    const extraMiles =
      Math.max(
        0,
        n(miles) - n(pricing.includedMiles)
      );

    total =
      n(pricing.baseFare) +
      (extraMiles * n(pricing.perMile)) +
      (stopCount * n(pricing.stopFee));
  }

  return Number(total.toFixed(2));
}

function calculateSharedPricing({
  pricing,
  routeData,
  passengers,
  activeCount,
  stopsCount
}){

  const count =
    Math.max(1,n(activeCount));

  const routeMiles =
    n(routeData?.miles);

  if(n(pricing.sharedPrice) > 0){

    const fixed =
      n(pricing.sharedPrice);

    const total =
      Number((fixed * count).toFixed(2));

    const pricedPassengers =
      passengers.map(passenger=>{

        if(!passengerIsActive(passenger)){
          return {
            ...passenger,
            passengerMiles:0,
            passengerMinutes:0,
            passengerDistanceMeters:0,
            passengerDurationSeconds:0,
            priceAmount:0,
            finalPrice:0
          };
        }

        return {
          ...passenger,
          passengerMiles:0,
          passengerMinutes:0,
          passengerDistanceMeters:0,
          passengerDurationSeconds:0,
          priceAmount:fixed,
          finalPrice:fixed
        };
      });

    return {
      total,
      pricePerPassenger:fixed,
      stopTotal:0,
      stopShare:0,
      passengers:pricedPassengers
    };
  }

  const includedMilesTotal =
    n(pricing.includedMiles) * count;

  const extraMiles =
    Math.max(
      0,
      routeMiles - includedMilesTotal
    );

  const baseTotal =
    Number(
      (n(pricing.baseFare) * count).toFixed(2)
    );

  const mileageTotal =
    Number(
      (extraMiles * n(pricing.perMile)).toFixed(2)
    );

  const stopTotal =
    Number(
      (n(stopsCount) * n(pricing.stopFee)).toFixed(2)
    );

  const total =
    Number(
      (baseTotal + mileageTotal + stopTotal).toFixed(2)
    );

  const pricePerPassenger =
    Number((total / count).toFixed(2));

  const pricedPassengers =
    passengers.map(passenger=>{

      if(!passengerIsActive(passenger)){
        return {
          ...passenger,
          passengerMiles:0,
          passengerMinutes:0,
          passengerDistanceMeters:0,
          passengerDurationSeconds:0,
          priceAmount:0,
          finalPrice:0
        };
      }

      return {
        ...passenger,
        passengerMiles:routeMiles,
        passengerMinutes:n(routeData?.estimatedMinutes),
        passengerDistanceMeters:n(routeData?.distanceMeters),
        passengerDurationSeconds:n(routeData?.durationSeconds),
        priceAmount:pricePerPassenger,
        finalPrice:pricePerPassenger
      };
    });

  return {
    total,
    pricePerPassenger,
    stopTotal,
    stopShare:Number((stopTotal / count).toFixed(2)),
    passengers:pricedPassengers
  };
}

/* =========================
   ROUTE POINT COORDINATES
========================= */

function extractRoutePointCoordinates(routePoints, routeData){

  const map =
    new Map();

  const legs =
    Array.isArray(routeData?.googleRoute?.legs)
      ? routeData.googleRoute.legs
      : Array.isArray(routeData?.legs)
        ? routeData.legs
        : [];

  if(!legs.length){
    return map;
  }

  for(const leg of legs){

    const startAddress =
      normalizeAddress(leg.startAddress || leg.start_address);

    const endAddress =
      normalizeAddress(leg.endAddress || leg.end_address);

    if(
      startAddress &&
      Number.isFinite(Number(leg.startLat)) &&
      Number.isFinite(Number(leg.startLng))
    ){
      map.set(
        addressKey(startAddress),
        {
          address:startAddress,
          lat:Number(leg.startLat),
          lng:Number(leg.startLng)
        }
      );
    }

    if(
      endAddress &&
      Number.isFinite(Number(leg.endLat)) &&
      Number.isFinite(Number(leg.endLng))
    ){
      map.set(
        addressKey(endAddress),
        {
          address:endAddress,
          lat:Number(leg.endLat),
          lng:Number(leg.endLng)
        }
      );
    }
  }

  for(const point of routePoints){

    const key =
      addressKey(point);

    if(!map.has(key)){
      map.set(key,{
        address:normalizeAddress(point),
        lat:null,
        lng:null
      });
    }
  }

  return map;
}

function routePlanOrder(routePlan,type,address){

  const key =
    addressKey(address);

  const index =
    safeArray(routePlan)
      .sort((a,b)=>n(a.order) - n(b.order))
      .findIndex(point=>{
        return (
          clean(point.type).toLowerCase() === type &&
          addressKey(point.address) === key
        );
      });

  return index < 0 ? 9999 : index + 1;
}

function applySharedPassengerOrdersAndCoords({
  passengers,
  routePoints,
  routePlan,
  routeData,
  pricing
}){

  const coordMap =
    extractRoutePointCoordinates(
      routePoints,
      routeData
    );

  return safeArray(passengers)
    .map((passenger,index)=>{

      const active =
        passengerIsActive(passenger);

      const pickupOrder =
        routePlanOrder(
          routePlan,
          "pickup",
          passenger.pickup
        );

      const dropoffOrder =
        routePlanOrder(
          routePlan,
          "dropoff",
          passenger.dropoff
        );

      const pickupKey =
        addressKey(passenger.pickup);

      const dropoffKey =
        addressKey(passenger.dropoff);

      const pickupCoord =
        coordMap.get(pickupKey) || null;

      const dropoffCoord =
        coordMap.get(dropoffKey) || null;

      return {
        ...passenger,

        pickup:
          normalizeAddress(passenger.pickup),

        pickupLat:
          Number.isFinite(Number(pickupCoord?.lat))
            ? Number(pickupCoord.lat)
            : passenger.pickupLat ?? null,

        pickupLng:
          Number.isFinite(Number(pickupCoord?.lng))
            ? Number(pickupCoord.lng)
            : passenger.pickupLng ?? null,

        dropoff:
          normalizeAddress(passenger.dropoff),

        dropoffLat:
          Number.isFinite(Number(dropoffCoord?.lat))
            ? Number(dropoffCoord.lat)
            : passenger.dropoffLat ?? null,

        dropoffLng:
          Number.isFinite(Number(dropoffCoord?.lng))
            ? Number(dropoffCoord.lng)
            : passenger.dropoffLng ?? null,

        pickupOrder:
          active
            ? pickupOrder
            : 9999,

        dropoffOrder:
          active
            ? dropoffOrder
            : 9999,

        routeOrder:
          index + 1,

        status:
          active
            ? "Confirmed"
            : passenger.status || "Scheduled",

        cancelFee:
          active
            ? n(pricing.cancelFee)
            : n(passenger.cancelFee),

        noShowFee:
          active
            ? n(pricing.noShowFee)
            : n(passenger.noShowFee)
      };
    })
    .sort((a,b)=>{

      if(n(a.pickupOrder) !== n(b.pickupOrder)){
        return n(a.pickupOrder) - n(b.pickupOrder);
      }

      if(n(a.dropoffOrder) !== n(b.dropoffOrder)){
        return n(a.dropoffOrder) - n(b.dropoffOrder);
      }

      return n(a.routeOrder) - n(b.routeOrder);
    })
    .map((passenger,index)=>({
      ...passenger,
      routeOrder:index + 1
    }));
}

/* =========================
   INDIVIDUAL ROUTE PREP
========================= */

function buildIndividualRoutePoints(trip){

  return compactRoutePoints([
    trip.pickup,
    ...safeArray(trip.stops),
    trip.dropoff
  ]);
}

/* =========================
   SHARED ROUTE PLAN HELPERS
========================= */

function getActiveSharedPassengers(trip){

  const passengers =
    safeArray(trip.passengers);

  return passengers.filter(passengerIsActive);
}

function passengerIndexesForAddress(passengers,type,address){

  const key =
    addressKey(address);

  const indexes = [];

  safeArray(passengers).forEach((p,index)=>{

    const target =
      type === "pickup"
        ? p.pickup
        : p.dropoff;

    if(addressKey(target) === key){
      indexes.push(
        p.passengerId ||
        p._id ||
        index
      );
    }
  });

  return indexes;
}

function makeRoutePlanPoint({address,type,order,passengers}){

  const indexes =
    passengerIndexesForAddress(
      passengers,
      type,
      address
    );

  return {
    type,
    address:normalizeAddress(address),
    order,
    passengerIndexes:indexes,
    group:indexes.length > 1
  };
}

function buildSharedRoutePlan({orderedPickups,orderedDropoffs,activePassengers}){

  const routePlan = [];

  for(const address of orderedPickups){
    routePlan.push(
      makeRoutePlanPoint({
        address,
        type:"pickup",
        order:routePlan.length + 1,
        passengers:activePassengers
      })
    );
  }

  for(const address of orderedDropoffs){
    routePlan.push(
      makeRoutePlanPoint({
        address,
        type:"dropoff",
        order:routePlan.length + 1,
        passengers:activePassengers
      })
    );
  }

  return routePlan;
}

function getSharedCase(pickupPoints,dropoffPoints){

  const pickupUnified =
    allSameAddress(pickupPoints);

  const dropoffUnified =
    allSameAddress(dropoffPoints);

  if(pickupUnified && dropoffUnified){
    return "SAME_PICKUP_SAME_DROPOFF";
  }

  if(pickupUnified && !dropoffUnified){
    return "SAME_PICKUP_DIFFERENT_DROPOFF";
  }

  if(!pickupUnified && dropoffUnified){
    return "DIFFERENT_PICKUP_SAME_DROPOFF";
  }

  return "DIFFERENT_PICKUP_DIFFERENT_DROPOFF";
}

/* =========================
   SHARED ROUTE PREP
========================= */

async function buildSmartSharedRoute(trip){

  const sourcePassengers =
    safeArray(trip.passengers);

  const activePassengers =
    getActiveSharedPassengers(trip);

  if(activePassengers.length < 2){
    throw new Error("Shared trip requires at least 2 active passengers");
  }

  const pickupPoints =
    uniqueAddressList(
      activePassengers.map(p=>p.pickup)
    );

  const dropoffPoints =
    uniqueAddressList(
      activePassengers.map(p=>p.dropoff)
    );

  if(!pickupPoints.length || !dropoffPoints.length){
    throw new Error("Shared route is missing pickup/dropoff addresses");
  }

  const routeCase =
    getSharedCase(
      pickupPoints,
      dropoffPoints
    );

  let orderedPickups = [];
  let orderedDropoffs = [];
  let requestsBeforeFinal = 0;

  let pickupOptimization = null;
  let dropoffOptimization = null;

  /* =========================
     CASE 1
     Same pickup + same dropoff
     No optimize request, final route only.
  ========================= */

  if(routeCase === "SAME_PICKUP_SAME_DROPOFF"){

    orderedPickups = [pickupPoints[0]];
    orderedDropoffs = [dropoffPoints[0]];
  }

  /* =========================
     CASE 2
     Same pickup + different dropoffs
     Optimize dropoffs only.
  ========================= */

  else if(routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF"){

    orderedPickups = [pickupPoints[0]];

    dropoffOptimization =
      await optimizeAddressOrder(
        dropoffPoints,
        {
          type:"DROPOFFS",
          startAfter:pickupPoints[0]
        }
      );

    requestsBeforeFinal += 1;

    orderedDropoffs =
      extractOrderedAddresses(
        dropoffOptimization,
        dropoffPoints
      );
  }

  /* =========================
     CASE 3
     Different pickups + same dropoff
     Optimize pickups only.
  ========================= */

  else if(routeCase === "DIFFERENT_PICKUP_SAME_DROPOFF"){

    pickupOptimization =
      await optimizeAddressOrder(
        pickupPoints,
        {
          type:"PICKUPS",
          endAt:dropoffPoints[0]
        }
      );

    requestsBeforeFinal += 1;

    orderedPickups =
      extractOrderedAddresses(
        pickupOptimization,
        pickupPoints
      );

    orderedDropoffs = [dropoffPoints[0]];
  }

  /* =========================
     CASE 4
     Different pickups + different dropoffs
     Optimize pickups, then dropoffs.
     Dropoffs never enter pickup optimization.
  ========================= */

  else {

    pickupOptimization =
      await optimizeAddressOrder(
        pickupPoints,
        {
          type:"PICKUPS"
        }
      );

    requestsBeforeFinal += 1;

    orderedPickups =
      extractOrderedAddresses(
        pickupOptimization,
        pickupPoints
      );

    dropoffOptimization =
      await optimizeAddressOrder(
        dropoffPoints,
        {
          type:"DROPOFFS",
          startAfter:orderedPickups[orderedPickups.length - 1] || ""
        }
      );

    requestsBeforeFinal += 1;

    orderedDropoffs =
      extractOrderedAddresses(
        dropoffOptimization,
        dropoffPoints
      );
  }

  const routePlan =
    buildSharedRoutePlan({
      orderedPickups,
      orderedDropoffs,
      activePassengers
    });

  const finalRoutePoints =
    compactRoutePoints(
      routePlan.map(point=>point.address)
    );

  if(finalRoutePoints.length < 2){
    throw new Error("Final shared route is missing route points");
  }

  return {
    isShared:true,
    routePoints:finalRoutePoints,
    routePlan,
    sharedRoutePlan:routePlan,
    passengers:sourcePassengers,
    activeCount:activePassengers.length,
    sharedStopsCount:Math.max(0,routePlan.length - 2),
    routeCase,
    requestsBeforeFinal,
    routeMeta:{
      mode:routeCase,
      routeCase,
      orderedPickups,
      orderedDropoffs,
      pickupOptimization:pickupOptimization?.meta || null,
      dropoffOptimization:dropoffOptimization?.meta || null
    }
  };
}

function buildPreparedFromSavedTrip(trip,currentSignature){

  const shared =
    isSharedTrip(trip);

  const routePlan =
    savedRoutePlan(trip);

  const routePoints =
    savedRoutePoints(trip);

  const passengers =
    safeArray(trip.passengers);

  return {
    isShared:shared,
    alreadySaved:true,
    routePoints,
    routePlan,
    sharedRoutePlan:shared ? routePlan : [],
    passengers,
    activeCount:
      shared
        ? Math.max(1,passengers.filter(passengerIsActive).length)
        : 1,
    sharedStopsCount:
      shared
        ? Math.max(0,(routePlan.length || routePoints.length) - 2)
        : 0,
    routeCase:
      shared
        ? trip.sharedRouteCase || trip.routeCase || "SAVED_SHARED_ROUTE"
        : "SAVED_INDIVIDUAL_ROUTE",
    routeMeta:{
      mode:"SAVED_ROUTE_REUSED",
      reused:true,
      signature:currentSignature,
      savedSignature:getSavedRouteSignature(trip)
    }
  };
}

/* =========================
   CONFIRM RESERVED TRIP
========================= */

router.post("/:tripId", async (req,res)=>{

  try{

    const Trip =
      getTripModel();

    const tripId =
      req.params.tripId;

    if(!tripId){
      return res.status(400).json({
        success:false,
        message:"Missing trip id"
      });
    }

    const trip =
      await Trip.findById(tripId);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    const shared =
      isSharedTrip(trip);

    const currentSignature =
      buildCurrentRouteSignature(trip);

    const service =
      await getReservedServiceForTrip(trip);

    const pricing =
      getReservedPricing(service);

    let prepared = null;
    let routeData = null;
    let googleRequestsUsed = 0;
    let routeReused = false;

    /*
      IMPORTANT:
      Do NOT block confirm because routeLocked is true.
      routeLocked only means saved route exists.
      If signature is the same, reuse it with 0 Google requests.
    */

    if(hasUsableSavedRoute(trip,currentSignature)){

      prepared =
        buildPreparedFromSavedTrip(
          trip,
          currentSignature
        );

      routeData =
        buildRouteDataFromSavedTrip(trip);

      googleRequestsUsed = 0;
      routeReused = true;

    }else if(shared){

      prepared =
        await buildSmartSharedRoute(trip);

      routeData =
        await calculateRoute(
          prepared.routePoints
        );

      googleRequestsUsed =
        n(prepared.requestsBeforeFinal) + 1;

    }else{

      const routePoints =
        buildIndividualRoutePoints(trip);

      if(routePoints.length < 2){
        return res.status(400).json({
          success:false,
          message:"Route is missing pickup/dropoff"
        });
      }

      prepared = {
        isShared:false,
        routePoints,
        routePlan:[],
        passengers:[],
        activeCount:1,
        sharedStopsCount:0,
        routeCase:"INDIVIDUAL_1_REQUEST",
        routeMeta:{
          mode:"INDIVIDUAL_1_REQUEST"
        }
      };

      routeData =
        await calculateRoute(routePoints);

      googleRequestsUsed = 1;
    }

    const routeMiles =
      n(routeData?.miles);

    if(routeMiles <= 0){
      return res.status(400).json({
        success:false,
        message:"Route miles missing"
      });
    }

    let total = 0;
    let pricePerPassenger = 0;
    let sharedStopTotal = 0;
    let sharedStopShare = 0;
    let finalPassengers =
      safeArray(prepared.passengers);

    const serviceCode =
      shared
        ? "SH"
        : resolveServiceCodeFromTrip(trip);

    if(shared){

      finalPassengers =
        applySharedPassengerOrdersAndCoords({
          passengers:prepared.passengers,
          routePoints:prepared.routePoints,
          routePlan:
            safeArray(prepared.sharedRoutePlan).length
              ? prepared.sharedRoutePlan
              : prepared.routePlan,
          routeData,
          pricing
        });

      const sharedPricing =
        calculateSharedPricing({
          pricing,
          routeData,
          passengers:finalPassengers,
          activeCount:prepared.activeCount,
          stopsCount:prepared.sharedStopsCount
        });

      total =
        sharedPricing.total;

      pricePerPassenger =
        sharedPricing.pricePerPassenger;

      sharedStopTotal =
        sharedPricing.stopTotal;

      sharedStopShare =
        sharedPricing.stopShare;

      finalPassengers =
        sharedPricing.passengers;

    }else{

      const stopsCount =
        safeArray(trip.stops)
          .filter(Boolean).length;

      total =
        calculateReservedPrice({
          pricing,
          miles:routeData.miles,
          minutes:routeData.estimatedMinutes,
          stops:stopsCount
        });

      pricePerPassenger = 0;
    }

    const pricingSnapshot = {
      pricingMode:pricing.pricingMode,
      baseFare:pricing.baseFare,
      includedMiles:pricing.includedMiles,
      perMile:pricing.perMile,
      hourlyRate:pricing.hourlyRate,
      hourlyBillingMode:pricing.hourlyBillingMode,
      stopFee:pricing.stopFee,
      noShowFee:pricing.noShowFee,
      cancelFee:pricing.cancelFee,
      sharedPrice:pricing.sharedPrice,
      warningMinutes:pricing.warningMinutes,
      disableCancel:pricing.disableCancel,
      sharedStopsCount:shared ? prepared.sharedStopsCount : 0,
      sharedStopTotal:shared ? sharedStopTotal : 0,
      sharedStopShare:shared ? sharedStopShare : 0
    };

    const routeMeta = {
      ...(prepared.routeMeta || {}),
      routeReused,
      googleRequestsUsed,
      routeSignature:currentSignature
    };

    const updatedTrip =
      await tripFinalizer.lockConfirmedTrip(trip,{
        ...prepared,

        routePlan:
          safeArray(prepared.routePlan),

        sharedRoutePlan:
          shared
            ? safeArray(prepared.sharedRoutePlan || prepared.routePlan)
            : [],

        passengers:
          shared
            ? finalPassengers
            : [],

        routeData,

        priceAmount:Number(total || 0),
        finalPrice:Number(total || 0),
        pricePerPassenger:Number(pricePerPassenger || 0),

        sharedStopTotal:
          shared ? sharedStopTotal : 0,

        sharedStopShare:
          shared ? sharedStopShare : 0,

        cancelFee:
          n(pricing.cancelFee),

        noShowFee:
          n(pricing.noShowFee),

        pricingSnapshot,

        reservedPricingMode:
          pricing.pricingMode,

        reservationStatus:"RV",

        routeCase:
          prepared.routeCase,

        routeMeta,

        calculationSource:
          routeReused
            ? "SAVED_ROUTE_REUSED"
            : "GOOGLE_DIRECTIONS_REAL_ROUTE",

        googleRequestsUsed,

        routeSource:
          routeReused
            ? "server-confirm-reused-saved-route"
            : shared
              ? "server-smart-shared-route"
              : "server-individual-route"
      });

    updatedTrip.type = "reserved";
    updatedTrip.reservation = true;
    updatedTrip.source = "RV";
    updatedTrip.bookingSource = "RV";

    updatedTrip.serviceKey = serviceCode;
    updatedTrip.serviceType = serviceCode;
    updatedTrip.serviceCode = serviceCode;
    updatedTrip.serviceSuffix = serviceCode;
    updatedTrip.tripNumberSuffix = serviceCode;
    updatedTrip.vehicleTypeFromQuote = serviceCode;
    updatedTrip.vehicleType = serviceCode;

    updatedTrip.serviceName =
      service.serviceName ||
      service.title ||
      service.name ||
      serviceCode;

    updatedTrip.serviceTitle =
      service.serviceName ||
      service.title ||
      service.name ||
      serviceCode;

    updatedTrip.serviceId =
      String(service._id || "");

    updatedTrip.createdFrom =
      updatedTrip.createdFrom ||
      "dispatch-add-trip";

    updatedTrip.routeSignature =
      currentSignature;

    updatedTrip.routeChangePending = false;
    updatedTrip.routeChangeStatus = "";

    if(shared){
      updatedTrip.sharedRouteSignature = currentSignature;
      updatedTrip.sharedRouteCase = prepared.routeCase;
      updatedTrip.sharedGoogleRequestsUsed = googleRequestsUsed;
    }

    await updatedTrip.save();

    return res.json({
      success:true,
      trip:updatedTrip,
      requestsUsed:googleRequestsUsed,
      routeReused,
      routeMode:
        routeReused
          ? "SAVED_ROUTE_REUSED"
          : prepared.routeCase || prepared.routeMeta?.mode || "ROUTE_CALCULATED"
    });

  }catch(err){

    console.log(
      "DISPATCH RESERVED CONFIRM ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:err.message || "Server error"
    });
  }
});

module.exports = router;