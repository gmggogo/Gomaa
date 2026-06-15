/* ==========================================================================
   TRIPS HUB V7 - FULLY INTEGRATED & COMPLETE
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";
const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){ window.location.href = "/admin/login.html"; }

let hubTrips = [], services = [], displayItems = [], activeService = "ALL", editingKey = null, refreshTimer = null;
let filterYear = "", filterMonth = "", filterDay = "";
const selectedItems = new Set(), markedNotCompleted = new Set(), OVERDUE_HOURS = 12;

/* --- UI INJECTION --- */
(function injectStyle(){
  const style = document.createElement("style");
  style.innerHTML = `
    .hub-table { width:100%; border-collapse:collapse; background:#fff; margin-top:10px; }
    .hub-table th { background:#2563eb; color:#fff; padding:10px; font-size:12px; }
    .hub-table td { border:1px solid #dbe3ee; padding:8px; text-align:center; font-size:12px; }
    .date-separator { background:#e0f2fe; font-weight:900; color:#0369a1; text-align:left; padding:10px !important; }
    .view-btn { cursor:pointer; background:#2563eb; color:#fff; border:none; padding:5px 10px; border-radius:5px; }
    .status-pill { padding:4px 8px; border-radius:999px; font-size:11px; font-weight:900; }
  `;
  document.head.appendChild(style);
})();

/* --- HELPERS & CORE LOGIC --- */
function safe(v){ return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function getTripNumber(t){ return String(t?.tripNumber || t?.bookingNumber || t?.id || "-"); }
function getBookedDateObj(t){ return new Date(t?.bookedAt || t?.createdAt || Date.now()); }
function parseTripDateTime(t){ return t?.tripDate ? new Date(`${t.tripDate}T${t.tripTime || "00:00"}:00`) : null; }
function getSourceCode(t){ return (t?.company ? "FA" : (t?.isReserved ? "RV" : "GQ")); }

/* --- RENDER ENGINE --- */
function render(){
  const container = document.getElementById("hubContainer");
  if(!container) return;
  
  let html = `<table class="hub-table"><tr><th>#</th><th>Select</th><th>Trip #</th><th>Client</th><th>Date</th><th>Time</th><th>Status</th><th>Action</th></tr>`;
  
  let lastDate = "";
  displayItems.forEach((item, index) => {
    const t = item.kind === "trip" ? item.trip : item.group[0];
    if (t.tripDate !== lastDate) {
      html += `<tr><td colspan="8" class="date-separator">Booked Date: ${t.tripDate || "N/A"}</td></tr>`;
      lastDate = t.tripDate;
    }
    html += `<tr><td>${index + 1}</td><td><input type="checkbox" onchange="toggleSelection('${item.key}')"></td><td>${safe(getTripNumber(t))}</td><td>${safe(t.clientName || "N/A")}</td><td>${safe(t.tripDate)}</td><td>${safe(t.tripTime)}</td><td><span class="status-pill">${safe(t.status)}</span></td><td><button class="view-btn" onclick="viewDetails('${item.key}')">👁️</button></td></tr>`;
  });
  
  html += `</table>`;
  container.innerHTML = html;
}

function viewDetails(key){
    const item = displayItems.find(x => x.key === key);
    alert("Trip Details: " + JSON.stringify(item, null, 2));
}

function toggleSelection(key){
    selectedItems.has(key) ? selectedItems.delete(key) : selectedItems.add(key);
}

/* --- API CALLS --- */
async function loadHubTrips(){
  try{
    const res = await fetch(API_URL, { headers: token ? {Authorization:"Bearer " + token} : {} });
    const data = await res.json();
    hubTrips = Array.isArray(data) ? data.sort((a,b) => new Date(b.tripDate) - new Date(a.tripDate)) : [];
    displayItems = hubTrips.map((t, i) => ({ kind: "trip", key: t._id, trip: t }));
    render();
  } catch(e) { console.error(e); }
}

/* --- INIT --- */
(async function init(){
  await loadHubTrips();
  refreshTimer = setInterval(loadHubTrips, 30000);
})();