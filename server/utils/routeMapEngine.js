/* =========================================
ROUTE MAP ENGINE
Real Tracking + Server Google Route Calculation
========================================= */

const tripsMemory = new Map();

/* ================= CONFIG ================= */

const MIN_DISTANCE = 0.002; // ~10 meters
const MAX_POINTS = 2000;

/* ================= HELPERS ================= */

function toRad(v){
  return (v * Math.PI) / 180;
}

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
   SERVER ROUTE CALCULATION
   Used by dispatchReservedConfirmRoutes
   Calculates miles/minutes using Google Directions API
===================================================== */

async function calculateRouteMiles(routePoints){

  const fetchFn =
    global.fetch ||
    require("node-fetch");

  const cleanPoints =
    Array.isArray(routePoints)
      ? routePoints
          .map(v => String(v || "").trim())
          .filter(Boolean)
      : [];

  if(cleanPoints.length < 2){

    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };

  }

  const googleKey =
    process.env.GOOGLE_KEY ||
    process.env.GOOGLE_MAPS_KEY ||
    "";

  if(!googleKey){
    throw new Error("Google key missing on server");
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
  params.set("mode","driving");
  params.set("units","imperial");
  params.set("key",googleKey);

  if(middle.length){

    params.set(
      "waypoints",
      middle.join("|")
    );

  }

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
    !data.routes ||
    !data.routes[0]
  ){

    throw new Error(
      "Google route failed: " +
      (data.status || res.status)
    );

  }

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
      Number(leg.distance?.value || 0);

    seconds +=
      Number(leg.duration?.value || 0);

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

      legs:
        legs.map((leg,index)=>({

          legIndex:index,

          startAddress:
            leg.start_address || "",

          endAddress:
            leg.end_address || "",

          distanceText:
            leg.distance?.text || "",

          distanceMeters:
            Number(leg.distance?.value || 0),

          durationText:
            leg.duration?.text || "",

          durationSeconds:
            Number(leg.duration?.value || 0)

        }))
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

  calculateRouteMiles
};