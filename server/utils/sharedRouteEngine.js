"use strict";

/* ==========================================================================
   SHARED ROUTE ENGINE
   Server-side shared route ordering engine

   RULE:
   1. Use saved coordinates only.
   2. Find closest pickup/dropoff pair.
   3. Build required virtual center between that pair.
   4. Order pickups from farthest to nearest from center.
   5. Order dropoffs from nearest to farthest from center.
   6. Final route = ordered pickups + ordered dropoffs.
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
  return normalizeAddress(value).toLowerCase();
}

function num(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRadians(value){
  return Number(value || 0) * Math.PI / 180;
}

function hasValidCoordinates(lat,lng){
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

function isActivePassenger(passenger){

  const status =
    clean(passenger?.status)
      .replace(/\s+/g,"")
      .toLowerCase();

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show") &&
    normalizeAddress(passenger?.pickup) &&
    normalizeAddress(passenger?.dropoff)
  );
}

/* =========================
   POINT BUILDERS
========================= */

function makePickupPoint(passenger,index){

  return {
    type:"pickup",
    address:normalizeAddress(passenger.pickup),
    lat:num(passenger.pickupLat),
    lng:num(passenger.pickupLng),
    passengerIndex:index,
    passengerId:passenger.passengerId || "",
    passengerName:passenger.clientName || passenger.name || ""
  };
}

function makeDropoffPoint(passenger,index){

  return {
    type:"dropoff",
    address:normalizeAddress(passenger.dropoff),
    lat:num(passenger.dropoffLat),
    lng:num(passenger.dropoffLng),
    passengerIndex:index,
    passengerId:passenger.passengerId || "",
    passengerName:passenger.clientName || passenger.name || ""
  };
}

function isValidRoutePoint(point){

  return (
    point &&
    normalizeAddress(point.address) &&
    hasValidCoordinates(point.lat,point.lng)
  );
}

function uniqueRoutePoints(points){

  const out = [];
  const seen = new Set();

  for(const point of points){

    if(!isValidRoutePoint(point)){
      continue;
    }

    const key =
      addressKey(point.address);

    if(seen.has(key)){
      continue;
    }

    seen.add(key);
    out.push(point);
  }

  return out;
}

/* =========================
   DISTANCE
========================= */

function distanceMilesBetweenRoutePoints(a,b){

  if(!isValidRoutePoint(a) || !isValidRoutePoint(b)){
    return Number.MAX_SAFE_INTEGER;
  }

  const radiusMiles = 3958.8;

  const lat1 =
    toRadians(a.lat);

  const lat2 =
    toRadians(b.lat);

  const dLat =
    toRadians(Number(b.lat) - Number(a.lat));

  const dLng =
    toRadians(Number(b.lng) - Number(a.lng));

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

/* =========================
   STEP 1
   REQUIRED VIRTUAL CENTER
========================= */

function buildRequiredVirtualCenter(pickupPoints,dropoffPoints){

  if(!Array.isArray(pickupPoints) || !pickupPoints.length){
    throw new Error("Shared route requires at least one pickup point.");
  }

  if(!Array.isArray(dropoffPoints) || !dropoffPoints.length){
    throw new Error("Shared route requires at least one dropoff point.");
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

        anchorMiles =
          miles;

        anchorPickup =
          pickup;

        anchorDropoff =
          dropoff;
      }
    }
  }

  if(!anchorPickup || !anchorDropoff){
    throw new Error("Could not build shared route virtual center. Missing coordinates.");
  }

  const center = {
    type:"virtual-center",
    address:"__VIRTUAL_SHARED_CENTER__",
    lat:(Number(anchorPickup.lat) + Number(anchorDropoff.lat)) / 2,
    lng:(Number(anchorPickup.lng) + Number(anchorDropoff.lng)) / 2
  };

  return {
    center,
    anchorPickup,
    anchorDropoff,
    anchorMiles
  };
}

/* =========================
   STEP 2
   CENTER ANCHOR
========================= */

function useVirtualCenterAsAnchor(centerResult){

  if(!centerResult || !isValidRoutePoint(centerResult.center)){
    throw new Error("Shared route virtual center is invalid.");
  }

  return centerResult.center;
}

/* =========================
   STEP 3
   PICKUP ORDER
   Farthest to nearest
========================= */

function orderPickupsFromCenter(pickupPoints,center){

  if(!isValidRoutePoint(center)){
    throw new Error("Shared route center is missing.");
  }

  return [...pickupPoints]
    .map((pickup,index)=>({

      ...pickup,

      distanceFromCenter:
        distanceMilesBetweenRoutePoints(
          pickup,
          center
        ),

      originalIndex:index
    }))
    .sort((a,b)=>{

      const diff =
        Number(b.distanceFromCenter || 0) -
        Number(a.distanceFromCenter || 0);

      if(diff !== 0){
        return diff;
      }

      return Number(a.originalIndex) - Number(b.originalIndex);
    });
}

/* =========================
   STEP 4
   DROPOFF ORDER
   Nearest to farthest
========================= */

function orderDropoffsFromCenter(dropoffPoints,center){

  if(!isValidRoutePoint(center)){
    throw new Error("Shared route center is missing.");
  }

  return [...dropoffPoints]
    .map((dropoff,index)=>({

      ...dropoff,

      distanceFromCenter:
        distanceMilesBetweenRoutePoints(
          dropoff,
          center
        ),

      originalIndex:index
    }))
    .sort((a,b)=>{

      const diff =
        Number(a.distanceFromCenter || 0) -
        Number(b.distanceFromCenter || 0);

      if(diff !== 0){
        return diff;
      }

      return Number(a.originalIndex) - Number(b.originalIndex);
    });
}

/* =========================
   PASSENGER ORDER
========================= */

function indexOfAddress(routePoints,address){

  const key =
    addressKey(address);

  return routePoints.findIndex(point=>{
    return addressKey(point) === key;
  });
}

function applyPassengerRouteOrders(passengers,routePoints){

  return passengers
    .map((passenger,index)=>{

      const active =
        isActivePassenger(passenger);

      if(!active){

        return {
          ...passenger,
          pickupOrder:9999,
          dropoffOrder:9999,
          routeOrder:9999
        };
      }

      const pickupIndex =
        indexOfAddress(
          routePoints,
          passenger.pickup
        );

      const dropoffIndex =
        indexOfAddress(
          routePoints,
          passenger.dropoff
        );

      return {
        ...passenger,

        pickupOrder:
          pickupIndex < 0
            ? 9999
            : pickupIndex + 1,

        dropoffOrder:
          dropoffIndex < 0
            ? 9999
            : dropoffIndex + 1,

        __originalIndex:index
      };
    })
    .sort((a,b)=>{

      const aActive =
        isActivePassenger(a);

      const bActive =
        isActivePassenger(b);

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

      const cleanPassenger =
        {...passenger};

      delete cleanPassenger.__originalIndex;

      return {
        ...cleanPassenger,
        routeOrder:index + 1
      };
    });
}

/* =========================
   MAIN ENGINE
========================= */

function buildSharedRouteFromSavedCoordinates(passengers,options = {}){

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
      throw new Error("Missing pickup coordinates for passenger: " + name);
    }

    if(!hasValidCoordinates(passenger.dropoffLat,passenger.dropoffLng)){
      throw new Error("Missing dropoff coordinates for passenger: " + name);
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

  const centerResult =
    buildRequiredVirtualCenter(
      pickupPoints,
      dropoffPoints
    );

  const center =
    useVirtualCenterAsAnchor(
      centerResult
    );

  const orderedPickups =
    orderPickupsFromCenter(
      pickupPoints,
      center
    );

  const orderedDropoffs =
    orderDropoffsFromCenter(
      dropoffPoints,
      center
    );

  const routePoints = [
    ...orderedPickups.map(point=>point.address),
    ...orderedDropoffs.map(point=>point.address)
  ];

  const finalRoutePoints =
    uniqueAddressListServer(routePoints);

  const orderedPassengers =
    applyPassengerRouteOrders(
      sourcePassengers,
      finalRoutePoints
    );

  const result = {
    success:true,

    routePoints:finalRoutePoints,

    passengers:orderedPassengers,

    activeCount:activePassengers.length,

    sharedStopsCount:
      Math.max(0,activePassengers.length - 1),

    anchorPickup:centerResult.anchorPickup,
    anchorDropoff:centerResult.anchorDropoff,
    anchorMiles:centerResult.anchorMiles,

    virtualCenter:center,

    orderedPickups,
    orderedDropoffs
  };

  if(options.debug === true){
    result.debug = {
      pickupPoints,
      dropoffPoints,
      routePoints:finalRoutePoints
    };
  }

  return result;
}

/* =========================
   SERVER UNIQUE ADDRESS LIST
========================= */

function uniqueAddressListServer(list){

  const out = [];
  const seen = new Set();

  for(const item of Array.isArray(list) ? list : []){

    const address =
      normalizeAddress(item);

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

/* =========================
   EXPORTS
========================= */

module.exports = {
  buildSharedRouteFromSavedCoordinates,

  buildRequiredVirtualCenter,
  useVirtualCenterAsAnchor,
  orderPickupsFromCenter,
  orderDropoffsFromCenter,

  distanceMilesBetweenRoutePoints,
  hasValidCoordinates,
  isActivePassenger
};