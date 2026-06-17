// ===============================
// ADMIN LIVE MAP - FINAL PRO
// Colored Drivers + Labels + Sidebar
// ===============================

const LIVE_DRIVERS_API = "/api/admin/live-drivers";
const REFRESH_MS = 30000;

const COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f97316", "#8b5cf6",
  "#14b8a6", "#eab308", "#ec4899", "#06b6d4", "#84cc16",
  "#f43f5e", "#6366f1", "#10b981", "#f59e0b", "#a855f7",
  "#0ea5e9", "#65a30d", "#dc2626", "#7c3aed", "#0891b2"
];

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
const driverColors = new Map();

let firstLoad = true;

/* ===============================
   SIDEBAR AUTO BUILD
=============================== */

function buildSidebar(){

  if(document.getElementById("driversSidebar")){
    return;
  }

  const sidebar = document.createElement("div");

  sidebar.id = "driversSidebar";

  sidebar.innerHTML = `
    <div class="drivers-side-title">
      ONLINE DRIVERS
      <span id="driversCount">0</span>
    </div>
    <div id="driversList" class="drivers-list"></div>
  `;

  document.body.appendChild(sidebar);

  const style = document.createElement("style");

  style.innerHTML = `
    #driversSidebar{
      position:fixed;
      top:90px;
      right:14px;
      width:260px;
      max-height:calc(100vh - 120px);
      background:#0f172a;
      color:white;
      z-index:9999;
      border-radius:14px;
      box-shadow:0 12px 30px rgba(0,0,0,.35);
      overflow:hidden;
      font-family:Segoe UI,Arial,sans-serif;
    }

    .drivers-side-title{
      padding:14px;
      background:#111827;
      font-size:14px;
      font-weight:900;
      display:flex;
      justify-content:space-between;
      align-items:center;
      color:#facc15;
      border-bottom:1px solid rgba(255,255,255,.08);
    }

    #driversCount{
      background:#2563eb;
      color:white;
      padding:3px 9px;
      border-radius:999px;
      font-size:12px;
    }

    .drivers-list{
      max-height:calc(100vh - 175px);
      overflow-y:auto;
    }

    .driver-row{
      display:flex;
      align-items:center;
      gap:10px;
      padding:12px 13px;
      cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,.06);
      transition:.15s;
    }

    .driver-row:hover{
      background:#1e293b;
    }

    .driver-dot{
      width:14px;
      height:14px;
      border-radius:50%;
      flex:0 0 auto;
      border:2px solid white;
    }

    .driver-info{
      flex:1;
      min-width:0;
    }

    .driver-name{
      font-size:14px;
      font-weight:900;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .driver-sub{
      font-size:12px;
      color:#cbd5e1;
      margin-top:2px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .driver-time{
      font-size:11px;
      color:#94a3b8;
      margin-top:2px;
    }

    .driver-label{
      background:white;
      color:#111827;
      border:2px solid currentColor;
      border-radius:999px;
      padding:3px 8px;
      font-size:12px;
      font-weight:900;
      box-shadow:0 4px 12px rgba(0,0,0,.25);
      white-space:nowrap;
    }

    .driver-marker-dot{
      width:20px;
      height:20px;
      border-radius:50%;
      border:3px solid white;
      box-shadow:0 3px 10px rgba(0,0,0,.35);
    }

    @media(max-width:800px){
      #driversSidebar{
        width:220px;
        top:80px;
        right:8px;
      }
    }
  `;

  document.head.appendChild(style);

}

buildSidebar();

/* ===============================
   HELPERS
=============================== */

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function getDriverName(driver, id){
  return (
    driver.name ||
    driver.driverName ||
    driver.username ||
    driver.vehicleNumber ||
    `Driver ${id}`
  );
}

function getDriverColor(id){

  const key = String(id || "");

  if(driverColors.has(key)){
    return driverColors.get(key);
  }

  let hash = 0;

  for(let i = 0; i < key.length; i++){
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }

  const color = COLORS[Math.abs(hash) % COLORS.length];

  driverColors.set(key, color);

  return color;

}

function formatTime(v){

  if(!v) return "";

  const d = new Date(v);

  if(Number.isNaN(d.getTime())){
    return "";
  }

  return d.toLocaleTimeString("en-US", {
    hour:"numeric",
    minute:"2-digit"
  });

}

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

/* ===============================
   ICONS
=============================== */

function createDriverIcon(driver, id){

  const color = getDriverColor(id);
  const name = esc(getDriverName(driver, id));

  return L.divIcon({
    className:"",
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        transform:translateY(-18px);
      ">
        <div class="driver-label" style="border-color:${color}; color:${color};">
          ${name}
        </div>
        <div class="driver-marker-dot" style="background:${color};"></div>
      </div>
    `,
    iconSize:[120,50],
    iconAnchor:[60,42],
    popupAnchor:[0,-45]
  });

}

/* ===============================
   DRAW PATH
=============================== */

function drawPath(id){

  const path = driverPaths.get(id);

  if(!path || path.length < 2) return;

  const latlngs = path.map(p => [p.lat, p.lng]);
  const color = getDriverColor(id);

  if(driverPolylines.has(id)){

    driverPolylines.get(id).setLatLngs(latlngs);
    driverPolylines.get(id).setStyle({ color });

  }else{

    const poly = L.polyline(latlngs, {
      color,
      weight: 4,
      opacity: .85
    }).addTo(map);

    driverPolylines.set(id, poly);

  }

}

/* ===============================
   SIDEBAR RENDER
=============================== */

function renderSidebar(drivers){

  const list = document.getElementById("driversList");
  const count = document.getElementById("driversCount");

  if(!list || !count) return;

  count.textContent = drivers.length;

  if(!drivers.length){

    list.innerHTML = `
      <div style="padding:15px;color:#94a3b8;font-weight:700;">
        No online drivers
      </div>
    `;

    return;

  }

  list.innerHTML = drivers.map(driver => {

    const id = String(
      driver.driverId ||
      driver.tripId ||
      driver._id ||
      driver.id ||
      ""
    );

    const color = getDriverColor(id);
    const name = esc(getDriverName(driver, id));
    const vehicle = esc(driver.vehicleNumber || driver.vehicle || "");
    const routeMode = esc(driver.routeMode || "");
    const updatedAt = formatTime(driver.updatedAt || driver.lastSeen);

    return `
      <div class="driver-row" data-driver-id="${esc(id)}">
        <div class="driver-dot" style="background:${color};"></div>
        <div class="driver-info">
          <div class="driver-name">${name}</div>
          <div class="driver-sub">
            ${vehicle ? "Vehicle: " + vehicle : "Online"}
            ${routeMode ? " • " + routeMode : ""}
          </div>
          <div class="driver-time">
            ${updatedAt ? "Last update: " + updatedAt : ""}
          </div>
        </div>
      </div>
    `;

  }).join("");

  list.querySelectorAll(".driver-row").forEach(row => {

    row.addEventListener("click", () => {

      const id = row.getAttribute("data-driver-id");
      focusDriver(id);

    });

  });

}

/* ===============================
   FOCUS DRIVER
=============================== */

function focusDriver(id){

  const marker = driverMarkers.get(String(id));

  if(!marker) return;

  const latlng = marker.getLatLng();

  map.setView(latlng, 17, {
    animate:true
  });

  marker.openPopup();

}

/* ===============================
   LOAD LIVE DRIVERS
=============================== */

async function loadLiveDrivers(){

  try{

    const res = await fetch(LIVE_DRIVERS_API, {
      cache:"no-store"
    });

    if(!res.ok){
      throw new Error("Failed to load live drivers");
    }

    const data = await res.json();

    const drivers = Array.isArray(data)
      ? data
      : (data.drivers || []);

    const validDrivers = [];
    const bounds = [];
    const onlineIds = new Set();

    drivers.forEach((driver, index) => {

      const id = String(
        driver.driverId ||
        driver.tripId ||
        driver._id ||
        driver.id ||
        ("driver_" + index)
      );

      const lat = Number(driver.lat);
      const lng = Number(driver.lng);

      if(!id || !Number.isFinite(lat) || !Number.isFinite(lng)){
        return;
      }

      validDrivers.push(driver);
      onlineIds.add(id);
      bounds.push([lat, lng]);

      const color = getDriverColor(id);
      const name = getDriverName(driver, id);

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

      const popupHTML = `
        <b style="color:${color};">${esc(name)}</b><br>
        Driver ID: ${esc(id)}<br>
        ${driver.phone ? "Phone: " + esc(driver.phone) + "<br>" : ""}
        ${driver.vehicleNumber ? "Vehicle: " + esc(driver.vehicleNumber) + "<br>" : ""}
        ${driver.routeMode ? "Mode: " + esc(driver.routeMode) + "<br>" : ""}
        ${driver.updatedAt ? "Updated: " + esc(formatTime(driver.updatedAt)) : ""}
      `;

      if(driverMarkers.has(id)){

        const marker = driverMarkers.get(id);
        marker.setLatLng([lat, lng]);
        marker.setIcon(createDriverIcon(driver, id));
        marker.setPopupContent(popupHTML);

      }else{

        const marker = L.marker([lat, lng], {
          icon:createDriverIcon(driver, id)
        }).addTo(map);

        marker.bindPopup(popupHTML);

        driverMarkers.set(id, marker);

      }

    });

    renderSidebar(validDrivers);

    /* ===============================
       REMOVE OFFLINE MARKERS
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

      }

    });

    /* ===============================
       FIRST ZOOM
    =============================== */

    if(bounds.length && firstLoad){

      map.fitBounds(bounds, {
        padding: [70, 320]
      });

      firstLoad = false;

    }

  }catch(err){

    console.log("MAP ERROR", err);

  }

}

/* ===============================
   REFRESH
=============================== */

loadLiveDrivers();
setInterval(loadLiveDrivers, REFRESH_MS);