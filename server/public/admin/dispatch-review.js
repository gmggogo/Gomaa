/* ==========================================================================
   DISPATCH REVIEW - CLOSED TRIPS
   Admin / SuperAdmin / Dispatcher
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

let allTrips = [];
let services = [];
let displayItems = [];
let activeService = "ALL";
let refreshTimer = null;

const CLOSED_HOURS = 10;

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const yearFilter = document.getElementById("yearFilter");
const monthFilter = document.getElementById("monthFilter");
const reviewContent = document.getElementById("reviewContent");

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

function compactStatus(v){
  return cleanStatus(v).replace(/\s+/g,"");
}

function isCompletedStatus(status){
  const s = cleanStatus(status);
  return s === "completed" || s === "complete";
}

function isCancelledStatus(status){
  return cleanStatus(status).includes("cancel");
}

function isNoShowStatus(status){
  const s = cleanStatus(status);
  return s.includes("no show") || s.includes("noshow");
}

function isScheduledStatus(status){
  return cleanStatus(status) === "scheduled";
}

function isConfirmedStatus(status){
  return cleanStatus(status) === "confirmed";
}

function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
}

function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function monthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function parseTripDateTime(t){
  if(!t || !t.tripDate) return null;

  const date = String(t.tripDate || "").trim();
  let time = String(t.tripTime || "00:00").trim();

  if(!time) time = "00:00";

  let d = new Date(`${date}T${time}`);
  if(isNaN(d)) d = new Date(`${date} ${time}`);
  if(isNaN(d)) return null;

  return d;
}

function isNotCompletedStatus(status,trip){
  const s = cleanStatus(status);
  const c = compactStatus(status);

  if(s === "not completed" || c === "notcompleted" || s.includes("not complete")){
    return true;
  }

  if(isCompletedStatus(status) || isCancelledStatus(status) || isNoShowStatus(status)){
    return false;
  }

  if(!isScheduledStatus(status) && !isConfirmedStatus(status)){
    return false;
  }

  const dt = parseTripDateTime(trip);
  if(!dt) return false;

  return Date.now() - dt.getTime() >= CLOSED_HOURS * 60 * 60 * 1000;
}

function isClosedStatus(status,trip){
  return (
    isCompletedStatus(status) ||
    isCancelledStatus(status) ||
    isNoShowStatus(status) ||
    isNotCompletedStatus(status,trip)
  );
}

function displayStatus(status,trip){
  if(isNotCompletedStatus(status,trip)) return "Not Completed";
  if(isCompletedStatus(status)) return "Completed";
  if(isCancelledStatus(status)) return "Cancelled";
  if(isNoShowStatus(status)) return "No Show";
  return status || "-";
}

function statusClass(status,trip){
  const label = displayStatus(status,trip);
  if(label === "Completed") return "completed";
  if(label === "Cancelled") return "cancelled";
  if(label === "No Show") return "noshow";
  if(label === "Not Completed") return "notcompleted";
  return "";
}

function getTripNumber(t){
  return String(t?.tripNumber || t?.bookingNumber || t?.id || "-");
}

function getBookedDateObj(t){
  return new Date(t?.bookedAt || t?.createdAt || t?.updatedAt || t?.tripDate || Date.now());
}

function formatDateObj(d){
  if(!d || isNaN(d)) return "-";
  return d.toLocaleDateString();
}

function formatTimeObj(d){
  if(!d || isNaN(d)) return "-";
  return d.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });
}

function getBookedDate(t){
  return formatDateObj(getBookedDateObj(t));
}

function getBookedTime(t){
  return formatTimeObj(getBookedDateObj(t));
}

function getTripDateKey(t){
  return t?.tripDate || "Unknown";
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
  return (
    s?.title ||
    s?.name ||
    s?.serviceName ||
    s?.serviceKey ||
    getServiceCodeFromService(s) ||
    "Service"
  );
}

function getServiceCodeFromTrip(t){
  const direct = normalizeText(
    t?.serviceKey ||
    t?.serviceCode ||
    t?.serviceType ||
    t?.serviceSuffix ||
    t?.service ||
    t?.pricingSnapshot?.serviceKey ||
    t?.pricingSnapshot?.serviceCode ||
    t?.priceSnapshot?.serviceKey ||
    t?.priceSnapshot?.serviceCode ||
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
  const service = services.find(s => getServiceCodeFromService(s) === code);
  return service ? getServiceTitle(service) : code;
}

function tripMatchesService(t,code){
  if(code === "ALL") return true;
  return getServiceCodeFromTrip(t) === code;
}

/* ===============================
   SOURCE / PASSENGER
================================ */

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

  return t?.company ? "CO" : "GQ";
}

function sourceHTML(t){
  const code = getSourceCode(t);
  return `<span class="source-pill ${code === "CO" ? "company" : "gq"}">${code === "CO" ? "Company" : "Get Quote"}</span>`;
}

function getEmail(t,p){
  return (
    p?.clientEmail ||
    p?.passengerEmail ||
    p?.email ||
    t?.clientEmail ||
    t?.passengerEmail ||
    t?.email ||
    t?.entryEmail ||
    "-"
  );
}

function getPassengerName(p,t){
  return p?.clientName || p?.passengerName || p?.name || t?.clientName || t?.name || "-";
}

function getPassengerPhone(p,t){
  return p?.clientPhone || p?.passengerPhone || p?.phone || t?.clientPhone || t?.phone || "-";
}

function getPickup(t,p){
  return p?.pickup || t?.pickup || "-";
}

function getDropoff(t,p){
  return p?.dropoff || t?.dropoff || "-";
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
    passengerId:"P" + (i + 1),
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

function getSharedGroups(list = allTrips){
  const map = {};

  list.filter(isSharedTrip).forEach(t=>{
    const key = getSharedKey(t);
    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map).map(group =>
    group.sort((a,b)=>Number(a.passengerIndex || 0) - Number(b.passengerIndex || 0))
  );
}

function hasClosedPassenger(group){
  const first = group[0] || {};
  return getRealPassengersFromGroup(group).some(p =>
    isClosedStatus(p.status || first.status,first)
  );
}

function getClosedPassengers(group){
  const first = group[0] || {};
  return getRealPassengersFromGroup(group).filter(p =>
    isClosedStatus(p.status || first.status,first)
  );
}

function getGroupStatus(group){
  const first = group[0] || {};
  const closed = getClosedPassengers(group);

  if(closed.length === 1){
    return displayStatus(closed[0].status || first.status,first);
  }

  if(closed.length > 1){
    if(closed.every(p => isCompletedStatus(p.status || first.status))) return "Completed";
    if(closed.every(p => isCancelledStatus(p.status || first.status))) return "Cancelled";
    if(closed.every(p => isNoShowStatus(p.status || first.status))) return "No Show";
    if(closed.every(p => isNotCompletedStatus(p.status || first.status,first))) return "Not Completed";
    return "Mixed Closed";
  }

  return first.status || "Scheduled";
}

/* ===============================
   LOAD
================================ */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_URL,{
      headers: token ? { Authorization:"Bearer " + token } : {}
    });

    if(!res.ok) throw new Error("Failed services");

    const data = await res.json();
    services = extractServices(data).filter(serviceEnabled);

    if(activeService !== "ALL" && !services.some(s => getServiceCodeFromService(s) === activeService)){
      activeService = "ALL";
    }

  }catch(err){
    console.log(err);
    services = [];
    activeService = "ALL";
  }
}

async function loadTrips(){
  try{
    const res = await fetch(API_URL,{
      headers: token ? { Authorization:"Bearer " + token } : {}
    });

    if(!res.ok) throw new Error("Failed trips");

    const data = await res.json();

 allTrips = Array.isArray(data)
  ? data.sort((a,b)=>getBookedDateObj(b)-getBookedDateObj(a))
  : [];

allTrips = allTrips.map(t => {

  if (!t.company || t.company === "Sunbeam Transportation") {

    const companyName =
      t.companyName ||
      t.facilityName ||
      t.organizationName ||
      t.customerCompany ||
      "";

    if (companyName) {
      t.company = companyName;
    }
  }

  return t;
});

buildFilters();
applyFilters();

  }catch(err){
    console.log(err);
    allTrips = [];
    displayItems = [];
    render();
  }
}

/* ===============================
   FILTERS
================================ */

function isClosedTrip(t){
  if(!t) return false;

  if(isSharedTrip(t)){
    const group = getSharedGroups(allTrips).find(g => getSharedKey(g[0]) === getSharedKey(t)) || [t];
    return hasClosedPassenger(group);
  }

  return isClosedStatus(t.status,t);
}

function buildDisplayItems(trips){
  const activeCodes =
  services.map(s =>
    getServiceCodeFromService(s)
  );

const items = [];
  const usedShared = new Set();

  trips.forEach(t=>{

const tripCode =
  getServiceCodeFromTrip(t);

if(!activeCodes.includes(tripCode)){
  return;
}
    if(!isClosedTrip(t)) return;

    if(isSharedTrip(t)){
      const key = getSharedKey(t);
      if(usedShared.has(key)) return;

      usedShared.add(key);

      const group =
        getSharedGroups(trips).find(g => getSharedKey(g[0]) === key) ||
        [t];

      if(!hasClosedPassenger(group)) return;

      items.push({
        kind:"shared",
        key,
        date:parseTripDateTime(group[0]) || getBookedDateObj(group[0]),
        tripDate:getTripDateKey(group[0]),
        group
      });

      return;
    }

    items.push({
      kind:"trip",
      key:String(t._id || t.id || getTripNumber(t)),
      date:parseTripDateTime(t) || getBookedDateObj(t),
      tripDate:getTripDateKey(t),
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
    getSourceCode(first),
    first.company,
    first.entryName,
    first.entryPhone,
    first.entryEmail,
    first.clientName,
    first.clientPhone,
    first.clientEmail,
    first.email,
    first.pickup,
    first.dropoff,
    first.tripDate,
    first.tripTime,
    first.status,
    JSON.stringify(passengers)
  ].join(" ").toLowerCase();
}

function applyFilters(){
  let items = buildDisplayItems(allTrips);

  if(activeService !== "ALL"){
    items = items.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,activeService);
    });
  }

  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
  if(q){
    items = items.filter(item => searchableText(item).includes(q));
  }

  const st = statusFilter ? statusFilter.value : "";
  if(st){
    items = items.filter(item=>{
      if(item.kind === "trip"){
        return displayStatus(item.trip.status,item.trip) === st;
      }
      return getGroupStatus(item.group) === st;
    });
  }

  const y = yearFilter?.value || "";
  const m = monthFilter?.value || "";

  if(y){
    items = items.filter(item => String(item.tripDate || "").split("-")[0] === y);
  }

  if(m){
    items = items.filter(item => String(item.tripDate || "").split("-")[1] === m);
  }

  displayItems = items;
  render();
}

function buildFilters(){
  if(!yearFilter || !monthFilter) return;

  const oldYear = yearFilter.value || "";
  const oldMonth = monthFilter.value || "";

  const years = new Set();

  allTrips.forEach(t=>{
    if(t.tripDate){
      const y = String(t.tripDate).split("-")[0];
      if(y) years.add(y);
    }
  });

  yearFilter.innerHTML = `<option value="">All Years</option>`;
  [...years].sort((a,b)=>Number(b)-Number(a)).forEach(y=>{
    yearFilter.innerHTML += `<option value="${safe(y)}">${safe(y)}</option>`;
  });

  monthFilter.innerHTML = `
    <option value="">All Months</option>
    <option value="01">January</option>
    <option value="02">February</option>
    <option value="03">March</option>
    <option value="04">April</option>
    <option value="05">May</option>
    <option value="06">June</option>
    <option value="07">July</option>
    <option value="08">August</option>
    <option value="09">September</option>
    <option value="10">October</option>
    <option value="11">November</option>
    <option value="12">December</option>
  `;

  yearFilter.value = oldYear;
  monthFilter.value = oldMonth;
}

/* ===============================
   COUNTS
================================ */

function createStats(){
  return {
    total:0,
    today:0,
    month:0,
    completed:0,
    cancelled:0,
    noshow:0,
    notCompleted:0,
    company:0,
    gq:0,
    shared:0
  };
}

function countStatus(stats,status,trip){
  if(isCancelledStatus(status)){
    stats.cancelled++;
    return;
  }

  if(isNoShowStatus(status)){
    stats.noshow++;
    return;
  }

  if(isNotCompletedStatus(status,trip)){
    stats.notCompleted++;
    return;
  }

  if(isCompletedStatus(status)){
    stats.completed++;
  }
}

function countItem(stats,item){
  const first = item.kind === "trip" ? item.trip : item.group[0];
  const azNow = getAZNow();
  const today = dateKey(azNow);
  const month = monthKey(azNow);

  stats.total++;

  if(first.tripDate === today) stats.today++;
  if(String(first.tripDate || "").slice(0,7) === month) stats.month++;

  if(getSourceCode(first) === "CO") stats.company++;
  else stats.gq++;

  if(item.kind === "shared"){
    stats.shared++;
    getClosedPassengers(item.group).forEach(p=>{
      countStatus(stats,p.status || first.status,first);
    });
    return;
  }

  countStatus(stats,first.status,first);
}

function countItemsByService(code){
  const baseItems = buildDisplayItems(allTrips);

  const selected = code === "ALL"
    ? baseItems
    : baseItems.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,code);
    });

  const stats = createStats();
  selected.forEach(item=>countItem(stats,item));
  return stats;
}

function renderStats(){
  const stats = createStats();
  displayItems.forEach(item=>countItem(stats,item));

  const wrap = document.getElementById("reviewStats");
  if(!wrap) return;

  wrap.innerHTML = `
    <div class="stat-card total"><div class="stat-number">${stats.total}</div><div class="stat-label">Total Closed</div></div>
    <div class="stat-card today"><div class="stat-number">${stats.today}</div><div class="stat-label">Today</div></div>
    <div class="stat-card month"><div class="stat-number">${stats.month}</div><div class="stat-label">This Month</div></div>
    <div class="stat-card completed"><div class="stat-number">${stats.completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card cancelled"><div class="stat-number">${stats.cancelled}</div><div class="stat-label">Cancelled</div></div>
    <div class="stat-card noshow"><div class="stat-number">${stats.noshow}</div><div class="stat-label">No Show</div></div>
    <div class="stat-card notcompleted"><div class="stat-number">${stats.notCompleted}</div><div class="stat-label">Not Completed</div></div>
    <div class="stat-card company"><div class="stat-number">${stats.company}</div><div class="stat-label">Company</div></div>
    <div class="stat-card gq"><div class="stat-number">${stats.gq}</div><div class="stat-label">Get Quote</div></div>
    <div class="stat-card shared"><div class="stat-number">${stats.shared}</div><div class="stat-label">Shared Groups</div></div>
  `;
}

function renderServiceCards(){
  const wrap = document.getElementById("serviceCards");
  if(!wrap) return;

  const cards = [
    { code:"ALL", title:"ALL" },
    ...services.map(s=>({
      code:getServiceCodeFromService(s),
      title:getServiceTitle(s)
    }))
  ];

  wrap.innerHTML = cards.map(card=>{
    const c = countItemsByService(card.code);
    const active = activeService === card.code ? "active-card" : "";

    return `
      <div class="service-card ${active}" data-service="${safe(card.code)}">
        <div class="service-card-title">${safe(card.title)}</div>
        <div class="service-line"><span>Total Closed</span><span>${c.total}</span></div>
        <div class="service-line"><span>Get Quote</span><span>${c.gq}</span></div>
        <div class="service-line"><span>Company</span><span>${c.company}</span></div>
        <div class="service-line"><span>Completed</span><span>${c.completed}</span></div>
        <div class="service-line"><span>Cancelled</span><span>${c.cancelled}</span></div>
        <div class="service-line"><span>No Show</span><span>${c.noshow}</span></div>
        <div class="service-line"><span>Not Completed</span><span>${c.notCompleted}</span></div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll(".service-card").forEach(card=>{
    card.onclick = ()=>{
      activeService = card.dataset.service || "ALL";
      applyFilters();
    };
  });
}

/* ===============================
   RENDER TABLE
================================ */

function rowClass(status,trip,itemKind){
  const cls = statusClass(status,trip);
  let out = "";

  if(itemKind === "shared") out += "shared-row ";
  out += getSourceCode(trip) === "CO" ? "row-company " : "row-getquote ";

  if(cls === "completed") out += "completed-row ";
  if(cls === "cancelled") out += "cancelled-row ";
  if(cls === "noshow") out += "noshow-row ";
  if(cls === "notcompleted") out += "notcompleted-row ";

  return out.trim();
}

function groupByTripDate(items){
  const groups = {};
  items.forEach(item=>{
    const key = item.tripDate || "Unknown";
    if(!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return groups;
}

let tripCounter = 1;

function render(){
  tripCounter = 1;

  renderStats();
  renderServiceCards();

  if(!reviewContent) return;

  reviewContent.innerHTML = "";

  if(!displayItems.length){
    reviewContent.innerHTML = `<div class="empty-state">No Review Trips Found</div>`;
    return;
  }

  const groups = groupByTripDate(displayItems);

  reviewContent.innerHTML = `
    <div class="table-wrap">
      <table class="review-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Trip #</th>
            <th>Source</th>
            <th>Service</th>
            <th>Company</th>
            <th>Entry</th>
            <th>Entry Phone</th>
            <th>Passenger</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Pickup</th>
            <th>Stops</th>
            <th>Dropoff</th>
            <th>Trip Date</th>
            <th>Trip Time</th>
            <th>Notes</th>
            <th>Booked Date</th>
            <th>Booked Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="mainReviewBody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById("mainReviewBody");

  Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a)).forEach(day=>{
    tbody.innerHTML += `
      <tr class="date-row">
        <td colspan="19">Trip Date: ${safe(day)}</td>
      </tr>
    `;

    groups[day].forEach(item=>{
      if(item.kind === "trip"){
        tbody.appendChild(renderTripRow(item));
      }else{
        renderSharedRows(tbody,item);
      }

      tbody.innerHTML += `
        <tr class="trip-divider-line">
          <td colspan="19"></td>
        </tr>
      `;
    });
  });
}

function renderTripRow(item){
  const t = item.trip;
  const tr = document.createElement("tr");

  tr.className = rowClass(t.status,t,"trip");

  tr.innerHTML = `
    <td>${tripCounter++}</td>
    <td><span class="trip-number-badge">${safe(getTripNumber(t))}</span></td>
    <td>${sourceHTML(t)}</td>
    <td><span class="service-pill">${safe(getServiceTitleByTrip(t))}</span></td>
    <td class="company-name">${safe(t.company || "-")}</td>
    <td>${safe(t.entryName || "-")}</td>
    <td>${safe(t.entryPhone || "-")}</td>
    <td class="wide-client">${safe(t.clientName || t.name || "-")}</td>
    <td>${safe(t.clientPhone || t.phone || "-")}</td>
    <td>${safe(getEmail(t,null))}</td>
    <td class="wide-address">${safe(t.pickup || "-")}</td>
    <td>${safe(t.stops?.length || 0)}</td>
    <td class="wide-address">${safe(t.dropoff || "-")}</td>
    <td>${safe(t.tripDate || "-")}</td>
    <td>${safe(t.tripTime || "-")}</td>
    <td>${safe(t.notes || "-")}</td>
    <td>${safe(getBookedDate(t))}</td>
    <td>${safe(getBookedTime(t))}</td>
    <td class="status-td ${statusClass(t.status,t)}">${safe(displayStatus(t.status,t))}</td>
  `;

  return tr;
}

function renderSharedRows(tbody,item){
  const group = item.group;
  const first = group[0] || {};
  const passengers = getClosedPassengers(group);

  passengers.forEach((p,index)=>{
    const tr = document.createElement("tr");
    tr.className = rowClass(p.status || first.status,first,"shared") + (index !== passengers.length - 1 ? " shared-separator" : "");

    tr.innerHTML = `
      <td>${index === 0 ? tripCounter++ : ""}</td>
      <td>${index === 0 ? `<span class="trip-number-badge">${safe(getTripNumber(first))}</span>` : ""}</td>
      <td>${index === 0 ? sourceHTML(first) : ""}</td>
      <td>${index === 0 ? `<span class="service-pill">${safe(getServiceTitleByTrip(first))}</span>` : ""}</td>
      <td class="company-name">${index === 0 ? safe(first.company || "-") : ""}</td>
      <td>${index === 0 ? safe(first.entryName || "-") : ""}</td>
      <td>${index === 0 ? safe(first.entryPhone || "-") : ""}</td>
      <td class="wide-client">${safe(getPassengerName(p,first))}</td>
      <td>${safe(getPassengerPhone(p,first))}</td>
      <td>${safe(getEmail(first,p))}</td>
      <td class="wide-address">${safe(getPickup(first,p))}</td>
      <td>${index === 0 ? safe(first.stops?.length || 0) : ""}</td>
      <td class="wide-address">${safe(getDropoff(first,p))}</td>
      <td>${index === 0 ? safe(first.tripDate || "-") : ""}</td>
      <td>${index === 0 ? safe(first.tripTime || "-") : ""}</td>
      <td>${index === 0 ? safe(first.notes || "-") : ""}</td>
      <td>${index === 0 ? safe(getBookedDate(first)) : ""}</td>
      <td>${index === 0 ? safe(getBookedTime(first)) : ""}</td>
      <td class="status-td ${statusClass(p.status || first.status,first)}">${safe(displayStatus(p.status || first.status,first))}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* ===============================
   EVENTS
================================ */

searchInput?.addEventListener("input",applyFilters);
statusFilter?.addEventListener("change",applyFilters);
yearFilter?.addEventListener("change",applyFilters);
monthFilter?.addEventListener("change",applyFilters);

/* ===============================
   INIT
================================ */

async function refreshEverything(){
  await loadServices();
  await loadTrips();
}

(async function init(){
  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshEverything,30000);
})();