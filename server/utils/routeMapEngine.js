"use strict";

/* =========================================
   FILE: server/utils/routeMapEngine.js
   ROUTE MAP ENGINE

   1) Real driver tracking
   2) Server Google Directions final route calculation
   3) NO Google waypoint optimization

   FINAL RULE:
   - Add/Edit/Review = 0 Google requests
   - Individual Confirm = 1 Directions request
   - Shared Confirm = 1 Directions request max
   - Shared ordering is done in sharedRouteEngine.js using saved lat/lng
   - This file does NOT geocode
   - This file does NOT optimize route order
========================================= */

const tripsMemory = new Map();

/* ================= CONFIG ================= */

const MIN_DISTANCE = 0.002; // ~10 meters
const MAX_POINTS = 2000;

/* ================= BASIC HELPERS ================= */

function toRad(v){
  return (v * Math.PI) / 180;
}

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

function hasValidCoordinates(lat,lng){
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

/*
   Accepts:
   - string address
   - { address, lat, lng }
   - { formattedAddress, lat, lng }
   - { pickup/dropoff } is NOT expected here
*/
function normalizeRouteLocation(item){

  if(typeof item === "string"){
    const address =
      normalizeAddress(item);

    if(!address){
      return null;
    }

    return {
      address,
      lat:null,
      lng:null,
      googleValue:address
    };
  }

  if(item && typeof item === "object"){

    const address =
      normalizeAddress(
        item.address ||
        item.formattedAddress ||
        item.fullAddress ||
        ""
      );

    const lat =
      Number(item.lat);

    const lng =
      Number(item.lng);

    if(hasValidCoordinates(lat,lng)){

      return {
        address:
          address || `${lat},${lng}`,
        lat,
        lng,
        googleValue:`${lat},${lng}`
      };
    }

    if(address){

      return {
        address,
        lat:null,
        lng:null,
        googleValue:address
      };
    }
  }

  return null;
}

/*
   Unique list by coordinates if present, otherwise by address.
   Keeps route order.
*/
function uniqueRouteLocations(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const loc =
      normalizeRouteLocation(item);

    if(!loc){
      continue;
    }

    const key =
      hasValidCoordinates(loc.lat,loc.lng)
        ? `ll|${Number(loc.lat).toFixed(6)},${Number(loc.lng).toFixed(6)}`
        : `addr|${addressKey(loc.address)}`;

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(loc);
  }

  return out;
}

function uniqueAddressList(list){

  return uniqueRouteLocations(list)
    .map(loc=>loc.address)
    .filter(Boolean);
}

function getFetch(){

  if(typeof fetch === "function"){
    return fetch;
  }

  return require("node-fetch");
}

function getGoogleKey(){

  /*
     Server-side Directions must use GOOGLE_SERVER_KEY only.
     Do not fallback to browser/referrer keys.
  */
  return process.env.GOOGLE_SERVER_KEY || "";
}

/* ================= DISTANCE HELPER ================= */

function distanceMiles(a,b){

  const R = 3958.8;

  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));

  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 *
    Math.cos(lat1) *
    Math.cos(lat2);

  const c =
    2 * Math.atan2(
      Math.sqrt(x),
      Math.sqrt(1 - x)
    );

  return R * c;
}

function getTrip(tripId){

  if(!tripsMemory.has(tripId)){

    tripsMemory.set(tripId,{
      path:[],
      miles:0,
      last:null
    });
  }

  return tripsMemory.get(tripId);
}

/* ================= LIVE TRACKING CORE ================= */

function updateLocation(tripId,lat,lng){

  if(!tripId) return;
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const trip =
    getTrip(tripId);

  const newPoint = {
    lat:Number(lat),
    lng:Number(lng),
    t:Date.now()
  };

  if(!trip.last){

    trip.last =
      newPoint;

    trip.path.push(
      newPoint
    );

    return;
  }

  const dist =
    distanceMiles(
      trip.last,
      newPoint
    );

  if(dist < MIN_DISTANCE){
    return;
  }

  trip.miles +=
    dist;

  trip.last =
    newPoint;

  trip.path.push(
    newPoint
  );

  if(trip.path.length > MAX_POINTS){
    trip.path.shift();
  }
}

/* ================= LIVE TRACKING GETTERS ================= */

function getDrivenMiles(tripId){

  const trip =
    tripsMemory.get(tripId);

  if(!trip) return 0;

  return Number(
    trip.miles.toFixed(2)
  );
}

function getLastLocation(tripId){

  const trip =
    tripsMemory.get(tripId);

  if(!trip) return null;

  return trip.last;
}

function getPath(tripId){

  const trip =
    tripsMemory.get(tripId);

  if(!trip) return [];

  return trip.path;
}

function resetTrip(tripId){
  tripsMemory.delete(tripId);
}

/* =====================================================
   GOOGLE DIRECTIONS REQUEST
   Final calculation only.
===================================================== */

async function googleDirectionsRequest(params){

  const fetchFn =
    getFetch();

  const googleKey =
    getGoogleKey();

  if(!googleKey){
    throw new Error("Google server key missing on server");
  }

  params.set("mode","driving");
  params.set("units","imperial");
  params.set("key",googleKey);

  const url =
    "https://maps.googleapis.com/maps/api/directions/json?" +
    params.toString();

  const res =
    await fetchFn(url);

  const data =
    await res.json();

  if(
    !res.ok ||
    data.status !== "OK" ||
    !Array.isArray(data.routes) ||
    !data.routes[0]
  ){

    const msg =
      data.error_message ||
      data.status ||
      res.status ||
      "UNKNOWN";

    throw new Error(
      "Google route failed: " + msg
    );
  }

  return data;
}

/* =====================================================
   SERVER ROUTE CALCULATION
   Used on Confirm only

   Individual:
   - 1 Directions request

   Shared:
   - 1 Directions request max
   - Order must already be final
   - optimizeWaypoints is NEVER used here
===================================================== */

async function calculateRouteMiles(routePoints){

  const cleanPoints =
    uniqueRouteLocations(routePoints);

  if(cleanPoints.length < 2){

    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRequestsUsed:0,
      googleRoute:{
        summary:"",
        waypointOrder:[],
        legs:[]
      }
    };
  }

  const origin =
    cleanPoints[0].googleValue;

  const destination =
    cleanPoints[cleanPoints.length - 1].googleValue;

  const middle =
    cleanPoints
      .slice(1,-1)
      .map(loc=>loc.googleValue)
      .filter(Boolean);

  const params =
    new URLSearchParams();

  params.set("origin",origin);
  params.set("destination",destination);

  if(middle.length){

    /*
       IMPORTANT:
       No optimize:true here.
       This request calculates the fixed order only.
    */
    params.set(
      "waypoints",
      middle.join("|")
    );
  }

  const data =
    await googleDirectionsRequest(params);

  const route =
    data.routes[0];

  const legs =
    Array.isArray(route.legs)
      ? route.legs
      : [];

  let meters = 0;
  let seconds = 0;

  legs.forEach(leg=>{

    meters +=
      n(leg.distance?.value);

    seconds +=
      n(leg.duration?.value);
  });

  return {
    miles:
      Number((meters * 0.000621371).toFixed(2)),

    distanceMeters:
      meters,

    durationSeconds:
      seconds,

    estimatedMinutes:
      Math.ceil(seconds / 60),

    googleRequestsUsed:1,

    googleRoute:{
      summary:
        route.summary || "",

      waypointOrder:
        route.waypoint_order || [],

      overviewPolyline:
        route.overview_polyline?.points || "",

      bounds:
        route.bounds || null,

      copyrights:
        route.copyrights || "",

      warnings:
        route.warnings || [],

      legs:
        legs.map((leg,index)=>({

          legIndex:index,

          startAddress:
            leg.start_address || "",

          endAddress:
            leg.end_address || "",

          startLat:
            Number(
              leg.start_location?.lat ?? null
            ),

          startLng:
            Number(
              leg.start_location?.lng ?? null
            ),

          endLat:
            Number(
              leg.end_location?.lat ?? null
            ),

          endLng:
            Number(
              leg.end_location?.lng ?? null
            ),

          distanceText:
            leg.distance?.text || "",

          distanceMeters:
            n(leg.distance?.value),

          durationText:
            leg.duration?.text || "",

          durationSeconds:
            n(leg.duration?.value)

        }))
    }
  };
}

/* =====================================================
   DEPRECATED OPTIMIZER
   Kept only so old imports do not crash.

   IMPORTANT:
   This function MUST NOT call Google.
   Shared route ordering is now done by sharedRouteEngine.js
   using saved lat/lng and air-distance logic.
===================================================== */

async function optimizeAddressOrder(addresses, options = {}){

  const cleanAddresses =
    uniqueAddressList(addresses);

  const type =
    clean(options.type || "ROUTE").toUpperCase();

  return {
    orderedAddresses:cleanAddresses,
    routePoints:cleanAddresses,
    meta:{
      type,
      optimized:false,
      requestUsed:false,
      googleRequestsUsed:0,
      reason:"DEPRECATED_NO_GOOGLE_OPTIMIZE_USE_SHARED_ROUTE_ENGINE"
    }
  };
}

/* ================= EXPORT ================= */

module.exports = {
  updateLocation,
  getDrivenMiles,
  getLastLocation,
  getPath,
  resetTrip,

  calculateRouteMiles,
  calculateRoute:calculateRouteMiles,

  optimizeAddressOrder,

  uniqueAddressList,
  uniqueRouteLocations,
  normalizeRouteLocation,
  hasValidCoordinates
};