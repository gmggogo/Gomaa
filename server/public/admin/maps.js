// ===============================
// ADMIN LIVE MAP (REAL SERVER)
// ===============================

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([33.4484, -112.0740], 11); // Phoenix

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

const searchInput = document.getElementById("searchDriver");

// تخزين السواقين
const driverMarkers = new Map();

const carColors = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#f59e0b",
  "#7c3aed",
  "#0ea5e9"
];

let firstLoad = true;

// ===============================
// CREATE CAR ICON
// ===============================

function createCarIcon(color){

return L.divIcon({

html:`
<div style="
background:${color};
width:32px;
height:32px;
border-radius:50%;
display:flex;
align-items:center;
justify-content:center;
font-size:16px;
border:2px solid white;
box-shadow:0 0 6px rgba(0,0,0,0.5);
">
🚗
</div>
`,

className:"",
iconSize:[32,32],
iconAnchor:[16,16]

});

}

// ===============================
// LOAD DRIVERS
// ===============================

async function loadLiveDrivers(){

try{

const res = await fetch("/api/admin/live-drivers");

const drivers = await res.json();

const bounds = [];

const currentNames = drivers.map(d => d.name);

// حذف السواقين اللي اختفوا

driverMarkers.forEach((obj,name)=>{

if(!currentNames.includes(name)){

map.removeLayer(obj.marker);
map.removeLayer(obj.label);

driverMarkers.delete(name);

}

});

// تحديث السواقين

drivers.forEach((driver,index)=>{

if(!driver.lat || !driver.lng) return;

const lat = driver.lat;
const lng = driver.lng;
const name = driver.name;

bounds.push([lat,lng]);

if(driverMarkers.has(name)){

const obj = driverMarkers.get(name);

obj.marker.setLatLng([lat,lng]);
obj.label.setLatLng([lat,lng]);

}else{

const color = carColors[index % carColors.length];

const marker = L.marker([lat,lng],{
icon:createCarIcon(color)
}).addTo(map);

const label = L.marker([lat,lng],{

icon:L.divIcon({

html:`<div class="driver-label">${name}</div>`,

className:"",

iconAnchor:[0,-20]

})

}).addTo(map);

driverMarkers.set(name,{marker,label});

}

});

// Zoom مرة واحدة فقط

if(bounds.length>0 && firstLoad){

map.fitBounds(bounds,{padding:[50,50]});

firstLoad=false;

}

}catch(err){

console.error("LIVE MAP ERROR",err);

}

}

// ===============================
// SEARCH DRIVER
// ===============================

if(searchInput){

searchInput.addEventListener("input",()=>{

const value = searchInput.value.toLowerCase();

driverMarkers.forEach((obj,name)=>{

const visible = name.toLowerCase().includes(value);

const markerEl = obj.marker.getElement();
const labelEl = obj.label.getElement();

if(markerEl) markerEl.style.display = visible ? "block" : "none";
if(labelEl) labelEl.style.display = visible ? "block" : "none";

});

});

}

// ===============================
// AUTO REFRESH
// ===============================

setInterval(loadLiveDrivers,3000);

loadLiveDrivers();