/* ================= SECURITY ================= */

const mapAuthToken = localStorage.getItem("token") || "";
const mapUserRole = String(localStorage.getItem("role") || "")
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g,"_");

if(!mapAuthToken || !["SUPER_ADMIN","SUPERADMIN","ADMIN","DISPATCHER"].includes(mapUserRole)){
  window.location.href = "/login.html";
}

/* ===============================
   ADMIN LIVE MAP
   - ONE aggregated live-drivers request
   - NO Google / OSRM / routing request
   - Selected driver gets a lightweight direct line to Dropoff
   - Pickup + Dropoff fit on selection
================================ */

const LIVE_DRIVERS_API = "/api/admin/live-drivers";
const LIVE_REFRESH_MS = 30000;

/* ===============================
   MAP
================================ */

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([33.4484, -112.0740], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

/* ===============================
   STATE
================================ */

const driverMarkers = new Map();
const driverRawData = new Map();
const selectedRouteSummary = new Map();

let selectedDriverId = "";
let selectedDirectLine = null;
let selectedPickupMarker = null;
let selectedDropoffMarker = null;
let firstLoad = true;
let liveRequestInFlight = false;

/* ===============================
   UI INIT
================================ */

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
      max-height:calc(100vh - 215px);
      overflow:auto;
      background:rgba(15,23,42,.96);
      border:1px solid #334155;
      border-radius:14px;
      z-index:9999;
      box-shadow:0 12px 30px rgba(0,0,0,.35);
      padding:12px;
      color:#fff;
      box-sizing:border-box;
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
        left:8px;
      }
    }

    @media(max-width:700px){
      .drivers-sidebar{
        width:180px;
        left:8px;
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

/*
  Keep the driver list below the ACTUAL rendered admin header.
  ResizeObserver + MutationObserver prevent it from jumping back under
  the header after header.js finishes/re-renders.
*/
function positionDriversSidebarBelowHeader(){

  const sidebar = document.getElementById("driversSidebar");
  if(!sidebar) return;

  const header = document.getElementById("adminHeader");
  const rect = header ? header.getBoundingClientRect() : null;

  const headerBottom =
    rect && Number.isFinite(Number(rect.bottom))
      ? Math.max(0, Number(rect.bottom))
      : 0;

  const fallbackTop = window.innerWidth <= 800 ? 150 : 165;
  const top = Math.max(Math.ceil(headerBottom + 18), fallbackTop);

  sidebar.style.setProperty("top", `${top}px`, "important");
  sidebar.style.setProperty(
    "left",
    window.innerWidth <= 900 ? "8px" : "14px",
    "important"
  );
  sidebar.style.setProperty("right", "auto", "important");
  sidebar.style.setProperty(
    "max-height",
    `calc(100vh - ${top + 20}px)`,
    "important"
  );
}

function watchHeaderPosition(){

  const header = document.getElementById("adminHeader");
  if(!header) return;

  let raf = 0;
  const queue = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(positionDriversSidebarBelowHeader);
  };

  if("ResizeObserver" in window){
    const ro = new ResizeObserver(queue);
    ro.observe(header);
  }

  if("MutationObserver" in window){
    const mo = new MutationObserver(queue);
    mo.observe(header,{
      childList:true,
      subtree:true,
      attributes:true
    });
  }
}

/* ===============================
   HELPERS
================================ */

function validPoint(point){
  return !!(
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  );
}

function getDistance(a,b){

  const R = 6371;
  const dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const dLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;

  const lat1 = Number(a.lat) * Math.PI / 180;
  const lat2 = Number(b.lat) * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function colorFromId(id){

  const colors = [
    "#ef4444","#3b82f6","#22c55e","#f59e0b",
    "#a855f7","#06b6d4","#e11d48","#14b8a6",
    "#f97316","#8b5cf6","#84cc16","#0ea5e9"
  ];

  let hash = 0;
  const str = String(id || "");

  for(let i = 0; i < str.length; i++){
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }

  return colors[Math.abs(hash) % colors.length];
}

function getDriverName(driver,id){
  return (
    driver?.name ||
    driver?.driverName ||
    driver?.username ||
    driver?.phone ||
    id
  );
}

function getVehicleText(driver){
  return (
    driver?.vehicleNumber ||
    driver?.vehicle ||
    driver?.carNumber ||
    ""
  );
}

function pointFromObject(value){

  if(!value || typeof value !== "object")
    return null;

  if(Array.isArray(value) && value.length >= 2){
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? {lat,lng}
      : null;
  }

  const lat = Number(
    value.lat ??
    value.latitude ??
    value.location?.lat ??
    value.location?.latitude ??
    value.coordinates?.[1]
  );

  const lng = Number(
    value.lng ??
    value.lon ??
    value.longitude ??
    value.location?.lng ??
    value.location?.lon ??
    value.location?.longitude ??
    value.coordinates?.[0]
  );

  return Number.isFinite(lat) && Number.isFinite(lng)
    ? {lat,lng}
    : null;
}

function pointFromLatLng(lat,lng){
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b)
    ? {lat:a,lng:b}
    : null;
}

function getActiveTripObject(driver){
  return (
    driver?.activeTrip ||
    driver?.currentTrip ||
    driver?.trip ||
    driver?.tripData ||
    driver?.ride ||
    null
  );
}

/*
  IMPORTANT:
  We only read pickup/dropoff coordinates already included in the ONE
  /api/admin/live-drivers payload. No second trip fetch is made.
*/
function getPickupPoint(driver){

  const trip = getActiveTripObject(driver);

  const objectCandidates = [
    driver?.pickup,
    driver?.pickupLocation,
    driver?.pickupPoint,
    driver?.origin,
    trip?.pickup,
    trip?.pickupLocation,
    trip?.pickupPoint,
    trip?.origin
  ];

  for(const item of objectCandidates){
    const point = pointFromObject(item);
    if(validPoint(point)) return point;
  }

  const pairCandidates = [
    [driver?.pickupLat, driver?.pickupLng ?? driver?.pickupLon],
    [driver?.pickupLatitude, driver?.pickupLongitude],
    [driver?.originLat, driver?.originLng ?? driver?.originLon],
    [trip?.pickupLat, trip?.pickupLng ?? trip?.pickupLon],
    [trip?.pickupLatitude, trip?.pickupLongitude],
    [trip?.originLat, trip?.originLng ?? trip?.originLon]
  ];

  for(const [lat,lng] of pairCandidates){
    const point = pointFromLatLng(lat,lng);
    if(validPoint(point)) return point;
  }

  return null;
}

function getDropoffPoint(driver){

  const trip = getActiveTripObject(driver);

  const objectCandidates = [
    driver?.dropoff,
    driver?.dropoffLocation,
    driver?.dropoffPoint,
    driver?.destination,
    driver?.destinationLocation,
    trip?.dropoff,
    trip?.dropoffLocation,
    trip?.dropoffPoint,
    trip?.destination,
    trip?.destinationLocation
  ];

  for(const item of objectCandidates){
    const point = pointFromObject(item);
    if(validPoint(point)) return point;
  }

  const pairCandidates = [
    [driver?.dropoffLat ?? driver?.dropLat, driver?.dropoffLng ?? driver?.dropLng ?? driver?.dropoffLon],
    [driver?.dropoffLatitude, driver?.dropoffLongitude],
    [driver?.destinationLat, driver?.destinationLng ?? driver?.destinationLon],
    [trip?.dropoffLat ?? trip?.dropLat, trip?.dropoffLng ?? trip?.dropLng ?? trip?.dropoffLon],
    [trip?.dropoffLatitude, trip?.dropoffLongitude],
    [trip?.destinationLat, trip?.destinationLng ?? trip?.destinationLon]
  ];

  for(const [lat,lng] of pairCandidates){
    const point = pointFromLatLng(lat,lng);
    if(validPoint(point)) return point;
  }

  return null;
}

function getTripId(driver){
  const trip = getActiveTripObject(driver);
  return String(
    driver?.tripId ||
    driver?.activeTripId ||
    driver?.currentTripId ||
    trip?.tripId ||
    trip?._id ||
    trip?.id ||
    ""
  ).trim();
}

function estimateEtaRange(miles){

  const distance = Math.max(0, Number(miles || 0));

  if(distance < 0.08){
    return {low:0,high:1,text:"< 1 min"};
  }

  const averageMph =
    distance <= 2 ? 18 :
    distance <= 8 ? 24 :
    distance <= 20 ? 32 :
    40;

  const baseMinutes = (distance / averageMph) * 60;

  const low = Math.max(1, Math.floor(baseMinutes * 0.82));
  const high = Math.max(low + 1, Math.ceil(baseMinutes * 1.22));

  return {
    low,
    high,
    text:`~${low}–${high} min`
  };
}

function buildDriverIcon(driver,id){

  const color = colorFromId(id);
  const name = escapeHtml(getDriverName(driver,id));

  return L.divIcon({
    className:"",
    html:`
      <div class="leaflet-driver-wrap">
        <div class="leaflet-driver-name">${name}</div>
        <div class="leaflet-driver-car" style="background:${color}">🚗</div>
      </div>
    `,
    iconSize:[90,54],
    iconAnchor:[45,44],
    popupAnchor:[0,-35]
  });
}

function highlightDriverCard(id){

  document
    .querySelectorAll(".driver-card")
    .forEach(el => el.classList.remove("active"));

  const target = document.querySelector(
    `.driver-card[data-id="${CSS.escape(String(id))}"]`
  );

  if(target) target.classList.add("active");
}

/* ===============================
   SELECTED DRIVER DIRECT LINE
   ZERO extra requests
================================ */

function clearSelectedVisuals(){

  if(selectedDirectLine){
    map.removeLayer(selectedDirectLine);
    selectedDirectLine = null;
  }

  if(selectedPickupMarker){
    map.removeLayer(selectedPickupMarker);
    selectedPickupMarker = null;
  }

  if(selectedDropoffMarker){
    map.removeLayer(selectedDropoffMarker);
    selectedDropoffMarker = null;
  }
}

function routeInfoHtml(id){

  const summary = selectedRouteSummary.get(String(id || ""));

  if(!summary) return "";

  if(summary.message){
    return `<span class="route-note">${escapeHtml(summary.message)}</span>`;
  }

  return `
    <div class="route-distance">Direct remaining: ~${Number(summary.miles || 0).toFixed(1)} mi</div>
    <div class="route-eta">Estimated time: ${escapeHtml(summary.etaText || "--")}</div>
    <div class="route-note">Approximate • direct line • no routing request</div>
  `;
}

function makePopupHtml(driver,id){

  const tripId = getTripId(driver);
  const summary = selectedRouteSummary.get(String(id || ""));

  const routeDetails =
    summary && !summary.message
      ? `
        <div style="margin-top:7px;padding-top:7px;border-top:1px solid #e2e8f0">
          <b>Direct remaining:</b> ~${Number(summary.miles || 0).toFixed(1)} mi<br>
          <b>Estimated time:</b> ${escapeHtml(summary.etaText || "--")}<br>
          <span style="font-size:10px;color:#64748b">Approximate • direct line • no routing request</span>
        </div>
      `
      : summary?.message
        ? `<div style="margin-top:7px;color:#64748b">${escapeHtml(summary.message)}</div>`
        : "";

  return `
    <div style="min-width:190px">
      <b style="font-size:14px">${escapeHtml(getDriverName(driver,id))}</b><br>
      ${getVehicleText(driver) ? `Vehicle: ${escapeHtml(getVehicleText(driver))}<br>` : ""}
      ${driver?.phone ? `Phone: ${escapeHtml(driver.phone)}<br>` : ""}
      ${tripId ? `Trip: ${escapeHtml(tripId)}<br>` : ""}
      ${routeDetails}
    </div>
  `;
}

function updateSelectedDriverUi(id){

  const key = String(id || "");
  const driver = driverRawData.get(key);
  const marker = driverMarkers.get(key);

  const routeEl = document.querySelector(
    `.driver-route-info[data-route-id="${CSS.escape(key)}"]`
  );

  if(routeEl){
    routeEl.innerHTML = routeInfoHtml(key);
  }

  if(driver && marker){
    marker.setPopupContent(makePopupHtml(driver,key));
  }
}

function drawSelectedDriverDirectLine(id,{fitSelection=false}={}){

  const key = String(id || "");
  const driver = driverRawData.get(key);

  if(!driver || !validPoint(driver)){
    clearSelectedVisuals();
    selectedRouteSummary.set(key,{message:"Driver location unavailable"});
    updateSelectedDriverUi(key);
    return;
  }

  const pickup = getPickupPoint(driver);
  const dropoff = getDropoffPoint(driver);
  const driverPoint = {
    lat:Number(driver.lat),
    lng:Number(driver.lng)
  };

  clearSelectedVisuals();

  if(validPoint(pickup)){
    selectedPickupMarker = L.circleMarker(
      [pickup.lat,pickup.lng],
      {
        radius:7,
        color:"#ffffff",
        weight:2,
        fillColor:"#16a34a",
        fillOpacity:1
      }
    )
      .addTo(map)
      .bindTooltip("Pickup",{direction:"top"});
  }

  if(validPoint(dropoff)){
    selectedDropoffMarker = L.circleMarker(
      [dropoff.lat,dropoff.lng],
      {
        radius:7,
        color:"#ffffff",
        weight:2,
        fillColor:"#dc2626",
        fillOpacity:1
      }
    )
      .addTo(map)
      .bindTooltip("Dropoff",{direction:"top"});

    selectedDirectLine = L.polyline(
      [
        [driverPoint.lat,driverPoint.lng],
        [dropoff.lat,dropoff.lng]
      ],
      {
        color:"#2563eb",
        weight:4,
        opacity:0.9,
        dashArray:"8 7",
        lineCap:"round"
      }
    ).addTo(map);

    const miles = getDistance(driverPoint,dropoff) * 0.621371;
    const eta = estimateEtaRange(miles);

    selectedRouteSummary.set(key,{
      miles,
      etaText:eta.text,
      lowMinutes:eta.low,
      highMinutes:eta.high
    });
  }else{
    selectedRouteSummary.set(key,{
      message:getTripId(driver)
        ? "Dropoff coordinates are not included in the live-drivers response"
        : "No active trip"
    });
  }

  updateSelectedDriverUi(key);

  if(fitSelection){

    const fitPoints = [];

    /*
      User request: clicking driver name zooms between Pickup and Dropoff.
      If either endpoint is unavailable, fall back to the points we do have.
    */
    if(validPoint(pickup))
      fitPoints.push([pickup.lat,pickup.lng]);

    if(validPoint(dropoff))
      fitPoints.push([dropoff.lat,dropoff.lng]);

    if(fitPoints.length < 2)
      fitPoints.push([driverPoint.lat,driverPoint.lng]);

    const bounds = L.latLngBounds(fitPoints);

    if(bounds.isValid()){
      if(fitPoints.length === 1){
        map.setView(fitPoints[0],16,{animate:true});
      }else{
        map.fitBounds(bounds,{
          padding:[55,55],
          maxZoom:16,
          animate:true
        });
      }
    }
  }
}

function selectDriver(id,options={}){

  const key = String(id || "");
  const driver = driverRawData.get(key);
  const marker = driverMarkers.get(key);

  if(!driver) return;

  selectedDriverId = key;
  highlightDriverCard(key);

  drawSelectedDriverDirectLine(
    key,
    {fitSelection:options.fitSelection !== false}
  );

  if(marker && options.openPopup !== false){
    marker.openPopup();
  }
}

function refreshSelectedDriver(){

  if(!selectedDriverId)
    return;

  const driver = driverRawData.get(selectedDriverId);

  if(!driver){
    clearSelectedVisuals();
    selectedRouteSummary.delete(selectedDriverId);
    selectedDriverId = "";
    return;
  }

  /*
    Re-draw from the newest GPS point to the same Dropoff.
    This shortens the direct line and recalculates distance/time,
    using data from the SAME aggregated request.
  */
  drawSelectedDriverDirectLine(
    selectedDriverId,
    {fitSelection:false}
  );
}

/* ===============================
   SIDEBAR
================================ */

function renderSidebar(drivers){

  const listEl = document.getElementById("driversList");
  const countEl = document.getElementById("driversCount");

  if(!listEl || !countEl) return;

  countEl.innerText =
    `${drivers.length} driver${drivers.length === 1 ? "" : "s"} online`;

  if(!drivers.length){
    listEl.innerHTML = `<div class="empty-drivers">No live drivers found</div>`;
    return;
  }

  listEl.innerHTML = drivers.map((driver,index) => {

    const id = String(
      driver.driverId ||
      driver._id ||
      driver.id ||
      ("driver_" + index)
    );

    const color = colorFromId(id);
    const name = escapeHtml(getDriverName(driver,id));
    const vehicle = escapeHtml(getVehicleText(driver) || "No vehicle");
    const phone = escapeHtml(driver.phone || "");
    const tripId = escapeHtml(getTripId(driver));

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

    card.addEventListener("click",() => {

      const id = card.getAttribute("data-id");
      const driver = driverRawData.get(id);

      selectDriver(id,{
        fitSelection:true,
        openPopup:true
      });

      const searchInput = document.getElementById("searchDriver");
      if(searchInput){
        searchInput.value = getDriverName(driver || {},id);
      }
    });
  });

  if(selectedDriverId){
    highlightDriverCard(selectedDriverId);
  }
}

/* ===============================
   SEARCH
================================ */

function bindSearch(){

  const input = document.getElementById("searchDriver");
  if(!input || input.dataset.bound === "1")
    return;

  input.dataset.bound = "1";

  input.addEventListener("input",() => {

    const q = String(input.value || "").trim().toLowerCase();

    document.querySelectorAll(".driver-card").forEach(card => {
      const text = card.innerText.toLowerCase();
      card.style.display = !q || text.includes(q) ? "block" : "none";
    });

    if(!q) return;

    for(const [id,driver] of driverRawData.entries()){

      const name = getDriverName(driver,id).toLowerCase();
      const phone = String(driver.phone || "").toLowerCase();
      const vehicle = String(getVehicleText(driver) || "").toLowerCase();

      if(
        name.includes(q) ||
        phone.includes(q) ||
        vehicle.includes(q)
      ){
        selectDriver(id,{
          fitSelection:true,
          openPopup:false
        });
        break;
      }
    }
  });
}

/* ===============================
   ONE AGGREGATED LIVE REQUEST
================================ */

async function loadLiveDrivers(){

  if(liveRequestInFlight)
    return;

  liveRequestInFlight = true;

  try{

    /*
      This is the ONLY data request made by maps.js.
      It must return all online drivers in one response.
    */
    const res = await fetch(LIVE_DRIVERS_API,{
      cache:"no-store",
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

    drivers.forEach((driver,index) => {

      const id = String(
        driver.driverId ||
        driver._id ||
        driver.id ||
        ("driver_" + index)
      );

      const lat = Number(driver.lat ?? driver.latitude);
      const lng = Number(driver.lng ?? driver.lon ?? driver.longitude);

      if(!id || !Number.isFinite(lat) || !Number.isFinite(lng))
        return;

      onlineIds.add(id);
      bounds.push([lat,lng]);

      const driverData = {
        ...driver,
        driverId:id,
        lat,
        lng
      };

      driverRawData.set(id,driverData);
      cleanedDrivers.push(driverData);

      const popupHtml = makePopupHtml(driverData,id);

      if(driverMarkers.has(id)){

        const marker = driverMarkers.get(id);
        marker.setLatLng([lat,lng]);
        marker.setIcon(buildDriverIcon(driverData,id));
        marker.setPopupContent(popupHtml);

      }else{

        const marker = L.marker([lat,lng],{
          icon:buildDriverIcon(driverData,id)
        }).addTo(map);

        marker.bindPopup(popupHtml);

        marker.on("click",() => {
          selectDriver(id,{
            fitSelection:true,
            openPopup:true
          });
        });

        driverMarkers.set(id,marker);
      }
    });

    /* remove offline drivers */
    driverMarkers.forEach((marker,id) => {

      if(!onlineIds.has(id)){

        map.removeLayer(marker);
        driverMarkers.delete(id);
        driverRawData.delete(id);
        selectedRouteSummary.delete(id);

        if(selectedDriverId === id){
          clearSelectedVisuals();
          selectedDriverId = "";
        }
      }
    });

    cleanedDrivers.sort((a,b) => {
      return getDriverName(a,a.driverId)
        .localeCompare(getDriverName(b,b.driverId));
    });

    renderSidebar(cleanedDrivers);

    /*
      Selected driver's line + direct distance + estimated time
      are recalculated from this same response only.
    */
    refreshSelectedDriver();

    if(bounds.length && firstLoad){

      map.fitBounds(bounds,{
        padding:[60,60]
      });

      firstLoad = false;
    }

  }catch(err){

    console.log("MAP ERROR",err);

    const listEl = document.getElementById("driversList");
    if(listEl){
      listEl.innerHTML =
        `<div class="empty-drivers">Failed to load live drivers</div>`;
    }

  }finally{
    liveRequestInFlight = false;
  }
}

/* ===============================
   START
================================ */

injectMapStyles();
ensureSidebar();
positionDriversSidebarBelowHeader();
watchHeaderPosition();
bindSearch();

setTimeout(positionDriversSidebarBelowHeader,100);
setTimeout(positionDriversSidebarBelowHeader,350);
setTimeout(positionDriversSidebarBelowHeader,800);
setTimeout(positionDriversSidebarBelowHeader,1500);

setTimeout(() => {
  map.invalidateSize(true);
  positionDriversSidebarBelowHeader();
  loadLiveDrivers();
},150);

window.addEventListener("resize",() => {
  map.invalidateSize(false);
  positionDriversSidebarBelowHeader();
});

setInterval(loadLiveDrivers,LIVE_REFRESH_MS);