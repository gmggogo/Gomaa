// ================= AUTH =================
const driver = JSON.parse(localStorage.getItem("user") || "{}");
const DRIVER_ID = driver._id;
const DRIVER_NAME = driver.name || "Driver";

document.getElementById("driverName").innerText = DRIVER_NAME;

// ================= DOM =================
const btnGoPickup = document.getElementById("btnGoPickup");
const btnGoogle = document.getElementById("btnGoogle");
const btnStart = document.getElementById("btnStart");
const btnComplete = document.getElementById("btnComplete");
const btnNoShow = document.getElementById("btnNoShow");
const btnCall = document.getElementById("btnCall");
const btnCancel = document.getElementById("btnCancel");
const waitTimerEl = document.getElementById("waitTimer");
const navTextEl = document.getElementById("navText");

// ================= MAP =================
const map = L.map("map").setView([33.4484, -112.0740], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let routeControl = null;

// ================= STATE =================
let arrived = false;
let started = false;
let completed = false;

// ================= SAMPLE DATA =================
let pickupLat = 33.45;
let pickupLng = -112.07;
let dropLat = 33.46;
let dropLng = -112.06;

// ================= ROUTE =================
function drawRoute(lat,lng,toLat,toLng){
  if(routeControl) map.removeControl(routeControl);

  routeControl = L.Routing.control({
    waypoints:[
      L.latLng(lat,lng),
      L.latLng(toLat,toLng)
    ],
    createMarker:()=>null
  }).addTo(map);
}

// ================= GOOGLE =================
function openGoogle(){
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`);
}

// ================= TIMER =================
let timerInt=null;

function startTimer(){
  const tripTime = new Date(Date.now()+60000); // مثال

  function update(){
    const diff = Math.floor((tripTime - new Date())/1000);

    if(diff>0){
      waitTimerEl.innerText = diff+"s";
    }else{
      waitTimerEl.innerText = "WAITING";
      btnCall.style.display="block";
      btnCancel.style.display="block";
    }
  }

  timerInt=setInterval(update,1000);
}

// ================= GPS =================
navigator.geolocation.watchPosition(pos=>{
  const lat=pos.coords.latitude;
  const lng=pos.coords.longitude;

  drawRoute(lat,lng,pickupLat,pickupLng);

  const d = Math.sqrt((lat-pickupLat)**2 + (lng-pickupLng)**2);

  if(!arrived){
    navTextEl.innerText="On the way";

    if(d<=0.01){
      arrived=true;

      btnStart.style.display="block";
      btnNoShow.style.display="block";
      waitTimerEl.style.display="block";

      startTimer();

      navTextEl.innerText="Arrived";
    }
  }

  if(started){
    drawRoute(lat,lng,dropLat,dropLng);

    const d2 = Math.sqrt((lat-dropLat)**2 + (lng-dropLng)**2);

    if(d2<=0.01){
      btnComplete.style.display="block";
    }
  }

});

// ================= BUTTONS =================
btnGoPickup.onclick=()=>openGoogle();
btnGoogle.onclick=()=>openGoogle();

btnStart.onclick=()=>{
  started=true;
  btnStart.style.display="none";
  btnNoShow.style.display="none";
  navTextEl.innerText="Go to dropoff";
};

btnComplete.onclick=()=>{
  alert("Trip Completed");
  location.href="/driver/trips.html";
};

btnNoShow.onclick=()=>{
  document.getElementById("noShowBox").style.display="block";
};

btnCall.onclick=()=>{
  alert("Calling...");
};

btnCancel.onclick=()=>{
  alert("Closed");
};