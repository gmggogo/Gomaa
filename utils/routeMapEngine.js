"use strict";

/* =========================================
   FILE: server/utils/routeMapEngine.js
   ROUTE MAP ENGINE

   1) Real driver tracking
   2) Server Google Directions final route calculation
   3) Shared route ordering helper by saved lat/lng

   SAFE RULE:
   - This file does NOT geocode.
   - This file uses saved lat/lng when available.
   - Final Directions request calculates miles/minutes/polyline only.
   - Google Directions must NOT optimize shared routes.
   - Shared route ordering is based on LOWEST MILES, not lowest time.
   - For shared trips:
       All pickups first.
       Dropoffs never happen before all pickups.
       SAME pickup / SAME dropoff handled.
       SAME pickup / DIFFERENT dropoff handled by local lowest miles.
       DIFFERENT pickup / SAME dropoff handled by stable nearest-neighbor.
       DIFFERENT pickup / DIFFERENT dropoff handled with stable nearest-neighbor.
========================================= */

const tripsMemory = new Map();

/* ================= CONFIG ================= */

const MIN_DISTANCE = 0.002; // ~10 meters
const MAX_POINTS = 2000;

/* ================= BASIC HELPERS ================= */

function toRad(v){
  return (Number(v) * Math.PI) / 180;
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

function compactStatus(value){
  return clean(value)
    .replace(/[_-]/g," ")
    .replace(/\s+/g,"")
    .toLowerCase();
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

function stableText(value){
  return normalizeAddress(value).toLowerCase();
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

  if(
    !hasValidLatLng(a?.lat,a?.lng) ||
    !hasValidLatLng(b?.lat,b?.lng)
  ){
    return Number.MAX_SAFE_INTEGER;
  }

  const R = 3958.8;

  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));

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

/* ================= ROUTE POINT NORMALIZATION ================= */

function normalizeRoutePoint(item,index = 0){

  if(typeof item === "string"){

    const address =
      normalizeAddress(item);

    if(!address){
      return null;
    }

    return {
      type:"point",
      address,
      lat:null,
      lng:null,
      order:index + 1,
      googleValue:address,
      key:"addr|" + addressKey(address)
    };
  }

  if(!item || typeof item !== "object"){
    return null;
  }

  const address =
    normalizeAddress(
      item.address ||
      item.formattedAddress ||
      item.fullAddress ||
      item.label ||
      ""
    );

  const lat =
    hasValidLatLng(item.lat,item.lng)
      ? Number(item.lat)
      : hasValidLatLng(item.latitude,item.longitude)
        ? Number(item.latitude)
        : null;

  const lng =
    hasValidLatLng(item.lat,item.lng)
      ? Number(item.lng)
      : hasValidLatLng(item.latitude,item.longitude)
        ? Number(item.longitude)
        : null;

  if(!address && !hasValidLatLng(lat,lng)){
    return null;
  }

  const googleValue =
    hasValidLatLng(lat,lng)
      ? `${lat},${lng}`
      : address;

  const key =
    hasValidLatLng(lat,lng)
      ? `ll|${lat.toFixed(6)},${lng.toFixed(6)}`
      : "addr|" + addressKey(address);

  return {
    ...item,
    type:item.type || "point",
    address:address || googleValue,
    lat,
    lng,
    order:n(item.order) || index + 1,
    googleValue,
    key
  };
}

function uniqueRouteLocations(list){

  const out = [];
  const seen = new Set();

  safeArray(list).forEach((item,index)=>{

    const point =
      normalizeRoutePoint(item,index);

    if(!point){
      return;
    }

    if(seen.has(point.key)){
      return;
    }

    seen.add(point.key);
    out.push(point);
  });

  return out;
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  for(const item of safeArray(list)){

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

/* ================= LIVE TRACKING CORE ================= */

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
   GOOGLE FINAL CALCULATION PARAMS

   IMPORTANT:
   - No optimize:true.
   - Google calculates the route as provided.
   - Engine decides order locally by lowest miles.
===================================================== */

function buildNormalDirectionsParams(cleanPoints){

  const origin =
    cleanPoints[0];

  const destination =
    cleanPoints[cleanPoints.length - 1];

  const middle =
    cleanPoints.slice(1,-1);

  const params =
    new URLSearchParams();

  params.set("origin",origin.googleValue);
  params.set("destination",destination.googleValue);

  if(middle.length){

    params.set(
      "waypoints",
      middle.map(p=>p.googleValue).join("|")
    );
  }

  return {
    params,
    finalCleanPoints:cleanPoints,
    optimized:false,
    optimizeReason:"NO_GOOGLE_OPTIMIZE_LOWEST_MILES_ORDER_LOCKED",
    waypointSourcePoints:middle,
    finalDestination:destination
  };
}

/* =====================================================
   SERVER ROUTE CALCULATION
   Used on Confirm only

   IMPORTANT:
   - Google does NOT reorder.
   - Google only calculates miles/minutes/polyline.
   - This protects pricing because price is based on miles.
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
      routePoints:cleanPoints.map(p=>p.address),
      optimizedRoutePoints:cleanPoints.map(p=>p.address),
      googleRoute:{
        summary:"",
        waypointOrder:[],
        legs:[],
        optimized:false,
        optimizeReason:"NOT_ENOUGH_POINTS"
      }
    };
  }

  const requestPlan =
    buildNormalDirectionsParams(cleanPoints);

  const data =
    await googleDirectionsRequest(requestPlan.params);

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

    routePoints:
      cleanPoints.map(p=>p.address),

    optimizedRoutePoints:
      cleanPoints.map((point,index)=>({
        type:point.type,
        address:point.address,
        lat:point.lat,
        lng:point.lng,
        order:index + 1,
        passengerId:point.passengerId || "",
        passengerIndexes:point.passengerIndexes || [],
        group:point.group === true
      })),

    googleRoute:{
      summary:
        route.summary || "",

      waypointOrder:
        route.waypoint_order || [],

      optimized:false,

      optimizeReason:
        requestPlan.optimizeReason,

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
   SHARED ROUTE ORDERING BY COORDINATES
===================================================== */

function isPassengerActive(passenger){

  const status =
    compactStatus(passenger?.status);

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no show")
  );
}

function passengerId(passenger,index){
  return String(
    passenger?.passengerId ||
    passenger?._id ||
    passenger?.id ||
    index
  );
}

function pickupAddressOf(passenger){
  return normalizeAddress(
    passenger?.pickup ||
    passenger?.pickupAddress ||
    passenger?.pickupLocation ||
    passenger?.from ||
    ""
  );
}

function dropoffAddressOf(passenger){
  return normalizeAddress(
    passenger?.dropoff ||
    passenger?.dropoffAddress ||
    passenger?.dropoffLocation ||
    passenger?.to ||
    ""
  );
}

function makeSharedPoint(passenger,index,type){

  const pickup =
    pickupAddressOf(passenger);

  const dropoff =
    dropoffAddressOf(passenger);

  const isPickup =
    type === "pickup";

  const lat =
    isPickup
      ? passenger?.pickupLat ?? passenger?.pickupLatitude
      : passenger?.dropoffLat ?? passenger?.dropoffLatitude;

  const lng =
    isPickup
      ? passenger?.pickupLng ?? passenger?.pickupLongitude
      : passenger?.dropoffLng ?? passenger?.dropoffLongitude;

  const address =
    isPickup
      ? pickup
      : dropoff;

  return {
    type,
    address,
    lat:Number(lat),
    lng:Number(lng),
    passengerId:passengerId(passenger,index),
    passengerIndex:index,
    passengerName:
      passenger?.clientName ||
      passenger?.name ||
      "",
    phone:
      passenger?.clientPhone ||
      passenger?.phone ||
      ""
  };
}

function uniqueSharedPoints(points){

  const out = [];
  const seen = new Map();

  for(const point of safeArray(points)){

    const address =
      normalizeAddress(point?.address);

    if(!address){
      continue;
    }

    if(!hasValidLatLng(point?.lat,point?.lng)){
      throw new Error(
        "Missing coordinates for shared " +
        point.type +
        ": " +
        address
      );
    }

    const key =
      point.type + "|" + addressKey(address);

    if(seen.has(key)){

      const existing =
        seen.get(key);

      existing.passengerIndexes =
        Array.from(
          new Set([
            ...(existing.passengerIndexes || []),
            point.passengerId
          ])
        );

      existing.group = true;
      continue;
    }

    const cleanPoint = {
      ...point,
      address,
      lat:Number(point.lat),
      lng:Number(point.lng),
      passengerIndexes:[point.passengerId],
      group:false
    };

    seen.set(key,cleanPoint);
    out.push(cleanPoint);
  }

  return out;
}

function allSameAddress(points){

  const list =
    safeArray(points);

  if(list.length <= 1){
    return true;
  }

  const first =
    addressKey(list[0]?.address);

  return list.every(point=>{
    return addressKey(point?.address) === first;
  });
}

function detectSharedRouteCase(pickups,dropoffs){

  const samePickup =
    allSameAddress(pickups);

  const sameDropoff =
    allSameAddress(dropoffs);

  if(samePickup && sameDropoff){
    return "SAME_PICKUP_SAME_DROPOFF";
  }

  if(samePickup && !sameDropoff){
    return "SAME_PICKUP_DIFFERENT_DROPOFF";
  }

  if(!samePickup && sameDropoff){
    return "DIFFERENT_PICKUP_SAME_DROPOFF";
  }

  return "DIFFERENT_PICKUP_DIFFERENT_DROPOFF";
}

function stableSortPoints(points){

  return [...safeArray(points)]
    .sort((a,b)=>{
      const addressDiff =
        stableText(a.address).localeCompare(
          stableText(b.address)
        );

      if(addressDiff !== 0){
        return addressDiff;
      }

      return String(a.passengerId || "").localeCompare(
        String(b.passengerId || "")
      );
    });
}

function nearestPointFrom(current,candidates){

  let best = null;
  let bestMiles = Number.MAX_SAFE_INTEGER;

  const sorted =
    stableSortPoints(candidates);

  for(const point of sorted){

    const miles =
      distanceMiles(current,point);

    if(miles < bestMiles - 0.000001){
      best = point;
      bestMiles = miles;
      continue;
    }

    if(Math.abs(miles - bestMiles) <= 0.000001 && best){

      const textA =
        stableText(point.address);

      const textB =
        stableText(best.address);

      if(textA < textB){
        best = point;
        bestMiles = miles;
      }
    }
  }

  return best;
}

function nearestNeighborOrder(startPoint,points){

  const remaining =
    stableSortPoints(points);

  const ordered = [];
  let current = startPoint;

  while(remaining.length){

    const next =
      nearestPointFrom(current,remaining);

    if(!next){
      break;
    }

    ordered.push(next);

    const index =
      remaining.findIndex(point=>{
        return (
          point.type === next.type &&
          addressKey(point.address) === addressKey(next.address)
        );
      });

    if(index >= 0){
      remaining.splice(index,1);
    }else{
      break;
    }

    current = next;
  }

  return ordered;
}

function totalAirMiles(points){

  const list =
    safeArray(points);

  let total = 0;

  for(let i = 1; i < list.length; i++){
    total += distanceMiles(list[i - 1],list[i]);
  }

  return total;
}

function routeTieKey(points){
  return safeArray(points)
    .map(point=>`${point.type}:${stableText(point.address)}`)
    .join(">");
}

function chooseBestRoute(candidates){

  let best = null;
  let bestMiles = Number.MAX_SAFE_INTEGER;
  let bestTie = "";

  for(const route of safeArray(candidates)){

    const miles =
      totalAirMiles(route);

    const tie =
      routeTieKey(route);

    if(miles < bestMiles - 0.000001){
      best = route;
      bestMiles = miles;
      bestTie = tie;
      continue;
    }

    if(Math.abs(miles - bestMiles) <= 0.000001){

      if(!best || tie < bestTie){
        best = route;
        bestMiles = miles;
        bestTie = tie;
      }
    }
  }

  return {
    route:best || [],
    miles:bestMiles === Number.MAX_SAFE_INTEGER ? 0 : bestMiles
  };
}

function orderPickupsThenDropoffs(pickups,dropoffs,routeCase){

  if(routeCase === "SAME_PICKUP_SAME_DROPOFF"){

    return {
      orderedPickups:[pickups[0]],
      orderedDropoffs:[dropoffs[0]],
      strategy:"SAME_PICKUP_SAME_DROPOFF"
    };
  }

  if(routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF"){

    const startPickup =
      pickups[0];

    /*
      IMPORTANT:
      Shared ordering is by lowest miles, not lowest time.
      Do NOT use Google optimize:true.
      Google optimize may choose faster but longer routes.
    */

    return {
      orderedPickups:[startPickup],
      orderedDropoffs:nearestNeighborOrder(startPickup,dropoffs),
      strategy:"SAME_PICKUP_DROPOFFS_BY_LOWEST_MILES_LOCAL"
    };
  }

  if(routeCase === "DIFFERENT_PICKUP_SAME_DROPOFF"){

    const commonDropoff =
      dropoffs[0];

    const candidates =
      stableSortPoints(pickups).map(startPickup=>{

        const otherPickups =
          pickups.filter(point=>{
            return addressKey(point.address) !== addressKey(startPickup.address);
          });

        const orderedPickups = [
          startPickup,
          ...nearestNeighborOrder(startPickup,otherPickups)
        ];

        return [
          ...orderedPickups,
          commonDropoff
        ];
      });

    const best =
      chooseBestRoute(candidates);

    return {
      orderedPickups:best.route.filter(point=>point.type === "pickup"),
      orderedDropoffs:[commonDropoff],
      strategy:"BEST_PICKUP_CHAIN_TO_COMMON_DROPOFF",
      estimatedAirMiles:Number(best.miles.toFixed(3))
    };
  }

  /*
    DIFFERENT_PICKUP_DIFFERENT_DROPOFF

    Important:
    - All pickups first.
    - No dropoff before all pickups.
    - Try every pickup as possible start.
    - After start, nearest-neighbor through remaining pickups.
    - After last pickup, nearest-neighbor through dropoffs.
    - Pick lowest total air-mile route.
    - Ties are stable by address, so route does not randomly change.
  */

  const candidates =
    stableSortPoints(pickups).map(startPickup=>{

      const otherPickups =
        pickups.filter(point=>{
          return addressKey(point.address) !== addressKey(startPickup.address);
        });

      const orderedPickups = [
        startPickup,
        ...nearestNeighborOrder(startPickup,otherPickups)
      ];

      const lastPickup =
        orderedPickups[orderedPickups.length - 1];

      const orderedDropoffs =
        nearestNeighborOrder(lastPickup,dropoffs);

      return [
        ...orderedPickups,
        ...orderedDropoffs
      ];
    });

  const best =
    chooseBestRoute(candidates);

  return {
    orderedPickups:best.route.filter(point=>point.type === "pickup"),
    orderedDropoffs:best.route.filter(point=>point.type === "dropoff"),
    strategy:"BEST_ALL_PICKUPS_THEN_NEAREST_DROPOFFS",
    estimatedAirMiles:Number(best.miles.toFixed(3))
  };
}

function makeRoutePlanPoint(point,order){

  const passengerIndexes =
    Array.isArray(point.passengerIndexes) && point.passengerIndexes.length
      ? point.passengerIndexes
      : [point.passengerId];

  return {
    type:point.type,
    address:normalizeAddress(point.address),
    lat:Number(point.lat),
    lng:Number(point.lng),
    order,
    passengerId:point.passengerId || "",
    passengerIndex:point.passengerIndex,
    passengerIndexes,
    passengerName:point.passengerName || "",
    phone:point.phone || "",
    group:point.group === true || passengerIndexes.length > 1
  };
}

function buildSharedRoutePlanFromPassengers(passengers){

  const activePassengers =
    safeArray(passengers)
      .filter(isPassengerActive)
      .filter(passenger=>{
        return (
          pickupAddressOf(passenger) &&
          dropoffAddressOf(passenger)
        );
      });

  if(activePassengers.length < 2){
    throw new Error("Shared route requires at least 2 active passengers");
  }

  const pickups =
    uniqueSharedPoints(
      activePassengers.map((passenger,index)=>{
        return makeSharedPoint(passenger,index,"pickup");
      })
    );

  const dropoffs =
    uniqueSharedPoints(
      activePassengers.map((passenger,index)=>{
        return makeSharedPoint(passenger,index,"dropoff");
      })
    );

  if(!pickups.length || !dropoffs.length){
    throw new Error("Shared route missing pickup/dropoff points");
  }

  const routeCase =
    detectSharedRouteCase(pickups,dropoffs);

  const ordered =
    orderPickupsThenDropoffs(
      pickups,
      dropoffs,
      routeCase
    );

  const orderedPoints = [
    ...ordered.orderedPickups,
    ...ordered.orderedDropoffs
  ];

  const routePlan =
    orderedPoints.map((point,index)=>{
      return makeRoutePlanPoint(point,index + 1);
    });

  const routePoints =
    routePlan.map(point=>({
      type:point.type,
      address:point.address,
      lat:point.lat,
      lng:point.lng,
      order:point.order,
      passengerId:point.passengerId,
      passengerIndexes:point.passengerIndexes,
      group:point.group
    }));

  return {
    isShared:true,
    routeCase,
    routePlan,
    sharedRoutePlan:routePlan,
    routePoints,
    addresses:routePlan.map(point=>point.address),
    activeCount:activePassengers.length,
    sharedStopsCount:Math.max(0,routePlan.length - 2),
    meta:{
      strategy:ordered.strategy,
      estimatedAirMiles:
        ordered.estimatedAirMiles ||
        Number(totalAirMiles(routePlan).toFixed(3)),
      orderedPickups:ordered.orderedPickups.map(point=>point.address),
      orderedDropoffs:ordered.orderedDropoffs.map(point=>point.address),
      googleFinalOptimize:false,
      rule:
        routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF"
          ? "SAME_PICKUP_DROPOFFS_BY_LOWEST_MILES_LOCAL_THEN_GOOGLE_CALCULATE"
          : "ALL_PICKUPS_FIRST_THEN_DROPOFFS_STABLE_NEAREST_NEIGHBOR"
    }
  };
}

/* =====================================================
   OPTIMIZE ADDRESS ORDER
   Backward compatible old helper.

   NOTE:
   Kept for old code paths.
   This function can still use Google optimize for non-shared old flows.
   Shared passenger routing should use buildSharedRoutePlanFromPassengers().
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

  const optionPoints =
    safeArray(options.points)
      .map(normalizeRoutePoint)
      .filter(Boolean)
      .filter(point=>hasValidLatLng(point.lat,point.lng));

  if(optionPoints.length === cleanAddresses.length){

    const startPoint =
      startAfter
        ? normalizeRoutePoint({
            address:startAfter,
            lat:options.startAfterLat,
            lng:options.startAfterLng
          })
        : optionPoints[0];

    const pointsToOrder =
      startAfter
        ? optionPoints
        : optionPoints.slice(1);

    const ordered =
      startAfter
        ? nearestNeighborOrder(startPoint,pointsToOrder)
        : [
            optionPoints[0],
            ...nearestNeighborOrder(optionPoints[0],pointsToOrder)
          ];

    return {
      orderedAddresses:ordered.map(point=>point.address),
      routePoints:ordered.map(point=>point.address),
      meta:{
        type,
        optimized:false,
        requestUsed:false,
        reason:"LOCAL_COORDINATE_NEAREST_NEIGHBOR",
        startAfter:startAfter || "",
        orderedPoints:ordered.map(point=>point.address)
      }
    };
  }

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

  optimizeAddressOrder,

  buildSharedRoutePlanFromPassengers,
  detectSharedRouteCase,
  distanceMiles
};