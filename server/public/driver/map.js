// ===============================
// AUTH CHECK (DRIVER)
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "/driver/login.html";

let driver = {};
try {
  driver = JSON.parse(rawDriver);
} catch {
  location.href = "/driver/login.html";
}

const DRIVER_NAME = driver.name || driver.username || "Driver";

// ===============================
// MAP INIT (UBER STYLE)
// ===============================
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false
}).setView([0, 0], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ===============================
// DRIVER MARKER
// ===============================
let driverMarker = null;
let firstFix = true;

// ===============================
// SAVE LIVE LOCATION (ADMIN SOURCE)
// ===============================
function saveLiveLocation(lat, lng){
  let liveDrivers = {};

  try {
    liveDrivers = JSON.parse(
      localStorage.getItem("driversLive") || "{}"
    );
  } catch {
    liveDrivers = {};
  }

  liveDrivers[DRIVER_NAME] = {
    name: DRIVER_NAME,
    lat: lat,
    lng: lng,
    updated: Date.now(),
    status: tripStatus
  };

  localStorage.setItem(
    "driversLive",
    JSON.stringify(liveDrivers)
  );
}

// ===============================
// GPS TRACKING (REAL)
// ===============================
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (!driverMarker) {
        driverMarker = L.marker([lat, lng]).addTo(map);
      } else {
        driverMarker.setLatLng([lat, lng]);
      }

      if (firstFix) {
        map.setView([lat, lng], 16);
        firstFix = false;
      }

      saveLiveLocation(lat, lng);
    },
    err => {
      console.error("GPS error:", err);
      alert("Please enable location services");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
} else {
  alert("Geolocation not supported");
}

// =====================================================
// =============== TRIP BUTTON POLICY ==================
// =====================================================

let tripStatus = "idle"; 
// idle → going → arrived → started → completed → noshow

const btnGo      = document.getElementById("btnGoPickup");
const btnArrived = document.getElementById("btnArrived");
const btnStart   = document.getElementById("btnStart");
const btnNoShow  = document.getElementById("btnNoShow");
const btnDropoff = document.getElementById("btnDropoff");
const btnComplete = document.getElementById("btnComplete");
const noShowBox  = document.getElementById("noShowBox");
const timerEl    = document.getElementById("waitTimer");

function resetButtons(){
  btnGo.style.display = "none";
  btnArrived.style.display = "none";
  btnStart.style.display = "none";
  btnNoShow.style.display = "none";
  btnDropoff.style.display = "none";
  noShowBox.style.display = "none";
  timerEl.style.display = "none";
}

// ===============================
// START FLOW
// ===============================
function loadTrip(){
  resetButtons();
  btnGo.style.display = "block";
  tripStatus = "idle";
}

loadTrip();

// ===============================
function goToPickup(){
  resetButtons();
  btnArrived.style.display = "block";
  tripStatus = "going";
}

// ===============================
let waitTimerInterval = null;
let waitSeconds = 1200; // 20 minutes

function arrived(){
  resetButtons();
  btnStart.style.display = "block";
  btnNoShow.style.display = "block";
  timerEl.style.display = "block";

  tripStatus = "arrived";

  waitSeconds = 1200;

  waitTimerInterval = setInterval(()=>{
    waitSeconds--;
    let min = Math.floor(waitSeconds/60);
    let sec = waitSeconds%60;
    timerEl.innerText =
      `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;

    if(waitSeconds <= 0){
      clearInterval(waitTimerInterval);
    }
  },1000);
}

// ===============================
function startTrip(){
  resetButtons();
  btnDropoff.style.display = "block";
  btnDropoff.classList.add("enabled");

  tripStatus = "started";
  clearInterval(waitTimerInterval);
}

// ===============================
function dropoff(){
  tripStatus = "completed";
  resetButtons();
  alert("Trip Completed");
}

// ===============================
function noShow(){
  noShowBox.style.display = "block";
  tripStatus = "noshow";
}

// ===============================
function completeNoShow(){
  const notes = document.getElementById("noShowNotes").value.trim();
  if(!notes){
    alert("Reason required");
    return;
  }

  tripStatus = "completed";
  resetButtons();
  alert("No Show Completed");
}