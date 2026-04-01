/* ================= AUTH ================= */
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "/driver/login.html";

const driver = JSON.parse(rawDriver);

/* 🔥 مهم جدًا */
const DRIVER_ID = driver._id || driver.id;
const DRIVER_NAME = driver.name || driver.username;

/* ================= MAP ================= */
const mapEl = document.getElementById("map");

const pickupLat = Number(mapEl.dataset.pickupLat);
const pickupLng = Number(mapEl.dataset.pickupLng);

const dropLat = Number(mapEl.dataset.dropoffLat);
const dropLng = Number(mapEl.dataset.dropoffLng);

const map = L.map("map").setView([pickupLat, pickupLng], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

/* ================= STATE ================= */
let driverMarker = null;
let routeControl = null;

let arrived = false;
let started = false;
let routeMode = "pickup";

/* ================= ELEMENTS ================= */
const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnDrop = document.getElementById("btnDropoff");
const btnNoShow = document.getElementById("btnNoShow");
const btnGoogle = document.getElementById("btnGoogle");
const timerEl = document.getElementById("waitTimer");

/* ================= HELPERS ================= */
function show(el){ if(el) el.style.display="block"; }
function hide(el){ if(el) el.style.display="none"; }

/* ================= ROUTE ================= */
function drawRoute(fromLat, fromLng, toLat, toLng){

if(routeControl){
map.removeControl(routeControl);
}

routeControl = L.Routing.control({
waypoints:[
L.latLng(fromLat, fromLng),
L.latLng(toLat, toLng)
],
addWaypoints:false,
draggableWaypoints:false,
routeWhileDragging:false,
show:false,
createMarker:()=>null,
lineOptions:{
styles:[{color:"#2563eb",weight:6}]
}
}).addTo(map);

}

/* ================= SEND LOCATION (ADMIN LINK) ================= */
async function sendLocation(lat, lng){
try{
await fetch("/api/driver/location",{
method:"POST",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({
driverId: DRIVER_ID,
name: DRIVER_NAME,
lat,
lng,
time: Date.now()
})
});
}catch(e){
console.log("location error", e);
}
}

/* ================= TIMER ================= */
let timer, sec = 900;

function startTimer(){
sec = 900;
show(timerEl);

timer = setInterval(()=>{
sec--;
let m = Math.floor(sec/60);
let s = sec%60;
timerEl.innerText = `${m}:${s<10?"0":""}${s}`;

if(sec <= 0){
clearInterval(timer);
hide(btnNoShow);
}
},1000);
}

function stopTimer(){
clearInterval(timer);
hide(timerEl);
}

/* ================= GOOGLE ================= */
function openGoogle(){
const lat = window.driverLat;
const lng = window.driverLng;

if(routeMode === "pickup"){
window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${pickupLat},${pickupLng}`);
}else{
window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${dropLat},${dropLng}`);
}
}

btnGoogle.onclick = openGoogle;

/* ================= BUTTON FLOW ================= */

/* ARRIVED */
btnArrived.onclick = ()=>{
arrived = true;

hide(btnArrived);
show(btnStart);
show(btnNoShow);

startTimer();
};

/* START */
btnStart.onclick = ()=>{

started = true;
routeMode = "dropoff";

hide(btnStart);
hide(btnNoShow);
stopTimer();

/* 🔥 أهم نقطة */
const pos = driverMarker.getLatLng();
drawRoute(pos.lat, pos.lng, dropLat, dropLng);

show(btnDrop);
};

/* DROP */
btnDrop.onclick = async ()=>{
await updateStatus("Completed");
alert("Trip Completed");
};

/* NO SHOW */
btnNoShow.onclick = async ()=>{
await updateStatus("NoShow");
alert("No Show");
};

/* ================= GPS ================= */
navigator.geolocation.watchPosition((pos)=>{

const lat = pos.coords.latitude;
const lng = pos.coords.longitude;

/* save */
window.driverLat = lat;
window.driverLng = lng;

/* marker */
if(!driverMarker){
driverMarker = L.marker([lat,lng]).addTo(map);

/* 🔥 البداية */
drawRoute(lat, lng, pickupLat, pickupLng);

}else{
driverMarker.setLatLng([lat,lng]);
}

map.setView([lat,lng],15);

/* 🔥 ربط الأدمن */
sendLocation(lat, lng);

/* distance */
const dPickup = getDist(lat,lng,[pickupLat,pickupLng]);
const dDrop = getDist(lat,lng,[dropLat,dropLng]);

/* POLICY */

/* pickup */
if(!arrived && dPickup < 0.1){
show(btnArrived);
}

/* drop */
if(started){
show(btnDrop);

if(dDrop < 0.1){
btnDrop.classList.add("enabled");
}else{
btnDrop.classList.remove("enabled");
}
}

},{
enableHighAccuracy:true
});

/* ================= DIST ================= */
function getDist(lat,lng,p){
let R=3958.8;
let dLat=(p[0]-lat)*Math.PI/180;
let dLon=(p[1]-lng)*Math.PI/180;

let a=Math.sin(dLat/2)**2+
Math.cos(lat*Math.PI/180)*
Math.cos(p[0]*Math.PI/180)*
Math.sin(dLon/2)**2;

return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

/* ================= SERVER ================= */
async function updateStatus(status){
await fetch(`/api/trips/${mapEl.dataset.tripId}`,{
method:"PUT",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({status})
});
}