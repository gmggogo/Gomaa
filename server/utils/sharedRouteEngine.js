"use strict";

/* ==========================================================================
   FILE: server/utils/sharedRouteEngine.js
   SHARED ROUTE ENGINE
   Server-side shared route ordering engine

   STRICT RULE:
   - Every active shared passenger MUST have:
       pickup, pickupLat, pickupLng
       dropoff, dropoffLat, dropoffLng
   - This file does NOT geocode.
   - Geocode must happen before this engine is called.
   - If any active passenger has missing coordinates, this engine stops with
     a clear error message.

   ROUTE POLICY:
   - Pickups are always before dropoffs.
   - A virtual center is built from the closest pickup/dropoff pair.
   - Pickups are ordered farthest-to-nearest toward anchor pickup.
   - Dropoffs are ordered from the LAST pickup using nearest-neighbor chain.
   - Google is allowed to optimize pickups only where needed.
   - Google must NOT optimize dropoffs.
   - Google final request calculates miles/minutes/polyline with fixed order.
   - Requests:
       1) Same pickup + same dropoff       = 1 request
       2) Same pickup + different dropoffs = 1 request
       3) Different pickups + same dropoff = 1 request
       4) Different pickups + dropoffs     = 2 requests max
   ========================================================================== */

/* =========================
   BASIC HELPERS
========================= */

function clean(value){
  return String(value ?? "").trim();
}

function normalizeAddress(value){
  return clean(value).replace(/\s+/g," ").trim();
}

function addressKey(value){
  return normalizeAddress(value).toLowerCase().replace(/\s+/g," ").trim();
}

function num(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRadians(value){
  return Number(value || 0) * Math.PI / 180;
}

function round(value,digits = 2){

  const n = Number(value);

  if(!Number.isFinite(n)){
    return 0;
  }

  const m =
    Math.pow(10,digits);

  return Math.round(n * m) / m;
}

function hasValidCoordinates(lat,lng){
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

function statusKey(value){
  return clean(value)
    .replace(/\s+/g,"")
    .toLowerCase();
}

function isActivePassenger(passenger){

  const status =
    statusKey(passenger?.status);

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show") &&
    normalizeAddress(passenger?.pickup) &&
    normalizeAddress(passenger?.dropoff)
  );
}

function sameAddress(a,b){
  return addressKey(a) === addressKey(b);
}

function isValidRoutePoint(point){
  return (
    point &&
    normalizeAddress(point.address) &&
    hasValidCoordinates(point.lat,point.lng)
  );
}

function allSameAddress(points){

  const list =
    Array.isArray(points)
      ? points.filter(isValidRoutePoint)
      : [];

  if(list.length <= 1){
    return true;
  }

  const first =
    addressKey(list[0].address);

  return list.every(point=>{
    return addressKey(point.address) === first;
  });
}

/* =========================
   POINT BUILDERS
========================= */

function passengerStableIndex(passenger,index){

  const v =
    passenger?.passengerIndex ??
    passenger?.routeOrder ??
    passenger?.order ??
    index;

  const n =
    Number(v);

  return Number.isFinite(n) ? n : index;
}

function passengerName(passenger,index){
  return (
    passenger?.clientName ||
    passenger?.name ||
    passenger?.passengerName ||
    passenger?.passengerId ||
    `Passenger ${index + 1}`
  );
}

function passengerPhone(passenger){
  return (
    passenger?.clientPhone ||
    passenger?.phone ||
    passenger?.passengerPhone ||
    ""
  );
}

function makePickupPoint(passenger,index){

  return {
    type:"pickup",
    address:normalizeAddress(passenger.pickup),
    lat:num(passenger.pickupLat),
    lng:num(passenger.pickupLng),
    passengerIndex:passengerStableIndex(passenger,index),
    originalIndex:index,
    passengerId:passenger.passengerId || "",
    passengerName:passengerName(passenger,index),
    phone:passengerPhone(passenger)
  };
}

function makeDropoffPoint(passenger,index){

  return {
    type:"dropoff",
    address:normalizeAddress(passenger.dropoff),
    lat:num(passenger.dropoffLat),
    lng:num(passenger.dropoffLng),
    passengerIndex:passengerStableIndex(passenger,index),
    originalIndex:index,
    passengerId:passenger.passengerId || "",
    passengerName:passengerName(passenger,index),
    phone:passengerPhone(passenger)
  };
}

function pointToGoogleLocation(point){

  if(!isValidRoutePoint(point)){
    return normalizeAddress(point?.address);
  }

  return {
    lat:Number(point.lat),
    lng:Number(point.lng),
    address:normalizeAddress(point.address)
  };
}

function pointLabel(point){
  return normalizeAddress(point?.address);
}

/*
   Unique inside the same point type only.
   This is important because pickup and dropoff can have the same address.
*/
function uniqueRoutePoints(points){

  const out = [];
  const seen = new Set();

  for(const point of Array.isArray(points) ? points : []){

    if(!isValidRoutePoint(point)){
      continue;
    }

    const key = [
      clean(point.type).toLowerCase(),
      addressKey(point.address)
    ].join("|");

    if(seen.has(key)){

      const existing =
        out.find(p=>{
          return [
            clean(p.type).toLowerCase(),
            addressKey(p.address)
          ].join("|") === key;
        });

      if(existing){

        existing.passengerIndexes =
          Array.from(
            new Set([
              ...(existing.passengerIndexes || [existing.passengerIndex]),
              point.passengerIndex
            ])
          );

        existing.group = true;
      }

      continue;
    }

    seen.add(key);

    out.push({
      ...point,
      passengerIndexes:[point.passengerIndex],
      group:false
    });
  }

  return out;
}

/* =========================
   DISTANCE - SAVED COORDINATES
========================= */

function distanceMilesBetweenRoutePoints(a,b){

  if(!isValidRoutePoint(a) || !isValidRoutePoint(b)){
    return Number.MAX_SAFE_INTEGER;
  }

  const radiusMiles = 3958.8;

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const dLat = toRadians(Number(b.lat) - Number(a.lat));
  const dLng = toRadians(Number(b.lng) - Number(a.lng));

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c =
    2 * Math.atan2(
      Math.sqrt(h),
      Math.sqrt(1 - h)
    );

  return radiusMiles * c;
}

function sumRouteStraightMiles(points){

  const list =
    Array.isArray(points)
      ? points.filter(isValidRoutePoint)
      : [];

  let total = 0;

  for(let i = 0; i < list.length - 1; i++){
    total += distanceMilesBetweenRoutePoints(list[i],list[i + 1]);
  }

  return round(total,2);
}

/* =========================
   ANCHOR PAIR
========================= */

function buildRequiredVirtualCenter(pickupPoints,dropoffPoints){

  if(!Array.isArray(pickupPoints) || !pickupPoints.length){
    throw new Error("Shared route requires at least one pickup point with coordinates.");
  }

  if(!Array.isArray(dropoffPoints) || !dropoffPoints.length){
    throw new Error("Shared route requires at least one dropoff point with coordinates.");
  }

  let anchorPickup = null;
  let anchorDropoff = null;
  let anchorMiles = Number.MAX_SAFE_INTEGER;

  for(const pickup of pickupPoints){

    for(const dropoff of dropoffPoints){

      const miles =
        distanceMilesBetweenRoutePoints(
          pickup,
          dropoff
        );

      if(miles < anchorMiles){

        anchorMiles = miles;
        anchorPickup = pickup;
        anchorDropoff = dropoff;
      }
    }
  }

  if(!anchorPickup || !anchorDropoff){
    throw new Error("Could not build shared route anchor pair. Missing coordinates.");
  }

  const center = {
    type:"virtual-center",
    address:"__VIRTUAL_SHARED_CENTER__",
    lat:(Number(anchorPickup.lat) + Number(anchorDropoff.lat)) / 2,
    lng:(Number(anchorPickup.lng) + Number(anchorDropoff.lng)) / 2,
    passengerIndex:anchorPickup.passengerIndex
  };

  return {
    center,
    anchorPickup,
    anchorDropoff,
    anchorMiles
  };
}

/*
   Compatibility helper for old imports.
*/
function useVirtualCenterAsAnchor(centerResult){

  if(!centerResult || !isValidRoutePoint(centerResult.center)){
    throw new Error("Shared route virtual center is invalid.");
  }

  return centerResult.center;
}

/* =========================
   CHEAP ORDERING
========================= */

function orderPickupsFromCenter(pickupPoints,anchorPickup){

  if(!isValidRoutePoint(anchorPickup)){
    throw new Error("Shared route anchor pickup is missing.");
  }

  return [...pickupPoints]
    .map((pickup,index)=>({

      ...pickup,

      distanceFromAnchor:
        distanceMilesBetweenRoutePoints(
          pickup,
          anchorPickup
        ),

      distanceFromCenter:
        distanceMilesBetweenRoutePoints(
          pickup,
          anchorPickup
        ),

      originalIndex:
        Number.isFinite(Number(pickup.originalIndex))
          ? Number(pickup.originalIndex)
          : index
    }))
    .sort((a,b)=>{

      /*
         Farthest pickup first.
         Anchor pickup naturally becomes last.
      */
      const diff =
        Number(b.distanceFromAnchor || 0) -
        Number(a.distanceFromAnchor || 0);

      if(Math.abs(diff) > 0.000001){
        return diff;
      }

      return Number(a.originalIndex || 0) - Number(b.originalIndex || 0);
    })
    .map((point,index)=>({
      ...point,
      pickupOrder:index + 1,
      distanceFromAnchor:round(point.distanceFromAnchor,3),
      distanceFromCenter:round(point.distanceFromCenter,3)
    }));
}

/*
   Old helper kept for compatibility.
   New route policy uses orderDropoffsFromLastPickup().
*/
function orderDropoffsFromCenter(dropoffPoints,anchorDropoff){

  if(!isValidRoutePoint(anchorDropoff)){
    throw new Error("Shared route anchor dropoff is missing.");
  }

  return [...dropoffPoints]
    .map((dropoff,index)=>({

      ...dropoff,

      distanceFromAnchor:
        distanceMilesBetweenRoutePoints(
          dropoff,
          anchorDropoff
        ),

      distanceFromCenter:
        distanceMilesBetweenRoutePoints(
          dropoff,
          anchorDropoff
        ),

      originalIndex:
        Number.isFinite(Number(dropoff.originalIndex))
          ? Number(dropoff.originalIndex)
          : index
    }))
    .sort((a,b)=>{

      const diff =
        Number(a.distanceFromAnchor || 0) -
        Number(b.distanceFromAnchor || 0);

      if(Math.abs(diff) > 0.000001){
        return diff;
      }

      return Number(a.originalIndex || 0) - Number(b.originalIndex || 0);
    })
    .map((point,index)=>({
      ...point,
      dropoffOrder:index + 1,
      distanceFromAnchor:round(point.distanceFromAnchor,3),
      distanceFromCenter:round(point.distanceFromCenter,3)
    }));
}

/*
   NEW DROP-OFF POLICY:
   - Start from the LAST ordered pickup.
   - Pick the nearest dropoff.
   - Then from that dropoff pick the next nearest dropoff.
   - Continue until all dropoffs are ordered.

   This is more practical for the driver than ordering dropoffs from center.
*/
function orderDropoffsFromLastPickup(dropoffPoints,lastPickup){

  if(!isValidRoutePoint(lastPickup)){
    throw new Error("Shared route last pickup is missing.");
  }

  const remaining =
    (Array.isArray(dropoffPoints) ? dropoffPoints : [])
      .map((dropoff,index)=>({
        ...dropoff,
        originalIndex:
          Number.isFinite(Number(dropoff.originalIndex))
            ? Number(dropoff.originalIndex)
            : index
      }));

  const ordered = [];
  let currentPoint = lastPickup;

  while(remaining.length){

    let bestIndex = 0;
    let bestMiles = Number.MAX_SAFE_INTEGER;

    for(let i = 0; i < remaining.length; i++){

      const dropoff =
        remaining[i];

      const miles =
        distanceMilesBetweenRoutePoints(
          currentPoint,
          dropoff
        );

      if(
        miles < bestMiles ||
        (
          Math.abs(miles - bestMiles) <= 0.000001 &&
          Number(dropoff.originalIndex || 0) <
          Number(remaining[bestIndex]?.originalIndex || 0)
        )
      ){
        bestIndex = i;
        bestMiles = miles;
      }
    }

    const next =
      remaining.splice(bestIndex,1)[0];

    ordered.push({
      ...next,
      distanceFromAnchor:round(bestMiles,3),
      distanceFromPrevious:round(bestMiles,3)
    });

    currentPoint = next;
  }

  return ordered.map((point,index)=>({
    ...point,
    dropoffOrder:index + 1,
    distanceFromAnchor:
      Number.isFinite(Number(point.distanceFromAnchor))
        ? round(point.distanceFromAnchor,3)
        : undefined,
    distanceFromPrevious:
      Number.isFinite(Number(point.distanceFromPrevious))
        ? round(point.distanceFromPrevious,3)
        : undefined
  }));
}

function farthestPointFrom(points,target){

  let best = null;
  let bestMiles = -1;

  for(const point of Array.isArray(points) ? points : []){

    const miles =
      distanceMilesBetweenRoutePoints(
        point,
        target
      );

    if(miles > bestMiles){
      best = point;
      bestMiles = miles;
    }
  }

  return best;
}

function nearestPointFrom(points,target){

  let best = null;
  let bestMiles = Number.MAX_SAFE_INTEGER;

  for(const point of Array.isArray(points) ? points : []){

    const miles =
      distanceMilesBetweenRoutePoints(
        point,
        target
      );

    if(miles < bestMiles){
      best = point;
      bestMiles = miles;
    }
  }

  return best;
}

/* =========================
   ROUTE PLAN
========================= */

function makeRoutePlanPoint(point,type,order){

  const passengerIndexes =
    Array.isArray(point.passengerIndexes) && point.passengerIndexes.length
      ? point.passengerIndexes
      : [point.passengerIndex];

  return {
    type,
    address:point.address,
    lat:point.lat,
    lng:point.lng,

    passengerIndex:point.passengerIndex,
    passengerIndexes,

    passengerId:point.passengerId || "",
    passengerName:point.passengerName || "",
    phone:point.phone || "",

    group:
      point.group === true ||
      passengerIndexes.length > 1,

    order,

    pickupOrder:
      type === "pickup"
        ? order
        : undefined,

    dropoffOrder:
      type === "dropoff"
        ? order
        : undefined,

    distanceFromAnchor:
      Number.isFinite(Number(point.distanceFromAnchor))
        ? round(point.distanceFromAnchor,3)
        : undefined
  };
}

function buildRoutePlan(orderedPickups,orderedDropoffs){

  const routePlan = [];

  for(const pickup of orderedPickups){

    routePlan.push(
      makeRoutePlanPoint(
        pickup,
        "pickup",
        routePlan.length + 1
      )
    );
  }

  for(const dropoff of orderedDropoffs){

    routePlan.push(
      makeRoutePlanPoint(
        dropoff,
        "dropoff",
        routePlan.length + 1
      )
    );
  }

  return routePlan;
}

function routePointKey(type,address){

  return [
    clean(type).toLowerCase(),
    addressKey(address)
  ].join("|");
}

function findPointOrder(routePlan,type,address){

  const key =
    routePointKey(type,address);

  const index =
    routePlan.findIndex(point=>{
      return routePointKey(point.type,point.address) === key;
    });

  return index < 0 ? 9999 : index + 1;
}

/* =========================
   PASSENGER ORDER
========================= */

function applyPassengerRouteOrders(passengers,routePlan){

  return (Array.isArray(passengers) ? passengers : [])
    .map((passenger,index)=>{

      const active =
        isActivePassenger(passenger);

      if(!active){

        return {
          ...passenger,
          pickupOrder:9999,
          dropoffOrder:9999,
          routeOrder:9999,
          sharedRouteStatus:"inactive"
        };
      }

      const pickupOrder =
        findPointOrder(
          routePlan,
          "pickup",
          passenger.pickup
        );

      const dropoffOrder =
        findPointOrder(
          routePlan,
          "dropoff",
          passenger.dropoff
        );

      return {
        ...passenger,

        pickupOrder,
        dropoffOrder,

        sharedRouteStatus:"active",

        __originalIndex:index
      };
    })
    .sort((a,b)=>{

      const aActive = isActivePassenger(a);
      const bActive = isActivePassenger(b);

      if(aActive !== bActive){
        return aActive ? -1 : 1;
      }

      if(Number(a.pickupOrder) !== Number(b.pickupOrder)){
        return Number(a.pickupOrder) - Number(b.pickupOrder);
      }

      if(Number(a.dropoffOrder) !== Number(b.dropoffOrder)){
        return Number(a.dropoffOrder) - Number(b.dropoffOrder);
      }

      return Number(a.__originalIndex || 0) - Number(b.__originalIndex || 0);
    })
    .map((passenger,index)=>{

      const cleanPassenger = {...passenger};

      delete cleanPassenger.__originalIndex;

      return {
        ...cleanPassenger,
        routeOrder:index + 1
      };
    });
}

/* =========================
   GOOGLE DIRECTIONS WRAPPER
========================= */

/*
   The caller route should pass one of these:

   options.directions = async ({ origin, destination, waypoints, optimizeWaypoints }) => result

   OR

   options.getGoogleDirections = async ({ origin, destination, waypoints, optimizeWaypoints }) => result

   This engine does not import Google directly to avoid extra files and to keep it reusable.
*/

function getDirectionsFunction(options){

  if(typeof options?.directions === "function"){
    return options.directions;
  }

  if(typeof options?.getGoogleDirections === "function"){
    return options.getGoogleDirections;
  }

  if(typeof options?.googleDirections === "function"){
    return options.googleDirections;
  }

  return null;
}

function extractWaypointOrder(response){

  if(!response){
    return [];
  }

  if(Array.isArray(response.waypointOrder)){
    return response.waypointOrder.map(Number).filter(Number.isFinite);
  }

  if(Array.isArray(response.waypoint_order)){
    return response.waypoint_order.map(Number).filter(Number.isFinite);
  }

  const route =
    Array.isArray(response.routes)
      ? response.routes[0]
      : response.route;

  if(Array.isArray(route?.waypoint_order)){
    return route.waypoint_order.map(Number).filter(Number.isFinite);
  }

  if(Array.isArray(route?.waypointOrder)){
    return route.waypointOrder.map(Number).filter(Number.isFinite);
  }

  return [];
}

function extractLegs(response){

  if(Array.isArray(response?.legs)){
    return response.legs;
  }

  const route =
    Array.isArray(response?.routes)
      ? response.routes[0]
      : response?.route;

  if(Array.isArray(route?.legs)){
    return route.legs;
  }

  return [];
}

function extractPolyline(response){

  if(!response){
    return "";
  }

  if(typeof response.polyline === "string"){
    return response.polyline;
  }

  if(typeof response.overviewPolyline === "string"){
    return response.overviewPolyline;
  }

  if(typeof response.overview_polyline === "string"){
    return response.overview_polyline;
  }

  const route =
    Array.isArray(response.routes)
      ? response.routes[0]
      : response.route;

  if(typeof route?.overview_polyline?.points === "string"){
    return route.overview_polyline.points;
  }

  if(typeof route?.overviewPolyline?.points === "string"){
    return route.overviewPolyline.points;
  }

  return "";
}

function extractMiles(response){

  const direct =
    response?.miles ??
    response?.distanceMiles ??
    response?.totalMiles;

  if(Number.isFinite(Number(direct))){
    return round(Number(direct),2);
  }

  const meters =
    response?.meters ??
    response?.distanceMeters ??
    response?.totalMeters;

  if(Number.isFinite(Number(meters))){
    return round(Number(meters) / 1609.344,2);
  }

  const legs =
    extractLegs(response);

  let totalMeters = 0;

  for(const leg of legs){

    const value =
      leg?.distance?.value ??
      leg?.distanceMeters ??
      leg?.meters;

    if(Number.isFinite(Number(value))){
      totalMeters += Number(value);
    }
  }

  if(totalMeters > 0){
    return round(totalMeters / 1609.344,2);
  }

  return 0;
}

function extractMinutes(response){

  const direct =
    response?.minutes ??
    response?.durationMinutes ??
    response?.totalMinutes;

  if(Number.isFinite(Number(direct))){
    return Math.round(Number(direct));
  }

  const seconds =
    response?.seconds ??
    response?.durationSeconds ??
    response?.totalSeconds;

  if(Number.isFinite(Number(seconds))){
    return Math.round(Number(seconds) / 60);
  }

  const legs =
    extractLegs(response);

  let totalSeconds = 0;

  for(const leg of legs){

    const value =
      leg?.duration?.value ??
      leg?.durationSeconds ??
      leg?.seconds;

    if(Number.isFinite(Number(value))){
      totalSeconds += Number(value);
    }
  }

  if(totalSeconds > 0){
    return Math.round(totalSeconds / 60);
  }

  return 0;
}

async function callDirections(options,args,counter){

  const fn =
    getDirectionsFunction(options);

  if(!fn){
    return null;
  }

  counter.count += 1;

  const response =
    await fn({
      origin:pointToGoogleLocation(args.origin),
      destination:pointToGoogleLocation(args.destination),
      waypoints:(args.waypoints || []).map(pointToGoogleLocation),
      optimizeWaypoints:args.optimizeWaypoints === true,
      travelMode:args.travelMode || "DRIVING"
    });

  return response;
}

function applyWaypointOrder(waypoints,order){

  const list =
    Array.isArray(waypoints)
      ? [...waypoints]
      : [];

  if(!Array.isArray(order) || !order.length){
    return list;
  }

  const ordered = [];

  for(const idx of order){

    if(list[idx]){
      ordered.push(list[idx]);
    }
  }

  for(let i = 0; i < list.length; i++){

    if(!order.includes(i)){
      ordered.push(list[i]);
    }
  }

  return ordered;
}

/* =========================
   CASE DETECTION
========================= */

function getSharedRouteCase(pickupPoints,dropoffPoints){

  const pickupUnified =
    allSameAddress(pickupPoints);

  const dropoffUnified =
    allSameAddress(dropoffPoints);

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
   CASE BUILDERS WITHOUT GOOGLE
========================= */

function buildCandidateWithoutGoogle(pickupPoints,dropoffPoints){

  const centerResult =
    buildRequiredVirtualCenter(
      pickupPoints,
      dropoffPoints
    );

  const routeCase =
    getSharedRouteCase(
      pickupPoints,
      dropoffPoints
    );

  let orderedPickups = [];
  let orderedDropoffs = [];

  if(routeCase === "SAME_PICKUP_SAME_DROPOFF"){

    orderedPickups = [pickupPoints[0]];
    orderedDropoffs = [dropoffPoints[0]];
  }

  else if(routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF"){

    const pickup =
      pickupPoints[0];

    orderedPickups = [pickup];

    orderedDropoffs =
      orderDropoffsFromLastPickup(
        dropoffPoints,
        pickup
      );
  }

  else if(routeCase === "DIFFERENT_PICKUP_SAME_DROPOFF"){

    const dropoff =
      dropoffPoints[0];

    orderedPickups =
      [...pickupPoints]
        .map((pickup,index)=>({
          ...pickup,
          distanceFromAnchor:
            distanceMilesBetweenRoutePoints(
              pickup,
              dropoff
            ),
          originalIndex:index
        }))
        .sort((a,b)=>{

          const diff =
            Number(b.distanceFromAnchor || 0) -
            Number(a.distanceFromAnchor || 0);

          if(Math.abs(diff) > 0.000001){
            return diff;
          }

          return Number(a.originalIndex || 0) - Number(b.originalIndex || 0);
        });

    orderedDropoffs = [dropoff];
  }

  else {

    orderedPickups =
      orderPickupsFromCenter(
        pickupPoints,
        centerResult.anchorPickup
      );

    const lastPickup =
      orderedPickups[orderedPickups.length - 1];

    orderedDropoffs =
      orderDropoffsFromLastPickup(
        dropoffPoints,
        lastPickup
      );
  }

  const routePlan =
    buildRoutePlan(
      orderedPickups,
      orderedDropoffs
    );

  return {
    routeCase,
    centerResult,
    orderedPickups,
    orderedDropoffs,
    routePlan
  };
}

/* =========================
   GOOGLE REAL DIRECTIONS BUILDERS
========================= */

async function buildRouteWithGoogleDirections(pickupPoints,dropoffPoints,options = {}){

  const counter =
    {count:0};

  const fallback =
    buildCandidateWithoutGoogle(
      pickupPoints,
      dropoffPoints
    );

  const directionsFn =
    getDirectionsFunction(options);

  if(!directionsFn){

    return {
      ...fallback,
      googleRequestsUsed:0,
      calculationSource:"SAVED_COORDINATES_CANDIDATE_ONLY",
      miles:sumRouteStraightMiles(fallback.routePlan),
      minutes:0,
      polyline:"",
      directionsResponse:null
    };
  }

  const routeCase =
    fallback.routeCase;

  let orderedPickups =
    fallback.orderedPickups;

  let orderedDropoffs =
    fallback.orderedDropoffs;

  let finalResponse = null;

  /* =========================
     CASE 1
     Same pickup + same dropoff
     1 request
  ========================= */

  if(routeCase === "SAME_PICKUP_SAME_DROPOFF"){

    finalResponse =
      await callDirections(
        options,
        {
          origin:pickupPoints[0],
          destination:dropoffPoints[0],
          waypoints:[],
          optimizeWaypoints:false
        },
        counter
      );

    orderedPickups = [pickupPoints[0]];
    orderedDropoffs = [dropoffPoints[0]];
  }

  /* =========================
     CASE 2
     Same pickup + different dropoffs
     1 request
     Origin is pickup. Optimize dropoffs only.
  ========================= */

  else if(routeCase === "SAME_PICKUP_DIFFERENT_DROPOFF"){

    const groupPickup =
      pickupPoints[0];

    orderedPickups = [groupPickup];

    /*
       Dropoffs are NOT optimized by Google.
       They must go:
       pickup -> nearest dropoff -> nearest from previous -> ...
    */
    orderedDropoffs =
      orderDropoffsFromLastPickup(
        dropoffPoints,
        groupPickup
      );

    const finalPoints = [
      ...orderedPickups,
      ...orderedDropoffs
    ];

    finalResponse =
      await callDirections(
        options,
        {
          origin:finalPoints[0],
          destination:finalPoints[finalPoints.length - 1],
          waypoints:finalPoints.slice(1,-1),
          optimizeWaypoints:false
        },
        counter
      );
  }

  /* =========================
     CASE 3
     Different pickups + same dropoff
     1 request
     Optimize pickups only.
  ========================= */

  else if(routeCase === "DIFFERENT_PICKUP_SAME_DROPOFF"){

    const groupDropoff =
      dropoffPoints[0];

    const startPickup =
      farthestPointFrom(
        pickupPoints,
        groupDropoff
      ) || pickupPoints[0];

    const waypoints =
      pickupPoints.filter(point=>{
        return addressKey(point.address) !== addressKey(startPickup.address);
      });

    finalResponse =
      await callDirections(
        options,
        {
          origin:startPickup,
          destination:groupDropoff,
          waypoints,
          optimizeWaypoints:true
        },
        counter
      );

    const waypointOrder =
      extractWaypointOrder(finalResponse);

    orderedPickups = [
      startPickup,
      ...applyWaypointOrder(
        waypoints,
        waypointOrder
      )
    ];

    orderedDropoffs = [groupDropoff];
  }

  /* =========================
     CASE 4
     Different pickups + different dropoffs
     2 requests max

     Request 1:
       Optimize pickups only:
       farthest pickup -> anchor pickup

     Dropoffs:
       NO Google optimization.
       Use nearest-neighbor chain:
       LAST pickup -> nearest dropoff -> nearest dropoff from previous.

     Request 2:
       Final route with fixed order:
       all pickups first, then all dropoffs
  ========================= */

  else {

    const anchorPickup =
      fallback.centerResult.anchorPickup;

    const pickupStart =
      farthestPointFrom(
        pickupPoints,
        anchorPickup
      ) || orderedPickups[0];

    const pickupWaypoints =
      pickupPoints.filter(point=>{
        return addressKey(point.address) !== addressKey(pickupStart.address) &&
               addressKey(point.address) !== addressKey(anchorPickup.address);
      });

    const pickupResponse =
      await callDirections(
        options,
        {
          origin:pickupStart,
          destination:anchorPickup,
          waypoints:pickupWaypoints,
          optimizeWaypoints:true
        },
        counter
      );

    orderedPickups = [
      pickupStart,
      ...applyWaypointOrder(
        pickupWaypoints,
        extractWaypointOrder(pickupResponse)
      ),
      anchorPickup
    ];

    const lastPickup =
      orderedPickups[orderedPickups.length - 1];

    /*
       IMPORTANT:
       Do NOT let Google optimize dropoffs in case 4.

       Dropoff order must be:
       Last pickup
       -> nearest dropoff
       -> nearest dropoff from that dropoff
       -> nearest dropoff from that dropoff
       -> ...

       Google is used only in the final request to calculate miles/minutes
       using this fixed order.
    */
    orderedDropoffs =
      orderDropoffsFromLastPickup(
        dropoffPoints,
        lastPickup
      );

    const finalPoints = [
      ...orderedPickups,
      ...orderedDropoffs
    ];

    finalResponse =
      await callDirections(
        options,
        {
          origin:finalPoints[0],
          destination:finalPoints[finalPoints.length - 1],
          waypoints:finalPoints.slice(1,-1),
          optimizeWaypoints:false
        },
        counter
      );
  }

  const routePlan =
    buildRoutePlan(
      orderedPickups,
      orderedDropoffs
    );

  return {
    routeCase,
    centerResult:fallback.centerResult,
    orderedPickups,
    orderedDropoffs,
    routePlan,

    googleRequestsUsed:counter.count,
    calculationSource:"GOOGLE_DIRECTIONS_REAL_ROUTE",

    miles:extractMiles(finalResponse),
    minutes:extractMinutes(finalResponse),
    polyline:extractPolyline(finalResponse),

    directionsResponse:
      options.keepDirectionsResponse === true
        ? finalResponse
        : null
  };
}

/* =========================
   SERVER UNIQUE ADDRESS LIST
   Compatibility only.
   routePlan is the safe source.
========================= */

function uniqueAddressListServer(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const address =
      typeof item === "string"
        ? normalizeAddress(item)
        : normalizeAddress(item?.address);

    if(!address){
      continue;
    }

    const type =
      typeof item === "string"
        ? ""
        : clean(item?.type).toLowerCase();

    const key =
      type
        ? `${type}|${addressKey(address)}`
        : addressKey(address);

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(address);
  }

  return out;
}

/* =========================
   INPUT VALIDATION
========================= */

function validatePassengersForSharedRoute(passengers){

  const sourcePassengers =
    Array.isArray(passengers)
      ? passengers
      : [];

  const activePassengers =
    sourcePassengers.filter(isActivePassenger);

  if(!activePassengers.length){
    throw new Error("Shared route requires active passengers.");
  }

  for(const passenger of activePassengers){

    const name =
      passenger.clientName ||
      passenger.name ||
      passenger.passengerId ||
      "";

    if(!normalizeAddress(passenger.pickup)){
      throw new Error("Missing pickup address for passenger: " + name);
    }

    if(!normalizeAddress(passenger.dropoff)){
      throw new Error("Missing dropoff address for passenger: " + name);
    }

    if(!hasValidCoordinates(passenger.pickupLat,passenger.pickupLng)){
      throw new Error(
        "Missing pickup coordinates for passenger: " +
        name +
        " | address: " +
        normalizeAddress(passenger.pickup)
      );
    }

    if(!hasValidCoordinates(passenger.dropoffLat,passenger.dropoffLng)){
      throw new Error(
        "Missing dropoff coordinates for passenger: " +
        name +
        " | address: " +
        normalizeAddress(passenger.dropoff)
      );
    }
  }

  const pickupPoints =
    uniqueRoutePoints(
      activePassengers.map(makePickupPoint)
    );

  const dropoffPoints =
    uniqueRoutePoints(
      activePassengers.map(makeDropoffPoint)
    );

  if(!pickupPoints.length || !dropoffPoints.length){
    throw new Error("Shared route points could not be built. Missing coordinates.");
  }

  return {
    sourcePassengers,
    activePassengers,
    pickupPoints,
    dropoffPoints
  };
}

/* =========================
   MAIN SYNC ENGINE
   Backward compatible.
   No Google request.
========================= */

function buildSharedRouteFromSavedCoordinates(passengers,options = {}){

  const {
    sourcePassengers,
    activePassengers,
    pickupPoints,
    dropoffPoints
  } =
    validatePassengersForSharedRoute(passengers);

  const candidate =
    buildCandidateWithoutGoogle(
      pickupPoints,
      dropoffPoints
    );

  const routePlan =
    candidate.routePlan;

  const finalRoutePoints =
    uniqueAddressListServer(routePlan);

  const orderedPassengers =
    applyPassengerRouteOrders(
      sourcePassengers,
      routePlan
    );

  const result = {
    success:true,

    routeCase:candidate.routeCase,
    mode:candidate.routeCase,

    routePlan,
    routePoints:finalRoutePoints,

    passengers:orderedPassengers,

    activeCount:activePassengers.length,

    sharedStopsCount:
      Math.max(0,routePlan.length - 2),

    anchorPickup:candidate.centerResult.anchorPickup,
    anchorDropoff:candidate.centerResult.anchorDropoff,
    anchorMiles:round(candidate.centerResult.anchorMiles,3),

    virtualCenter:candidate.centerResult.center,

    orderedPickups:candidate.orderedPickups,
    orderedDropoffs:candidate.orderedDropoffs,

    miles:sumRouteStraightMiles(routePlan),
    minutes:0,
    polyline:"",

    googleRequestsUsed:0,
    calculationSource:"SAVED_COORDINATES_CANDIDATE_ONLY"
  };

  if(options.debug === true){
    result.debug = {
      pickupPoints,
      dropoffPoints,
      routePoints:finalRoutePoints,
      routePlan
    };
  }

  return result;
}

/* =========================
   MAIN ASYNC ENGINE
   Real Directions if caller provides directions function.
========================= */

async function buildSharedRouteWithDirections(passengers,options = {}){

  const {
    sourcePassengers,
    activePassengers,
    pickupPoints,
    dropoffPoints
  } =
    validatePassengersForSharedRoute(passengers);

  const real =
    await buildRouteWithGoogleDirections(
      pickupPoints,
      dropoffPoints,
      options
    );

  const routePlan =
    real.routePlan;

  const finalRoutePoints =
    uniqueAddressListServer(routePlan);

  const orderedPassengers =
    applyPassengerRouteOrders(
      sourcePassengers,
      routePlan
    );

  const result = {
    success:true,

    routeCase:real.routeCase,
    mode:real.routeCase,

    routePlan,
    routePoints:finalRoutePoints,

    passengers:orderedPassengers,

    activeCount:activePassengers.length,

    sharedStopsCount:
      Math.max(0,routePlan.length - 2),

    anchorPickup:real.centerResult.anchorPickup,
    anchorDropoff:real.centerResult.anchorDropoff,
    anchorMiles:round(real.centerResult.anchorMiles,3),

    virtualCenter:real.centerResult.center,

    orderedPickups:real.orderedPickups,
    orderedDropoffs:real.orderedDropoffs,

    miles:round(real.miles,2),
    minutes:Math.round(Number(real.minutes || 0)),
    polyline:real.polyline || "",

    googleRequestsUsed:real.googleRequestsUsed,
    calculationSource:real.calculationSource,

    directionsResponse:real.directionsResponse || null
  };

  if(options.debug === true){
    result.debug = {
      pickupPoints,
      dropoffPoints,
      routePoints:finalRoutePoints,
      routePlan,
      googleRequestsUsed:real.googleRequestsUsed,
      calculationSource:real.calculationSource
    };
  }

  return result;
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  buildSharedRouteFromSavedCoordinates,
  buildSharedRouteWithDirections,

  buildRequiredVirtualCenter,
  useVirtualCenterAsAnchor,

  orderPickupsFromCenter,
  orderDropoffsFromCenter,
  orderDropoffsFromLastPickup,

  distanceMilesBetweenRoutePoints,
  hasValidCoordinates,
  isActivePassenger,

  uniqueAddressListServer,
  uniqueRoutePoints,

  extractMiles,
  extractMinutes,
  extractPolyline,
  extractWaypointOrder
};