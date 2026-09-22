"use strict";

/*
DESTINATION PATH:
server/services/externalTripGeoService.js

PURPOSE:
Central coordinate engine for broker/external trips.

RULES:
- Every External Trip should carry pickup/dropoff coordinates.
- Every stop should carry lat/lng.
- Every passenger pickup/dropoff should carry lat/lng.
- Reuse AddressCache when possible.
- Re-geocode only changed/missing/untrusted addresses.
- Can also repair the Trip object created for Broker Review / Dispatch.
*/

const https = require("https");
const routeMapEngine = require("../utils/routeMapEngine");

let AddressCache = null;

try{
  AddressCache = require("../models/AddressCache");
}catch(err){
  AddressCache = null;
}

function clean(value){
  return String(value ?? "").trim();
}

function normalizeAddress(value){
  if(value && typeof value === "object"){
    return clean(
      value.address ||
      value.formattedAddress ||
      value.formatted_address ||
      value.description ||
      value.label ||
      ""
    ).replace(/\s+/g," ").trim();
  }

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

function hasValidLatLng(lat,lng){
  const a = Number(lat);
  const b = Number(lng);

  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    !(a === 0 && b === 0) &&
    a >= -90 &&
    a <= 90 &&
    b >= -180 &&
    b <= 180
  );
}

async function lookupAddressCache(address){

  if(!AddressCache){
    return null;
  }

  const fullAddress =
    normalizeAddress(address);

  if(!fullAddress){
    return null;
  }

  const key =
    addressKey(fullAddress);

  const found =
    await AddressCache.findOne({
      $or:[
        {addressKey:key},
        {key},
        {normalizedAddress:key}
      ]
    });

  if(
    !found ||
    !hasValidLatLng(
      found.lat,
      found.lng
    )
  ){
    return null;
  }

  found.usedCount =
    Number(found.usedCount || 0) + 1;

  found.lastUsedAt =
    new Date();

  await found.save().catch(()=>null);

  return {
    lat:Number(found.lat),
    lng:Number(found.lng),
    source:"address-cache"
  };
}

async function saveAddressCache(address,coords){

  if(
    !AddressCache ||
    !hasValidLatLng(
      coords?.lat,
      coords?.lng
    )
  ){
    return;
  }

  const fullAddress =
    normalizeAddress(address);

  const key =
    addressKey(fullAddress);

  if(!fullAddress || !key){
    return;
  }

  await AddressCache.findOneAndUpdate(
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
        source:
          coords.source ||
          "external-trip-geocode",
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
  ).catch(err=>{
    console.log(
      "EXTERNAL TRIP ADDRESS CACHE SAVE ERROR:",
      err?.message || err
    );
  });
}

function getGoogleMapsApiKey(){
  return (
    process.env.GOOGLE_SERVER_KEY ||
    process.env.GOOGLE_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.SERVER_GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
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

async function geocodeAddress(address){

  const fullAddress =
    normalizeAddress(address);

  if(!fullAddress){
    return null;
  }

  const cached =
    await lookupAddressCache(
      fullAddress
    );

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
      const result =
        await fn(fullAddress);

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
        result?.geometry?.location?.lng;

      if(hasValidLatLng(lat,lng)){
        const coords = {
          lat:Number(lat),
          lng:Number(lng),
          source:"route-map-engine-geocode"
        };

        await saveAddressCache(
          fullAddress,
          coords
        );

        return coords;
      }
    }catch(err){
      console.log(
        "EXTERNAL TRIP ROUTE GEOCODE ERROR:",
        err?.message || err
      );
    }
  }

  const apiKey =
    getGoogleMapsApiKey();

  if(!apiKey){
    throw new Error(
      "Google Maps server key is not configured"
    );
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(fullAddress) +
    "&key=" +
    encodeURIComponent(apiKey);

  const json =
    await httpsGetJson(url);

  if(
    json?.status !== "OK" ||
    !Array.isArray(json.results) ||
    !json.results.length
  ){
    throw new Error(
      `Address could not be located by Google: ${fullAddress}`
    );
  }

  const location =
    json.results[0]?.geometry?.location;

  if(
    !hasValidLatLng(
      location?.lat,
      location?.lng
    )
  ){
    throw new Error(
      `Google returned invalid coordinates for: ${fullAddress}`
    );
  }

  const coords = {
    lat:Number(location.lat),
    lng:Number(location.lng),
    source:"google-geocode"
  };

  await saveAddressCache(
    fullAddress,
    coords
  );

  return coords;
}

function pointBindingMatches(target,type){

  const address =
    normalizeAddress(
      type === "pickup"
        ? target?.pickup
        : target?.dropoff
    );

  const lat =
    type === "pickup"
      ? target?.pickupLat
      : target?.dropoffLat;

  const lng =
    type === "pickup"
      ? target?.pickupLng
      : target?.dropoffLng;

  if(
    !address ||
    !hasValidLatLng(lat,lng)
  ){
    return false;
  }

  const savedKey =
    clean(
      type === "pickup"
        ? target?.pickupGeoKey
        : target?.dropoffGeoKey
    );

  const savedAddress =
    normalizeAddress(
      type === "pickup"
        ? target?.pickupGeoAddress
        : target?.dropoffGeoAddress
    );

  if(savedKey){
    return savedKey === addressKey(address);
  }

  if(savedAddress){
    return addressKey(savedAddress) === addressKey(address);
  }

  /*
    Older Trip documents may not contain geo binding fields.
    Valid coordinates are trusted unless the caller explicitly forces
    a refresh after an address edit.
  */
  return true;
}

async function ensureMainPoint(target,type,force=false){

  if(
    !force &&
    pointBindingMatches(
      target,
      type
    )
  ){
    return false;
  }

  const address =
    normalizeAddress(
      type === "pickup"
        ? target?.pickup
        : target?.dropoff
    );

  if(!address){
    throw new Error(
      `${type === "pickup" ? "Pickup" : "Dropoff"} address is missing`
    );
  }

  const coords =
    await geocodeAddress(
      address
    );

  if(!coords){
    throw new Error(
      `${type === "pickup" ? "Pickup" : "Dropoff"} address could not be located: ${address}`
    );
  }

  const key =
    addressKey(address);

  if(type === "pickup"){
    target.pickupLat = coords.lat;
    target.pickupLng = coords.lng;
    target.pickupGeoKey = key;
    target.pickupGeoAddress = address;
    target.pickupGeoSource = coords.source;
  }else{
    target.dropoffLat = coords.lat;
    target.dropoffLng = coords.lng;
    target.dropoffGeoKey = key;
    target.dropoffGeoAddress = address;
    target.dropoffGeoSource = coords.source;
  }

  return true;
}

function normalizeStop(stop,index){

  if(typeof stop === "string"){
    return {
      address:normalizeAddress(stop),
      sequence:index + 1
    };
  }

  return {
    ...(stop?.toObject ? stop.toObject() : (stop || {})),
    address:normalizeAddress(stop),
    sequence:
      Number(stop?.sequence || index + 1) ||
      index + 1
  };
}

async function ensureStops(target,force=false){

  const source =
    Array.isArray(target?.stops)
      ? target.stops
      : [];

  const oldCoords =
    Array.isArray(target?.stopCoords)
      ? target.stopCoords
      : [];

  const nextStops = [];
  const nextStopCoords = [];
  let changed = false;

  for(let i=0; i<source.length; i++){

    const stop =
      normalizeStop(
        source[i],
        i
      );

    if(!stop.address){
      continue;
    }

    const old =
      oldCoords.find(
        row=>
          addressKey(row?.address) ===
          addressKey(stop.address)
      ) ||
      oldCoords[i] ||
      null;

    const currentLat =
      stop.lat ??
      old?.lat;

    const currentLng =
      stop.lng ??
      old?.lng;

    const bindingMatches =
      (
        clean(stop.geoKey) &&
        clean(stop.geoKey) === addressKey(stop.address)
      ) ||
      (
        normalizeAddress(stop.geoAddress) &&
        addressKey(stop.geoAddress) === addressKey(stop.address)
      );

    let coords = null;

    if(
      !force &&
      hasValidLatLng(currentLat,currentLng) &&
      (
        bindingMatches ||
        (!stop.geoKey && !stop.geoAddress)
      )
    ){
      coords = {
        lat:Number(currentLat),
        lng:Number(currentLng),
        source:
          stop.geoSource ||
          old?.source ||
          "existing-trusted"
      };
    }else{
      coords =
        await geocodeAddress(
          stop.address
        );

      if(!coords){
        throw new Error(
          `Stop address could not be located: ${stop.address}`
        );
      }

      changed = true;
    }

    const enriched = {
      ...stop,
      lat:Number(coords.lat),
      lng:Number(coords.lng),
      geoKey:addressKey(stop.address),
      geoAddress:stop.address,
      geoSource:
        coords.source ||
        "external-trip-geocode"
    };

    nextStops.push(enriched);

    nextStopCoords.push({
      address:stop.address,
      lat:Number(coords.lat),
      lng:Number(coords.lng)
    });
  }

  target.stops = nextStops;
  target.stopCoords = nextStopCoords;

  return changed;
}

async function ensurePassengers(target,force=false){

  if(
    !Array.isArray(target?.passengers) ||
    !target.passengers.length
  ){
    return false;
  }

  let changed = false;
  const next = [];

  for(const source of target.passengers){

    const passenger =
      source?.toObject
        ? source.toObject()
        : { ...source };

    if(passenger.pickup){
      if(
        await ensureMainPoint(
          passenger,
          "pickup",
          force
        )
      ){
        changed = true;
      }
    }

    if(passenger.dropoff){
      if(
        await ensureMainPoint(
          passenger,
          "dropoff",
          force
        )
      ){
        changed = true;
      }
    }

    next.push(passenger);
  }

  target.passengers = next;

  return changed;
}

async function ensureTripLikeCoordinates(
  target,
  options={}
){

  if(!target){
    throw new Error(
      "Trip is required for coordinate resolution"
    );
  }

  const {
    save=true,
    forcePickup=false,
    forceDropoff=false,
    forceStops=false,
    forcePassengers=false
  } = options;

  let changed = false;

  if(
    normalizeAddress(target.pickup) &&
    await ensureMainPoint(
      target,
      "pickup",
      forcePickup
    )
  ){
    changed = true;
  }

  if(
    normalizeAddress(target.dropoff) &&
    await ensureMainPoint(
      target,
      "dropoff",
      forceDropoff
    )
  ){
    changed = true;
  }

  if(
    await ensureStops(
      target,
      forceStops
    )
  ){
    changed = true;
  }

  if(
    await ensurePassengers(
      target,
      forcePassengers
    )
  ){
    changed = true;
  }

  if(
    save &&
    typeof target.save === "function" &&
    changed
  ){
    await target.save();
  }

  return target;
}

async function ensureExternalTripCoordinates(
  trip,
  options={}
){
  return ensureTripLikeCoordinates(
    trip,
    options
  );
}

async function ensureExternalTripsCoordinates(
  trips,
  options={}
){

  const out = [];

  for(const trip of trips || []){
    out.push(
      await ensureExternalTripCoordinates(
        trip,
        options
      )
    );
  }

  return out;
}

module.exports = {
  normalizeAddress,
  addressKey,
  hasValidLatLng,
  geocodeAddress,
  ensureTripLikeCoordinates,
  ensureExternalTripCoordinates,
  ensureExternalTripsCoordinates
};
