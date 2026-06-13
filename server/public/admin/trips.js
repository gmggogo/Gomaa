/* ===============================
   ADMIN TRIPS V3 CLEAN
   Same Trips Hub Shared Layout
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
   SERVICE CARDS
================================ */

.service-strip{
  display:grid!important;
  grid-template-columns:repeat(auto-fit,minmax(135px,1fr))!important;
  gap:8px!important;
  overflow:visible!important;
  padding-bottom:0!important;
  margin-bottom:14px;
}

.service-card{
  border:1px solid #dbe3ee!important;
  background:#fff!important;
  color:#0f172a!important;
  border-radius:14px!important;
  padding:10px 8px!important;
  cursor:pointer;
  font-weight:900;
  box-shadow:0 5px 14px rgba(15,23,42,.06);
  text-align:center;
  min-height:92px!important;
  min-width:0!important;
}

.service-card.active{
  background:#2563eb!important;
  color:#fff!important;
  border-color:#2563eb!important;
  outline:none!important;
}

.service-name{
  font-size:13px!important;
  line-height:1.15;
  margin-bottom:5px;
}

.service-total{
  font-size:25px!important;
  line-height:1.05;
  font-weight:900;
}

.service-mini{
  display:grid!important;
  grid-template-columns:repeat(3,1fr);
  margin-top:7px;
  font-size:11px!important;
  font-weight:900;
  color:#64748b;
}

.service-card.active .service-mini{
  color:#fff!important;
}

/* ===============================
   TABLE
================================ */

.table-scroll{
  width:100%;
  overflow-x:auto;
  -webkit-overflow-scrolling:touch;
  border-radius:14px;
  background:#fff;
  box-shadow:0 8px 22px rgba(15,23,42,.08);
  margin-bottom:22px;
}

.trip-table{
  min-width:2200px!important;
  width:max-content!important;
  border-collapse:collapse;
  background:#fff;
  font-size:13px;
}

.trip-table th{
  background:#2563eb!important;
  color:#fff;
  padding:8px;
  text-align:center;
  white-space:nowrap;
  font-weight:900;
  border:1px solid #dbe3ee;
}

.trip-table td{
  padding:7px;
  border:1px solid #dbe3ee;
  text-align:center;
  vertical-align:middle;
  line-height:1.35;
}

/* ===============================
   WIDE COLUMNS
================================ */

.wide-client{
  min-width:170px;
  max-width:250px;
  text-align:left!important;
  white-space:pre-line;
  word-break:break-word;
}

.wide-phone{
  min-width:170px;
  max-width:250px;
  text-align:left!important;
  white-space:pre-line;
  word-break:break-word;
}

.wide-email{
  min-width:180px;
  max-width:280px;
  text-align:left!important;
  white-space:pre-line;
  word-break:break-word;
  font-size:12px!important;
}

.wide-address{
  min-width:260px;
  max-width:380px;
  text-align:left!important;
  white-space:pre-line;
  word-break:break-word;
  font-size:12px!important;
}

.wide-notes{
  min-width:220px;
  max-width:320px;
  text-align:left!important;
  white-space:pre-line;
  word-break:break-word;
}

/* ===============================
   INPUTS
================================ */

.edit-field,
.edit-area{
  width:100%;
  min-width:95px;
  padding:6px;
  border:1px solid #cbd5e1;
  border-radius:7px;
  font-size:12px;
  font-weight:700;
  box-sizing:border-box;
  font-family:inherit;
}

.edit-area{
  min-height:62px;
  resize:vertical;
  white-space:pre-line;
}

.edit-field:disabled,
.edit-area:disabled{
  border:none;
  background:transparent;
  color:#0f172a;
  opacity:1;
  resize:none;
}

/* ===============================
   BADGES
================================ */

.service-pill{
  display:inline-flex;
  padding:4px 8px;
  border-radius:999px;
  background:#dbeafe;
  color:#1d4ed8;
  font-size:12px;
  font-weight:900;
}

.status-pill{
  display:inline-flex;
  padding:5px 9px;
  border-radius:999px;
  font-size:12px;
  font-weight:900;
  background:#f1f5f9;
  color:#0f172a;
  border:1px solid #cbd5e1;
}

.trip-number-badge{
  font-weight:900;
  color:#1d4ed8;
}

/* ===============================
   ROW COLORS
================================ */

.row-facility td{background:#dbeafe;}
.row-gq td{background:#dcfce7;}
.row-rv td{background:#fef3c7;}
.row-shared td{background:#ede9fe;}

/* ===============================
   ACTIONS
================================ */

.actions{
  display:flex;
  gap:6px;
  justify-content:center;
  align-items:center;
  flex-wrap:wrap;
}

.btn{
  border:none;
  padding:6px 10px;
  border-radius:7px;
  cursor:pointer;
  font-size:12px;
  font-weight:900;
}

.btn-edit{
  background:#2563eb;
  color:white;
}

.btn-delete{
  background:#dc2626;
  color:white;
}

.dispatch-check:checked{
  accent-color:#16a34a;
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

function stopsDisplay(t){
  const arr = getStops(t).map(stopText).filter(Boolean);
  if(!arr.length) return "--";
  return arr.map((x,i)=>`${i+1}. ${safe(x)}`).join("\n");
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

  const allItems =
    currentItems();
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
const allItems =
  currentItems();
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

  if(bAll) bAll.innerText = allSelected(all) ? "REMOVE ALL" : "SELECT ALL";
  if(bToday) bToday.innerText = allSelected(today) ? "REMOVE TODAY" : "SELECT TODAY";
  if(bTomorrow) bTomorrow.innerText = allSelected(tomorrow) ? "REMOVE TOMORROW" : "SELECT TOMORROW";
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
    <tr>
      <th>Dispatch</th>
      <th>#</th>
      <th>Trip #</th>
      <th>Service</th>
      <th>Type</th>
      <th>Facility</th>
      <th>Entry</th>
      <th>Entry Phone</th>
      <th>Client / Passengers</th>
      <th>Phone</th>
      <th>Email</th>
      <th>Pickup</th>
      <th>Stops</th>
      <th>Dropoff</th>
      <th>Date</th>
      <th>Time</th>
      <th>Notes</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  `;

  if(!list.length){
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="19" style="text-align:center;padding:20px;font-weight:900;">No Trips</td>`;
    table.appendChild(row);
  }else{
    list.forEach((item,i)=>{
      table.appendChild(item.kind === "shared" ? renderSharedRow(item,i+1) : renderTripRow(item,i+1));
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
    <td>
      <input class="dispatch-check" type="checkbox"
        ${itemSelected(item) ? "checked" : ""}
        onchange="sendDispatchItem('${safe(item.key)}',this.checked)">
    </td>
    <td>${num}</td>
    <td><span class="trip-number-badge">${safe(getTripNumber(t))}</span></td>
    <td><span class="service-pill">${safe(getServiceTitleByTrip(t))}</span></td>
    <td>${safe(t.type || getTripKind(t))}</td>
    <td>${inputCell(t.company || "","company","company")}</td>
    <td>${inputCell(t.entryName || "","entryName","entryName")}</td>
    <td>${inputCell(t.entryPhone || "","entryPhone","entryPhone")}</td>
    <td class="wide-client">${inputCell(t.clientName || t.name || "","clientName","clientName")}</td>
    <td class="wide-phone">${inputCell(t.clientPhone || t.phone || "","clientPhone","clientPhone")}</td>
    <td class="wide-email">${inputCell(getEmail(t),"clientEmail","clientEmail","email")}</td>
    <td class="wide-address">${areaCell(t.pickup || "","pickup","pickup")}</td>
    <td class="wide-address">${areaCell(stopsPlain(t),"stopsText","stopsText")}</td>
    <td class="wide-address">${areaCell(t.dropoff || "","dropoff","dropoff")}</td>
    <td>${inputCell(t.tripDate || "","tripDate","tripDate","date")}</td>
    <td>${inputCell(t.tripTime || "","tripTime","tripTime","time")}</td>
    <td class="wide-notes">${areaCell(getNotes(t),"notes","notes")}</td>
    <td><span class="status-pill">${safe(t.status || "Scheduled")}</span></td>
    <td class="actions">
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
    <td>
      <input class="dispatch-check" type="checkbox"
        ${itemSelected(item) ? "checked" : ""}
        onchange="sendDispatchItem('${safe(item.key)}',this.checked)">
    </td>
    <td>${num}</td>
    <td><span class="trip-number-badge">${safe(getTripNumber(first))}</span></td>
    <td><span class="service-pill">${safe(getServiceTitleByTrip(first))}</span></td>
    <td>Shared</td>
    <td>${inputCell(first.company || "","company","company")}</td>
    <td>${inputCell(first.entryName || "","entryName","entryName")}</td>
    <td>${inputCell(first.entryPhone || "","entryPhone","entryPhone")}</td>
    <td class="wide-client">${areaCell(names,"sharedNames","sharedNames")}</td>
    <td class="wide-phone">${areaCell(phones,"sharedPhones","sharedPhones")}</td>
    <td class="wide-email">${areaCell(emails,"sharedEmails","sharedEmails")}</td>
    <td class="wide-address">${areaCell(pickups,"sharedPickups","sharedPickups")}</td>
    <td class="wide-address">Route optimized per passenger</td>
    <td class="wide-address">${areaCell(dropoffs,"sharedDropoffs","sharedDropoffs")}</td>
    <td>${inputCell(first.tripDate || "","tripDate","tripDate","date")}</td>
    <td>${inputCell(first.tripTime || "","tripTime","tripTime","time")}</td>
    <td class="wide-notes">${areaCell(getNotes(first),"notes","notes")}</td>
    <td><span class="status-pill">${safe(getGroupStatus(item.group))}</span></td>
    <td class="actions">
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

  const count = Math.max(oldPassengers.length,names.length,phones.length,pickups.length,dropoffs.length);

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