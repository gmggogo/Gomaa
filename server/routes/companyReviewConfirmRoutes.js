"use strict";

/* =====================================================
   FILE: server/routes/companyReviewConfirmRoutes.js
   COMPANY REVIEW CONFIRM ROUTES

   PURPOSE:
   - Company Review shared confirm only.
   - Uses SERVER route ordering/calculation.
   - Uses COMPANY / FACILITY pricing, NOT Reserved pricing.

   ENDPOINT:
   POST /api/company-review/confirm-shared/:id

   IMPORTANT:
   - Does NOT use dispatch-reserved-confirm.
   - Does NOT use reservedBaseFare/reservedSharedPrice.
   - Uses FacilityPricingOverride first, then Service Management fallback.
   - Reuses saved lat/lng when trusted.
   - Geocodes only missing/untrusted passenger pickup/dropoff coords.
   - Final Google Directions is server-side through routeMapEngine.calculateRouteMiles.
   - Google does not reorder; routeMapEngine/shared engine decides order.
===================================================== */

const express = require("express");
const mongoose = require("mongoose");
const https = require("https");

const router = express.Router();

const routeMapEngine = require("../utils/routeMapEngine");
const Service = require("../models/Service");
const FacilityPricingOverride = require("../models/FacilityPricingOverride");

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
  return clean(value).replace(/\s+/g," ").trim();
}

function addressKey(value){
  return normalizeAddress(value).toLowerCase().replace(/\s+/g," ").trim();
}

function geoKey(value){
  return addressKey(value);
}

function escapeRegex(value){
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function normalizeCode(value){
  const c = upper(value).replace(/[_-]/g," ").replace(/\s+/g," ").trim();

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
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function cleanStatus(value){
  return clean(value).replace(/\s+/g,"").toLowerCase();
}

function passengerIsActive(passenger){
  const status = cleanStatus(passenger?.status);
  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show") &&
    normalizeAddress(passenger?.pickup) &&
    normalizeAddress(passenger?.dropoff)
  );
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

function isSharedTrip(trip){
  const code = normalizeCode(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.tripNumberSuffix ||
    ""
  );

  return (
    trip?.isShared === true ||
    String(trip?.tripType || "").toUpperCase() === "SHARED" ||
    code === "SH" ||
    Array.isArray(trip?.passengers) && trip.passengers.length > 1
  );
}

function getSharedGroupKey(trip){
  return clean(trip?.groupId) || clean(trip?.tripNumber) || String(trip?._id || "");
}

/* =========================
   ROUTE SIGNATURE / REUSE
========================= */

function buildSharedRouteSignatureFromPassengers(passengers){
  return JSON.stringify({
    type:"COMPANY_SHARED",
    passengers:safeArray(passengers)
      .map((p,index)=>({
        id:String(p.passengerId || p._id || index),
        pickup:addressKey(p.pickup),
        dropoff:addressKey(p.dropoff),
        active:passengerIsActive(p) ? "1" : "0"
      }))
      .filter(p=>p.pickup || p.dropoff)
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  });
}

function savedRoutePlan(trip){
  const plan = safeArray(trip?.sharedRoutePlan).length
    ? safeArray(trip.sharedRoutePlan)
    : safeArray(trip?.routePlan);

  return plan
    .filter(p=>normalizeAddress(p?.address))
    .sort((a,b)=>n(a.order) - n(b.order));
}

function savedRoutePoints(trip){
  const plan = savedRoutePlan(trip);

  if(plan.length >= 2){
    return plan.map(p=>normalizeAddress(p.address)).filter(Boolean);
  }

  return safeArray(trip?.routePoints)
    .map(p=>typeof p === "string" ? normalizeAddress(p) : normalizeAddress(p?.address))
    .filter(Boolean);
}

function getSavedRouteSignature(trip){
  return clean(trip?.sharedRouteSignature || trip?.routeSignature || "");
}

function hasUsableSavedRoute(trip,currentSignature){
  const points = savedRoutePoints(trip);

  if(points.length < 2) return false;
  if(n(trip?.miles || trip?.sharedRouteMiles) <= 0) return false;
  if(trip?.routeChangePending === true) return false;
  if(upper(trip?.routeChangeStatus) === "ROUTE_CHANGED") return false;

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

function buildRouteDataFromSavedTrip(trip){
  return {
    miles:n(trip?.miles || trip?.sharedRouteMiles),
    distanceMeters:n(trip?.distanceMeters),
    durationSeconds:n(trip?.durationSeconds),
    estimatedMinutes:n(trip?.estimatedMinutes || trip?.sharedRouteMinutes),
    polyline:trip?.sharedRoutePolyline || trip?.routePolyline || "",
    googleRoute:trip?.googleRoute || trip?.optimizedRoute || {},
    routePoints:savedRoutePoints(trip)
  };
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
      response.on("data",chunk=>{ data += chunk; });
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

async function lookupAddressCache(address,stats){
  if(!AddressCache) return null;

  const fullAddress = normalizeAddress(address);
  if(!fullAddress) return null;

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
      if(stats) stats.geocodeCacheHits += 1;

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
    console.log("Company AddressCache lookup failed:", err.message);
  }

  return null;
}

async function saveAddressCache(address,coords,source = "company-confirm-geocode"){
  if(!AddressCache) return null;

  const fullAddress = normalizeAddress(address);
  if(!fullAddress || !hasValidLatLng(coords?.lat,coords?.lng)) return null;

  const key = addressKey(fullAddress);

  try{
    return await AddressCache.findOneAndUpdate(
      {$or:[{addressKey:key},{key},{normalizedAddress:key}]},
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
        $inc:{usedCount:1},
        $setOnInsert:{createdAt:new Date()}
      },
      {new:true,upsert:true,setDefaultsOnInsert:true}
    );
  }catch(err){
    console.log("Company AddressCache save failed:", err.message);
    return null;
  }
}

async function geocodeAddress(address,stats){
  const cleanAddress = normalizeAddress(address);
  if(!cleanAddress) return null;

  const cached = await lookupAddressCache(cleanAddress,stats);
  if(cached) return cached;

  const apiKey = getGoogleMapsApiKey();
  if(!apiKey){
    return null;
  }

  if(stats) stats.geocodeRequestsUsed += 1;

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(cleanAddress) +
    "&key=" +
    encodeURIComponent(apiKey);

  const json = await httpsGetJson(url);

  if(json?.status !== "OK" || !Array.isArray(json.results) || !json.results.length){
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

function geoMatchesCurrentAddress(passenger,type){
  const address = type === "pickup"
    ? normalizeAddress(passenger.pickup)
    : normalizeAddress(passenger.dropoff);

  const savedGeoKey = type === "pickup"
    ? clean(passenger.pickupGeoKey || passenger.pickupAddressKey || "")
    : clean(passenger.dropoffGeoKey || passenger.dropoffAddressKey || "");

  const savedGeoAddress = type === "pickup"
    ? normalizeAddress(passenger.pickupGeoAddress || "")
    : normalizeAddress(passenger.dropoffGeoAddress || "");

  const currentKey = geoKey(address);

  if(!address || !currentKey) return false;
  if(savedGeoKey) return savedGeoKey === currentKey;
  if(savedGeoAddress) return geoKey(savedGeoAddress) === currentKey;

  return false;
}

function needsFreshGeocode(passenger,type){
  if(type === "pickup"){
    if(!hasValidLatLng(passenger.pickupLat,passenger.pickupLng)) return true;
    return !geoMatchesCurrentAddress(passenger,"pickup");
  }

  if(type === "dropoff"){
    if(!hasValidLatLng(passenger.dropoffLat,passenger.dropoffLng)) return true;
    return !geoMatchesCurrentAddress(passenger,"dropoff");
  }

  return true;
}

async function ensurePassengerCoordinates(passenger,stats){
  const out = {...passenger};

  out.pickup = normalizeAddress(out.pickup);
  out.dropoff = normalizeAddress(out.dropoff);

  if(!out.pickup) throw new Error("Missing pickup address for passenger: " + (out.clientName || out.name || out.passengerId || ""));
  if(!out.dropoff) throw new Error("Missing dropoff address for passenger: " + (out.clientName || out.name || out.passengerId || ""));

  if(needsFreshGeocode(out,"pickup")){
    const coords = await geocodeAddress(out.pickup,stats);
    if(coords){
      out.pickupLat = coords.lat;
      out.pickupLng = coords.lng;
      out.pickupGeoAddress = out.pickup;
      out.pickupGeoKey = geoKey(out.pickup);
      out.pickupGeoSource = coords.source || "geocode";
    }
  }else{
    await saveAddressCache(out.pickup,{lat:out.pickupLat,lng:out.pickupLng},"company-existing-trusted-pickup");
    out.pickupGeoAddress = out.pickup;
    out.pickupGeoKey = geoKey(out.pickup);
    out.pickupGeoSource = out.pickupGeoSource || "existing-trusted";
  }

  if(needsFreshGeocode(out,"dropoff")){
    const coords = await geocodeAddress(out.dropoff,stats);
    if(coords){
      out.dropoffLat = coords.lat;
      out.dropoffLng = coords.lng;
      out.dropoffGeoAddress = out.dropoff;
      out.dropoffGeoKey = geoKey(out.dropoff);
      out.dropoffGeoSource = coords.source || "geocode";
    }
  }else{
    await saveAddressCache(out.dropoff,{lat:out.dropoffLat,lng:out.dropoffLng},"company-existing-trusted-dropoff");
    out.dropoffGeoAddress = out.dropoff;
    out.dropoffGeoKey = geoKey(out.dropoff);
    out.dropoffGeoSource = out.dropoffGeoSource || "existing-trusted";
  }

  if(!hasValidLatLng(out.pickupLat,out.pickupLng)){
    throw new Error("Missing pickup coordinates for: " + out.pickup);
  }

  if(!hasValidLatLng(out.dropoffLat,out.dropoffLng)){
    throw new Error("Missing dropoff coordinates for: " + out.dropoff);
  }

  return out;
}

/* =========================
   PASSENGERS / GROUP
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
      passengerId:p.passengerId || "P" + (index + 1),
      clientName:p.clientName || p.name || "",
      name:p.name || p.clientName || "",
      clientPhone:p.clientPhone || p.phone || "",
      phone:p.phone || p.clientPhone || "",
      pickup:normalizeAddress(p.pickup),
      dropoff:normalizeAddress(p.dropoff),
      status:p.status || "Scheduled"
    }));
  }

  return groupTrips.map((trip,index)=>({
    passengerId:trip.passengerId || "P" + (index + 1),
    clientName:trip.clientName || trip.name || "",
    name:trip.name || trip.clientName || "",
    clientPhone:trip.clientPhone || trip.phone || "",
    phone:trip.phone || trip.clientPhone || "",
    pickup:normalizeAddress(trip.pickup),
    pickupLat:trip.pickupLat ?? null,
    pickupLng:trip.pickupLng ?? null,
    pickupGeoKey:trip.pickupGeoKey || "",
    pickupGeoAddress:trip.pickupGeoAddress || "",
    dropoff:normalizeAddress(trip.dropoff),
    dropoffLat:trip.dropoffLat ?? null,
    dropoffLng:trip.dropoffLng ?? null,
    dropoffGeoKey:trip.dropoffGeoKey || "",
    dropoffGeoAddress:trip.dropoffGeoAddress || "",
    status:trip.status || "Scheduled",
    priceAmount:trip.priceAmount || 0,
    finalPrice:trip.finalPrice || 0
  }));
}

async function preparePassengersWithCoords(passengers,stats){
  const out = [];

  for(const passenger of safeArray(passengers)){
    if(!passengerIsActive(passenger)){
      out.push(passenger);
      continue;
    }

    out.push(
      await ensurePassengerCoordinates(passenger,stats)
    );
  }

  const active = out.filter(passengerIsActive);

  if(active.length < 2){
    throw new Error("Shared trip requires at least 2 active passengers");
  }

  return out;
}

/* =========================
   COMPANY PRICING ENGINE
   Same logic as /api/company-core/calculate
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
  if(!companyName) return "";

  const User = getUserModel();
  if(!User) return "";

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

  if(!or.length) return null;

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
    return {success:false,message:"Service Not Found: " + clean(serviceKey)};
  }

  if(service.companyEnabled === false){
    return {success:false,message:"Company Service Disabled"};
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

function calculateCompanyPrice({pricing,miles,stops,minutes,passengersCount}){
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
   ROUTE ORDER APPLY
========================= */

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

function applyPassengerOrdersAndPrice({passengers,routePlan,routeData,pricePerPassenger,pricing}){
  return safeArray(passengers)
    .map((passenger,index)=>{
      const active = passengerIsActive(passenger);

      const pickupOrder = routePlanOrder(routePlan,"pickup",passenger.pickup);
      const dropoffOrder = routePlanOrder(routePlan,"dropoff",passenger.dropoff);

      return {
        ...passenger,
        pickupOrder:active ? pickupOrder : 9999,
        dropoffOrder:active ? dropoffOrder : 9999,
        routeOrder:index + 1,
        status:active ? "Confirmed" : passenger.status || "Scheduled",
        passengerMiles:active ? n(routeData.miles) : 0,
        passengerMinutes:active ? n(routeData.estimatedMinutes) : 0,
        passengerDistanceMeters:active ? n(routeData.distanceMeters) : 0,
        passengerDurationSeconds:active ? n(routeData.durationSeconds) : 0,
        priceAmount:active ? pricePerPassenger : 0,
        finalPrice:active ? pricePerPassenger : 0,
        cancelFee:n(pricing.cancelFee),
        noShowFee:n(pricing.noShowFee)
      };
    })
    .sort((a,b)=>{
      if(n(a.pickupOrder) !== n(b.pickupOrder)) return n(a.pickupOrder) - n(b.pickupOrder);
      if(n(a.dropoffOrder) !== n(b.dropoffOrder)) return n(a.dropoffOrder) - n(b.dropoffOrder);
      return n(a.routeOrder) - n(b.routeOrder);
    })
    .map((passenger,index)=>({
      ...passenger,
      routeOrder:index + 1
    }));
}

/* =========================
   ENDPOINT
========================= */

router.post("/confirm-shared/:id", async (req,res)=>{
  try{
    const Trip = getTripModel();
    const id = req.params.id;

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({success:false,message:"Invalid trip id"});
    }

    const baseTrip = await Trip.findById(id);

    if(!baseTrip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }

    if(!isSharedTrip(baseTrip)){
      return res.status(400).json({success:false,message:"Trip is not shared"});
    }

    const groupTrips = await findSharedGroupTrips(Trip,baseTrip);
    const firstTrip = groupTrips[0] || baseTrip;

    const stats = {
      geocodeRequestsUsed:0,
      geocodeCacheHits:0,
      directionsRequestsUsed:0,
      googleRequestsUsed:0
    };

    const sourcePassengers = buildPassengersFromGroupDocs(groupTrips);
    const passengersWithCoords = await preparePassengersWithCoords(sourcePassengers,stats);
    const activePassengers = passengersWithCoords.filter(passengerIsActive);
    const activeCount = Math.max(1,activePassengers.length);

    const currentSignature = buildSharedRouteSignatureFromPassengers(passengersWithCoords);

    let routePlan = [];
    let sharedRoutePlan = [];
    let routePoints = [];
    let routeData = null;
    let routeMeta = {};
    let routeReused = false;

    if(hasUsableSavedRoute(firstTrip,currentSignature)){
      routeReused = true;
      routePlan = savedRoutePlan(firstTrip);
      sharedRoutePlan = routePlan;
      routePoints = savedRoutePoints(firstTrip);
      routeData = buildRouteDataFromSavedTrip(firstTrip);
      routeMeta = {
        mode:"SAVED_ROUTE_REUSED",
        reused:true,
        routeSignature:currentSignature
      };
    }else{
      const smart = routeMapEngine.buildSharedRoutePlanFromPassengers(passengersWithCoords);

      routePlan = safeArray(smart.routePlan);
      sharedRoutePlan = safeArray(smart.sharedRoutePlan).length
        ? safeArray(smart.sharedRoutePlan)
        : routePlan;

      routePoints = safeArray(smart.addresses).length
        ? safeArray(smart.addresses).map(normalizeAddress).filter(Boolean)
        : routePlan.map(point=>normalizeAddress(point.address)).filter(Boolean);

      if(routePoints.length < 2){
        return res.status(400).json({success:false,message:"Shared route points missing"});
      }

      routeData = await routeMapEngine.calculateRouteMiles(routePoints);
      stats.directionsRequestsUsed += 1;
      stats.googleRequestsUsed = stats.geocodeRequestsUsed + stats.directionsRequestsUsed;

      routeMeta = {
        ...(smart.meta || {}),
        mode:smart.routeCase || "COMPANY_SHARED_ROUTE",
        routeCase:smart.routeCase || "COMPANY_SHARED_ROUTE",
        engine:"routeMapEngine.buildSharedRoutePlanFromPassengers",
        pricingEngine:"company-core-compatible",
        googleFinalOptimize:false,
        routeSignature:currentSignature,
        geocodeRequestsUsed:stats.geocodeRequestsUsed,
        geocodeCacheHits:stats.geocodeCacheHits,
        directionsRequestsUsed:stats.directionsRequestsUsed,
        googleRequestsUsed:stats.googleRequestsUsed
      };
    }

    const routeMiles = n(routeData?.miles);

    if(routeMiles <= 0){
      return res.status(400).json({
        success:false,
        message:"Route miles missing"
      });
    }

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

    const serviceKey = "SH";

    const resolved = await resolvePricingService({
      serviceKey,
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

    const sharedStopsCount = Math.max(0,n(routePoints.length) - 2);

    const total = calculateCompanyPrice({
      pricing,
      miles:routeData.miles,
      stops:sharedStopsCount,
      minutes:routeData.estimatedMinutes,
      passengersCount:activeCount
    });

    const pricePerPassenger = Number((total / activeCount).toFixed(2));

    const finalPassengers = applyPassengerOrdersAndPrice({
      passengers:passengersWithCoords,
      routePlan:sharedRoutePlan.length ? sharedRoutePlan : routePlan,
      routeData,
      pricePerPassenger,
      pricing
    });

    const firstPassenger = finalPassengers[0] || {};
    const lastPassenger = finalPassengers[finalPassengers.length - 1] || {};

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

      pickup:firstPassenger.pickup || firstTrip.pickup || "",
      pickupLat:firstPassenger.pickupLat ?? firstTrip.pickupLat ?? null,
      pickupLng:firstPassenger.pickupLng ?? firstTrip.pickupLng ?? null,
      dropoff:lastPassenger.dropoff || firstTrip.dropoff || "",
      dropoffLat:lastPassenger.dropoffLat ?? firstTrip.dropoffLat ?? null,
      dropoffLng:lastPassenger.dropoffLng ?? firstTrip.dropoffLng ?? null,

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
        : "company-review-shared-server-routeMapEngine",
      routeUpdatedAt:new Date(),
      routeSignature:currentSignature,
      sharedRouteSignature:currentSignature,
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

      pricingSource:pricing.source,
      pricingReason:resolved.pricingReason || "",
      facilityOverrideActive:resolved.facilityOverrideActive === true,
      facilityId:resolved.facilityId || facilityId || "",
      facilityName:resolved.facilityName || company || "",
      pricingSnapshot:{
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
        sharedStopsCount,
        activeCount
      },

      googleRequestsUsed:routeReused ? 0 : stats.googleRequestsUsed,
      geocodeRequestsUsed:routeReused ? 0 : stats.geocodeRequestsUsed,
      geocodeCacheHits:routeReused ? 0 : stats.geocodeCacheHits,
      directionsRequestsUsed:routeReused ? 0 : stats.directionsRequestsUsed,
      sharedGoogleRequestsUsed:routeReused ? 0 : stats.googleRequestsUsed,
      sharedGeocodeRequestsUsed:routeReused ? 0 : stats.geocodeRequestsUsed,
      sharedGeocodeCacheHits:routeReused ? 0 : stats.geocodeCacheHits,
      sharedDirectionsRequestsUsed:routeReused ? 0 : stats.directionsRequestsUsed
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
      pricingSource:pricing.source,
      pricingReason:resolved.pricingReason || "",
      facilityOverrideActive:resolved.facilityOverrideActive === true,
      total,
      pricePerPassenger,
      activeCount,
      miles:routeData.miles,
      estimatedMinutes:routeData.estimatedMinutes,
      googleRequestsUsed:routeReused ? 0 : stats.googleRequestsUsed,
      geocodeRequestsUsed:routeReused ? 0 : stats.geocodeRequestsUsed,
      geocodeCacheHits:routeReused ? 0 : stats.geocodeCacheHits,
      directionsRequestsUsed:routeReused ? 0 : stats.directionsRequestsUsed
    });

  }catch(err){
    console.log("COMPANY REVIEW SHARED CONFIRM ERROR:", err);

    return res.status(500).json({
      success:false,
      message:err.message || "Company shared confirm failed"
    });
  }
});

module.exports = router;
