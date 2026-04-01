/* ================= INIT ================= */

const mapEl = document.getElementById("map");

const tripId = mapEl.dataset.tripId;

const pickup = [
Number(mapEl.dataset.pickupLat),
Number(mapEl.dataset.pickupLng)
];

const dropoff = [
Number(mapEl.dataset.dropoffLat),
Number(mapEl.dataset.dropoffLng)
];

let map = L.map("map").setView(pickup, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let driverMarker = null;
let routeControl = null;

/* ================= STATE ================= */

let arrived = false;
let started = false;

/* ================= UI ================= */

const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnDrop = document.getElementById("btnDropoff");
const btnNoShow = document.getElementById("btnNoShow");
const btnGoogle = document.getElementById("btnGoogle");
const navText = document.getElementById("navText");
const timerEl = document.getElementById("waitTimer");

/* ================= TIMER ================= */

let timer;
let seconds = 900;

function startTimer(){
seconds = 900;
timerEl.style.display = "block";

timer = setInterval(()=>{
seconds--;
let m=Math.floor(seconds/60);
let s=seconds%60;
timerEl.innerText=`${m}:${s<10?"0":""}${s}`;

if(seconds<=0){
clearInterval(timer);
btnNoShow.style.display="none";
}
},1000);
}

function stopTimer(){
clearInterval(timer);
timerEl.style.display="none";
}

/* ================= ROUTE ================= */

function drawRoute(fromLat, fromLng, toLat, toLng){

console.log("ROUTE:", fromLat, fromLng, "→", toLat, toLng);

if(routeControl){
try{ map.removeControl(routeControl); }catch(e){}
routeControl = null;
}

routeControl = L.Routing.control({

waypoints:[
L.latLng(fromLat, fromLng),
L.latLng(toLat, toLng)
],

/* 🔥 ده أهم سطر */
router: L.Routing.osrmv1({
serviceUrl: "https://router.project-osrm.org/route/v1"
}),

addWaypoints:false,
routeWhileDragging:false,
draggableWaypoints:false,
fitSelectedRoutes:true,
showAlternatives:false,

lineOptions:{
styles:[{color:"#2563eb",weight:6}]
}

}).addTo(map);

}

/* ================= DIST ================= */

function dist(lat,lng,point){
let R=3958.8;
let dLat=(point[0]-lat)*Math.PI/180;
let dLon=(point[1]-lng)*Math.PI/180;

let a=Math.sin(dLat/2)**2+
Math.cos(lat*Math.PI/180)*
Math.cos(point[0]*Math.PI/180)*
Math.sin(dLon/2)**2;

return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

/* ================= GPS ================= */

navigator.geolocation.watchPosition((pos)=>{

const lat = pos.coords.latitude;
const lng = pos.coords.longitude;

if(!driverMarker){

driverMarker = L.marker([lat,lng]).addTo(map);

/* 🔥 هنا الحل */
drawRoute(lat, lng, pickup[0], pickup[1]);

navText.innerText = "Go to pickup";

}else{
driverMarker.setLatLng([lat,lng]);
}

map.setView([lat,lng],15);

let dPickup = dist(lat,lng,pickup);
let dDrop = dist(lat,lng,dropoff);

/* BEFORE ARRIVED */
if(!arrived && !started){
if(dPickup < 0.1){
btnArrived.style.display="block";
navText.innerText="Press ARRIVED";
}
}

/* AFTER START */
if(started){

btnDrop.style.display="block";

if(dDrop < 0.1){
navText.innerText="Press DROP OFF";
}else{
navText.innerText="Go to dropoff";
}

}

},()=>alert("Enable GPS"),{
enableHighAccuracy:true
});

/* ================= BUTTONS ================= */

btnArrived.onclick=()=>{
arrived=true;
btnArrived.style.display="none";
btnStart.style.display="block";
btnNoShow.style.display="block";
startTimer();
};

btnStart.onclick=async()=>{

started=true;

btnStart.style.display="none";
btnNoShow.style.display="none";
stopTimer();

const pos = driverMarker.getLatLng();

/* 🔥 مهم */
drawRoute(
pos.lat,
pos.lng,
dropoff[0],
dropoff[1]
);

await updateStatus("InProgress");
};

btnDrop.onclick=async()=>{
await updateStatus("Completed");
alert("Trip Completed");
};

btnNoShow.onclick=async()=>{
await updateStatus("NoShow");
alert("No Show");
};

/* ================= SERVER ================= */

async function updateStatus(status){
await fetch(`/api/trips/${tripId}`,{
method:"PUT",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({status})
});
}

/* ================= GOOGLE ================= */

btnGoogle.onclick=()=>{
window.open(
`https://www.google.com/maps/dir/?api=1&destination=${pickup[0]},${pickup[1]}`
);
};

/* ================= FIX ================= */

setTimeout(()=>{
map.invalidateSize();
},800);