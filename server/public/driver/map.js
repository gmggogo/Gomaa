/* =====================================================
   DRIVER MAP ENGINE – FINAL
   مسؤول عن: GPS + Distance + Button Logic
===================================================== */

/* ===============================
   CONFIG (LOCKED)
================================ */
const DIST_PICKUP_SHOW_GO = 2.0;   // miles
const DIST_PICKUP_ARRIVED = 1.0;   // miles
const DIST_DROPOFF_ENABLE = 0.2;   // miles
const NO_SHOW_TIMER_MIN = 20;

/* ===============================
   TRIP DATA (EXAMPLE – هتجيلك من السيرفر)
================================ */
const Trip = {
  pickup: { lat: 33.4484, lng: -112.0740 },
  dropoff:{ lat: 33.4530, lng: -112.0800 }
};

/* ===============================
   STATE
================================ */
let state = "GOING_TO_PICKUP";
let timer = null;
let timerLeft = 0;

/* ===============================
   MAP INIT
================================ */
const map = L.map("map").setView(
  [Trip.pickup.lat, Trip.pickup.lng],
  13
);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

L.marker([Trip.pickup.lat, Trip.pickup.lng]).addTo(map);
L.marker([Trip.dropoff.lat, Trip.dropoff.lng]).addTo(map);

let driverMarker = null;

/* ===============================
   DISTANCE (HAVERSINE)
================================ */
function milesBetween(a, b){
  const R = 3958.8;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sa =
    Math.sin(dLat/2)**2 +
    Math.cos(a.lat*Math.PI/180) *
    Math.cos(b.lat*Math.PI/180) *
    Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

/* ===============================
   UI HELPERS (IDs ثابتة)
================================ */
const UI = {
  goPickup: document.getElementById("btnGoPickup"),
  arrived: document.getElementById("btnArrived"),
  start: document.getElementById("btnStart"),
  noShow: document.getElementById("btnNoShow"),
  dropoff: document.getElementById("btnDropoff"),
  notes: document.getElementById("noShowNotes"),
  complete: document.getElementById("btnComplete"),
  timer: document.getElementById("waitTimer"),

  hideAll(){
    Object.values(this).forEach(el=>{
      if(el && el.style) el.style.display = "none";
    });
  }
};

/* ===============================
   GPS UPDATE (CORE LOOP)
================================ */
navigator.geolocation.watchPosition(pos=>{
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  window.driverLat = lat;
  window.driverLng = lng;

  if(!driverMarker){
    driverMarker = L.marker([lat,lng]).addTo(map);
    map.setView([lat,lng], 14);
  }else{
    driverMarker.setLatLng([lat,lng]);
  }

  const dPickup = milesBetween({lat,lng}, Trip.pickup);
  const dDrop   = milesBetween({lat,lng}, Trip.dropoff);

  UI.hideAll();

  /* 1️⃣ بعيد عن Pickup */
  if(dPickup > DIST_PICKUP_SHOW_GO){
    state = "GOING_TO_PICKUP";
    UI.goPickup.style.display = "block";
    return;
  }

  /* 2️⃣ قريب من Pickup */
  if(dPickup <= DIST_PICKUP_ARRIVED && state !== "ARRIVED"){
    state = "NEAR_PICKUP";
    UI.arrived.style.display = "block";
    return;
  }

  /* 6️⃣ قريب من Dropoff */
  if(state === "IN_PROGRESS"){
    UI.dropoff.style.display =
      dDrop <= DIST_DROPOFF_ENABLE ? "block" : "none";
  }

});

/* ===============================
   BUTTON ACTIONS
================================ */
window.arrived = function(){
  if(state !== "NEAR_PICKUP") return;
  state = "ARRIVED";
  startNoShowTimer();
};

window.startTrip = function(){
  if(state !== "ARRIVED") return;
  clearInterval(timer);
  state = "IN_PROGRESS";
};

window.noShow = function(){
  if(state !== "ARRIVED") return;
  clearInterval(timer);
  state = "NO_SHOW";
  UI.notes.style.display = "block";
  UI.complete.style.display = "block";
};

window.completeNoShow = function(){
  if(!UI.notes.value.trim()) return alert("Reason required");
  state = "NO_SHOW_COMPLETED";
  UI.hideAll();
};

window.dropoff = function(){
  if(state !== "IN_PROGRESS") return;
  state = "COMPLETED";
  UI.hideAll();
};

/* ===============================
   TIMER
================================ */
function startNoShowTimer(){
  timerLeft = NO_SHOW_TIMER_MIN * 60;
  UI.timer.style.display = "block";

  timer = setInterval(()=>{
    timerLeft--;
    UI.timer.innerText = `${Math.floor(timerLeft/60)}:${timerLeft%60}`;

    if(timerLeft <= 0){
      clearInterval(timer);
      state = "NO_SHOW_COMPLETED";
      UI.hideAll();
    }
  },1000);
}