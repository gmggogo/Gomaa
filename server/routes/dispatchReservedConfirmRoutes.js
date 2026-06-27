"use strict";

/* =====================================================
   FILE: server/routes/dispatchReservedConfirmRoutes.js
   RESERVED CONFIRM ROUTE
   Server-only confirm logic

   RULES:
   - Add/Edit/Review = no map requests
   - Individual Confirm = 1 Google Directions request
   - Shared Confirm = 3 Google Directions requests
     1. Optimize pickups
     2. Optimize dropoffs
     3. Final route miles/minutes/legs
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
      addressKey(address);

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(address);
  }

  return out;
}

function indexOfAddress(routePoints,address){

  const key =
    addressKey(address);

  return routePoints.findIndex(point=>{
    return addressKey(point) === key;
  });
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
      : [];

  if(!legs.length){
    return map;
  }

  for(const leg of legs){

    const startAddress =
      normalizeAddress(leg.startAddress);

    const endAddress =
      normalizeAddress(leg.endAddress);

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

  /*
    If Google returned formatted addresses that do not exactly match
    the original input, preserve original route order without failing.
  */

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

function applySharedPassengerOrdersAndCoords({
  passengers,
  routePoints,
  routeData,
  pricing
}){

  const coordMap =
    extractRoutePointCoordinates(
      routePoints,
      routeData
    );

  return passengers
    .map((passenger,index)=>{

      const active =
        passengerIsActive(passenger);

      const pickupIndex =
        indexOfAddress(
          routePoints,
          passenger.pickup
        );

      const dropoffIndex =
        indexOfAddress(
          routePoints,
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
          active && pickupIndex >= 0
            ? pickupIndex + 1
            : 9999,

        dropoffOrder:
          active && dropoffIndex >= 0
            ? dropoffIndex + 1
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

  return uniqueAddressList([
    trip.pickup,
    ...(Array.isArray(trip.stops) ? trip.stops : []),
    trip.dropoff
  ]);
}

/* =========================
   SHARED ROUTE PREP
========================= */

function getActiveSharedPassengers(trip){

  const passengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  return passengers.filter(passengerIsActive);
}

async function buildSmartSharedRoute(trip){

  const sourcePassengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

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

  /*
    Request 1:
    Optimize pickups only.
    The routeMapEngine must use Google Directions optimizeWaypoints.
  */

  const pickupOrderResult =
    await optimizeAddressOrder(
      pickupPoints,
      {
        type:"PICKUPS"
      }
    );

  const orderedPickups =
    uniqueAddressList(
      pickupOrderResult.orderedAddresses ||
      pickupOrderResult.routePoints ||
      pickupPoints
    );

  /*
    Request 2:
    Optimize dropoffs only.
  */

  const dropoffOrderResult =
    await optimizeAddressOrder(
      dropoffPoints,
      {
        type:"DROPOFFS",
        startAfter:orderedPickups[orderedPickups.length - 1] || ""
      }
    );

  const orderedDropoffs =
    uniqueAddressList(
      dropoffOrderResult.orderedAddresses ||
      dropoffOrderResult.routePoints ||
      dropoffPoints
    );

  const finalRoutePoints =
    uniqueAddressList([
      ...orderedPickups,
      ...orderedDropoffs
    ]);

  if(finalRoutePoints.length < 2){
    throw new Error("Final shared route is missing route points");
  }

  return {
    isShared:true,
    routePoints:finalRoutePoints,
    passengers:sourcePassengers,
    activeCount:activePassengers.length,
    sharedStopsCount:Math.max(0,finalRoutePoints.length - 2),
    routeMeta:{
      mode:"SMART_SHARED_3_REQUESTS",
      orderedPickups,
      orderedDropoffs,
      pickupOptimization:pickupOrderResult.meta || null,
      dropoffOptimization:dropoffOrderResult.meta || null
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

    if(
      trip.routeLocked === true &&
      trip.routeFinalized === true
    ){
      return res.status(400).json({
        success:false,
        message:"Trip already confirmed and route locked"
      });
    }

    const shared =
      isSharedTrip(trip);

    const service =
      await getReservedServiceForTrip(trip);

    const pricing =
      getReservedPricing(service);

    let prepared = null;

    if(shared){

      prepared =
        await buildSmartSharedRoute(trip);

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
        passengers:[],
        activeCount:1,
        sharedStopsCount:0,
        routeMeta:{
          mode:"INDIVIDUAL_1_REQUEST"
        }
      };
    }

    /*
      Final route request:
      Individual = request 1
      Shared = request 3
      This returns miles/minutes/legs and is used for pricing + route lock.
    */

    const routeData =
      await calculateRoute(
        prepared.routePoints
      );

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
      Array.isArray(prepared.passengers)
        ? prepared.passengers
        : [];

    const serviceCode =
      shared
        ? "SH"
        : resolveServiceCodeFromTrip(trip);

    if(shared){

      finalPassengers =
        applySharedPassengerOrdersAndCoords({
          passengers:prepared.passengers,
          routePoints:prepared.routePoints,
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
        Array.isArray(trip.stops)
          ? trip.stops.filter(Boolean).length
          : 0;

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

    const updatedTrip =
      await tripFinalizer.lockConfirmedTrip(trip,{
        ...prepared,

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

        routeSource:
          shared
            ? "server-smart-shared-3-requests"
            : "server-individual-1-request"
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

    await updatedTrip.save();

    return res.json({
      success:true,
      trip:updatedTrip,
      requestsUsed:shared ? 3 : 1,
      routeMode:shared ? "SMART_SHARED_3_REQUESTS" : "INDIVIDUAL_1_REQUEST"
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