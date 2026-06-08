/* ==========================================================================
   TRIPS HUB & DISPATCH FINAL CONSOLIDATED V1
   Admin / SuperAdmin / Dispatcher
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services";
const role = localStorage.getItem("role") || "";

if (!["superadmin", "admin", "dispatcher"].includes(role)) {
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE & GLOBALS
================================ */
let hubTrips = [];
let services = [];
let filteredItems = [];
let liveDrivers = [];
const selectedTrips = new Set();

let activeService = "ALL";
let activeDateFilter = "all";

const knownTrips = new Set();
let firstLoadDone = false;
let isEditing = false;
let isAdding = false;

let googleLoadPromise = null;
let dispatchMap = null;
let dispatchMarkers = [];
let dispatchLines = [];
const selectedAddressCache = {};

const container = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const oldAddBtn = document.getElementById("addManualTripBtn");

const individualTab = document.getElementById("individualTab");
const sharedTab = document.getElementById("sharedTab");

if (individualTab?.parentElement) individualTab.parentElement.style.display = "none";
if (sharedTab?.parentElement) sharedTab.parentElement.style.display = "none";
if (!container) console.error("Missing #hubContainer");

/* ===============================
   BUILD UI & INJECT STYLES
================================ */
(function buildUI() {
  const page = document.querySelector(".page-content");
  if (!page || !container) return;

  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) {
    roleBadge.innerText = role.toUpperCase();
  }

  if (oldAddBtn) {
    oldAddBtn.textContent = "+ Add Individual Reservation";
    oldAddBtn.id = "addIndividualReservationBtn";
  }

  if (!document.getElementById("addSharedReservationBtn")) {
    const sharedBtn = document.createElement("button");
    sharedBtn.id = "addSharedReservationBtn";
    sharedBtn.className = "add-btn";
    sharedBtn.type = "button";
    sharedBtn.textContent = "+ Add Shared Reservation";
    sharedBtn.style.display = "none";
    oldAddBtn?.parentElement?.insertBefore(sharedBtn, searchInput || null);
  }

  if (!document.getElementById("sharedPassengerBox")) {
    const box = document.createElement("div");
    box.id = "sharedPassengerBox";
    box.className = "shared-passenger-box";
    box.style.display = "none";
    box.innerHTML = `
      <span>Select passengers:</span>
      <button type="button" data-count="2">2</button>
      <button type="button" data-count="3">3</button>
      <button type="button" data-count="4">4</button>
    `;
    oldAddBtn?.parentElement?.after(box);
  }

  if (!document.getElementById("hubStats")) {
    const stats = document.createElement("div");
    stats.id = "hubStats";
    stats.className = "hub-stats";
    stats.innerHTML = `
      <div class="stat-card new">
        <div class="stat-number" id="newTripsCount">0</div>
        <div class="stat-label">New Today</div>
      </div>
      <div class="stat-card today">
        <div class="stat-number" id="todayTripsCount">0</div>
        <div class="stat-label">Today Trips</div>
      </div>
      <div class="stat-card shared">
        <div class="stat-number" id="sharedTripsCount">0</div>
        <div class="stat-label">Shared Groups</div>
      </div>
      <div class="stat-card reserved">
        <div class="stat-number" id="reservedTripsCount">0</div>
        <div class="stat-label">Reservations</div>
      </div>
      <div class="stat-card total">
        <div class="stat-number" id="totalTripsCount">0</div>
        <div class="stat-label">Total Trips</div>
      </div>
    `;
    page.insertBefore(stats, container);
  }

  if (!document.getElementById("dispatchStats")) {
    const box = document.createElement("div");
    box.id = "dispatchStats";
    box.className = "hub-stats";
    box.innerHTML = `
      <div class="stat-card today">
        <div class="stat-number" id="onlineDriversCount">0</div>
        <div class="stat-label">Drivers Online</div>
      </div>
      <div class="stat-card reserved">
        <div class="stat-number" id="assignedTripsCount">0</div>
        <div class="stat-label">Assigned</div>
      </div>
      <div class="stat-card new">
        <div class="stat-number" id="unassignedTripsCount">0</div>
        <div class="stat-label">Unassigned</div>
      </div>
      <div class="stat-card total">
        <div class="stat-number" id="selectedTripsCount">0</div>
        <div class="stat-label">Selected</div>
      </div>
    `;
    page.insertBefore(box, document.getElementById("hubStats") || container);
  }

  if (!document.getElementById("serviceTabs")) {
    const tabs = document.createElement("div");
    tabs.id = "serviceTabs";
    tabs.className = "service-tabs";
    page.insertBefore(tabs, container);
  }

  if (!document.getElementById("bulkActions")) {
    const bulk = document.createElement("div");
    bulk.id = "bulkActions";
    bulk.className = "date-filters";
    bulk.innerHTML = `
      <button class="date-btn" type="button" onclick="showUnassignedQueue()">Unassigned Queue</button>
      <button class="date-btn" type="button" onclick="bulkConfirmTrips()">Confirm Selected</button>
      <button class="date-btn" type="button" onclick="bulkDeleteTrips()">Delete Selected</button>
      <button class="date-btn" type="button" onclick="clearSelectedTrips()">Clear Selected</button>
    `;
    page.insertBefore(bulk, document.getElementById("serviceTabs") || container);
  }

  if (!document.getElementById("dateFilters")) {
    const filters = document.createElement("div");
    filters.id = "dateFilters";
    filters.className = "date-filters";
    filters.innerHTML = `
      <button class="date-btn" data-filter="today" type="button">Today</button>
      <button class="date-btn" data-filter="tomorrow" type="button">Tomorrow</button>
      <button class="date-btn" data-filter="yesterday" type="button">Yesterday</button>
      <button class="date-btn" data-filter="3days" type="button">3 Days</button>
      <button class="date-btn" data-filter="7days" type="button">7 Days</button>
      <button class="date-btn" data-filter="month" type="button">Month</button>
      <button class="date-btn active" data-filter="all" type="button">All</button>
    `;
    page.insertBefore(filters, container);
  }

  if (!document.getElementById("dispatchMapWrap")) {
    const mapWrap = document.createElement("div");
    mapWrap.id = "dispatchMapWrap";
    mapWrap.className = "dispatch-map-wrap";
    mapWrap.innerHTML = `<div id="dispatchMap"></div>`;
    page.insertBefore(mapWrap, container);
  }
})();

(function injectStyle() {
  if (document.getElementById("trips-hub-final-style")) return;
  const style = document.createElement("style");
  style.id = "trips-hub-final-style";
  style.innerHTML = `
    .hub-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:15px;}
    .stat-card{background:#fff;border-radius:14px;padding:15px;text-align:center;box-shadow:0 6px 16px rgba(15,23,42,.08);border:1px solid #e5edf7;}
    .stat-card.new{border-left:6px solid #16a34a;}
    .stat-card.today{border-left:6px solid #2563eb;}
    .stat-card.shared{border-left:6px solid #7c3aed;}
    .stat-card.reserved{border-left:6px solid #f59e0b;}
    .stat-card.total{border-left:6px solid #111827;}
    .stat-number{font-size:28px;font-weight:900;color:#0f172a;}
    .stat-label{font-size:13px;font-weight:900;color:#64748b;}
    .service-tabs, .date-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}
    .service-tab, .date-btn{border:none;background:#e2e8f0;color:#0f172a;padding:10px 15px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:900;}
    .service-tab.active{background:#2563eb;color:#fff;}
    .date-btn.active{background:#0f172a;color:#fff;}
    .shared-passenger-box{background:#fff;border:1px solid #dbe3ee;border-radius:12px;padding:12px;margin:0 0 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-weight:900;}
    .shared-passenger-box button{border:none;background:#7c3aed;color:#fff;border-radius:8px;padding:8px 14px;font-weight:900;cursor:pointer;}
    .dispatch-map-wrap{background:#fff;border:1px solid #dbe3ee;border-radius:16px;padding:12px;margin:0 0 16px;box-shadow:0 8px 22px rgba(15,23,42,.07);}
    #dispatchMap{width:100%;height:300px;border-radius:12px;background:#e5e7eb;}
    .table-wrap{width:100%;overflow-x:auto;margin-bottom:22px;border-radius:14px;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.08);}
    .hub-table{width:100%;border-collapse:collapse;background:#fff;min-width:1600px;}
    .hub-table th, .hub-table td{border:1px solid #dbe3ee;padding:7px;text-align:center;font-size:12px;vertical-align:middle;}
    .hub-table th{background:#0f172a;color:#fff;font-weight:900;white-space:nowrap;}
    .date-title{font-size:18px;font-weight:900;margin:20px 0 10px;color:#0f172a;}
    .edit-input{width:100%;min-width:115px;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;font-weight:700;}
    .input-wrap{position:relative;width:100遮罩;}
    .suggestions{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #cbd5e1;border-radius:8px;z-index:99999;max-height:220px;overflow:auto;box-shadow:0 12px 24px rgba(0,0,0,.12);margin-top:4px;text-align:left;}
    .option{padding:10px 12px;cursor:pointer;font-size:13px;line-height:1.35;border-bottom:1px solid #eef2f7;background:#fff;color:#111827;}
    .option:hover{background:#eff6ff;}
    .option.disabled{cursor:default;color:#64748b;background:#f8fafc;}
    .multi-line{white-space:pre-line;line-height:1.45;text-align:left;word-break:break-word;}
    .trip-number-badge{font-weight:900;color:#2563eb;white-space:nowrap;}
    .price-badge{font-weight:900;color:#15803d;}
    .miles-strong{font-weight:900;color:#2563eb;}
    .service-pill{display:inline-flex;padding:4px 8px;border-radius:999px;background:#e0edff;color:#1d4ed8;font-size:11px;font-weight:900;white-space:nowrap;}
    .new-badge{display:inline-block;margin-left:5px;padding:2px 7px;border-radius:999px;background:#16a34a;color:#fff;font-size:10px;font-weight:900;}
    .btn{border:none;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:900;cursor:pointer;margin:2px;white-space:nowrap;}
    .edit{background:#2563eb;color:#fff;}
    .save, .confirm{background:#16a34a;color:#fff;}
    .delete{background:#dc2626;color:#fff;}
    .cancel{background:#64748b;color:#fff;}
    .actions-wrap{display:flex;justify-content:center;align-items:center;gap:5px;flex-wrap:wrap;min-width:130px;}
    .scheduled-row{background:#fff;}
    .confirmed-row{background:#dcfce7;}
    .cancelled-row{background:#fecaca;}
    .yellow{background:#fef9c3;}
    .red-light{background:#fecaca;}
    .red-mid{background:#fca5a5;}
    .red-dark{background:#7f1d1d;color:#fff;}
    .past-row{background:#374151;color:#e5e7eb;}
    .new-trip-row td{background:#dcfce7!important;}
    .new-trip-row{animation:newGlow 1.2s infinite;}
    @keyframes newGlow{0%{box-shadow:0 0 0 rgba(22,163,74,.1);}50%{box-shadow:0 0 18px rgba(22,163,74,.45);}100%{box-shadow:0 0 0 rgba(22,163,74,.1);}}
    .no-data{background:#fff;padding:18px;border-radius:14px;box-shadow:0 6px 16px rgba(15,23,42,.08);color:#475569;font-weight:900;}
    @media(max-width:768px){
      #dispatchMap{height:230px;}
      .hub-table{min-width:1350px;}
      .hub-table th, .hub-table td{font-size:10px;padding:5px;}
      .btn{font-size:10px;padding:5px 7px;}
    }
  `;
  document.head.appendChild(style);
})();

/* ===============================
   HELPERS & DATE MATH
================================ */
function safe(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function normalizeText(v) { return String(v ?? "").trim(); }
function normalizeType(v) { return String(v || "").trim().toLowerCase(); }
function cleanStatus(v) { return String(v || "").replace(/\s+/g, "").toLowerCase().trim(); }
function formatMoney(v) { return Number(v || 0).toFixed(2); }
function getTripNumber(t) { return String(t?.tripNumber || t?.id || t?.bookingNumber || "-"); }
function getCreatedDate(t) { return new Date(t?.bookedAt || t?.createdAt || t?.updatedAt || Date.now()); }
function getAZNow() { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })); }
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function displayDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d) ? "-" : d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function bookedDateKey(t) {
  const d = getCreatedDate(t);
  return isNaN(d) ? "Unknown Date" : d.toLocaleDateString();
}
function getTripCreatedKey(t) {
  const d = getCreatedDate(t);
  return isNaN(d) ? "" : dateKey(d);
}
function isTodayTrip(t) { return getTripCreatedKey(t) === dateKey(getAZNow()); }
function isTomorrowTrip(t) {
  const d = getAZNow();
  d.setDate(d.getDate() + 1);
  return getTripCreatedKey(t) === dateKey(d);
}
function isYesterdayTrip(t) {
  const d = getAZNow();
  d.setDate(d.getDate() - 1);
  return getTripCreatedKey(t) === dateKey(d);
}
function withinDays(t, days) {
  const d = getCreatedDate(t);
  return isNaN(d) ? false : (getAZNow().getTime() - d.getTime()) <= days * 86400000;
}
function isThisMonth(t) {
  const d = getCreatedDate(t);
  const now = getAZNow();
  return isNaN(d) ? false : d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function isNewTrip(t) {
  const d = getCreatedDate(t);
  return isNaN(d) ? false : Date.now() - d.getTime() <= 2 * 60 * 60 * 1000;
}
function tripAge(t) {
  const d = getCreatedDate(t);
  if (isNaN(d)) return "-";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "now";
  if (min < 60) return min + " min";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + " hr";
  return Math.floor(hr / 24) + " day";
}
function parseTripDateTime(date, time) {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  return isNaN(dt) ? null : dt;
}
function minutesToTrip(t) {
  const dt = parseTripDateTime(t.tripDate, t.tripTime);
  return dt ? (dt - getAZNow()) / 60000 : null;
}
function shouldRemoveTrip(t) {
  const dt = parseTripDateTime(t.tripDate, t.tripTime);
  return dt ? (getAZNow() - dt) / 3600000 >= 24 : false;
}
function validateFutureTrip(date, time) {
  if (!date || !time) return { ok: false, message: "Missing trip date or time" };
  const dt = parseTripDateTime(date, time);
  if (!dt) return { ok: false, message: "Invalid trip date/time" };
  if (dt <= getAZNow()) return { ok: false, message: "❌ Cannot save trip in the past" };
  return { ok: true };
}
function createEditInput(value, field, type = "text", addrField = "") {
  return `
    <div class="input-wrap">
      <input class="edit-input ${addrField ? "address-input" : ""}" data-field="${field}" data-addr-field="${addrField}" type="${type}" value="${safe(value)}">
    </div>
  `;
}
function nextHourTime() {
  const d = getAZNow();
  d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ===============================
   SERVICES & SHARED TRIP LOGIC
================================ */
function getServiceCodeFromService(service) {
  const suffix = normalizeText(service?.companySuffix || service?.suffix || "").toUpperCase();
  if (suffix) return suffix;
  const key = normalizeText(service?.serviceKey || service?.key || service?.code || service?.title || service?.name || "").toUpperCase();
  if (key === "STANDARD") return "ST";
  if (key === "WHEELCHAIR") return "WH";
  if (key === "SHARED") return "SH";
  if (['LIMOUSINE', 'LIMO'].includes(key)) return "LM";
  if (key === "TAXI") return "TX";
  if (key === "XL") return "XL";
  return key;
}
function isSharedService(service) {
  return (
    service?.companyShared === true || service?.shared === true ||
    ["SHARED", "SH"].includes(String(service?.type || service?.serviceType || service?.serviceKey || service?.companySuffix || service?.suffix || service?.title || service?.name || "").toUpperCase())
  );
}
function hasSharedService() {
  return services.some(isSharedService) || hubTrips.some(isSharedTrip);
}
function getServiceCodeFromTrip(t) {
  const direct = normalizeText(t?.serviceKey || t?.serviceCode || t?.serviceType || t?.serviceSuffix || t?.service || "").toUpperCase();
  if (direct) {
    if (direct === "STANDARD") return "ST";
    if (["WHEELCHAIR", "WC"].includes(direct)) return "WH";
    if (direct === "SHARED") return "SH";
    if (["LIMOUSINE", "LIMO"].includes(direct)) return "LM";
    if (direct === "TAXI") return "TX";
    if (direct === "XL") return "XL";
    return direct;
  }
  const num = normalizeText(t?.tripNumber).toUpperCase();
  if (num.includes("-SH") || normalizeType(t?.type) === "shared") return "SH";
  if (num.includes("-XL")) return "XL";
  if (num.includes("-WH")) return "WH";
  if (num.includes("-TX")) return "TX";
  if (num.includes("-LM")) return "LM";
  if (num.includes("-ST")) return "ST";
  return "ST";
}
function getServiceTitleByCode(code) {
  const c = normalizeText(code).toUpperCase();
  const service = services.find(s => getServiceCodeFromService(s) === c);
  if (service) return service.title || service.name || service.serviceName || service.serviceKey || c;
  if (c === "ALL") return "All";
  if (c === "ST") return "Standard";
  if (c === "XL") return "XL";
  if (c === "WH") return "Wheelchair";
  if (c === "TX") return "Taxi";
  if (c === "LM") return "Limo";
  if (c === "SH") return "Shared";
  return c;
}
function isSharedTrip(t) {
  return (
    t?.isShared === true || String(t?.tripType || "").toUpperCase() === "SHARED" ||
    normalizeType(t?.type) === "shared" || getServiceCodeFromTrip(t) === "SH" ||
    normalizeText(t?.tripNumber).toUpperCase().includes("-SH") || (Array.isArray(t?.passengers) && t.passengers.length > 0)
  );
}
function getSharedKey(t) { return normalizeText(t?.groupId) || normalizeText(t?.tripNumber) || String(t?._id); }
function getRealPassengersFromGroup(group) {
  const first = group[0] || {};
  if (Array.isArray(first.passengers) && first.passengers.length) return first.passengers;
  return group.map((t, i) => ({
    passengerId: "P" + (i + 1),
    name: t.name || t.clientName || "",
    phone: t.phone || t.clientPhone || "",
    clientName: t.clientName || t.name || "",
    clientPhone: t.clientPhone || t.phone || "",
    pickup: t.pickup || "", pickupLat: t.pickupLat || null, pickupLng: t.pickupLng || null,
    dropoff: t.dropoff || "", dropoffLat: t.dropoffLat || null, dropoffLng: t.dropoffLng || null,
    status: t.status || "Scheduled", priceAmount: t.priceAmount || 0, finalPrice: t.finalPrice || 0
  }));
}
function getSharedGroups(list = hubTrips) {
  const map = {};
  list.filter(isSharedTrip).forEach(t => {
    const key = getSharedKey(t);
    if (!map[key]) map[key] = [];
    map[key].push(t);
  });
  return Object.values(map).map(group => group.sort((a, b) => Number(a.passengerIndex || 0) - Number(b.passengerIndex || 0)));
}
function getGroupStatus(group) {
  const passengers = getRealPassengersFromGroup(group);
  if (passengers.length) {
    if (passengers.every(p => cleanStatus(p.status).includes("cancel"))) return "Cancelled";
    if (passengers.every(p => cleanStatus(p.status).includes("confirm"))) return "Confirmed";
    if (passengers.some(p => cleanStatus(p.status).includes("confirm"))) return "Partially Confirmed";
  }
  if (group.every(t => cleanStatus(t.status).includes("cancel"))) return "Cancelled";
  if (group.every(t => cleanStatus(t.status).includes("confirm"))) return "Confirmed";
  return group[0]?.status || "Scheduled";
}
function getGroupPrice(group) {
  const first = group[0] || {};
  const passengers = getRealPassengersFromGroup(group);
  const total = passengers.reduce((sum, p) => sum + Number(p.priceAmount || p.finalPrice || 0), 0);
  return total > 0 ? total : Number(first.priceAmount || first.finalPrice || 0);
}

/* ===============================
   DISPATCH & DRIVER LOGIC
================================ */
function isAssignedTrip(t) {
  return Boolean(t.driverId || t.driver || t.driverName || t.assignedDriver || t.assignedDriverId);
}
function getDriverNameById(id) {
  const d = liveDrivers.find(x => String(x._id || x.id || x.driverId) === String(id));
  return d?.name || d?.fullName || d?.driverName || "";
}
function getAssignedDriverName(t) {
  return t.driverName || t.assignedDriverName || getDriverNameById(t.driverId || t.assignedDriverId) || "";
}
function getUnassignedTrips() {
  return hubTrips.filter(t => {
    if (isSharedTrip(t)) return false;
    const s = cleanStatus(t.status);
    if (s.includes("cancel") || s.includes("complete") || s.includes("noshow")) return false;
    return !isAssignedTrip(t);
  });
}
function getDriverStats() {
  const online = liveDrivers.filter(d => {
    const s = String(d.status || "").toLowerCase();
    return s && !s.includes("offline");
  }).length;
  const assigned = hubTrips.filter(isAssignedTrip).length;
  const unassigned = getUnassignedTrips().length;
  return { online, assigned, unassigned };
}
function calculateDistanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dLng = (Number(lng2) - Number(lng1)) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Number(lat1) * Math.PI / 180) * Math.cos(Number(lat2) * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function getClosestDriver(trip) {
  if (trip.pickupLat == null || trip.pickupLng == null) return null;
  let best = null;
  liveDrivers.forEach(driver => {
    const lat = driver.lat ?? driver.latitude;
    const lng = driver.lng ?? driver.longitude;
    if (lat == null || lng == null) return;
    const miles = calculateDistanceMiles(Number(lat), Number(lng), Number(trip.pickupLat), Number(trip.pickupLng));
    if (!best || miles < best.miles) best = { driver, miles };
  });
  return best;
}
function estimateEtaFromMiles(miles) {
  if (!Number.isFinite(Number(miles))) return "--";
  return Math.max(1, Math.ceil(Number(miles) / 25 * 60)) + " min";
}
function getTripEtaText(t) {
  const best = getClosestDriver(t);
  return best ? `${best.miles.toFixed(1)} mi / ${estimateEtaFromMiles(best.miles)}` : "--";
}
function getDriverIcon(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("available")) return "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
  if (s.includes("assigned")) return "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
  if (s.includes("arrived")) return "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
  if (s.includes("progress") || s.includes("ride")) return "http://maps.google.com/mapfiles/ms/icons/purple-dot.png";
  return "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
}

/* ===============================
   ADDRESS AUTOCOMPLETE (OSM)
================================ */
async function searchAddress(q) {
  const query = normalizeText(q);
  if (query.length < 3) return [];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us&viewbox=-115,35.5,-108.5,31&bounded=1`);
    return res.ok ? await res.json() : [];
  } catch (err) {
    console.error("Address search error:", err);
    return [];
  }
}
function attachAutocomplete(input) {
  if (!input) return;
  const wrap = input.closest(".input-wrap");
  if (!wrap) return;
  const oldBox = wrap.querySelector(".suggestions");
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);
  let timer = null;
  input.setAttribute("autocomplete", "off");

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { box.innerHTML = ""; return; }
    timer = setTimeout(async () => {
      const results = await searchAddress(q);
      if (!results.length) { box.innerHTML = `<div class="option disabled">No results</div>`; return; }
      box.innerHTML = results.map(r => `<div class="option" data-address="${safe(r.display_name)}" data-lat="${safe(r.lat)}" data-lng="${safe(r.lon)}">${safe(r.display_name)}</div>`).join("");
    }, 250);
  });

  box.addEventListener("click", e => {
    const opt = e.target.closest(".option");
    if (!opt || opt.classList.contains("disabled")) return;
    const key = input.dataset.addrField || input.dataset.field || Math.random().toString();
    selectedAddressCache[key] = { address: opt.dataset.address, lat: Number(opt.dataset.lat), lng: Number(opt.dataset.lng) };
    input.value = opt.dataset.address;
    box.innerHTML = "";
  });

  input.addEventListener("blur", () => { setTimeout(() => { box.innerHTML = ""; }, 180); });
}
function attachAllAutocompletes() { document.querySelectorAll(".address-input").forEach(attachAutocomplete); }

/* ===============================
   GOOGLE MAP LAYER
================================ */
async function ensureGoogleLoaded() {
  if (window.google && google.maps) return true;
  if (googleLoadPromise) return googleLoadPromise;
  googleLoadPromise = new Promise(async (resolve) => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (!data.googleKey) { resolve(false); return; }
      const existing = document.querySelector("script[data-google-maps='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        if (window.google && google.maps) resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = script.defer = true;
      script.setAttribute("data-google-maps", "true");
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    } catch (err) { resolve(false); }
  });
  return googleLoadPromise;
}
function collectMapPoints() {
  const points = [];
  filteredItems.forEach(item => {
    if (item.kind === "trip") {
      const t = item.trip;
      if (t.pickupLat != null && t.pickupLng != null) points.push({ type: "pickup", title: getTripNumber(t) + " Pickup", address: t.pickup || "", lat: Number(t.pickupLat), lng: Number(t.pickupLng) });
      if (t.dropoffLat != null && t.dropoffLng != null) points.push({ type: "dropoff", title: getTripNumber(t) + " Dropoff", address: t.dropoff || "", lat: Number(t.dropoffLat), lng: Number(t.dropoffLng) });
    }
    if (item.kind === "shared") {
      const first = item.group[0];
      getRealPassengersFromGroup(item.group).forEach((p, i) => {
        if (p.pickupLat != null && p.pickupLng != null) points.push({ type: "pickup", title: `${getTripNumber(first)} P${i + 1} Pickup`, address: p.pickup || "", lat: Number(p.pickupLat), lng: Number(p.pickupLng) });
        if (p.dropoffLat != null && p.dropoffLng != null) points.push({ type: "dropoff", title: `${getTripNumber(first)} P${i + 1} Dropoff`, address: p.dropoff || "", lat: Number(p.dropoffLat), lng: Number(p.dropoffLng) });
      });
    }
  });
  return points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
async function renderDispatchMap() {
  const mapEl = document.getElementById("dispatchMap");
  if (!mapEl) return;
  if (!(await ensureGoogleLoaded()) || !window.google) { mapEl.innerHTML = "Google Map unavailable"; return; }

  const points = collectMapPoints();
  if (!dispatchMap) {
    dispatchMap = new google.maps.Map(mapEl, { center: { lat: 33.4484, lng: -112.0740 }, zoom: 10, mapTypeControl: false, streetViewControl: false });
  }

  dispatchMarkers.forEach(m => m.setMap(null));
  dispatchLines.forEach(l => l.setMap(null));
  dispatchMarkers = []; dispatchLines = [];

  if (!points.length) {
    dispatchMap.setCenter({ lat: 33.4484, lng: -112.0740 });
    dispatchMap.setZoom(10);
    drawDriversOnMap();
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  points.forEach(p => {
    const pos = { lat: p.lat, lng: p.lng };
    const marker = new google.maps.Marker({ position: pos, map: dispatchMap, label: p.type === "pickup" ? "P" : "D", title: p.title });
    const info = new google.maps.InfoWindow({ content: `<strong>${safe(p.title)}</strong><br>${safe(p.address)}` });
    marker.addListener("click", () => info.open(dispatchMap, marker));
    dispatchMarkers.push(marker);
    bounds.extend(pos);
  });

  if (points.length >= 2) {
    const line = new google.maps.Polyline({ path: points.map(p => ({ lat: p.lat, lng: p.lng })), geodesic: true, strokeOpacity: .8, strokeWeight: 3, map: dispatchMap });
    dispatchLines.push(line);
  }
  dispatchMap.fitBounds(bounds);
  drawDriversOnMap();
}
function drawDriversOnMap() {
  if (!dispatchMap || !window.google) return;
  liveDrivers.forEach(driver => {
    const lat = driver.lat ?? driver.latitude;
    const lng = driver.lng ?? driver.longitude;
    if (lat == null || lng == null) return;
    const marker = new google.maps.Marker({
      position: { lat: Number(lat), lng: Number(lng) },
      map: dispatchMap, icon: getDriverIcon(driver.status),
      title: driver.name || driver.fullName || driver.driverName || "Driver"
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>${safe(driver.name || driver.fullName || driver.driverName || "Driver")}</strong><br>Status: ${safe(driver.status || "--")}<br>Phone: ${safe(driver.phone || driver.driverPhone || "--")}`
    });
    marker.addListener("click", () => info.open(dispatchMap, marker));
    dispatchMarkers.push(marker);
  });
}

/* ===============================
   API REQUESTS & DATA LOADING
================================ */
async function loadServices() {
  try {
    const res = await fetch(SERVICES_URL);
    const data = await res.json();
    services = Array.isArray(data) ? data.filter(s => s && s.enabled !== false) : [];
  } catch (err) { services = []; }
  const sharedBtn = document.getElementById("addSharedReservationBtn");
  if (sharedBtn) sharedBtn.style.display = hasSharedService() ? "inline-block" : "none";
}
async function loadDrivers() {
  try {
    const res = await fetch("/api/drivers/live");
    liveDrivers = res.ok && Array.isArray(await res.clone().json()) ? await res.json() : [];
  } catch (err) { liveDrivers = []; }
  updateDispatchStats();
}
async function loadHubTrips() {
  try {
    const oldCount = hubTrips.length;
    const res = await fetch(API_URL);
    const data = await res.json();
    hubTrips = (Array.isArray(data) ? data : [])
      .filter(t => !shouldRemoveTrip(t))
      .filter(t => ["", "confirmed", "cancelled", "completed", "booked", "scheduled", "autoassigned", "arrived", "inprogress", "noshow"].includes(cleanStatus(t.status)))
      .sort((a, b) => getCreatedDate(b) - getCreatedDate(a));

    hubTrips.forEach(t => {
      const id = String(t._id || "");
      if (id && !knownTrips.has(id) && firstLoadDone && isNewTrip(t)) flashNewTripCard();
      if (id) knownTrips.add(id);
    });
    if (firstLoadDone && oldCount && hubTrips.length > oldCount) flashNewTripCard();
    firstLoadDone = true;
    applyFilters();
  } catch (err) {
    hubTrips = []; filteredItems = []; render();
  }
}
async function postTrip(payload) {
  const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || "Could not add reservation"); }
  return await res.json().catch(() => null);
}

/* ===============================
   OPERATIONS & MUTATIONS
================================ */
async function addIndividualReservation() {
  if (isAdding) return; isAdding = true;
  try {
    const now = getAZNow();
    await postTrip({
      type: "reserved", isShared: false, serviceKey: "STANDARD", status: "Scheduled", company: "", entryName: "Admin Reservation", entryPhone: "", clientName: "New Client", clientPhone: "",
      pickup: "", pickupLat: null, pickupLng: null, stops: [], dropoff: "", dropoffLat: null, dropoffLng: null, notes: "", tripDate: dateKey(now), tripTime: nextHourTime(), createdAt: new Date().toISOString(), bookedAt: new Date().toISOString()
    });
    activeService = "ALL"; await loadHubTrips();
  } catch (err) { alert(err.message || "Could not add reservation"); } finally { isAdding = false; }
}
async function addSharedReservation(count) {
  if (isAdding) return; isAdding = true;
  try {
    const now = getAZNow(); const groupId = "SH-RV-" + Date.now();
    const passengers = Array.from({ length: Number(count || 2) }).map((_, i) => ({
      passengerId: "P" + (i + 1), name: "", phone: "", clientName: "", clientPhone: "", pickup: "", pickupLat: null, pickupLng: null, dropoff: "", dropoffLat: null, dropoffLng: null, status: "Scheduled", priceAmount: 0, finalPrice: 0
    }));
    await postTrip({
      type: "reserved", tripType: "SHARED", isShared: true, serviceKey: "SHARED", serviceCode: "SH", groupId, totalPassengers: passengers.length, passengers, status: "Scheduled", company: "", entryName: "Admin Shared Reservation", entryPhone: "", clientName: "Shared Group", clientPhone: "",
      pickup: "", pickupLat: null, pickupLng: null, dropoff: "", dropoffLat: null, dropoffLng: null, stops: [], notes: "", tripDate: dateKey(now), tripTime: nextHourTime(), createdAt: new Date().toISOString(), bookedAt: new Date().toISOString()
    });
    activeService = "SH"; const box = document.getElementById("sharedPassengerBox"); if (box) box.style.display = "none";
    await loadHubTrips();
  } catch (err) { alert(err.message || "Could not add shared reservation"); } finally { isAdding = false; }
}
async function saveTripConfirm(id) {
  const row = document.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
  const oldTrip = hubTrips.find(t => String(t._id) === String(id));
  if (!row || !oldTrip) return;
  const payload = {};
  row.querySelectorAll(".edit-input").forEach(input => { if (input.dataset.field) payload[input.dataset.field] = input.value; });
  if (!validateFutureTrip(payload.tripDate || oldTrip.tripDate, payload.tripTime || oldTrip.tripTime).ok) { alert(validateFutureTrip(payload.tripDate || oldTrip.tripDate, payload.tripTime || oldTrip.tripTime).message); return; }
  if (selectedAddressCache.pickup && payload.pickup) { payload.pickup = selectedAddressCache.pickup.address; payload.pickupLat = selectedAddressCache.pickup.lat; payload.pickupLng = selectedAddressCache.pickup.lng; }
  if (selectedAddressCache.dropoff && payload.dropoff) { payload.dropoff = selectedAddressCache.dropoff.address; payload.dropoffLat = selectedAddressCache.dropoff.lat; payload.dropoffLng = selectedAddressCache.dropoff.lng; }
  try {
    const res = await fetch(`${API_URL}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Failed to save trip");
    selectedAddressCache.pickup = selectedAddressCache.dropoff = null; isEditing = false; await loadHubTrips();
  } catch (err) { alert(err.message || "Could not save trip"); }
}
async function deleteTripConfirm(id) {
  if (!confirm("Delete this trip?")) return;
  try {
    if (!(await fetch(`${API_URL}/${id}`, { method: "DELETE" })).ok) throw new Error("Failed to delete trip");
    await loadHubTrips();
  } catch (err) { alert(err.message || "Could not delete trip"); }
}
async function saveSharedConfirm(groupId) {
  const row = document.querySelector(`tr[data-group-id="${CSS.escape(String(groupId))}"]`);
  const group = getSharedGroups(hubTrips).find(g => getSharedKey(g[0]) === groupId);
  if (!row || !group) return;
  const first = group[0]; const passengers = getRealPassengersFromGroup(group).map(p => ({ ...p })); const payload = {};
  row.querySelectorAll(".edit-input").forEach(input => {
    const field = input.dataset.field; if (!field) return;
    if (field.startsWith("p_")) {
      const [, idx, key] = field.split("_"); const i = Number(idx); if (!passengers[i]) return;
      if (key === "name") passengers[i].name = passengers[i].clientName = input.value;
      if (key === "phone") passengers[i].phone = passengers[i].clientPhone = input.value;
      if (key === "pickup") { passengers[i].pickup = input.value; const obj = selectedAddressCache[`p_${i}_pickup`]; if (obj) { passengers[i].pickup = obj.address; passengers[i].pickupLat = obj.lat; passengers[i].pickupLng = obj.lng; } }
      if (key === "dropoff") { passengers[i].dropoff = input.value; const obj = selectedAddressCache[`p_${i}_dropoff`]; if (obj) { passengers[i].dropoff = obj.address; passengers[i].dropoffLat = obj.lat; passengers[i].dropoffLng = obj.lng; } }
      return;
    }
    payload[field] = input.value;
  });
  payload.passengers = passengers; payload.totalPassengers = passengers.length; payload.isShared = true; payload.tripType = "SHARED";
  if (!validateFutureTrip(payload.tripDate || first.tripDate, payload.tripTime || first.tripTime).ok) { alert(validateFutureTrip(payload.tripDate || first.tripDate, payload.tripTime || first.tripTime).message); return; }
  try {
    for (const t of group) {
      if (!(await fetch(`${API_URL}/${t._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).ok) throw new Error("Failed to save shared trip");
    }
    isEditing = false; await loadHubTrips();
  } catch (err) { alert(err.message || "Could not save shared trip"); }
}
async function deleteSharedConfirm(groupId) {
  const group = getSharedGroups(hubTrips).find(g => getSharedKey(g[0]) === groupId); if (!group) return;
  if (!confirm("Delete this shared group?")) return;
  try {
    for (const t of group) { if (!(await fetch(`${API_URL}/${t._id}`, { method: "DELETE" })).ok) throw new Error("Failed to delete shared group"); }
    await loadHubTrips();
  } catch (err) { alert(err.message || "Could not delete shared group"); }
}
async function assignDriverToTrip(tripId, driverId) {
  try {
    const driverName = getDriverNameById(driverId);
    const res = await fetch(`${API_URL}/${tripId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId, driverName, assignedDriverId: driverId, assignedDriverName: driverName, status: "AutoAssigned", dispatchSelected: true })
    });
    if (!res.ok) throw new Error("Assignment failed");
    await loadHubTrips();
  } catch (err) { alert(err.message || "Assignment failed"); }
}
async function unassignDriverFromTrip(tripId) {
  try {
    const res = await fetch(`${API_URL}/${tripId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId: null, driverName: "", assignedDriverId: null, assignedDriverName: "", status: "Confirmed" }) });
    if (!res.ok) throw new Error("Unassign failed");
    await loadHubTrips();
  } catch (err) { alert(err.message || "Unassign failed"); }
}
async function handleDriverAssign(tripId, driverId) {
  if (!driverId) { await unassignDriverFromTrip(tripId); return; }
  await assignDriverToTrip(tripId, driverId);
}
async function confirmTrip(id) {
  try {
    if (!(await fetch(`${API_URL}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Confirmed", dispatchSelected: true }) })).ok) throw new Error("Confirm failed");
    await loadHubTrips();
  } catch (err) { alert(err.message || "Could not confirm trip"); }
}
async function confirmShared(groupId) {
  const group = getSharedGroups(hubTrips).find(g => getSharedKey(g[0]) === groupId); if (!group) return;
  try {
    for (const t of group) {
      if (!(await fetch(`${API_URL}/${t._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Confirmed", dispatchSelected: true }) })).ok) throw new Error("Confirm shared failed");
    }
    await loadHubTrips();
  } catch (err) { alert(err.message || "Could not confirm shared group"); }
}

/* ===============================
   FILTERS, SELECTIONS & STATS
================================ */
function getTripsByDateFilter() {
  return hubTrips.filter(t => {
    if (activeDateFilter === "all") return true;
    if (activeDateFilter === "today") return isTodayTrip(t);
    if (activeDateFilter === "tomorrow") return isTomorrowTrip(t);
    if (activeDateFilter === "yesterday") return isYesterdayTrip(t);
    if (activeDateFilter === "3days") return withinDays(t, 3);
    if (activeDateFilter === "7days") return withinDays(t, 7);
    if (activeDateFilter === "month") return isThisMonth(t);
    return true;
  });
}
function buildDisplayItems(trips) {
  if (activeService === "SH") {
    return getSharedGroups(trips).map(group => ({ kind: "shared", id: getSharedKey(group[0]), date: bookedDateKey(group[0]), created: getCreatedDate(group[0]), group }));
  }
  const items = []; const usedShared = new Set();
  trips.forEach(t => {
    if (isSharedTrip(t)) {
      const key = getSharedKey(t); if (usedShared.has(key)) return; usedShared.add(key);
      const group = getSharedGroups(trips).find(g => getSharedKey(g[0]) === key) || [t];
      items.push({ kind: "shared", id: key, date: bookedDateKey(group[0]), created: getCreatedDate(group[0]), group });
      return;
    }
    items.push({ kind: "trip", id: String(t._id), date: bookedDateKey(t), created: getCreatedDate(t), trip: t });
  });
  return items.sort((a, b) => b.created - a.created);
}
function applyFilters() {
  let trips = getTripsByDateFilter();
  if (activeService !== "ALL") trips = trips.filter(t => getServiceCodeFromTrip(t) === activeService);
  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
  if (q) {
    trips = trips.filter(t => [t.tripNumber, t.company, t.entryName, t.entryPhone, t.clientName, t.clientPhone, t.pickup, t.dropoff, t.status, t.tripDate, t.tripTime, Array.isArray(t.passengers) ? JSON.stringify(t.passengers) : ""].join(" ").toLowerCase().includes(q));
  }
  filteredItems = buildDisplayItems(trips);
  updateStats(); updateDispatchStats(); renderServiceTabs(); render(); renderDispatchMap();
}
function updateStats() {
  const todayTrips = hubTrips.filter(isTodayTrip);
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setText("newTripsCount", todayTrips.filter(isNewTrip).length);
  setText("todayTripsCount", todayTrips.length);
  setText("sharedTripsCount", getSharedGroups(hubTrips).length);
  setText("reservedTripsCount", hubTrips.filter(t => normalizeType(t.type) === "reserved").length);
  setText("totalTripsCount", hubTrips.length);
}
function updateDispatchStats() {
  const stats = getDriverStats();
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setText("onlineDriversCount", stats.online);
  setText("assignedTripsCount", stats.assigned);
  setText("unassignedTripsCount", stats.unassigned);
  setText("selectedTripsCount", selectedTrips.size);
}
function toggleTripSelection(id) {
  const key = String(id);
  if (selectedTrips.has(key)) selectedTrips.delete(key); else selectedTrips.add(key);
  updateDispatchStats();
}
function isTripSelected(id) { return selectedTrips.has(String(id)); }
function clearSelectedTrips() { selectedTrips.clear(); updateDispatchStats(); render(); }
async function bulkConfirmTrips() {
  if (!selectedTrips.size) { alert("No trips selected"); return; }
  for (const id of selectedTrips) {
    await fetch(`${API_URL}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Confirmed" }) }).catch(() => null);
  }
  selectedTrips.clear(); await loadHubTrips();
}
async function bulkDeleteTrips() {
  if (!selectedTrips.size) { alert("No trips selected"); return; }
  if (!confirm("Delete selected trips?")) return;
  for (const id of selectedTrips) { await fetch(`${API_URL}/${id}`, { method: "DELETE" }).catch(() => null); }
  selectedTrips.clear(); await loadHubTrips();
}
function showUnassignedQueue() {
  activeService = "ALL"; activeDateFilter = "all";
  filteredItems = buildDisplayItems(getUnassignedTrips());
  updateStats(); updateDispatchStats(); renderServiceTabs(); render(); renderDispatchMap();
}

/* ===============================
   VIEW & HTML RENDERING
================================ */
function renderServiceTabs() {
  const wrap = document.getElementById("serviceTabs"); if (!wrap) return;
  const base = getTripsByDateFilter();
  const map = new Map([["ALL", "All"]]);
  services.forEach(s => { const c = getServiceCodeFromService(s); if (c) map.set(c, s.title || s.name || s.serviceName || s.serviceKey || c); });
  hubTrips.forEach(t => { const c = getServiceCodeFromTrip(t); if (c && !map.has(c)) map.set(c, getServiceTitleByCode(c)); });
  if (hasSharedService()) map.set("SH", "Shared");

  wrap.innerHTML = Array.from(map.entries()).map(([code, title]) => {
    let count = code === "ALL" ? buildDisplayItems(base).length : (code === "SH" ? getSharedGroups(base).length : base.filter(t => getServiceCodeFromTrip(t) === code).length);
    return `<button class="service-tab ${activeService === code ? "active" : ""}" data-service="${safe(code)}" type="button">${safe(title)} (${count})</button>`;
  }).join("");

  wrap.querySelectorAll(".service-tab").forEach(btn => { btn.onclick = () => { activeService = btn.dataset.service || "ALL"; applyFilters(); }; });
}
function applyRowColor(tr, t) {
  if (isNewTrip(t)) { tr.classList.add("new-trip-row"); return; }
  const mins = minutesToTrip(t); const status = cleanStatus(t.status);
  if (status.includes("cancel")) { tr.classList.add("cancelled-row"); return; }
  if (mins !== null && mins <= 0) { tr.classList.add("past-row"); return; }
  if (mins !== null) {
    if (mins <= 30) tr.classList.add("red-dark");
    else if (mins <= 60) tr.classList.add("red-mid");
    else if (mins <= 120) tr.classList.add("red-light");
    else if (mins <= 180) tr.classList.add("yellow");
    else if (status.includes("confirm")) tr.classList.add("confirmed-row");
    else tr.classList.add("scheduled-row");
  }
}
function driverSelectHtml(trip) {
  const current = trip.driverId || trip.assignedDriverId || "";
  const options = liveDrivers.map(d => {
    const id = d._id || d.id || d.driverId;
    return `<option value="${safe(id)}" ${String(current) === String(id) ? "selected" : ""}>${safe(d.name || d.fullName || d.driverName || "Driver")} ${d.status ? " - " + safe(d.status) : ""}</option>`;
  }).join("");
  return `<select class="edit-input" onchange="handleDriverAssign('${trip._id}', this.value)"><option value="">-- Assign --</option>${options}</select>`;
}
function render() {
  if (!container) return; container.innerHTML = "";
  if (!filteredItems.length) { container.innerHTML = `<p class="no-data">No trips found</p>`; return; }

  const groups = {};
  filteredItems.forEach(item => { const key = item.date || "Unknown Date"; if (!groups[key]) groups[key] = []; groups[key].push(item); });

  let globalIndex = 0;
  Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
    const title = document.createElement("div"); title.className = "date-title"; title.textContent = date; container.appendChild(title);
    const wrap = document.createElement("div"); wrap.className = "table-wrap";
    const table = document.createElement("table"); table.className = "hub-table";

    const isSharedOnly = activeService === "SH";
    table.innerHTML = `
      <tr>
        ${!isSharedOnly ? '<th>Select</th>' : ''}
        <th>#</th>
        <th>${isSharedOnly ? 'Group #' : 'Trip #'}</th>
        <th>Service</th>
        <th>Type</th>
        ${!isSharedOnly ? '<th>Source</th>' : ''}
        <th>Company</th>
        <th>Entry</th>
        <th>Entry Phone</th>
        <th>Client / Passengers</th>
        <th>Phone</th>
        <th>Pickup</th>
        ${!isSharedOnly ? '<th>Stops</th>' : ''}
        <th>Dropoff</th>
        <th>Trip Date</th>
        <th>Time</th>
        <th>Status</th>
        ${!isSharedOnly ? '<th>Driver</th><th>Closest / ETA</th>' : ''}
        <th>Price</th>
        <th>Miles</th>
        <th>Booked</th>
        <th>Age</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach(item => {
      globalIndex++;
      table.appendChild(item.kind === "shared" ? renderSharedRow(item.group, globalIndex, !isSharedOnly) : renderTripRow(item.trip, globalIndex));
    });
    wrap.appendChild(table); container.appendChild(wrap);
  });
}
function renderTripRow(t, index) {
  const tr = document.createElement("tr"); tr.dataset.id = String(t._id);
  const editing = t.__editing === true; const serviceCode = getServiceCodeFromTrip(t); const stops = Array.isArray(t.stops) ? t.stops : [];
  applyRowColor(tr, t);
  const driverName = getAssignedDriverName(t);

  tr.innerHTML = `
    <td><input type="checkbox" ${isTripSelected(t._id) ? "checked" : ""} onchange="toggleTripSelection('${t._id}')"></td>
    <td>${index}</td>
    <td><span class="trip-number-badge">${safe(getTripNumber(t))}</span>${isNewTrip(t) ? '<span class="new-badge">NEW</span>' : ''}</td>
    <td><span class="service-pill">${safe(getServiceTitleByCode(serviceCode))}</span></td>
    <td>${safe(t.type || "Trip")}</td>
    <td>${safe(t.source || t.from || "--")}</td>
    <td>${editing ? createEditInput(t.company || "", "company") : safe(t.company || "")}</td>
    <td>${editing ? createEditInput(t.entryName || "", "entryName") : safe(t.entryName || "")}</td>
    <td>${editing ? createEditInput(t.entryPhone || "", "entryPhone") : safe(t.entryPhone || "")}</td>
    <td>${editing ? createEditInput(t.clientName || "", "clientName") : `<div class="multi-line">${safe(t.clientName || "")}</div>`}</td>
    <td>${editing ? createEditInput(t.clientPhone || "", "clientPhone") : safe(t.clientPhone || "")}</td>
    <td>${editing ? createEditInput(t.pickup || "", "pickup", "text", "pickup") : `<div class="multi-line">${safe(t.pickup || "")}</div>`}</td>
    <td><div class="multi-line">${stops.length ? stops.map(safe).join("<br>") : "--"}</div></td>
    <td>${editing ? createEditInput(t.dropoff || "", "dropoff", "text", "dropoff") : `<div class="multi-line">${safe(t.dropoff || "")}</div>`}</td>
    <td>${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : safe(t.tripDate || "")}</td>
    <td>${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : safe(t.tripTime || "")}</td>
    <td><strong>${safe(t.status || "Scheduled")}</strong></td>
    <td>${driverSelectHtml(t)}${driverName ? `<div style="font-size:11px;font-weight:900;color:#15803d;margin-top:4px">${safe(driverName)}</div>` : ""}</td>
    <td>${safe(getTripEtaText(t))}</td>
    <td><span class="price-badge">$${formatMoney(t.priceAmount || t.finalPrice)}</span></td>
    <td><span class="miles-strong">${t.miles ? Number(t.miles).toFixed(1) + " mi" : "--"}</span></td>
    <td>${safe(displayDateTime(t.bookedAt || t.createdAt))}</td>
    <td>${safe(tripAge(t))}</td>
    <td>
      <div class="actions-wrap">
        ${editing ? `<button class="btn save" onclick="saveTripConfirm('${t._id}')">Save</button><button class="btn cancel" onclick="cancelEdit()">Cancel</button>` :
                    `<button class="btn confirm" onclick="confirmTrip('${t._id}')">Confirm</button><button class="btn edit" onclick="editTripConfirm('${t._id}')">Edit</button><button class="btn delete" onclick="deleteTripConfirm('${t._id}')">Delete</button>`}
      </div>
    </td>
  `;
  return tr;
}
function renderSharedRow(group, index, compact = false) {
  const first = group[0] || {}; const passengers = getRealPassengersFromGroup(group);
  const editing = group.some(t => t.__editing === true) || first.__editing === true;
  const tr = document.createElement("tr"); tr.dataset.groupId = getSharedKey(first);
  applyRowColor(tr, first);

  const buildFieldWrap = (key, prop) => editing ? passengers.map((p, i) => createEditInput(p[prop] || "", `p_${i}_${key}`, "text", `p_${i}_${key}`)).join("") : passengers.map((p, i) => `${i + 1}. ${safe(p[prop] || "")}`).join("\n");
  const clients = buildFieldWrap("name", "name"), phones = buildFieldWrap("phone", "phone"), pickups = buildFieldWrap("pickup", "pickup"), drops = buildFieldWrap("dropoff", "dropoff");

  if (compact) {
    tr.innerHTML = `
      <td></td><td>${index}</td><td><span class="trip-number-badge">${safe(getTripNumber(first))}</span>${isNewTrip(first) ? '<span class="new-badge">NEW</span>' : ''}</td>
      <td><span class="service-pill">Shared</span></td><td>Shared</td><td>${safe(first.source || first.from || "--")}</td>
      <td>${editing ? createEditInput(first.company || "", "company") : safe(first.company || "")}</td>
      <td>${editing ? createEditInput(first.entryName || "", "entryName") : safe(first.entryName || "")}</td>
      <td>${editing ? createEditInput(first.entryPhone || "", "entryPhone") : safe(first.entryPhone || "")}</td>
      <td><div class="multi-line">${clients}</div></td><td><div class="multi-line">${phones}</div></td><td><div class="multi-line">${pickups}</div></td>
      <td><strong>${Math.max(0, passengers.length - 1)}</strong></td><td><div class="multi-line">${drops}</div></td>
      <td>${editing ? createEditInput(first.tripDate || "", "tripDate", "date") : safe(first.tripDate || "")}</td>
      <td>${editing ? createEditInput(first.tripTime || "", "tripTime", "time") : safe(first.tripTime || "")}</td>
      <td><strong>${safe(getGroupStatus(group))}</strong></td><td>Shared Group</td><td>--</td>
      <td><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td><td><span class="miles-strong">${first.miles ? Number(first.miles).toFixed(1) + " mi" : "--"}</span></td>
      <td>${safe(displayDateTime(first.bookedAt || first.createdAt))}</td><td>${safe(tripAge(first))}</td>
      <td><div class="actions-wrap">${editing ? `<button class="btn save" onclick="saveSharedConfirm('${getSharedKey(first)}')">Save</button><button class="btn cancel" onclick="cancelEdit()">Cancel</button>` : `<button class="btn confirm" onclick="confirmShared('${getSharedKey(first)}')">Confirm</button><button class="btn edit" onclick="editSharedConfirm('${getSharedKey(first)}')">Edit</button><button class="btn delete" onclick="deleteSharedConfirm('${getSharedKey(first)}')">Delete</button>`}</div></td>
    `;
    return tr;
  }

  tr.innerHTML = `
    <td>${index}</td><td><span class="trip-number-badge">${safe(getTripNumber(first))}</span>${isNewTrip(first) ? '<span class="new-badge">NEW</span>' : ''}</td>
    <td><span class="service-pill">Shared</span></td>
    <td>${editing ? createEditInput(first.entryName || "", "entryName") : safe(first.entryName || "")}</td>
    <td>${editing ? createEditInput(first.entryPhone || "", "entryPhone") : safe(first.entryPhone || "")}</td>
    <td><strong>${passengers.length}</strong></td><td><div class="multi-line">${clients}</div></td><td><div class="multi-line">${phones}</div></td>
    <td><div class="multi-line">${pickups}</div></td><td><div class="multi-line">${drops}</div></td>
    <td>${editing ? createEditInput(first.tripDate || "", "tripDate", "date") : safe(first.tripDate || "")}</td>
    <td>${editing ? createEditInput(first.tripTime || "", "tripTime", "time") : safe(first.tripTime || "")}</td>
    <td><strong>${safe(getGroupStatus(group))}</strong></td><td><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td>
    <td><span class="miles-strong">${first.miles ? Number(first.miles).toFixed(1) + " mi" : "--"}</span></td>
    <td>${safe(displayDateTime(first.bookedAt || first.createdAt))}</td><td>${safe(tripAge(first))}</td>
    <td><div class="actions-wrap">${editing ? `<button class="btn save" onclick="saveSharedConfirm('${getSharedKey(first)}')">Save</button><button class="btn cancel" onclick="cancelEdit()">Cancel</button>` : `<button class="btn confirm" onclick="confirmShared('${getSharedKey(first)}')">Confirm</button><button class="btn edit" onclick="editSharedConfirm('${getSharedKey(first)}')">Edit</button><button class="btn delete" onclick="deleteSharedConfirm('${getSharedKey(first)}')">Delete</button>`}</div></td>
  `;
  return tr;
}
function editTripConfirm(id) { const t = hubTrips.find(x => String(x._id) === String(id)); if (t) { t.__editing = true; isEditing = true; render(); setTimeout(attachAllAutocompletes, 50); } }
function editSharedConfirm(groupId) { const g = getSharedGroups(hubTrips).find(x => getSharedKey(x[0]) === groupId); if (g) { g.forEach(t => t.__editing = true); isEditing = true; render(); setTimeout(attachAllAutocompletes, 50); } }
function cancelEdit() { isEditing = false; hubTrips.forEach(t => delete t.__editing); applyFilters(); }
function flashNewTripCard() { const c = document.querySelector(".stat-card.new"); if (c) c.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 900, iterations: 3 }); }

/* ===============================
   EVENTS & AUTO-REFRESH INITIALIZATION
================================ */
searchInput?.addEventListener("input", applyFilters);
document.getElementById("addIndividualReservationBtn")?.addEventListener("click", e => { e.preventDefault(); addIndividualReservation(); });
document.getElementById("addSharedReservationBtn")?.addEventListener("click", e => { e.preventDefault(); const box = document.getElementById("sharedPassengerBox"); if (box) box.style.display = box.style.display === "none" ? "flex" : "none"; });
document.getElementById("sharedPassengerBox")?.addEventListener("click", e => { const btn = e.target.closest("button[data-count]"); if (btn) addSharedReservation(Number(btn.dataset.count || 2)); });
document.querySelectorAll(".date-btn").forEach(btn => { btn.onclick = () => { document.querySelectorAll(".date-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); activeDateFilter = btn.dataset.filter || "all"; applyFilters(); }; });

// إسناد الدوال للـ Window لتعمل الأزرار الديناميكية (onclick) بشكل سليم
Object.assign(window, {
  editTripConfirm, saveTripConfirm, deleteTripConfirm, editSharedConfirm, saveSharedConfirm, deleteSharedConfirm, cancelEdit,
  confirmTrip, confirmShared, handleDriverAssign, toggleTripSelection, bulkConfirmTrips, bulkDeleteTrips, clearSelectedTrips, showUnassignedQueue
});

// الدالة الموحدة لجلب وتحديث كل البيانات بدون تعارض
async function refreshEverything() {
  if (isEditing) return;
  await loadServices();
  await loadDrivers();
  await loadHubTrips();
}

// دالة البدء الذاتي الفورية (Initialization)
(async function initHub() {
  document.querySelectorAll(".date-btn").forEach(b => { if (b.dataset.filter === activeDateFilter) b.classList.add("active"); });
  await refreshEverything();
  setTimeout(renderDispatchMap, 500);
  setInterval(refreshEverything, 30000); // تحديث دوري نظيف كل 30 ثانية
})();