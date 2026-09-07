"use strict";

/*
DESTINATION PATH:
server/services/externalTripGeoService.js

PURPOSE:
Resolve and persist ExternalTrip pickup/dropoff coordinates before Trip Split.

RULES:
- Reuse coordinates only when they are bound to the same address.
- Reuse AddressCache before calling Google.
- Save newly resolved coordinates back to ExternalTrip.
- Save resolved addresses to AddressCache for future broker trips.
*/

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
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

function geoStillMatches(trip,type){

  const address =
    type === "pickup"
      ? normalizeAddress(trip.pickup)
      : normalizeAddress(trip.dropoff);

  const key =
    addressKey(address);

  const savedKey =
    type === "pickup"
      ? clean(trip.pickupGeoKey)
      : clean(trip.dropoffGeoKey);

  const savedAddress =
    type === "pickup"
      ? normalizeAddress(trip.pickupGeoAddress)
      : normalizeAddress(trip.dropoffGeoAddress);

  const lat =
    type === "pickup"
      ? trip.pickupLat
      : trip.dropoffLat;

  const lng =
    type === "pickup"
      ? trip.pickupLng
      : trip.dropoffLng;

  if(!address || !hasValidLatLng(lat,lng)){
    return false;
  }

  if(savedKey){
    return savedKey === key;
  }

  if(savedAddress){
    return addressKey(savedAddress) === key;
  }

  return false;
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

async function saveAddressCache(
  address,
  coords
){

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
          "trip-split-geocode",
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
      "TRIP SPLIT ADDRESS CACHE SAVE ERROR:",
      err.message
    );
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

  if(typeof fn !== "function"){
    throw new Error(
      "Route geocoder is not available"
    );
  }

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

  if(!hasValidLatLng(lat,lng)){
    return null;
  }

  const coords = {
    lat:Number(lat),
    lng:Number(lng),
    source:"trip-split-geocode"
  };

  await saveAddressCache(
    fullAddress,
    coords
  );

  return coords;
}

async function ensurePoint(
  trip,
  type
){

  if(
    geoStillMatches(
      trip,
      type
    )
  ){
    return false;
  }

  const address =
    type === "pickup"
      ? normalizeAddress(trip.pickup)
      : normalizeAddress(trip.dropoff);

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
    trip.pickupLat = coords.lat;
    trip.pickupLng = coords.lng;
    trip.pickupGeoKey = key;
    trip.pickupGeoAddress = address;
    trip.pickupGeoSource = coords.source;
  }else{
    trip.dropoffLat = coords.lat;
    trip.dropoffLng = coords.lng;
    trip.dropoffGeoKey = key;
    trip.dropoffGeoAddress = address;
    trip.dropoffGeoSource = coords.source;
  }

  return true;
}

async function ensureExternalTripCoordinates(
  trip
){

  let changed = false;

  if(
    await ensurePoint(
      trip,
      "pickup"
    )
  ){
    changed = true;
  }

  if(
    await ensurePoint(
      trip,
      "dropoff"
    )
  ){
    changed = true;
  }

  if(changed){
    await trip.save();
  }

  return trip;
}

async function ensureExternalTripsCoordinates(
  trips
){

  const out = [];

  for(const trip of trips){
    out.push(
      await ensureExternalTripCoordinates(
        trip
      )
    );
  }

  return out;
}

module.exports = {
  addressKey,
  hasValidLatLng,
  ensureExternalTripCoordinates,
  ensureExternalTripsCoordinates
};
