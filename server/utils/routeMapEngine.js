"use strict";

/* =========================================
   FILE: server/utils/routeMapEngine.js
   ROUTE MAP ENGINE

   1) Real driver tracking
   2) Server Google Directions final route calculation
   3) Server Google waypoint optimization for shared trips

   RULE:
   - Add/Edit/Review = 0 Google requests
   - Individual Confirm = 1 request
   - Shared Confirm = 3 requests
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
      address.toLowerCase();

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(address);
  }

  return out;
}

function getFetch(){

  if(typeof fetch === "function"){
    return fetch;
  }

  return require("node-fetch");
}

function getGoogleKey(){

  return (
    process.env.GOOGLE_SERVER_KEY ||
    process.env.GOOGLE_KEY ||
    process.env.GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  );
}

/* ================= DISTANCE HELPER ================= */

function distanceMiles(a,b){

  const R = 3958.8;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 *
    Math.cos(lat1) * Math.cos(lat2);

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
===================================================== */

async function googleDirectionsRequest(params){

  const fetchFn =
    getFetch();

  const googleKey =
    getGoogleKey();

  if(!googleKey){
    throw new Error("Google key missing on server");
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
   - request 1

   Shared:
   - final request 3
===================================================== */

async function calculateRouteMiles(routePoints){

  const cleanPoints =
    uniqueAddressList(routePoints);

  if(cleanPoints.length < 2){

    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{
        summary:"",
        waypointOrder:[],
        legs:[]
      }
    };
  }

  const origin =
    cleanPoints[0];

  const destination =
    cleanPoints[cleanPoints.length - 1];

  const middle =
    cleanPoints.slice(1,-1);

  const params =
    new URLSearchParams();

  params.set("origin",origin);
  params.set("destination",destination);

  if(middle.length){

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
   OPTIMIZE ADDRESS ORDER
   Used by Shared Confirm only

   Shared Confirm uses:
   Request 1: optimize pickups
   Request 2: optimize dropoffs

   NOTE:
   Google Directions optimizeWaypoints needs origin/destination.
   For 3+ addresses we use a loop style request:
   origin = anchor
   destination = anchor
   waypoints = optimize:true|other addresses

   Output returns only ordered passenger addresses.
===================================================== */

async function optimizeAddressOrder(addresses, options = {}){

  const cleanAddresses =
    uniqueAddressList(addresses);

  const type =
    clean(options.type || "ROUTE").toUpperCase();

  const startAfter =
    normalizeAddress(options.startAfter || "");

  if(cleanAddresses.length === 0){

    return {
      orderedAddresses:[],
      routePoints:[],
      meta:{
        type,
        optimized:false,
        requestUsed:false,
        reason:"NO_ADDRESSES"
      }
    };
  }

  if(cleanAddresses.length === 1){

    return {
      orderedAddresses:cleanAddresses,
      routePoints:cleanAddresses,
      meta:{
        type,
        optimized:false,
        requestUsed:false,
        reason:"ONE_ADDRESS"
      }
    };
  }

  /*
    Two addresses:
    We still call Google Directions to keep the shared rule clean.
    It does not need waypoint optimization, but it confirms routing.
  */

  if(cleanAddresses.length === 2){

    const params =
      new URLSearchParams();

    params.set(
      "origin",
      startAfter || cleanAddresses[0]
    );

    params.set(
      "destination",
      cleanAddresses[1]
    );

    if(startAfter){
      params.set(
        "waypoints",
        cleanAddresses[0]
      );
    }

    const data =
      await googleDirectionsRequest(params);

    return {
      orderedAddresses:cleanAddresses,
      routePoints:cleanAddresses,
      meta:{
        type,
        optimized:false,
        requestUsed:true,
        reason:"TWO_ADDRESSES",
        googleStatus:data.status || "OK",
        waypointOrder:
          data.routes?.[0]?.waypoint_order || []
      }
    };
  }

  /*
    3+ addresses:
    Optimize waypoints.

    If startAfter exists, we use it as the route anchor.
    This is useful for dropoffs because they should start after
    the last ordered pickup.

    If startAfter does not exist, we use first address as anchor.
  */

  const anchor =
    startAfter || cleanAddresses[0];

  const waypointAddresses =
    startAfter
      ? cleanAddresses
      : cleanAddresses.slice(1);

  const params =
    new URLSearchParams();

  params.set("origin",anchor);
  params.set("destination",anchor);

  params.set(
    "waypoints",
    "optimize:true|" + waypointAddresses.join("|")
  );

  const data =
    await googleDirectionsRequest(params);

  const route =
    data.routes[0];

  const waypointOrder =
    Array.isArray(route.waypoint_order)
      ? route.waypoint_order
      : [];

  const orderedWaypoints =
    waypointOrder
      .map(i=>waypointAddresses[i])
      .filter(Boolean);

  const orderedAddresses =
    startAfter
      ? orderedWaypoints
      : uniqueAddressList([
          cleanAddresses[0],
          ...orderedWaypoints
        ]);

  return {
    orderedAddresses,
    routePoints:orderedAddresses,
    meta:{
      type,
      optimized:true,
      requestUsed:true,
      anchor,
      startAfter:startAfter || "",
      waypointOrder,
      originalAddresses:cleanAddresses,
      waypointAddresses,
      googleStatus:data.status || "OK"
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

  optimizeAddressOrder
};