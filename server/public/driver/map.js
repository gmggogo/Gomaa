/* =====================================================
   SUNBEAM DRIVER MAP – COMPLETE FINAL (FIXED TIMER)
===================================================== */

console.log("Sunbeam driver map final loaded");

/* ================= AUTH ================= */
const rawDriver =
  localStorage.getItem("loggedDriver") ||
  localStorage.getItem("user");

if (!rawDriver) {
  window.location.href = "/driver/login.html";
}

let driver = JSON.parse(rawDriver);
const DRIVER_ID = String(driver._id || driver.id || "");
const DRIVER_NAME = driver.name || driver.username || "Driver";

/* ================= DOM ================= */
const btnGoPickup = document.getElementById("btnGoPickup");
const btnGoDropoff = document.getElementById("btnGoDropoff");
const btnGoogle = document.getElementById("btnGoogle");
const btnStart = document.getElementById("btnStart");
const btnCallClient = document.getElementById("btnCallClient");
const btnNoShow = document.getElementById("btnNoShow");
const btnComplete = document.getElementById("btnComplete");

const waitTimerEl = document.getElementById("waitTimer");

const noShowBox = document.getElementById("noShowBox");
const btnCloseNoShow = document.getElementById("btnCloseNoShow");
const noShowNotes = document.getElementById("noShowNotes");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");

/* ================= STATE ================= */
let driverLat, driverLng;
let pickupLat, pickupLng, dropLat, dropLng;

let arrived = false;
let started = false;
let completed = false;
let noShowDone = false;
let calledClient = false;

/* 🔥 TIMER FIX */
let timerStartTime = null;
let waitInterval = null;

/* ================= MAP ================= */
let map = L.map("map").setView([33.45, -112.07], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let driverMarker = L.marker([33.45, -112.07]).addTo(map);
let route;

/* ================= HELPERS ================= */
function show(el){ if(el) el.style.display="block"; }
function hide(el){ if(el) el.style.display="none"; }

function resetUI(){
  hide(btnGoPickup);
  hide(btnGoDropoff);
  hide(btnGoogle);
  hide(btnStart);
  hide(btnCallClient);
  hide(btnNoShow);
  hide(btnComplete);
  hide(noShowBox);
}

function draw(a,b,c,d){
  if(route) map.removeControl(route);

  route = L.Routing.control({
    waypoints:[L.latLng(a,b),L.latLng(c,d)],
    addWaypoints:false,
    show:false,
    createMarker:()=>null
  }).addTo(map);
}

function dist(a,b,c,d){
  let R=3958;
  let dLat=(c-a)*Math.PI/180;
  let dLon=(d-b)*Math.PI/180;
  let x=Math.sin(dLat/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*(2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)));
}

/* ================= TIMER ================= */
function startTimer(){

  if(!timerStartTime){
    timerStartTime = Date.now();
    localStorage.setItem("timerStart", timerStartTime);
  }

  show(waitTimerEl);

  if(waitInterval) clearInterval(waitInterval);

  waitInterval = setInterval(()=>{

    let elapsed = Math.floor((Date.now() - timerStartTime)/1000);
    let remaining = 900 - elapsed;

    if(remaining <= 0){
      waitTimerEl.innerText = "TIME UP";

      clearInterval(waitInterval);

      hide(btnStart);
      hide(btnNoShow);
      show(btnCallClient);
      return;
    }

    let m=Math.floor(remaining/60);
    let s=remaining%60;

    waitTimerEl.innerText =
      `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

  },1000);
}

function loadTimer(){
  let saved = localStorage.getItem("timerStart");
  if(saved){
    timerStartTime = parseInt(saved);
    startTimer();
  }
}

function stopTimer(){
  if(waitInterval) clearInterval(waitInterval);
  timerStartTime = null;
  localStorage.removeItem("timerStart");
}

/* ================= GPS ================= */
navigator.geolocation.watchPosition(pos=>{

  driverLat = pos.coords.latitude;
  driverLng = pos.coords.longitude;

  driverMarker.setLatLng([driverLat, driverLng]);

  let dPickup = dist(driverLat,driverLng,pickupLat,pickupLng);
  let dDrop = dist(driverLat,driverLng,dropLat,dropLng);

  /* BEFORE ARRIVED */
  if(!arrived){

    draw(driverLat,driverLng,pickupLat,pickupLng);

    resetUI();
    show(btnGoPickup);
    show(btnGoogle);

    if(dPickup <= 0.5){
      arrived = true;

      resetUI();
      show(btnStart);
      show(btnNoShow);

      startTimer();
    }

    return;
  }

  /* WAITING */
  if(arrived && !started){

    draw(pickupLat,pickupLng,dropLat,dropLng);

    resetUI();
    show(btnStart);
    show(btnNoShow);

    return;
  }

  /* STARTED */
  if(started){

    draw(driverLat,driverLng,dropLat,dropLng);

    resetUI();
    show(btnGoDropoff);
    show(btnGoogle);

    if(dDrop <= 0.1){
      show(btnComplete);
    }
  }

});

/* ================= BUTTONS ================= */

btnGoogle.onclick = ()=>{
  let dest = started ? `${dropLat},${dropLng}` : `${pickupLat},${pickupLng}`;
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLng}&destination=${dest}`);
};

btnStart.onclick = ()=>{
  let elapsed = Math.floor((Date.now()-timerStartTime)/1000);

  if(elapsed >= 900 && !calledClient){
    alert("Call client first");
    return;
  }

  started = true;
};

btnCallClient.onclick = ()=>{
  calledClient = true;
  hide(btnCallClient);
  show(btnStart);
  show(btnNoShow);
};

btnNoShow.onclick = ()=>{
  hide(btnStart);
  hide(btnNoShow);
  show(noShowBox);
};

btnCloseNoShow.onclick = ()=>{
  hide(noShowBox);
  show(btnStart);
  show(btnNoShow);
};

btnCompleteNoShow.onclick = ()=>{
  if(!noShowNotes.value) return alert("Enter reason");
  alert("No Show Completed");
};

btnComplete.onclick = ()=>{
  alert("Trip Completed");
};

/* ================= INIT ================= */
loadTimer();