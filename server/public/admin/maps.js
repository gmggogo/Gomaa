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
      top:130px;
      right:14px;
      width:290px;
      max-height:calc(100vh - 150px);
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

    @media(max-width:900px){
      .drivers-sidebar{
        width:220px;
        top:120px;
        right:8px;
        max-height:calc(100vh - 140px);
      }
    }

    @media(max-width:700px){
      .drivers-sidebar{
        width:180px;
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
      </div>
    `;

  }).join("");

  listEl.querySelectorAll(".driver-card").forEach(card => {
    card.addEventListener("click", () => {

      const id = card.getAttribute("data-id");
      const marker = driverMarkers.get(id);
      const driver = driverRawData.get(id);

      highlightDriverCard(id);

      if(marker){
        map.setView(marker.getLatLng(), 16, {
          animate: true
        });

        marker.openPopup();
      }

      const searchInput = document.getElementById("searchDriver");
      if(searchInput){
        searchInput.value = getDriverName(driver || {}, id);
      }
    });
  });

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
      cache: "no-store"
    });

    if(!res.ok){
      throw new Error("Failed to load live drivers");
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
        <div style="min-width:180px">
          <b style="font-size:14px">${escapeHtml(getDriverName(driverData, id))}</b><br>
          Driver ID: ${escapeHtml(id)}<br>
          ${getVehicleText(driverData) ? `Vehicle: ${escapeHtml(getVehicleText(driverData))}<br>` : ""}
          ${driverData.phone ? `Phone: ${escapeHtml(driverData.phone)}<br>` : ""}
          ${driverData.tripId ? `Trip: ${escapeHtml(driverData.tripId)}<br>` : ""}
          Lat: ${lat}<br>
          Lng: ${lng}
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
          highlightDriverCard(id);
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
bindSearch();
loadLiveDrivers();
setInterval(loadLiveDrivers, 30000);