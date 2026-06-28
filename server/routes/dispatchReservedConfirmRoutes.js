"use strict";

/* =====================================================
   FILE: server/routes/dispatchReservedConfirmRoutes.js
   RESERVED CONFIRM ROUTE
   Server-only confirm logic

   SAFE VERSION:
   - Keeps old working behavior.
   - Individual trips still calculate route by address strings.
   - Shared trips can geocode missing passenger coordinates during Confirm.
   - Shared geocoded lat/lng are saved back inside trip.passengers.
   - If AddressCache model exists, geocoded addresses are also saved/reused.
   - Counts requests:
       geocodeRequestsUsed
       directionsRequestsUsed
       googleRequestsUsed = geocode + directions
   - If route signature did NOT change = reuse saved route = 0 Google requests.
   - Google final route calculates miles/minutes/polyline only.
   - Google must not reorder final route.
===================================================== */

const express = require("express");
const router = express.Router();
const https = require("https");

const tripFinalizer = require("../utils/trip-finalizer");
const routeMapEngine = require("../utils/routeMapEngine");
const Service = require("../models/Service");

/* =========================
   OPTIONAL ADDRESS CACHE
========================= */

let AddressCache = null;

try{
  AddressCache = require("../models/AddressCache");
}catch(err){
  AddressCache = null;
}

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
   REQUEST COUNTERS
========================= */

function createRequestStats(){
  return {
    geocodeRequestsUsed:0,
    geocodeCacheHits:0,
    directionsRequestsUsed:0,
    googleRequestsUsed:0
  };
}

function finalizeRequestStats(stats){
  stats.geocodeRequestsUsed = n(stats.geocodeRequestsUsed);
  stats.geocodeCacheHits = n(stats.geocodeCacheHits);
  stats.directionsRequestsUsed = n(stats.directionsRequestsUsed);
  stats.googleRequestsUsed =
    n(stats.geocodeRequestsUsed) +
    n(stats.directionsRequestsUsed);

  return stats;
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
    return compactRoutePoints(
      plan.map(p=>p.address)
    );
  }

  return compactRoutePoints(trip?.routePoints || []);
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
   ROUTE MAP ENGINE WRAPPERS
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

function getGoogleMapsApiKey(){

  return (
    process.env.GOOGLE_SERVER_KEY ||
    process.env.GOOGLE_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.SERVER_GOOGLE_MAPS_KEY ||
    ""
  );
}

function httpsGetJson(url){

  return new Promise((resolve,reject)=>{

    https.get(url,response=>{

      let data = "";

      response.on("data",chunk=>{
        data += chunk;
      });

      response.on("end",()=>{

        try{
          resolve(JSON.parse(data));
        }catch(err){
          reject(err);
        }
      });

    }).on("error",reject);
  });
}

/* =========================
   ADDRESS CACHE HELPERS
========================= */

async function lookupAddressCache(address,stats = null){

  if(!AddressCache){
    return null;
  }

  const fullAddress =
    normalizePossibleAddress(address);

  if(!fullAddress){
    return null;
  }

  const key =
    addressKey(fullAddress);

  try{

    const found =
      await AddressCache.findOne({
        $or:[
          {addressKey:key},
          {key},
          {normalizedAddress:key},
          {fullAddress:new RegExp("^" + fullAddress.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "$","i")},
          {address:new RegExp("^" + fullAddress.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "$","i")}
        ]
      });

    if(found && hasValidLatLng(found.lat,found.lng)){

      if(stats){
        stats.geocodeCacheHits += 1;
      }

      found.usedCount = n(found.usedCount) + 1;
      found.lastUsedAt = new Date();

      await found.save().catch(()=>null);

      return {
        lat:Number(found.lat),
        lng:Number(found.lng),
        source:"address-cache"
      };
    }

  }catch(err){
    console.log("AddressCache lookup failed:", err.message);
  }

  return null;
}

async function saveAddressCache(address,coords,source = "confirm-geocode"){

  if(!AddressCache){
    return null;
  }

  const fullAddress =
    normalizePossibleAddress(address);

  if(!fullAddress || !hasValidLatLng(coords?.lat,coords?.lng)){
    return null;
  }

  const key =
    addressKey(fullAddress);

  try{

    const update = {
      addressKey:key,
      key,
      normalizedAddress:key,
      fullAddress,
      address:fullAddress,
      lat:Number(coords.lat),
      lng:Number(coords.lng),
      source,
      updatedAt:new Date(),
      lastUsedAt:new Date(),
      $inc:{
        usedCount:1
      }
    };

    const saved =
      await AddressCache.findOneAndUpdate(
        {
          $or:[
            {addressKey:key},
            {key},
            {normalizedAddress:key}
          ]
        },
        {
          $set:update,
          $setOnInsert:{
            createdAt:new Date()
          }
        },
        {
          new:true,
          upsert:true,
          setDefaultsOnInsert:true
        }
      );

    return saved;

  }catch(err){
    console.log("AddressCache save failed:", err.message);
    return null;
  }
}

/* =========================
   GEOCODING
========================= */

async function geocodeAddress(address,stats = null){

  const cleanAddress = normalizePossibleAddress(address);

  if(!cleanAddress){
    return null;
  }

  const cached =
    await lookupAddressCache(cleanAddress,stats);

  if(cached){
    return cached;
  }

  const fn =
    routeMapEngine?.geocodeAddress ||
    routeMapEngine?.geocode ||
    routeMapEngine?.getCoordinates ||
    routeMapEngine?.getLatLng ||
    null;

  if(typeof fn === "function"){

    try{

      if(stats){
        stats.geocodeRequestsUsed += 1;
      }

      const result = await fn(cleanAddress);

      const lat =
        result?.lat ??
        result?.latitude ??
        result?.location?.lat ??
        result?.geometry?.location?.lat;

      const lng =
        result?.lng ??
        result?.lon ??
        result?.longitude ??
        result?.location?.lng ??
        result?.location?.lon ??
        result?.geometry?.location?.lng;

      if(
        Number.isFinite(Number(lat)) &&
        Number.isFinite(Number(lng))
      ){
        const coords = {
          lat:Number(lat),
          lng:Number(lng),
          source:"routeMapEngine-geocode"
        };

        await saveAddressCache(cleanAddress,coords,coords.source);

        return coords;
      }

    }catch(err){
      console.log("routeMapEngine geocode failed:", err.message);
    }
  }

  const apiKey = getGoogleMapsApiKey();

  if(!apiKey){
    console.log("Missing Google Maps API key for geocode");
    return null;
  }

  if(stats){
    stats.geocodeRequestsUsed += 1;
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(cleanAddress) +
    "&key=" +
    encodeURIComponent(apiKey);

  const json = await httpsGetJson(url);

  if(
    json?.status !== "OK" ||
    !Array.isArray(json.results) ||
    !json.results.length
  ){
    console.log(
      "Google geocode failed:",
      cleanAddress,
      json?.status,
      json?.error_message || ""
    );

    return null;
  }

  const location = json.results[0]?.geometry?.location;

  if(
    Number.isFinite(Number(location?.lat)) &&
    Number.isFinite(Number(location?.lng))
  ){
    const coords = {
      lat:Number(location.lat),
      lng:Number(location.lng),
      source:"google-geocode"
    };

    await saveAddressCache(cleanAddress,coords,coords.source);

    return coords;
  }

  return null;
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

  for(const point of routePoints){

    const key = addressKey(point);

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
  routePoints,
  routePlan,
  routeData,
  pricing
}){

  const coordMap =
    extractRoutePointCoordinates(routePoints,routeData);

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

function buildIndividualRoutePoints(trip){

  return compactRoutePoints([
    trip.pickup,
    ...safeArray(trip.stops),
    trip.dropoff
  ]);
}

/* =========================
   SHARED ROUTE PIPELINE HELPERS
========================= */

function toRad(value){
  return Number(value || 0) * Math.PI / 180;
}

function distanceMilesByCoords(a,b){

  if(
    !hasValidLatLng(a?.lat,a?.lng) ||
    !hasValidLatLng(b?.lat,b?.lng)
  ){
    return Number.MAX_SAFE_INTEGER;
  }

  const R = 3958.8;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1 - h));
}

function normalizePassengerId(passenger,index){
  return String(
    passenger?.passengerId ||
    passenger?._id ||
    index
  );
}

function makePickupPoint(passenger,index){

  return {
    type:"pickup",
    address:normalizePossibleAddress(passenger.pickup),
    lat:Number(passenger.pickupLat),
    lng:Number(passenger.pickupLng),
    passengerId:normalizePassengerId(passenger,index),
    passengerIndex:index,
    passengerName:passenger.clientName || passenger.name || "",
    phone:passenger.clientPhone || passenger.phone || ""
  };
}

function makeDropoffPoint(passenger,index){

  return {
    type:"dropoff",
    address:normalizePossibleAddress(passenger.dropoff),
    lat:Number(passenger.dropoffLat),
    lng:Number(passenger.dropoffLng),
    passengerId:normalizePassengerId(passenger,index),
    passengerIndex:index,
    passengerName:passenger.clientName || passenger.name || "",
    phone:passenger.clientPhone || passenger.phone || ""
  };
}

function uniqueTypedRoutePoints(points){

  const out = [];
  const seen = new Map();

  for(const point of safeArray(points)){

    if(!normalizePossibleAddress(point?.address)){
      continue;
    }

    if(!hasValidLatLng(point.lat,point.lng)){
      throw new Error(
        `Missing coordinates for shared ${point.type}: ${point.address}`
      );
    }

    const key =
      `${clean(point.type).toLowerCase()}|${addressKey(point.address)}`;

    if(seen.has(key)){

      const existing = seen.get(key);

      existing.passengerIndexes =
        Array.from(new Set([
          ...(existing.passengerIndexes || []),
          point.passengerId
        ]));

      existing.group = true;
      continue;
    }

    const cleanPoint = {
      ...point,
      passengerIndexes:[point.passengerId],
      group:false
    };

    seen.set(key,cleanPoint);
    out.push(cleanPoint);
  }

  return out;
}

async function ensurePassengerPointCoordinates(passenger,stats){

  const out = { ...passenger };

  if(!hasValidLatLng(out.pickupLat,out.pickupLng)){

    console.log("======== GEOCODE PICKUP START ========");
    console.log("Passenger:", out.clientName || out.name || out.passengerId || "");
    console.log("Pickup address:", out.pickup);
    console.log("Google key exists:", getGoogleMapsApiKey() ? "YES" : "NO");

    const coords = await geocodeAddress(out.pickup,stats);

    console.log("Pickup geocode result:", coords);
    console.log("======== GEOCODE PICKUP END ========");

    if(coords){
      out.pickupLat = coords.lat;
      out.pickupLng = coords.lng;
    }
  }else{
    await saveAddressCache(
      out.pickup,
      {
        lat:out.pickupLat,
        lng:out.pickupLng
      },
      "existing-passenger-pickup"
    );
  }

  if(!hasValidLatLng(out.dropoffLat,out.dropoffLng)){

    console.log("======== GEOCODE DROPOFF START ========");
    console.log("Passenger:", out.clientName || out.name || out.passengerId || "");
    console.log("Dropoff address:", out.dropoff);
    console.log("Google key exists:", getGoogleMapsApiKey() ? "YES" : "NO");

    const coords = await geocodeAddress(out.dropoff,stats);

    console.log("Dropoff geocode result:", coords);
    console.log("======== GEOCODE DROPOFF END ========");

    if(coords){
      out.dropoffLat = coords.lat;
      out.dropoffLng = coords.lng;
    }
  }else{
    await saveAddressCache(
      out.dropoff,
      {
        lat:out.dropoffLat,
        lng:out.dropoffLng
      },
      "existing-passenger-dropoff"
    );
  }

  return out;
}

/* =========================
   1) COLLECT POINTS
========================= */

async function collectSharedPoints(trip,stats){

  const sourcePassengers =
    safeArray(trip.passengers)
      .map((passenger,index)=>{

        const pickup =
          getSharedPickupAddress(trip,passenger,index);

        const dropoff =
          getSharedDropoffAddress(trip,passenger,index);

        return {
          ...passenger,
          pickup,
          dropoff
        };
      });

  const activePassengersRaw =
    sourcePassengers.filter(passenger=>{
      return (
        passengerIsActive(passenger) &&
        normalizePossibleAddress(passenger.pickup) &&
        normalizePossibleAddress(passenger.dropoff)
      );
    });

  if(activePassengersRaw.length < 2){
    throw new Error("Shared trip requires at least 2 active passengers with pickup/dropoff addresses");
  }

  const activePassengers = [];

  for(const passenger of activePassengersRaw){

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

    const withCoords =
      await ensurePassengerPointCoordinates(passenger,stats);

    if(!hasValidLatLng(withCoords.pickupLat,withCoords.pickupLng)){
      throw new Error(
        "Missing pickup coordinates for passenger: " +
        name +
        " | address: " +
        withCoords.pickup +
        " | Google key exists: " +
        (getGoogleMapsApiKey() ? "YES" : "NO")
      );
    }

    if(!hasValidLatLng(withCoords.dropoffLat,withCoords.dropoffLng)){
      throw new Error(
        "Missing dropoff coordinates for passenger: " +
        name +
        " | address: " +
        withCoords.dropoff +
        " | Google key exists: " +
        (getGoogleMapsApiKey() ? "YES" : "NO")
      );
    }

    activePassengers.push(withCoords);
  }

  const pickupPoints =
    uniqueTypedRoutePoints(
      activePassengers.map(makePickupPoint)
    );

  const dropoffPoints =
    uniqueTypedRoutePoints(
      activePassengers.map(makeDropoffPoint)
    );

  if(!pickupPoints.length || !dropoffPoints.length){
    throw new Error("Shared route is missing pickup/dropoff points");
  }

  const sourcePassengersWithCoords =
    sourcePassengers.map(passenger=>{

      const found =
        activePassengers.find(active=>{
          return (
            addressKey(active.pickup) === addressKey(passenger.pickup) &&
            addressKey(active.dropoff) === addressKey(passenger.dropoff)
          );
        });

      if(!found){
        return passenger;
      }

      return {
        ...passenger,
        pickupLat:found.pickupLat,
        pickupLng:found.pickupLng,
        dropoffLat:found.dropoffLat,
        dropoffLng:found.dropoffLng
      };
    });

  return {
    sourcePassengers:sourcePassengersWithCoords,
    activePassengers,
    pickupPoints,
    dropoffPoints
  };
}

/* =========================
   2) DETECT CASE
========================= */

function allSamePointAddress(points){

  const list = safeArray(points);

  if(list.length <= 1){
    return true;
  }

  const first = addressKey(list[0].address);

  return list.every(point=>addressKey(point.address) === first);
}

function detectSharedCase(pickupPoints,dropoffPoints){

  const pickupUnified = allSamePointAddress(pickupPoints);
  const dropoffUnified = allSamePointAddress(dropoffPoints);

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
   3) BUILD CENTER POINT
========================= */

function buildSharedCenterPoint(pickupPoints,dropoffPoints){

  let anchorPickup = null;
  let anchorDropoff = null;
  let anchorMiles = Number.MAX_SAFE_INTEGER;

  for(const pickup of pickupPoints){

    for(const dropoff of dropoffPoints){

      const miles = distanceMilesByCoords(pickup,dropoff);

      if(miles < anchorMiles){
        anchorMiles = miles;
        anchorPickup = pickup;
        anchorDropoff = dropoff;
      }
    }
  }

  if(!anchorPickup || !anchorDropoff){
    throw new Error("Could not find shared route center point");
  }

  const centerPoint = {
    type:"center",
    address:"__SHARED_CENTER_POINT__",
    lat:(Number(anchorPickup.lat) + Number(anchorDropoff.lat)) / 2,
    lng:(Number(anchorPickup.lng) + Number(anchorDropoff.lng)) / 2
  };

  return {
    centerPoint,
    anchorPickup,
    anchorDropoff,
    anchorMiles
  };
}

/* =========================
   4) ORDER PICKUPS
========================= */

function orderPickupsFromCenter(pickupPoints,centerResult,routeCase){

  if(routeCase === "SAME_PICKUP_SAME_DROPOFF"){
    return [pickupPoints[0]];
  }

  if(routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF"){
    return [pickupPoints[0]];
  }

  const center = centerResult.centerPoint;

  return [...pickupPoints]
    .map((point,index)=>({
      ...point,
      distanceFromCenter:distanceMilesByCoords(point,center),
      originalIndex:index
    }))
    .sort((a,b)=>{

      const diff =
        Number(b.distanceFromCenter) -
        Number(a.distanceFromCenter);

      if(Math.abs(diff) > 0.000001){
        return diff;
      }

      return Number(a.originalIndex) - Number(b.originalIndex);
    })
    .map((point,index)=>({
      ...point,
      pickupOrder:index + 1
    }));
}

/* =========================
   5) ORDER DROPOFFS
========================= */

function orderDropoffsFromCenter(dropoffPoints,centerResult,routeCase){

  if(routeCase === "SAME_PICKUP_SAME_DROPOFF"){
    return [dropoffPoints[0]];
  }

  if(routeCase === "DIFFERENT_PICKUP_SAME_DROPOFF"){
    return [dropoffPoints[0]];
  }

  const center = centerResult.centerPoint;

  return [...dropoffPoints]
    .map((point,index)=>({
      ...point,
      distanceFromCenter:distanceMilesByCoords(point,center),
      originalIndex:index
    }))
    .sort((a,b)=>{

      const diff =
        Number(a.distanceFromCenter) -
        Number(b.distanceFromCenter);

      if(Math.abs(diff) > 0.000001){
        return diff;
      }

      return Number(a.originalIndex) - Number(b.originalIndex);
    })
    .map((point,index)=>({
      ...point,
      dropoffOrder:index + 1
    }));
}

/* =========================
   6) FINAL ROUTE PLAN
========================= */

function makeFinalRoutePlanPoint(point,type,order){

  const passengerIndexes =
    Array.isArray(point.passengerIndexes) && point.passengerIndexes.length
      ? point.passengerIndexes
      : [point.passengerId];

  return {
    type,
    address:normalizePossibleAddress(point.address),
    lat:Number(point.lat),
    lng:Number(point.lng),
    order,
    passengerId:point.passengerId || "",
    passengerIndex:point.passengerIndex,
    passengerIndexes,
    passengerName:point.passengerName || "",
    phone:point.phone || "",
    group:point.group === true || passengerIndexes.length > 1,
    distanceFromCenter:
      Number.isFinite(Number(point.distanceFromCenter))
        ? Number(Number(point.distanceFromCenter).toFixed(3))
        : 0
  };
}

function buildFinalSharedRoutePlan(orderedPickups,orderedDropoffs){

  const routePlan = [];

  for(const pickup of orderedPickups){
    routePlan.push(
      makeFinalRoutePlanPoint(
        pickup,
        "pickup",
        routePlan.length + 1
      )
    );
  }

  for(const dropoff of orderedDropoffs){
    routePlan.push(
      makeFinalRoutePlanPoint(
        dropoff,
        "dropoff",
        routePlan.length + 1
      )
    );
  }

  if(routePlan.length < 2){
    throw new Error("Final shared route plan is invalid");
  }

  return routePlan;
}

/* =========================
   MAIN SHARED ROUTE PREP
========================= */

async function buildSmartSharedRoute(trip,stats){

  /*
    STEP 1:
    collectSharedPoints is still important because it:
    - reads pickup/dropoff from passengers or fallback trip lists
    - geocodes missing passenger pickup/dropoff
    - saves/reuses AddressCache if model exists
    - returns passengers with pickupLat/pickupLng/dropoffLat/dropoffLng
  */

  const points =
    await collectSharedPoints(trip,stats);

  /*
    STEP 2:
    Use the NEW routeMapEngine shared planner if installed.

    This fixes:
    DIFFERENT_PICKUP_DIFFERENT_DROPOFF

    Rule:
    - all pickups first
    - no dropoff before all pickups
    - stable nearest-neighbor
    - same result every confirm if route signature is unchanged
  */

  if(
    routeMapEngine &&
    typeof routeMapEngine.buildSharedRoutePlanFromPassengers === "function"
  ){

    const smart =
      routeMapEngine.buildSharedRoutePlanFromPassengers(
        points.sourcePassengers
      );

    const smartRoutePlan =
      safeArray(smart.routePlan);

    const smartSharedRoutePlan =
      safeArray(smart.sharedRoutePlan).length
        ? safeArray(smart.sharedRoutePlan)
        : smartRoutePlan;

    const smartRoutePoints =
      safeArray(smart.routePoints).length
        ? safeArray(smart.routePoints)
        : smartRoutePlan;

    const finalRoutePoints =
      smartRoutePoints.map(point=>{

        if(typeof point === "string"){
          return point;
        }

        /*
          routeMapEngine.calculateRouteMiles can accept objects with:
          { address, lat, lng }
          This lets Directions use coordinates when available.
        */

        return {
          type:point.type || "point",
          address:normalizePossibleAddress(point.address),
          lat:point.lat,
          lng:point.lng,
          order:point.order,
          passengerId:point.passengerId || "",
          passengerIndexes:point.passengerIndexes || [],
          group:point.group === true
        };
      });

    const finalRouteAddresses =
      finalRoutePoints
        .map(point=>{
          return typeof point === "string"
            ? normalizePossibleAddress(point)
            : normalizePossibleAddress(point.address);
        })
        .filter(Boolean);

    return {
      isShared:true,

      routePoints:
        finalRoutePoints.length
          ? finalRoutePoints
          : finalRouteAddresses,

      routePlan:
        smartRoutePlan,

      sharedRoutePlan:
        smartSharedRoutePlan,

      passengers:
        points.sourcePassengers,

      activeCount:
        n(smart.activeCount) || points.activePassengers.length,

      sharedStopsCount:
        n(smart.sharedStopsCount),

      routeCase:
        smart.routeCase || "SHARED_SMART_ROUTE_ENGINE",

      requestsBeforeFinal:
        n(stats?.geocodeRequestsUsed),

      routeMeta:{
        ...(smart.meta || {}),
        mode:smart.routeCase || "SHARED_SMART_ROUTE_ENGINE",
        policy:"ROUTE_MAP_ENGINE_ALL_PICKUPS_FIRST_THEN_DROPOFFS",
        engine:"routeMapEngine.buildSharedRoutePlanFromPassengers",
        routeAddresses:finalRouteAddresses,
        geocodeRequestsUsed:n(stats?.geocodeRequestsUsed),
        geocodeCacheHits:n(stats?.geocodeCacheHits)
      }
    };
  }

  /*
    FALLBACK:
    Keep old center logic only if the new engine function is missing.
    This prevents server crash, but if you see this in routeMeta,
    then routeMapEngine.js is not updated correctly.
  */

  const routeCase =
    detectSharedCase(
      points.pickupPoints,
      points.dropoffPoints
    );

  const centerResult =
    buildSharedCenterPoint(
      points.pickupPoints,
      points.dropoffPoints
    );

  const orderedPickups =
    orderPickupsFromCenter(
      points.pickupPoints,
      centerResult,
      routeCase
    );

  const orderedDropoffs =
    orderDropoffsFromCenter(
      points.dropoffPoints,
      centerResult,
      routeCase
    );

  const routePlan =
    buildFinalSharedRoutePlan(
      orderedPickups,
      orderedDropoffs
    );

  const finalRoutePoints =
    routePlan.map(point=>point.address);

  return {
    isShared:true,
    routePoints:finalRoutePoints,
    routePlan,
    sharedRoutePlan:routePlan,
    passengers:points.sourcePassengers,
    activeCount:points.activePassengers.length,
    sharedStopsCount:Math.max(0,routePlan.length - 2),
    routeCase,
    requestsBeforeFinal:n(stats?.geocodeRequestsUsed),
    routeMeta:{
      mode:routeCase,
      policy:"FALLBACK_CENTER_POINT_OLD_ENGINE",
      engine:"old-center-fallback",
      centerPoint:centerResult.centerPoint,
      anchorPickup:centerResult.anchorPickup,
      anchorDropoff:centerResult.anchorDropoff,
      anchorMiles:Number(Number(centerResult.anchorMiles).toFixed(3)),
      orderedPickups:orderedPickups.map(p=>p.address),
      orderedDropoffs:orderedDropoffs.map(p=>p.address),
      geocodeRequestsUsed:n(stats?.geocodeRequestsUsed),
      geocodeCacheHits:n(stats?.geocodeCacheHits)
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

    const requestStats =
      createRequestStats();

    let prepared = null;
    let routeData = null;
    let routeReused = false;

    if(hasUsableSavedRoute(trip,currentSignature)){

      prepared = buildPreparedFromSavedTrip(trip,currentSignature);
      routeData = buildRouteDataFromSavedTrip(trip);
      routeReused = true;

    }else if(shared){

      prepared = await buildSmartSharedRoute(trip,requestStats);

      routeData = await calculateRoute(prepared.routePoints);

      requestStats.directionsRequestsUsed += 1;

    }else{

      const routePoints = buildIndividualRoutePoints(trip);

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

      routeData = await calculateRoute(routePoints);

      requestStats.directionsRequestsUsed += 1;
    }

    finalizeRequestStats(requestStats);

    const googleRequestsUsed =
      routeReused
        ? 0
        : requestStats.googleRequestsUsed;

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
      geocodeRequestsUsed:
        routeReused ? 0 : requestStats.geocodeRequestsUsed,
      geocodeCacheHits:
        routeReused ? 0 : requestStats.geocodeCacheHits,
      directionsRequestsUsed:
        routeReused ? 0 : requestStats.directionsRequestsUsed,
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
            : "GOOGLE_DIRECTIONS_FINAL_ONLY",
        googleRequestsUsed,
        routeSource:
          routeReused
            ? "server-confirm-reused-saved-route"
            : shared
              ? "server-shared-routeMapEngine-smart-route"
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

    /* =========================
       FORCE SAVE FINAL ROUTE PLAN
    ========================= */

    updatedTrip.routePoints = safeArray(prepared.routePoints);
    updatedTrip.routePlan = safeArray(prepared.routePlan);
    updatedTrip.routeSignature = currentSignature;
    updatedTrip.routeLocked = true;
    updatedTrip.routeFinalized = true;
    updatedTrip.routeChangePending = false;
    updatedTrip.routeChangeStatus = "";
    updatedTrip.routeMeta = routeMeta;
    updatedTrip.googleRequestsUsed = googleRequestsUsed;
    updatedTrip.geocodeRequestsUsed =
      routeReused ? 0 : requestStats.geocodeRequestsUsed;
    updatedTrip.geocodeCacheHits =
      routeReused ? 0 : requestStats.geocodeCacheHits;
    updatedTrip.directionsRequestsUsed =
      routeReused ? 0 : requestStats.directionsRequestsUsed;

    if(shared){

      updatedTrip.sharedRoutePlan =
        safeArray(prepared.sharedRoutePlan || prepared.routePlan);

      updatedTrip.sharedRouteSignature = currentSignature;
      updatedTrip.sharedRouteCase = prepared.routeCase;
      updatedTrip.sharedGoogleRequestsUsed = googleRequestsUsed;
      updatedTrip.sharedGeocodeRequestsUsed =
        routeReused ? 0 : requestStats.geocodeRequestsUsed;
      updatedTrip.sharedGeocodeCacheHits =
        routeReused ? 0 : requestStats.geocodeCacheHits;
      updatedTrip.sharedDirectionsRequestsUsed =
        routeReused ? 0 : requestStats.directionsRequestsUsed;
      updatedTrip.sharedRouteLocked = true;
      updatedTrip.sharedStopsCount = prepared.sharedStopsCount;
      updatedTrip.sharedRouteMeta = routeMeta;
    }

    await updatedTrip.save();

    return res.json({
      success:true,
      trip:updatedTrip,
      requestsUsed:googleRequestsUsed,
      googleRequestsUsed,
      geocodeRequestsUsed:
        routeReused ? 0 : requestStats.geocodeRequestsUsed,
      geocodeCacheHits:
        routeReused ? 0 : requestStats.geocodeCacheHits,
      directionsRequestsUsed:
        routeReused ? 0 : requestStats.directionsRequestsUsed,
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