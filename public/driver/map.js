// ===============================
// AUTH CHECK (DRIVER)
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "/driver/login.html";

let driver = {};
try { driver = JSON.parse(rawDriver); }
catch { location.href = "/driver/login.html"; }

const DRIVER_NAME = driver.name || driver.username || "Driver";

// ===============================
// MAP INIT (UBER STYLE)
// ===============================
const map = L.map("map", { zoomControl:false, attributionControl:false }).setView([0,0], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom:19
}).addTo(map);

let driverMarker = null;
let firstFix = true;

// ===============================
// SEND LIVE LOCATION TO SERVER
// ===============================
async function sendLiveLocation(lat, lng){
  try{
    await fetch("/api/driver/location", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ name: DRIVER_NAME, lat, lng })
    });
  }catch(e){
    console.error("Live location error", e);
  }
}

// ===============================
// GPS TRACKING
// ===============================
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (!driverMarker)
        driverMarker = L.marker([lat,lng]).addTo(map);
      else
        driverMarker.setLatLng([lat,lng]);

      if (firstFix){
        map.setView([lat,lng],16);
        firstFix = false;
      }

      sendLiveLocation(lat,lng);
    },
    err => alert("Enable location services"),
    { enableHighAccuracy:true, maximumAge:1000, timeout:10000 }
  );
}

// ===============================
// TRIP BUTTON POLICY
// ===============================
const btnGo       = document.getElementById("btnGoPickup");
const btnArrived  = document.getElementById("btnArrived");
const btnStart    = document.getElementById("btnStart");
const btnNoShow   = document.getElementById("btnNoShow");
const btnDropoff  = document.getElementById("btnDropoff");
const noShowBox   = document.getElementById("noShowBox");
const btnComplete = document.getElementById("btnComplete");
const timerEl     = document.getElementById("waitTimer");

let waitInterval = null;
let waitSeconds  = 1200; // 20 minutes

function resetButtons(){
  btnGo.style.display = "none";
  btnArrived.style.display = "none";
  btnStart.style.display = "none";
  btnNoShow.style.display = "none";
  btnDropoff.style.display = "none";
  noShowBox.style.display = "none";
  timerEl.style.display = "none";
  if(waitInterval) clearInterval(waitInterval);
}

function showGo(){
  resetButtons();
  btnGo.style.display = "block";
}

function goToPickup(){
  btnGo.style.display = "none";
  btnArrived.style.display = "block";
}

function arrived(){
  btnArrived.style.display = "none";
  btnStart.style.display = "block";
  btnNoShow.style.display = "block";

  timerEl.style.display = "block";
  waitSeconds = 1200;

  waitInterval = setInterval(()=>{
    waitSeconds--;
    const min = Math.floor(waitSeconds/60);
    const sec = waitSeconds%60;
    timerEl.innerText =
      `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;

    if(waitSeconds <= 0){
      clearInterval(waitInterval);
      btnNoShow.style.display = "none";
    }
  },1000);
}

function startTrip(){
  btnStart.style.display = "none";
  btnNoShow.style.display = "none";
  timerEl.style.display = "none";
  clearInterval(waitInterval);

  btnDropoff.style.display = "block";
  btnDropoff.classList.add("enabled");
}

function dropoff(){
  alert("Trip Completed");
  resetButtons();
}

function noShow(){
  noShowBox.style.display = "block";
}

function completeNoShow(){
  const notes = document.getElementById("noShowNotes").value.trim();
  if(!notes){
    alert("Please enter reason");
    return;
  }

  alert("No Show Completed");
  resetButtons();
}

// ===============================
// AUTO SIMULATION (لما تيجي رحلة)
// ===============================
setTimeout(()=>{
  showGo();
},2000);