/* ===============================
   ADMIN TRIPS V4 CLEAN UI
   Same Trips Hub Professional Layout
   Select / Unselect Buttons
================================ */

const API = "/api/trips";
const SERVICES_API = "/api/services/admin";

const container = document.getElementById("tripsContainer");
const statsCards = document.getElementById("statsCards");
const serviceCards = document.getElementById("serviceCards");

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

let trips = [];
let services = [];
let displayItems = [];
let activeService = "ALL";
let SYSTEM_TIMEZONE = "America/Phoenix";

const selectedMap = new WeakMap();

/* ===============================
   STYLE FIX
================================ */

(function injectTripsStyle(){

  document.getElementById("admin-trips-clean-style")?.remove();

  const s = document.createElement("style");
  s.id = "admin-trips-clean-style";

  s.innerHTML = `

/* ===============================
   TOP / CARDS
================================ */

.admin-trips-top{
  position:sticky;
  top:0;
  z-index:800;
  background:#f1f5f9;
  padding:0 0 8px;
  border-bottom:1px solid #cbd5e1;
}

.stats-grid{
  display:grid!important;
  grid-template-columns:repeat(auto-fit,minmax(145px,1fr))!important;
  gap:8px!important;
  margin:0 0 10px!important;
}

.stat-card{
  background:#fff!important;
  border:1px solid #dbe3ee!important;
  border-left:6px solid #2563eb!important;
  border-radius:14px!important;
  padding:10px 8px!important;
  text-align:center!important;
  box-shadow:0 5px 14px rgba(15,23,42,.07)!important;
}

.stat-card:nth-child(2){border-left-color:#16a34a!important;}
.stat-card:nth-child(3){border-left-color:#1d4ed8!important;}
.stat-card:nth-child(4){border-left-color:#22c55e!important;}
.stat-card:nth-child(5){border-left-color:#f59e0b!important;}
.stat-card:nth-child(6){border-left-color:#7c3aed!important;}

.stat-label{
  font-size:11px!important;
  font-weight:900!important;
  color:#64748b!important;
  letter-spacing:.3px!important;
  text-transform:uppercase!important;
}

.stat-value{
  font-size:24px!important;
  line-height:1.1!important;
  font-weight:900!important;
  color:#0f172a!important;
  margin-top:3px!important;
}

/* ===============================
   SERVICE CARDS
================================ */

.service-strip{
  display:grid!important;
  grid-template-columns:repeat(auto-fit,minmax(120px,1fr))!important;
  gap:7px!important;
  overflow:visible!important;
  padding-bottom:0!important;
  margin-bottom:10px!important;
}

.service-card{
  background:#fff!important;
  border:1px solid #dbe3ee!important;
  color:#0f172a!important;
  border-radius:13px!important;
  padding:8px 7px!important;
  cursor:pointer!important;
  font-weight:900!important;
  box-shadow:0 4px 12px rgba(15,23,42,.06)!important;
  text-align:center!important;
  min-height:78px!important;
  min-width:0!important;
}

.service-card.active{
  background:#2563eb!important;
  color:#fff!important;
  border-color:#2563eb!important;
  outline:none!important;
}

.service-name{
  font-size:12px!important;
  line-height:1.1!important;
  margin-bottom:4px!important;
  font-weight:900!important;
}

.service-total{
  font-size:22px!important;
  line-height:1.05!important;
  font-weight:900!important;
  margin:4px 0!important;
}

.service-mini{
  display:grid!important;
  grid-template-columns:repeat(3,1fr)!important;
  gap:4px!important;
  margin-top:6px!important;
  font-size:9px!important;
  font-weight:900!important;
  color:#64748b!important;
}

.service-card.active .service-mini{
  color:#fff!important;
}

/* ===============================
   SELECTION BAR
================================ */

.selection-bar{
  display:flex!important;
  gap:7px!important;
  flex-wrap:wrap!important;
  align-items:center!important;
  margin:0!important;
}

.select-btn{
  border:none!important;
  border-radius:9px!important;
  padding:8px 13px!important;
  font-size:12px!important;
  font-weight:900!important;
  cursor:pointer!important;
  color:#fff!important;
  background:#0f172a!important;
  box-shadow:0 4px 10px rgba(15,23,42,.12)!important;
}

.select-btn:hover{
  background:#2563eb!important;
}

.select-btn.active{
  background:#16a34a!important;
}

/* ===============================
   TABLE
================================ */

.table-scroll{
  width:100%!important;
  max-width:100%!important;
  overflow-x:auto!important;
  overflow-y:visible!important;
  -webkit-overflow-scrolling:touch!important;
  border-radius:14px!important;
  background:#fff!important;
  box-shadow:0 8px 22px rgba(15,23,42,.08)!important;
  margin-bottom:22px!important;
}

.trip-table{
  width:100%!important;
  min-width:1780px!important;
  table-layout:fixed!important;
  border-collapse:collapse!important;
  background:#fff!important;
  border-top:6px solid #000!important;
  font-size:11px!important;
}

.trip-table th,
.trip-table td{
  border:1px solid #dbe3ee!important;
  padding:5px!important;
  text-align:center!important;
  vertical-align:middle!important;
  line-height:1.25!important;
  box-sizing:border-box!important;
  position:relative!important;
  overflow:visible!important;
}

.trip-table th{
  background:#1f2937!important;
  color:#fff!important;
  font-weight:900!important;
  white-space:nowrap!important;
  font-size:11px!important;
  position:static!important;
  top:auto!important;
  z-index:auto!important;
}

.trip-table td{
  font-size:11px!important;
}

.trip-table tbody tr td{
  border-bottom:3px solid #000!important;
}

/* ===============================
   COLUMN SIZES
================================ */

.col-dispatch{width:60px;}
.col-num{width:30px;}
.col-trip{width:78px;}
.col-service{width:82px;}
.col-type{width:70px;}
.col-facility{width:100px;}
.col-entry{width:95px;}
.col-entry-phone{width:105px;}
.col-client{width:170px;}
.col-phone{width:115px;}
.col-email{width:160px;}
.col-pickup{width:230px;}
.col-stops{width:130px;}
.col-dropoff{width:230px;}
.col-date{width:82px;}
.col-time{width:58px;}
.col-notes{width:190px;}
.col-status{width:76px;}
.col-actions{width:105px;}

.wide-client,
.wide-phone,
.wide-email,
.wide-address,
.wide-stops,
.wide-notes{
  text-align:left!important;
  white-space:normal!important;
  word-break:break-word!important;
}

.wide-client{width:170px!important;}
.wide-phone{width:115px!important;}
.wide-email{width:160px!important;font-size:10.5px!important;}
.wide-address{width:230px!important;font-size:10.5px!important;}
.wide-stops{width:130px!important;font-size:10.5px!important;}
.wide-notes{width:190px!important;}

/* ===============================
   INPUTS
================================ */

.edit-field,
.edit-area{
  width:100%!important;
  min-width:70px!important;
  padding:5px!important;
  border:1px solid #cbd5e1!important;
  border-radius:6px!important;
  font-size:10.5px!important;
  font-weight:700!important;
  box-sizing:border-box!important;
  font-family:inherit!important;
  background:#fff!important;
}

.edit-area{
  min-height:45px!important;
  resize:vertical!important;
  white-space:pre-line!important;
}

.edit-field:disabled,
.edit-area:disabled{
  border:1px solid transparent!important;
  background:transparent!important;
  color:#0f172a!important;
  opacity:1!important;
  resize:none!important;
}

/* ===============================
   BADGES
================================ */

.service-pill{
  display:inline-flex!important;
  padding:4px 6px!important;
  border-radius:999px!important;
  background:#dbeafe!important;
  color:#1d4ed8!important;
  font-size:10px!important;
  font-weight:900!important;
  white-space:nowrap!important;
}

.status-pill{
  display:inline-flex!important;
  padding:4px 6px!important;
  border-radius:999px!important;
  font-size:10px!important;
  font-weight:900!important;
  background:#f1f5f9!important;
  color:#0f172a!important;
  border:1px solid #cbd5e1!important;
  white-space:nowrap!important;
}

.trip-number-badge{
  font-weight:900!important;
  color:#1d4ed8!important;
  white-space:normal!important;
  word-break:break-word!important;
  font-size:10px!important;
}

/* ===============================
   GROUP TITLE
================================ */

.group-title{
  margin:12px 0 0!important;
  padding:5px 8px!important;
  background:#bfdbfe!important;
  color:#1e3a8a!important;
  border-top:2px solid #60a5fa!important;
  border-bottom:2px solid #60a5fa!important;
  border-radius:8px 8px 0 0!important;
  font-size:13px!important;
  font-weight:900!important;
  text-align:center!important;
  letter-spacing:.3px!important;
}

/* ===============================
   ROW COLORS
================================ */

.row-facility td{background:#dbeafe!important;}
.row-gq td{background:#dcfce7!important;}
.row-rv td{background:#fef3c7!important;}
.row-shared td{background:#ede9fe!important;}

/* ===============================
   ACTIONS
================================ */

.actions{
  display:flex!important;
  gap:6px!important;
  justify-content:center!important;
  align-items:center!important;
  flex-wrap:wrap!important;
}

.btn{
  border:none!important;
  padding:5px 9px!important;
  border-radius:7px!important;
  cursor:pointer!important;
  font-size:11px!important;
  font-weight:900!important;
}

.btn-edit{
  background:#2563eb!important;
  color:#fff!important;
}

.btn-delete{
  background:#dc2626!important;
  color:#fff!important;
}

.dispatch-check:checked{
  accent-color:#16a34a!important;
}

/* ===============================
   AUTOCOMPLETE
================================ */

.input-wrap{
  position:relative!important;
  width:100%!important;
}

.suggestions{
  position:absolute!important;
  top:100%!important;
  left:0!important;
  right:0!important;
  background:#fff!important;
  border:1px solid #cbd5e1!important;
  border-radius:10px!important;
  z-index:99999!important;
  max-height:220px!important;
  overflow:auto!important;
  box-shadow:0 12px 24px rgba(0,0,0,.15)!important;
  margin-top:4px!important;
  text-align:left!important;
}

.option{
  padding:10px 12px!important;
  cursor:pointer!important;
  font-size:13px!important;
  line-height:1.35!important;
  border-bottom:1px solid #eef2f7!important;
  background:#fff!important;
  color:#111827!important;
}

.option:last-child{
  border-bottom:none!important;
}

.option:hover{
  background:#eff6ff!important;
}

.option.disabled{
  background:#f8fafc!important;
  color:#64748b!important;
  cursor:default!important;
}

/* ===============================
   RESPONSIVE
================================ */

@media(max-width:1200px){
  .trip-table{
    min-width:1780px!important;
  }

  .stats-grid{
    grid-template-columns:repeat(auto-fit,minmax(125px,1fr))!important;
  }

  .service-strip{
    grid-template-columns:repeat(auto-fit,minmax(105px,1fr))!important;
  }

  .service-card{
    min-height:72px!important;
    padding:7px 6px!important;
  }

  .stat-value{
    font-size:21px!important;
  }
}

@media(max-width:768px){
  .trip-table{
    min-width:1780px!important;
  }

  .trip-table th,
  .trip-table td{
    font-size:10px!important;
    padding:4px!important;
  }

  .trip-table th{
    font-size:10px!important;
  }

  .edit-field,
  .edit-area{
    font-size:9.5px!important;
    padding:4px!important;
  }

  .stat-card{
    padding:8px 6px!important;
    border-radius:12px!important;
  }

  .stat-label{
    font-size:10px!important;
  }

  .stat-value{
    font-size:20px!important;
  }

  .service-strip{
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:6px!important;
  }

  .service-card{
    min-height:66px!important;
  }

  .select-btn{
    font-size:11px!important;
    padding:7px 10px!important;
  }
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

function clean(v){ return String(v ?? "").trim(); }
function upper(v){ return clean(v).toUpperCase(); }

function authHeaders(json=false){
  return {
    ...(json ? {"Content-Type":"application/json"} : {}),
    ...(token ? {Authorization:"Bearer " + token} : {})
  };
}

function serviceCodeFromValue(v){
  const x = upper(v).replace(/\s+/g,"");
  if(["ST","STANDARD","X"].includes(x)) return "ST";
  if(["XL"].includes(x)) return "XL";
  if(["TX","TAXI"].includes(x)) return "TX";
  if(["LM","LIMO","LIMOUSINE"].includes(x)) return "LM";
  if(["WH","WHEELCHAIR"].includes(x)) return "WH";
  if(["SH","SHARED"].includes(x)) return "SH";
  return x || "ST";
}

function isServiceVisible(s){
  return s.enabled === true || s.companyEnabled === true;
}

function getServiceCodeFromService(s){
  return serviceCodeFromValue(
    s.serviceKey || s.serviceCode || s.serviceType ||
    s.key || s.code || s.companySuffix || s.suffix ||
    s.name || s.title
  );
}

function getServiceTitle(s){
  return s.title || s.name || s.serviceName || getServiceCodeFromService(s);
}

function isSharedTrip(t){
  return (
    t.isShared === true ||
    upper(t.tripType) === "SHARED" ||
    upper(t.type) === "SHARED" ||
    upper(t.serviceKey) === "SHARED" ||
    upper(t.serviceKey) === "SH" ||
    upper(t.tripNumber).includes("-SH") ||
    clean(t.groupId) !== "" ||
    (Array.isArray(t.passengers) && t.passengers.length > 0)
  );
}

function getTripServiceCode(t){
  if(isSharedTrip(t)) return "SH";

  return serviceCodeFromValue(
    t.serviceKey ||
    t.serviceCode ||
    t.serviceType ||
    t.serviceSuffix ||
    t.vehicleTypeFromQuote ||
    t.vehicle ||
    ""
  );
}

function getServiceTitleByTrip(t){
  const code = getTripServiceCode(t);
  const s = services.find(x=>getServiceCodeFromService(x) === code);
  return s ? getServiceTitle(s) : code;
}

function getEnabledServiceCodes(){
  return new Set(
    services
      .filter(isServiceVisible)
      .map(getServiceCodeFromService)
      .filter(Boolean)
  );
}

function isTripAllowedByService(t){
  const enabled = getEnabledServiceCodes();
  if(!enabled.size) return true;
  return enabled.has(getTripServiceCode(t));
}

function getTripKind(t){
  const raw = [
    t.type,
    t.source,
    t.bookingSource,
    t.createdBy,
    t.from,
    t.tripType,
    t.reservationStatus,
    t.tripNumber,
    t.company ? "facility" : ""
  ].join(" ").toLowerCase();

  if(raw.includes("reserved") || raw.includes("reservation") || raw.includes("rv")) return "RV";
  if(raw.includes("quote") || raw.includes("gq") || raw.includes("website") || raw.includes("public")) return "GQ";
  if(raw.includes("company") || raw.includes("facility") || raw.includes("portal") || t.company) return "FA";
  return "GQ";
}

function rowClass(item){
  if(item.kind === "shared") return "row-shared";
  const k = getTripKind(item.trip);
  if(k === "RV") return "row-rv";
  if(k === "FA") return "row-facility";
  return "row-gq";
}

function getTripNumber(t){
  return clean(t.tripNumber || t.bookingNumber || t.id || t._id || "-");
}

function getEmail(t,p=null){
  return p?.clientEmail || p?.passengerEmail || p?.email ||
    t?.clientEmail || t?.passengerEmail || t?.entryEmail || t?.email || "";
}

function getNotes(t){
  return t.notes ?? t.tripNotes ?? t.note ?? "";
}

function stopText(s){
  if(!s) return "";
  if(typeof s === "string") return s;
  return s.address || s.location || s.name || "";
}

function getStops(t){
  if(Array.isArray(t.stops)) return t.stops;
  if(Array.isArray(t.stopAddresses)) return t.stopAddresses;
  return [];
}

function stopsPlain(t){
  return getStops(t).map(stopText).filter(Boolean).join("\n");
}

function parseStopsText(v){
  return clean(v).split("\n").map(x=>x.trim()).filter(Boolean);
}

/* ===============================
   TIMEZONE
================================ */

async function loadSystemTimezone(){
  try{
    const res = await fetch("/api/system-design",{headers:authHeaders()});
    if(!res.ok) return;

    const data = await res.json();
    SYSTEM_TIMEZONE =
      data.timezone ||
      data.systemTimezone ||
      data?.settings?.timezone ||
      "America/Phoenix";
  }catch(err){
    SYSTEM_TIMEZONE = "America/Phoenix";
  }
}

function getSystemDateParts(offsetDays=0){
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA",{
    timeZone:SYSTEM_TIMEZONE,
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(now);

  const y = Number(parts.find(p=>p.type==="year")?.value);
  const m = Number(parts.find(p=>p.type==="month")?.value);
  const d = Number(parts.find(p=>p.type==="day")?.value);

  const base = new Date(y,m-1,d);
  base.setDate(base.getDate()+offsetDays);

  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,"0")}-${String(base.getDate()).padStart(2,"0")}`;
}

function todayKey(){ return getSystemDateParts(0); }
function tomorrowKey(){ return getSystemDateParts(1); }

function isTodayTrip(t){ return clean(t.tripDate) === todayKey(); }
function isTomorrowTrip(t){ return clean(t.tripDate) === tomorrowKey(); }

/* ===============================
   SHARED GROUP ENGINE
================================ */

function getSharedKey(t){
  return clean(t.groupId) || clean(t.tripNumber) || String(t._id || t.id || "");
}

function getRealPassengersFromGroup(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return first.passengers;
  }

  return group.map((t,i)=>({
    passengerId:"P" + (i+1),
    name:t.clientName || t.name || "",
    clientName:t.clientName || t.name || "",
    phone:t.clientPhone || t.phone || "",
    clientPhone:t.clientPhone || t.phone || "",
    email:t.clientEmail || t.email || "",
    clientEmail:t.clientEmail || t.email || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled"
  }));
}

function getGroupStatus(group){
  const passengers = getRealPassengersFromGroup(group);
  if(passengers.some(p=>String(p.status || "").toLowerCase().includes("confirm"))) return "Confirmed";
  if(passengers.some(p=>String(p.status || "").toLowerCase().includes("paid"))) return "Paid";
  return group[0]?.status || "Scheduled";
}

function buildDisplayItems(list){
  const items = [];
  const usedShared = new Set();
  const sharedMap = {};

  list.filter(isSharedTrip).forEach(t=>{
    const key = getSharedKey(t);
    if(!sharedMap[key]) sharedMap[key] = [];
    sharedMap[key].push(t);
  });

  list.forEach(t=>{
    if(isSharedTrip(t)){
      const key = getSharedKey(t);
      if(usedShared.has(key)) return;
      usedShared.add(key);

      const group = (sharedMap[key] || [t]).sort((a,b)=>
        Number(a.passengerIndex || 0) - Number(b.passengerIndex || 0)
      );

      items.push({
        kind:"shared",
        key,
        trip:group[0],
        group
      });

      return;
    }

    items.push({
      kind:"trip",
      key:String(t._id || t.id),
      trip:t
    });
  });

  return items;
}

/* ===============================
   FILTERS
================================ */

function isDispatchTrip(t){

  const s = String(t.status || "")
    .toLowerCase()
    .replace(/[_-]/g," ")
    .trim();

  return (
    s === "confirmed" ||
    s === "paid"
  );
}

function baseTrips(){

  return trips.filter(t=>{

    if(t.disabled === true)
      return false;

    if(!isTripAllowedByService(t))
      return false;

    if(!isDispatchTrip(t))
      return false;

    if(
      !isTodayTrip(t) &&
      !isTomorrowTrip(t)
    ){
      return false;
    }

    return true;

  });

}

function currentItems(){
  let items = buildDisplayItems(baseTrips());

  if(activeService !== "ALL"){
    items = items.filter(item=>getTripServiceCode(item.trip) === activeService);
  }

  return items;
}

/* ===============================
   STATS
================================ */

function countKinds(items){
  const out = {total:0,fa:0,gq:0,rv:0};

  items.forEach(item=>{
    out.total++;
    const k = getTripKind(item.trip);
    if(k === "FA") out.fa++;
    else if(k === "RV") out.rv++;
    else out.gq++;
  });

  return out;
}

function renderStats(){

  const allItems = currentItems();

  const total = allItems.length;
  const today = allItems.filter(item=>isTodayTrip(item.trip)).length;
  const tomorrow = allItems.filter(item=>isTomorrowTrip(item.trip)).length;
  const fa = allItems.filter(item=>getTripKind(item.trip)==="FA").length;
  const gq = allItems.filter(item=>getTripKind(item.trip)==="GQ").length;
  const rv = allItems.filter(item=>getTripKind(item.trip)==="RV").length;

  const data = [
    ["TOTAL TRIPS", total],
    ["TODAY TRIPS", today],
    ["TOMORROW TRIPS", tomorrow],
    ["FACILITY", fa],
    ["GET QUOTE", gq],
    ["RESERVED", rv]
  ];

  statsCards.innerHTML = data.map(x=>`
    <div class="stat-card">
      <div class="stat-label">${safe(x[0])}</div>
      <div class="stat-value">${x[1]}</div>
    </div>
  `).join("");
}

function renderServiceCards(){

  const allItems = currentItems();
  const visible = services.filter(isServiceVisible);
  const cards = [];

  cards.push({code:"ALL", title:"ALL", ...countKinds(allItems)});

  visible.forEach(s=>{
    const code = getServiceCodeFromService(s);
    const serviceItems = allItems.filter(item=>getTripServiceCode(item.trip) === code);

    cards.push({
      code,
      title:getServiceTitle(s),
      ...countKinds(serviceItems)
    });
  });

  const used = new Set();

  const unique = cards.filter(c=>{
    if(used.has(c.code)) return false;
    used.add(c.code);
    return true;
  });

  serviceCards.innerHTML = unique.map(c=>`
    <div class="service-card ${activeService===c.code ? "active" : ""}"
      onclick="setActiveService('${safe(c.code)}')">
      <div class="service-name">${safe(c.title)}</div>
      <div class="service-total">${c.total}</div>
      <div class="service-mini">
        <span>FA ${c.fa}</span>
        <span>GQ ${c.gq}</span>
        <span>RV ${c.rv}</span>
      </div>
    </div>
  `).join("");
}

function setActiveService(code){
  activeService = code || "ALL";
  renderAll();
}

/* ===============================
   SELECTION
================================ */

function itemSelected(item){
  if(item.kind === "trip") return item.trip.dispatchSelected === true;
  return item.group.some(t=>t.dispatchSelected === true);
}

function allSelected(items){
  return items.length > 0 && items.every(item=>itemSelected(item));
}

function updateSelectionButtons(){
  const all = currentItems();
  const today = all.filter(item=>isTodayTrip(item.trip));
  const tomorrow = all.filter(item=>isTomorrowTrip(item.trip));

  const bAll = document.getElementById("selectAllBtn");
  const bToday = document.getElementById("selectTodayBtn");
  const bTomorrow = document.getElementById("selectTomorrowBtn");

  if(bAll){
    const selected = allSelected(all);
    bAll.innerText = selected ? "Unselect All" : "Select All";
    bAll.classList.toggle("active",selected);
  }

  if(bToday){
    const selected = allSelected(today);
    bToday.innerText = selected ? "Unselect Today" : "Select Today";
    bToday.classList.toggle("active",selected);
  }

  if(bTomorrow){
    const selected = allSelected(tomorrow);
    bTomorrow.innerText = selected ? "Unselect Tomorrow" : "Select Tomorrow";
    bTomorrow.classList.toggle("active",selected);
  }
}

async function setItemSelected(item,val){
  const group = item.kind === "shared" ? item.group : [item.trip];

  await Promise.all(group.map(t=>
    fetch(API + "/" + t._id,{
      method:"PUT",
      headers:authHeaders(true),
      body:JSON.stringify({dispatchSelected:val})
    })
  ));
}

async function bulkSetSelected(items,val){
  await Promise.all(items.map(item=>setItemSelected(item,val)));
  await loadTrips();
}

function toggleSelectAll(){
  const items = currentItems();
  bulkSetSelected(items,!allSelected(items));
}

function toggleSelectToday(){
  const items = currentItems().filter(item=>isTodayTrip(item.trip));
  bulkSetSelected(items,!allSelected(items));
}

function toggleSelectTomorrow(){
  const items = currentItems().filter(item=>isTomorrowTrip(item.trip));
  bulkSetSelected(items,!allSelected(items));
}

async function sendDispatchItem(key,val){
  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  await setItemSelected(item,val);

  if(item.kind === "trip") item.trip.dispatchSelected = val;
  else item.group.forEach(t=>t.dispatchSelected = val);

  updateSelectionButtons();
}

/* ===============================
   AUTOCOMPLETE
================================ */

async function searchAddress(q){
  const query = clean(q);
  if(query.length < 3) return [];

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`
    );

    if(!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];

  }catch(err){
    return [];
  }
}

function ensureWrapped(input){
  if(!input) return null;
  if(input.parentElement?.classList.contains("input-wrap")) return input.parentElement;

  const wrap = document.createElement("div");
  wrap.className = "input-wrap";
  input.parentNode.insertBefore(wrap,input);
  wrap.appendChild(input);
  return wrap;
}

function renderSuggestions(box,results){
  if(!results.length){
    box.innerHTML = `<div class="option disabled">No results</div>`;
    return;
  }

  box.innerHTML = results.map(r=>`
    <div class="option"
      data-address="${safe(r.display_name)}"
      data-lat="${safe(r.lat)}"
      data-lng="${safe(r.lon)}">
      ${safe(r.display_name)}
    </div>
  `).join("");
}

function attachAutocomplete(input){
  if(!input) return;

  const wrap = ensureWrapped(input);
  let old = wrap.querySelector(".suggestions");
  if(old) old.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);

  let timer = null;
  input.setAttribute("autocomplete","off");

  input.addEventListener("input",()=>{
    selectedMap.set(input,null);
    clearTimeout(timer);

    const q = clean(input.value);

    if(q.length < 3){
      box.innerHTML = "";
      return;
    }

    timer = setTimeout(async()=>{
      renderSuggestions(box,await searchAddress(q));
    },250);
  });

  box.addEventListener("click",e=>{
    const el = e.target.closest(".option");
    if(!el || el.classList.contains("disabled")) return;

    const obj = {
      address:el.dataset.address,
      lat:Number(el.dataset.lat),
      lng:Number(el.dataset.lng)
    };

    input.value = obj.address;
    selectedMap.set(input,obj);
    box.innerHTML = "";
  });

  input.addEventListener("blur",()=>{
    setTimeout(()=>box.innerHTML="",180);
  });
}

/* ===============================
   LOAD
================================ */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_API,{headers:authHeaders()});
    const data = await res.json();
    services = Array.isArray(data) ? data : [];
  }catch(err){
    services = [];
  }
}

async function loadTrips(){
  try{
    const res = await fetch(API,{headers:authHeaders()});
    const data = await res.json();
    trips = Array.isArray(data) ? data : [];
  }catch(err){
    trips = [];
  }

  renderAll();
}

/* ===============================
   RENDER
================================ */

function sortByTime(a,b){
  return clean(a.trip.tripTime).localeCompare(clean(b.trip.tripTime)) ||
         getTripNumber(a.trip).localeCompare(getTripNumber(b.trip));
}

function renderAll(){
  renderStats();
  renderServiceCards();
  renderTrips();
  updateSelectionButtons();
}

function renderTrips(){
  container.innerHTML = "";

  displayItems = currentItems();

  const today = displayItems.filter(item=>isTodayTrip(item.trip)).sort(sortByTime);
  const tomorrow = displayItems.filter(item=>isTomorrowTrip(item.trip)).sort(sortByTime);

  drawGroup("Today – " + todayKey(),today);
  drawGroup("Tomorrow – " + tomorrowKey(),tomorrow);
}

function drawGroup(title,list){
  const header = document.createElement("div");
  header.className = "group-title";
  header.innerText = title;
  container.appendChild(header);

  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";

  const table = document.createElement("table");
  table.className = "trip-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-dispatch">Dispatch</th>
        <th class="col-num">#</th>
        <th class="col-trip">Trip #</th>
        <th class="col-service">Service</th>
        <th class="col-type">Type</th>
        <th class="col-facility">Facility</th>
        <th class="col-entry">Entry</th>
        <th class="col-entry-phone">Entry Phone</th>
        <th class="col-client">Client / Passengers</th>
        <th class="col-phone">Phone</th>
        <th class="col-email">Email</th>
        <th class="col-pickup">Pickup</th>
        <th class="col-stops">Stops</th>
        <th class="col-dropoff">Dropoff</th>
        <th class="col-date">Date</th>
        <th class="col-time">Time</th>
        <th class="col-notes">Notes</th>
        <th class="col-status">Status</th>
        <th class="col-actions">Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  if(!list.length){
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="19" style="text-align:center;padding:20px;font-weight:900;">No Trips</td>`;
    tbody.appendChild(row);
  }else{
    list.forEach((item,i)=>{
      tbody.appendChild(item.kind === "shared" ? renderSharedRow(item,i+1) : renderTripRow(item,i+1));
    });
  }

  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function inputCell(value,cls,field,type="text"){
  return `<input class="edit-field ${cls}" data-field="${field}" disabled type="${type}" value="${safe(value)}">`;
}

function areaCell(value,cls,field){
  return `<textarea class="edit-area ${cls}" data-field="${field}" disabled>${safe(value)}</textarea>`;
}

function renderTripRow(item,num){
  const t = item.trip;

  const tr = document.createElement("tr");
  tr.className = rowClass(item);
  tr.dataset.key = item.key;
  tr.dataset.tripId = t._id;

  tr.innerHTML = `
    <td class="col-dispatch">
      <input class="dispatch-check" type="checkbox"
        ${itemSelected(item) ? "checked" : ""}
        onchange="sendDispatchItem('${safe(item.key)}',this.checked)">
    </td>

    <td class="col-num">${num}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(t))}</span>
    </td>

    <td class="col-service">
      <span class="service-pill">${safe(getServiceTitleByTrip(t))}</span>
    </td>

    <td class="col-type">${safe(t.type || getTripKind(t))}</td>

    <td class="col-facility">${inputCell(t.company || "","company","company")}</td>
    <td class="col-entry">${inputCell(t.entryName || "","entryName","entryName")}</td>
    <td class="col-entry-phone">${inputCell(t.entryPhone || "","entryPhone","entryPhone")}</td>

    <td class="wide-client col-client">${inputCell(t.clientName || t.name || "","clientName","clientName")}</td>
    <td class="wide-phone col-phone">${inputCell(t.clientPhone || t.phone || "","clientPhone","clientPhone")}</td>
    <td class="wide-email col-email">${inputCell(getEmail(t),"clientEmail","clientEmail","email")}</td>

    <td class="wide-address col-pickup">${areaCell(t.pickup || "","pickup","pickup")}</td>
    <td class="wide-stops col-stops">${areaCell(stopsPlain(t),"stopsText","stopsText")}</td>
    <td class="wide-address col-dropoff">${areaCell(t.dropoff || "","dropoff","dropoff")}</td>

    <td class="col-date">${inputCell(t.tripDate || "","tripDate","tripDate","date")}</td>
    <td class="col-time">${inputCell(t.tripTime || "","tripTime","tripTime","time")}</td>

    <td class="wide-notes col-notes">${areaCell(getNotes(t),"notes","notes")}</td>

    <td class="col-status">
      <span class="status-pill">${safe(t.status || "Scheduled")}</span>
    </td>

    <td class="actions col-actions">
      <button class="btn btn-edit" onclick="editItem('${safe(item.key)}',this)">Edit</button>
      <button class="btn btn-delete" onclick="deleteItem('${safe(item.key)}')">Delete</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(item,num){
  const first = item.trip;
  const passengers = getRealPassengersFromGroup(item.group);

  const names = passengers.map((p,i)=>`${i+1}. ${p.name || p.clientName || ""}`).join("\n");
  const phones = passengers.map((p,i)=>`${i+1}. ${p.phone || p.clientPhone || ""}`).join("\n");
  const emails = passengers.map((p,i)=>`${i+1}. ${getEmail(first,p) || ""}`).join("\n");
  const pickups = passengers.map((p,i)=>`${i+1}. ${p.pickup || ""}`).join("\n");
  const dropoffs = passengers.map((p,i)=>`${i+1}. ${p.dropoff || ""}`).join("\n");

  const tr = document.createElement("tr");
  tr.className = rowClass(item);
  tr.dataset.key = item.key;

  tr.innerHTML = `
    <td class="col-dispatch">
      <input class="dispatch-check" type="checkbox"
        ${itemSelected(item) ? "checked" : ""}
        onchange="sendDispatchItem('${safe(item.key)}',this.checked)">
    </td>

    <td class="col-num">${num}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(first))}</span>
    </td>

    <td class="col-service">
      <span class="service-pill">${safe(getServiceTitleByTrip(first))}</span>
    </td>

    <td class="col-type">Shared</td>

    <td class="col-facility">${inputCell(first.company || "","company","company")}</td>
    <td class="col-entry">${inputCell(first.entryName || "","entryName","entryName")}</td>
    <td class="col-entry-phone">${inputCell(first.entryPhone || "","entryPhone","entryPhone")}</td>

    <td class="wide-client col-client">${areaCell(names,"sharedNames","sharedNames")}</td>
    <td class="wide-phone col-phone">${areaCell(phones,"sharedPhones","sharedPhones")}</td>
    <td class="wide-email col-email">${areaCell(emails,"sharedEmails","sharedEmails")}</td>

    <td class="wide-address col-pickup">${areaCell(pickups,"sharedPickups","sharedPickups")}</td>
    <td class="wide-stops col-stops">Route optimized per passenger</td>
    <td class="wide-address col-dropoff">${areaCell(dropoffs,"sharedDropoffs","sharedDropoffs")}</td>

    <td class="col-date">${inputCell(first.tripDate || "","tripDate","tripDate","date")}</td>
    <td class="col-time">${inputCell(first.tripTime || "","tripTime","tripTime","time")}</td>

    <td class="wide-notes col-notes">${areaCell(getNotes(first),"notes","notes")}</td>

    <td class="col-status">
      <span class="status-pill">${safe(getGroupStatus(item.group))}</span>
    </td>

    <td class="actions col-actions">
      <button class="btn btn-edit" onclick="editItem('${safe(item.key)}',this)">Edit</button>
      <button class="btn btn-delete" onclick="deleteItem('${safe(item.key)}')">Delete</button>
    </td>
  `;

  return tr;
}

/* ===============================
   EDIT / SAVE
================================ */

function parseNumberedLines(v){
  return clean(v).split("\n")
    .map(x=>x.replace(/^\s*\d+\.\s*/,"").trim());
}

function parseTripDateTime(dateStr,timeStr){
  if(!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function getSystemNow(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:SYSTEM_TIMEZONE}));
}

function isFutureTrip(dateStr,timeStr){
  const dt = parseTripDateTime(dateStr,timeStr);
  if(!dt) return false;
  return dt > getSystemNow();
}

function enableRow(row,val){
  row.querySelectorAll(".edit-field,.edit-area").forEach(f=>{
    f.disabled = !val;
  });
}

async function editItem(key,btn){
  const item = displayItems.find(x=>x.key === key);
  const row = btn.closest("tr");

  if(!item || !row) return;

  if(btn.innerText === "Edit"){
    enableRow(row,true);

    row.querySelectorAll(".pickup,.dropoff").forEach(attachAutocomplete);

    btn.innerText = "Save";
    return;
  }

  if(item.kind === "shared") await saveSharedItem(item,row);
  else await saveSingleItem(item,row);
}

async function saveSingleItem(item,row){
  const t = item.trip;

  const payload = {
    company: row.querySelector(".company")?.value || "",
    entryName: row.querySelector(".entryName")?.value || "",
    entryPhone: row.querySelector(".entryPhone")?.value || "",
    clientName: row.querySelector(".clientName")?.value || "",
    clientPhone: row.querySelector(".clientPhone")?.value || "",
    clientEmail: row.querySelector(".clientEmail")?.value || "",
    pickup: row.querySelector(".pickup")?.value || "",
    dropoff: row.querySelector(".dropoff")?.value || "",
    tripDate: row.querySelector(".tripDate")?.value || "",
    tripTime: row.querySelector(".tripTime")?.value || "",
    notes: row.querySelector(".notes")?.value || "",
    stops: parseStopsText(row.querySelector(".stopsText")?.value || "")
  };

  if(!isFutureTrip(payload.tripDate,payload.tripTime)){
    alert("❌ Cannot save trip in the past");
    return;
  }

  const pickupInput = row.querySelector(".pickup");
  const dropoffInput = row.querySelector(".dropoff");
  const pickupSelected = selectedMap.get(pickupInput);
  const dropoffSelected = selectedMap.get(dropoffInput);

  if(pickupSelected){
    payload.pickup = pickupSelected.address;
    payload.pickupLat = pickupSelected.lat;
    payload.pickupLng = pickupSelected.lng;
  }

  if(dropoffSelected){
    payload.dropoff = dropoffSelected.address;
    payload.dropoffLat = dropoffSelected.lat;
    payload.dropoffLng = dropoffSelected.lng;
  }

  await fetch(API + "/" + t._id,{
    method:"PUT",
    headers:authHeaders(true),
    body:JSON.stringify(payload)
  });

  await loadTrips();
}

async function saveSharedItem(item,row){
  const first = item.trip;
  const oldPassengers = getRealPassengersFromGroup(item.group);

  const names = parseNumberedLines(row.querySelector(".sharedNames")?.value || "");
  const phones = parseNumberedLines(row.querySelector(".sharedPhones")?.value || "");
  const emails = parseNumberedLines(row.querySelector(".sharedEmails")?.value || "");
  const pickups = parseNumberedLines(row.querySelector(".sharedPickups")?.value || "");
  const dropoffs = parseNumberedLines(row.querySelector(".sharedDropoffs")?.value || "");

  const count = Math.max(
    oldPassengers.length,
    names.length,
    phones.length,
    emails.length,
    pickups.length,
    dropoffs.length
  );

  const passengers = [];

  for(let i=0;i<count;i++){
    passengers.push({
      ...oldPassengers[i],
      name:names[i] || "",
      clientName:names[i] || "",
      phone:phones[i] || "",
      clientPhone:phones[i] || "",
      email:emails[i] || "",
      clientEmail:emails[i] || "",
      pickup:pickups[i] || "",
      dropoff:dropoffs[i] || "",
      status:oldPassengers[i]?.status || first.status || "Scheduled"
    });
  }

  const payload = {
    company: row.querySelector(".company")?.value || "",
    entryName: row.querySelector(".entryName")?.value || "",
    entryPhone: row.querySelector(".entryPhone")?.value || "",
    tripDate: row.querySelector(".tripDate")?.value || "",
    tripTime: row.querySelector(".tripTime")?.value || "",
    notes: row.querySelector(".notes")?.value || "",
    isShared:true,
    tripType:"SHARED",
    passengers,
    totalPassengers:passengers.length
  };

  if(!isFutureTrip(payload.tripDate,payload.tripTime)){
    alert("❌ Cannot save trip in the past");
    return;
  }

  await Promise.all(item.group.map(t=>
    fetch(API + "/" + t._id,{
      method:"PUT",
      headers:authHeaders(true),
      body:JSON.stringify(payload)
    })
  ));

  await loadTrips();
}

/* ===============================
   DELETE
================================ */

async function deleteItem(key){
  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  if(!confirm("Delete trip?")) return;

  const group = item.kind === "shared" ? item.group : [item.trip];

  await Promise.all(group.map(t=>
    fetch(API + "/" + t._id,{
      method:"DELETE",
      headers:authHeaders()
    })
  ));

  await loadTrips();
}

/* ===============================
   GLOBALS
================================ */

Object.assign(window,{
  setActiveService,
  toggleSelectAll,
  toggleSelectToday,
  toggleSelectTomorrow,
  sendDispatchItem,
  editItem,
  deleteItem
});

/* ===============================
   START
================================ */

(async function start(){
  await loadSystemTimezone();
  await loadServices();
  await loadTrips();
})();