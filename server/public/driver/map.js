/* =====================================================
   SUNBEAM DRIVER MAP – UBER STYLE POLICY
===================================================== */

/* ===============================
   AUTH CHECK
================================ */
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "/driver/login.html";

let driver = {};
try { driver = JSON.parse(rawDriver); }
catch { location.href = "/driver/login.html"; }

const DRIVER_ID = driver.id;
const DRIVER_NAME = driver.name || driver.username;

/* ===============================
   MAP INIT
================================ */
const mapEl = document.getElementById("map");

const pickupLat = parseFloat(mapEl.dataset.pickupLat);
const pickupLng = parseFloat(mapEl.dataset.pickupLng);
const dropLat   = parseFloat(mapEl.dataset.dropoffLat);
const dropLng   = parseFloat(mapEl.dataset.dropoffLng);

const map = L.map("map").setView([pickupLat, pickupLng], 14);

L.tileLayer(
 "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
 { maxZoom:19 }
).addTo(map);

let driverMarker = null;
let pickupMarker = L.marker([pickupLat,pickupLng]).addTo(map);
let dropMarker   = L.marker([dropLat,dropLng]).addTo(map);

/* ===============================
   BUTTONS
================================ */
const btnGo      = document.getElementById("btnGoPickup");
const btnArrived = document.getElementById("btnArrived");
const btnStart   = document.getElementById("btnStart");
const btnNoShow  = document.getElementById("btnNoShow");
const btnDropoff = document.getElementById("btnDropoff");

const noShowBox  = document.getElementById("noShowBox");
const timerEl    = document.getElementById("waitTimer");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");

/* ===============================
   DISTANCE CALC (MILES)
================================ */
function distanceMiles(lat1, lon1, lat2, lon2){

const R = 3958.8;

const dLat = (lat2-lat1)*Math.PI/180;
const dLon = (lon2-lon1)*Math.PI/180;

const a =
Math.sin(dLat/2)*Math.sin(dLat/2)+
Math.cos(lat1*Math.PI/180)*
Math.cos(lat2*Math.PI/180)*
Math.sin(dLon/2)*Math.sin(dLon/2);

const c = 2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

return R*c;
}

/* ===============================
   SEND LOCATION
================================ */
async function sendLocation(lat,lng){

try{

await fetch("/api/driver/location",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({
driverId:DRIVER_ID,
name:DRIVER_NAME,
lat,
lng
})
});

}catch(e){ console.log(e); }

}

/* ===============================
   WAIT TIMER (15 MIN)
================================ */
let waitInterval = null;
let waitSeconds  = 900;

function startTimer(){

timerEl.style.display="block";
waitSeconds = 900;

waitInterval=setInterval(()=>{

waitSeconds--;

const m=Math.floor(waitSeconds/60);
const s=waitSeconds%60;

timerEl.innerText=
`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

if(waitSeconds<=0){
clearInterval(waitInterval);
btnNoShow.style.display="none";
}

},1000);

}

/* ===============================
   RESET BUTTONS
================================ */
function resetButtons(){

btnGo.style.display="none";
btnArrived.style.display="none";
btnStart.style.display="none";
btnNoShow.style.display="none";
btnDropoff.style.display="none";

}

/* ===============================
   BUTTON EVENTS
================================ */
btnGo.onclick = ()=>{
btnGo.style.display="none";
btnArrived.style.display="block";
};

btnArrived.onclick = ()=>{
btnArrived.style.display="none";
btnStart.style.display="block";
btnNoShow.style.display="block";
startTimer();
};

btnStart.onclick = ()=>{
btnStart.style.display="none";
btnNoShow.style.display="none";
timerEl.style.display="none";
clearInterval(waitInterval);
btnDropoff.style.display="block";
};

btnDropoff.onclick = ()=>{
alert("Trip Completed");
resetButtons();
};

btnNoShow.onclick = ()=>{
noShowBox.style.display="block";
};

btnCompleteNoShow.onclick = ()=>{
const notes=document.getElementById("noShowNotes").value.trim();
if(!notes) return alert("Enter reason");
alert("No Show Completed");
noShowBox.style.display="none";
resetButtons();
};

/* ===============================
   GPS TRACKING
================================ */
navigator.geolocation.watchPosition(

pos=>{

const lat=pos.coords.latitude;
const lng=pos.coords.longitude;

/* marker */

if(!driverMarker)
driverMarker=L.marker([lat,lng]).addTo(map);
else
driverMarker.setLatLng([lat,lng]);

map.setView([lat,lng],15);

/* send location */

sendLocation(lat,lng);

/* distance to pickup */

const dPickup = distanceMiles(lat,lng,pickupLat,pickupLng);
const dDrop   = distanceMiles(lat,lng,dropLat,dropLng);

/* POLICY */

if(dPickup<=2 && btnGo.style.display==="none")
btnGo.style.display="block";

if(dPickup<=0.1){
btnGo.style.display="none";
btnArrived.style.display="block";
}

if(btnDropoff.style.display==="block" && dDrop<=0.1){
btnDropoff.classList.add("enabled");
}

},

err=>alert("Enable GPS"),

{
enableHighAccuracy:true,
maximumAge:1000,
timeout:10000
}

);