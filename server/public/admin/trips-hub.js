/* ==========================================================================
   TRIPS HUB V6
   Facility / Get Quote / Reserved
   Year Month Day Filters
   Modified UI Only:
   Sticky Top / Responsive Table / Company Visible / Eye View / Nested Cells
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

let hubTrips = [];
let services = [];
let displayItems = [];
let activeService = "ALL";
let editingKey = null;
let refreshTimer = null;

let filterYear = "";
let filterMonth = "";
let filterDay = "";

const selectedItems = new Set();
const markedNotCompleted = new Set();
const OVERDUE_HOURS = 12;

const container = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn = document.getElementById("addManualTripBtn");

document.getElementById("individualTab")?.parentElement?.remove();
document.getElementById("sharedTab")?.parentElement?.remove();
document.getElementById("dateFilters")?.remove();

if(!container) console.error("Missing #hubContainer");

/* ================= UI ================= */

(function buildUI(){
  const page = document.querySelector(".page-content");
  if(!page || !container) return;

  document.querySelectorAll("h1,h2,.page-title,.page-subtitle,.page-description")
    .forEach(el=>{
      const txt = String(el.textContent || "").toLowerCase();
      if(
        txt.includes("trips hub") ||
        txt.includes("clean admin") ||
        txt.includes("dispatch") ||
        txt.includes("reservation inbox")
      ){
        el.remove();
      }
    });

  const roleBadge = document.getElementById("roleBadge");
  if(roleBadge) roleBadge.innerText = role.toUpperCase();

  if(!document.getElementById("topAddTripWrap")){
    const wrap = document.createElement("div");
    wrap.id = "topAddTripWrap";
    wrap.className = "top-add-trip-wrap";

    if(addBtn){
      addBtn.textContent = "+ Add Trip";
      addBtn.className = "top-add-trip-btn";
      addBtn.onclick = e=>{
        e.preventDefault();
        window.location.href = "/admin/dispatch-add-trip.html";
      };
      wrap.appendChild(addBtn);
    }else{
      wrap.innerHTML = `
        <button class="top-add-trip-btn" type="button"
          onclick="window.location.href='/admin/dispatch-add-trip.html'">
          + Add Trip
        </button>
      `;
    }

    page.insertBefore(wrap,page.firstChild);
  }

  let sticky = document.getElementById("hubStickyTop");

  if(!sticky){
    sticky = document.createElement("div");
    sticky.id = "hubStickyTop";
    sticky.className = "hub-sticky-top";
    page.insertBefore(sticky,container);
  }

  if(!document.getElementById("hubStats")){
    const stats = document.createElement("div");
    stats.id = "hubStats";
    stats.className = "hub-stats";
    sticky.appendChild(stats);
  }

  if(!document.getElementById("serviceTabs")){
    const tabs = document.createElement("div");
    tabs.id = "serviceTabs";
    tabs.className = "service-tabs";
    sticky.appendChild(tabs);
  }

  if(!document.getElementById("hubDateFilters")){
    const filters = document.createElement("div");
    filters.id = "hubDateFilters";
    filters.className = "hub-date-filters";
    filters.innerHTML = `
      <select id="yearFilter" class="hub-filter"><option value="">Year</option></select>
      <select id="monthFilter" class="hub-filter"><option value="">Month</option></select>
      <select id="dayFilter" class="hub-filter"><option value="">Day</option></select>
      <button id="clearDateFilters" class="clear-filter-btn" type="button">Clear</button>
    `;
    sticky.appendChild(filters);
  }

  if(!document.getElementById("hubActionBar")){
    const bar = document.createElement("div");
    bar.id = "hubActionBar";
    bar.className = "hub-action-bar";
    bar.innerHTML = `
      <button id="editSelectedBtn" class="hub-action-btn edit" disabled>Edit Selected</button>
      <button id="deleteSelectedBtn" class="hub-action-btn delete" disabled>Delete Selected</button>
      <button id="saveEditBtn" class="hub-action-btn save" style="display:none;">Save Changes</button>
      <button id="cancelEditBtn" class="hub-action-btn cancel" style="display:none;">Cancel Edit</button>
    `;
    sticky.appendChild(bar);
  }
})();

/* ================= STYLE ================= */

(function injectStyle(){
  document.getElementById("trips-hub-v5-style")?.remove();
  document.getElementById("trips-hub-v6-style")?.remove();
  document.getElementById("trips-hub-v7-style")?.remove();

  const style = document.createElement("style");
  style.id = "trips-hub-v7-style";
  style.innerHTML = `

    .top-add-trip-wrap{
      display:flex;
      justify-content:flex-start;
      margin:0 0 10px;
      background:#f1f5f9;
      z-index:900;
    }

    .top-add-trip-btn{
      border:none;
      border-radius:13px;
      padding:12px 20px;
      background:#2563eb;
      color:#fff;
      font-size:15px;
      font-weight:900;
      cursor:pointer;
      box-shadow:0 8px 20px rgba(37,99,235,.24);
    }

    .hub-sticky-top{
      position:sticky;
      top:0;
      z-index:800;
      background:#f1f5f9;
      padding:0 0 8px;
      border-bottom:1px solid #cbd5e1;
    }

    .hub-stats{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(145px,1fr));
      gap:8px;
      margin:0 0 10px;
    }

    .stat-card{
      background:#fff;
      border:1px solid #dbe3ee;
      border-radius:14px;
      padding:10px 8px;
      text-align:center;
      box-shadow:0 5px 14px rgba(15,23,42,.07);
    }

    .stat-card.total{border-left:6px solid #2563eb;}
    .stat-card.new{border-left:6px solid #16a34a;}
    .stat-card.facility{border-left:6px solid #1d4ed8;}
    .stat-card.gq{border-left:6px solid #22c55e;}
    .stat-card.reserved{border-left:6px solid #f59e0b;}

    .stat-title{
      font-size:11px;
      font-weight:900;
      color:#64748b;
      letter-spacing:.3px;
    }

    .stat-number{
      font-size:24px;
      line-height:1.1;
      font-weight:900;
      color:#0f172a;
      margin-top:3px;
    }

    .mini-head,.mini-values{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      align-items:center;
      text-align:center;
    }

    .mini-head{
      margin-top:7px;
      font-size:9px;
      font-weight:900;
      color:#64748b;
    }

    .mini-values{
      margin-top:2px;
      font-size:12px;
      font-weight:900;
      color:#0f172a;
    }

    .service-tabs{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
      gap:7px;
      margin:0 0 10px;
    }

    .service-tab{
      border:1px solid #dbe3ee;
      background:#fff;
      color:#0f172a;
      border-radius:13px;
      padding:8px 7px;
      cursor:pointer;
      font-weight:900;
      box-shadow:0 4px 12px rgba(15,23,42,.06);
      text-align:center;
      min-height:78px;
    }

    .service-tab.active{
      background:#2563eb;
      color:#fff;
      border-color:#2563eb;
    }

    .service-title{
      font-size:12px;
      line-height:1.1;
      margin-bottom:4px;
    }

    .service-total{
      font-size:22px;
      line-height:1.05;
      font-weight:900;
    }

    .service-tab.active .mini-head,
    .service-tab.active .mini-values{
      color:#fff;
    }

    .hub-date-filters{
      display:flex;
      gap:7px;
      flex-wrap:wrap;
      margin:0 0 8px;
      background:#fff;
      border:1px solid #dbe3ee;
      border-radius:13px;
      padding:8px;
      box-shadow:0 4px 12px rgba(15,23,42,.06);
    }

    .hub-filter{
      min-width:110px;
      padding:8px 10px;
      border:1px solid #cbd5e1;
      border-radius:9px;
      font-size:12px;
      font-weight:900;
      color:#0f172a;
      background:#fff;
    }

    .clear-filter-btn{
      border:none;
      border-radius:9px;
      padding:8px 14px;
      background:#64748b;
      color:#fff;
      font-size:12px;
      font-weight:900;
      cursor:pointer;
    }

    .hub-action-bar{
      display:flex;
      gap:7px;
      flex-wrap:wrap;
      margin:0;
      align-items:center;
    }

    .hub-action-btn{
      border:none;
      border-radius:9px;
      padding:8px 13px;
      font-size:12px;
      font-weight:900;
      cursor:pointer;
      color:#fff;
    }

    .hub-action-btn:disabled{
      opacity:.45;
      cursor:not-allowed;
    }

    .hub-action-btn.edit{background:#2563eb;}
    .hub-action-btn.delete{background:#dc2626;}
    .hub-action-btn.save{background:#16a34a;}
    .hub-action-btn.cancel{background:#64748b;}

    .table-wrap{
      width:100%;
      max-width:100%;
      overflow-x:auto;
      overflow-y:visible;
      -webkit-overflow-scrolling:touch;
      margin-bottom:20px;
      border-radius:14px;
      background:#fff;
      box-shadow:0 8px 22px rgba(15,23,42,.08);
    }

    .hub-table{
      width:100%;
      min-width:1560px;
      table-layout:fixed;
      border-collapse:collapse;
      background:#fff;
      border-top:6px solid #000;
    }

    .hub-table th,
    .hub-table td{
      border:1px solid #dbe3ee;
      padding:5px;
      text-align:center;
      font-size:11px;
      vertical-align:middle;
      line-height:1.25;
      box-sizing:border-box;
    }

    .hub-table th{
      background:#1f2937;
      color:#fff;
      font-weight:900;
      white-space:nowrap;
      font-size:11px;
      position:static;
      top:auto;
      z-index:auto;
    }

    .col-num{width:30px;}
    .col-select{width:36px;}
    .col-trip{width:76px;}
    .col-company{width:100px;}
    .col-date{width:82px;}
    .col-time{width:58px;}
    .col-status{width:76px;}
    .col-eye{width:32px;}

    .wide-client{
      width:180px;
      text-align:left!important;
      white-space:normal;
      word-break:break-word;
    }

    .wide-phone{
      width:115px;
      text-align:left!important;
      white-space:normal;
      word-break:break-word;
    }

    .wide-address{
      width:230px;
      text-align:left!important;
      white-space:normal;
      word-break:break-word;
      font-size:10.5px!important;
    }

    .wide-stops{
      width:120px;
      text-align:left!important;
      white-space:normal;
      word-break:break-word;
      font-size:10.5px!important;
    }

    .wide-notes{
      width:190px;
      text-align:left!important;
      white-space:normal;
      word-break:break-word;
    }

    .company-cell{
      width:100px;
      font-weight:800;
      word-break:break-word;
      text-align:left!important;
    }

    .trip-divider td{
      border-bottom:3px solid #000!important;
    }

    .date-separator td{
  background:#bfdbfe!important;
  color:#1e3a8a!important;
  font-weight:900!important;
  text-align:center!important;
  padding:4px 6px!important;
  font-size:11px!important;
  line-height:1.1!important;
  border-top:2px solid #60a5fa!important;
  border-bottom:2px solid #60a5fa!important;
}

    .cell-box{
      display:grid;
      border:1px solid #111;
      background:#fff;
      width:100%;
      box-sizing:border-box;
      border-radius:4px;
      overflow:hidden;
    }

    .cell-item{
      padding:4px 5px;
      min-height:22px;
      font-weight:700;
      white-space:normal;
      word-break:break-word;
      box-sizing:border-box;
      background:#fff;
      font-size:10.5px;
    }

    .cell-item + .cell-item{
      border-top:1px solid #111;
    }

    .cell-item .edit-input,
    .cell-item .edit-textarea{
      margin:0;
      min-width:70px;
    }

    .trip-number-badge{
      font-weight:900;
      color:#1d4ed8;
      white-space:normal;
      word-break:break-word;
      font-size:10px;
    }

    .status-pill{
      display:inline-flex;
      padding:4px 6px;
      border-radius:999px;
      font-size:10px;
      font-weight:900;
      background:#f1f5f9;
      color:#0f172a;
      white-space:nowrap;
    }

    .status-pill.scheduled{
      background:#f1f5f9;
      color:#334155;
      border:1px solid #cbd5e1;
    }

    .status-pill.confirmed{
      background:#bbf7d0;
      color:#14532d;
      border:1px solid #86efac;
    }

    .status-pill.paid{
      background:#dbeafe;
      color:#1d4ed8;
      border:1px solid #93c5fd;
    }

    .edit-input,
    .edit-textarea{
      width:100%;
      min-width:70px;
      padding:5px;
      border:1px solid #cbd5e1;
      border-radius:6px;
      font-size:10.5px;
      font-weight:700;
      box-sizing:border-box;
      font-family:inherit;
    }

    .edit-textarea{
      min-height:45px;
      resize:vertical;
    }

    .facility-row td{background:#dbeafe;}
    .gq-row td{background:#dcfce7;}
    .reserved-row td{background:#fef3c7;}
    .shared-row td{background:#ede9fe;}

    .new-trip-row td{
      box-shadow:inset 0 0 0 9999px rgba(22,163,74,.08);
    }

    .eye-btn{
      border:none!important;
      background:transparent!important;
      color:#2563eb!important;
      width:30px;
      height:24px;
      cursor:pointer;
      font-size:18px;
      font-weight:900;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      line-height:1;
      padding:0;
    }

    .eye-btn:hover{
      color:#1d4ed8!important;
      background:#dbeafe!important;
      border-radius:6px;
    }

    .hub-view-overlay{
      position:fixed;
      inset:0;
      background:rgba(15,23,42,.55);
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:15px;
    }

    .hub-view-box{
      background:#fff;
      width:min(520px,96vw);
      border-radius:15px;
      overflow:hidden;
      box-shadow:0 20px 60px rgba(0,0,0,.28);
    }

    .hub-view-head{
      background:#2563eb;
      color:#fff;
      padding:12px 15px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      font-weight:900;
    }

    .hub-view-close{
      border:none;
      background:#fff;
      color:#0f172a;
      width:30px;
      height:30px;
      border-radius:50%;
      font-size:18px;
      font-weight:900;
      cursor:pointer;
    }

    .hub-view-body{
      padding:14px;
      display:grid;
      gap:8px;
    }

    .view-line{
      display:grid;
      grid-template-columns:150px 1fr;
      border:1px solid #e2e8f0;
      border-radius:9px;
      overflow:hidden;
    }

    .view-label{
      background:#f1f5f9;
      padding:9px;
      font-weight:900;
      color:#334155;
    }

    .view-value{
      padding:9px;
      font-weight:800;
      color:#0f172a;
      word-break:break-word;
      white-space:pre-line;
    }

    .no-data{
      background:#fff;
      padding:18px;
      border-radius:14px;
      box-shadow:0 6px 16px rgba(15,23,42,.08);
      color:#475569;
      font-weight:900;
    }

    @media(max-width:1200px){
      .hub-table{
        min-width:1560px;
      }

      .hub-stats{
        grid-template-columns:repeat(auto-fit,minmax(125px,1fr));
      }

      .service-tabs{
        grid-template-columns:repeat(auto-fit,minmax(105px,1fr));
      }

      .service-tab{
        min-height:72px;
        padding:7px 6px;
      }

      .stat-number{
        font-size:21px;
      }
    }

    @media(max-width:768px){
      .hub-sticky-top{
        top:0;
      }

      .hub-table{
        min-width:1560px;
      }

      .hub-table th,
      .hub-table td{
        font-size:10px;
        padding:4px;
      }

      .hub-table th{
        font-size:10px;
      }

      .cell-item{
        font-size:9.5px;
        padding:3px 4px;
      }

      .wide-address,
      .wide-stops{
        font-size:9.5px!important;
      }

      .top-add-trip-btn{
        padding:10px 16px;
        font-size:13px;
      }

      .hub-stats{
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:6px;
      }

      .stat-card{
        padding:8px 6px;
        border-radius:12px;
      }

      .stat-title{
        font-size:10px;
      }

      .stat-number{
        font-size:20px;
      }

      .mini-head{
        font-size:8px;
      }

      .mini-values{
        font-size:11px;
      }

      .service-tabs{
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:6px;
      }

      .service-tab{
        min-height:66px;
      }

      .hub-filter{
        flex:1;
        min-width:90px;
        font-size:11px;
        padding:7px 8px;
      }

      .hub-action-btn{
        font-size:11px;
        padding:7px 10px;
      }

      .view-line{
        grid-template-columns:1fr;
      }
    }
  `;
  document.head.appendChild(style);
})();

/* ================= HELPERS ================= */

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function normalizeText(v){ return String(v ?? "").trim(); }

function cleanStatus(v){
  return String(v || "").replace(/[_-]/g," ").replace(/\s+/g," ").toLowerCase().trim();
}

function statusKey(v){ return cleanStatus(v).replace(/\s+/g,""); }

function isActiveStatus(status){
  const s = statusKey(status);
  return s === "scheduled" || s === "confirmed" || s === "paid";
}

function isClosedStatus(status){
  const s = statusKey(status);
  return ["completed","complete","dropoff","droppedoff","cancelled","canceled","noshow","notcompleted"].includes(s);
}

function getStatusLabel(status){
  const s = statusKey(status);
  if(s === "confirmed") return "Confirmed";
  if(s === "paid") return "Paid";
  if(s === "scheduled") return "Scheduled";
  return status || "Scheduled";
}

function getStatusClass(status){
  const s = statusKey(status);
  if(s === "confirmed") return "confirmed";
  if(s === "paid") return "paid";
  if(s === "scheduled") return "scheduled";
  return "";
}

function parseTripDateTime(t){
  if(!t?.tripDate) return null;
  const date = String(t.tripDate || "").trim();
  let time = String(t.tripTime || "00:00").trim() || "00:00";
  let d = new Date(`${date}T${time}:00`);
  if(isNaN(d)) d = new Date(`${date} ${time}`);
  if(isNaN(d)) return null;
  return d;
}

function isOverdueNotCompleted(t){
  if(!isActiveStatus(t?.status)) return false;
  const dt = parseTripDateTime(t);
  if(!dt) return false;
  return Date.now() - dt.getTime() >= OVERDUE_HOURS * 60 * 60 * 1000;
}

function isTripVisibleInHub(t){
  if(!t) return false;
  if(isClosedStatus(t.status)) return false;
  if(isOverdueNotCompleted(t)) return false;
  return isActiveStatus(t.status);
}

function getTripNumber(t){ return String(t?.tripNumber || t?.bookingNumber || t?.id || "-"); }

function getBookedDateObj(t){ return new Date(t?.bookedAt || t?.createdAt || t?.updatedAt || Date.now()); }

function getFilterDateObj(t){
  const dt = parseTripDateTime(t);
  if(dt && !isNaN(dt)) return dt;
  return getBookedDateObj(t);
}

function getBookedGroupKey(t){
  const d = getBookedDateObj(t);
  if(!d || isNaN(d)) return "Unknown";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDateObj(d){ return (!d || isNaN(d)) ? "-" : d.toLocaleDateString(); }

function formatTimeObj(d){
  return (!d || isNaN(d)) ? "-" : d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}

function getBookedDate(t){ return formatDateObj(getBookedDateObj(t)); }
function getBookedTime(t){ return formatTimeObj(getBookedDateObj(t)); }

function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
}

function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function isNewTrip(t){
  const d = getBookedDateObj(t);
  return !isNaN(d) && Date.now() - d.getTime() <= 2 * 60 * 60 * 1000;
}

function isTripToday(t){
  const d = getFilterDateObj(t);
  return d && !isNaN(d) && dateKey(d) === dateKey(getAZNow());
}

function validateTripDateTime(date,time){
  if(!date || !time) return {ok:false,message:"Missing trip date or time"};
  const dt = new Date(`${date}T${time}:00`);
  if(isNaN(dt)) return {ok:false,message:"Invalid trip date/time"};
  return {ok:true};
}

function createEditInput(value,field,type="text"){
  return `<input class="edit-input" data-field="${field}" type="${type}" value="${safe(value)}">`;
}

function createEditArea(value,field){
  return `<textarea class="edit-textarea" data-field="${field}">${safe(value)}</textarea>`;
}

function cellBox(items){
  const arr = Array.isArray(items) ? items : [items];

  return `
    <div class="cell-box">
      ${arr.map(v=>`
        <div class="cell-item">${v || "--"}</div>
      `).join("")}
    </div>
  `;
}

function getNotes(t){ return t?.notes ?? t?.tripNotes ?? t?.note ?? ""; }

function getEmail(t,p=null){
  return p?.clientEmail || p?.passengerEmail || p?.email ||
    t?.clientEmail || t?.passengerEmail || t?.entryEmail || t?.email || "";
}

function getStops(t){
  if(Array.isArray(t?.stops)) return t.stops;
  if(Array.isArray(t?.stopAddresses)) return t.stopAddresses;
  return [];
}

function stopText(stop){
  if(!stop) return "";
  if(typeof stop === "string") return stop;
  return stop.address || stop.location || stop.name || "";
}

function stopsDisplay(stops){
  if(!Array.isArray(stops) || !stops.length) return "--";
  return stops.map((s,i)=>`${i+1}. ${safe(stopText(s))}`).join("\n");
}

function stopsPlain(stops){
  if(!Array.isArray(stops) || !stops.length) return "";
  return stops.map(stopText).filter(Boolean).join("\n");
}

function parseStopsText(text){
  return String(text || "").split("\n").map(x=>x.trim()).filter(Boolean).map(address=>({address}));
}

function getSourceCode(t){
  const raw = [
    t?.source,
    t?.from,
    t?.bookingSource,
    t?.createdBy,
    t?.type,
    t?.tripType,
    t?.isReserved ? "reserved" : "",
    t?.reserved ? "reserved" : "",
    t?.company ? "facility" : ""
  ].join(" ").toLowerCase();

  if(raw.includes("reserved") || raw.includes("reservation") || raw.includes("rv")) return "RV";
  if(raw.includes("quote") || raw.includes("gq") || raw.includes("website") || raw.includes("public")) return "GQ";
  if(raw.includes("company") || raw.includes("portal") || raw.includes("facility") || t?.company) return "FA";
  return "GQ";
}

/* ================= SERVICES ================= */

function extractServices(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data?.services)) return data.services;
  if(Array.isArray(data?.data)) return data.data;
  if(Array.isArray(data?.items)) return data.items;
  if(Array.isArray(data?.results)) return data.results;
  return [];
}

function serviceEnabled(s){
  if(!s) return false;
  return s.enabled === true || s.companyEnabled === true;
}

function normalizeKnownCode(code){
  const c = normalizeText(code).toUpperCase();
  if(c === "STANDARD" || c === "ST") return "ST";
  if(c === "WHEELCHAIR" || c === "WH") return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMOUSINE" || c === "LIMO" || c === "LIMOUSINE SERVICE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";
  return c;
}

function getServiceCodeFromService(s){
  return normalizeKnownCode(
    s?.serviceKey || s?.key || s?.code || s?.suffix || s?.companySuffix || s?.title || s?.name || ""
  );
}

function getServiceTitle(s){
  return s?.title || s?.name || s?.serviceName || s?.serviceKey || getServiceCodeFromService(s) || "Service";
}

function getServiceCodeFromTrip(t){
  const direct = normalizeText(
    t?.serviceKey || t?.serviceCode || t?.serviceType || t?.serviceSuffix || t?.service || ""
  ).toUpperCase();

  if(direct) return normalizeKnownCode(direct);

  const num = normalizeText(t?.tripNumber).toUpperCase();

  if(num.includes("-SH") || isSharedTrip(t)) return "SH";
  if(num.includes("-XL")) return "XL";
  if(num.includes("-WH")) return "WH";
  if(num.includes("-TX")) return "TX";
  if(num.includes("-LM")) return "LM";
  if(num.includes("-ST")) return "ST";

  return "ST";
}

function getServiceTitleByTrip(t){
  const code = getServiceCodeFromTrip(t);
  const service = services.find(s=>getServiceCodeFromService(s) === code);
  return service ? getServiceTitle(service) : code;
}

function tripMatchesService(t,code){
  if(code === "ALL") return true;
  return getServiceCodeFromTrip(t) === code;
}

/* ================= SHARED ================= */

function isSharedTrip(t){
  return t?.isShared === true ||
    String(t?.tripType || "").toUpperCase() === "SHARED" ||
    String(t?.type || "").toLowerCase() === "shared" ||
    normalizeText(t?.tripNumber).toUpperCase().includes("-SH") ||
    (Array.isArray(t?.passengers) && t.passengers.length > 0);
}

function getSharedKey(t){
  return normalizeText(t?.groupId) || normalizeText(t?.tripNumber) || String(t?._id || t?.id);
}

function getRealPassengersFromGroup(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return first.passengers;
  }

  return group.map((t,i)=>({
    passengerId:"P" + (i+1),
    name:t.name || t.clientName || "",
    phone:t.phone || t.clientPhone || "",
    email:t.email || t.clientEmail || "",
    clientName:t.clientName || t.name || "",
    clientPhone:t.clientPhone || t.phone || "",
    clientEmail:t.clientEmail || t.email || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled"
  }));
}

function getSharedGroups(list=hubTrips){
  const map = {};

  list.filter(isSharedTrip).forEach(t=>{
    const key = getSharedKey(t);
    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map).map(group=>
    group.sort((a,b)=>Number(a.passengerIndex || 0)-Number(b.passengerIndex || 0))
  );
}

function getGroupStatus(group){
  const passengers = getRealPassengersFromGroup(group);

  if(passengers.length){
    if(passengers.every(p=>statusKey(p.status).includes("cancel"))) return "Cancelled";
    if(passengers.every(p=>statusKey(p.status).includes("noshow"))) return "No Show";
    if(passengers.every(p=>statusKey(p.status).includes("complete"))) return "Completed";
    if(passengers.every(p=>statusKey(p.status)==="paid")) return "Paid";
    if(passengers.every(p=>statusKey(p.status)==="confirmed")) return "Confirmed";
    if(passengers.some(p=>statusKey(p.status)==="confirmed")) return "Confirmed";
    if(passengers.some(p=>statusKey(p.status)==="paid")) return "Paid";
  }

  return group[0]?.status || "Scheduled";
}

function isSharedVisibleInHub(group){
  const first = group[0] || {};
  if(isOverdueNotCompleted(first)) return false;

  const passengers = getRealPassengersFromGroup(group);
  if(!passengers.length) return isTripVisibleInHub(first);

  return passengers.some(p=>isActiveStatus(p.status || first.status));
}

/* ================= AUTO ================= */

async function autoMarkNotCompleted(list){
  const overdue = list.filter(t=>{
    const id = String(t?._id || t?.id || "");
    return id && isOverdueNotCompleted(t) && !markedNotCompleted.has(id);
  });

  for(const t of overdue){
    const id = String(t._id || t.id);
    markedNotCompleted.add(id);

    try{
      await fetch(`${API_URL}/${id}`,{
        method:"PUT",
        headers:{
          "Content-Type":"application/json",
          ...(token ? {Authorization:"Bearer " + token} : {})
        },
        body:JSON.stringify({status:"Not Completed"})
      });

      t.status = "Not Completed";

    }catch(err){
      console.log("Auto Not Completed Failed",err);
    }
  }
}

/* ================= API ================= */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error();

    const data = await res.json();
    const list = extractServices(data).filter(serviceEnabled);
    const unique = new Map();

    list.forEach(s=>{
      const code = getServiceCodeFromService(s);
      if(code && !unique.has(code)) unique.set(code,s);
    });

    services = [...unique.values()];

    if(activeService !== "ALL" && !services.some(s=>getServiceCodeFromService(s) === activeService)){
      activeService = "ALL";
    }

  }catch(err){
    console.log(err);
    services = [];
    activeService = "ALL";
  }
}

async function loadHubTrips(){
  try{
    const res = await fetch(API_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error();

    const data = await res.json();

    hubTrips = Array.isArray(data)
      ? data.sort((a,b)=>getBookedDateObj(b)-getBookedDateObj(a))
      : [];

    await autoMarkNotCompleted(hubTrips);
    buildDateFilters();
    applyFilters();

  }catch(err){
    console.log(err);
    hubTrips = [];
    displayItems = [];
    render();
  }
}

/* ================= FILTERS ================= */

function buildDisplayItems(trips){
  const items = [];
  const usedShared = new Set();

  trips.forEach(t=>{
    if(isSharedTrip(t)){
      const key = getSharedKey(t);
      if(usedShared.has(key)) return;

      usedShared.add(key);

      const group = getSharedGroups(trips).find(g=>getSharedKey(g[0]) === key) || [t];

      if(!isSharedVisibleInHub(group)) return;

      items.push({
        kind:"shared",
        key,
        bookedKey:getBookedGroupKey(group[0]),
        date:getBookedDateObj(group[0]),
        group
      });

      return;
    }

    if(!isTripVisibleInHub(t)) return;

    items.push({
      kind:"trip",
      key:String(t._id || t.id),
      bookedKey:getBookedGroupKey(t),
      date:getBookedDateObj(t),
      trip:t
    });
  });

  return items.sort((a,b)=>b.date-a.date);
}

function getItemTrip(item){
  return item.kind === "trip" ? item.trip : item.group[0];
}

function getActiveServiceTrips(){
  const activeCodes = services.map(s=>getServiceCodeFromService(s));
  return hubTrips.filter(t=>activeCodes.includes(getServiceCodeFromTrip(t)));
}

function tripPassesDateFilter(t){
  const d = getFilterDateObj(t);
  if(!d || isNaN(d)) return false;

  const y = String(d.getFullYear());
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");

  if(filterYear && y !== filterYear) return false;
  if(filterMonth && m !== filterMonth) return false;
  if(filterDay && day !== filterDay) return false;

  return true;
}

function getSystemTodayKey(){
  const now = getAZNow();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

function getSystemTomorrowKey(){
  const now = getAZNow();
  now.setDate(now.getDate()+1);
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

function isTodayOrTomorrowTrip(t){
  const tripDate = String(t.tripDate || "").trim();

  return (
    tripDate === getSystemTodayKey() ||
    tripDate === getSystemTomorrowKey()
  );
}

function getBaseTripsForFilters(){
  return getActiveServiceTrips()
    .filter(t => !isTodayOrTomorrowTrip(t))
    .filter(tripPassesDateFilter);
}

function searchableText(item){
  const first = getItemTrip(item);
  const passengers = item.kind === "shared" ? getRealPassengersFromGroup(item.group) : [];

  return [
    getTripNumber(first),
    getServiceTitleByTrip(first),
    first.company,
    first.entryName,
    first.entryPhone,
    getEmail(first),
    first.clientName,
    first.clientPhone,
    first.pickup,
    first.dropoff,
    stopsPlain(getStops(first)),
    getNotes(first),
    first.tripDate,
    first.tripTime,
    first.status,
    getBookedDate(first),
    getBookedTime(first),
    JSON.stringify(passengers)
  ].join(" ").toLowerCase();
}

function applyFilters(){
  let trips = getBaseTripsForFilters();

  if(activeService !== "ALL"){
    trips = trips.filter(t=>tripMatchesService(t,activeService));
  }

  displayItems = buildDisplayItems(trips);

  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

  if(q){
    displayItems = displayItems.filter(item=>searchableText(item).includes(q));
  }

  renderStats();
  renderServiceTabs();
  updateSelectionButtons();
  render();
}

/* ================= DATE FILTERS ================= */

function buildDateFilters(){
  const yearEl = document.getElementById("yearFilter");
  const monthEl = document.getElementById("monthFilter");
  const dayEl = document.getElementById("dayFilter");

  if(!yearEl || !monthEl || !dayEl) return;

  const years = new Set();
  const months = new Set();
  const days = new Set();

  getActiveServiceTrips().forEach(t=>{
    const d = getFilterDateObj(t);
    if(!d || isNaN(d)) return;

    years.add(String(d.getFullYear()));
    months.add(String(d.getMonth()+1).padStart(2,"0"));
    days.add(String(d.getDate()).padStart(2,"0"));
  });

  yearEl.innerHTML = `<option value="">Year</option>` + [...years].sort((a,b)=>b-a).map(y=>
    `<option value="${y}" ${filterYear===y ? "selected" : ""}>${y}</option>`
  ).join("");

  monthEl.innerHTML = `<option value="">Month</option>` + [...months].sort().map(m=>
    `<option value="${m}" ${filterMonth===m ? "selected" : ""}>${m}</option>`
  ).join("");

  dayEl.innerHTML = `<option value="">Day</option>` + [...days].sort().map(d=>
    `<option value="${d}" ${filterDay===d ? "selected" : ""}>${d}</option>`
  ).join("");
}

/* ================= STATS ================= */

function countItems(items){
  const out = {total:items.length, fa:0, gq:0, rv:0};

  items.forEach(item=>{
    const code = getSourceCode(getItemTrip(item));
    if(code === "FA") out.fa++;
    else if(code === "RV") out.rv++;
    else out.gq++;
  });

  return out;
}

function statCard(cls,title,c){
  return `
    <div class="stat-card ${cls}">
      <div class="stat-title">${title}</div>
      <div class="stat-number">${c.total}</div>
      <div class="mini-head"><span>FA</span><span>GQ</span><span>RV</span></div>
      <div class="mini-values"><span>${c.fa}</span><span>${c.gq}</span><span>${c.rv}</span></div>
    </div>
  `;
}

function renderStats(){
  const wrap = document.getElementById("hubStats");
  if(!wrap) return;

  const allItems = buildDisplayItems(getBaseTripsForFilters());

  const total = countItems(allItems);
  const newTrips = countItems(allItems.filter(item=>isNewTrip(getItemTrip(item))));
  const facility = countItems(allItems.filter(item=>getSourceCode(getItemTrip(item)) === "FA"));
  const gq = countItems(allItems.filter(item=>getSourceCode(getItemTrip(item)) === "GQ"));
  const rv = countItems(allItems.filter(item=>getSourceCode(getItemTrip(item)) === "RV"));

  wrap.innerHTML = `
    ${statCard("total","TOTAL",total)}
    ${statCard("new","NEW TRIPS",newTrips)}
    ${statCard("facility","FACILITY",facility)}
    ${statCard("gq","GET QUOTE",gq)}
    ${statCard("reserved","RESERVED",rv)}
  `;
}

function countItemsByService(code){
  const baseItems = buildDisplayItems(getBaseTripsForFilters());

  const selected = code === "ALL"
    ? baseItems
    : baseItems.filter(item=>tripMatchesService(getItemTrip(item),code));

  return countItems(selected);
}

function renderServiceTabs(){
  const wrap = document.getElementById("serviceTabs");
  if(!wrap) return;

  const tabs = [
    {code:"ALL",title:"ALL"},
    ...services.map(s=>({
      code:getServiceCodeFromService(s),
      title:getServiceTitle(s)
    }))
  ];

  wrap.innerHTML = tabs.map(tab=>{
    const c = countItemsByService(tab.code);

    return `
      <button class="service-tab ${activeService === tab.code ? "active" : ""}" data-service="${safe(tab.code)}" type="button">
        <div class="service-title">${safe(tab.title)}</div>
        <div class="service-total">${c.total}</div>
        <div class="mini-head"><span>FA</span><span>GQ</span><span>RV</span></div>
        <div class="mini-values"><span>${c.fa}</span><span>${c.gq}</span><span>${c.rv}</span></div>
      </button>
    `;
  }).join("");

  wrap.querySelectorAll(".service-tab").forEach(btn=>{
    btn.onclick = ()=>{
      activeService = btn.dataset.service || "ALL";
      selectedItems.clear();
      editingKey = null;
      applyFilters();
    };
  });

  updateStickyOffsets();
}

/* ================= SELECTION ================= */

function toggleSelection(key){
  if(selectedItems.has(key)) selectedItems.delete(key);
  else selectedItems.add(key);
  updateSelectionButtons();
}

function getSelectedItem(){
  const key = Array.from(selectedItems)[0];
  return displayItems.find(item=>item.key === key);
}

function updateSelectionButtons(){
  const editBtn = document.getElementById("editSelectedBtn");
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  const saveBtn = document.getElementById("saveEditBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");

  const isEditing = Boolean(editingKey);

  if(editBtn){
    editBtn.disabled = selectedItems.size !== 1 || isEditing;
    editBtn.style.display = isEditing ? "none" : "inline-block";
  }

  if(deleteBtn){
    deleteBtn.disabled = selectedItems.size < 1 || isEditing;
    deleteBtn.style.display = isEditing ? "none" : "inline-block";
  }

  if(saveBtn) saveBtn.style.display = isEditing ? "inline-block" : "none";
  if(cancelBtn) cancelBtn.style.display = isEditing ? "inline-block" : "none";
}

/* ================= VIEW ================= */

function viewLine(label,value){
  return `
    <div class="view-line">
      <div class="view-label">${safe(label)}</div>
      <div class="view-value">${safe(value || "--")}</div>
    </div>
  `;
}

function openTripView(key){
  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  const t = getItemTrip(item);

  closeTripView();

  const overlay = document.createElement("div");
  overlay.id = "hubViewOverlay";
  overlay.className = "hub-view-overlay";

  overlay.innerHTML = `
    <div class="hub-view-box">
      <div class="hub-view-head">
        <div>Reservation Details</div>
        <button class="hub-view-close" type="button" onclick="closeTripView()">×</button>
      </div>

      <div class="hub-view-body">
        ${viewLine("Service",getServiceTitleByTrip(t))}
        ${viewLine("Entry Name",t.entryName || "")}
        ${viewLine("Entry Phone",t.entryPhone || "")}
        ${viewLine("Client Email",getEmail(t))}
        ${viewLine("Booked Date",getBookedDate(t))}
        ${viewLine("Booked Time",getBookedTime(t))}
      </div>
    </div>
  `;

  overlay.addEventListener("click",e=>{
    if(e.target === overlay) closeTripView();
  });

  document.body.appendChild(overlay);
}

function closeTripView(){
  document.getElementById("hubViewOverlay")?.remove();
}

/* ================= MUTATIONS ================= */

async function editSelected(){
  if(selectedItems.size !== 1){
    alert("Please select one trip to edit.");
    return;
  }

  const item = getSelectedItem();
  if(!item) return;

  if(!confirm("You are about to edit this trip. Continue?")) return;

  editingKey = item.key;
  render();
  updateSelectionButtons();
}

async function deleteSelected(){
  if(!selectedItems.size){
    alert("Please select trip(s) first.");
    return;
  }

  if(!confirm("WARNING\n\nYou are about to permanently delete the selected reservation(s).\n\nThis action cannot be undone.")) return;

  try{
    for(const key of selectedItems){
      const item = displayItems.find(x=>x.key === key);
      if(!item) continue;

      if(item.kind === "trip"){
        await fetch(`${API_URL}/${item.trip._id}`,{
          method:"DELETE",
          headers: token ? {Authorization:"Bearer " + token} : {}
        });
      }else{
        for(const t of item.group){
          await fetch(`${API_URL}/${t._id}`,{
            method:"DELETE",
            headers: token ? {Authorization:"Bearer " + token} : {}
          });
        }
      }
    }

    selectedItems.clear();
    editingKey = null;
    await loadHubTrips();

  }catch(err){
    console.log(err);
    alert("Could not delete selected reservation(s).");
  }
}

async function saveCurrentEdit(){
  const item = displayItems.find(x=>x.key === editingKey);
  if(!item) return;

  if(item.kind === "trip") await saveTrip(item.trip._id);
  else await saveShared(item.key);
}

async function saveTrip(id){
  const row = document.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
  const oldTrip = hubTrips.find(t=>String(t._id) === String(id));

  if(!row || !oldTrip) return;

  const payload = {};

  row.querySelectorAll(".edit-input,.edit-textarea").forEach(input=>{
    const field = input.dataset.field;
    if(!field) return;

    if(field === "stopsText"){
      payload.stops = parseStopsText(input.value);
      return;
    }

    payload[field] = input.value;
  });

  const valid = validateTripDateTime(
    payload.tripDate || oldTrip.tripDate,
    payload.tripTime || oldTrip.tripTime
  );

  if(!valid.ok){
    alert(valid.message);
    return;
  }

  try{
    const res = await fetch(`${API_URL}/${id}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        ...(token ? {Authorization:"Bearer " + token} : {})
      },
      body:JSON.stringify(payload)
    });

    if(!res.ok) throw new Error();

    editingKey = null;
    selectedItems.clear();
    await loadHubTrips();

  }catch(err){
    console.log(err);
    alert("Could not save trip.");
  }
}

async function saveShared(groupId){
  const item = displayItems.find(x=>x.key === groupId && x.kind === "shared");
  const row = document.querySelector(`tr[data-group-id="${CSS.escape(String(groupId))}"]`);

  if(!item || !row) return;

  const first = item.group[0];
  let passengers = getRealPassengersFromGroup(item.group).map(p=>({...p}));
  const payload = {};

  row.querySelectorAll(".edit-input,.edit-textarea").forEach(input=>{
    const field = input.dataset.field;
    if(!field) return;

    if(field.startsWith("p_")){
      const [,idx,key] = field.split("_");
      const i = Number(idx);
      if(!passengers[i]) return;

      if(key === "name"){
        passengers[i].name = input.value;
        passengers[i].clientName = input.value;
      }

      if(key === "phone"){
        passengers[i].phone = input.value;
        passengers[i].clientPhone = input.value;
      }

      if(key === "email"){
        passengers[i].email = input.value;
        passengers[i].clientEmail = input.value;
      }

      if(key === "pickup") passengers[i].pickup = input.value;
      if(key === "dropoff") passengers[i].dropoff = input.value;

      return;
    }

    payload[field] = input.value;
  });

  payload.passengers = passengers;
  payload.totalPassengers = passengers.length;
  payload.isShared = true;
  payload.tripType = "SHARED";

  const valid = validateTripDateTime(
    payload.tripDate || first.tripDate,
    payload.tripTime || first.tripTime
  );

  if(!valid.ok){
    alert(valid.message);
    return;
  }

  try{
    for(const t of item.group){
      const res = await fetch(`${API_URL}/${t._id}`,{
        method:"PUT",
        headers:{
          "Content-Type":"application/json",
          ...(token ? {Authorization:"Bearer " + token} : {})
        },
        body:JSON.stringify(payload)
      });

      if(!res.ok) throw new Error();
    }

    editingKey = null;
    selectedItems.clear();
    await loadHubTrips();

  }catch(err){
    console.log(err);
    alert("Could not save shared group.");
  }
}

function cancelEdit(){
  editingKey = null;
  render();
  updateSelectionButtons();
}

/* ================= RENDER ================= */

function rowClass(item){
  const t = getItemTrip(item);
  let cls = "";

  if(item.kind === "shared") cls = "shared-row";
  else if(getSourceCode(t) === "RV") cls = "reserved-row";
  else if(getSourceCode(t) === "FA") cls = "facility-row";
  else cls = "gq-row";

  if(isNewTrip(t)) cls += " new-trip-row";

  return cls + " trip-divider";
}

function groupDisplayItemsByBookedDate(){
  const groups = {};

  displayItems.forEach(item=>{
    const key = item.bookedKey || "Unknown";
    if(!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  return groups;
}

function render(){
  if(!container) return;

  container.innerHTML = "";

  if(!displayItems.length){
    container.innerHTML = `<p class="no-data">No active trips found</p>`;
    updateSelectionButtons();
    updateStickyOffsets();
    return;
  }

  const groups = groupDisplayItemsByBookedDate();

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "hub-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-select">Select</th>
        <th class="col-trip">Trip #</th>
        <th class="col-company">Company</th>
        <th class="wide-client">Client / Passengers</th>
        <th class="wide-phone">Phone</th>
        <th class="wide-address">Pickup</th>
        <th class="wide-stops">Stops</th>
        <th class="wide-address">Dropoff</th>
        <th class="wide-notes">Notes</th>
        <th class="col-date">Trip Date</th>
        <th class="col-time">Trip Time</th>
        <th class="col-status">Status</th>
        <th class="col-eye">👁️</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a)).forEach(dayKey=>{
    const dateRow = document.createElement("tr");
    dateRow.className = "date-separator";

    dateRow.innerHTML = `
      <td colspan="14">
        Booked: ${safe(dayKey)}
      </td>
    `;

    tbody.appendChild(dateRow);

    groups[dayKey].forEach((item,index)=>{
      tbody.appendChild(
        item.kind === "shared"
          ? renderSharedRow(item,index + 1)
          : renderTripRow(item,index + 1)
      );
    });
  });

  wrap.appendChild(table);
  container.appendChild(wrap);

  updateSelectionButtons();
  updateStickyOffsets();
}

function renderTripRow(item,rowNumber){
  const t = item.trip;
  const editing = editingKey === item.key;
  const stopsText = stopsPlain(getStops(t));

  const tr = document.createElement("tr");
  tr.dataset.id = String(t._id);
  tr.className = rowClass(item);

  tr.innerHTML = `
    <td class="col-num">${rowNumber}</td>

    <td class="col-select">
      <input type="checkbox" ${selectedItems.has(item.key) ? "checked" : ""} onchange="toggleSelection('${item.key}')">
    </td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(t))}</span>
    </td>

    <td class="company-cell">
      ${editing ? createEditInput(t.company || "", "company") : cellBox(safe(t.company || "--"))}
    </td>

    <td class="wide-client">
      ${editing ? cellBox(createEditInput(t.clientName || t.name || "", "clientName")) : cellBox(safe(t.clientName || t.name || "--"))}
    </td>

    <td class="wide-phone">
      ${editing ? cellBox(createEditInput(t.clientPhone || t.phone || "", "clientPhone")) : cellBox(safe(t.clientPhone || t.phone || "--"))}
    </td>

    <td class="wide-address">
      ${editing ? cellBox(createEditArea(t.pickup || "", "pickup")) : cellBox(safe(t.pickup || "--"))}
    </td>

    <td class="wide-stops">
      ${editing ? cellBox(createEditArea(stopsText, "stopsText")) : cellBox(stopsDisplay(getStops(t)))}
    </td>

    <td class="wide-address">
      ${editing ? cellBox(createEditArea(t.dropoff || "", "dropoff")) : cellBox(safe(t.dropoff || "--"))}
    </td>

    <td class="wide-notes">
      ${editing ? cellBox(createEditArea(getNotes(t), "notes")) : cellBox(safe(getNotes(t) || "--"))}
    </td>

    <td class="col-date">
      ${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : safe(t.tripDate || "")}
    </td>

    <td class="col-time">
      ${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : safe(t.tripTime || "")}
    </td>

    <td class="col-status">
      <span class="status-pill ${getStatusClass(t.status)}">${safe(getStatusLabel(t.status))}</span>
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openTripView('${item.key}')">👁️</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(item,rowNumber){
  const group = item.group;
  const first = group[0] || {};
  const passengers = getRealPassengersFromGroup(group);
  const editing = editingKey === item.key;
  const groupStatus = getGroupStatus(group);

  const tr = document.createElement("tr");
  tr.dataset.groupId = item.key;
  tr.className = rowClass(item);

  const names = editing
    ? cellBox(passengers.map((p,i)=>createEditInput(p.name || p.clientName || "",`p_${i}_name`)))
    : cellBox(passengers.map((p,i)=>`${i+1}. ${safe(p.name || p.clientName || "--")}`));

  const phones = editing
    ? cellBox(passengers.map((p,i)=>createEditInput(p.phone || p.clientPhone || "",`p_${i}_phone`)))
    : cellBox(passengers.map((p,i)=>`${i+1}. ${safe(p.phone || p.clientPhone || "--")}`));

  const pickups = editing
    ? cellBox(passengers.map((p,i)=>createEditArea(p.pickup || "",`p_${i}_pickup`)))
    : cellBox(passengers.map((p,i)=>`${i+1}. ${safe(p.pickup || "--")}`));

  const dropoffs = editing
    ? cellBox(passengers.map((p,i)=>createEditArea(p.dropoff || "",`p_${i}_dropoff`)))
    : cellBox(passengers.map((p,i)=>`${i+1}. ${safe(p.dropoff || "--")}`));

  tr.innerHTML = `
    <td class="col-num">${rowNumber}</td>

    <td class="col-select">
      <input type="checkbox" ${selectedItems.has(item.key) ? "checked" : ""} onchange="toggleSelection('${item.key}')">
    </td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(first))}</span>
    </td>

    <td class="company-cell">
      ${editing ? createEditInput(first.company || "", "company") : cellBox(safe(first.company || "--"))}
    </td>

    <td class="wide-client">${names}</td>
    <td class="wide-phone">${phones}</td>
    <td class="wide-address">${pickups}</td>

    <td class="wide-stops">
      ${cellBox("Route optimized per passenger")}
    </td>

    <td class="wide-address">${dropoffs}</td>

    <td class="wide-notes">
      ${editing ? cellBox(createEditArea(getNotes(first), "notes")) : cellBox(safe(getNotes(first) || "--"))}
    </td>

    <td class="col-date">
      ${editing ? createEditInput(first.tripDate || "", "tripDate", "date") : safe(first.tripDate || "")}
    </td>

    <td class="col-time">
      ${editing ? createEditInput(first.tripTime || "", "tripTime", "time") : safe(first.tripTime || "")}
    </td>

    <td class="col-status">
      <span class="status-pill ${getStatusClass(groupStatus)}">${safe(getStatusLabel(groupStatus))}</span>
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openTripView('${item.key}')">👁️</button>
    </td>
  `;

  return tr;
}

/* ================= STICKY OFFSET ================= */

function updateStickyOffsets(){
  return;
}

window.addEventListener("resize",updateStickyOffsets);
window.addEventListener("orientationchange",updateStickyOffsets);

/* ================= EVENTS ================= */

searchInput?.addEventListener("input",applyFilters);

document.getElementById("editSelectedBtn")?.addEventListener("click",editSelected);
document.getElementById("deleteSelectedBtn")?.addEventListener("click",deleteSelected);
document.getElementById("saveEditBtn")?.addEventListener("click",saveCurrentEdit);
document.getElementById("cancelEditBtn")?.addEventListener("click",cancelEdit);

document.getElementById("yearFilter")?.addEventListener("change",e=>{
  filterYear = e.target.value;
  selectedItems.clear();
  editingKey = null;
  applyFilters();
});

document.getElementById("monthFilter")?.addEventListener("change",e=>{
  filterMonth = e.target.value;
  selectedItems.clear();
  editingKey = null;
  applyFilters();
});

document.getElementById("dayFilter")?.addEventListener("change",e=>{
  filterDay = e.target.value;
  selectedItems.clear();
  editingKey = null;
  applyFilters();
});

document.getElementById("clearDateFilters")?.addEventListener("click",()=>{
  filterYear = "";
  filterMonth = "";
  filterDay = "";
  buildDateFilters();
  applyFilters();
});

Object.assign(window,{
  toggleSelection,
  saveTrip,
  saveShared,
  cancelEdit,
  openTripView,
  closeTripView
});

/* ================= INIT ================= */

async function refreshEverything(){
  if(editingKey) return;
  await loadServices();
  await loadHubTrips();
  updateStickyOffsets();
}

(async function initHub(){
  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshEverything,30000);
})();