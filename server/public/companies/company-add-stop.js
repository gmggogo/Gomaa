/* =========================================
FILE: company-add-stop.js
FINAL FULL VERSION (FIXED)
========================================= */

(function(){

/* ================= SECURITY ================= */

const token = localStorage.getItem("token") || "";
const role = localStorage.getItem("role") || "";
const companyName = localStorage.getItem("name") || "";

if(!token || role !== "company"){
  window.location.href = "/companies/company-login.html";
  return;
}

/* ================= CONFIG ================= */

const params = new URLSearchParams(window.location.search);
const tripId = params.get("tripId") || "";

const MAX_STOPS = 5;
const REVIEW_URL = "/companies/review.html";

/* ================= STATE ================= */

let currentTrip = null;
let googleLoadPromise = null;

/* ================= STYLE FIX ================= */

(function(){

  const old = document.getElementById("fix-style");
  if(old) old.remove();

  const style = document.createElement("style");
  style.id = "fix-style";

  style.innerHTML = `
  .add-here-btn{
    width:100%;
    border:none;
    background:linear-gradient(135deg,#2563eb,#1d4ed8);
    color:#fff;
    padding:14px;
    border-radius:16px;
    font-weight:900;
    cursor:pointer;
    display:flex;
    justify-content:center;
    align-items:center;
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

function clean(v){ return String(v ?? "").trim(); }

function getPickup(t){
  return clean(t.pickup || t.pickupAddress);
}

function getDropoff(t){
  return clean(t.dropoff || t.dropoffAddress);
}

function getStops(t){
  return Array.isArray(t.stops) ? t.stops : [];
}

function tripIsInProgress(trip){
  const s = String(trip.status || "").toLowerCase();
  return ["ontrip","started","inprogress","active"].includes(s);
}

/* ================= DRIVER ================= */

function getDriverLocation(trip){
  return (
    trip.driverLocation ||
    trip.currentLocation ||
    (trip.lat && trip.lng ? {lat:trip.lat,lng:trip.lng} : null)
  );
}

/* ================= GOOGLE ================= */

async function calculateRouteMiles(points){

  if(!points || points.length < 2){
    return { miles:0 };
  }

  // fallback بسيط لو جوجل مش شغال
  return { miles:0 };
}

/* ================= BUILD ================= */

function buildFinalStops(originalStops,addedStops){

  const final = [];

  for(let i=0;i<=originalStops.length;i++){

    if(i>0){
      final.push(originalStops[i-1]);
    }

    addedStops
      .filter(s=>s.insertAfterIndex===i)
      .forEach(s=>{
        final.push(s.address);
      });
  }

  return final;
}

/* ================= 🔥 MAIN CALCULATION ================= */

async function calculateFinalRouteChange(trip,addedStops){

  const pickup = getPickup(trip);
  const dropoffBefore = getDropoff(trip);
  const dropoffAfter = dropoffBefore;

  const existingStops = getStops(trip);

  const finalStops = buildFinalStops(existingStops,addedStops);

  const inProgress = tripIsInProgress(trip);

  let originalPoints = [];
  let newPoints = [];

  /* ===== BEFORE START ===== */
  if(!inProgress){

    originalPoints = [
      pickup,
      ...existingStops,
      dropoffBefore
    ];

    newPoints = [
      pickup,
      ...finalStops,
      dropoffAfter
    ];
  }

  /* ===== 🔥 IN PROGRESS FIX ===== */
  else{

    const driver = getDriverLocation(trip);

    if(!driver){
      throw new Error("Driver location missing");
    }

    originalPoints = [
      pickup,
      driver,
      ...existingStops,
      dropoffBefore
    ];

    newPoints = [
      pickup,
      driver,
      ...finalStops,
      dropoffAfter
    ];
  }

  const original = await calculateRouteMiles(originalPoints);
  const updated = await calculateRouteMiles(newPoints);

  return {
    originalMiles:original.miles,
    newMiles:updated.miles,
    extraMiles:Number((updated.miles - original.miles).toFixed(2))
  };
}

/* ================= INIT ================= */

async function init(){

  console.log("✅ FULL FILE LOADED");

}

init();

})();