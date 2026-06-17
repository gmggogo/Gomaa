/* =========================================
FILE: company-add-stop.js
FINAL WORKING VERSION 🔥
✔ REAL Google Miles Calculation
✔ Correct Logic (Started / Not Started)
✔ UI Highlight Fixed
========================================= */

(function(){

/* ================= SECURITY ================= */

const token = localStorage.getItem("token") || "";
const role = localStorage.getItem("role") || "";

if(!token || role !== "company"){
  window.location.href = "/companies/company-login.html";
  return;
}

/* ================= CONFIG ================= */

let googleLoadPromise = null;

/* ================= UI FIX ================= */

(function(){

  const style = document.createElement("style");

  style.innerHTML = `
  .add-here-btn{
    width:100%;
    border:none;
    background:linear-gradient(135deg,#2563eb,#1d4ed8);
    color:#fff;
    padding:14px;
    border-radius:16px;
    font-size:14px;
    font-weight:900;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    box-shadow:0 10px 25px rgba(37,99,235,.35);
    transition:.2s;
  }
  .add-here-btn:hover{
    transform:scale(1.05);
  }
  .add-here-btn span{
    background:#fff;
    color:#1d4ed8;
    width:26px;
    height:26px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight:900;
  }
  `;

  document.head.appendChild(style);

})();

/* ================= HELPERS ================= */

function clean(v){
  return String(v ?? "").trim();
}

function getPickup(t){
  return clean(t.pickup || t.pickupAddress);
}

function getDropoff(t){
  return clean(t.dropoff || t.dropoffAddress);
}

function getStops(t){
  return Array.isArray(t.stops) ? t.stops : [];
}

function isTripStarted(trip){
  const s = String(trip.status || "").toLowerCase();
  return ["ontrip","started","inprogress","active"].includes(s);
}

/* ================= DRIVER ================= */

function getDriverLocation(trip){

  const lat =
    trip?.lat ||
    trip?.driverLat ||
    trip?.currentLat;

  const lng =
    trip?.lng ||
    trip?.driverLng ||
    trip?.currentLng;

  if(Number.isFinite(lat) && Number.isFinite(lng)){
    return { lat:Number(lat), lng:Number(lng) };
  }

  return null;
}

/* ================= GOOGLE LOAD ================= */

async function ensureGoogle(){

  if(window.google?.maps) return;

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async (resolve,reject)=>{

    try{

      const res = await fetch("/api/config");
      const data = await res.json();

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);

    }catch(err){
      reject(err);
    }

  });

  return googleLoadPromise;
}

/* ================= GOOGLE CALC ================= */

async function calculateRouteMiles(points){

  await ensureGoogle();

  const validPoints =
    points.filter(p => p && (typeof p === "string" || p.lat));

  if(validPoints.length < 2){
    return { miles:0 };
  }

  const origin = validPoints[0];
  const destination = validPoints[validPoints.length - 1];

  const waypoints =
    validPoints.slice(1,-1).map(p=>({
      location:p,
      stopover:true
    }));

  return new Promise((resolve,reject)=>{

    const service = new google.maps.DirectionsService();

    service.route({
      origin,
      destination,
      waypoints,
      travelMode:"DRIVING"
    },(res,status)=>{

      if(status !== "OK"){
        reject("Google route failed");
        return;
      }

      let meters = 0;

      res.routes[0].legs.forEach(l=>{
        meters += l.distance.value;
      });

      resolve({
        miles: Number((meters * 0.000621371).toFixed(2))
      });

    });

  });

}

/* ================= 🔥 FINAL LOGIC ================= */

async function calculateFinalRoute(trip, finalStops, finalDropoff){

  const pickup = getPickup(trip);
  const dropoff = finalDropoff || getDropoff(trip);
  const existingStops = getStops(trip);

  let originalPoints = [];
  let newPoints = [];

  if(!isTripStarted(trip)){

    /* BEFORE START */

    originalPoints = [
      pickup,
      ...existingStops,
      getDropoff(trip)
    ];

    newPoints = [
      pickup,
      ...finalStops,
      dropoff
    ];

  }else{

    /* 🔥 STARTED */

    const driver = getDriverLocation(trip);

    if(!driver){
      throw new Error("Driver location missing");
    }

    originalPoints = [
      pickup,
      driver,
      ...existingStops,
      getDropoff(trip)
    ];

    newPoints = [
      pickup,
      driver,
      ...finalStops,
      dropoff
    ];
  }

  const original = await calculateRouteMiles(originalPoints);
  const updated = await calculateRouteMiles(newPoints);

  return {
    originalMiles: original.miles,
    newMiles: updated.miles,
    extraMiles: Number((updated.miles - original.miles).toFixed(2)),
    originalPoints,
    newPoints
  };

}

/* ================= INIT ================= */

function init(){
  console.log("🔥 FINAL CLEAN VERSION READY");
}

init();

})();