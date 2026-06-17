/* =========================================
ROUTE MAP ENGINE (REAL TRACKING)
Accurate Path + Real Driven Miles
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
    Math.sin(dLat/2) ** 2 +
    Math.sin(dLng/2) ** 2 *
    Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(x),Math.sqrt(1-x));

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

/* ================= CORE ================= */

/* 🔥 UPDATE LOCATION (القلب الحقيقي) */

function updateLocation(tripId,lat,lng){

  if(!tripId) return;
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const trip = getTrip(tripId);

  const newPoint = {
    lat:Number(lat),
    lng:Number(lng),
    t:Date.now()
  };

  /* أول نقطة */
  if(!trip.last){
    trip.last = newPoint;
    trip.path.push(newPoint);
    return;
  }

  const dist = distanceMiles(trip.last,newPoint);

  /* تجاهل noise */
  if(dist < MIN_DISTANCE){
    return;
  }

  /* 🔥 إضافة المسافة */
  trip.miles += dist;

  trip.last = newPoint;
  trip.path.push(newPoint);

  /* تنظيف الذاكرة */
  if(trip.path.length > MAX_POINTS){
    trip.path.shift();
  }
}

/* ================= GETTERS ================= */

function getDrivenMiles(tripId){

  const trip = tripsMemory.get(tripId);
  if(!trip) return 0;

  return Number(trip.miles.toFixed(2));
}

function getLastLocation(tripId){

  const trip = tripsMemory.get(tripId);
  if(!trip) return null;

  return trip.last;
}

function getPath(tripId){

  const trip = tripsMemory.get(tripId);
  if(!trip) return [];

  return trip.path;
}

/* ================= RESET ================= */

function resetTrip(tripId){
  tripsMemory.delete(tripId);
}

/* ================= EXPORT ================= */

module.exports = {
  updateLocation,
  getDrivenMiles,
  getLastLocation,
  getPath,
  resetTrip
};