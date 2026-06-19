/* ==========================================================================
   DISPATCH FINAL CONFIRMATION
   Admin / SuperAdmin / Dispatcher
   Final page before Dispatch Review
   ========================================================================== */

const API_URL = "/api/dispatch-final-confirmation";
const SERVICES_URL = "/api/services/admin";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";
const adminName =
  localStorage.getItem("name") ||
  localStorage.getItem("fullName") ||
  localStorage.getItem("username") ||
  role ||
  "dispatcher";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */

let allTrips = [];
let services = [];
let displayItems = [];

let activeSource = "ALL";
let activeStatus = "ALL";
let refreshTimer = null;
let tripCounter = 1;

const CONFIRM_HOURS = 12;

const editingSingles = new Set();
const editingShared = new Set();

/* ===============================
   ELEMENTS
================================ */

const sourceCardsWrap = document.getElementById("sourceCards");
const statusCardsWrap = document.getElementById("statusCards");
const searchInput = document.getElementById("searchInput");
const yearFilter = document.getElementById("yearFilter");
const monthFilter = document.getElementById("monthFilter");
const finalContent = document.getElementById("finalContent");

/* ===============================
   HELPERS
================================ */

function authHeaders(){
  return token
    ? {
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      }
    : {
        "Content-Type":"application/json"
      };
}

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

function getTripNumber(t){
  return String(t?.tripNumber || t?.bookingNumber || t?.id || t?._id || "-");
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

function getBookedDateObj(t){
  return new Date(
    t?.bookedAt ||
    t?.createdAt ||
    t?.updatedAt ||
    t?.tripDate ||
    Date.now()
  );
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

function getHoursDiff(fromDate){
  const d = new Date(fromDate);
  if(isNaN(d)) return 0;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function isOlderThanHours(dateValue,hours){
  if(!dateValue) return false;
  return getHoursDiff(dateValue) >= hours;
}

function getTripDateKey(t){
  return t?.tripDate || "Unknown";
}

function stopText(stop){
  if(!stop) return "";
  if(typeof stop === "string") return stop;
  return stop.address || stop.location || stop.name || "";
}

function getStops(t){
  if(Array.isArray(t?.stops)) return t.stops;
  if(Array.isArray(t?.stopAddresses)) return t.stopAddresses;
  return [];
}

function stopsDisplay(t){
  const arr = getStops(t).map(stopText).filter(Boolean);
  if(!arr.length) return "--";
  return arr.map((x,i)=>`${i+1}. ${x}`).join("\n");
}

function getFacilityName(t){
  return normalizeText(
    t?.facilityName ||
    t?.organizationName ||
    t?.customerCompany ||
    t?.companyName ||
    t?.company ||
    ""
  );
}

function getCompanyDisplay(t){
  return getFacilityName(t) || "--";
}

function getNotes(t){
  return t?.notes ?? t?.tripNotes ?? t?.note ?? "";
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

/* ===============================
   STATUS ENGINE
================================ */

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

function isNotCompletedStatus(status){
  const s = cleanStatus(status);
  const c = compactStatus(status);

  return (
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  );
}

function displayStatus(status){
  if(isCompletedStatus(status)) return "Completed";
  if(isCancelledStatus(status)) return "Cancelled";
  if(isNoShowStatus(status)) return "No Show";
  if(isNotCompletedStatus(status)) return "Not Completed";
  return status || "-";
}

function statusClass(status){
  const label = displayStatus(status);

  if(label === "Completed") return "completed";
  if(label === "Cancelled") return "cancelled";
  if(label === "No Show") return "noshow";
  if(label === "Not Completed") return "notcompleted";

  return "";
}

function isAllowedFinalStatus(status){
  return (
    isCompletedStatus(status) ||
    isCancelledStatus(status) ||
    isNoShowStatus(status) ||
    isNotCompletedStatus(status)
  );
}

function normalizeFinalStatusValue(status){
  if(isCompletedStatus(status)) return "Completed";
  if(isCancelledStatus(status)) return "Cancelled";
  if(isNoShowStatus(status)) return "No Show";
  if(isNotCompletedStatus(status)) return "Not Completed";
  return "Completed";
}

function getStatusOptionValue(status){
  const label = normalizeFinalStatusValue(status);
  if(label === "Completed") return "completed";
  if(label === "Cancelled") return "cancelled";
  if(label === "No Show") return "noshow";
  return "notcompleted";
}

function statusValueToLabel(v){
  if(v === "completed") return "Completed";
  if(v === "cancelled") return "Cancelled";
  if(v === "noshow") return "No Show";
  return "Not Completed";
}

function statusCellHTML(status, isConfirmed){
  const label = displayStatus(status);
  const cls = statusClass(status);
  const confirmedClass = isConfirmed ? "confirmed-blue" : cls;
  return `<div class="status-box ${confirmedClass}">${safe(label)}</div>`;
}

/* ===============================
   ENTERED PAGE / CONFIRM ENGINE
================================ */

function getEnteredAt(t){
  return (
    t?.finalPageEnteredAt ||
    t?.dispatchFinalPageEnteredAt ||
    t?.enteredFinalConfirmationAt ||
    t?.updatedAt ||
    t?.createdAt ||
    t?.bookedAt ||
    null
  );
}

function isTripConfirmed(t){
  return t?.finalStatusConfirmed === true;
}

function getTripConfirmedAt(t){
  return (
    t?.finalStatusConfirmedAt ||
    t?.dispatchFinalConfirmedAt ||
    null
  );
}

function isSharedConfirmed(t){
  return t?.sharedFinalConfirmed === true || t?.finalStatusConfirmed === true;
}

function getSharedConfirmedAt(t){
  return (
    t?.sharedFinalConfirmedAt ||
    t?.finalStatusConfirmedAt ||
    t?.dispatchFinalConfirmedAt ||
    null
  );
}

function isTripExpiredAfterConfirm(t){
  if(!isTripConfirmed(t)) return false;
  return isOlderThanHours(getTripConfirmedAt(t), CONFIRM_HOURS);
}

function isSharedExpiredAfterConfirm(t){
  if(!isSharedConfirmed(t)) return false;
  return isOlderThanHours(getSharedConfirmedAt(t), CONFIRM_HOURS);
}

function isTripNotConfirmed(t){
  return !isTripConfirmed(t);
}

function isSharedNotConfirmed(t){
  return !isSharedConfirmed(t);
}

/* ===============================
   SERVICE ENGINE
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

/* ===============================
   SOURCE ENGINE
================================ */

function getSourceCode(t){
  const raw = [
    t?.source,
    t?.from,
    t?.bookingSource,
    t?.createdBy,
    t?.type,
    t?.tripType,
    t?.reservationStatus,
    t?.reservationType,
    t?.sourceType,
    t?.tripNumber,
    t?.isReserved ? "reserved" : "",
    t?.reserved ? "reserved" : "",
    t?.reservationId ? "reserved" : ""
  ].join(" ").toLowerCase();

  if(
    raw.includes("reserved") ||
    raw.includes("reservation") ||
    raw.includes("-rv") ||
    raw.includes(" rv") ||
    raw === "rv"
  ){
    return "RV";
  }

  if(
    raw.includes("quote") ||
    raw.includes("gq") ||
    raw.includes("website") ||
    raw.includes("public")
  ){
    return "GQ";
  }

  if(getFacilityName(t)){
    return "FACILITY";
  }

  if(
    raw.includes("company") ||
    raw.includes("facility") ||
    raw.includes("portal")
  ){
    return "FACILITY";
  }

  return "GQ";
}

function sourceLabel(t){
  const code = getSourceCode(t);
  if(code === "RV") return "Reserved";
  if(code === "FACILITY") return "Facility";
  return "Get Quote";
}

/* ===============================
   DRIVER-REPORTED ENGINE
================================ */

function tripDriverReportedFinal(t){
  return (
    t?.driverReportedFinalStatus === true ||
    t?.finalStatusFromDriver === true ||
    t?.driverFinalStatusReported === true ||
    t?.reportedByDriver === true
  );
}

function passengerDriverReportedFinal(p,trip){
  return (
    p?.driverReportedFinalStatus === true ||
    p?.finalStatusFromDriver === true ||
    p?.driverFinalStatusReported === true ||
    p?.reportedByDriver === true ||
    tripDriverReportedFinal(trip)
  );
}

/* ===============================
   PASSENGER ENGINE
================================ */

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
  return (
    p?.clientName ||
    p?.passengerName ||
    p?.name ||
    t?.clientName ||
    t?.name ||
    "-"
  );
}

function getPassengerPhone(p,t){
  return (
    p?.clientPhone ||
    p?.passengerPhone ||
    p?.phone ||
    t?.clientPhone ||
    t?.phone ||
    "-"
  );
}

function getPickup(t,p){
  return p?.pickup || t?.pickup || "-";
}

function getDropoff(t,p){
  return p?.dropoff || t?.dropoff || "-";
}

/* ===============================
   SHARED ENGINE
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
  return (
    normalizeText(t?.groupId) ||
    normalizeText(t?.tripNumber) ||
    String(t?._id || t?.id)
  );
}

function getRealPassengersFromGroup(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return first.passengers.map((p,idx)=>({
      ...p,
      __idx: idx
    }));
  }

  return group.map((t,i)=>({
    __idx: i,
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
    group.sort((a,b)=>
      Number(a.passengerIndex || 0) -
      Number(b.passengerIndex || 0)
    )
  );
}

function groupPassengersReadyForPage(group){
  const first = group[0] || {};
  const passengers = getRealPassengersFromGroup(group);

  return passengers.filter(p=>{
    const st = p.status || first.status;

    if(!isAllowedFinalStatus(st)) return false;

    if(isCancelledStatus(st) || isNotCompletedStatus(st)){
      return true;
    }

    if(isCompletedStatus(st) || isNoShowStatus(st)){
      return (
        passengerDriverReportedFinal(p,first) ||
        first.sharedFinalConfirmed === true ||
        first.finalStatusConfirmed === true ||
        !!first.finalPageEnteredAt ||
        !!first.dispatchFinalPageEnteredAt
      );
    }

    return false;
  });
}

/* ===============================
   PAGE INCLUSION ENGINE
================================ */

function singleTripReadyForPage(t){
  if(!t || isSharedTrip(t)) return false;

  const st = t.status;
  if(!isAllowedFinalStatus(st)) return false;

  if(isCancelledStatus(st) || isNotCompletedStatus(st)){
    return true;
  }

  if(isCompletedStatus(st) || isNoShowStatus(st)){
    return (
      tripDriverReportedFinal(t) ||
      t.finalStatusConfirmed === true ||
      !!t.finalPageEnteredAt ||
      !!t.dispatchFinalPageEnteredAt
    );
  }

  return false;
}

function sharedTripReadyForPage(group){
  return groupPassengersReadyForPage(group).length > 0;
}

function singleTripShouldShow(t){
  if(!singleTripReadyForPage(t)) return false;

  if(isTripConfirmed(t)){
    return !isTripExpiredAfterConfirm(t);
  }

  return true;
}

function sharedTripShouldShow(first,group){
  if(!sharedTripReadyForPage(group)) return false;

  if(isSharedConfirmed(first)){
    return !isSharedExpiredAfterConfirm(first);
  }

  return true;
}

/* ===============================
   API LOADERS
================================ */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_URL,{
      headers: token ? { Authorization:"Bearer " + token } : {}
    });

    if(!res.ok) throw new Error("Failed services");

    const data = await res.json();
    services = extractServices(data).filter(serviceEnabled);
  }catch(err){
    services = [];
  }
}

async function loadTrips(){
  try{
    const res = await fetch(API_URL,{
      headers: token ? { Authorization:"Bearer " + token } : {}
    });

    if(!res.ok) throw new Error("Failed trips");

    const data = await res.json();
    const trips = Array.isArray(data)
      ? data
      : Array.isArray(data?.trips)
      ? data.trips
      : [];

    allTrips = trips.sort((a,b)=>getBookedDateObj(b) - getBookedDateObj(a));

    allTrips = allTrips.map(t=>{
      if(!t.company || t.company === "Sunbeam Transportation"){
        const facilityName =
          t.companyName ||
          t.facilityName ||
          t.organizationName ||
          t.customerCompany ||
          "";

        if(facilityName){
          t.company = facilityName;
        }
      }
      return t;
    });

    buildDateFilters();
    applyFilters();

  }catch(err){
    console.log(err);
    allTrips = [];
    displayItems = [];
    render();
  }
}

/* ===============================
   DISPLAY ITEMS
================================ */

function buildDisplayItems(trips){
  const items = [];
  const usedShared = new Set();

  trips.forEach(t=>{
    if(isSharedTrip(t)){
      const key = getSharedKey(t);
      if(usedShared.has(key)) return;

      usedShared.add(key);

      const group =
        getSharedGroups(trips).find(g => getSharedKey(g[0]) === key) ||
        [t];

      if(!sharedTripShouldShow(group[0],group)) return;

      items.push({
        kind:"shared",
        key,
        date: parseTripDateTime(group[0]) || getBookedDateObj(group[0]),
        tripDate: getTripDateKey(group[0]),
        group
      });

      return;
    }

    if(!singleTripShouldShow(t)) return;

    items.push({
      kind:"trip",
      key:String(t._id || t.id || getTripNumber(t)),
      date: parseTripDateTime(t) || getBookedDateObj(t),
      tripDate: getTripDateKey(t),
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
    getCompanyDisplay(first),
    first.clientName,
    first.name,
    first.pickup,
    first.dropoff,
    first.tripDate,
    first.tripTime,
    first.status,
    JSON.stringify(passengers)
  ].join(" ").toLowerCase();
}

function itemMatchesStatusFilter(item){
  if(activeStatus === "ALL") return true;

  if(item.kind === "trip"){
    const t = item.trip;

    if(activeStatus === "notconfirmed"){
      return isTripNotConfirmed(t);
    }

    return statusClass(t.status) === activeStatus;
  }

  const first = item.group[0];
  const readyPassengers = groupPassengersReadyForPage(item.group);

  if(activeStatus === "notconfirmed"){
    return isSharedNotConfirmed(first);
  }

  return readyPassengers.some(p => statusClass(p.status || first.status) === activeStatus);
}

function filterItems(items){
  let out = [...items];

  if(activeSource !== "ALL"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === activeSource;
    });
  }

  out = out.filter(item => itemMatchesStatusFilter(item));

  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
  if(q){
    out = out.filter(item => searchableText(item).includes(q));
  }

  const y = yearFilter?.value || "";
  const m = monthFilter?.value || "";

  if(y){
    out = out.filter(item =>
      String(item.tripDate || "").split("-")[0] === y
    );
  }

  if(m){
    out = out.filter(item =>
      String(item.tripDate || "").split("-")[1] === m
    );
  }

  return out;
}

function applyFilters(){
  const baseItems = buildDisplayItems(allTrips);
  displayItems = filterItems(baseItems);
  render();
}

/* ===============================
   DATE FILTERS
================================ */

function buildDateFilters(){
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

  [...years]
    .sort((a,b)=>Number(b)-Number(a))
    .forEach(y=>{
      yearFilter.innerHTML += `<option value="${safe(y)}">${safe(y)}</option>`;
    });

  yearFilter.value = oldYear;
  monthFilter.value = oldMonth;
}

/* ===============================
   COUNTS
================================ */

function createCounts(){
  return {
    source:{
      ALL:0,
      FACILITY:0,
      GQ:0,
      RV:0
    },
    status:{
      completed:0,
      cancelled:0,
      noshow:0,
      notcompleted:0,
      notconfirmed:0
    }
  };
}

function countTripInto(counts,t){
  counts.source.ALL++;
  counts.source[getSourceCode(t)] = (counts.source[getSourceCode(t)] || 0) + 1;

  if(isTripNotConfirmed(t)){
    counts.status.notconfirmed++;
  }

  const cls = statusClass(t.status);
  if(cls){
    counts.status[cls]++;
  }
}

function countSharedInto(counts,first,group){
  counts.source.ALL++;
  counts.source[getSourceCode(first)] = (counts.source[getSourceCode(first)] || 0) + 1;

  if(isSharedNotConfirmed(first)){
    counts.status.notconfirmed++;
  }

  groupPassengersReadyForPage(group).forEach(p=>{
    const cls = statusClass(p.status || first.status);
    if(cls){
      counts.status[cls]++;
    }
  });
}

function getCounts(){
  const counts = createCounts();

  const items = buildDisplayItems(allTrips).filter(item=>{
    const y = yearFilter?.value || "";
    const m = monthFilter?.value || "";
    const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

    if(y && String(item.tripDate || "").split("-")[0] !== y) return false;
    if(m && String(item.tripDate || "").split("-")[1] !== m) return false;
    if(q && !searchableText(item).includes(q)) return false;

    if(activeSource !== "ALL"){
      const t = item.kind === "trip" ? item.trip : item.group[0];
      if(getSourceCode(t) !== activeSource) return false;
    }

    return true;
  });

  items.forEach(item=>{
    if(item.kind === "trip"){
      countTripInto(counts,item.trip);
    }else{
      countSharedInto(counts,item.group[0],item.group);
    }
  });

  return counts;
}

/* ===============================
   TOP CARDS
================================ */

function renderSourceCards(){
  if(!sourceCardsWrap) return;

  const counts = getCounts();

  const cards = [
    {code:"ALL", label:"All", cls:"all"},
    {code:"FACILITY", label:"Facility", cls:"facility"},
    {code:"GQ", label:"Get Quote", cls:"gq"},
    {code:"RV", label:"Reserved", cls:"rv"}
  ];

  sourceCardsWrap.innerHTML = cards.map(card=>{
    const active = activeSource === card.code ? "active" : "";
    return `
      <div class="filter-card ${card.cls} ${active}" data-source="${safe(card.code)}">
        <div class="card-number">${counts.source[card.code] || 0}</div>
        <div class="card-label">${safe(card.label)}</div>
        <div class="card-sub">Click to filter</div>
      </div>
    `;
  }).join("");

  sourceCardsWrap.querySelectorAll(".filter-card").forEach(card=>{
    card.onclick = ()=>{
      activeSource = card.dataset.source || "ALL";
      applyFilters();
    };
  });
}

function renderStatusCards(){
  if(!statusCardsWrap) return;

  const counts = getCounts();

  const cards = [
    {code:"completed", label:"Completed", cls:"completed"},
    {code:"cancelled", label:"Cancelled", cls:"cancelled"},
    {code:"noshow", label:"No Show", cls:"noshow"},
    {code:"notcompleted", label:"Not Completed", cls:"notcompleted"},
    {code:"notconfirmed", label:"Not Confirmed", cls:"notconfirmed", alert: counts.status.notconfirmed > 0}
  ];

  statusCardsWrap.innerHTML = cards.map(card=>{
    const active = activeStatus === card.code ? "active" : "";
    const alert = card.alert ? "alert" : "";
    return `
      <div class="stat-card clickable ${card.cls} ${active} ${alert}" data-status="${safe(card.code)}">
        <div class="card-number">${counts.status[card.code] || 0}</div>
        <div class="card-label">${safe(card.label)}</div>
        <div class="card-sub">${card.code === "notconfirmed" ? "Trips still waiting confirmation" : "Click to filter"}</div>
      </div>
    `;
  }).join("");

  statusCardsWrap.querySelectorAll(".stat-card.clickable").forEach(card=>{
    card.onclick = ()=>{
      const next = card.dataset.status || "ALL";
      activeStatus = activeStatus === next ? "ALL" : next;
      applyFilters();
    };
  });
}

/* ===============================
   MODAL
================================ */

function viewLine(label,value){
  return `
    <div class="view-line">
      <div class="view-label">${safe(label)}</div>
      <div class="view-value">${safe(value || "--")}</div>
    </div>
  `;
}

function openFinalView(key){
  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  const t = item.kind === "trip" ? item.trip : item.group[0];
  closeFinalView();

  let sharedPassengerBlock = "";

  if(item.kind === "shared"){
    const passengers = groupPassengersReadyForPage(item.group);

    sharedPassengerBlock = `
      ${viewLine(
        "Passengers",
        passengers.map((p,i)=>[
          `${i+1}. ${getPassengerName(p,t)}`,
          `Phone: ${getPassengerPhone(p,t)}`,
          `Pickup: ${getPickup(t,p)}`,
          `Dropoff: ${getDropoff(t,p)}`,
          `Status: ${displayStatus(p.status || t.status)}`
        ].join("\n")).join("\n\n")
      )}
    `;
  }

  const overlay = document.createElement("div");
  overlay.id = "finalViewOverlay";
  overlay.className = "view-overlay";

  overlay.innerHTML = `
    <div class="view-box">
      <div class="view-head">
        <div>Final Confirmation Details</div>
        <button class="view-close" type="button" onclick="closeFinalView()">×</button>
      </div>

      <div class="view-body">
        ${viewLine("Trip Number", getTripNumber(t))}
        ${viewLine("Source", sourceLabel(t))}
        ${viewLine("Facility", getCompanyDisplay(t))}
        ${viewLine("Entry Name", t.entryName || "")}
        ${viewLine("Entry Phone", t.entryPhone || "")}
        ${viewLine("Client Phone", t.clientPhone || t.phone || "")}
        ${viewLine("Pickup", t.pickup || "")}
        ${viewLine("Stops", stopsDisplay(t))}
        ${viewLine("Dropoff", t.dropoff || "")}
        ${viewLine("Trip Date", t.tripDate || "")}
        ${viewLine("Trip Time", t.tripTime || "")}
        ${viewLine("Notes", getNotes(t) || "")}
        ${viewLine("Booked Date", getBookedDate(t))}
        ${viewLine("Booked Time", getBookedTime(t))}
        ${viewLine("Entered Page", getEnteredAt(t) ? new Date(getEnteredAt(t)).toLocaleString() : "")}
        ${viewLine("Confirmed", item.kind === "trip" ? (isTripConfirmed(t) ? "Yes" : "No") : (isSharedConfirmed(t) ? "Yes" : "No"))}
        ${sharedPassengerBlock}
      </div>
    </div>
  `;

  overlay.addEventListener("click",e=>{
    if(e.target === overlay) closeFinalView();
  });

  document.body.appendChild(overlay);
}

function closeFinalView(){
  document.getElementById("finalViewOverlay")?.remove();
}

/* ===============================
   API PATCH HELPERS
================================ */

async function patchSingleStatus(tripId,body){
  const res = await fetch(
    `${API_URL}/${encodeURIComponent(tripId)}/status`,
    {
      method:"PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body)
    }
  );

  if(!res.ok){
    throw new Error("Single status patch failed");
  }

  return await res.json().catch(()=>null);
}

async function patchSingleConfirm(tripId,body){
  const res = await fetch(
    `${API_URL}/${encodeURIComponent(tripId)}/confirm`,
    {
      method:"PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body)
    }
  );

  if(!res.ok){
    throw new Error("Single confirm failed");
  }

  return await res.json().catch(()=>null);
}

async function patchSharedStatus(tripId,body){
  const res = await fetch(
    `${API_URL}/${encodeURIComponent(tripId)}/shared-status`,
    {
      method:"PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body)
    }
  );

  if(!res.ok){
    throw new Error("Shared status patch failed");
  }

  return await res.json().catch(()=>null);
}

async function patchSharedConfirm(tripId,body){
  const res = await fetch(
    `${API_URL}/${encodeURIComponent(tripId)}/shared-confirm`,
    {
      method:"PATCH",
      headers: authHeaders(),
      body: JSON.stringify(body)
    }
  );

  if(!res.ok){
    throw new Error("Shared confirm failed");
  }

  return await res.json().catch(()=>null);
}

/* ===============================
   FINDERS
================================ */

function getTripId(t){
  return t?._id || t?.id;
}

function findLiveTripByKey(key){
  return allTrips.find(t => String(t._id || t.id || getTripNumber(t)) === key);
}

function findLiveSharedRootByKey(key){
  return allTrips.find(t => getSharedKey(t) === key);
}

/* ===============================
   ACTIONS
================================ */

function beginEditSingle(key){
  editingSingles.add(key);
  render();
}

function beginEditShared(key){
  editingShared.add(key);
  render();
}

function cancelEditSingle(key){
  editingSingles.delete(key);
  const t = findLiveTripByKey(key);
  if(t?.__draftStatus){
    delete t.__draftStatus;
  }
  render();
}

function cancelEditShared(key){
  editingShared.delete(key);
  const root = findLiveSharedRootByKey(key);
  if(root?.__draftPassengers){
    delete root.__draftPassengers;
  }
  render();
}

async function confirmSingleTrip(key){
  const t = findLiveTripByKey(key);
  if(!t) return;

  const newStatus = t.__draftStatus || t.status || "Completed";

  try{
    const tripId = getTripId(t);
    if(!tripId) throw new Error("Missing trip id");

    const res = await patchSingleConfirm(tripId,{
      status: statusValueToLabel(getStatusOptionValue(newStatus)),
      confirmedBy: adminName
    });

    const savedTrip = res?.trip || {};

    t.status = savedTrip.status || statusValueToLabel(getStatusOptionValue(newStatus));
    t.finalStatusConfirmed = true;
    t.finalStatusConfirmedAt =
      savedTrip.finalStatusConfirmedAt ||
      new Date().toISOString();
    t.dispatchFinalConfirmedAt =
      savedTrip.dispatchFinalConfirmedAt ||
      t.finalStatusConfirmedAt;

    if(savedTrip.finalPageEnteredAt) t.finalPageEnteredAt = savedTrip.finalPageEnteredAt;
    if(savedTrip.dispatchFinalPageEnteredAt) t.dispatchFinalPageEnteredAt = savedTrip.dispatchFinalPageEnteredAt;

    editingSingles.delete(key);
    delete t.__draftStatus;

    applyFilters();
  }catch(err){
    console.log(err);
    alert("Failed to confirm trip.");
  }
}

async function saveSingleEdit(key){
  const t = findLiveTripByKey(key);
  if(!t) return;

  const newStatus = t.__draftStatus || t.status || "Completed";

  try{
    const tripId = getTripId(t);
    if(!tripId) throw new Error("Missing trip id");

    const res = await patchSingleStatus(tripId,{
      status: statusValueToLabel(getStatusOptionValue(newStatus)),
      confirmedBy: adminName
    });

    const savedTrip = res?.trip || {};

    t.status = savedTrip.status || statusValueToLabel(getStatusOptionValue(newStatus));
    t.finalStatusConfirmed = savedTrip.finalStatusConfirmed === true;
    t.finalStatusConfirmedAt = savedTrip.finalStatusConfirmedAt || null;
    t.dispatchFinalConfirmedAt = savedTrip.dispatchFinalConfirmedAt || null;

    if(savedTrip.finalPageEnteredAt) t.finalPageEnteredAt = savedTrip.finalPageEnteredAt;
    if(savedTrip.dispatchFinalPageEnteredAt) t.dispatchFinalPageEnteredAt = savedTrip.dispatchFinalPageEnteredAt;

    editingSingles.delete(key);
    delete t.__draftStatus;

    applyFilters();
  }catch(err){
    console.log(err);
    alert("Failed to edit trip.");
  }
}

async function confirmSharedTrip(key){
  const root = findLiveSharedRootByKey(key);
  if(!root) return;

  const passengers = Array.isArray(root.passengers)
    ? root.passengers.map((p,idx)=>{
        const draft = root.__draftPassengers?.[idx];
        const nextStatus = draft || p.status || "Completed";
        return {
          ...p,
          status: statusValueToLabel(getStatusOptionValue(nextStatus))
        };
      })
    : [];

  try{
    const tripId = getTripId(root);
    if(!tripId) throw new Error("Missing trip id");

    const res = await patchSharedConfirm(tripId,{
      passengers,
      confirmedBy: adminName
    });

    const savedTrip = res?.trip || {};

    root.passengers = savedTrip.passengers || passengers;
    root.sharedFinalConfirmed = true;
    root.sharedFinalConfirmedAt =
      savedTrip.sharedFinalConfirmedAt ||
      savedTrip.finalStatusConfirmedAt ||
      new Date().toISOString();
    root.finalStatusConfirmed = true;
    root.finalStatusConfirmedAt =
      savedTrip.finalStatusConfirmedAt ||
      root.sharedFinalConfirmedAt;
    root.dispatchFinalConfirmedAt =
      savedTrip.dispatchFinalConfirmedAt ||
      root.sharedFinalConfirmedAt;

    if(savedTrip.finalPageEnteredAt) root.finalPageEnteredAt = savedTrip.finalPageEnteredAt;
    if(savedTrip.dispatchFinalPageEnteredAt) root.dispatchFinalPageEnteredAt = savedTrip.dispatchFinalPageEnteredAt;

    editingShared.delete(key);
    delete root.__draftPassengers;

    applyFilters();
  }catch(err){
    console.log(err);
    alert("Failed to confirm shared trip.");
  }
}

async function saveSharedEdit(key){
  const root = findLiveSharedRootByKey(key);
  if(!root) return;

  const passengers = Array.isArray(root.passengers)
    ? root.passengers.map((p,idx)=>{
        const draft = root.__draftPassengers?.[idx];
        const nextStatus = draft || p.status || "Completed";
        return {
          ...p,
          status: statusValueToLabel(getStatusOptionValue(nextStatus))
        };
      })
    : [];

  try{
    const tripId = getTripId(root);
    if(!tripId) throw new Error("Missing trip id");

    const res = await patchSharedStatus(tripId,{
      passengers,
      confirmedBy: adminName
    });

    const savedTrip = res?.trip || {};

    root.passengers = savedTrip.passengers || passengers;
    root.sharedFinalConfirmed = savedTrip.sharedFinalConfirmed === true;
    root.sharedFinalConfirmedAt = savedTrip.sharedFinalConfirmedAt || null;
    root.finalStatusConfirmed = savedTrip.finalStatusConfirmed === true;
    root.finalStatusConfirmedAt = savedTrip.finalStatusConfirmedAt || null;
    root.dispatchFinalConfirmedAt = savedTrip.dispatchFinalConfirmedAt || null;

    if(savedTrip.finalPageEnteredAt) root.finalPageEnteredAt = savedTrip.finalPageEnteredAt;
    if(savedTrip.dispatchFinalPageEnteredAt) root.dispatchFinalPageEnteredAt = savedTrip.dispatchFinalPageEnteredAt;

    editingShared.delete(key);
    delete root.__draftPassengers;

    applyFilters();
  }catch(err){
    console.log(err);
    alert("Failed to edit shared trip.");
  }
}

function handleSingleStatusChange(key,value){
  const t = findLiveTripByKey(key);
  if(!t) return;
  t.__draftStatus = statusValueToLabel(value);
}

function handleSharedPassengerStatusChange(groupKey,idx,value){
  const root = findLiveSharedRootByKey(groupKey);
  if(!root) return;

  if(!root.__draftPassengers){
    root.__draftPassengers = {};
  }

  root.__draftPassengers[idx] = statusValueToLabel(value);
}

/* ===============================
   TABLE ENGINE
================================ */

function rowSourceClass(t){
  const src = getSourceCode(t);
  if(src === "FACILITY") return "row-facility";
  if(src === "RV") return "row-rv";
  return "row-gq";
}

function rowOverdueClass(item){
  if(item.kind === "trip"){
    return isTripOverdueNotConfirmed(item.trip) ? "pending-overdue" : "";
  }
  return isSharedOverdueNotConfirmed(item.group[0]) ? "pending-overdue" : "";
}

function rowConfirmedClass(item){
  if(item.kind === "trip"){
    return isTripConfirmed(item.trip) ? "confirmed-row" : "";
  }
  return isSharedConfirmed(item.group[0]) ? "confirmed-row confirmed-shared-head" : "";
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

function singleStatusEditHTML(item){
  const t = item.trip;
  const current = getStatusOptionValue(t.__draftStatus || t.status);

  return `
    <select class="status-select" onchange="handleSingleStatusChange('${safe(item.key)}', this.value)">
      <option value="completed" ${current === "completed" ? "selected" : ""}>Completed</option>
      <option value="cancelled" ${current === "cancelled" ? "selected" : ""}>Cancelled</option>
      <option value="noshow" ${current === "noshow" ? "selected" : ""}>No Show</option>
      <option value="notcompleted" ${current === "notcompleted" ? "selected" : ""}>Not Completed</option>
    </select>
  `;
}

function sharedPassengerStatusEditHTML(groupKey,p,trip){
  const idx = Number(p.__idx || 0);
  const root = findLiveSharedRootByKey(groupKey);
  const draft = root?.__draftPassengers?.[idx];
  const current = getStatusOptionValue(draft || p.status || trip.status);

  return `
    <select class="status-select" onchange="handleSharedPassengerStatusChange('${safe(groupKey)}', ${idx}, this.value)">
      <option value="completed" ${current === "completed" ? "selected" : ""}>Completed</option>
      <option value="cancelled" ${current === "cancelled" ? "selected" : ""}>Cancelled</option>
      <option value="noshow" ${current === "noshow" ? "selected" : ""}>No Show</option>
      <option value="notcompleted" ${current === "notcompleted" ? "selected" : ""}>Not Completed</option>
    </select>
  `;
}

function render(){
  tripCounter = 1;
  renderSourceCards();
  renderStatusCards();

  if(!finalContent) return;

  finalContent.innerHTML = "";

  if(!displayItems.length){
    finalContent.innerHTML = `<div class="empty-state">No Final Confirmation Trips Found</div>`;
    return;
  }

  const groups = groupByTripDate(displayItems);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "review-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-trip">Trip #</th>
        <th class="col-company">Facility</th>
        <th class="wide-client">Client / Passengers</th>
        <th class="wide-address">Pickup</th>
        <th class="wide-stops">Stops</th>
        <th class="wide-address">Dropoff</th>
        <th class="col-date">Trip Date</th>
        <th class="col-time">Trip Time</th>
        <th class="col-status">Status</th>
        <th class="col-actions">Actions</th>
        <th class="col-eye">👁️</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  Object.keys(groups)
    .sort((a,b)=>new Date(b)-new Date(a))
    .forEach(day=>{

      const dateRow = document.createElement("tr");
      dateRow.className = "date-row";
      dateRow.innerHTML = `<td colspan="12">Trip Date: ${safe(day)}</td>`;
      tbody.appendChild(dateRow);

      groups[day].forEach(item=>{
        if(item.kind === "trip"){
          tbody.appendChild(renderTripRow(item));
        }else{
          tbody.appendChild(renderSharedRow(item));
        }
      });
    });

  wrap.appendChild(table);
  finalContent.appendChild(wrap);
}

function renderTripRow(item){
  const t = item.trip;
  const isEditing = editingSingles.has(item.key);
  const confirmed = isTripConfirmed(t);

  const tr = document.createElement("tr");
  tr.className = [
    rowSourceClass(t),
    rowConfirmedClass(item),
    rowOverdueClass(item),
    "trip-divider"
  ].join(" ").trim();

  tr.innerHTML = `
    <td class="col-num">${tripCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(t))}</span>
    </td>

    <td class="company-cell">
      ${cellBox(safe(getCompanyDisplay(t)))}
    </td>

    <td class="wide-client">
      ${cellBox(safe(t.clientName || t.name || "--"))}
    </td>

    <td class="wide-address">
      ${cellBox(safe(t.pickup || "--"))}
    </td>

    <td class="wide-stops">
      ${cellBox(stopsDisplay(t))}
    </td>

    <td class="wide-address">
      ${cellBox(safe(t.dropoff || "--"))}
    </td>

    <td class="col-date">${safe(t.tripDate || "-")}</td>
    <td class="col-time">${safe(t.tripTime || "-")}</td>

    <td class="col-status">
      ${
        isEditing
          ? singleStatusEditHTML(item)
          : statusCellHTML(t.__draftStatus || t.status, confirmed)
      }
    </td>

    <td class="col-actions">
      <div class="actions-wrap">
        ${
          isEditing
          ? `
            <button class="btn-action btn-edit" type="button" onclick="saveSingleEdit('${safe(item.key)}')">Save</button>
            <button class="btn-action" type="button" onclick="cancelEditSingle('${safe(item.key)}')">Cancel</button>
          `
          : `
            <button class="btn-action btn-edit" type="button" onclick="beginEditSingle('${safe(item.key)}')">Edit</button>
            <button class="btn-action ${confirmed ? "btn-confirmed" : "btn-confirm"}" type="button" onclick="confirmSingleTrip('${safe(item.key)}')">
              ${confirmed ? "Confirmed" : "Confirm"}
            </button>
          `
        }
      </div>
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openFinalView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(item){
  const group = item.group;
  const first = group[0] || {};
  const passengers = groupPassengersReadyForPage(group);
  const isEditing = editingShared.has(item.key);
  const confirmed = isSharedConfirmed(first);

  const names = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getPassengerName(p,first) || "--")}`
  ));

  const pickups = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getPickup(first,p) || "--")}`
  ));

  const dropoffs = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getDropoff(first,p) || "--")}`
  ));

  const statusBox = isEditing
    ? cellBox(passengers.map(p => sharedPassengerStatusEditHTML(item.key,p,first)))
    : cellBox(passengers.map(p => statusCellHTML(p.status || first.status, confirmed)));

  const tr = document.createElement("tr");
  tr.className = [
    "shared-row",
    rowSourceClass(first),
    rowConfirmedClass(item),
    rowOverdueClass(item),
    "trip-divider"
  ].join(" ").trim();

  tr.innerHTML = `
    <td class="col-num">${tripCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(first))}</span>
    </td>

    <td class="company-cell">
      ${cellBox(safe(getCompanyDisplay(first)))}
    </td>

    <td class="wide-client">${names}</td>

    <td class="wide-address">${pickups}</td>

    <td class="wide-stops">
      ${cellBox(stopsDisplay(first))}
    </td>

    <td class="wide-address">${dropoffs}</td>

    <td class="col-date">${safe(first.tripDate || "-")}</td>
    <td class="col-time">${safe(first.tripTime || "-")}</td>

    <td class="col-status">${statusBox}</td>

    <td class="col-actions">
      <div class="actions-wrap">
        ${
          isEditing
          ? `
            <button class="btn-action btn-edit" type="button" onclick="saveSharedEdit('${safe(item.key)}')">Save</button>
            <button class="btn-action" type="button" onclick="cancelEditShared('${safe(item.key)}')">Cancel</button>
          `
          : `
            <button class="btn-action btn-edit" type="button" onclick="beginEditShared('${safe(item.key)}')">Edit</button>
            <button class="btn-action ${confirmed ? "btn-confirmed" : "btn-confirm"}" type="button" onclick="confirmSharedTrip('${safe(item.key)}')">
              ${confirmed ? "Confirmed" : "Confirm"}
            </button>
          `
        }
      </div>
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openFinalView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

/* ===============================
   EVENTS
================================ */

searchInput?.addEventListener("input",applyFilters);
yearFilter?.addEventListener("change",applyFilters);
monthFilter?.addEventListener("change",applyFilters);

Object.assign(window,{
  openFinalView,
  closeFinalView,
  beginEditSingle,
  beginEditShared,
  cancelEditSingle,
  cancelEditShared,
  confirmSingleTrip,
  confirmSharedTrip,
  saveSingleEdit,
  saveSharedEdit,
  handleSingleStatusChange,
  handleSharedPassengerStatusChange
});

/* ===============================
   INIT
================================ */

async function refreshEverything(){
  await Promise.all([
    loadServices(),
    loadTrips()
  ]);
}

(async function init(){
  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshEverything,30000);
})();