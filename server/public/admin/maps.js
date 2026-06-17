// ===============================
// ADMIN LIVE MAP (OPTIMIZED FINAL)
// ===============================

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([33.4484, -112.0740], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

const driverMarkers = new Map();
const driverPaths = new Map();
const driverPolylines = new Map();

let firstLoad = true;

/* ===============================
   DISTANCE
=============================== */

function getDistance(a,b){
  const R = 6371;

  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLng = (b.lng - a.lng) * Math.PI/180;

  const x =
    Math.sin(dLat/2)**2 +
    Math.cos(a.lat*Math.PI/180) *
    Math.cos(b.lat*Math.PI/180) *
    Math.sin(dLng/2)**2;

  return R * 2 * Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

/* ===============================
   DRAW PATH
=============================== */

function drawPath(id){

  const path = driverPaths.get(id);
  if(!path || path.length < 2) return;

  const latlngs = path.map(p => [p.lat,p.lng]);

  if(driverPolylines.has(id)){
    driverPolylines.get(id).setLatLngs(latlngs);
  }else{
    const poly = L.polyline(latlngs,{
      color:"#16a34a",
      weight:4
    }).addTo(map);

    driverPolylines.set(id,poly);
  }
}

/* ===============================
   LOAD DRIVERS (FINAL FIXED)
=============================== */

async function loadLiveDrivers(){

  try{

    const res = await fetch("/api/admin/live-drivers");
    const drivers = await res.json();

    const bounds = [];

    drivers.forEach((driver,index)=>{

      if(!driver.lat || !driver.lng) return;

      const id = driver.tripId || ("d"+index);
      const lat = driver.lat;
      const lng = driver.lng;

      bounds.push([lat,lng]);

      /* ===============================
         PATH TRACKING
      =============================== */

      if(!driverPaths.has(id)){
        driverPaths.set(id,[]);
      }

      const path = driverPaths.get(id);
      const last = path[path.length - 1];

      if(!last || getDistance(last,{lat,lng}) > 0.01){

        path.push({lat,lng});

        if(path.length > 200){
          path.shift();
        }

        drawPath(id);
      }

      /* ===============================
         MARKER
      =============================== */

      if(driverMarkers.has(id)){

        driverMarkers.get(id).setLatLng([lat,lng]);

      }else{

        const marker = L.marker([lat,lng]).addTo(map);
        driverMarkers.set(id,marker);

      }

    });

    /* ===============================
       FIRST ZOOM
    =============================== */

    if(bounds.length && firstLoad){
      map.fitBounds(bounds,{padding:[50,50]});
      firstLoad = false;
    }

  }catch(err){
    console.log("MAP ERROR",err);
  }
}

/* ===============================
   REFRESH (LOW REQUESTS)
=============================== */

setInterval(loadLiveDrivers,30000);
loadLiveDrivers();