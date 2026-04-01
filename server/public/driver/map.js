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

/* MAP */
const map = L.map("map").setView(pickup,14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let driverMarker = null;
let routeLine = null;

/* STATE */
let arrived = false;
let started = false;

/* ELEMENTS */
const navText = document.getElementById("navText");
const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnDrop = document.getElementById("btnDrop");
const btnNoShow = document.getElementById("btnNoShow");
const btnGoogle = document.getElementById("btnGoogle");
const timerEl = document.getElementById("timer");

/* ================= ROUTE ================= */

async function drawRoute(from,to){

if(routeLine){
map.removeLayer(routeLine);
}

try{

const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;

const res = await fetch(url);
const data = await res.json();

if(!data.routes || !data.routes.length) return;

const coords = data.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);

routeLine = L.polyline(coords,{
color:"#2563eb",
weight:6
}).addTo(map);

map.fitBounds(routeLine.getBounds());

}catch(e){
console.log("ROUTE ERROR",e);
}

}

/* ================= TIMER ================= */

let sec = 900;
let timer;

function startTimer(){
sec = 900;
timerEl.style.display="block";

timer = setInterval(()=>{
sec--;
let m=Math.floor(sec/60);
let s=sec%60;
timerEl.innerText=`${m}:${s<10?"0":""}${s}`;

if(sec<=0){
clearInterval(timer);
btnNoShow.style.display="none";
}
},1000);
}

function stopTimer(){
clearInterval(timer);
timerEl.style.display="none";
}

/* ================= GPS ================= */

navigator.geolocation.watchPosition((pos)=>{

const lat = pos.coords.latitude;
const lng = pos.coords.longitude;

if(!driverMarker){
driverMarker = L.marker([lat,lng]).addTo(map);

/* أول route */
drawRoute([lat,lng], pickup);
navText.innerText = "Go to pickup";

}else{
driverMarker.setLatLng([lat,lng]);
}

map.setView([lat,lng],15);

/* DIST */
const dPickup = getDist(lat,lng,pickup);
const dDrop = getDist(lat,lng,dropoff);

/* BEFORE ARRIVED */
if(!arrived){
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

});

/* ================= BUTTONS ================= */

btnArrived.onclick = ()=>{
arrived = true;
btnArrived.style.display="none";
btnStart.style.display="block";
btnNoShow.style.display="block";
startTimer();
};

btnStart.onclick = async ()=>{

started = true;

btnStart.style.display="none";
btnNoShow.style.display="none";
stopTimer();

const pos = driverMarker.getLatLng();

/* تحويل route */
drawRoute([pos.lat,pos.lng], dropoff);

await updateStatus("InProgress");
};

btnDrop.onclick = async ()=>{
await updateStatus("Completed");
alert("Trip Completed");
};

btnNoShow.onclick = async ()=>{
await updateStatus("NoShow");
alert("No Show");
};

/* ================= HELPERS ================= */

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

async function updateStatus(status){
await fetch(`/api/trips/${tripId}`,{
method:"PUT",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({status})
});
}

/* GOOGLE */
btnGoogle.onclick = ()=>{
window.open(
`https://www.google.com/maps/dir/?destination=${pickup[0]},${pickup[1]}`
);
};

/* FIX */
setTimeout(()=>map.invalidateSize(),500);