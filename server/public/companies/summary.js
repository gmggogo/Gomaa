summary.html

<!-- summary.html -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sunbeam Summary</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="layout.css">
<style>
*{box-sizing:border-box}
body{
  margin:0;
  background:#f4f8fb;
  font-family:'Segoe UI',sans-serif;
  color:#111827;
  overflow-x:hidden;
}
#layoutHeader{
  position:sticky;
  top:0;
  z-index:1000;
  background:#fff;
  box-shadow:0 2px 10px rgba(0,0,0,.06);
}
.page{
  width:100%;
  max-width:1700px;
  margin:auto;
  padding:88px 14px 24px;
}
.top-bar{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin-bottom:14px;
}
.search-input,
.filter-select{
  height:42px;
  border:none;
  border-radius:10px;
  background:#fff;
  padding:0 12px;
  font-size:12px;
  box-shadow:0 2px 8px rgba(0,0,0,.05);
  font-weight:700;
}
.search-input{
  flex:1;
  min-width:220px;
}
.print-btn{
  border:none;
  background:#145cff;
  color:#fff;
  border-radius:10px;
  padding:0 18px;
  font-size:12px;
  font-weight:900;
  cursor:pointer;
}
.tabs{
  display:flex;
  gap:8px;
  margin-bottom:14px;
}
.tab{
  flex:1;
  height:44px;
  border:none;
  border-radius:10px;
  background:#dbe4f0;
  color:#111827;
  font-size:13px;
  font-weight:900;
  cursor:pointer;
}
.tab.active{
  background:#145cff;
  color:#fff;
}
.stats{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:10px;
  margin-bottom:18px;
}
.stat{
  background:#16a34a;
  border-radius:14px;
  padding:14px;
  box-shadow:0 4px 12px rgba(0,0,0,.08);
  color:#fff;
  cursor:pointer;
}
.stat.active{
  outline:3px solid #145cff;
}
.stat-title{
  font-size:11px;
  color:#dcfce7;
  font-weight:700;
}
.stat-value{
  margin-top:6px;
  font-size:24px;
  font-weight:900;
  color:#fff;
}
.stat-money{
  margin-top:4px;
  font-size:12px;
  font-weight:900;
  color:#fef9c3;
}
.day-title{
  margin:22px 0 8px;
  font-size:14px;
  font-weight:900;
  color:#374151;
}
.table-wrap{
  width:100%;
  overflow-x:auto;
  background:#fff;
  border-radius:14px;
  border:1px solid #d1d5db;
  margin-bottom:18px;
  box-shadow:0 4px 12px rgba(0,0,0,.06);
}
.summary-table{
  width:100%;
  min-width:1600px;
  border-collapse:collapse;
  table-layout:fixed;
}
.summary-table th{
  background:#cfd8e3;
  color:#111827;
  font-size:10px;
  font-weight:900;
  text-align:left;
  padding:10px 6px;
  white-space:nowrap;
  border-bottom:2px solid #94a3b8;
  border-right:1px solid #cbd5e1;
}
.summary-table td{
  padding:8px 6px;
  font-size:9px;
  border-bottom:1px solid #e5e7eb;
  border-right:1px solid #e5e7eb;
  vertical-align:top;
  line-height:1.5;
  font-weight:700;
  color:#111827;
  overflow:hidden;
  text-overflow:ellipsis;
  background:#fff;
}
.summary-table tr:nth-child(even) td{background:#f8fafc}
.summary-table tr:hover td{background:#eef4ff}
.status{
  display:inline-block;
  padding:2px 6px;
  border-radius:999px;
  font-size:8px;
  font-weight:900;
}
.completed{background:#dcfce7;color:#166534}
.cancelled{background:#fee2e2;color:#991b1b}
.noshow{background:#fef9c3;color:#854d0e}
.total{
  font-weight:900;
  color:#145cff;
}
.shared-separator td{
  border-bottom:1px solid #cbd5e1 !important;
}
.trip-divider-line td{
  padding:0 !important;
  height:4px;
  background:#94a3b8;
  border:none !important;
}
.trip-divider td{
  padding:0 !important;
  height:12px;
  background:#f4f8fb;
  border:none !important;
}
.summary-table td:first-child{
  background:#dbeafe !important;
  color:#1d4ed8;
  font-weight:900;
}
.summary-table td:nth-child(16){
  background:#fef9c3 !important;
  color:#854d0e;
  font-weight:900;
}
@media(max-width:768px){
  .page{padding:84px 6px 18px}
  .search-input,.filter-select,.print-btn{height:40px;font-size:11px}
  .tab{font-size:11px;height:40px}
  .stats{grid-template-columns:1fr 1fr}
  .summary-table{min-width:1450px}
  .summary-table th,.summary-table td{font-size:8px;padding:5px 4px}
}
@media print{
  #layoutHeader,.top-bar,.tabs{display:none !important}
  .page{padding:0}
  body{background:#fff}
}
</style>
</head>
<body>
<div id="layoutHeader"></div>
<div class="page">
  <div class="top-bar">
    <input
      type="text"
      id="searchInput"
      class="search-input"
      placeholder="Search Name / Phone / Trip# / Company">
    <select id="yearFilter" class="filter-select"></select>
    <select id="monthFilter" class="filter-select"></select>
    <button class="print-btn" onclick="window.print()">Print</button>
  </div>
  <div class="tabs" id="dynamicTabs"></div>
  <div class="stats" id="dynamicStats"></div>
  <div id="summaryContent"></div>
</div>
<script src="layout.js"></script>
<script src="summary.js"></script>
</body>
</html>

summary.js

// summary.js
let allTrips = [];
let COMPANY_SERVICES = [];
let currentTab = "TRIPS";
let currentService = "ALL";
/* ================= LOAD ================= */
async function load(){
  try{
    const company =
      localStorage.getItem("name") || "";
    await loadServices();
    const res =
      await fetch(
        `/api/trips/summary?company=${encodeURIComponent(company)}`
      );
    allTrips =
      await res.json();
    buildFilters();
    fixCurrentTab();
    buildTabs();
    render();
  }catch(err){
    console.log(err);
  }
}
/* ================= SERVICES ================= */
async function loadServices(){
  try{
    const token =
      localStorage.getItem("token") || "";
    const res =
      await fetch("/api/services",{
        headers:{
          Authorization:"Bearer " + token
        }
      });
    const data =
      await res.json();
    COMPANY_SERVICES =
      Array.isArray(data)
      ? data.filter(s =>
          s.enabled === true &&
          s.companyEnabled === true
        )
      : [];
  }catch(err){
    console.log(err);
    COMPANY_SERVICES = [];
  }
}
function normalize(v){
  return String(v ?? "").trim();
}
function cleanCode(v){
  return normalize(v)
    .replace(/^-/,"")
    .toUpperCase();
}
function isSharedService(service){
  return (
    service?.companyShared === true ||
    service?.shared === true ||
    cleanCode(service?.serviceType) === "SHARED" ||
    cleanCode(service?.type) === "SHARED" ||
    cleanCode(service?.title) === "SHARED"
  );
}
function getServiceCodeFromService(service){
  return cleanCode(
    service?.companySuffix ||
    service?.serviceSuffix ||
    service?.serviceCode ||
    service?.code ||
    service?.serviceKey ||
    ""
  );
}
function getTripSuffixFromNumber(trip){
  const parts =
    String(trip?.tripNumber || "")
      .split("-");
  return cleanCode(
    parts[parts.length - 1] || ""
  );
}
function getTripServiceCode(trip){
  return cleanCode(
    trip?.serviceSuffix ||
    trip?.serviceCode ||
    trip?.serviceKey ||
    trip?.serviceType ||
    getTripSuffixFromNumber(trip)
  );
}
function getServiceByTrip(trip){
  const tripCode =
    getTripServiceCode(trip);
  return COMPANY_SERVICES.find(service=>{
    const serviceCode =
      getServiceCodeFromService(service);
    const serviceKey =
      cleanCode(service.serviceKey);
    const serviceType =
      cleanCode(service.serviceType);
    return (
      serviceCode === tripCode ||
      serviceKey === tripCode ||
      serviceType === tripCode
    );
  }) || null;
}
function tripMatchesService(trip,service){
  const serviceCode =
    getServiceCodeFromService(service);
  if(!serviceCode) return false;
  const tripCode =
    getTripServiceCode(trip);
  return tripCode === serviceCode;
}
function isSharedTrip(t){
  return (
    t.isShared === true ||
    cleanCode(t.tripType) === "SHARED" ||
    String(t.tripNumber || "")
      .toUpperCase()
      .includes("-SH") ||
    (
      Array.isArray(t.passengers) &&
      t.passengers.length > 0
    )
  );
}
/* ================= TAB VISIBILITY ================= */
function hasTripsTab(){
  const hasNormalService =
    COMPANY_SERVICES.some(s => !isSharedService(s));
  const hasNormalTrips =
    allTrips.some(t => !isSharedTrip(t));
  return hasNormalService || hasNormalTrips;
}
function hasSharedTab(){
  const hasSharedService =
    COMPANY_SERVICES.some(s => isSharedService(s));
  const hasSharedTrips =
    allTrips.some(t => isSharedTrip(t));
  return hasSharedService || hasSharedTrips;
}
function fixCurrentTab(){
  const tripsOk =
    hasTripsTab();
  const sharedOk =
    hasSharedTab();
  if(currentTab === "SHARED" && !sharedOk){
    currentTab = tripsOk ? "TRIPS" : "SHARED";
  }
  if(currentTab === "TRIPS" && !tripsOk){
    currentTab = sharedOk ? "SHARED" : "TRIPS";
  }
}
/* ================= TABS ================= */
function buildTabs(){
  const wrap =
    document.getElementById("dynamicTabs");
  if(!wrap) return;
  wrap.innerHTML = "";
  if(hasTripsTab()){
    const count =
      getFilteredTrips()
        .filter(t => !isSharedTrip(t))
        .length;
    const btn =
      document.createElement("button");
    btn.className =
      currentTab === "TRIPS"
      ? "tab active"
      : "tab";
    btn.innerText =
      `Trips (${count})`;
    btn.onclick = ()=>{
      currentTab = "TRIPS";
      currentService = "ALL";
      buildTabs();
      render();
    };
    wrap.appendChild(btn);
  }
  if(hasSharedTab()){
    const count =
      getFilteredTrips()
        .filter(t => isSharedTrip(t))
        .length;
    const btn =
      document.createElement("button");
    btn.className =
      currentTab === "SHARED"
      ? "tab active"
      : "tab";
    btn.innerText =
      `Shared (${count})`;
    btn.onclick = ()=>{
      currentTab = "SHARED";
      currentService = "ALL";
      buildTabs();
      render();
    };
    wrap.appendChild(btn);
  }
}
/* ================= FILTERS ================= */
function buildFilters(){
  const year =
    document.getElementById("yearFilter");
  const month =
    document.getElementById("monthFilter");
  if(year.options.length) return;
  const years =
    new Set();
  allTrips.forEach(t=>{
    if(t.tripDate){
      years.add(
        t.tripDate.split("-")[0]
      );
    }
  });
  year.innerHTML =
    `<option value="">All Years</option>`;
  [...years]
    .sort((a,b)=>b-a)
    .forEach(y=>{
      year.innerHTML += `
        <option value="${y}">
          ${y}
        </option>
      `;
    });
  month.innerHTML = `
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
}
function getFilteredTrips(){
  const q =
    document
      .getElementById("searchInput")
      .value
      .toLowerCase()
      .trim();
  const year =
    document
      .getElementById("yearFilter")
      .value;
  const month =
    document
      .getElementById("monthFilter")
      .value;
  return allTrips.filter(t=>{
    let txt = `
      ${t.tripNumber || ""}
      ${t.company || ""}
      ${t.entryName || ""}
      ${t.entryPhone || ""}
      ${t.clientName || ""}
      ${t.clientPhone || ""}
      ${t.serviceType || ""}
      ${t.serviceSuffix || ""}
      ${t.serviceCode || ""}
    `;
    if(Array.isArray(t.passengers)){
      t.passengers.forEach(p=>{
        txt += `
          ${p.clientName || ""}
          ${p.clientPhone || ""}
          ${p.name || ""}
          ${p.phone || ""}
        `;
      });
    }
    txt =
      txt.toLowerCase();
    if(q && !txt.includes(q)){
      return false;
    }
    if(t.tripDate){
      const parts =
        t.tripDate.split("-");
      if(year && parts[0] !== year){
        return false;
      }
      if(month && parts[1] !== month){
        return false;
      }
    }
    return true;
  });
}
/* ================= DATA ================= */
function getTabTripsBeforeService(){
  let data =
    getFilteredTrips();
  if(currentTab === "TRIPS"){
    data =
      data.filter(t => !isSharedTrip(t));
  }
  if(currentTab === "SHARED"){
    data =
      data.filter(t => isSharedTrip(t));
  }
  return data;
}
function getTripsData(){
  let data =
    getTabTripsBeforeService();
  if(currentService !== "ALL"){
    data =
      data.filter(t => {
        const service =
          getServiceByTrip(t);
        if(service){
          return getServiceCodeFromService(service) === currentService;
        }
        return getTripServiceCode(t) === currentService;
      });
  }
  return data;
}
function getServicesForCurrentTab(){
  if(currentTab === "TRIPS"){
    return COMPANY_SERVICES.filter(s =>
      !isSharedService(s)
    );
  }
  return COMPANY_SERVICES.filter(s =>
    isSharedService(s)
  );
}
/* ================= MONEY ================= */
function getIndividualTripMoney(t){
  if(
    t.status === "NoShow" ||
    t.status === "Cancelled"
  ){
    return Number(
      t.finalPrice ||
      t.priceAmount ||
      t.cancelFee ||
      15
    );
  }
  return Number(
    t.finalPrice ||
    t.priceAmount ||
    0
  );
}
function getSharedTripMoney(t){
  if(Number(t.finalPrice || 0) > 0){
    return Number(t.finalPrice);
  }
  if(Number(t.priceAmount || 0) > 0){
    return Number(t.priceAmount);
  }
  let total = 0;
  (t.passengers || [])
    .forEach(p=>{
      if(
        p.status === "NoShow" ||
        p.status === "Cancelled"
      ){
        total += Number(p.price || 15);
      }else{
        total += Number(p.price || 0);
      }
    });
  return total;
}
function getTripMoney(t){
  return isSharedTrip(t)
    ? getSharedTripMoney(t)
    : getIndividualTripMoney(t);
}
/* ================= STATS ================= */
function buildStats(){
  const wrap =
    document.getElementById("dynamicStats");
  if(!wrap) return;
  wrap.innerHTML = "";
  const tabTrips =
    getTabTripsBeforeService();
  const services =
    getServicesForCurrentTab();
  services.forEach(service=>{
    const code =
      getServiceCodeFromService(service);
    const serviceTrips =
      tabTrips.filter(t =>
        tripMatchesService(t,service)
      );
    const money =
      serviceTrips.reduce(
        (sum,t)=>sum + getTripMoney(t),
        0
      );
    const card =
      document.createElement("div");
    card.className =
      currentService === code
      ? "stat active"
      : "stat";
    card.innerHTML = `
      <div class="stat-title">
        ${service.title || service.name || code}
      </div>
      <div class="stat-value">
        ${serviceTrips.length}
      </div>
      <div class="stat-money">
        $${money}
      </div>
    `;
    card.onclick = ()=>{
      currentService =
        currentService === code
        ? "ALL"
        : code;
      render();
    };
    wrap.appendChild(card);
  });
  const completed =
    tabTrips.filter(t => {
      if(isSharedTrip(t)){
        return (t.passengers || [])
          .some(p => p.status === "Completed");
      }
      return t.status === "Completed";
    }).length;
  const cancelled =
    tabTrips.filter(t => {
      if(isSharedTrip(t)){
        return (t.passengers || [])
          .some(p => p.status === "Cancelled");
      }
      return t.status === "Cancelled";
    }).length;
  const noshow =
    tabTrips.filter(t => {
      if(isSharedTrip(t)){
        return (t.passengers || [])
          .some(p => p.status === "NoShow");
      }
      return t.status === "NoShow";
    }).length;
  const revenue =
    tabTrips.reduce(
      (sum,t)=>sum + getTripMoney(t),
      0
    );
  [
    ["Completed",completed],
    ["Cancelled",cancelled],
    ["No Show",noshow],
    ["Revenue","$" + revenue]
  ].forEach(([title,value])=>{
    const card =
      document.createElement("div");
    card.className =
      "stat";
    card.innerHTML = `
      <div class="stat-title">
        ${title}
      </div>
      <div class="stat-value">
        ${value}
      </div>
    `;
    wrap.appendChild(card);
  });
}
/* ================= RENDER HELPERS ================= */
function groupByDay(data){
  const groups = {};
  data.forEach(t=>{
    const d =
      t.tripDate || "Unknown";
    if(!groups[d]){
      groups[d] = [];
    }
    groups[d].push(t);
  });
  return groups;
}
function statusHTML(status){
  let cls = "";
  if(status === "Completed"){
    cls = "completed";
  }else if(status === "Cancelled"){
    cls = "cancelled";
  }else if(status === "NoShow"){
    cls = "noshow";
  }
  return `
    <span class="status ${cls}">
      ${status || "Scheduled"}
    </span>
  `;
}
function safe(v){
  return String(v ?? "-");
}
/* ================= RENDER ================= */
function render(){
  buildTabs();
  buildStats();
  const wrap =
    document.getElementById("summaryContent");
  wrap.innerHTML = "";
  const trips =
    getTripsData();
  const groups =
    groupByDay(trips);
  Object.keys(groups)
    .sort((a,b)=>new Date(b)-new Date(a))
    .forEach(day=>{
      wrap.innerHTML += `
        <div class="day-title">
          ${day}
        </div>
        <div class="table-wrap">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Trip#</th>
                <th>Company</th>
                <th>Entry</th>
                <th>Entry Phone</th>
                <th>Passenger</th>
                <th>Phone</th>
                <th>Pickup</th>
                <th>Dropoff</th>
                <th>Trip Date</th>
                <th>Trip Time</th>
                <th>Book Date</th>
                <th>Book Time</th>
                <th>Miles</th>
                <th>Status</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody id="tbody-${day}"></tbody>
          </table>
        </div>
      `;
      const tbody =
        document.getElementById(
          `tbody-${day}`
        );
      groups[day].forEach(t=>{
        if(!isSharedTrip(t)){
          const money =
            getIndividualTripMoney(t);
          tbody.innerHTML += `
            <tr>
              <td>${safe(t.tripNumber)}</td>
              <td>${safe(t.company)}</td>
              <td>${safe(t.entryName)}</td>
              <td>${safe(t.entryPhone)}</td>
              <td>${safe(t.clientName)}</td>
              <td>${safe(t.clientPhone)}</td>
              <td>${safe(t.pickup)}</td>
              <td>${safe(t.dropoff)}</td>
              <td>${safe(t.tripDate)}</td>
              <td>${safe(t.tripTime)}</td>
              <td>${safe(t.bookingDate)}</td>
              <td>${safe(t.bookingTime)}</td>
              <td>${safe(t.miles || 0)}</td>
              <td>${statusHTML(t.status)}</td>
              <td class="total">$${money}</td>
              <td class="total">$${money}</td>
            </tr>
            <tr class="trip-divider-line">
              <td colspan="16"></td>
            </tr>
            <tr class="trip-divider">
              <td colspan="16"></td>
            </tr>
          `;
          return;
        }
        const passengers =
          t.passengers || [];
        const sharedTotal =
          getSharedTripMoney(t);
        passengers.forEach((p,index)=>{
          const price =
            (
              p.status === "NoShow" ||
              p.status === "Cancelled"
            )
            ? Number(p.price || 15)
            : Number(p.price || 0);
          tbody.innerHTML += `
            <tr class="${
              index !== passengers.length - 1
              ? "shared-separator"
              : ""
            }">
              <td>${index === 0 ? safe(t.tripNumber) : ""}</td>
              <td>${index === 0 ? safe(t.company) : ""}</td>
              <td>${index === 0 ? safe(t.entryName) : ""}</td>
              <td>${index === 0 ? safe(t.entryPhone) : ""}</td>
              <td>${safe(p.clientName || p.name)}</td>
              <td>${safe(p.clientPhone || p.phone)}</td>
              <td>${safe(p.pickup)}</td>
              <td>${safe(p.dropoff)}</td>
              <td>${index === 0 ? safe(t.tripDate) : ""}</td>
              <td>${index === 0 ? safe(t.tripTime) : ""}</td>
              <td>${index === 0 ? safe(t.bookingDate) : ""}</td>
              <td>${index === 0 ? safe(t.bookingTime) : ""}</td>
              <td>${index === 0 ? safe(t.miles || 0) : ""}</td>
              <td>${statusHTML(p.status || t.status)}</td>
              <td class="total">$${price}</td>
              <td class="total">${index === 0 ? "$" + sharedTotal : ""}</td>
            </tr>
          `;
        });
        tbody.innerHTML += `
          <tr class="trip-divider-line">
            <td colspan="16"></td>
          </tr>
          <tr class="trip-divider">
            <td colspan="16"></td>
          </tr>
        `;
      });
    });
}
/* ================= EVENTS ================= */
document.addEventListener("input",e=>{
  if(e.target.id === "searchInput"){
    buildTabs();
    render();
  }
});
document.addEventListener("change",e=>{
  if(
    e.target.id === "yearFilter" ||
    e.target.id === "monthFilter"
  ){
    buildTabs();
    render();
  }
});
/* ================= AUTO ================= */
setInterval(load,30000);
/* ================= INIT ================= */
load();