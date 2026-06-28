"use strict";

/* =====================================================
   FILE: server/routes/dispatchReservedConfirmRoutes.js
   RESERVED CONFIRM ROUTE
   Server-only confirm logic

   FINAL ROUTE PLAN:
   - Add/Edit may call /api/address-cache/resolve for NEW addresses only
   - AddressCache /resolve geocodes once and saves lat/lng
   - Review does NOT geocode
   - Confirm is allowed even if route is already saved
   - If route signature did NOT change = reuse saved route = 0 Google requests
   - If route changed = rebuild route
   - Individual route uses saved pickup/dropoff/stop lat/lng only
   - Shared ordering uses saved passenger lat/lng only
   - NO geocode in this file
   - NO Google optimize in this file
   - Final route calculation = 1 Directions request max
===================================================== */

const express = require("express");
const router = express.Router();

const tripFinalizer = require("../utils/trip-finalizer");
const routeMapEngine = require("../utils/routeMapEngine");
const sharedRouteEngine = require("../utils/sharedRouteEngine");
const Service = require("../models/Service");

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

function hasValidLatLng(lat,lng){
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

function getRoutePointAddress(item){

  if(typeof item === "string"){
    return normalizeAddress(item);
  }

  if(item && typeof item === "object"){
    return normalizeAddress(
      item.address ||
      item.formattedAddress ||
      item.fullAddress ||
      ""
    );
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

    const key = addressKey(address);

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
      getRoutePointAddress(item);

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

function compactRouteLocationObjects(list){

  const out = [];
  let lastKey = "";

  for(const item of Array.isArray(list) ? list : []){

    const address =
      getRoutePointAddress(item);

    if(!address){
      continue;
    }

    const key = addressKey(address);

    if(key === lastKey){
      continue;
    }

    out.push(item);
    lastKey = key;
  }

  return out;
}

function isBadAddress(value){

  const v =
    normalizeAddress(value).toLowerCase();

  return (
    !v ||
    v === "undefined" ||
    v === "null" ||
    v === "nan" ||
    v === "-"
  );
}

function normalizePossibleAddress(value){
  return isBadAddress(value)
    ? ""
    : normalizeAddress(value);
}

function splitAddressList(value){

  if(Array.isArray(value)){
    return value
      .map(normalizePossibleAddress)
      .filter(Boolean);
  }

  const text = normalizeAddress(value);

  if(!text){
    return [];
  }

  return text
    .split(/\n|;|\|/g)
    .map(item=>{
      return item
        .replace(/^\s*\d+\s*[\.\-\)]\s*/,"")
        .trim();
    })
    .map(normalizePossibleAddress)
    .filter(Boolean);
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

  const status = cleanStatus(passenger?.status);

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show")
  );
}

/* =========================
   SHARED ADDRESS HELPERS
========================= */

function getSharedPickupAddress(trip,passenger,index){

  const fromPassenger =
    normalizePossibleAddress(passenger?.pickup) ||
    normalizePossibleAddress(passenger?.pickupAddress) ||
    normalizePossibleAddress(passenger?.pickupLocation) ||
    normalizePossibleAddress(passenger?.from);

  if(fromPassenger){
    return fromPassenger;
  }

  const lists = [
    splitAddressList(trip?.pickup),
    splitAddressList(trip?.pickupAddress),
    splitAddressList(trip?.sharedPickups),
    splitAddressList(trip?.pickupList),
    splitAddressList(trip?.pickupAddresses)
  ];

  for(const list of lists){
    if(list[index]){
      return list[index];
    }
  }

  return "";
}

function getSharedDropoffAddress(trip,passenger,index){

  const fromPassenger =
    normalizePossibleAddress(passenger?.dropoff) ||
    normalizePossibleAddress(passenger?.dropoffAddress) ||
    normalizePossibleAddress(passenger?.dropoffLocation) ||
    normalizePossibleAddress(passenger?.to);

  if(fromPassenger){
    return fromPassenger;
  }

  const lists = [
    splitAddressList(trip?.dropoff),
    splitAddressList(trip?.dropoffAddress),
    splitAddressList(trip?.sharedDropoffs),
    splitAddressList(trip?.dropoffList),
    splitAddressList(trip?.dropoffAddresses)
  ];

  for(const list of lists){
    if(list[index]){
      return list[index];
    }
  }

  return "";
}

/* =========================
   ROUTE SIGNATURE
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
      .map((p,index)=>{

        const pickup =
          getSharedPickupAddress(trip,p,index);

        const dropoff =
          getSharedDropoffAddress(trip,p,index);

        return {
          id:String(p.passengerId || p._id || index),
          pickup:addressKey(pickup),
          dropoff:addressKey(dropoff),
          active:passengerIsActive(p) ? "1" : "0"
        };
      })
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

  const plan = savedRoutePlan(trip);

  if(plan.length >= 2){
    return compactRouteLocationObjects(plan);
  }

  return compactRouteLocationObjects(trip?.routePoints || []);
}

function hasUsableSavedRoute(trip,currentSignature){

  const points = savedRoutePoints(trip);

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

  const savedSignature = getSavedRouteSignature(trip);

  if(savedSignature){
    return savedSignature === currentSignature;
  }

  return (
    trip?.routeLocked === true ||
    trip?.routeFinalized === true ||
    trip?.sharedRouteLocked === true
  );
}

/* =========================
   ROUTE DATA NORMALIZATION
========================= */

function firstPositiveNumber(...values){

  for(const value of values){
    const num = n(value);
    if(num > 0){
      return num;
    }
  }

  return 0;
}

function parseDistanceToMiles(value){

  if(Number.isFinite(Number(value))){
    return Number(value);
  }

  const text =
    clean(value).toLowerCase();

  if(!text){
    return 0;
  }

  const match =
    text.match(/([0-9]+(?:\.[0-9]+)?)/);

  if(!match){
    return 0;
  }

  const num =
    Number(match[1]);

  if(!Number.isFinite(num)){
    return 0;
  }

  if(text.includes(" km") || text.includes("kilometer")){
    return num * 0.621371;
  }

  if(text.includes(" ft") || text.includes("feet")){
    return num / 5280;
  }

  if(text.includes(" m") && !text.includes("mi")){
    return num * 0.000621371;
  }

  return num;
}

function parseDurationToMinutes(value){

  if(Number.isFinite(Number(value))){
    return Number(value);
  }

  const text =
    clean(value).toLowerCase();

  if(!text){
    return 0;
  }

  let total = 0;

  const hourMatch =
    text.match(/([0-9]+(?:\.[0-9]+)?)\s*(hour|hours|hr|hrs)/);

  const minMatch =
    text.match(/([0-9]+(?:\.[0-9]+)?)\s*(minute|minutes|min|mins)/);

  if(hourMatch){
    total += Number(hourMatch[1]) * 60;
  }

  if(minMatch){
    total += Number(minMatch[1]);
  }

  if(total > 0){
    return total;
  }

  const any =
    text.match(/([0-9]+(?:\.[0-9]+)?)/);

  return any ? Number(any[1]) : 0;
}

function flattenGoogleLegs(raw){

  const directLegs =
    Array.isArray(raw?.legs)
      ? raw.legs
      : [];

  if(directLegs.length){
    return directLegs;
  }

  const googleRoute =
    raw?.googleRoute ||
    raw?.route ||
    raw?.data ||
    raw ||
    {};

  if(Array.isArray(googleRoute?.legs)){
    return googleRoute.legs;
  }

  if(Array.isArray(googleRoute?.routes?.[0]?.legs)){
    return googleRoute.routes[0].legs;
  }

  if(Array.isArray(raw?.routes?.[0]?.legs)){
    return raw.routes[0].legs;
  }

  return [];
}

function normalizeRouteData(raw, routePoints = []){

  const legs =
    flattenGoogleLegs(raw);

  let legDistanceMeters = 0;
  let legDurationSeconds = 0;

  for(const leg of legs){

    const distanceValue =
      leg?.distance?.value ??
      leg?.distanceMeters ??
      leg?.distance_meters ??
      leg?.distanceValue ??
      0;

    const durationValue =
      leg?.duration?.value ??
      leg?.durationSeconds ??
      leg?.duration_seconds ??
      leg?.durationValue ??
      0;

    legDistanceMeters += n(distanceValue);
    legDurationSeconds += n(durationValue);
  }

  const distanceMeters =
    firstPositiveNumber(
      raw?.distanceMeters,
      raw?.totalDistanceMeters,
      raw?.distance_meters,
      raw?.distance?.value,
      raw?.googleRoute?.distanceMeters,
      raw?.googleRoute?.distance?.value,
      legDistanceMeters
    );

  const durationSeconds =
    firstPositiveNumber(
      raw?.durationSeconds,
      raw?.totalDurationSeconds,
      raw?.duration_seconds,
      raw?.duration?.value,
      raw?.googleRoute?.durationSeconds,
      raw?.googleRoute?.duration?.value,
      legDurationSeconds
    );

  const miles =
    firstPositiveNumber(
      raw?.miles,
      raw?.totalMiles,
      raw?.distanceMiles,
      raw?.routeMiles,
      raw?.googleRoute?.miles,
      parseDistanceToMiles(raw?.distanceText),
      parseDistanceToMiles(raw?.totalDistance),
      parseDistanceToMiles(raw?.distance),
      parseDistanceToMiles(raw?.googleRoute?.distanceText),
      distanceMeters > 0 ? distanceMeters * 0.000621371 : 0
    );

  const estimatedMinutes =
    firstPositiveNumber(
      raw?.estimatedMinutes,
      raw?.minutes,
      raw?.totalMinutes,
      raw?.durationMinutes,
      raw?.googleRoute?.estimatedMinutes,
      parseDurationToMinutes(raw?.durationText),
      parseDurationToMinutes(raw?.totalDuration),
      parseDurationToMinutes(raw?.duration),
      durationSeconds > 0 ? durationSeconds / 60 : 0
    );

  return {
    ...(raw || {}),
    miles:Number(Number(miles).toFixed(2)),
    distanceMeters:Number(distanceMeters || 0),
    durationSeconds:Number(durationSeconds || 0),
    estimatedMinutes:Number(Math.round(estimatedMinutes || 0)),
    polyline:
      raw?.polyline ||
      raw?.routePolyline ||
      raw?.overviewPolyline ||
      raw?.googleRoute?.overviewPolyline ||
      raw?.googleRoute?.overview_polyline?.points ||
      raw?.routes?.[0]?.overview_polyline?.points ||
      "",
    googleRoute:
      raw?.googleRoute ||
      raw?.route ||
      raw ||
      {},
    routePoints:
      safeArray(raw?.routePoints).length
        ? safeArray(raw.routePoints)
        : safeArray(routePoints)
  };
}

function buildRouteDataFromSavedTrip(trip){

  return normalizeRouteData({
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
  }, trip?.routePoints || []);
}

/* =========================
   ROUTE MAP ENGINE WRAPPER
========================= */

async function calculateRoute(routePoints){

  let raw = null;

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRouteMiles === "function"
  ){
    raw = await routeMapEngine.calculateRouteMiles(routePoints);
    return normalizeRouteData(raw, routePoints);
  }

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRoute === "function"
  ){
    raw = await routeMapEngine.calculateRoute(routePoints);
    return normalizeRouteData(raw, routePoints);
  }

  throw new Error("routeMapEngine calculate function not found");
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

  const code = resolveServiceCodeFromTrip(trip);

  if(!code){
    throw new Error("Reserved service code missing");
  }

  const services = await Service.find({}).lean();

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

      return fields.some(field=>normalizeCode(field) === code);
    });

  if(!found){
    throw new Error("Reserved service not found: " + code);
  }

  return found;
}

function getReservedPricing(service){

  return {
    pricingMode:clean(service?.reservedPricingMode || "MILE").toUpperCase(),
    baseFare:n(service?.reservedBaseFare),
    includedMiles:n(service?.reservedIncludedMiles),
    perMile:n(service?.reservedPerMile),
    hourlyRate:n(service?.reservedHourlyRate),
    hourlyBillingMode:clean(service?.reservedHourlyBillingMode || "FULL").toUpperCase(),
    stopFee:n(service?.reservedStopFee),
    noShowFee:n(service?.reservedNoShowFee),
    cancelFee:n(service?.reservedCancelFee),
    sharedPrice:n(service?.reservedSharedPrice),
    warningMinutes:Number(service?.reservedWarningMinutes ?? 120),
    disableCancel:bool(service?.reservedDisableCancel)
  };
}

function calculateReservedPrice({pricing,miles,minutes,stops}){

  const mode = clean(pricing.pricingMode || "MILE").toUpperCase();
  const stopCount = n(stops);
  let total = 0;

  if(mode === "HOURLY"){

    const mins = Math.max(0,n(minutes));
    let billableHours = 0;

    if(pricing.hourlyBillingMode === "QUARTER"){
      billableHours = Math.ceil(mins / 15) * 0.25;
    }else{
      billableHours = Math.ceil(mins / 60);
    }

    total =
      (billableHours * n(pricing.hourlyRate)) +
      (stopCount * n(pricing.stopFee));

  }else{

    const extraMiles =
      Math.max(0,n(miles) - n(pricing.includedMiles));

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

  const count = Math.max(1,n(activeCount));
  const routeMiles = n(routeData?.miles);

  if(n(pricing.sharedPrice) > 0){

    const fixed = n(pricing.sharedPrice);
    const total = Number((fixed * count).toFixed(2));

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

  const includedMilesTotal = n(pricing.includedMiles) * count;
  const extraMiles = Math.max(0,routeMiles - includedMilesTotal);
  const baseTotal = Number((n(pricing.baseFare) * count).toFixed(2));
  const mileageTotal = Number((extraMiles * n(pricing.perMile)).toFixed(2));
  const stopTotal = Number((n(stopsCount) * n(pricing.stopFee)).toFixed(2));
  const total = Number((baseTotal + mileageTotal + stopTotal).toFixed(2));
  const pricePerPassenger = Number((total / count).toFixed(2));

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

  const map = new Map();

  for(const point of safeArray(routePoints)){

    const address = getRoutePointAddress(point);

    if(!address){
      continue;
    }

    if(hasValidLatLng(point?.lat,point?.lng)){
      map.set(addressKey(address),{
        address,
        lat:Number(point.lat),
        lng:Number(point.lng)
      });
    }
  }

  const legs =
    Array.isArray(routeData?.googleRoute?.legs)
      ? routeData.googleRoute.legs
      : Array.isArray(routeData?.legs)
        ? routeData.legs
        : [];

  for(const leg of legs){

    const startAddress = normalizeAddress(leg.startAddress || leg.start_address);
    const endAddress = normalizeAddress(leg.endAddress || leg.end_address);

    if(
      startAddress &&
      Number.isFinite(Number(leg.startLat)) &&
      Number.isFinite(Number(leg.startLng))
    ){
      map.set(addressKey(startAddress),{
        address:startAddress,
        lat:Number(leg.startLat),
        lng:Number(leg.startLng)
      });
    }

    if(
      endAddress &&
      Number.isFinite(Number(leg.endLat)) &&
      Number.isFinite(Number(leg.endLng))
    ){
      map.set(addressKey(endAddress),{
        address:endAddress,
        lat:Number(leg.endLat),
        lng:Number(leg.endLng)
      });
    }
  }

  return map;
}

function routePlanOrder(routePlan,type,address){

  const key = addressKey(address);

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
  routePlan,
  routeData,
  pricing
}){

  const coordMap =
    extractRoutePointCoordinates(routePlan,routeData);

  return safeArray(passengers)
    .map((passenger,index)=>{

      const active = passengerIsActive(passenger);

      const pickupOrder = routePlanOrder(routePlan,"pickup",passenger.pickup);
      const dropoffOrder = routePlanOrder(routePlan,"dropoff",passenger.dropoff);

      const pickupKey = addressKey(passenger.pickup);
      const dropoffKey = addressKey(passenger.dropoff);

      const pickupCoord = coordMap.get(pickupKey) || null;
      const dropoffCoord = coordMap.get(dropoffKey) || null;

      return {
        ...passenger,
        pickup:normalizePossibleAddress(passenger.pickup),
        pickupLat:
          Number.isFinite(Number(pickupCoord?.lat))
            ? Number(pickupCoord.lat)
            : passenger.pickupLat ?? null,
        pickupLng:
          Number.isFinite(Number(pickupCoord?.lng))
            ? Number(pickupCoord.lng)
            : passenger.pickupLng ?? null,
        dropoff:normalizePossibleAddress(passenger.dropoff),
        dropoffLat:
          Number.isFinite(Number(dropoffCoord?.lat))
            ? Number(dropoffCoord.lat)
            : passenger.dropoffLat ?? null,
        dropoffLng:
          Number.isFinite(Number(dropoffCoord?.lng))
            ? Number(dropoffCoord.lng)
            : passenger.dropoffLng ?? null,
        pickupOrder:active ? pickupOrder : 9999,
        dropoffOrder:active ? dropoffOrder : 9999,
        routeOrder:index + 1,
        status:active ? "Confirmed" : passenger.status || "Scheduled",
        cancelFee:active ? n(pricing.cancelFee) : n(passenger.cancelFee),
        noShowFee:active ? n(pricing.noShowFee) : n(passenger.noShowFee)
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

function findStopCoordinate(trip,stop){

  const coords =
    safeArray(trip?.stopCoordinates);

  const found =
    coords.find(item=>{
      return addressKey(item?.address) === addressKey(stop);
    });

  if(found && hasValidLatLng(found.lat,found.lng)){
    return {
      lat:Number(found.lat),
      lng:Number(found.lng)
    };
  }

  return null;
}

function buildIndividualRoutePoints(trip){

  const pickup =
    normalizePossibleAddress(trip?.pickup);

  const dropoff =
    normalizePossibleAddress(trip?.dropoff);

  if(!pickup || !dropoff){
    throw new Error("Route is missing pickup/dropoff");
  }

  if(!hasValidLatLng(trip?.pickupLat,trip?.pickupLng)){
    throw new Error(
      "Missing pickup coordinates | address: " +
      pickup +
      " | Confirm does not geocode. Save lat/lng before confirm."
    );
  }

  if(!hasValidLatLng(trip?.dropoffLat,trip?.dropoffLng)){
    throw new Error(
      "Missing dropoff coordinates | address: " +
      dropoff +
      " | Confirm does not geocode. Save lat/lng before confirm."
    );
  }

  const points = [];

  points.push({
    type:"pickup",
    address:pickup,
    lat:Number(trip.pickupLat),
    lng:Number(trip.pickupLng),
    order:1
  });

  const stops =
    safeArray(trip?.stops)
      .map(normalizePossibleAddress)
      .filter(Boolean);

  stops.forEach((stop)=>{

    const coord =
      findStopCoordinate(trip,stop);

    if(!coord){
      throw new Error(
        "Missing stop coordinates | stop: " +
        stop +
        " | Confirm does not geocode. Save lat/lng before confirm."
      );
    }

    points.push({
      type:"stop",
      address:stop,
      lat:Number(coord.lat),
      lng:Number(coord.lng),
      order:points.length + 1
    });
  });

  points.push({
    type:"dropoff",
    address:dropoff,
    lat:Number(trip.dropoffLat),
    lng:Number(trip.dropoffLng),
    order:points.length + 1
  });

  return compactRouteLocationObjects(points);
}

/* =========================
   SHARED ROUTE PREP
========================= */

function normalizePassengerId(passenger,index){
  return String(
    passenger?.passengerId ||
    passenger?._id ||
    index
  );
}

function buildSharedPassengerPayload(trip){

  const sourcePassengers =
    safeArray(trip.passengers)
      .map((passenger,index)=>{

        const pickup =
          getSharedPickupAddress(trip,passenger,index);

        const dropoff =
          getSharedDropoffAddress(trip,passenger,index);

        return {
          ...passenger,
          passengerId:normalizePassengerId(passenger,index),
          pickup,
          dropoff
        };
      });

  const activePassengers =
    sourcePassengers.filter(passenger=>{
      return (
        passengerIsActive(passenger) &&
        normalizePossibleAddress(passenger.pickup) &&
        normalizePossibleAddress(passenger.dropoff)
      );
    });

  if(activePassengers.length < 2){
    throw new Error("Shared trip requires at least 2 active passengers with pickup/dropoff addresses");
  }

  for(const passenger of activePassengers){

    const name =
      passenger.clientName ||
      passenger.name ||
      passenger.passengerId ||
      "";

    if(!normalizePossibleAddress(passenger.pickup)){
      throw new Error("Missing pickup for passenger: " + name);
    }

    if(!normalizePossibleAddress(passenger.dropoff)){
      throw new Error("Missing dropoff for passenger: " + name);
    }

    if(!hasValidLatLng(passenger.pickupLat,passenger.pickupLng)){
      throw new Error(
        "Missing pickup coordinates for passenger: " +
        name +
        " | address: " +
        passenger.pickup +
        " | Confirm does not geocode. Save lat/lng before confirm."
      );
    }

    if(!hasValidLatLng(passenger.dropoffLat,passenger.dropoffLng)){
      throw new Error(
        "Missing dropoff coordinates for passenger: " +
        name +
        " | address: " +
        passenger.dropoff +
        " | Confirm does not geocode. Save lat/lng before confirm."
      );
    }
  }

  return sourcePassengers.map(passenger=>{

    const found =
      activePassengers.find(active=>{
        return String(active.passengerId) === String(passenger.passengerId);
      });

    return found || passenger;
  });
}

function buildSmartSharedRoute(trip){

  const passengers =
    buildSharedPassengerPayload(trip);

  const result =
    sharedRouteEngine.buildSharedRouteFromSavedCoordinates(
      passengers,
      {debug:false}
    );

  const routePlan =
    safeArray(result.routePlan);

  const finalRoutePoints =
    routePlan;

  return {
    isShared:true,
    routePoints:finalRoutePoints,
    routePlan,
    sharedRoutePlan:routePlan,
    passengers:result.passengers || passengers,
    activeCount:result.activeCount || passengers.filter(passengerIsActive).length,
    sharedStopsCount:Math.max(0,routePlan.length - 2),
    routeCase:result.routeCase || result.mode || "SHARED_LOCAL_AIR_ORDER",
    requestsBeforeFinal:0,
    routeMeta:{
      mode:result.routeCase || result.mode || "SHARED_LOCAL_AIR_ORDER",
      policy:"LOCAL_AIR_DISTANCE_ORDER_ONE_FINAL_DIRECTIONS",
      calculationSource:result.calculationSource || "SAVED_COORDINATES_CANDIDATE_ONLY",
      googleRequestsUsed:0,
      orderedPickups:safeArray(result.orderedPickups).map(p=>p.address),
      orderedDropoffs:safeArray(result.orderedDropoffs).map(p=>p.address)
    }
  };
}

function buildPreparedFromSavedTrip(trip,currentSignature){

  const shared = isSharedTrip(trip);
  const routePlan = savedRoutePlan(trip);
  const routePoints = savedRoutePoints(trip);
  const passengers = safeArray(trip.passengers);

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

    const Trip = getTripModel();
    const tripId = req.params.tripId;

    if(!tripId){
      return res.status(400).json({
        success:false,
        message:"Missing trip id"
      });
    }

    const trip = await Trip.findById(tripId);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    const shared = isSharedTrip(trip);
    const currentSignature = buildCurrentRouteSignature(trip);
    const service = await getReservedServiceForTrip(trip);
    const pricing = getReservedPricing(service);

    let prepared = null;
    let routeData = null;
    let googleRequestsUsed = 0;
    let routeReused = false;

    if(hasUsableSavedRoute(trip,currentSignature)){

      prepared = buildPreparedFromSavedTrip(trip,currentSignature);
      routeData = buildRouteDataFromSavedTrip(trip);
      googleRequestsUsed = 0;
      routeReused = true;

    }else if(shared){

      prepared = buildSmartSharedRoute(trip);

      routeData = await calculateRoute(prepared.routePlan);
      googleRequestsUsed = 1;

    }else{

      const routePoints =
        buildIndividualRoutePoints(trip);

      prepared = {
        isShared:false,
        routePoints,
        routePlan:routePoints,
        passengers:[],
        activeCount:1,
        sharedStopsCount:0,
        routeCase:"INDIVIDUAL_1_REQUEST",
        routeMeta:{
          mode:"INDIVIDUAL_1_REQUEST",
          policy:"SAVED_COORDINATES_ONE_FINAL_DIRECTIONS"
        }
      };

      routeData = await calculateRoute(routePoints);
      googleRequestsUsed = 1;
    }

    const routeMiles =
      firstPositiveNumber(
        routeData?.miles,
        routeData?.distanceMeters > 0
          ? routeData.distanceMeters * 0.000621371
          : 0
      );

    if(routeMiles <= 0){

      console.log("ROUTE DATA MISSING MILES:", {
        routePoints:prepared?.routePoints,
        routePlan:prepared?.routePlan,
        routeData
      });

      return res.status(400).json({
        success:false,
        message:"Route miles missing"
      });
    }

    routeData.miles =
      Number(Number(routeMiles).toFixed(2));

    let total = 0;
    let pricePerPassenger = 0;
    let sharedStopTotal = 0;
    let sharedStopShare = 0;
    let finalPassengers = safeArray(prepared.passengers);

    const serviceCode =
      shared
        ? "SH"
        : resolveServiceCodeFromTrip(trip);

    if(shared){

      finalPassengers =
        applySharedPassengerOrdersAndCoords({
          passengers:prepared.passengers,
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

      total = sharedPricing.total;
      pricePerPassenger = sharedPricing.pricePerPassenger;
      sharedStopTotal = sharedPricing.stopTotal;
      sharedStopShare = sharedPricing.stopShare;
      finalPassengers = sharedPricing.passengers;

    }else{

      const stopsCount =
        safeArray(trip.stops).filter(Boolean).length;

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
        routePlan:safeArray(prepared.routePlan),
        sharedRoutePlan:
          shared
            ? safeArray(prepared.sharedRoutePlan || prepared.routePlan)
            : [],
        passengers:shared ? finalPassengers : [],
        routeData,
        priceAmount:Number(total || 0),
        finalPrice:Number(total || 0),
        pricePerPassenger:Number(pricePerPassenger || 0),
        sharedStopTotal:shared ? sharedStopTotal : 0,
        sharedStopShare:shared ? sharedStopShare : 0,
        cancelFee:n(pricing.cancelFee),
        noShowFee:n(pricing.noShowFee),
        pricingSnapshot,
        reservedPricingMode:pricing.pricingMode,
        reservationStatus:"RV",
        routeCase:prepared.routeCase,
        routeMeta,
        calculationSource:
          routeReused
            ? "SAVED_ROUTE_REUSED"
            : "LOCAL_AIR_ORDER_ONE_FINAL_DIRECTIONS",
        googleRequestsUsed,
        routeSource:
          routeReused
            ? "server-confirm-reused-saved-route"
            : shared
              ? "server-shared-local-air-route"
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

    updatedTrip.serviceId = String(service._id || "");
    updatedTrip.createdFrom = updatedTrip.createdFrom || "dispatch-add-trip";

    updatedTrip.routePoints = safeArray(prepared.routePoints);
    updatedTrip.routePlan = safeArray(prepared.routePlan);
    updatedTrip.routeSignature = currentSignature;
    updatedTrip.routeLocked = true;
    updatedTrip.routeFinalized = true;
    updatedTrip.routeChangePending = false;
    updatedTrip.routeChangeStatus = "";
    updatedTrip.routeMeta = routeMeta;
    updatedTrip.googleRequestsUsed = googleRequestsUsed;

    if(shared){

      updatedTrip.sharedRoutePlan =
        safeArray(prepared.sharedRoutePlan || prepared.routePlan);

      updatedTrip.sharedRouteSignature = currentSignature;
      updatedTrip.sharedRouteCase = prepared.routeCase;
      updatedTrip.sharedGoogleRequestsUsed = googleRequestsUsed;
      updatedTrip.sharedRouteLocked = true;
      updatedTrip.sharedStopsCount = prepared.sharedStopsCount;
      updatedTrip.sharedRouteMeta = routeMeta;
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