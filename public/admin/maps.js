/* ================= SECURITY ================= */

const mapAuthToken = localStorage.getItem("token") || "";
const mapUserRole = String(localStorage.getItem("role") || "").trim().toUpperCase();

if(!mapAuthToken || !["SUPER_ADMIN","ADMIN","DISPATCHER"].includes(mapUserRole)){
  window.location.href = "/login.html";
}

/* =============================== */

// ===============================
// ADMIN LIVE MAP - CARS + NAMES + SIDEBAR
// ===============================

const LIVE_DRIVERS_API = "/api/admin/live-drivers";

/* ===============================
   MAP
=============================== */

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([33.4484, -112.0740], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

/* ===============================
   STATE
=============================== */

const driverMarkers = new Map();
const driverPaths = new Map();
const driverPolylines = new Map();
const driverRawData = new Map();

/*
  Selected-driver route state.
  This uses only trip data already saved in GH Mobility.
  It never calls Google Directions / Routes / traffic APIs.
*/
const tripRouteCache = new Map();
const selectedRouteSummary = new Map();

let selectedDriverId = "";
let selectedTripId = "";
let selectedRoutePolyline = null;
let selectedDestinationMarker = null;

let firstLoad = true;

/* ===============================
   UI INIT
=============================== */

function injectMapStyles(){

  if(document.getElementById("driversMapExtraStyles"))
    return;

  const style = document.createElement("style");
  style.id = "driversMapExtraStyles";
  style.innerHTML = `
    .drivers-sidebar{
      position:fixed;
      top:190px;
      left:14px;
      right:auto;
      width:290px;
      max-height:calc(100vh - 210px);
      overflow:auto;
      background:rgba(15,23,42,.96);
      border:1px solid #334155;
      border-radius:14px;
      z-index:9999;
      box-shadow:0 12px 30px rgba(0,0,0,.35);
      padding:12px;
      color:#fff;
    }

    .drivers-sidebar h3{
      margin:0 0 10px;
      font-size:16px;
      color:#facc15;
    }

    .drivers-count{
      font-size:12px;
      color:#cbd5e1;
      margin-bottom:10px;
      display:block;
    }

    .driver-list{
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .driver-card{
      background:#0f172a;
      border:1px solid #1e293b;
      border-radius:12px;
      padding:10px;
      cursor:pointer;
      transition:.2s;
    }

    .driver-card:hover{
      background:#172554;
      border-color:#3b82f6;
    }

    .driver-card.active{
      border-color:#facc15;
      box-shadow:0 0 0 1px #facc15 inset;
    }

    .driver-line1{
      display:flex;
      align-items:center;
      gap:8px;
      font-weight:700;
      font-size:14px;
      margin-bottom:4px;
    }

    .driver-dot{
      width:12px;
      height:12px;
      border-radius:50%;
      flex:none;
      border:2px solid #fff;
    }

    .driver-line2,
    .driver-line3{
      font-size:12px;
      color:#cbd5e1;
      margin-left:20px;
      word-break:break-word;
    }

    .leaflet-driver-wrap{
      position:relative;
      display:flex;
      flex-direction:column;
      align-items:center;
      transform:translateY(-8px);
    }

    .leaflet-driver-name{
      background:rgba(15,23,42,.92);
      color:#fff;
      font-size:11px;
      font-weight:700;
      padding:3px 7px;
      border-radius:999px;
      margin-bottom:4px;
      white-space:nowrap;
      box-shadow:0 3px 10px rgba(0,0,0,.22);
      border:1px solid rgba(255,255,255,.15);
    }

    .leaflet-driver-car{
      width:34px;
      height:34px;
      border-radius:10px;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#fff;
      font-size:20px;
      font-weight:bold;
      border:2px solid #fff;
      box-shadow:0 6px 15px rgba(0,0,0,.25);
    }

    .empty-drivers{
      font-size:13px;
      color:#cbd5e1;
      padding:8px 4px;
    }

    .driver-route-info{
      margin:7px 0 0 20px;
      padding-top:7px;
      border-top:1px solid rgba(148,163,184,.22);
      font-size:12px;
      line-height:1.45;
      color:#e2e8f0;
    }

    .driver-route-info:empty{
      display:none;
    }

    .route-eta{
      color:#facc15;
      font-weight:800;
    }

    .route-distance{
      color:#93c5fd;
      font-weight:800;
    }

    .route-note{
      color:#94a3b8;
      font-size:10px;
    }

    @media(max-width:900px){
      .drivers-sidebar{
        width:220px;
        top:180px;
        left:8px;
        right:auto;
        max-height:calc(100vh - 200px);
      }
    }

    @media(max-width:700px){
      .drivers-sidebar{
        width:180px;
        top:170px;
        left:8px;
        right:auto;
        max-height:calc(100vh - 190px);
      }
      .leaflet-driver-name{
        font-size:10px;
      }
    }
  `;

  document.head.appendChild(style);

}

function ensureSidebar(){

  if(document.getElementById("driversSidebar"))
    return;

  const box = document.createElement("div");
  box.id = "driversSidebar";
  box.className = "drivers-sidebar";
  box.innerHTML = `
    <h3>Live Drivers</h3>
    <span class="drivers-count" id="driversCount">0 drivers online</span>
    <div class="driver-list" id="driversList"></div>
  `;
  document.body.appendChild(box);

}

function positionDriversSidebarBelowHeader(){

  const sidebar =
    document.getElementById("driversSidebar");

  if(!sidebar){
    return;
  }

  const header =
    document.getElementById("adminHeader");

  let headerBottom = 0;

  if(header){

    const rect =
      header.getBoundingClientRect();

    headerBottom =
      Math.max(
        0,
        Number(rect.bottom || 0)
      );

  }

  /*
    Keep the list fully below the real rendered admin header.
    The extra 18px gives a visible gap under the header/navigation.
  */
  const top =
    Math.max(
      headerBottom + 18,
      190
    );

  sidebar.style.setProperty(
    "top",
    `${top}px`,
    "important"
  );

  sidebar.style.setProperty(
    "left",
    window.innerWidth <= 900
      ? "8px"
      : "14px",
    "important"
  );

  sidebar.style.setProperty(
    "right",
    "auto",
    "important"
  );

  sidebar.style.setProperty(
    "max-height",
    `calc(100vh - ${top + 20}px)`,
    "important"
  );

}

/* ===============================
   HELPERS
=============================== */

function getDistance(a, b){

  const R = 6371;

  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function colorFromId(id){

  const colors = [
    "#ef4444",
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#06b6d4",
    "#e11d48",
    "#14b8a6",
    "#f97316",
    "#8b5cf6",
    "#84cc16",
    "#0ea5e9"
  ];

  let hash = 0;
  const str = String(id || "");

  for(let i = 0; i < str.length; i++){
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }

  return colors[Math.abs(hash) % colors.length];

}

function getDriverName(driver, id){
  return (
    driver.name ||
    driver.driverName ||
    driver.username ||
    driver.phone ||
    id
  );
}

function getVehicleText(driver){
  return (
    driver.vehicleNumber ||
    driver.vehicle ||
    driver.carNumber ||
    ""
  );
}

function buildDriverIcon(driver, id){

  const color = colorFromId(id);
  const name = escapeHtml(getDriverName(driver, id));

  return L.divIcon({
    className: "",
    html: `
      <div class="leaflet-driver-wrap">
        <div class="leaflet-driver-name">${name}</div>
        <div class="leaflet-driver-car" style="background:${color}">
          🚗
        </div>
      </div>
    `,
    iconSize: [90, 54],
    iconAnchor: [45, 44],
    popupAnchor: [0, -35]
  });

}

function highlightDriverCard(id){

  document
    .querySelectorAll(".driver-card")
    .forEach(el => el.classList.remove("active"));

  const target =
    document.querySelector(`.driver-card[data-id="${CSS.escape(String(id))}"]`);

  if(target){
    target.classList.add("active");
  }

}


/* ===============================
   SAVED ROUTE + APPROX ETA
   ZERO external routing requests
=============================== */

function validPoint(point){
  return !!(
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  );
}

function pointFromAny(value){
  if(Array.isArray(value) && value.length >= 2){
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? {lat,lng}
      : null;
  }

  if(!value || typeof value !== "object"){
    return null;
  }

  const lat = Number(
    value.lat ??
    value.latitude ??
    value.location?.lat ??
    value.location?.latitude
  );

  const lng = Number(
    value.lng ??
    value.lon ??
    value.longitude ??
    value.location?.lng ??
    value.location?.lon ??
    value.location?.longitude
  );

  return Number.isFinite(lat) && Number.isFinite(lng)
    ? {lat,lng}
    : null;
}

function decodeGooglePolyline(encoded){
  const points = [];

  if(typeof encoded !== "string" || !encoded){
    return points;
  }

  let index = 0;
  let lat = 0;
  let lng = 0;

  try{
    while(index < encoded.length){

      let result = 0;
      let shift = 0;
      let byte = 0;

      do{
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      }while(byte >= 0x20 && index <= encoded.length);

      const dLat =
        (result & 1)
          ? ~(result >> 1)
          : (result >> 1);

      lat += dLat;

      result = 0;
      shift = 0;

      do{
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      }while(byte >= 0x20 && index <= encoded.length);

      const dLng =
        (result & 1)
          ? ~(result >> 1)
          : (result >> 1);

      lng += dLng;

      points.push({
        lat:lat / 1e5,
        lng:lng / 1e5
      });
    }
  }catch(err){
    console.log("SAVED POLYLINE DECODE ERROR",err);
    return [];
  }

  return points.filter(validPoint);
}

function unwrapTripPayload(data){
  if(!data || typeof data !== "object"){
    return null;
  }

  return (
    data.trip ||
    data.item ||
    data.data ||
    data
  );
}

function savedTripPathArray(trip){

  const candidates = [
    trip?.googleRoute?.path,
    trip?.googleRoute?.routePath,
    trip?.googleRoute?.polylinePath,
    trip?.optimizedRoute?.path,
    trip?.optimizedRoute?.routePath,
    trip?.optimizedRoute?.polylinePath,
    trip?.routePath,
    trip?.polylinePath,
    trip?.savedRoutePath,
    trip?.route?.path
  ];

  for(const candidate of candidates){

    if(!Array.isArray(candidate) || candidate.length < 2){
      continue;
    }

    const path =
      candidate
        .map(pointFromAny)
        .filter(Boolean);

    if(path.length >= 2){
      return path;
    }
  }

  const encodedCandidates = [
    trip?.googleRoute?.overviewPolyline?.points,
    trip?.googleRoute?.overview_polyline?.points,
    trip?.googleRoute?.routes?.[0]?.overviewPolyline?.points,
    trip?.googleRoute?.routes?.[0]?.overview_polyline?.points,
    trip?.optimizedRoute?.overviewPolyline?.points,
    trip?.optimizedRoute?.overview_polyline?.points,
    trip?.optimizedRoute?.routes?.[0]?.overviewPolyline?.points,
    trip?.optimizedRoute?.routes?.[0]?.overview_polyline?.points,
    trip?.overviewPolyline?.points,
    trip?.overview_polyline?.points,
    typeof trip?.overviewPolyline === "string" ? trip.overviewPolyline : "",
    typeof trip?.overview_polyline === "string" ? trip.overview_polyline : "",
    trip?.routePolyline?.points,
    trip?.encodedPolyline?.points,
    typeof trip?.routePolyline === "string" ? trip.routePolyline : "",
    typeof trip?.encodedPolyline === "string" ? trip.encodedPolyline : "",
    trip?.polyline
  ];

  for(const encoded of encodedCandidates){
    const decoded = decodeGooglePolyline(encoded);
    if(decoded.length >= 2){
      return decoded;
    }
  }

  /*
    Safe fallback: connect already-saved stop coordinates.
    This still makes zero external route requests.
  */
  const stopCandidates = [
    trip?.stops,
    trip?.routeStops,
    trip?.tripStops
  ];

  for(const stops of stopCandidates){
    if(!Array.isArray(stops)) continue;

    const points =
      stops
        .map(pointFromAny)
        .filter(Boolean);

    if(points.length >= 2){
      return points;
    }
  }

  const simple = [
    pointFromAny({
      lat:trip?.pickupLat ?? trip?.pickup?.lat,
      lng:trip?.pickupLng ?? trip?.pickup?.lng
    }),
    pointFromAny({
      lat:trip?.dropoffLat ?? trip?.dropLat ?? trip?.dropoff?.lat,
      lng:trip?.dropoffLng ?? trip?.dropLng ?? trip?.dropoff?.lng
    })
  ].filter(Boolean);

  return simple.length >= 2 ? simple : [];
}

function nearestPathIndex(path,driverPoint){

  if(!Array.isArray(path) || !path.length || !validPoint(driverPoint)){
    return -1;
  }

  let bestIndex = 0;
  let bestDistance = Infinity;

  path.forEach((point,index)=>{
    const distance = getDistance(driverPoint,point);

    if(distance < bestDistance){
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function pathDistanceKm(path){

  if(!Array.isArray(path) || path.length < 2){
    return 0;
  }

  let total = 0;

  for(let i=1;i<path.length;i++){
    total += getDistance(path[i-1],path[i]);
  }

  return total;
}

function estimateEtaRange(miles){

  const distance = Math.max(0,Number(miles || 0));

  if(distance < 0.08){
    return {
      low:0,
      high:1,
      text:"< 1 min"
    };
  }

  /*
    Traffic-free local estimate.
    Slower assumed average for short city trips,
    faster average for longer stretches.
  */
  const averageMph =
    distance <= 2 ? 18 :
    distance <= 8 ? 24 :
    distance <= 20 ? 32 :
    40;

  const baseMinutes =
    (distance / averageMph) * 60;

  const low =
    Math.max(
      1,
      Math.floor(baseMinutes * 0.82)
    );

  const high =
    Math.max(
      low + 1,
      Math.ceil(baseMinutes * 1.22)
    );

  return {
    low,
    high,
    text:`~${low}–${high} min`
  };
}

function routeInfoHtml(id){

  const summary =
    selectedRouteSummary.get(
      String(id || "")
    );

  if(!summary){
    return "";
  }

  if(summary.loading){
    return `<span class="route-note">Loading saved route…</span>`;
  }

  if(summary.message){
    return `<span class="route-note">${escapeHtml(summary.message)}</span>`;
  }

  return `
    <div class="route-distance">Remaining: ~${Number(summary.miles || 0).toFixed(1)} mi</div>
    <div class="route-eta">ETA: ${escapeHtml(summary.etaText || "--")}</div>
    <div class="route-note">Approximate • no traffic request</div>
  `;
}

function clearSelectedRoute(){

  if(selectedRoutePolyline){
    map.removeLayer(selectedRoutePolyline);
    selectedRoutePolyline = null;
  }

  if(selectedDestinationMarker){
    map.removeLayer(selectedDestinationMarker);
    selectedDestinationMarker = null;
  }
}

function updateSelectedDriverUi(id){

  const key = String(id || "");
  const driver = driverRawData.get(key);
  const marker = driverMarkers.get(key);
  const summary = selectedRouteSummary.get(key);

  const routeEl =
    document.querySelector(
      `.driver-route-info[data-route-id="${CSS.escape(key)}"]`
    );

  if(routeEl){
    routeEl.innerHTML = routeInfoHtml(key);
  }

  if(!driver || !marker){
    return;
  }

  const vehicle =
    getVehicleText(driver)
      ? `Vehicle: ${escapeHtml(getVehicleText(driver))}<br>`
      : "";

  const trip =
    driver.tripId
      ? `Trip: ${escapeHtml(driver.tripId)}<br>`
      : "";

  const routeDetails =
    summary && !summary.loading && !summary.message
      ? `
          <div style="margin-top:7px;padding-top:7px;border-top:1px solid #e2e8f0">
            <b>Remaining:</b> ~${Number(summary.miles || 0).toFixed(1)} mi<br>
            <b>ETA:</b> ${escapeHtml(summary.etaText || "--")}<br>
            <span style="font-size:10px;color:#64748b">Approximate • no traffic request</span>
          </div>
        `
      : summary?.message
        ? `<div style="margin-top:7px;color:#64748b">${escapeHtml(summary.message)}</div>`
        : summary?.loading
          ? `<div style="margin-top:7px;color:#64748b">Loading saved route…</div>`
          : "";

  marker.setPopupContent(`
    <div style="min-width:190px">
      <b style="font-size:14px">${escapeHtml(getDriverName(driver,key))}</b><br>
      ${vehicle}
      ${driver.phone ? `Phone: ${escapeHtml(driver.phone)}<br>` : ""}
      ${trip}
      ${routeDetails}
    </div>
  `);
}

async function getTripRoute(tripId){

  const key = String(tripId || "").trim();

  if(!key){
    return {
      trip:null,
      path:[]
    };
  }

  if(tripRouteCache.has(key)){
    return tripRouteCache.get(key);
  }

  const promise = (async()=>{

    try{
      const res = await fetch(
        `/api/trips/${encodeURIComponent(key)}`,
        {
          cache:"no-store",
          headers:{
            Authorization:"Bearer " + mapAuthToken
          }
        }
      );

      if(!res.ok){
        return {
          trip:null,
          path:[],
          error:`Trip route unavailable (${res.status})`
        };
      }

      const data = await res.json().catch(()=>({}));
      const trip = unwrapTripPayload(data);
      const path = savedTripPathArray(trip);

      return {
        trip,
        path
      };

    }catch(err){
      console.log("TRIP ROUTE LOAD ERROR",err);

      return {
        trip:null,
        path:[],
        error:"Trip route unavailable"
      };
    }
  })();

  tripRouteCache.set(key,promise);

  const result = await promise;

  /*
    Keep successful trip data cached. A failed request should be allowed
    to retry the next time the driver is selected.
  */
  if(result?.error){
    tripRouteCache.delete(key);
  }else{
    tripRouteCache.set(key,Promise.resolve(result));
  }

  return result;
}

function drawRemainingSavedRoute(id,path,fitRoute=true){

  const driver = driverRawData.get(String(id || ""));

  if(
    !driver ||
    !validPoint(driver) ||
    !Array.isArray(path) ||
    path.length < 2
  ){
    return null;
  }

  const driverPoint = {
    lat:Number(driver.lat),
    lng:Number(driver.lng)
  };

  const nearestIndex =
    nearestPathIndex(
      path,
      driverPoint
    );

  if(nearestIndex < 0){
    return null;
  }

  const remaining = [
    driverPoint,
    ...path.slice(nearestIndex)
  ];

  const distanceKm =
    pathDistanceKm(remaining);

  const miles =
    distanceKm * 0.621371;

  const eta =
    estimateEtaRange(miles);

  clearSelectedRoute();

  selectedRoutePolyline =
    L.polyline(
      remaining.map(point=>[point.lat,point.lng]),
      {
        color:"#2563eb",
        weight:6,
        opacity:0.92,
        lineCap:"round",
        lineJoin:"round"
      }
    ).addTo(map);

  const destination =
    remaining[remaining.length - 1];

  if(validPoint(destination)){
    selectedDestinationMarker =
      L.circleMarker(
        [destination.lat,destination.lng],
        {
          radius:7,
          color:"#ffffff",
          weight:2,
          fillColor:"#dc2626",
          fillOpacity:1
        }
      )
      .addTo(map)
      .bindTooltip("Destination",{
        direction:"top"
      });
  }

  if(fitRoute){
    const bounds =
      L.latLngBounds(
        remaining.map(point=>[point.lat,point.lng])
      );

    if(bounds.isValid()){
      map.fitBounds(bounds,{
        padding:[45,45],
        maxZoom:16
      });
    }
  }

  return {
    miles,
    etaText:eta.text,
    lowMinutes:eta.low,
    highMinutes:eta.high
  };
}

async function selectDriver(id,options={}){

  const key = String(id || "");
  const driver = driverRawData.get(key);
  const marker = driverMarkers.get(key);

  if(!driver){
    return;
  }

  selectedDriverId = key;
  selectedTripId = String(driver.tripId || "").trim();

  highlightDriverCard(key);

  if(marker && options.center !== false){
    map.setView(
      marker.getLatLng(),
      16,
      {animate:true}
    );
  }

  if(!selectedTripId){
    clearSelectedRoute();

    selectedRouteSummary.set(key,{
      message:"No active trip"
    });

    updateSelectedDriverUi(key);

    if(marker && options.openPopup !== false){
      marker.openPopup();
    }

    return;
  }

  selectedRouteSummary.set(key,{
    loading:true
  });

  updateSelectedDriverUi(key);

  const routeData =
    await getTripRoute(
      selectedTripId
    );

  /*
    The user may have selected another driver while this trip was loading.
  */
  if(
    selectedDriverId !== key ||
    selectedTripId !== String(driver.tripId || "").trim()
  ){
    return;
  }

  if(
    routeData?.error ||
    !Array.isArray(routeData?.path) ||
    routeData.path.length < 2
  ){
    clearSelectedRoute();

    selectedRouteSummary.set(key,{
      message:
        routeData?.error ||
        "No saved route found for this trip"
    });

    updateSelectedDriverUi(key);

    if(marker && options.openPopup !== false){
      marker.openPopup();
    }

    return;
  }

  const summary =
    drawRemainingSavedRoute(
      key,
      routeData.path,
      options.fitRoute !== false
    );

  if(!summary){
    selectedRouteSummary.set(key,{
      message:"Unable to calculate remaining route"
    });
  }else{
    selectedRouteSummary.set(key,summary);
  }

  updateSelectedDriverUi(key);

  if(marker && options.openPopup !== false){
    marker.openPopup();
  }
}

async function refreshSelectedRoute(){

  if(!selectedDriverId){
    return;
  }

  const driver =
    driverRawData.get(
      selectedDriverId
    );

  if(!driver){
    clearSelectedRoute();
    selectedDriverId = "";
    selectedTripId = "";
    return;
  }

  const tripId =
    String(driver.tripId || "").trim();

  if(!tripId){
    clearSelectedRoute();

    selectedRouteSummary.set(
      selectedDriverId,
      {message:"No active trip"}
    );

    updateSelectedDriverUi(
      selectedDriverId
    );

    return;
  }

  if(tripId !== selectedTripId){
    selectedTripId = tripId;

    await selectDriver(
      selectedDriverId,
      {
        center:false,
        fitRoute:false,
        openPopup:false
      }
    );

    return;
  }

  const cached =
    await getTripRoute(
      tripId
    );

  if(
    !Array.isArray(cached?.path) ||
    cached.path.length < 2
  ){
    return;
  }

  const summary =
    drawRemainingSavedRoute(
      selectedDriverId,
      cached.path,
      false
    );

  if(summary){
    selectedRouteSummary.set(
      selectedDriverId,
      summary
    );

    updateSelectedDriverUi(
      selectedDriverId
    );
  }
}

/* ===============================
   DRAW PATH
=============================== */

function drawPath(id){

  const path = driverPaths.get(id);

  if(!path || path.length < 2) return;

  const latlngs = path.map(p => [p.lat, p.lng]);
  const color = colorFromId(id);

  if(driverPolylines.has(id)){

    driverPolylines.get(id).setLatLngs(latlngs);

  }else{

    const poly = L.polyline(latlngs, {
      color,
      weight: 4,
      opacity: 0.85
    }).addTo(map);

    driverPolylines.set(id, poly);

  }

}

/* ===============================
   SIDEBAR RENDER
=============================== */

function renderSidebar(drivers){

  const listEl = document.getElementById("driversList");
  const countEl = document.getElementById("driversCount");

  if(!listEl || !countEl) return;

  countEl.innerText = `${drivers.length} driver${drivers.length === 1 ? "" : "s"} online`;

  if(!drivers.length){
    listEl.innerHTML = `<div class="empty-drivers">No live drivers found</div>`;
    return;
  }

  listEl.innerHTML = drivers.map((driver, index) => {

    const id = String(
      driver.driverId ||
      driver._id ||
      driver.id ||
      ("driver_" + index)
    );

    const color = colorFromId(id);
    const name = escapeHtml(getDriverName(driver, id));
    const vehicle = escapeHtml(getVehicleText(driver) || "No vehicle");
    const phone = escapeHtml(driver.phone || "");
    const tripId = escapeHtml(driver.tripId || "");

    return `
      <div class="driver-card" data-id="${escapeHtml(id)}">
        <div class="driver-line1">
          <span class="driver-dot" style="background:${color}"></span>
          <span>${name}</span>
        </div>
        <div class="driver-line2">Vehicle: ${vehicle}</div>
        <div class="driver-line3">
          ${phone ? `Phone: ${phone}` : ""}
          ${tripId ? `<br>Trip: ${tripId}` : ""}
        </div>
        <div class="driver-route-info" data-route-id="${escapeHtml(id)}">${routeInfoHtml(id)}</div>
      </div>
    `;

  }).join("");

  listEl.querySelectorAll(".driver-card").forEach(card => {
    card.addEventListener("click", () => {

      const id = card.getAttribute("data-id");
      const marker = driverMarkers.get(id);
      const driver = driverRawData.get(id);

      selectDriver(id,{
        center:true,
        fitRoute:true,
        openPopup:true
      });

      const searchInput = document.getElementById("searchDriver");
      if(searchInput){
        searchInput.value = getDriverName(driver || {}, id);
      }
    });
  });

  if(selectedDriverId){
    highlightDriverCard(selectedDriverId);
  }

}

/* ===============================
   SEARCH
=============================== */

function bindSearch(){

  const input = document.getElementById("searchDriver");
  if(!input || input.dataset.bound === "1") return;

  input.dataset.bound = "1";

  input.addEventListener("input", () => {

    const q = String(input.value || "").trim().toLowerCase();

    document.querySelectorAll(".driver-card").forEach(card => {
      const text = card.innerText.toLowerCase();
      card.style.display = !q || text.includes(q) ? "block" : "none";
    });

    if(!q) return;

    for(const [id, driver] of driverRawData.entries()){

      const name = getDriverName(driver, id).toLowerCase();
      const phone = String(driver.phone || "").toLowerCase();
      const vehicle = String(getVehicleText(driver) || "").toLowerCase();

      if(
        name.includes(q) ||
        phone.includes(q) ||
        vehicle.includes(q)
      ){
        const marker = driverMarkers.get(id);
        if(marker){
          map.setView(marker.getLatLng(), 16, { animate:true });
          highlightDriverCard(id);
        }
        break;
      }

    }

  });

}

/* ===============================
   LOAD LIVE DRIVERS
=============================== */

async function loadLiveDrivers(){

  try{

    const res = await fetch(LIVE_DRIVERS_API, {
      cache: "no-store",
      headers:{
        Authorization:"Bearer " + mapAuthToken
      }
    });

    if(!res.ok){
      let message = "Failed to load live drivers";
      try{
        const errorData = await res.json();
        message = errorData.message || message;
      }catch(e){}
      throw new Error(`${message} (${res.status})`);
    }

    const data = await res.json();

    const drivers = Array.isArray(data)
      ? data
      : (Array.isArray(data.drivers) ? data.drivers : []);

    const bounds = [];
    const onlineIds = new Set();
    const cleanedDrivers = [];

    drivers.forEach((driver, index) => {

      const id = String(
        driver.driverId ||
        driver._id ||
        driver.id ||
        ("driver_" + index)
      );

      const lat = Number(driver.lat);
      const lng = Number(driver.lng);

      if(!id || !Number.isFinite(lat) || !Number.isFinite(lng)){
        return;
      }

      onlineIds.add(id);
      bounds.push([lat, lng]);

      const driverData = {
        ...driver,
        driverId: id,
        lat,
        lng
      };

      driverRawData.set(id, driverData);
      cleanedDrivers.push(driverData);

      /* ===============================
         PATH TRACKING
      =============================== */

      if(!driverPaths.has(id)){
        driverPaths.set(id, []);
      }

      const path = driverPaths.get(id);
      const last = path[path.length - 1];

      if(!last || getDistance(last, {lat, lng}) > 0.01){

        path.push({lat, lng});

        if(path.length > 200){
          path.shift();
        }

        drawPath(id);

      }

      /* ===============================
         MARKER
      =============================== */

      const popupHtml = `
        <div style="min-width:190px">
          <b style="font-size:14px">${escapeHtml(getDriverName(driverData, id))}</b><br>
          ${getVehicleText(driverData) ? `Vehicle: ${escapeHtml(getVehicleText(driverData))}<br>` : ""}
          ${driverData.phone ? `Phone: ${escapeHtml(driverData.phone)}<br>` : ""}
          ${driverData.tripId ? `Trip: ${escapeHtml(driverData.tripId)}<br>` : ""}
          ${routeInfoHtml(id)}
        </div>
      `;

      if(driverMarkers.has(id)){

        const marker = driverMarkers.get(id);
        marker.setLatLng([lat, lng]);
        marker.setIcon(buildDriverIcon(driverData, id));
        marker.setPopupContent(popupHtml);

      }else{

        const marker = L.marker([lat, lng], {
          icon: buildDriverIcon(driverData, id)
        }).addTo(map);

        marker.bindPopup(popupHtml);

        marker.on("click", () => {
          selectDriver(id,{
            center:false,
            fitRoute:true,
            openPopup:true
          });
        });

        driverMarkers.set(id, marker);

      }

    });

    /* ===============================
       REMOVE OFFLINE
    =============================== */

    driverMarkers.forEach((marker, id) => {

      if(!onlineIds.has(id)){

        map.removeLayer(marker);
        driverMarkers.delete(id);

        if(driverPolylines.has(id)){
          map.removeLayer(driverPolylines.get(id));
          driverPolylines.delete(id);
        }

        driverPaths.delete(id);
        driverRawData.delete(id);

        if(selectedDriverId === id){
          clearSelectedRoute();
          selectedDriverId = "";
          selectedTripId = "";
          selectedRouteSummary.delete(id);
        }

      }

    });

    /* ===============================
       SIDEBAR
    =============================== */

    cleanedDrivers.sort((a, b) => {
      return getDriverName(a, a.driverId)
        .localeCompare(getDriverName(b, b.driverId));
    });

    renderSidebar(cleanedDrivers);

    /*
      Recalculate the selected driver's remaining miles/ETA from the
      newest live GPS point. The saved route stays cached, so this makes
      no additional external routing requests.
    */
    if(selectedDriverId){
      refreshSelectedRoute().catch(err=>{
        console.log("SELECTED ROUTE REFRESH ERROR",err);
      });
    }

    /* ===============================
       FIRST ZOOM
    =============================== */

    if(bounds.length && firstLoad){

      map.fitBounds(bounds, {
        padding: [60, 60]
      });

      firstLoad = false;

    }

  }catch(err){

    console.log("MAP ERROR", err);

    const listEl = document.getElementById("driversList");
    if(listEl){
      listEl.innerHTML = `<div class="empty-drivers">Failed to load live drivers</div>`;
    }

  }

}

/* ===============================
   START
=============================== */

injectMapStyles();
ensureSidebar();
positionDriversSidebarBelowHeader();
bindSearch();

/*
  header.js builds the admin header dynamically.
  Re-check the real header height after it finishes rendering.
*/
setTimeout(
  positionDriversSidebarBelowHeader,
  100
);

setTimeout(
  positionDriversSidebarBelowHeader,
  350
);

setTimeout(
  positionDriversSidebarBelowHeader,
  800
);

setTimeout(() => {
  map.invalidateSize(true);
  positionDriversSidebarBelowHeader();
  loadLiveDrivers();
}, 150);

window.addEventListener("resize", () => {
  map.invalidateSize(false);
  positionDriversSidebarBelowHeader();
});

setInterval(loadLiveDrivers, 30000);