/* ==========================================================================
   DISPATCH REVIEW V2 - FACILITY READY
   Admin / SuperAdmin / Dispatcher
   Table UI Updated Only
   Reserved Filter + Reserved Card
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";
const USERS_URL = "/api/users";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */

let allTrips = [];
let services = [];
let facilities = [];
let displayItems = [];

let activeService = "ALL";
let activeSource = "ALL";
let activeFacility = "ALL";

let refreshTimer = null;

const CLOSED_HOURS = 10;

/* ===============================
   ELEMENTS
================================ */

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const yearFilter = document.getElementById("yearFilter");
const monthFilter = document.getElementById("monthFilter");
const reviewContent = document.getElementById("reviewContent");

/* ===============================
   BUILD TOP FILTERS
================================ */

(function buildTopFilters(){

  const toolbar = document.querySelector(".toolbar");
  if(!toolbar) return;

  if(!document.getElementById("sourceFilter")){

    const source = document.createElement("select");
    source.id = "sourceFilter";
    source.className = "filter-select";
    source.innerHTML = `
      <option value="ALL">All Bookings</option>
      <option value="GQ">Individual</option>
      <option value="FACILITY">Facilities</option>
      <option value="RV">Reserved</option>
    `;

    toolbar.insertBefore(source, toolbar.firstChild);
  }

  if(!document.getElementById("facilityFilter")){

    const facility = document.createElement("select");
    facility.id = "facilityFilter";
    facility.className = "filter-select";
    facility.style.display = "none";
    facility.innerHTML = `
      <option value="ALL">All Facilities</option>
    `;

    toolbar.insertBefore(facility, toolbar.children[1] || null);
  }

  if(!document.getElementById("dispatch-review-v2-style")){

    const style = document.createElement("style");
    style.id = "dispatch-review-v2-style";
    style.innerHTML = `

      .stat-card.facility{border-left:6px solid #1d4ed8;}
      .stat-card.reserved{border-left:6px solid #f59e0b;}

      .facility-name{color:#1d4ed8;font-size:13px;font-weight:700;}
      .row-facility td{background:#eaf4ff!important;}
      .row-reserved td{background:#fef3c7!important;}

      .source-pill.facility{
        background:#dbeafe;
        color:#1e3a8a;
        border:1px solid #93c5fd;
        font-size:10px;
        font-weight:600;
        height:24px;
        line-height:24px;
        padding:0;
      }

      .source-pill.reserved{
        background:#fef3c7;
        color:#92400e;
        border:1px solid #fcd34d;
        font-size:10px;
        font-weight:600;
        height:24px;
        line-height:24px;
        padding:0;
      }

      /* ===============================
         TABLE CLEAN UI
      =============================== */

      .table-wrap{
        width:100%!important;
        max-width:100%!important;
        overflow-x:auto!important;
        overflow-y:visible!important;
        -webkit-overflow-scrolling:touch!important;
        margin-bottom:20px!important;
        border-radius:14px!important;
        background:#fff!important;
        box-shadow:0 8px 22px rgba(15,23,42,.08)!important;
      }

      .review-table{
        width:100%!important;
        min-width:1560px!important;
        table-layout:fixed!important;
        border-collapse:collapse!important;
        background:#fff!important;
        border-top:6px solid #000!important;
      }

      .review-table th,
      .review-table td{
        border:1px solid #dbe3ee!important;
        padding:5px!important;
        text-align:center!important;
        font-size:11px!important;
        vertical-align:middle!important;
        line-height:1.25!important;
        box-sizing:border-box!important;
      }

      .review-table th{
        background:#1f2937!important;
        color:#fff!important;
        font-weight:900!important;
        white-space:nowrap!important;
        font-size:11px!important;
      }

      .col-num{width:30px!important;}
      .col-trip{width:76px!important;}
      .col-company{width:105px!important;}
      .col-date{width:82px!important;}
      .col-time{width:58px!important;}
      .col-status{width:88px!important;}
      .col-eye{width:34px!important;}

      .wide-client{
        width:180px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .wide-phone{
        width:115px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .wide-address{
        width:230px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
        font-size:10.5px!important;
      }

      .wide-stops{
        width:120px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
        font-size:10.5px!important;
      }

      .wide-notes{
        width:240px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .company-cell{
        width:105px!important;
        font-weight:800!important;
        word-break:break-word!important;
        text-align:left!important;
      }

      .date-row td{
        background:#bfdbfe!important;
        color:#1e3a8a!important;
        font-weight:900!important;
        text-align:center!important;
        padding:5px 6px!important;
        font-size:13px!important;
        line-height:1.15!important;
        border-top:2px solid #60a5fa!important;
        border-bottom:2px solid #60a5fa!important;
        letter-spacing:.3px!important;
      }

      .trip-divider td{
        border-bottom:3px solid #000!important;
      }

      .cell-box{
        display:grid!important;
        border:1px solid #111!important;
        background:#fff!important;
        width:100%!important;
        box-sizing:border-box!important;
        border-radius:4px!important;
        overflow:hidden!important;
      }

      .cell-item{
        padding:4px 5px!important;
        min-height:22px!important;
        font-weight:700!important;
        white-space:normal!important;
        word-break:break-word!important;
        box-sizing:border-box!important;
        background:#fff!important;
        font-size:10.5px!important;
      }

      .cell-item + .cell-item{
        border-top:1px solid #111!important;
      }

      .trip-number-badge{
        font-weight:900!important;
        color:#1d4ed8!important;
        white-space:normal!important;
        word-break:break-word!important;
        font-size:10px!important;
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

      .status-pill.completed{
        background:#bbf7d0!important;
        color:#14532d!important;
        border-color:#86efac!important;
      }

      .status-pill.cancelled{
        background:#fecaca!important;
        color:#7f1d1d!important;
        border-color:#fca5a5!important;
      }

      .status-pill.noshow{
        background:#fde68a!important;
        color:#78350f!important;
        border-color:#fcd34d!important;
      }

      .status-pill.notcompleted{
        background:#e5e7eb!important;
        color:#374151!important;
        border-color:#cbd5e1!important;
      }

      .row-getquote td{background:#dcfce7!important;}
      .shared-row td{background:#ede9fe!important;}

      .completed-row td{
        box-shadow:inset 0 0 0 9999px rgba(22,163,74,.08)!important;
      }

      .cancelled-row td{
        box-shadow:inset 0 0 0 9999px rgba(220,38,38,.07)!important;
      }

      .noshow-row td{
        box-shadow:inset 0 0 0 9999px rgba(245,158,11,.08)!important;
      }

      .notcompleted-row td{
        box-shadow:inset 0 0 0 9999px rgba(100,116,139,.08)!important;
      }

      .eye-btn{
        border:none!important;
        background:transparent!important;
        color:#2563eb!important;
        width:30px!important;
        height:24px!important;
        cursor:pointer!important;
        font-size:18px!important;
        font-weight:900!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        line-height:1!important;
        padding:0!important;
      }

      .eye-btn:hover{
        color:#1d4ed8!important;
        background:#dbeafe!important;
        border-radius:6px!important;
      }

      .view-overlay{
        position:fixed!important;
        inset:0!important;
        background:rgba(15,23,42,.55)!important;
        z-index:99999!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        padding:15px!important;
      }

      .view-box{
        background:#fff!important;
        width:min(560px,96vw)!important;
        border-radius:15px!important;
        overflow:hidden!important;
        box-shadow:0 20px 60px rgba(0,0,0,.28)!important;
      }

      .view-head{
        background:#2563eb!important;
        color:#fff!important;
        padding:12px 15px!important;
        display:flex!important;
        justify-content:space-between!important;
        align-items:center!important;
        font-weight:900!important;
      }

      .view-close{
        border:none!important;
        background:#fff!important;
        color:#0f172a!important;
        width:30px!important;
        height:30px!important;
        border-radius:50%!important;
        font-size:18px!important;
        font-weight:900!important;
        cursor:pointer!important;
      }

      .view-body{
        padding:14px!important;
        display:grid!important;
        gap:8px!important;
      }

      .view-line{
        display:grid!important;
        grid-template-columns:150px 1fr!important;
        border:1px solid #e2e8f0!important;
        border-radius:9px!important;
        overflow:hidden!important;
      }

      .view-label{
        background:#f1f5f9!important;
        padding:9px!important;
        font-weight:900!important;
        color:#334155!important;
      }

      .view-value{
        padding:9px!important;
        font-weight:800!important;
        color:#0f172a!important;
        word-break:break-word!important;
        white-space:pre-line!important;
      }

      @media(max-width:768px){
        .review-table{
          min-width:1560px!important;
        }

        .review-table th,
        .review-table td{
          font-size:10px!important;
          padding:4px!important;
        }

        .cell-item{
          font-size:9.5px!important;
          padding:3px 4px!important;
        }

        .view-line{
          grid-template-columns:1fr!important;
        }
      }
    `;

    document.head.appendChild(style);
  }

})();

const sourceFilter = document.getElementById("sourceFilter");
const facilityFilter = document.getElementById("facilityFilter");

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

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
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

function getTripNumber(t){
  return String(t?.tripNumber || t?.bookingNumber || t?.id || "-");
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

function getTripDateKey(t){
  return t?.tripDate || "Unknown";
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
  return arr.map((x,i)=>`${i+1}. ${safe(x)}`).join("\n");
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

function isScheduledStatus(status){
  return cleanStatus(status) === "scheduled";
}

function isConfirmedStatus(status){
  return cleanStatus(status) === "confirmed";
}

function isNotCompletedStatus(status,trip){

  const s = cleanStatus(status);
  const c = compactStatus(status);

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return true;
  }

  if(
    isCompletedStatus(status) ||
    isCancelledStatus(status) ||
    isNoShowStatus(status)
  ){
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

function statusHTML(status,trip){
  const label = displayStatus(status,trip);
  const cls = statusClass(status,trip);
  return `<span class="status-pill ${cls}">${safe(label)}</span>`;
}

/* ===============================
   SERVICES ENGINE
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

function sourceHTML(t){

  const code = getSourceCode(t);

  if(code === "RV"){
    return `<span class="source-pill reserved">Reserved</span>`;
  }

  if(code === "FACILITY"){
    return `<span class="source-pill facility">Facility</span>`;
  }

  return `<span class="source-pill gq">Get Quote</span>`;
}

function sourceLabel(t){
  const code = getSourceCode(t);

  if(code === "RV") return "Reserved";
  if(code === "FACILITY") return "Facility";

  return "Individual / Get Quote";
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
    group.sort((a,b)=>
      Number(a.passengerIndex || 0) -
      Number(b.passengerIndex || 0)
    )
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
   FACILITY USERS ENGINE
================================ */

function extractUsers(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data?.users)) return data.users;
  if(Array.isArray(data?.data)) return data.data;
  if(Array.isArray(data?.items)) return data.items;
  if(Array.isArray(data?.results)) return data.results;
  return [];
}

function isFacilityUser(u){

  const r = cleanStatus(
    u?.role ||
    u?.type ||
    u?.accountType ||
    ""
  );

  return (
    r === "company" ||
    r === "facility" ||
    r === "organization" ||
    r.includes("company") ||
    r.includes("facility")
  );
}

function getFacilityNameFromUser(u){
  return normalizeText(
    u?.facilityName ||
    u?.organizationName ||
    u?.companyName ||
    u?.company ||
    u?.name ||
    u?.fullName ||
    ""
  );
}

async function loadFacilities(){

  try{

    const res = await fetch(USERS_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error("Failed users");

    const data = await res.json();
    const users = extractUsers(data);

    const names = users
      .filter(isFacilityUser)
      .map(getFacilityNameFromUser)
      .filter(Boolean);

    facilities =
      [...new Set(names)]
      .sort((a,b)=>a.localeCompare(b));

  }catch(err){

    facilities = [];

  }
}

function buildFacilityFallbackFromTrips(){

  if(facilities.length) return;

  const names =
    allTrips
      .filter(t => getSourceCode(t) === "FACILITY")
      .map(getFacilityName)
      .filter(Boolean);

  facilities =
    [...new Set(names)]
    .sort((a,b)=>a.localeCompare(b));
}

function renderFacilityFilter(){

  if(!facilityFilter) return;

  facilityFilter.innerHTML =
    `<option value="ALL">All Facilities</option>`;

  facilities.forEach(name=>{
    facilityFilter.innerHTML += `
      <option value="${safe(name)}">
        ${safe(name)}
      </option>
    `;
  });

  if(activeSource === "FACILITY"){
    facilityFilter.style.display = "inline-block";
  }else{
    facilityFilter.style.display = "none";
    activeFacility = "ALL";
    facilityFilter.value = "ALL";
  }

  if(activeFacility !== "ALL"){
    if(facilities.includes(activeFacility)){
      facilityFilter.value = activeFacility;
    }else{
      activeFacility = "ALL";
      facilityFilter.value = "ALL";
    }
  }
}

/* ===============================
   LOADERS
================================ */

async function loadServices(){

  try{

    const res = await fetch(SERVICES_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error("Failed services");

    const data = await res.json();

    services =
      extractServices(data)
      .filter(serviceEnabled);

    if(
      activeService !== "ALL" &&
      !services.some(s => getServiceCodeFromService(s) === activeService)
    ){
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
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error("Failed trips");

    const data = await res.json();

    allTrips =
      Array.isArray(data)
        ? data.sort((a,b)=>getBookedDateObj(b)-getBookedDateObj(a))
        : [];

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

    buildFacilityFallbackFromTrips();
    buildDateFilters();
    renderFacilityFilter();
    applyFilters();

  }catch(err){

    console.log(err);
    allTrips = [];
    displayItems = [];
    render();

  }
}

/* ===============================
   FILTER ENGINE
================================ */

function isClosedTrip(t){

  if(!t) return false;

  if(isSharedTrip(t)){
    const group =
      getSharedGroups(allTrips)
        .find(g => getSharedKey(g[0]) === getSharedKey(t)) ||
      [t];

    return hasClosedPassenger(group);
  }

  return isClosedStatus(t.status,t);
}

function buildDisplayItems(trips){

  const activeCodes =
    services.map(s => getServiceCodeFromService(s));

  const items = [];
  const usedShared = new Set();

  trips.forEach(t=>{

    const tripCode = getServiceCodeFromTrip(t);

    if(activeCodes.length && !activeCodes.includes(tripCode)){
      return;
    }

    if(!isClosedTrip(t)) return;

    if(isSharedTrip(t)){

      const key = getSharedKey(t);
      if(usedShared.has(key)) return;

      usedShared.add(key);

      const group =
        getSharedGroups(trips)
          .find(g => getSharedKey(g[0]) === key) ||
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

  const first =
    item.kind === "trip"
      ? item.trip
      : item.group[0];

  const passengers =
    item.kind === "shared"
      ? getRealPassengersFromGroup(item.group)
      : [];

  return [
    getTripNumber(first),
    getServiceTitleByTrip(first),
    getSourceCode(first),
    sourceLabel(first),
    getFacilityName(first),
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

function filterItems(items,options = {}){

  let out = [...items];

  if(activeSource === "GQ"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === "GQ";
    });
  }

  if(activeSource === "FACILITY"){

    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === "FACILITY";
    });

    if(activeFacility !== "ALL"){
      out = out.filter(item=>{
        const t = item.kind === "trip" ? item.trip : item.group[0];
        return getFacilityName(t) === activeFacility;
      });
    }
  }

  if(activeSource === "RV"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === "RV";
    });
  }

  if(options.service !== false && activeService !== "ALL"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,activeService);
    });
  }

  const q =
    searchInput
      ? searchInput.value.toLowerCase().trim()
      : "";

  if(q){
    out = out.filter(item => searchableText(item).includes(q));
  }

  const st = statusFilter ? statusFilter.value : "";

  if(st){
    out = out.filter(item=>{
      if(item.kind === "trip"){
        return displayStatus(item.trip.status,item.trip) === st;
      }

      return getGroupStatus(item.group) === st;
    });
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

  yearFilter.innerHTML =
    `<option value="">All Years</option>`;

  [...years]
    .sort((a,b)=>Number(b)-Number(a))
    .forEach(y=>{
      yearFilter.innerHTML += `
        <option value="${safe(y)}">
          ${safe(y)}
        </option>
      `;
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
   STATS ENGINE
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
    facility:0,
    gq:0,
    reserved:0,
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

  const first =
    item.kind === "trip"
      ? item.trip
      : item.group[0];

  const azNow = getAZNow();
  const today = dateKey(azNow);
  const month = monthKey(azNow);

  stats.total++;

  if(first.tripDate === today) stats.today++;
  if(String(first.tripDate || "").slice(0,7) === month) stats.month++;

  const src = getSourceCode(first);

  if(src === "RV"){
    stats.reserved++;
  }else if(src === "FACILITY"){
    stats.facility++;
  }else{
    stats.gq++;
  }

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

  const baseItems =
    buildDisplayItems(allTrips);

  let selected =
    filterItems(baseItems,{service:false});

  if(code !== "ALL"){
    selected = selected.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,code);
    });
  }

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
    <div class="stat-card facility"><div class="stat-number">${stats.facility}</div><div class="stat-label">Facilities</div></div>
    <div class="stat-card gq"><div class="stat-number">${stats.gq}</div><div class="stat-label">Individual</div></div>
    <div class="stat-card reserved"><div class="stat-number">${stats.reserved}</div><div class="stat-label">Reserved</div></div>
  `;
}

/* ===============================
   SERVICE CARDS ENGINE
================================ */

function renderServiceCards(){

  const wrap = document.getElementById("serviceCards");
  if(!wrap) return;

  const cards = [
    {code:"ALL",title:"ALL"},
    ...services.map(s=>({
      code:getServiceCodeFromService(s),
      title:getServiceTitle(s)
    }))
  ];

  wrap.innerHTML = cards.map(card=>{

    const c = countItemsByService(card.code);
    const active =
      activeService === card.code
        ? "active-card"
        : "";

    return `
      <div class="service-card ${active}" data-service="${safe(card.code)}">
        <div class="service-card-title">${safe(card.title)}</div>
        <div class="service-line"><span>Total Closed</span><span>${c.total}</span></div>
        <div class="service-line"><span>Individual</span><span>${c.gq}</span></div>
        <div class="service-line"><span>Facilities</span><span>${c.facility}</span></div>
        <div class="service-line"><span>Reserved</span><span>${c.reserved}</span></div>
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
   VIEW MODAL
================================ */

function viewLine(label,value){
  return `
    <div class="view-line">
      <div class="view-label">${safe(label)}</div>
      <div class="view-value">${safe(value || "--")}</div>
    </div>
  `;
}

function openReviewView(key){

  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  const t = item.kind === "trip" ? item.trip : item.group[0];

  closeReviewView();

  const overlay = document.createElement("div");
  overlay.id = "reviewViewOverlay";
  overlay.className = "view-overlay";

  overlay.innerHTML = `
    <div class="view-box">
      <div class="view-head">
        <div>Review Details</div>
        <button class="view-close" type="button" onclick="closeReviewView()">×</button>
      </div>

      <div class="view-body">
        ${viewLine("Source",sourceLabel(t))}
        ${viewLine("Service",getServiceTitleByTrip(t))}
        ${viewLine("Facility",getFacilityName(t))}
        ${viewLine("Entry Name",t.entryName || "")}
        ${viewLine("Entry Phone",t.entryPhone || "")}
        ${viewLine("Client Email",getEmail(t,null))}
        ${viewLine("Booked Date",getBookedDate(t))}
        ${viewLine("Booked Time",getBookedTime(t))}
      </div>
    </div>
  `;

  overlay.addEventListener("click",e=>{
    if(e.target === overlay) closeReviewView();
  });

  document.body.appendChild(overlay);
}

function closeReviewView(){
  document.getElementById("reviewViewOverlay")?.remove();
}

/* ===============================
   TABLE ENGINE
================================ */

function rowClass(status,trip,itemKind){

  const cls = statusClass(status,trip);
  const src = getSourceCode(trip);

  let out = "";

  if(itemKind === "shared") out += "shared-row ";

  if(src === "RV"){
    out += "row-reserved ";
  }else if(src === "FACILITY"){
    out += "row-facility ";
  }else{
    out += "row-getquote ";
  }

  if(cls === "completed") out += "completed-row ";
  if(cls === "cancelled") out += "cancelled-row ";
  if(cls === "noshow") out += "noshow-row ";
  if(cls === "notcompleted") out += "notcompleted-row ";

  return out.trim() + " trip-divider";
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
    reviewContent.innerHTML =
      `<div class="empty-state">No Review Trips Found</div>`;
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

  Object.keys(groups)
    .sort((a,b)=>new Date(b)-new Date(a))
    .forEach(day=>{

      const dateRow = document.createElement("tr");
      dateRow.className = "date-row";
      dateRow.innerHTML = `<td colspan="13">Trip Date: ${safe(day)}</td>`;
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
  reviewContent.appendChild(wrap);
}

function renderTripRow(item){

  const t = item.trip;
  const tr = document.createElement("tr");

  tr.className = rowClass(t.status,t,"trip");

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

    <td class="wide-phone">
      ${cellBox(safe(t.clientPhone || t.phone || "--"))}
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

    <td class="wide-notes">
      ${cellBox(safe(getNotes(t) || "--"))}
    </td>

    <td class="col-date">${safe(t.tripDate || "-")}</td>
    <td class="col-time">${safe(t.tripTime || "-")}</td>

    <td class="col-status">
      ${statusHTML(t.status,t)}
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openReviewView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(item){

  const group = item.group;
  const first = group[0] || {};
  const passengers = getClosedPassengers(group);
  const groupStatus = getGroupStatus(group);

  const names = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getPassengerName(p,first) || "--")}`
  ));

  const phones = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getPassengerPhone(p,first) || "--")}`
  ));

  const pickups = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getPickup(first,p) || "--")}`
  ));

  const dropoffs = cellBox(passengers.map((p,i)=>
    `${i+1}. ${safe(getDropoff(first,p) || "--")}`
  ));

  const tr = document.createElement("tr");

  tr.className = rowClass(groupStatus,first,"shared");

  tr.innerHTML = `
    <td class="col-num">${tripCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(first))}</span>
    </td>

    <td class="company-cell">
      ${cellBox(safe(getCompanyDisplay(first)))}
    </td>

    <td class="wide-client">${names}</td>
    <td class="wide-phone">${phones}</td>
    <td class="wide-address">${pickups}</td>

    <td class="wide-stops">
      ${cellBox("Route optimized per passenger")}
    </td>

    <td class="wide-address">${dropoffs}</td>

    <td class="wide-notes">
      ${cellBox(safe(getNotes(first) || "--"))}
    </td>

    <td class="col-date">${safe(first.tripDate || "-")}</td>
    <td class="col-time">${safe(first.tripTime || "-")}</td>

    <td class="col-status">
      ${statusHTML(groupStatus,first)}
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openReviewView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

/* ===============================
   EVENTS
================================ */

searchInput?.addEventListener("input",applyFilters);
statusFilter?.addEventListener("change",applyFilters);
yearFilter?.addEventListener("change",applyFilters);
monthFilter?.addEventListener("change",applyFilters);

sourceFilter?.addEventListener("change",()=>{
  activeSource = sourceFilter.value || "ALL";
  activeFacility = "ALL";
  renderFacilityFilter();
  applyFilters();
});

facilityFilter?.addEventListener("change",()=>{
  activeFacility = facilityFilter.value || "ALL";
  applyFilters();
});

Object.assign(window,{
  openReviewView,
  closeReviewView
});

/* ===============================
   INIT
================================ */

async function refreshEverything(){

  await Promise.all([
    loadServices(),
    loadFacilities()
  ]);

  await loadTrips();
}

(async function init(){

  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);

  refreshTimer =
    setInterval(refreshEverything,30000);

})();