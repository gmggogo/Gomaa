/* ===============================
   MAP INIT
================================ */

const mapEl = document.getElementById("map");

const pickupLat = parseFloat(mapEl.dataset.pickupLat);
const pickupLng = parseFloat(mapEl.dataset.pickupLng);

const dropLat = parseFloat(mapEl.dataset.dropoffLat);
const dropLng = parseFloat(mapEl.dataset.dropoffLng);

const map = L.map("map").setView([pickupLat,pickupLng],14);

L.tileLayer(
"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
{maxZoom:19}
).addTo(map);

/* ===============================
   MARKERS
================================ */

let driverMarker=null;

const pickupMarker=L.marker([pickupLat,pickupLng]).addTo(map);
const dropMarker=L.marker([dropLat,dropLng]).addTo(map);

/* ===============================
   ROUTE
================================ */

let routeControl=null;
let routeMode="pickup";

function drawRoute(fromLat,fromLng,toLat,toLng){

if(routeControl){
map.removeControl(routeControl);
}

routeControl=L.Routing.control({

waypoints:[
L.latLng(fromLat,fromLng),
L.latLng(toLat,toLng)
],

routeWhileDragging:false,
addWaypoints:false,
draggableWaypoints:false,
show:false,

lineOptions:{
styles:[
{color:"#2563eb",weight:6,opacity:0.9}
]
}

}).addTo(map);

}

/* ===============================
   BUTTONS
================================ */

const btnGo=document.getElementById("btnGoPickup");
const btnArrived=document.getElementById("btnArrived");
const btnStart=document.getElementById("btnStart");
const btnDrop=document.getElementById("btnDropoff");
const btnNoShow=document.getElementById("btnNoShow");

const timer=document.getElementById("waitTimer");

/* ===============================
   HIDE ALL
================================ */

function hideAll(){

btnGo.style.display="none";
btnArrived.style.display="none";
btnStart.style.display="none";
btnDrop.style.display="none";
btnNoShow.style.display="none";

}

/* ===============================
   DISTANCE
================================ */

function distanceMiles(lat1,lon1,lat2,lon2){

const R=3958.8;

const dLat=(lat2-lat1)*Math.PI/180;
const dLon=(lon2-lon1)*Math.PI/180;

const a=
Math.sin(dLat/2)*Math.sin(dLat/2)+
Math.cos(lat1*Math.PI/180)*
Math.cos(lat2*Math.PI/180)*
Math.sin(dLon/2)*Math.sin(dLon/2);

const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

return R*c;

}

/* ===============================
   TIMER
================================ */

let waitInterval=null;
let waitSeconds=900;

function startTimer(){

timer.style.display="block";

waitInterval=setInterval(()=>{

waitSeconds--;

const m=Math.floor(waitSeconds/60);
const s=waitSeconds%60;

timer.innerText=
`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

if(waitSeconds<=0){
clearInterval(waitInterval);
btnNoShow.style.display="none";
}

},1000);

}

/* ===============================
   BUTTON EVENTS
================================ */

btnGo.onclick=()=>{

btnGo.style.display="none";
btnArrived.style.display="block";

};

btnArrived.onclick=()=>{

btnArrived.style.display="none";

btnStart.style.display="block";
btnNoShow.style.display="block";

startTimer();

};

btnStart.onclick=()=>{

btnStart.style.display="none";
btnNoShow.style.display="none";
timer.style.display="none";

btnDrop.style.display="block";

routeMode="dropoff";

};

btnDrop.onclick=()=>{

alert("Trip Completed");

hideAll();

};

btnNoShow.onclick=()=>{

alert("No Show");

hideAll();

};

/* ===============================
   GPS
================================ */

navigator.geolocation.watchPosition(

(pos)=>{

const lat=pos.coords.latitude;
const lng=pos.coords.longitude;

if(!driverMarker){

driverMarker=L.marker([lat,lng]).addTo(map);
window.driverMarker=driverMarker;

}else{

driverMarker.setLatLng([lat,lng]);
}

map.setView([lat,lng],15);

const dPickup=distanceMiles(lat,lng,pickupLat,pickupLng);
const dDrop=distanceMiles(lat,lng,dropLat,dropLng);

/* ===============================
   ROUTE
================================ */

if(routeMode==="pickup"){
drawRoute(lat,lng,pickupLat,pickupLng);
}

if(routeMode==="dropoff"){
drawRoute(lat,lng,dropLat,dropLng);
}

/* ===============================
   BUTTON POLICY
================================ */

if(routeMode==="pickup"){

if(dPickup>2){
hideAll();
}

if(dPickup<=2 && dPickup>0.1){
hideAll();
btnGo.style.display="block";
}

if(dPickup<=0.1){
hideAll();
btnArrived.style.display="block";
}

}

if(routeMode==="dropoff"){

btnDrop.style.display="block";

}

},

(err)=>{

alert("Enable GPS");

},

{
enableHighAccuracy:true
}

);