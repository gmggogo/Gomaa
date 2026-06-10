/* ==========================================================================
   TRIPS HUB V5 - ACTIVE INBOX ONLY
   Admin / SuperAdmin / Dispatcher
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */

let hubTrips = [];
let services = [];
let displayItems = [];
let activeService = "ALL";
let editingKey = null;
let refreshTimer = null;

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

/* ===============================
   UI
================================ */

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
        window.location.href = "/admin/add-trip.html";
      };
      wrap.appendChild(addBtn);
    }else{
      wrap.innerHTML = `
        <button class="top-add-trip-btn" type="button"
          onclick="window.location.href='/admin/add-trip.html'">
          + Add Trip
        </button>
      `;
    }

    page.insertBefore(wrap,page.firstChild);
  }

  if(!document.getElementById("hubStats")){
    const stats = document.createElement("div");
    stats.id = "hubStats";
    stats.className = "hub-stats";
    stats.innerHTML = `
      <div class="stat-card total"><div id="statTotal" class="stat-number">0</div><div class="stat-label">Active Trips</div></div>
      <div class="stat-card new"><div id="statNew" class="stat-number">0</div><div class="stat-label">New Trips</div></div>
      <div class="stat-card today"><div id="statToday" class="stat-number">0</div><div class="stat-label">Trips Today</div></div>
      <div class="stat-card company"><div id="statCompany" class="stat-number">0</div><div class="stat-label">Company</div></div>
      <div class="stat-card gq"><div id="statGq" class="stat-number">0</div><div class="stat-label">Get Quote</div></div>
      <div class="stat-card shared"><div id="statShared" class="stat-number">0</div><div class="stat-label">Shared</div></div>
    `;
    page.insertBefore(stats,container);
  }

  if(!document.getElementById("serviceTabs")){
    const tabs = document.createElement("div");
    tabs.id = "serviceTabs";
    tabs.className = "service-tabs";
    page.insertBefore(tabs,container);
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
    page.insertBefore(bar,container);
  }
})();

/* ===============================
   STYLE
================================ */

(function injectStyle(){
  if(document.getElementById("trips-hub-v5-style")) return;

  const style = document.createElement("style");
  style.id = "trips-hub-v5-style";
  style.innerHTML = `
    .top-add-trip-wrap{display:flex;justify-content:flex-start;margin:0 0 14px;}
    .top-add-trip-btn{
      border:none;border-radius:13px;padding:13px 22px;background:#2563eb;color:#fff;
      font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 8px 20px rgba(37,99,235,.24);
    }

    .hub-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin:0 0 14px;}
    .stat-card{background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:12px;text-align:center;box-shadow:0 6px 16px rgba(15,23,42,.07);}
    .stat-card.total{border-left:6px solid #2563eb;}
    .stat-card.new{border-left:6px solid #16a34a;}
    .stat-card.today{border-left:6px solid #0ea5e9;}
    .stat-card.company{border-left:6px solid #1d4ed8;}
    .stat-card.gq{border-left:6px solid #22c55e;}
    .stat-card.shared{border-left:6px solid #7c3aed;}
    .stat-number{font-size:25px;line-height:1;font-weight:900;color:#0f172a;}
    .stat-label{margin-top:5px;font-size:13px;font-weight:900;color:#64748b;}

    .service-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:0 0 14px;}
    .service-tab{
      border:1px solid #dbe3ee;background:#fff;color:#0f172a;border-radius:13px;padding:9px 7px;
      cursor:pointer;font-weight:900;box-shadow:0 5px 14px rgba(15,23,42,.06);
      text-align:center;min-height:78px;
    }
    .service-tab.active{background:#2563eb;color:#fff;}
    .service-title{font-size:13px;line-height:1.15;margin-bottom:5px;}
    .service-total{font-size:23px;line-height:1.05;font-weight:900;}
    .service-source{margin-top:4px;font-size:10px;line-height:1.25;opacity:.9;}

    .hub-action-bar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px;align-items:center;}
    .hub-action-btn{border:none;border-radius:10px;padding:10px 15px;font-size:13px;font-weight:900;cursor:pointer;color:#fff;}
    .hub-action-btn:disabled{opacity:.45;cursor:not-allowed;}
    .hub-action-btn.edit{background:#2563eb;}
    .hub-action-btn.delete{background:#dc2626;}
    .hub-action-btn.save{background:#16a34a;}
    .hub-action-btn.cancel{background:#64748b;}

    .booked-title{
      margin:18px 0 8px;padding:10px 13px;background:#e0edff;color:#1e3a8a;
      border-left:6px solid #2563eb;border-radius:12px;font-size:15px;font-weight:900;
    }

    .table-wrap{width:100%;overflow-x:auto;margin-bottom:20px;border-radius:14px;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.08);}
    .hub-table{width:100%;border-collapse:collapse;background:#fff;min-width:1950px;}
    .hub-table th,.hub-table td{border:1px solid #dbe3ee;padding:7px;text-align:center;font-size:13px;vertical-align:middle;line-height:1.35;}
    .hub-table th{background:#2563eb;color:#fff;font-weight:900;white-space:nowrap;font-size:13px;}

    .wide-address{min-width:240px;max-width:360px;text-align:left!important;white-space:pre-line;word-break:break-word;font-size:12px!important;}
    .wide-client{min-width:170px;max-width:250px;text-align:left!important;white-space:pre-line;word-break:break-word;}
    .wide-notes{min-width:190px;max-width:280px;text-align:left!important;white-space:pre-line;word-break:break-word;}
    .wide-email{min-width:180px;max-width:280px;text-align:left!important;word-break:break-word;font-size:12px!important;}

    .trip-number-badge{font-weight:900;color:#1d4ed8;white-space:nowrap;}
    .service-pill{display:inline-flex;padding:4px 8px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:900;white-space:nowrap;}

    .status-pill{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:900;background:#f1f5f9;color:#0f172a;white-space:nowrap;}
    .status-pill.scheduled{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;}
    .status-pill.confirmed{background:#bbf7d0;color:#14532d;border:1px solid #86efac;}
    .status-pill.paid{background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;}

    .edit-input,.edit-textarea{
      width:100%;min-width:95px;padding:6px;border:1px solid #cbd5e1;border-radius:7px;
      font-size:12px;font-weight:700;box-sizing:border-box;font-family:inherit;
    }
    .edit-textarea{min-height:58px;resize:vertical;}

    .company-row td{background:#dbeafe;}
    .gq-row td{background:#dcfce7;}
    .reserved-row td{background:#fef3c7;}
    .shared-row td{background:#ede9fe;}
    .new-trip-row td{box-shadow:inset 0 0 0 9999px rgba(22,163,74,.08);}

    .no-data{background:#fff;padding:18px;border-radius:14px;box-shadow:0 6px 16px rgba(15,23,42,.08);color:#475569;font-weight:900;}

    @media(max-width:768px){
      .hub-table{min-width:1750px;}
      .hub-table th,.hub-table td{font-size:11px;padding:6px;}
      .wide-address{font-size:10.5px!important;}
      .service-tabs{grid-template-columns:repeat(auto-fit,minmax(100px,1fr));}
    }
  `;
  document.head.appendChild(style);
})();

/* ===============================
   HELPERS
================================ */

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function normalizeText(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return String(v || "")
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .toLowerCase()
    .trim();
}

function statusKey(v){
  return cleanStatus(v).replace(/\s+/g,"");
}

function isActiveStatus(status){
  const s = statusKey(status);
  return s === "scheduled" || s === "confirmed" || s === "paid";
}

function isClosedStatus(status){
  const s = statusKey(status);
  return (
    s === "completed" ||
    s === "complete" ||
    s === "dropoff" ||
    s === "droppedoff" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "noshow" ||
    s === "notcompleted"
  );
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
  let time = String(t.tripTime || "00:00").trim();
  if(!time) time = "00:00";

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

function getTripNumber(t){
  return String(t?.tripNumber || t?.bookingNumber || t?.id || "-");
}

function getBookedDateObj(t){
  return new Date(t?.bookedAt || t?.createdAt || t?.updatedAt || Date.now());
}

function getBookedGroupKey(t){
  const d = getBookedDateObj(t);
  if(!d || isNaN(d)) return "Unknown";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDateObj(d){
  if(!d || isNaN(d)) return "-";
  return d.toLocaleDateString();
}

function formatTimeObj(d){
  if(!d || isNaN(d)) return "-";
  return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}

function getBookedDate(t){
  return formatDateObj(getBookedDateObj(t));
}

function getBookedTime(t){
  return formatTimeObj(getBookedDateObj(t));
}

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

function isBookedToday(t){
  return getBookedGroupKey(t) === dateKey(getAZNow());
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

function getNotes(t){
  return t?.notes ?? t?.tripNotes ?? t?.note ?? "";
}

function getEmail(t,p=null){
  return (
    p?.clientEmail ||
    p?.passengerEmail ||
    p?.email ||
    t?.clientEmail ||
    t?.passengerEmail ||
    t?.entryEmail ||
    t?.email ||
    ""
  );
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
  return String(text || "")
    .split("\n")
    .map(x=>x.trim())
    .filter(Boolean)
    .map(address=>({address}));
}

function getSourceCode(t){
  const raw = [
    t?.source,
    t?.from,
    t?.bookingSource,
    t?.createdBy,
    t?.company ? "company" : ""
  ].join(" ").toLowerCase();

  if(raw.includes("quote") || raw.includes("gq") || raw.includes("website") || raw.includes("public")) return "GQ";
  if(raw.includes("company") || raw.includes("portal") || t?.company) return "CO";
  return "GQ";
}

/* ===============================
   SERVICES
================================ */

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
    s?.serviceKey ||
    s?.key ||
    s?.code ||
    s?.suffix ||
    s?.companySuffix ||
    s?.title ||
    s?.name ||
    ""
  );
}

function getServiceTitle(s){
  return s?.title || s?.name || s?.serviceName || s?.serviceKey || getServiceCodeFromService(s) || "Service";
}

function getServiceCodeFromTrip(t){
  const direct = normalizeText(
    t?.serviceKey ||
    t?.serviceCode ||
    t?.serviceType ||
    t?.serviceSuffix ||
    t?.service ||
    ""
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

/* ===============================
   SHARED
================================ */

function isSharedTrip(t){
  return (
    t?.isShared === true ||
    String(t?.tripType || "").toUpperCase() === "SHARED" ||
    String(t?.type || "").toLowerCase() === "shared" ||
    normalizeText(t?.tripNumber).toUpperCase().includes("-SH") ||
    (Array.isArray(t?.passengers) && t.passengers.length > 0)
  );
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

/* ===============================
   AUTO NOT COMPLETED
================================ */

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
        body:JSON.stringify({
          status:"Not Completed"
        })
      });

      t.status = "Not Completed";

    }catch(err){
      console.log("Auto Not Completed Failed",err);
    }
  }
}

/* ===============================
   API
================================ */

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
      if(code && !unique.has(code)){
        unique.set(code,s);
      }
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

    applyFilters();

  }catch(err){
    console.log(err);
    hubTrips = [];
    displayItems = [];
    render();
  }
}

/* ===============================
   FILTERS
================================ */

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

function searchableText(item){
  const first = item.kind === "trip" ? item.trip : item.group[0];
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
  let trips = hubTrips;

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

/* ===============================
   STATS / TABS
================================ */

function countItemsByService(code){
  const baseItems = buildDisplayItems(hubTrips);

  const selected = code === "ALL"
    ? baseItems
    : baseItems.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,code);
    });

  return {
    total:selected.length,
    gq:selected.filter(item=>getSourceCode(item.kind === "trip" ? item.trip : item.group[0]) === "GQ").length,
    co:selected.filter(item=>getSourceCode(item.kind === "trip" ? item.trip : item.group[0]) === "CO").length
  };
}

function renderStats(){
  const items = buildDisplayItems(hubTrips);

  const setText = (id,val)=>{
    const el = document.getElementById(id);
    if(el) el.innerText = val;
  };

  setText("statTotal",items.length);
  setText("statNew",items.filter(item=>isNewTrip(item.kind === "trip" ? item.trip : item.group[0])).length);
  setText("statToday",items.filter(item=>isBookedToday(item.kind === "trip" ? item.trip : item.group[0])).length);
  setText("statCompany",items.filter(item=>getSourceCode(item.kind === "trip" ? item.trip : item.group[0]) === "CO").length);
  setText("statGq",items.filter(item=>getSourceCode(item.kind === "trip" ? item.trip : item.group[0]) === "GQ").length);
  setText("statShared",items.filter(item=>item.kind === "shared").length);
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
        <div class="service-source">CO ${c.co}<br>GQ ${c.gq}</div>
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
}

/* ===============================
   SELECTION
================================ */

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

/* ===============================
   MUTATIONS
================================ */

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

/* ===============================
   RENDER
================================ */

function rowClass(item){
  const t = item.kind === "trip" ? item.trip : item.group[0];

  let cls = "";

  if(item.kind === "shared") cls = "shared-row";
  else if(String(t.type || "").toLowerCase().includes("reserved")) cls = "reserved-row";
  else if(getSourceCode(t) === "CO") cls = "company-row";
  else cls = "gq-row";

  if(isNewTrip(t)) cls += " new-trip-row";

  return cls;
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
    return;
  }

const groups = groupDisplayItemsByBookedDate();

const wrap = document.createElement("div");
wrap.className = "table-wrap";

const table = document.createElement("table");
table.className = "hub-table";

table.innerHTML = `
<tr>
  <th>#</th>
  <th>Select</th>
  <th>Trip #</th>
  <th>Service</th>
  <th>Company</th>
  <th>Entry</th>
  <th>Entry Phone</th>
  <th>Client / Passengers</th>
  <th>Phone</th>
  <th>Email</th>
  <th>Pickup</th>
  <th>Stops</th>
  <th>Dropoff</th>
  <th>Notes</th>
  <th>Trip Date</th>
  <th>Trip Time</th>
  <th>Booked Date</th>
  <th>Booked Time</th>
  <th>Status</th>
</tr>
`;

Object.keys(groups)
.sort((a,b)=>new Date(b)-new Date(a))
.forEach(dayKey=>{

  const dateRow = document.createElement("tr");

  dateRow.innerHTML = `
    <td colspan="19"
        style="
        background:#dbeafe;
        color:#1e3a8a;
        font-weight:900;
        text-align:left;
        padding:12px;">
      Booked: ${dayKey}
    </td>
  `;

  table.appendChild(dateRow);

  groups[dayKey].forEach((item,index)=>{
    table.appendChild(
      item.kind === "shared"
        ? renderSharedRow(item,index + 1)
        : renderTripRow(item,index + 1)
    );
  });

});

wrap.appendChild(table);
container.appendChild(wrap);

  updateSelectionButtons();
}

function renderTripRow(item,rowNumber){
  const t = item.trip;
  const editing = editingKey === item.key;
  const stopsText = stopsPlain(getStops(t));

  const tr = document.createElement("tr");
  tr.dataset.id = String(t._id);
  tr.className = rowClass(item);

  tr.innerHTML = `
    <td>${rowNumber}</td>
    <td>
      <input type="checkbox" ${selectedItems.has(item.key) ? "checked" : ""} onchange="toggleSelection('${item.key}')">
    </td>
    <td><span class="trip-number-badge">${safe(getTripNumber(t))}</span></td>
    <td><span class="service-pill">${safe(getServiceTitleByTrip(t))}</span></td>
    <td>${editing ? createEditInput(t.company || "", "company") : safe(t.company || "")}</td>
    <td>${editing ? createEditInput(t.entryName || "", "entryName") : safe(t.entryName || "")}</td>
    <td>${editing ? createEditInput(t.entryPhone || "", "entryPhone") : safe(t.entryPhone || t.clientPhone || "")}</td>
    <td class="wide-client">${editing ? createEditInput(t.clientName || t.name || "", "clientName") : safe(t.clientName || t.name || "")}</td>
    <td>${editing ? createEditInput(t.clientPhone || t.phone || "", "clientPhone") : safe(t.clientPhone || t.phone || "")}</td>
    <td class="wide-email">${editing ? createEditInput(getEmail(t), "clientEmail", "email") : safe(getEmail(t) || "")}</td>
    <td class="wide-address">${editing ? createEditArea(t.pickup || "", "pickup") : safe(t.pickup || "")}</td>
    <td class="wide-address">${editing ? createEditArea(stopsText, "stopsText") : stopsDisplay(getStops(t))}</td>
    <td class="wide-address">${editing ? createEditArea(t.dropoff || "", "dropoff") : safe(t.dropoff || "")}</td>
    <td class="wide-notes">${editing ? createEditArea(getNotes(t), "notes") : safe(getNotes(t) || "--")}</td>
    <td>${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : safe(t.tripDate || "")}</td>
    <td>${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : safe(t.tripTime || "")}</td>
    <td>${safe(getBookedDate(t))}</td>
    <td>${safe(getBookedTime(t))}</td>
    <td><span class="status-pill ${getStatusClass(t.status)}">${safe(getStatusLabel(t.status))}</span></td>
  `;

  return tr;
}

function renderSharedRow(item,rowNumber){
  const group = item.group;
  const first = group[0] || {};
  const passengers = getRealPassengersFromGroup(group);
  const editing = editingKey === item.key;

  const tr = document.createElement("tr");
  tr.dataset.groupId = item.key;
  tr.className = rowClass(item);

  const names = editing
    ? passengers.map((p,i)=>createEditInput(p.name || p.clientName || "",`p_${i}_name`)).join("")
    : passengers.map((p,i)=>`${i+1}. ${safe(p.name || p.clientName || "")}`).join("\n");

  const phones = editing
    ? passengers.map((p,i)=>createEditInput(p.phone || p.clientPhone || "",`p_${i}_phone`)).join("")
    : passengers.map((p,i)=>`${i+1}. ${safe(p.phone || p.clientPhone || "")}`).join("\n");

  const emails = editing
    ? passengers.map((p,i)=>createEditInput(getEmail(first,p),`p_${i}_email`,"email")).join("")
    : passengers.map((p,i)=>`${i+1}. ${safe(getEmail(first,p) || "")}`).join("\n");

  const pickups = editing
    ? passengers.map((p,i)=>createEditArea(p.pickup || "",`p_${i}_pickup`)).join("")
    : passengers.map((p,i)=>`${i+1}. ${safe(p.pickup || "")}`).join("\n");

  const dropoffs = editing
    ? passengers.map((p,i)=>createEditArea(p.dropoff || "",`p_${i}_dropoff`)).join("")
    : passengers.map((p,i)=>`${i+1}. ${safe(p.dropoff || "")}`).join("\n");

  const groupStatus = getGroupStatus(group);

  tr.innerHTML = `
    <td>${rowNumber}</td>
    <td>
      <input type="checkbox" ${selectedItems.has(item.key) ? "checked" : ""} onchange="toggleSelection('${item.key}')">
    </td>
    <td><span class="trip-number-badge">${safe(getTripNumber(first))}</span></td>
    <td><span class="service-pill">${safe(getServiceTitleByTrip(first))}</span></td>
    <td>${editing ? createEditInput(first.company || "", "company") : safe(first.company || "")}</td>
    <td>${editing ? createEditInput(first.entryName || "", "entryName") : safe(first.entryName || "")}</td>
    <td>${editing ? createEditInput(first.entryPhone || "", "entryPhone") : safe(first.entryPhone || "")}</td>
    <td class="wide-client">${names}</td>
    <td class="wide-client">${phones}</td>
    <td class="wide-email">${emails}</td>
    <td class="wide-address">${pickups}</td>
    <td>Route optimized per passenger</td>
    <td class="wide-address">${dropoffs}</td>
    <td class="wide-notes">${editing ? createEditArea(getNotes(first), "notes") : safe(getNotes(first) || "--")}</td>
    <td>${editing ? createEditInput(first.tripDate || "", "tripDate", "date") : safe(first.tripDate || "")}</td>
    <td>${editing ? createEditInput(first.tripTime || "", "tripTime", "time") : safe(first.tripTime || "")}</td>
    <td>${safe(getBookedDate(first))}</td>
    <td>${safe(getBookedTime(first))}</td>
    <td><span class="status-pill ${getStatusClass(groupStatus)}">${safe(getStatusLabel(groupStatus))}</span></td>
  `;

  return tr;
}

/* ===============================
   EVENTS
================================ */

searchInput?.addEventListener("input",applyFilters);

document.getElementById("editSelectedBtn")?.addEventListener("click",editSelected);
document.getElementById("deleteSelectedBtn")?.addEventListener("click",deleteSelected);
document.getElementById("saveEditBtn")?.addEventListener("click",saveCurrentEdit);
document.getElementById("cancelEditBtn")?.addEventListener("click",cancelEdit);

Object.assign(window,{
  toggleSelection,
  saveTrip,
  saveShared,
  cancelEdit
});

/* ===============================
   INIT
================================ */

async function refreshEverything(){
  if(editingKey) return;

  await loadServices();
  await loadHubTrips();
}

(async function initHub(){
  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshEverything,30000);
})();