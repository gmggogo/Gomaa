// ===============================
// ADMIN LIVE MAP (FINAL VERSION)
// ===============================

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([33.4484, -112.0740], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

const searchInput = document.getElementById("searchDriver");

// ===============================
// STATE
// ===============================

const driverMarkers = new Map();
const driverPaths = new Map();          // 🔥 tracking path
const driverPolylines = new Map();      // 🔥 drawn lines

const carColors = [
  "#2563eb","#dc2626","#16a34a",
  "#f59e0b","#7c3aed","#0ea5e9"
];

let firstLoad = true;

// ===============================
// ICON
// ===============================

function createCarIcon(color){
  return L.divIcon({
    html:`
      <div style="
        background:${color};
        width:32px;height:32px;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:16px;
        border:2px solid white;
        box-shadow:0 0 6px rgba(0,0,0,0.5);
      ">🚗</div>
    `,
    className:"",
    iconSize:[32,32],
    iconAnchor:[16,16]
  });
}

// ===============================
// DISTANCE (Haversine)
// ===============================

function getDistance(a,b){

  const R = 6371;

  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLng = (b.lng - a.lng) * Math.PI/180;

  const lat1 = a.lat * Math.PI/180;
  const lat2 = b.lat * Math.PI/180;

  const x =
    Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.sin(dLng/2)*Math.sin(dLng/2) *
    Math.cos(lat1)*Math.cos(lat2);

  const y = 2 * Math.atan2(Math.sqrt(x),Math.sqrt(1-x));

  return R * y; // km
}

// ===============================
// DRAW PATH
// ===============================

function drawDriverPath(name){

  const path = driverPaths.get(name);
  if(!path || path.length < 2) return;

  const latlngs = path.map(p => [p.lat,p.lng]);

  if(driverPolylines.has(name)){
    driverPolylines.get(name).setLatLngs(latlngs);
  }else{
    const polyline = L.polyline(latlngs,{
      color:"#16a34a",
      weight:4
    }).addTo(map);

    driverPolylines.set(name,polyline);
  }
}

// ===============================
// CALCULATE DRIVEN MILES
// ===============================

function calculateDrivenMiles(path){

  if(!path || path.length < 2) return 0;

  let total = 0;

  for(let i=1;i<path.length;i++){
    total += getDistance(path[i-1],path[i]);
  }

  return total * 0.621371; // miles
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

    // REMOVE OLD DRIVERS
    driverMarkers.forEach((obj,name)=>{
      if(!currentNames.includes(name)){
        map.removeLayer(obj.marker);
        map.removeLayer(obj.label);

        if(driverPolylines.has(name)){
          map.removeLayer(driverPolylines.get(name));
          driverPolylines.delete(name);
        }

        driverMarkers.delete(name);
        driverPaths.delete(name);
      }
    });

    // UPDATE DRIVERS
    drivers.forEach((driver,index)=>{

      if(!driver.lat || !driver.lng) return;

      const lat = driver.lat;
      const lng = driver.lng;
      const name = driver.name;

      bounds.push([lat,lng]);

      // ===============================
      // TRACK PATH
      // ===============================

      if(!driverPaths.has(name)){
        driverPaths.set(name,[]);
      }

      const path = driverPaths.get(name);
      const last = path[path.length - 1];

      if(!last || getDistance(last,{lat,lng}) > 0.03){

        path.push({lat,lng});

        if(path.length > 300){
          path.shift();
        }

        drawDriverPath(name);
      }

      // ===============================
      // MARKER
      // ===============================

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

    if(bounds.length>0 && firstLoad){
      map.fitBounds(bounds,{padding:[50,50]});
      firstLoad=false;
    }

  }catch(err){
    console.error("LIVE MAP ERROR",err);
  }
}

// ===============================
// SEARCH
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
// REFRESH (🔥 optimized)
// ===============================

setInterval(loadLiveDrivers,10000);
loadLiveDrivers();