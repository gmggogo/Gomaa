"use strict";

/* =====================================================
   FILE: server/routes/companyReviewConfirmRoutes.js
   COMPANY REVIEW CONFIRM ROUTES

   PURPOSE:
   - Company Review shared confirm only.
   - Uses the SAME shared ordering engine/pipeline style as
     dispatchReservedConfirmRoutes.js.
   - Uses COMPANY / FACILITY pricing only.
   - Does NOT use reserved pricing.

   ENDPOINT:
   POST /api/company-review/confirm-shared/:id

   IMPORTANT:
   - Shared route order is server-side.
   - Google Directions is final calculation only.
   - Google must not reorder the route.
   - Reuses trusted lat/lng when address GeoKey matches.
   - Geocodes only missing/untrusted passenger pickup/dropoff coords.
   - If saved route signature did not change, reuses saved route with 0 Google requests.
   - Price source order:
       1) FacilityPricingOverride active service
       2) Service Management company fields fallback
===================================================== */

const express = require("express");
const mongoose = require("mongoose");
const https = require("https");

const router = express.Router();

const routeMapEngine = require("../utils/routeMapEngine");
const Service = require("../models/Service");
const FacilityPricingOverride = require("../models/FacilityPricingOverride");

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

function n(value, fallback = 0){
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function bool(value){
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "yes" ||
    String(value).toLowerCase() === "1"
  );
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

function geoKey(value){
  return addressKey(value);
}

function escapeRegex(value){
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function cleanStatus(value){
  return clean(value)
    .replace(/\s+/g,"")
    .toLowerCase();
}

function normalizeCode(value){
  const c = clean(value)
    .toUpperCase()
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim();

  if(!c) return "";

  if(c === "STANDARD" || c === "ST") return "ST";
  if(c === "WHEELCHAIR" || c === "WHEEL CHAIR" || c === "WC" || c === "WH") return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
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

function isBadAddress(value){
  const v = normalizeAddress(value).toLowerCase();

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

function compactRoutePoints(list){
  const out = [];
  let lastKey = "";

  for(const item of Array.isArray(list) ? list : []){
    const address =
      typeof item === "string"
        ? normalizePossibleAddress(item)
        : normalizePossibleAddress(item?.address || "");

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
  const Trip = global.Trip || mongoose.models.Trip || null;

  if(!Trip){
    throw new Error("Trip model not loaded");
  }

  return Trip;
}

function getUserModel(){
  return global.User || mongoose.models.User || null;
}

function passengerIsActive(passenger){
  const status = cleanStatus(passenger?.status);

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show") &&
    normalizePossibleAddress(passenger?.pickup) &&
    normalizePossibleAddress(passenger?.dropoff)
  );
}

function isSharedTrip(trip){
  if(!trip) return false;

  const code = normalizeCode(
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.tripNumberSuffix ||
    ""
  );

  return (
    trip.isShared === true ||
    String(trip.tripType || "").toUpperCase() === "SHARED" ||
    code === "SH" ||
    Array.isArray(trip.passengers) && trip.passengers.length > 1
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

function normalizePassengerId(passenger,index){
  return String(
    passenger?.passengerId ||
    passenger?._id ||
    "P" + (index + 1)
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
   ROUTE SIGNATURE / REUSE
========================= */

function buildSharedRouteSignatureFromPassengers(passengers){
  const list = safeArray(passengers)
    .map((p,index)=>({
      id:String(p.passengerId || p._id || index),
      pickup:addressKey(p.pickup),
      dropoff:addressKey(p.dropoff),
      active:passengerIsActive(p) ? "1" : "0"
    }))
    .filter(p=>p.pickup || p.dropoff)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));

  return JSON.stringify({
    type:"COMPANY_SHARED",
    passengers:list
  });
}

function getSavedRouteSignature(trip){
  return clean(
    trip?.sharedRouteSignature ||
    trip?.routeSignature ||
    ""
  );
}

function savedRoutePlan(trip){
  const plan =
    safeArray(trip?.sharedRoutePlan).length
      ? safeArray(trip.sharedRoutePlan)
      : safeArray(trip?.routePlan);

  return plan
    .filter(p=>normalizePossibleAddress(p?.address))
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

  const text = clean(value).toLowerCase();

  if(!text){
    return 0;
  }

  const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);

  if(!match){
    return 0;
  }

  const num = Number(match[1]);

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

  const text = clean(value).toLowerCase();

  if(!text){
    return 0;
  }

  let total = 0;

  const hourMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(hour|hours|hr|hrs)/);
  const minMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(minute|minutes|min|mins)/);

  if(hourMatch){
    total += Number(hourMatch[1]) * 60;
  }

  if(minMatch){
    total += Number(minMatch[1]);
  }

  if(total > 0){
    return total;
  }

  const any = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  return any ? Number(any[1]) : 0;
}

function flattenGoogleLegs(raw){
  const directLegs = Array.isArray(raw?.legs) ? raw.legs : [];

  if(directLegs.length){
    return directLegs;
  }

  const googleRoute = raw?.googleRoute || raw?.route || raw?.data || raw || {};

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

function normalizeRouteData(raw,routePoints = []){
  const legs = flattenGoogleLegs(raw);

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

  const distanceMeters = firstPositiveNumber(
    raw?.distanceMeters,
    raw?.totalDistanceMeters,
    raw?.distance_meters,
    raw?.distance?.value,
    raw?.googleRoute?.distanceMeters,
    raw?.googleRoute?.distance?.value,
    legDistanceMeters
  );

  const durationSeconds = firstPositiveNumber(
    raw?.durationSeconds,
    raw?.totalDurationSeconds,
    raw?.duration_seconds,
    raw?.duration?.value,
    raw?.googleRoute?.durationSeconds,
    raw?.googleRoute?.duration?.value,
    legDurationSeconds
  );

  const miles = firstPositiveNumber(
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

  const estimatedMinutes = firstPositiveNumber(
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

async function calculateRoute(routePoints){
  let raw = null;

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRouteMiles === "function"
  ){
    raw = await routeMapEngine.calculateRouteMiles(routePoints);
    return normalizeRouteData(raw,routePoints);
  }

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRoute === "function"
  ){
    raw = await routeMapEngine.calculateRoute(routePoints);
    return normalizeRouteData(raw,routePoints);
  }

  throw new Error("routeMapEngine calculate function not found");
}

/* =========================
   GOOGLE GEOCODE + ADDRESS CACHE
========================= */

function getGoogleMapsApiKey(){
  return (
    process.env.GOOGLE_SERVER_KEY ||
    process.env.GOOGLE_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.SERVER_GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_KEY ||
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

async function lookupAddressCache(address,stats = null){
  if(!AddressCache){
    return null;
  }

  const fullAddress = normalizePossibleAddress(address);

  if(!fullAddress){
    return null;
  }

  const key = addressKey(fullAddress);

  try{
    const found = await AddressCache.findOne({
      $or:[
        {addressKey:key},
        {key},
        {normalizedAddress:key},
        {fullAddress:new RegExp("^" + escapeRegex(fullAddress) + "$","i")},
        {address:new RegExp("^" + escapeRegex(fullAddress) + "$","i")}
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
        source:"address-cache",
        geoAddress:fullAddress,
        geoKey:key
      };
    }
  }catch(err){
    console.log("Company AddressCache lookup failed:",err.message);
  }

  return null;
}

async function saveAddressCache(address,coords,source = "company-confirm-geocode"){
  if(!AddressCache){
    return null;
  }

  const fullAddress = normalizePossibleAddress(address);

  if(!fullAddress || !hasValidLatLng(coords?.lat,coords?.lng)){
    return null;
  }

  const key = addressKey(fullAddress);

  try{
    return await AddressCache.findOneAndUpdate(
      {
        $or:[
          {addressKey:key},
          {key},
          {normalizedAddress:key}
        ]
      },
      {
        $set:{
          addressKey:key,
          key,
          normalizedAddress:key,
          fullAddress,
          address:fullAddress,
          lat:Number(coords.lat),
          lng:Number(coords.lng),
          source,
          updatedAt:new Date(),
          lastUsedAt:new Date()
        },
        $inc:{
          usedCount:1
        },
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
  }catch(err){
    console.log("Company AddressCache save failed:",err.message);
    return null;
  }
}

async function geocodeAddress(address,stats = null){
  const cleanAddress = normalizePossibleAddress(address);

  if(!cleanAddress){
    return null;
  }

  const cached = await lookupAddressCache(cleanAddress,stats);

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

      if(hasValidLatLng(lat,lng)){
        const coords = {
          lat:Number(lat),
          lng:Number(lng),
          source:"routeMapEngine-geocode",
          geoAddress:cleanAddress,
          geoKey:geoKey(cleanAddress)
        };

        await saveAddressCache(cleanAddress,coords,coords.source);
        return coords;
      }
    }catch(err){
      console.log("Company routeMapEngine geocode failed:",err.message);
    }
  }

  const apiKey = getGoogleMapsApiKey();

  if(!apiKey){
    console.log("Missing Google Maps API key for company geocode");
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
      "Company Google geocode failed:",
      cleanAddress,
      json?.status,
      json?.error_message || ""
    );

    return null;
  }

  const location = json.results[0]?.geometry?.location;

  if(hasValidLatLng(location?.lat,location?.lng)){
    const coords = {
      lat:Number(location.lat),
      lng:Number(location.lng),
      source:"google-geocode",
      geoAddress:cleanAddress,
      geoKey:geoKey(cleanAddress)
    };

    await saveAddressCache(cleanAddress,coords,coords.source);
    return coords;
  }

  return null;
}

/* =========================
   GEO BINDING
========================= */

function geoMatchesCurrentAddress(passenger,type){
  const address =
    type === "pickup"
      ? normalizePossibleAddress(passenger.pickup)
      : normalizePossibleAddress(passenger.dropoff);

  const savedGeoKey =
    type === "pickup"
      ? clean(passenger.pickupGeoKey || passenger.pickupAddressKey || "")
      : clean(passenger.dropoffGeoKey || passenger.dropoffAddressKey || "");

  const savedGeoAddress =
    type === "pickup"
      ? normalizePossibleAddress(passenger.pickupGeoAddress || "")
      : normalizePossibleAddress(passenger.dropoffGeoAddress || "");

  const currentKey = geoKey(address);

  if(!address || !currentKey){
    return false;
  }

  if(savedGeoKey){
    return savedGeoKey === currentKey;
  }

  if(savedGeoAddress){
    return geoKey(savedGeoAddress) === currentKey;
  }

  return false;
}

function needsFreshGeocode(passenger,type){
  if(type === "pickup"){
    if(!hasValidLatLng(passenger.pickupLat,passenger.pickupLng)){
      return true;
    }

    return !geoMatchesCurrentAddress(passenger,"pickup");
  }

  if(type === "dropoff"){
    if(!hasValidLatLng(passenger.dropoffLat,passenger.dropoffLng)){
      return true;
    }

    return !geoMatchesCurrentAddress(passenger,"dropoff");
  }

  return true;
}

async function ensurePassengerPointCoordinates(passenger,stats){
  const out = {...passenger};

  const pickupAddress = normalizePossibleAddress(out.pickup);
  const dropoffAddress = normalizePossibleAddress(out.dropoff);

  if(!pickupAddress){
    throw new Error("Missing pickup address");
  }

  if(!dropoffAddress){
    throw new Error("Missing dropoff address");
  }

  if(needsFreshGeocode(out,"pickup")){
    const coords = await geocodeAddress(pickupAddress,stats);

    if(coords){
      out.pickupLat = coords.lat;
      out.pickupLng = coords.lng;
      out.pickupGeoAddress = pickupAddress;
      out.pickupGeoKey = geoKey(pickupAddress);
      out.pickupGeoSource = coords.source || "geocode";
    }
  }else{
    await saveAddressCache(
      pickupAddress,
      {lat:out.pickupLat,lng:out.pickupLng},
      "company-trusted-existing-passenger-pickup"
    );

    out.pickupGeoAddress = pickupAddress;
    out.pickupGeoKey = geoKey(pickupAddress);
    out.pickupGeoSource = out.pickupGeoSource || "existing-trusted";
  }

  if(needsFreshGeocode(out,"dropoff")){
    const coords = await geocodeAddress(dropoffAddress,stats);

    if(coords){
      out.dropoffLat = coords.lat;
      out.dropoffLng = coords.lng;
      out.dropoffGeoAddress = dropoffAddress;
      out.dropoffGeoKey = geoKey(dropoffAddress);
      out.dropoffGeoSource = coords.source || "geocode";
    }
  }else{
    await saveAddressCache(
      dropoffAddress,
      {lat:out.dropoffLat,lng:out.dropoffLng},
      "company-trusted-existing-passenger-dropoff"
    );

    out.dropoffGeoAddress = dropoffAddress;
    out.dropoffGeoKey = geoKey(dropoffAddress);
    out.dropoffGeoSource = out.dropoffGeoSource || "existing-trusted";
  }

  if(!hasValidLatLng(out.pickupLat,out.pickupLng)){
    throw new Error("Missing pickup coordinates for: " + pickupAddress);
  }

  if(!hasValidLatLng(out.dropoffLat,out.dropoffLng)){
    throw new Error("Missing dropoff coordinates for: " + dropoffAddress);
  }

  return out;
}

/* =========================
   COMPANY SHARED GROUP
========================= */

async function findSharedGroupTrips(Trip,baseTrip){
  const groupId = clean(baseTrip.groupId);
  const tripNumber = clean(baseTrip.tripNumber);

  if(groupId){
    const list = await Trip.find({groupId}).sort({passengerIndex:1,createdAt:1});
    if(list.length) return list;
  }

  if(tripNumber){
    const list = await Trip.find({tripNumber}).sort({passengerIndex:1,createdAt:1});
    if(list.length) return list;
  }

  return [baseTrip];
}

function buildPassengersFromGroupDocs(groupTrips){
  const first = groupTrips[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return first.passengers.map((p,index)=>({
      ...p,
      passengerId:p.passengerId || p._id || "P" + (index + 1),
      clientName:p.clientName || p.name || "",
      name:p.name || p.clientName || "",
      clientPhone:p.clientPhone || p.phone || "",
      phone:p.phone || p.clientPhone || "",
      pickup:normalizePossibleAddress(p.pickup),
      pickupLat:p.pickupLat ?? null,
      pickupLng:p.pickupLng ?? null,
      pickupGeoKey:p.pickupGeoKey || p.pickupAddressKey || "",
      pickupGeoAddress:p.pickupGeoAddress || "",
      pickupGeoSource:p.pickupGeoSource || "",
      dropoff:normalizePossibleAddress(p.dropoff),
      dropoffLat:p.dropoffLat ?? null,
      dropoffLng:p.dropoffLng ?? null,
      dropoffGeoKey:p.dropoffGeoKey || p.dropoffAddressKey || "",
      dropoffGeoAddress:p.dropoffGeoAddress || "",
      dropoffGeoSource:p.dropoffGeoSource || "",
      status:p.status || "Scheduled",
      priceAmount:p.priceAmount || 0,
      finalPrice:p.finalPrice || 0
    }));
  }

  return groupTrips.map((trip,index)=>({
    passengerId:trip.passengerId || trip._id || "P" + (index + 1),
    clientName:trip.clientName || trip.name || "",
    name:trip.name || trip.clientName || "",
    clientPhone:trip.clientPhone || trip.phone || "",
    phone:trip.phone || trip.clientPhone || "",
    pickup:normalizePossibleAddress(trip.pickup),
    pickupLat:trip.pickupLat ?? null,
    pickupLng:trip.pickupLng ?? null,
    pickupGeoKey:trip.pickupGeoKey || trip.pickupAddressKey || "",
    pickupGeoAddress:trip.pickupGeoAddress || "",
    pickupGeoSource:trip.pickupGeoSource || "",
    dropoff:normalizePossibleAddress(trip.dropoff),
    dropoffLat:trip.dropoffLat ?? null,
    dropoffLng:trip.dropoffLng ?? null,
    dropoffGeoKey:trip.dropoffGeoKey || trip.dropoffAddressKey || "",
    dropoffGeoAddress:trip.dropoffGeoAddress || "",
    dropoffGeoSource:trip.dropoffGeoSource || "",
    status:trip.status || "Scheduled",
    priceAmount:trip.priceAmount || 0,
    finalPrice:trip.finalPrice || 0
  }));
}

function buildVirtualSharedTrip(firstTrip,passengers){
  return {
    ...(firstTrip?.toObject ? firstTrip.toObject() : firstTrip),
    isShared:true,
    tripType:"SHARED",
    passengers:safeArray(passengers)
  };
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
      throw new Error(`Missing coordinates for shared ${point.type}: ${point.address}`);
    }

    const key = `${clean(point.type).toLowerCase()}|${addressKey(point.address)}`;

    if(seen.has(key)){
      const existing = seen.get(key);

      existing.passengerIndexes = Array.from(new Set([
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

async function collectSharedPoints(trip,stats){
  const sourcePassengers = safeArray(trip.passengers)
    .map((passenger,index)=>{
      const pickup = getSharedPickupAddress(trip,passenger,index);
      const dropoff = getSharedDropoffAddress(trip,passenger,index);

      return {
        ...passenger,
        pickup,
        dropoff
      };
    });

  const activePassengersRaw = sourcePassengers.filter(passenger=>{
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

    const withCoords = await ensurePassengerPointCoordinates(passenger,stats);

    if(!hasValidLatLng(withCoords.pickupLat,withCoords.pickupLng)){
      throw new Error("Missing pickup coordinates for passenger: " + name + " | address: " + withCoords.pickup);
    }

    if(!hasValidLatLng(withCoords.dropoffLat,withCoords.dropoffLng)){
      throw new Error("Missing dropoff coordinates for passenger: " + name + " | address: " + withCoords.dropoff);
    }

    activePassengers.push(withCoords);
  }

  const pickupPoints = uniqueTypedRoutePoints(
    activePassengers.map(makePickupPoint)
  );

  const dropoffPoints = uniqueTypedRoutePoints(
    activePassengers.map(makeDropoffPoint)
  );

  if(!pickupPoints.length || !dropoffPoints.length){
    throw new Error("Shared route is missing pickup/dropoff points");
  }

  const sourcePassengersWithCoords = sourcePassengers.map(passenger=>{
    const found = activePassengers.find(active=>{
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
      pickup:found.pickup,
      pickupLat:found.pickupLat,
      pickupLng:found.pickupLng,
      pickupGeoAddress:found.pickupGeoAddress || found.pickup,
      pickupGeoKey:found.pickupGeoKey || geoKey(found.pickup),
      pickupGeoSource:found.pickupGeoSource || "",
      dropoff:found.dropoff,
      dropoffLat:found.dropoffLat,
      dropoffLng:found.dropoffLng,
      dropoffGeoAddress:found.dropoffGeoAddress || found.dropoff,
      dropoffGeoKey:found.dropoffGeoKey || geoKey(found.dropoff),
      dropoffGeoSource:found.dropoffGeoSource || ""
    };
  });

  return {
    sourcePassengers:sourcePassengersWithCoords,
    activePassengers,
    pickupPoints,
    dropoffPoints
  };
}

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

  if(pickupUnified && dropoffUnified) return "SAME_PICKUP_SAME_DROPOFF";
  if(pickupUnified && !dropoffUnified) return "SAME_PICKUP_DIFFERENT_DROPOFF";
  if(!pickupUnified && dropoffUnified) return "DIFFERENT_PICKUP_SAME_DROPOFF";

  return "DIFFERENT_PICKUP_DIFFERENT_DROPOFF";
}

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

function orderPickupsFromCenter(pickupPoints,centerResult,routeCase){
  if(routeCase === "SAME_PICKUP_SAME_DROPOFF") return [pickupPoints[0]];
  if(routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF") return [pickupPoints[0]];

  const center = centerResult.centerPoint;

  return [...pickupPoints]
    .map((point,index)=>({
      ...point,
      distanceFromCenter:distanceMilesByCoords(point,center),
      originalIndex:index
    }))
    .sort((a,b)=>{
      const diff = Number(b.distanceFromCenter) - Number(a.distanceFromCenter);
      if(Math.abs(diff) > 0.000001) return diff;
      return Number(a.originalIndex) - Number(b.originalIndex);
    })
    .map((point,index)=>({
      ...point,
      pickupOrder:index + 1
    }));
}

function orderDropoffsFromCenter(dropoffPoints,centerResult,routeCase){
  if(routeCase === "SAME_PICKUP_SAME_DROPOFF") return [dropoffPoints[0]];
  if(routeCase === "DIFFERENT_PICKUP_SAME_DROPOFF") return [dropoffPoints[0]];

  const center = centerResult.centerPoint;

  return [...dropoffPoints]
    .map((point,index)=>({
      ...point,
      distanceFromCenter:distanceMilesByCoords(point,center),
      originalIndex:index
    }))
    .sort((a,b)=>{
      const diff = Number(a.distanceFromCenter) - Number(b.distanceFromCenter);
      if(Math.abs(diff) > 0.000001) return diff;
      return Number(a.originalIndex) - Number(b.originalIndex);
    })
    .map((point,index)=>({
      ...point,
      dropoffOrder:index + 1
    }));
}

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

async function buildSmartSharedRoute(trip,stats){
  const points = await collectSharedPoints(trip,stats);

  if(
    routeMapEngine &&
    typeof routeMapEngine.buildSharedRoutePlanFromPassengers === "function"
  ){
    const smart = routeMapEngine.buildSharedRoutePlanFromPassengers(
      points.sourcePassengers
    );

    const smartRoutePlan = safeArray(smart.routePlan);

    const smartSharedRoutePlan =
      safeArray(smart.sharedRoutePlan).length
        ? safeArray(smart.sharedRoutePlan)
        : smartRoutePlan;

    const finalRouteAddresses =
      (
        safeArray(smart.addresses).length
          ? safeArray(smart.addresses)
          : smartRoutePlan.map(point=>point.address)
      )
        .map(normalizePossibleAddress)
        .filter(Boolean);

    return {
      isShared:true,
      routePoints:finalRouteAddresses,
      routePlan:smartRoutePlan,
      sharedRoutePlan:smartSharedRoutePlan,
      passengers:points.sourcePassengers,
      activeCount:n(smart.activeCount) || points.activePassengers.length,
      sharedStopsCount:n(smart.sharedStopsCount,Math.max(0,finalRouteAddresses.length - 2)),
      routeCase:smart.routeCase || "COMPANY_SHARED_SMART_ROUTE_ENGINE",
      requestsBeforeFinal:n(stats?.geocodeRequestsUsed),
      routeMeta:{
        ...(smart.meta || {}),
        mode:smart.routeCase || "COMPANY_SHARED_SMART_ROUTE_ENGINE",
        policy:"ROUTE_MAP_ENGINE_ALL_PICKUPS_FIRST_THEN_DROPOFFS",
        engine:"routeMapEngine.buildSharedRoutePlanFromPassengers",
        routeAddresses:finalRouteAddresses,
        geocodeRequestsUsed:n(stats?.geocodeRequestsUsed),
        geocodeCacheHits:n(stats?.geocodeCacheHits)
      }
    };
  }

  const routeCase = detectSharedCase(points.pickupPoints,points.dropoffPoints);
  const centerResult = buildSharedCenterPoint(points.pickupPoints,points.dropoffPoints);
  const orderedPickups = orderPickupsFromCenter(points.pickupPoints,centerResult,routeCase);
  const orderedDropoffs = orderDropoffsFromCenter(points.dropoffPoints,centerResult,routeCase);
  const routePlan = buildFinalSharedRoutePlan(orderedPickups,orderedDropoffs);
  const finalRoutePoints = routePlan.map(point=>point.address);

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
  const routePlan = savedRoutePlan(trip);
  const routePoints = savedRoutePoints(trip);
  const passengers = safeArray(trip.passengers);

  return {
    isShared:true,
    alreadySaved:true,
    routePoints,
    routePlan,
    sharedRoutePlan:routePlan,
    passengers,
    activeCount:Math.max(1,passengers.filter(passengerIsActive).length),
    sharedStopsCount:Math.max(0,(routePlan.length || routePoints.length) - 2),
    routeCase:trip.sharedRouteCase || trip.routeCase || "SAVED_COMPANY_SHARED_ROUTE",
    routeMeta:{
      mode:"SAVED_ROUTE_REUSED",
      reused:true,
      signature:currentSignature,
      savedSignature:getSavedRouteSignature(trip)
    }
  };
}

/* =========================
   ROUTE POINT COORDINATES + PASSENGER ORDER
========================= */

function extractRoutePointCoordinates(routePoints,routeData){
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
        address:normalizePossibleAddress(point),
        lat:null,
        lng:null
      });
    }
  }

  return map;
}

function routePlanOrder(routePlan,type,address){
  const key = addressKey(address);

  const index = safeArray(routePlan)
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
  pricing,
  pricePerPassenger
}){
  const coordMap = extractRoutePointCoordinates(routePoints,routeData);

  return safeArray(passengers)
    .map((passenger,index)=>{
      const active = passengerIsActive(passenger);

      const pickupOrder = routePlanOrder(routePlan,"pickup",passenger.pickup);
      const dropoffOrder = routePlanOrder(routePlan,"dropoff",passenger.dropoff);

      const pickupKey = addressKey(passenger.pickup);
      const dropoffKey = addressKey(passenger.dropoff);

      const pickupCoord = coordMap.get(pickupKey) || null;
      const dropoffCoord = coordMap.get(dropoffKey) || null;

      const pickupAddress = normalizePossibleAddress(passenger.pickup);
      const dropoffAddress = normalizePossibleAddress(passenger.dropoff);

      return {
        ...passenger,

        pickup:pickupAddress,
        pickupLat:
          Number.isFinite(Number(pickupCoord?.lat))
            ? Number(pickupCoord.lat)
            : passenger.pickupLat ?? null,
        pickupLng:
          Number.isFinite(Number(pickupCoord?.lng))
            ? Number(pickupCoord.lng)
            : passenger.pickupLng ?? null,
        pickupGeoAddress:passenger.pickupGeoAddress || pickupAddress,
        pickupGeoKey:passenger.pickupGeoKey || geoKey(pickupAddress),
        pickupGeoSource:passenger.pickupGeoSource || "",

        dropoff:dropoffAddress,
        dropoffLat:
          Number.isFinite(Number(dropoffCoord?.lat))
            ? Number(dropoffCoord.lat)
            : passenger.dropoffLat ?? null,
        dropoffLng:
          Number.isFinite(Number(dropoffCoord?.lng))
            ? Number(dropoffCoord.lng)
            : passenger.dropoffLng ?? null,
        dropoffGeoAddress:passenger.dropoffGeoAddress || dropoffAddress,
        dropoffGeoKey:passenger.dropoffGeoKey || geoKey(dropoffAddress),
        dropoffGeoSource:passenger.dropoffGeoSource || "",

        pickupOrder:active ? pickupOrder : 9999,
        dropoffOrder:active ? dropoffOrder : 9999,
        routeOrder:index + 1,
        status:active ? "Confirmed" : passenger.status || "Scheduled",

        passengerMiles:active ? n(routeData?.miles) : 0,
        passengerMinutes:active ? n(routeData?.estimatedMinutes) : 0,
        passengerDistanceMeters:active ? n(routeData?.distanceMeters) : 0,
        passengerDurationSeconds:active ? n(routeData?.durationSeconds) : 0,

        priceAmount:active ? n(pricePerPassenger) : 0,
        finalPrice:active ? n(pricePerPassenger) : 0,
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
   COMPANY PRICING ENGINE
========================= */

function buildServiceSearchFilter(idOrKey){
  const raw = clean(idOrKey);

  if(mongoose.Types.ObjectId.isValid(raw)){
    return {_id:raw};
  }

  const key = normalizeCode(raw);
  const rawUpper = upper(raw);
  const rx = new RegExp("^" + escapeRegex(raw) + "$","i");

  return {
    $or:[
      {serviceKey:key},{serviceKey:rawUpper},
      {serviceCode:key},{serviceCode:rawUpper},
      {serviceType:key},{serviceType:rawUpper},
      {suffix:key},{suffix:rawUpper},
      {companySuffix:key},{companySuffix:rawUpper},
      {reservedSuffix:key},{reservedSuffix:rawUpper},
      {title:rx},{name:rx},{serviceName:rx}
    ]
  };
}

function getOverrideServiceCode(service){
  return normalizeCode(
    service?.serviceKey ||
    service?.serviceCode ||
    service?.serviceType ||
    service?.serviceSuffix ||
    service?.suffix ||
    service?.companySuffix ||
    service?.reservedSuffix ||
    service?.key ||
    service?.code ||
    service?.title ||
    service?.name ||
    service?.serviceName ||
    ""
  );
}

function isOverrideServiceEnabled(service){
  if(!service) return false;
  if(service.active !== undefined) return bool(service.active);
  if(service.enabled !== undefined) return bool(service.enabled);
  if(service.companyEnabled !== undefined) return bool(service.companyEnabled);
  return true;
}

async function resolveFacilityId({facilityId,company}){
  if(facilityId && mongoose.Types.ObjectId.isValid(String(facilityId))){
    return String(facilityId);
  }

  const companyName = clean(company);

  if(!companyName){
    return "";
  }

  const User = getUserModel();

  if(!User){
    return "";
  }

  const rx = new RegExp("^" + escapeRegex(companyName) + "$","i");

  const user = await User.findOne({
    role:{$in:["company","facility"]},
    $or:[
      {name:rx},
      {username:rx},
      {email:rx},
      {company:rx},
      {companyName:rx},
      {facilityName:rx},
      {organizationName:rx}
    ]
  }).lean();

  return user?._id ? String(user._id) : "";
}

function pricingFromServiceManagement(service){
  const pricingMode = upper(service.companyPricingMode || service.pricingMode || "MILE");

  return {
    source:"SERVICE_MANAGEMENT",
    serviceKey:normalizeCode(service.serviceKey || service.serviceCode || service.companySuffix || service.suffix || service.title || service.name),
    pricingMode,
    baseFare:n(service.companyBaseFare ?? service.baseFare ?? 0),
    includedMiles:n(service.companyIncludedMiles ?? service.includedMiles ?? 0),
    perMile:n(service.companyPerMile ?? service.perMile ?? 0),
    stopFee:n(service.companyStopFee ?? service.stopFee ?? 0),
    noShowFee:n(service.companyNoShowFee ?? service.noShowFee ?? 0),
    sharedPrice:n(service.companySharedPrice ?? service.sharedPrice ?? 0),
    hourlyRate:n(service.companyHourlyRate ?? service.hourlyRate ?? 0),
    hourlyBillingMode:upper(service.companyHourlyBillingMode || service.hourlyBillingMode || "FULL"),
    disableCancel:bool(service.companyDisableCancel ?? service.disableCancel ?? false),
    cancelFee:n(service.companyCancelFee ?? service.cancelFee ?? 0),
    warningMinutes:n(service.companyWarningMinutes ?? service.warningMinutes ?? 0),
    addStopEnabled:bool(service.companyAddStopEnabled ?? service.addStopEnabled ?? false),
    addStopCustomTimeEnabled:bool(service.companyAddStopCustomTimeEnabled ?? service.addStopCustomTimeEnabled ?? false),
    addStopCutoffMinutes:n(service.companyAddStopCutoffMinutes ?? service.addStopCutoffMinutes ?? 0),
    rawService:service
  };
}

function pricingFromFacilityOverride(service){
  return {
    source:"FACILITY_OVERRIDE",
    serviceKey:getOverrideServiceCode(service),
    pricingMode:upper(service.pricingMode || service.companyPricingMode || "MILE"),
    baseFare:n(service.baseFare ?? service.companyBaseFare ?? 0),
    includedMiles:n(service.includedMiles ?? service.companyIncludedMiles ?? 0),
    perMile:n(service.perMile ?? service.companyPerMile ?? 0),
    stopFee:n(service.stopFee ?? service.companyStopFee ?? 0),
    noShowFee:n(service.noShowFee ?? service.companyNoShowFee ?? 0),
    sharedPrice:n(service.sharedPrice ?? service.companySharedPrice ?? 0),
    hourlyRate:n(service.hourlyRate ?? service.companyHourlyRate ?? 0),
    hourlyBillingMode:upper(service.hourlyBillingMode || service.companyHourlyBillingMode || "FULL"),
    disableCancel:bool(service.disableCancel ?? service.companyDisableCancel ?? false),
    cancelFee:n(service.cancelFee ?? service.companyCancelFee ?? 0),
    warningMinutes:n(service.warningMinutes ?? service.companyWarningMinutes ?? 0),
    addStopEnabled:bool(service.addStopEnabled ?? service.companyAddStopEnabled ?? false),
    addStopCustomTimeEnabled:bool(service.addStopCustomTimeEnabled ?? service.companyAddStopCustomTimeEnabled ?? false),
    addStopCutoffMinutes:n(service.addStopCutoffMinutes ?? service.companyAddStopCutoffMinutes ?? 0),
    rawService:service
  };
}

async function findActiveFacilityOverride({facilityId,company}){
  const or = [];
  const cleanFacilityId = clean(facilityId);
  const companyName = clean(company);

  if(cleanFacilityId && mongoose.Types.ObjectId.isValid(cleanFacilityId)){
    or.push({facilityId:cleanFacilityId});
  }

  if(companyName){
    const rx = new RegExp("^" + escapeRegex(companyName) + "$","i");
    or.push({facilityName:rx});
  }

  if(!or.length){
    return null;
  }

  return await FacilityPricingOverride.findOne({active:true,$or:or})
    .sort({updatedAt:-1,createdAt:-1})
    .lean();
}

async function resolvePricingService({serviceKey,facilityId,company}){
  const key = normalizeCode(serviceKey);

  const resolvedFacilityId = await resolveFacilityId({facilityId,company});

  const override = await findActiveFacilityOverride({
    facilityId:resolvedFacilityId || facilityId,
    company
  });

  if(override){
    const overrideService = safeArray(override.services)
      .find(service=>getOverrideServiceCode(service) === key);

    if(overrideService && isOverrideServiceEnabled(overrideService)){
      return {
        success:true,
        pricing:pricingFromFacilityOverride(overrideService),
        facilityOverrideActive:true,
        facilityId:String(override.facilityId || resolvedFacilityId || facilityId || ""),
        facilityName:override.facilityName || "",
        pricingSource:"FACILITY_OVERRIDE",
        pricingReason:"ACTIVE_FACILITY_OVERRIDE_USED"
      };
    }
  }

  const service = await Service.findOne(buildServiceSearchFilter(serviceKey)).lean();

  if(!service){
    return {
      success:false,
      message:"Service Not Found: " + clean(serviceKey)
    };
  }

  if(service.companyEnabled === false){
    return {
      success:false,
      message:"Company Service Disabled"
    };
  }

  return {
    success:true,
    pricing:pricingFromServiceManagement(service),
    facilityOverrideActive:false,
    facilityId:resolvedFacilityId || "",
    facilityName:"",
    pricingSource:"SERVICE_MANAGEMENT",
    pricingReason:override
      ? "FACILITY_OVERRIDE_ACTIVE_BUT_SERVICE_NOT_FOUND_FALLBACK"
      : "NO_ACTIVE_FACILITY_OVERRIDE_FALLBACK"
  };
}

function calculateCompanySharedPrice({pricing,miles,stops,minutes,passengersCount}){
  const pricingMode = upper(pricing.pricingMode || "MILE");

  const baseFare = n(pricing.baseFare);
  const includedMiles = n(pricing.includedMiles);
  const perMile = n(pricing.perMile);
  const stopFee = n(pricing.stopFee);
  const sharedPrice = n(pricing.sharedPrice);
  const hourlyRate = n(pricing.hourlyRate);

  let total = 0;

  if(pricingMode === "HOURLY"){
    const hourlyBillingMode = upper(pricing.hourlyBillingMode || "FULL");
    let hours = 1;

    if(hourlyBillingMode === "QUARTER"){
      hours = Math.max(1,Math.ceil(n(minutes) / 15) / 4);
    }else{
      hours = Math.max(1,Math.ceil(n(minutes) / 60));
    }

    total = hours * hourlyRate;
  }

  else if(pricingMode === "SHARED"){
    const count = Math.max(1,n(passengersCount,1));

    if(sharedPrice > 0){
      total = (sharedPrice * count) + (n(stops) * stopFee);
    }else{
      const baseTotal = count * baseFare;
      const includedTotal = count * includedMiles;
      const extraMiles = Math.max(0,n(miles) - includedTotal);
      const milesTotal = extraMiles * perMile;
      const stopsTotal = Math.max(0,count - 1) * stopFee;

      total = baseTotal + milesTotal + stopsTotal;
    }
  }

  else{
    const extraMiles = Math.max(0,n(miles) - includedMiles);
    total = baseFare + (extraMiles * perMile) + (n(stops) * stopFee);
  }

  return Number(total.toFixed(2));
}

/* =========================
   ENDPOINT
========================= */

router.post("/confirm-shared/:id", async (req,res)=>{
  try{
    const Trip = getTripModel();
    const id = req.params.id;

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const baseTrip = await Trip.findById(id);

    if(!baseTrip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(!isSharedTrip(baseTrip)){
      return res.status(400).json({
        success:false,
        message:"Trip is not shared"
      });
    }

    const groupTrips = await findSharedGroupTrips(Trip,baseTrip);
    const firstTrip = groupTrips[0] || baseTrip;

    const sourcePassengers = buildPassengersFromGroupDocs(groupTrips);
    const virtualTrip = buildVirtualSharedTrip(firstTrip,sourcePassengers);

    const currentSignature = buildSharedRouteSignatureFromPassengers(sourcePassengers);

    const requestStats = createRequestStats();

    let prepared = null;
    let routeData = null;
    let routeReused = false;

    if(hasUsableSavedRoute(firstTrip,currentSignature)){
      prepared = buildPreparedFromSavedTrip(firstTrip,currentSignature);
      routeData = buildRouteDataFromSavedTrip(firstTrip);
      routeReused = true;
    }else{
      prepared = await buildSmartSharedRoute(virtualTrip,requestStats);

      if(!safeArray(prepared.routePoints).length || prepared.routePoints.length < 2){
        return res.status(400).json({
          success:false,
          message:"Shared route points missing"
        });
      }

      routeData = await calculateRoute(prepared.routePoints);
      requestStats.directionsRequestsUsed += 1;
    }

    finalizeRequestStats(requestStats);

    const googleRequestsUsed = routeReused ? 0 : requestStats.googleRequestsUsed;

    const routeMiles = firstPositiveNumber(
      routeData?.miles,
      routeData?.distanceMeters > 0
        ? routeData.distanceMeters * 0.000621371
        : 0
    );

    if(routeMiles <= 0){
      console.log("COMPANY SHARED ROUTE DATA MISSING MILES:",{
        routePoints:prepared?.routePoints,
        routeData
      });

      return res.status(400).json({
        success:false,
        message:"Route miles missing"
      });
    }

    routeData.miles = Number(Number(routeMiles).toFixed(2));

    const company =
      firstTrip.company ||
      firstTrip.companyName ||
      firstTrip.facilityName ||
      req.body?.company ||
      req.body?.companyName ||
      req.body?.facilityName ||
      "";

    const facilityId =
      firstTrip.facilityId ||
      firstTrip.companyId ||
      firstTrip.userId ||
      req.body?.facilityId ||
      req.body?.companyId ||
      req.body?.userId ||
      "";

    const resolved = await resolvePricingService({
      serviceKey:"SH",
      facilityId,
      company
    });

    if(!resolved.success){
      return res.status(400).json({
        success:false,
        message:resolved.message || "Company shared pricing not found"
      });
    }

    const pricing = resolved.pricing;
    const activeCount = Math.max(1,n(prepared.activeCount,1));
    const sharedStopsCount = Math.max(0,n(prepared.sharedStopsCount,Math.max(0,safeArray(prepared.routePoints).length - 2)));

    const total = calculateCompanySharedPrice({
      pricing,
      miles:routeData.miles,
      stops:sharedStopsCount,
      minutes:routeData.estimatedMinutes,
      passengersCount:activeCount
    });

    const pricePerPassenger = Number((total / activeCount).toFixed(2));

    const finalPassengers = applySharedPassengerOrdersAndCoords({
      passengers:prepared.passengers,
      routePoints:prepared.routePoints,
      routePlan:safeArray(prepared.sharedRoutePlan).length
        ? prepared.sharedRoutePlan
        : prepared.routePlan,
      routeData,
      pricing,
      pricePerPassenger
    });

    const routePlan = safeArray(prepared.routePlan);
    const sharedRoutePlan = safeArray(prepared.sharedRoutePlan).length
      ? safeArray(prepared.sharedRoutePlan)
      : routePlan;

    const routePoints = compactRoutePoints(prepared.routePoints);

    const firstRoutePoint = routePlan[0] || sharedRoutePlan[0] || {};
    const lastRoutePoint = routePlan[routePlan.length - 1] || sharedRoutePlan[sharedRoutePlan.length - 1] || {};

    const firstPassenger = finalPassengers.find(passenger=>{
      return addressKey(passenger.pickup) === addressKey(firstRoutePoint.address);
    }) || finalPassengers[0] || {};

    const lastPassenger = [...finalPassengers].reverse().find(passenger=>{
      return addressKey(passenger.dropoff) === addressKey(lastRoutePoint.address);
    }) || finalPassengers[finalPassengers.length - 1] || {};

    const routeMeta = {
      ...(prepared.routeMeta || {}),
      routeReused,
      geocodeRequestsUsed:routeReused ? 0 : requestStats.geocodeRequestsUsed,
      geocodeCacheHits:routeReused ? 0 : requestStats.geocodeCacheHits,
      directionsRequestsUsed:routeReused ? 0 : requestStats.directionsRequestsUsed,
      googleRequestsUsed,
      routeSignature:currentSignature,
      pricingEngine:"company-core-compatible",
      pricingSource:pricing.source,
      pricingReason:resolved.pricingReason || ""
    };

    const pricingSnapshot = {
      source:pricing.source,
      pricingMode:pricing.pricingMode,
      baseFare:n(pricing.baseFare),
      includedMiles:n(pricing.includedMiles),
      perMile:n(pricing.perMile),
      stopFee:n(pricing.stopFee),
      sharedPrice:n(pricing.sharedPrice),
      hourlyRate:n(pricing.hourlyRate),
      hourlyBillingMode:pricing.hourlyBillingMode,
      noShowFee:n(pricing.noShowFee),
      cancelFee:n(pricing.cancelFee),
      warningMinutes:n(pricing.warningMinutes),
      disableCancel:bool(pricing.disableCancel),
      addStopEnabled:bool(pricing.addStopEnabled),
      addStopCustomTimeEnabled:bool(pricing.addStopCustomTimeEnabled),
      addStopCutoffMinutes:n(pricing.addStopCutoffMinutes),
      sharedStopsCount,
      activeCount
    };

    const routePayload = {
      status:"Confirmed",
      dispatchSelected:true,
      reviewOnly:false,

      type:firstTrip.type || "company",
      source:firstTrip.source || "COMPANY",
      bookingSource:firstTrip.bookingSource || "COMPANY_REVIEW",

      isShared:true,
      tripType:"SHARED",

      serviceKey:"SH",
      serviceType:"SH",
      serviceCode:"SH",
      serviceSuffix:"SH",
      tripNumberSuffix:"SH",
      vehicleTypeFromQuote:"SH",
      vehicleType:"SH",
      serviceName:pricing.rawService?.serviceName || pricing.rawService?.title || pricing.rawService?.name || "Shared",
      serviceTitle:pricing.rawService?.serviceName || pricing.rawService?.title || pricing.rawService?.name || "Shared",
      serviceId:String(pricing.rawService?._id || ""),

      passengers:finalPassengers,
      passengerCount:finalPassengers.length,
      passengersCount:finalPassengers.length,
      totalPassengers:finalPassengers.length,

      pickup:firstRoutePoint.address || firstPassenger.pickup || firstTrip.pickup || "",
      pickupLat:firstRoutePoint.lat ?? firstPassenger.pickupLat ?? firstTrip.pickupLat ?? null,
      pickupLng:firstRoutePoint.lng ?? firstPassenger.pickupLng ?? firstTrip.pickupLng ?? null,
      dropoff:lastRoutePoint.address || lastPassenger.dropoff || firstTrip.dropoff || "",
      dropoffLat:lastRoutePoint.lat ?? lastPassenger.dropoffLat ?? firstTrip.dropoffLat ?? null,
      dropoffLng:lastRoutePoint.lng ?? lastPassenger.dropoffLng ?? firstTrip.dropoffLng ?? null,

      priceAmount:total,
      finalPrice:total,
      pricePerPassenger,

      miles:n(routeData.miles),
      distanceMeters:n(routeData.distanceMeters),
      durationSeconds:n(routeData.durationSeconds),
      estimatedMinutes:n(routeData.estimatedMinutes),

      googleRoute:routeData.googleRoute || {},
      optimizedRoute:routeData.googleRoute || {},
      routePoints,
      routePlan,
      sharedRoutePlan,

      routeLocked:true,
      routeFinalized:true,
      routeSource:routeReused
        ? "company-review-shared-reused-server-route"
        : "company-review-shared-routeMapEngine-smart-route",
      routeUpdatedAt:new Date(),
      routeSignature:currentSignature,
      sharedRouteSignature:currentSignature,
      sharedRouteCase:prepared.routeCase,
      sharedRouteLocked:true,
      sharedRouteLockedAt:new Date(),
      sharedRouteMiles:n(routeData.miles),
      sharedRouteMinutes:n(routeData.estimatedMinutes),
      sharedRoutePolyline:
        routeData.polyline ||
        routeData.googleRoute?.overviewPolyline ||
        routeData.googleRoute?.overview_polyline?.points ||
        "",
      sharedStopsCount,
      sharedRouteMeta:routeMeta,
      routeMeta,

      routeChangePending:false,
      routeChangeStatus:"CONFIRMED",

      calculationSource:routeReused
        ? "SAVED_ROUTE_REUSED"
        : "GOOGLE_DIRECTIONS_FINAL_ONLY",

      pricingSource:pricing.source,
      pricingReason:resolved.pricingReason || "",
      facilityOverrideActive:resolved.facilityOverrideActive === true,
      facilityId:resolved.facilityId || facilityId || "",
      facilityName:resolved.facilityName || company || "",
      pricingSnapshot,

      companyDisableCancel:bool(pricing.disableCancel),
      companyCancelFee:n(pricing.cancelFee),
      companyWarningMinutes:n(pricing.warningMinutes),
      companyAddStopEnabled:bool(pricing.addStopEnabled),
      companyAddStopCustomTimeEnabled:bool(pricing.addStopCustomTimeEnabled),
      companyAddStopCutoffMinutes:n(pricing.addStopCutoffMinutes),

      googleRequestsUsed,
      geocodeRequestsUsed:routeReused ? 0 : requestStats.geocodeRequestsUsed,
      geocodeCacheHits:routeReused ? 0 : requestStats.geocodeCacheHits,
      directionsRequestsUsed:routeReused ? 0 : requestStats.directionsRequestsUsed,
      sharedGoogleRequestsUsed:googleRequestsUsed,
      sharedGeocodeRequestsUsed:routeReused ? 0 : requestStats.geocodeRequestsUsed,
      sharedGeocodeCacheHits:routeReused ? 0 : requestStats.geocodeCacheHits,
      sharedDirectionsRequestsUsed:routeReused ? 0 : requestStats.directionsRequestsUsed
    };

    const updatedTrips = [];

    for(const trip of groupTrips){
      Object.assign(trip,routePayload);
      await trip.save();
      updatedTrips.push(trip);
    }

    return res.json({
      success:true,
      trip:updatedTrips[0],
      trips:updatedTrips,
      routeReused,
      routeMode:routeReused
        ? "SAVED_ROUTE_REUSED"
        : prepared.routeCase || prepared.routeMeta?.mode || "COMPANY_SHARED_ROUTE_CALCULATED",
      pricingSource:pricing.source,
      pricingReason:resolved.pricingReason || "",
      facilityOverrideActive:resolved.facilityOverrideActive === true,
      total,
      pricePerPassenger,
      activeCount,
      miles:routeData.miles,
      estimatedMinutes:routeData.estimatedMinutes,
      googleRequestsUsed,
      geocodeRequestsUsed:routeReused ? 0 : requestStats.geocodeRequestsUsed,
      geocodeCacheHits:routeReused ? 0 : requestStats.geocodeCacheHits,
      directionsRequestsUsed:routeReused ? 0 : requestStats.directionsRequestsUsed
    });

  }catch(err){
    console.log("COMPANY REVIEW SHARED CONFIRM ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Company shared confirm failed"
    });
  }
});

module.exports = router;
