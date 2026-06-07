/* ===============================
   TRIPS HUB V2
================================ */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services";

/* ===============================
   AUTH
================================ */

const role = localStorage.getItem("role") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */

let hubTrips = [];
let filteredTrips = [];
let services = [];

let activeService = "ALL";
let activeDateFilter = "today";
let isAddingReservedTrip = false;

let knownTrips = new Set();
let firstLoadDone = false;

const container = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn = document.getElementById("addManualTripBtn");

const individualTab = document.getElementById("individualTab");
const sharedTab = document.getElementById("sharedTab");

if(!container){
  console.error("Missing #hubContainer in HTML");
}

/* ===============================
   BUILD TOP UI
================================ */

(function buildTopUI(){

  const page = document.querySelector(".page-content");

  if(!page || !container) return;

  const roleBadge = document.getElementById("roleBadge");
  if(roleBadge){
    roleBadge.innerText = role.toUpperCase();
  }

  if(!document.getElementById("hubStats")){

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
        <div class="stat-label">Shared Trips</div>
      </div>

      <div class="stat-card reserved">
        <div class="stat-number" id="reservedTripsCount">0</div>
        <div class="stat-label">Reserved Trips</div>
      </div>

      <div class="stat-card total">
        <div class="stat-number" id="totalTripsCount">0</div>
        <div class="stat-label">Total Trips</div>
      </div>
    `;

    page.insertBefore(stats, container);
  }

  if(!document.getElementById("serviceTabs")){

    const tabs = document.createElement("div");
    tabs.id = "serviceTabs";
    tabs.className = "service-tabs";

    page.insertBefore(tabs, container);
  }

  if(!document.getElementById("dateFilters")){

    const filters = document.createElement("div");
    filters.id = "dateFilters";
    filters.className = "date-filters";

    filters.innerHTML = `
      <button class="date-btn active" data-filter="today" type="button">Today</button>
      <button class="date-btn" data-filter="yesterday" type="button">Yesterday</button>
      <button class="date-btn" data-filter="3days" type="button">3 Days</button>
      <button class="date-btn" data-filter="7days" type="button">7 Days</button>
      <button class="date-btn" data-filter="month" type="button">Month</button>
      <button class="date-btn" data-filter="all" type="button">All</button>
    `;

    page.insertBefore(filters, container);
  }

})();

/* ===============================
   STYLE
================================ */

(function injectTinyStyle(){

  const oldStyle = document.getElementById("hub-v2-style");
  if(oldStyle) oldStyle.remove();

  const s = document.createElement("style");
  s.id = "hub-v2-style";

  s.innerHTML = `
    .hub-stats{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
      gap:12px;
      margin-bottom:15px;
    }

    .stat-card{
      background:#fff;
      border-radius:14px;
      padding:16px;
      text-align:center;
      box-shadow:0 6px 16px rgba(15,23,42,.08);
      border:1px solid #e5edf7;
    }

    .stat-card.new{border-left:6px solid #16a34a;}
    .stat-card.today{border-left:6px solid #2563eb;}
    .stat-card.shared{border-left:6px solid #7c3aed;}
    .stat-card.reserved{border-left:6px solid #f59e0b;}
    .stat-card.total{border-left:6px solid #111827;}

    .stat-number{
      font-size:30px;
      font-weight:900;
      color:#0f172a;
    }

    .stat-label{
      margin-top:6px;
      font-size:13px;
      font-weight:900;
      color:#64748b;
    }

    .service-tabs,
    .date-filters{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      margin-bottom:15px;
    }

    .service-tab,
    .date-btn{
      border:none;
      background:#e2e8f0;
      color:#0f172a;
      padding:10px 15px;
      border-radius:10px;
      cursor:pointer;
      font-size:13px;
      font-weight:900;
    }

    .service-tab.active{
      background:#2563eb;
      color:#fff;
    }

    .date-btn.active{
      background:#0f172a;
      color:#fff;
    }

    .hub-actions{
      display:flex;
      gap:6px;
      justify-content:center;
      align-items:center;
      flex-wrap:wrap;
    }

    .input-wrap{
      position:relative;
      width:100%;
    }

    .suggestions{
      position:absolute;
      top:100%;
      left:0;
      right:0;
      background:#fff;
      border:1px solid #cbd5e1;
      border-radius:8px;
      z-index:99999;
      max-height:220px;
      overflow:auto;
      box-shadow:0 12px 24px rgba(0,0,0,.12);
      margin-top:4px;
      text-align:left;
    }

    .option{
      padding:10px 12px;
      cursor:pointer;
      font-size:13px;
      line-height:1.35;
      border-bottom:1px solid #eef2f7;
      background:#fff;
      color:#111827;
    }

    .option:last-child{
      border-bottom:none;
    }

    .option:hover{
      background:#eff6ff;
    }

    .option.disabled{
      cursor:default;
      color:#64748b;
      background:#f8fafc;
    }

    .new-trip-row td{
      background:#dcfce7 !important;
    }

    .new-trip-row{
      animation:newGlow 1.2s infinite;
    }

    @keyframes newGlow{
      0%{box-shadow:0 0 0 rgba(22,163,74,.1);}
      50%{box-shadow:0 0 18px rgba(22,163,74,.45);}
      100%{box-shadow:0 0 0 rgba(22,163,74,.1);}
    }

    .new-badge{
      display:inline-block;
      margin-left:5px;
      padding:2px 7px;
      border-radius:999px;
      background:#16a34a;
      color:#fff;
      font-size:10px;
      font-weight:900;
    }

    .service-pill{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      padding:4px 8px;
      border-radius:999px;
      background:#e0edff;
      color:#1d4ed8;
      font-size:11px;
      font-weight:900;
      white-space:nowrap;
    }

    .no-data{
      background:#fff;
      padding:18px;
      border-radius:14px;
      box-shadow:0 6px 16px rgba(15,23,42,.08);
      color:#475569;
      font-weight:900;
    }
  `;

  document.head.appendChild(s);

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
  return String(v || "").trim();
}

function normalizeType(type){
  return String(type || "").trim().toLowerCase();
}

function normalizeStatus(status){
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g,"");
}

function displayStatus(status){
  const s = normalizeStatus(status);

  if(s === "confirmed") return "Confirmed";
  if(s === "cancelled") return "Cancelled";
  if(s === "completed") return "Completed";
  if(s === "booked") return "Booked";
  if(s === "scheduled") return "Scheduled";
  if(s === "noshow") return "No Show";
  if(s === "autoassigned") return "Auto Assigned";
  if(s === "inprogress") return "In Progress";
  if(s === "arrived") return "Arrived";

  return status || "Confirmed";
}

function getTripNumber(t){
  if(t && t.tripNumber) return String(t.tripNumber);
  if(t && t.id) return String(t.id);
  if(t && t.bookingNumber) return String(t.bookingNumber);
  return "-";
}

function formatDate(iso){
  if(!iso) return "-";

  const d = new Date(iso);
  if(isNaN(d)) return "-";

  return d.toLocaleDateString() + " " + d.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });
}

function getCreatedDate(t){
  return new Date(
    t?.bookedAt ||
    t?.createdAt ||
    t?.updatedAt ||
    Date.now()
  );
}

function bookedDateKey(t){
  const d = getCreatedDate(t);
  if(isNaN(d)) return "Unknown Date";
  return d.toLocaleDateString();
}

function getAZNow(){
  return new Date(
    new Date().toLocaleString(
      "en-US",
      { timeZone:"America/Phoenix" }
    )
  );
}

function dateKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function getTripCreatedKey(t){
  const d = getCreatedDate(t);
  if(isNaN(d)) return "";
  return dateKey(d);
}

function isTodayTrip(t){
  return getTripCreatedKey(t) === dateKey(getAZNow());
}

function isYesterdayTrip(t){
  const y = getAZNow();
  y.setDate(y.getDate() - 1);
  return getTripCreatedKey(t) === dateKey(y);
}

function withinDays(t,days){
  const d = getCreatedDate(t);
  if(isNaN(d)) return false;

  const diff = getAZNow().getTime() - d.getTime();
  return diff <= days * 24 * 60 * 60 * 1000;
}

function isThisMonth(t){
  const d = getCreatedDate(t);
  if(isNaN(d)) return false;

  const now = getAZNow();

  return (
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function isNewTrip(t){
  const d = getCreatedDate(t);
  if(isNaN(d)) return false;

  const diff = Date.now() - d.getTime();
  return diff <= 2 * 60 * 60 * 1000;
}

function getTripDateTime(t){
  if(!t || !t.tripDate || !t.tripTime) return null;

  const dt = new Date(`${t.tripDate}T${t.tripTime}:00`);
  return isNaN(dt) ? null : dt;
}

function isTripPassed(t){
  const dt = getTripDateTime(t);
  if(!dt) return false;
  return getAZNow() >= dt;
}

function shouldRemoveTrip(t){
  const dt = getTripDateTime(t);
  if(!dt) return false;

  const diffHours =
    (getAZNow() - dt) / (1000 * 60 * 60);

  return diffHours >= 24;
}

function validateFutureTrip(dateStr,timeStr){
  if(!dateStr || !timeStr){
    return { ok:false, message:"Missing trip date or time" };
  }

  const tripDateTime = new Date(`${dateStr}T${timeStr}:00`);

  if(isNaN(tripDateTime)){
    return { ok:false, message:"Invalid trip date/time" };
  }

  if(tripDateTime <= getAZNow()){
    return { ok:false, message:"❌ Cannot save trip in the past" };
  }

  return { ok:true };
}

function wrapEditableInput(value,cls,type="text"){
  return `
    <div class="input-wrap">
      <input class="${cls}" data-edit="1" type="${type}" value="${safe(value)}" disabled>
    </div>
  `;
}

/* ===============================
   SERVICE HELPERS
================================ */

function getServiceCodeFromService(service){
  const suffix =
    normalizeText(
      service.companySuffix ||
      service.suffix ||
      ""
    ).toUpperCase();

  if(suffix) return suffix;

  const key =
    normalizeText(
      service.serviceKey ||
      service.key ||
      service.code ||
      service.title ||
      ""
    ).toUpperCase();

  if(key === "STANDARD") return "ST";
  if(key === "WHEELCHAIR") return "WH";
  if(key === "SHARED") return "SH";
  if(key === "LIMOUSINE") return "LM";
  if(key === "LIMO") return "LM";
  if(key === "TAXI") return "TX";
  if(key === "XL") return "XL";

  return key;
}

function getServiceCodeFromTrip(t){
  const direct =
    normalizeText(
      t.serviceKey ||
      t.serviceCode ||
      t.serviceType ||
      t.service ||
      ""
    ).toUpperCase();

  if(direct){
    if(direct === "STANDARD") return "ST";
    if(direct === "WHEELCHAIR") return "WH";
    if(direct === "SHARED") return "SH";
    if(direct === "LIMOUSINE") return "LM";
    if(direct === "LIMO") return "LM";
    if(direct === "TAXI") return "TX";
    if(direct === "XL") return "XL";
    return direct;
  }

  const tripNumber =
    normalizeText(t.tripNumber).toUpperCase();

  if(tripNumber.includes("-SH")) return "SH";
  if(tripNumber.includes("-XL")) return "XL";
  if(tripNumber.includes("-WH")) return "WH";
  if(tripNumber.includes("-TX")) return "TX";
  if(tripNumber.includes("-LM")) return "LM";
  if(tripNumber.includes("-ST")) return "ST";

  if(normalizeType(t.type) === "shared") return "SH";

  return "ST";
}

function getServiceTitleByCode(code){
  const c = normalizeText(code).toUpperCase();

  const service = services.find(s =>
    getServiceCodeFromService(s) === c
  );

  if(service){
    return (
      service.title ||
      service.name ||
      service.serviceName ||
      service.serviceKey ||
      c
    );
  }

  if(c === "ST") return "Standard";
  if(c === "XL") return "XL";
  if(c === "WH") return "Wheelchair";
  if(c === "TX") return "Taxi";
  if(c === "LM") return "Limo";
  if(c === "SH") return "Shared";

  return c;
}

function isSharedTrip(t){
  return (
    t?.isShared === true ||
    normalizeType(t?.type) === "shared" ||
    getServiceCodeFromTrip(t) === "SH" ||
    normalizeText(t?.tripNumber).toUpperCase().includes("-SH") ||
    Array.isArray(t?.passengers)
  );
}

function displayType(t){
  if(isSharedTrip(t)) return "Shared";

  const type = normalizeType(t?.type);

  if(type === "reserved") return "Reserved";
  if(type === "individual") return "Individual";
  if(type === "company") return "Company";
  if(type === "gh") return "GH";

  return t?.type || "-";
}

/* ===============================
   AUTOCOMPLETE
================================ */

const editSelectedAddresses = {};

async function searchAddress(q){
  const query = normalizeText(q);
  if(!query || query.length < 3) return [];

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us&viewbox=-115,35.5,-108.5,31&bounded=1`
    );

    if(!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }catch(err){
    console.error("Address search error:",err);
    return [];
  }
}

function attachAutocomplete(input,tripId,field){
  if(!input) return;

  const wrap = input.closest(".input-wrap") || input.parentNode;
  if(!wrap) return;

  const oldBox = wrap.querySelector(".suggestions");
  if(oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);

  let timer = null;

  input.setAttribute("autocomplete","off");

  input.addEventListener("focus",async function(){
    const q = input.value.trim();
    if(q.length < 3) return;

    const results = await searchAddress(q);
    renderSuggestions(box,results);
  });

  input.addEventListener("input",function(){
    if(!editSelectedAddresses[tripId]){
      editSelectedAddresses[tripId] = {};
    }

    editSelectedAddresses[tripId][field] = null;

    clearTimeout(timer);

    const q = input.value.trim();

    if(q.length < 3){
      box.innerHTML = "";
      return;
    }

    timer = setTimeout(async ()=>{
      const results = await searchAddress(q);
      renderSuggestions(box,results);
    },250);
  });

  box.addEventListener("click",function(e){
    const el = e.target.closest(".option");
    if(!el || el.classList.contains("disabled")) return;

    const obj = {
      address:el.dataset.address,
      lat:Number(el.dataset.lat),
      lng:Number(el.dataset.lng)
    };

    if(!editSelectedAddresses[tripId]){
      editSelectedAddresses[tripId] = {};
    }

    editSelectedAddresses[tripId][field] = obj;

    input.value = obj.address;
    box.innerHTML = "";
  });

  input.addEventListener("blur",function(){
    setTimeout(()=>{
      box.innerHTML = "";
    },180);
  });
}

function renderSuggestions(box,results){
  if(!box) return;

  if(!results.length){
    box.innerHTML = `<div class="option disabled">No results</div>`;
    return;
  }

  box.innerHTML = results.map(r => `
    <div class="option"
         data-address="${safe(r.display_name)}"
         data-lat="${safe(r.lat)}"
         data-lng="${safe(r.lon)}">
      ${safe(r.display_name)}
    </div>
  `).join("");
}

/* ===============================
   LOAD DATA
================================ */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_URL);
    const data = await res.json();

    services =
      Array.isArray(data)
        ? data.filter(s => s && s.enabled !== false)
        : [];
  }catch(err){
    services = [];
  }
}

async function loadHubTrips(){
  try{
    const oldCount = hubTrips.length;

    const res = await fetch(API_URL);
    const data = await res.json();
    const allTrips = Array.isArray(data) ? data : [];

    hubTrips = allTrips
      .filter(t => !shouldRemoveTrip(t))
      .filter(t => {
        const s = normalizeStatus(t.status);

        return (
          s === "confirmed" ||
          s === "cancelled" ||
          s === "completed" ||
          s === "booked" ||
          s === "scheduled" ||
          s === "autoassigned" ||
          s === "arrived" ||
          s === "inprogress" ||
          s === "noshow"
        );
      });

    hubTrips.sort((a,b)=>{
      return getCreatedDate(b).getTime() - getCreatedDate(a).getTime();
    });

    hubTrips.forEach(t=>{
      const id = String(t._id || "");
      if(id && !knownTrips.has(id) && firstLoadDone && isNewTrip(t)){
        flashNewTripCard();
      }
      if(id) knownTrips.add(id);
    });

    if(firstLoadDone && oldCount && hubTrips.length > oldCount){
      flashNewTripCard();
    }

    firstLoadDone = true;

    applyFilters();
  }catch(err){
    console.error("Load Trips Error:",err);
    hubTrips = [];
    filteredTrips = [];
    render();
  }
}

/* ===============================
   FILTERS / STATS
================================ */

function getTripsByDateFilter(){
  return hubTrips.filter(t => {
    if(activeDateFilter === "all") return true;
    if(activeDateFilter === "today") return isTodayTrip(t);
    if(activeDateFilter === "yesterday") return isYesterdayTrip(t);
    if(activeDateFilter === "3days") return withinDays(t,3);
    if(activeDateFilter === "7days") return withinDays(t,7);
    if(activeDateFilter === "month") return isThisMonth(t);
    return true;
  });
}

function applyFilters(){
  let trips = getTripsByDateFilter();

  if(activeService !== "ALL"){
    trips = trips.filter(t =>
      getServiceCodeFromTrip(t) === activeService
    );
  }

  const search =
    searchInput ? searchInput.value.toLowerCase().trim() : "";

  if(search){
    trips = trips.filter(t =>
      JSON.stringify(t).toLowerCase().includes(search)
    );
  }

  trips.sort((a,b)=>{
    return getCreatedDate(b).getTime() - getCreatedDate(a).getTime();
  });

  filteredTrips = trips;

  updateStats();
  updateTopTabs();
  renderServiceTabs();
  render();
}

function updateStats(){
  const todayTrips = hubTrips.filter(isTodayTrip);
  const newToday = todayTrips.filter(isNewTrip);
  const shared = hubTrips.filter(isSharedTrip);
  const reserved = hubTrips.filter(t => normalizeType(t.type) === "reserved");

  const setText = (id,value)=>{
    const el = document.getElementById(id);
    if(el) el.innerText = value;
  };

  setText("newTripsCount",newToday.length);
  setText("todayTripsCount",todayTrips.length);
  setText("sharedTripsCount",shared.length);
  setText("reservedTripsCount",reserved.length);
  setText("totalTripsCount",hubTrips.length);
}

function updateTopTabs(){
  const individual = hubTrips.filter(t => !isSharedTrip(t));
  const shared = hubTrips.filter(isSharedTrip);

  const ind = document.getElementById("individualCount");
  const sh = document.getElementById("sharedCount");

  if(ind) ind.textContent = `${individual.length} trips`;
  if(sh) sh.textContent = `${shared.length} groups`;
}

function flashNewTripCard(){
  const card = document.querySelector(".stat-card.new");
  if(!card) return;

  card.animate(
    [
      {transform:"scale(1)"},
      {transform:"scale(1.08)"},
      {transform:"scale(1)"}
    ],
    {
      duration:900,
      iterations:3
    }
  );
}

/* ===============================
   SERVICE TABS
================================ */

function getDynamicServiceTabs(){
  const map = new Map();

  map.set("ALL","All");
  map.set("ST","Standard");
  map.set("XL","XL");
  map.set("WH","Wheelchair");
  map.set("TX","Taxi");
  map.set("LM","Limo");
  map.set("SH","Shared");

  services.forEach(service => {
    const code = getServiceCodeFromService(service);
    if(!code) return;

    const title =
      service.title ||
      service.name ||
      service.serviceName ||
      service.serviceKey ||
      code;

    map.set(code,title);
  });

  hubTrips.forEach(t => {
    const code = getServiceCodeFromTrip(t);
    if(!code) return;

    if(!map.has(code)){
      map.set(code,getServiceTitleByCode(code));
    }
  });

  return Array.from(map.entries()).map(([code,title]) => ({
    code,
    title
  }));
}

function renderServiceTabs(){
  const wrap = document.getElementById("serviceTabs");
  if(!wrap) return;

  const base = getTripsByDateFilter();
  const tabs = getDynamicServiceTabs();

  wrap.innerHTML = tabs.map(tab => {
    const count =
      tab.code === "ALL"
        ? base.length
        : base.filter(t => getServiceCodeFromTrip(t) === tab.code).length;

    return `
      <button
        class="service-tab ${activeService === tab.code ? "active" : ""}"
        data-service="${safe(tab.code)}"
        type="button">
        ${safe(tab.title)} (${count})
      </button>
    `;
  }).join("");

  wrap.querySelectorAll(".service-tab").forEach(btn => {
    btn.onclick = ()=>{
      activeService = btn.dataset.service || "ALL";
      applyFilters();
    };
  });
}

/* ===============================
   DATE FILTERS
================================ */

function setupDateFilters(){
  const buttons = document.querySelectorAll(".date-btn");

  buttons.forEach(btn => {
    btn.onclick = ()=>{
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      activeDateFilter = btn.dataset.filter || "today";
      applyFilters();
    };
  });
}

/* ===============================
   OLD TOP TABS
================================ */

if(individualTab){
  individualTab.onclick = ()=>{
    activeService = "ALL";
    individualTab.classList.add("active");
    sharedTab?.classList.remove("active");
    applyFilters();
  };
}

if(sharedTab){
  sharedTab.onclick = ()=>{
    activeService = "SH";
    sharedTab.classList.add("active");
    individualTab?.classList.remove("active");
    applyFilters();
  };
}

/* ===============================
   COLORS
================================ */

function rowColor(tr,t){
  const status = normalizeStatus(t?.status);

  if(isNewTrip(t)){
    tr.classList.add("new-trip-row");
    return;
  }

  if(status === "cancelled"){
    tr.style.backgroundColor = "#f1f5f9";
    tr.style.borderLeft = "4px solid #64748b";
    return;
  }

  if(isTripPassed(t)){
    tr.style.backgroundColor = "#ffe5e5";
    tr.style.borderLeft = "4px solid #dc2626";
    return;
  }

  if(isSharedTrip(t)){
    tr.style.backgroundColor = "#f3e8ff";
    return;
  }

  const type = normalizeType(t?.type);

  if(type === "individual"){
    tr.style.backgroundColor = "#e8f4ff";
  }
  else if(type === "company"){
    tr.style.backgroundColor = "#fff6d6";
  }
  else if(type === "reserved"){
    tr.style.backgroundColor = "#ecfdf5";
  }
}

/* ===============================
   ADD RESERVED
================================ */

async function addReservedTripInline(){
  if(isAddingReservedTrip) return;

  isAddingReservedTrip = true;
  if(addBtn) addBtn.disabled = true;

  try{
    const newTrip = {
      type:"reserved",
      company:"",
      entryName:"",
      entryPhone:"",
      clientName:"",
      clientPhone:"",
      pickup:"",
      pickupLat:null,
      pickupLng:null,
      stops:[],
      dropoff:"",
      dropoffLat:null,
      dropoffLng:null,
      notes:"",
      tripDate:"",
      tripTime:"",
      status:"Confirmed",
      createdAt:new Date().toISOString(),
      bookedAt:new Date().toISOString()
    };

    const res = await fetch(API_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(newTrip)
    });

    if(!res.ok){
      throw new Error("Failed to add reserved trip");
    }

    await loadHubTrips();
  }catch(err){
    console.error("Add Reserved Trip Error:",err);
    alert("Could not add reserved trip.");
  }finally{
    isAddingReservedTrip = false;
    if(addBtn) addBtn.disabled = false;
  }
}

/* ===============================
   EDIT
================================ */

function editTripConfirm(id){
  const tr = document.getElementById(`row-${id}`);
  if(!tr) return;

  const fields = tr.querySelectorAll(
    "input[data-edit='1'], textarea[data-edit='1'], select[data-edit='1']"
  );

  fields.forEach(el => {
    el.disabled = false;
  });

  const trip = hubTrips.find(x => String(x._id) === String(id));

  editSelectedAddresses[id] = {
    pickup:
      trip?.pickup && trip?.pickupLat != null && trip?.pickupLng != null
        ? {
            address:trip.pickup,
            lat:Number(trip.pickupLat),
            lng:Number(trip.pickupLng)
          }
        : null,

    dropoff:
      trip?.dropoff && trip?.dropoffLat != null && trip?.dropoffLng != null
        ? {
            address:trip.dropoff,
            lat:Number(trip.dropoffLat),
            lng:Number(trip.dropoffLng)
          }
        : null
  };

  const pickup = tr.querySelector(".pickup-input");
  const dropoff = tr.querySelector(".dropoff-input");

  if(pickup) attachAutocomplete(pickup,id,"pickup");
  if(dropoff) attachAutocomplete(dropoff,id,"dropoff");

  const editBtn = tr.querySelector(".edit-btn");
  const saveBtn = tr.querySelector(".save-btn");

  if(editBtn) editBtn.style.display = "none";
  if(saveBtn) saveBtn.style.display = "inline-block";
}

/* ===============================
   SAVE
================================ */

async function saveTripConfirm(id){
  const tr = document.getElementById(`row-${id}`);
  if(!tr) return;

  const stopsInput = tr.querySelector(".stops-input");
  const statusSelect = tr.querySelector(".status-input");

  const oldTrip =
    hubTrips.find(x => String(x._id) === String(id)) || {};

  const updatedTrip = {
    company:tr.querySelector(".company-input")?.value || "",
    entryName:tr.querySelector(".entryname-input")?.value || "",
    entryPhone:tr.querySelector(".entryphone-input")?.value || "",
    clientName:tr.querySelector(".clientname-input")?.value || "",
    clientPhone:tr.querySelector(".clientphone-input")?.value || "",
    pickup:tr.querySelector(".pickup-input")?.value || "",
    stops:stopsInput
      ? stopsInput.value.split("→").map(s => s.trim()).filter(Boolean)
      : [],
    dropoff:tr.querySelector(".dropoff-input")?.value || "",
    notes:tr.querySelector(".notes-input")?.value || "",
    tripDate:tr.querySelector(".tripdate-input")?.value || "",
    tripTime:tr.querySelector(".triptime-input")?.value || "",
    status:statusSelect?.value || "Confirmed"
  };

  const validTime = validateFutureTrip(
    updatedTrip.tripDate,
    updatedTrip.tripTime
  );

  if(!validTime.ok){
    alert(validTime.message);
    return;
  }

  const selected = editSelectedAddresses[id] || {};

  const pickupChanged = updatedTrip.pickup !== oldTrip.pickup;
  const dropoffChanged = updatedTrip.dropoff !== oldTrip.dropoff;

  const pickupMissingCoords =
    oldTrip.pickupLat == null || oldTrip.pickupLng == null;

  const dropoffMissingCoords =
    oldTrip.dropoffLat == null || oldTrip.dropoffLng == null;

  if(pickupChanged || pickupMissingCoords){
    if(!selected.pickup || !selected.pickup.address){
      alert("Select pickup from suggestions ❌");
      return;
    }

    updatedTrip.pickup = selected.pickup.address;
    updatedTrip.pickupLat = Number(selected.pickup.lat);
    updatedTrip.pickupLng = Number(selected.pickup.lng);
  }else{
    updatedTrip.pickupLat = oldTrip.pickupLat;
    updatedTrip.pickupLng = oldTrip.pickupLng;
  }

  if(dropoffChanged || dropoffMissingCoords){
    if(!selected.dropoff || !selected.dropoff.address){
      alert("Select dropoff from suggestions ❌");
      return;
    }

    updatedTrip.dropoff = selected.dropoff.address;
    updatedTrip.dropoffLat = Number(selected.dropoff.lat);
    updatedTrip.dropoffLng = Number(selected.dropoff.lng);
  }else{
    updatedTrip.dropoffLat = oldTrip.dropoffLat;
    updatedTrip.dropoffLng = oldTrip.dropoffLng;
  }

  try{
    const res = await fetch(`${API_URL}/${id}`,{
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(updatedTrip)
    });

    if(!res.ok){
      throw new Error("Failed to save trip");
    }

    delete editSelectedAddresses[id];

    await loadHubTrips();
  }catch(err){
    console.error("Save Trip Error:",err);
    alert("Could not save trip.");
  }
}

/* ===============================
   DELETE
================================ */

async function deleteTripConfirm(id){
  const ok = confirm("Delete this trip?");
  if(!ok) return;

  try{
    const res = await fetch(`${API_URL}/${id}`,{
      method:"DELETE"
    });

    if(!res.ok){
      throw new Error("Failed to delete trip");
    }

    await loadHubTrips();
  }catch(err){
    console.error("Delete Trip Error:",err);
    alert("Could not delete trip.");
  }
}

/* ===============================
   GROUP
================================ */

function groupTripsByBookedDate(trips){
  const groups = {};

  trips.forEach(t => {
    const key = bookedDateKey(t);

    if(!groups[key]){
      groups[key] = [];
    }

    groups[key].push(t);
  });

  return groups;
}

/* ===============================
   RENDER
================================ */

function render(){
  if(!container) return;

  container.innerHTML = "";

  if(!filteredTrips.length){
    container.innerHTML = `<p class="no-data">No trips found</p>`;
    return;
  }

  let globalIndex = 0;

  const groups = groupTripsByBookedDate(filteredTrips);

  Object.keys(groups)
    .sort((a,b)=> new Date(b) - new Date(a))
    .forEach(dateKey => {

      const title = document.createElement("div");
      title.className = "group-title";
      title.textContent = dateKey;

      container.appendChild(title);

      const table = document.createElement("table");
      table.className = "hub-table";

      table.innerHTML = `
        <thead>
          <tr>
            <th>#</th>
            <th>Trip #</th>
            <th>Type</th>
            <th>Service</th>
            <th>Company</th>
            <th>Entry Name</th>
            <th>Entry Phone</th>
            <th>Client</th>
            <th>Client Phone</th>
            <th>Pickup</th>
            <th>Stops</th>
            <th>Dropoff</th>
            <th>Notes</th>
            <th>Date</th>
            <th>Time</th>
            <th>Status</th>
            <th>Booked At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector("tbody");

      groups[dateKey].forEach(t => {
        globalIndex++;

        const tr = document.createElement("tr");
        tr.id = `row-${t._id}`;

        rowColor(tr,t);

        const stopsStr =
          Array.isArray(t.stops)
            ? t.stops.join(" → ")
            : "";

        const serviceCode = getServiceCodeFromTrip(t);

        const newBadge =
          isNewTrip(t)
            ? `<span class="new-badge">NEW</span>`
            : "";

        tr.innerHTML = `
          <td>${globalIndex}</td>

          <td>
            <input value="${safe(getTripNumber(t))}" disabled>
            ${newBadge}
          </td>

          <td>
            <input value="${safe(displayType(t))}" disabled>
          </td>

          <td>
            <span class="service-pill">
              ${safe(getServiceTitleByCode(serviceCode))}
            </span>
          </td>

          <td>${wrapEditableInput(t.company || "", "company-input")}</td>
          <td>${wrapEditableInput(t.entryName || "", "entryname-input")}</td>
          <td>${wrapEditableInput(t.entryPhone || "", "entryphone-input")}</td>
          <td>${wrapEditableInput(t.clientName || "", "clientname-input")}</td>
          <td>${wrapEditableInput(t.clientPhone || "", "clientphone-input")}</td>
          <td>${wrapEditableInput(t.pickup || "", "pickup-input")}</td>
          <td>${wrapEditableInput(stopsStr, "stops-input")}</td>
          <td>${wrapEditableInput(t.dropoff || "", "dropoff-input")}</td>

          <td>
            <textarea class="notes-input" data-edit="1" disabled>${safe(t.notes || "")}</textarea>
          </td>

          <td>
            <input class="tripdate-input" data-edit="1" type="date" value="${safe(t.tripDate || "")}" disabled>
          </td>

          <td>
            <input class="triptime-input" data-edit="1" type="time" value="${safe(t.tripTime || "")}" disabled>
          </td>

          <td>
            <select class="status-input" data-edit="1" disabled>
              <option value="Confirmed" ${displayStatus(t.status) === "Confirmed" ? "selected" : ""}>Confirmed</option>
              <option value="Cancelled" ${displayStatus(t.status) === "Cancelled" ? "selected" : ""}>Cancelled</option>
              <option value="Completed" ${displayStatus(t.status) === "Completed" ? "selected" : ""}>Completed</option>
              <option value="NoShow" ${displayStatus(t.status) === "No Show" ? "selected" : ""}>No Show</option>
            </select>
          </td>

          <td>${safe(formatDate(t.bookedAt || t.createdAt))}</td>

          <td>
            <div class="hub-actions">
              <button class="hub-btn edit-btn edit" onclick="editTripConfirm('${t._id}')">Edit</button>
              <button class="hub-btn save-btn save" style="display:none" onclick="saveTripConfirm('${t._id}')">Save</button>
              <button class="hub-btn delete-btn delete" onclick="deleteTripConfirm('${t._id}')">Delete</button>
            </div>
          </td>
        `;

        tbody.appendChild(tr);
      });

      container.appendChild(table);
    });
}

/* ===============================
   EVENTS
================================ */

if(searchInput){
  searchInput.addEventListener("input",function(){
    applyFilters();
  });
}

if(addBtn){
  addBtn.addEventListener("click",async function(e){
    e.preventDefault();
    await addReservedTripInline();
  });
}

/* ===============================
   GLOBALS
================================ */

window.editTripConfirm = editTripConfirm;
window.saveTripConfirm = saveTripConfirm;
window.deleteTripConfirm = deleteTripConfirm;

/* ===============================
   AUTO REFRESH
================================ */

setInterval(async function(){
  await loadHubTrips();
},15000);

/* ===============================
   INIT
================================ */

(async function(){
  setupDateFilters();

  await loadServices();
  await loadHubTrips();
})();