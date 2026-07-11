/* =========================================
FILE: review.js
COMPANY REVIEW - ONE FILE
SERVER PRICING ONLY
FINAL ROUTE LOCKED FOR SHARED - COMPANY SERVER CONFIRM
TABLE ONE PIECE + VIEW EYE
========================================= */

window.ReviewApp = { container:null };

window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";
const ADD_STOP_ACTIVE_FROM =
  new Date("2026-06-20T05:58:00");
if(!token || role !== "company"){
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");
window.ReviewApp.container = container;

if(!container){
  console.error("tripsContainer missing");
  return;
}

/* ================= STYLE ================= */

(function injectStyles(){
  const oldStyle = document.getElementById("company-review-style");
  if(oldStyle) oldStyle.remove();

  const style = document.createElement("style");
  style.id = "company-review-style";
  style.innerHTML = `
  .review-tabs{
    display:flex;
    gap:10px;
    margin:0 0 20px;
    background:#e2e8f0;
    padding:6px;
    border-radius:14px;
  }

  .review-tabs button{
    flex:1;
    padding:13px;
    border:none;
    border-radius:11px;
    font-size:14px;
    font-weight:700;
    cursor:pointer;
  }

  .tab-active{background:#2563eb;color:#fff;}
  .tab-inactive{background:#64748b;color:#fff;}

  .table-wrap{
    width:100%;
    overflow-x:auto;
    margin-bottom:20px;
    border-radius:12px;
    background:#fff;
    box-shadow:0 8px 22px rgba(15,23,42,.08);
  }

  .review-table{
    width:100%;
    border-collapse:collapse;
    background:#fff;
    min-width:1580px;
    table-layout:fixed;
    border-top:6px solid #000;
  }

  .review-table th,
  .review-table td{
    border:1px solid #dbe2ea;
    padding:5px;
    text-align:center;
    font-size:11px;
    vertical-align:middle;
    line-height:1.25;
    box-sizing:border-box;
  }

  .review-table th{
    background:#0f172a;
    color:#fff;
    font-weight:900;
    white-space:nowrap;
  }

  .date-row td{
    background:#bfdbfe!important;
    color:#1e3a8a!important;
    font-weight:900!important;
    text-align:center!important;
    padding:7px 8px!important;
    font-size:13px!important;
    line-height:1.15!important;
    border-top:3px solid #000!important;
    border-bottom:2px solid #60a5fa!important;
    letter-spacing:.3px!important;
  }

  .col-num{width:34px;}
  .col-trip{width:95px;}
  .col-client{width:150px;}
  .col-phone{width:95px;}
  .col-pickup{width:205px;}
  .col-stops{width:175px;}
  .col-drop{width:205px;}
  .col-notes{width:230px;}
  .col-date{width:88px;}
  .col-time{width:64px;}
  .col-status{width:90px;}
  .col-price{width:82px;}
  .col-miles{width:76px;}
  .col-actions{width:185px;}
  .col-eye{width:42px;}

  .btn{
    border:none;
    padding:6px 10px;
    border-radius:6px;
    font-size:11px;
    font-weight:800;
    cursor:pointer;
    margin:2px;
    white-space:nowrap;
  }

  .btn.edit{background:#2563eb;color:#fff;}
  .btn.delete{background:#111827;color:#fff;}
  .btn.confirm{background:#16a34a;color:#fff;}
  .btn.cancel{background:#dc2626;color:#fff;}
  .btn.add-stop{background:#7c3aed;color:#fff;}

  .actions-wrap{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:4px;
    flex-wrap:wrap;
    min-width:170px;
  }

  .edit-input{
    width:100%;
    min-width:90px;
    box-sizing:border-box;
    padding:6px;
    border:1px solid #cbd5e1;
    border-radius:6px;
    font-size:11px;
    background:#fff;
    color:#111827;
  }

  .multi-line{
    white-space:pre-line;
    line-height:1.5;
    text-align:left;
    word-break:break-word;
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
    line-height:1.35;
    text-align:left;
  }

  .cell-item + .cell-item{
    border-top:1px solid #111;
  }

  .trip-number-badge{
    font-weight:900;
    color:#2563eb;
    white-space:normal;
    word-break:break-word;
    font-size:10px;
  }

  .price-badge{
    font-weight:900;
    color:#15803d;
    white-space:nowrap;
  }

  .miles-strong{
    font-weight:900;
    color:#2563eb;
    white-space:nowrap;
  }

  .route-locked-badge{
    display:inline-block;
    margin-top:4px;
    padding:3px 6px;
    border-radius:999px;
    background:#fef3c7;
    color:#92400e;
    border:1px solid #fcd34d;
    font-size:9px;
    font-weight:900;
  }

  .eye-btn{
    border:none;
    background:transparent;
    color:#2563eb;
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
    color:#1d4ed8;
    background:#dbeafe;
    border-radius:6px;
  }

  .view-overlay{
    position:fixed;
    inset:0;
    background:rgba(15,23,42,.55);
    z-index:99999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:15px;
  }

  .view-box{
    background:#fff;
    width:min(570px,96vw);
    border-radius:15px;
    overflow:hidden;
    box-shadow:0 20px 60px rgba(0,0,0,.28);
  }

  .view-head{
    background:#2563eb;
    color:#fff;
    padding:12px 15px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    font-weight:900;
  }

  .view-close{
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

  .view-body{
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

  .scheduled-row{background:#fff;color:#111827;}
  .confirmed-row{background:#dcfce7;color:#111827;}
  .cancelled-row{background:#fecaca;color:#111827;}
  .yellow{background:#fef9c3;color:#111827;}
  .red-light{background:#fecaca;color:#111827;}
  .red-mid{background:#fca5a5;color:#111827;}
  .red-dark{background:#7f1d1d;color:#fff;}
  .past-row{background:#374151;color:#e5e7eb;}

  @keyframes blinkTrip{
    0%{opacity:1;}
    50%{opacity:.82;}
    100%{opacity:1;}
  }

  .trip-blink{
    animation:blinkTrip 1.8s infinite;
  }

  @media(max-width:768px){
    .review-table{min-width:1500px;}
    .review-table th,.review-table td{font-size:10px;padding:4px;}
    .btn{font-size:10px;padding:5px 7px;}
    .edit-input{font-size:10px;min-width:85px;}
    .cell-item{font-size:9.5px;padding:3px 4px;}
    .view-line{grid-template-columns:1fr;}
  }`;

  document.head.appendChild(style);
})();

/* ================= STATE ================= */
let activeTab = "TRIPS";
let trips = [];
let COMPANY_SERVICES = [];

const autoApplyingAddStops = new Set();

let SYSTEM_REGION = "";let SYSTEM_COUNTRY = "";
let SYSTEM_TIMEZONE = "America/Phoenix";
let googleLoadPromise = null;

/* ================= HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
}

function passengerIsActive(p){
  const s = cleanStatus(p?.status);

  return (
    !s.includes("no") &&
    !s.includes("cancel") &&
    normalizeText(p?.pickup) &&
    normalizeText(p?.dropoff)
  );
}

function cleanStatus(v){
  return String(v || "")
    .replace(/\s+/g,"")
    .toLowerCase()
    .trim();
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function formatMoney(value){
  return Number(value || 0).toFixed(2);
}
function tripAllowsAddStop(trip, service){

  if(!trip || !service){
    return false;
  }

  if(trip.isShared === true){
    return false;
  }

  const status =
    String(trip.status || "")
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/-/g,"")
      .replace(/_/g,"");

  if(
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  ){
    return false;
  }

  const normalEnabled =
    service.companyAddStopEnabled === true;

  const customEnabled =
    service.companyAddStopCustomTimeEnabled === true;

  if(!normalEnabled && !customEnabled){
    return false;
  }

  const created =
    new Date(
      trip.createdAt ||
      trip.bookedAt ||
      0
    );

  if(created < ADD_STOP_ACTIVE_FROM){
    return false;
  }

  return true;
}

function getTripPrice(t){
  const priceAmount = Number(t.priceAmount || 0);
  const finalPrice = Number(t.finalPrice || 0);
  return priceAmount > 0 ? priceAmount : finalPrice;
}

function getPassengerPrice(p){
  const priceAmount = Number(p.priceAmount || 0);
  const finalPrice = Number(p.finalPrice || 0);
  return priceAmount > 0 ? priceAmount : finalPrice;
}

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{
      timeZone:SYSTEM_TIMEZONE || "America/Phoenix"
    })
  );
}

async function loadSystemRegion(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json();

    SYSTEM_REGION = data?.region || "";
    SYSTEM_COUNTRY = data?.country || "";
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";

  }catch(err){
    console.log(err);
  }
}

function normalizeAddress(address){
  let v = normalizeText(address);
  if(!v) return "";

  v = v.replace(/\s+/g," ").trim();
  const lower = v.toLowerCase();

  if(SYSTEM_REGION && !lower.includes(SYSTEM_REGION.toLowerCase())){
    v += ", " + SYSTEM_REGION;
  }

  if(SYSTEM_COUNTRY && !lower.includes(SYSTEM_COUNTRY.toLowerCase())){
    v += ", " + SYSTEM_COUNTRY;
  }

  return v;
}

function parseTripDateTime(tripDate, tripTime){
  const d = normalizeText(tripDate);
  let t = normalizeText(tripTime);

  if(!d || !t) return null;

  const parts = d.split("-");
  if(parts.length < 3) return null;

  if(/^\d{1,2}:\d{2}$/.test(t)){
    const [hh,mm] = t.split(":");
    const dt = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
      Number(hh),
      Number(mm),
      0
    );

    return isNaN(dt.getTime()) ? null : dt;
  }

  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if(ampm){
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();

    if(ap === "PM" && h < 12) h += 12;
    if(ap === "AM" && h === 12) h = 0;

    const dt = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
      h,
      m,
      0
    );

    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function minutesToTrip(t){
  const dt = parseTripDateTime(t.tripDate, t.tripTime);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}

function validateRequiredTripFields(data){

  const required = [
    "entryName",
    "entryPhone",
    "clientName",
    "clientPhone",
    "pickup",
    "dropoff",
    "tripDate",
    "tripTime"
  ];

  for(const field of required){
    if(!String(data[field] || "").trim()){
      throw new Error(field + " is required");
    }
  }
}

function validateFutureTripDateTime(tripDate,tripTime){

  const tripDT =
    parseTripDateTime(
      tripDate,
      tripTime
    );

  if(!tripDT){
    throw new Error("Invalid date/time");
  }

  const now =
    getAZNow();

  if(tripDT <= now){
    throw new Error("Trip time already passed");
  }
}

function getSharedKey(t){
  return (
    normalizeText(t.groupId) ||
    normalizeText(t.tripNumber) ||
    String(t._id)
  );
}

function getTableDateKey(t){
  return normalizeText(t.tripDate) || (
    t.createdAt
      ? new Date(t.createdAt).toLocaleDateString()
      : "Unknown"
  );
}

function groupItemsByTripDate(items){
  const groups = {};

  items.forEach(item=>{
    const t =
      item.kind === "trip"
        ? item.trip
        : item.group[0];

    const key = getTableDateKey(t);

    if(!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  return groups;
}

function createEditInput(value, field, type="text"){
  return `
    <input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">
  `;
}

function createSharedEditInput(value, field, type="text"){
  return `
    <input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">
  `;
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

function getRealPassengersFromGroup(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length > 0){
    return first.passengers;
  }

  return group.map((t,idx)=>({
    passengerId:"P" + (idx + 1),
    name:t.name || t.clientName || "",
    phone:t.phone || t.clientPhone || "",
    clientName:t.clientName || t.name || "",
    clientPhone:t.clientPhone || t.phone || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled",
    priceAmount:t.priceAmount || 0,
    finalPrice:t.finalPrice || 0
  }));
}

function sortServerSharedPassengers(passengers){
  return [...(Array.isArray(passengers) ? passengers : [])]
    .sort((a,b)=>{

      const aRoute = Number(a.routeOrder || 9999);
      const bRoute = Number(b.routeOrder || 9999);

      if(aRoute !== bRoute){
        return aRoute - bRoute;
      }

      const aPickup = Number(a.pickupOrder || 9999);
      const bPickup = Number(b.pickupOrder || 9999);

      if(aPickup !== bPickup){
        return aPickup - bPickup;
      }

      const aDrop = Number(a.dropoffOrder || 9999);
      const bDrop = Number(b.dropoffOrder || 9999);

      if(aDrop !== bDrop){
        return aDrop - bDrop;
      }

      return String(a.passengerId || "").localeCompare(String(b.passengerId || ""));
    });
}

function getServerSharedPassengers(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return sortServerSharedPassengers(first.passengers);
  }

  return getRealPassengersFromGroup(group);
}

function buildSharedRoutePointsFromPassengers(passengers){
  const list = Array.isArray(passengers) ? passengers : [];
  const active = list.filter(passengerIsActive);

  const pickups = [...active]
    .sort((a,b)=>{
      const ao = Number(a.pickupOrder ?? 9999);
      const bo = Number(b.pickupOrder ?? 9999);
      if(ao !== bo) return ao - bo;
      const ar = Number(a.routeOrder ?? 9999);
      const br = Number(b.routeOrder ?? 9999);
      if(ar !== br) return ar - br;
      return String(a.passengerId || "").localeCompare(String(b.passengerId || ""));
    })
    .map(p=>normalizeAddress(p.pickup))
    .filter(Boolean);

  const dropoffs = [...active]
    .sort((a,b)=>{
      const ao = Number(a.dropoffOrder ?? 9999);
      const bo = Number(b.dropoffOrder ?? 9999);
      if(ao !== bo) return ao - bo;
      const ar = Number(a.routeOrder ?? 9999);
      const br = Number(b.routeOrder ?? 9999);
      if(ar !== br) return ar - br;
      return String(a.passengerId || "").localeCompare(String(b.passengerId || ""));
    })
    .map(p=>normalizeAddress(p.dropoff))
    .filter(Boolean);

  return uniqueAddressList([...pickups, ...dropoffs]);
}

function compactServerRoutePointsFromPlan(routePlan){
  const plan =
    Array.isArray(routePlan)
      ? [...routePlan].sort((a,b)=>Number(a.order || 0) - Number(b.order || 0))
      : [];

  const out = [];
  let lastKey = "";

  plan.forEach(point=>{
    const address = normalizeAddress(point?.address || "");

    if(!address){
      return;
    }

    const key = addressKey(address);

    if(key === lastKey){
      return;
    }

    out.push(address);
    lastKey = key;
  });

  return out;
}

function getServerSharedRoutePoints(group){
  const first = group[0] || {};

  const direct =
    Array.isArray(first.routePoints)
      ? first.routePoints.map(v=>typeof v === "string" ? normalizeAddress(v) : normalizeAddress(v?.address || "")).filter(Boolean)
      : [];

  if(direct.length >= 2){
    return uniqueAddressList(direct);
  }

  const sharedPlan =
    Array.isArray(first.sharedRoutePlan) && first.sharedRoutePlan.length
      ? first.sharedRoutePlan
      : Array.isArray(first.routePlan) && first.routePlan.length
        ? first.routePlan
        : [];

  const fromPlan =
    compactServerRoutePointsFromPlan(sharedPlan);

  if(fromPlan.length >= 2){
    return uniqueAddressList(fromPlan);
  }

  const passengers =
    getServerSharedPassengers(group);

  const fromPassengers =
    buildSharedRoutePointsFromPassengers(passengers);

  if(fromPassengers.length >= 2){
    return fromPassengers;
  }

  return [];
}

/* ================= SERVICES ================= */

async function loadServices(){
  try{

    COMPANY_SERVICES = [];

    const facilityId =
      localStorage.getItem("facilityId") ||
      localStorage.getItem("companyId") ||
      localStorage.getItem("userId") ||
      localStorage.getItem("_id") ||
      localStorage.getItem("id") ||
      "";

    const facilityName =
      localStorage.getItem("facilityName") ||
      localStorage.getItem("companyName") ||
      localStorage.getItem("name") ||
      companyName ||
      "";

    console.log("LOAD SERVICES FACILITY CHECK:", {
      facilityId,
      facilityName
    });

    let override = null;

    /* =========================
       1) TRY FACILITY OVERRIDE BY ID
    ========================= */

    if(facilityId){

      const overrideRes = await fetch(
        "/api/facility-pricing-override/" + encodeURIComponent(facilityId),
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

      const overrideData =
        await overrideRes.json().catch(()=>({}));

      console.log("FACILITY OVERRIDE BY ID RESPONSE:", overrideData);

      if(overrideRes.ok){
        override =
          overrideData?.override || null;
      }
    }

    /* =========================
       2) TRY FACILITY OVERRIDE BY NAME
    ========================= */

    if(!override && facilityName){

      const bootRes = await fetch("/api/facility-pricing-override/bootstrap",{
        headers:{
          Authorization:"Bearer " + token
        }
      });

      const bootData =
        await bootRes.json().catch(()=>({}));

      console.log("FACILITY BOOTSTRAP RESPONSE:", bootData);

      if(bootRes.ok){

        const nameLower =
          String(facilityName).trim().toLowerCase();

        override =
          Array.isArray(bootData.overrides)
            ? bootData.overrides.find(o =>
                String(o.facilityName || "").trim().toLowerCase() === nameLower
              )
            : null;
      }
    }

    /* =========================
       3) USE ACTIVE FACILITY OVERRIDE
    ========================= */

    if(
      override &&
      override.active === true &&
      Array.isArray(override.services) &&
      override.services.length
    ){

      COMPANY_SERVICES =
        override.services.map(s=>{

          const serviceKey =
            String(s.serviceKey || "").trim().toUpperCase();

          const serviceName =
            s.serviceName ||
            s.title ||
            s.name ||
            serviceKey;

          const serviceSuffix =
            s.serviceSuffix ||
            s.companySuffix ||
            s.suffix ||
            serviceKey;

          return {

            ...s,

            _id:
              s._id || serviceKey,

            title:
              serviceName,

            name:
              serviceName,

            serviceName:
              serviceName,

            serviceKey:
              serviceKey,

            serviceCode:
              serviceKey,

            code:
              serviceKey,

            companySuffix:
              serviceSuffix,

            suffix:
              serviceSuffix,

            companyShared:
              s.shared === true,

            shared:
              s.shared === true,

            companyPricingMode:
              s.pricingMode,

            companyBaseFare:
              Number(s.baseFare || 0),

            companyIncludedMiles:
              Number(s.includedMiles || 0),

            companyPerMile:
              Number(s.perMile || 0),

            companyHourlyRate:
              Number(s.hourlyRate || 0),

            companyHourlyBillingMode:
              s.hourlyBillingMode || "FULL",

            companyStopFee:
              Number(s.stopFee || 0),

            companyNoShowFee:
              Number(s.noShowFee || 0),

            companySharedPrice:
              Number(s.sharedPrice || 0),

            companyDisableCancel:
              s.disableCancel === true,

            companyWarningMinutes:
              Number(s.warningMinutes || 0),

            companyCancelFee:
              Number(s.cancelFee || 0),

            companyAddStopEnabled:
              s.addStopEnabled === true,

            companyAddStopCustomTimeEnabled:
              s.addStopCustomTimeEnabled === true,

            companyAddStopCutoffMinutes:
              Number(s.addStopCutoffMinutes || 0),

            __pricingSource:
              "FACILITY_OVERRIDE"
          };
        });

      console.log(
        "COMPANY SERVICES FROM FACILITY OVERRIDE:",
        COMPANY_SERVICES
      );

      return;
    }

    /* =========================
       4) FALLBACK ONLY
    ========================= */

    console.warn(
      "NO ACTIVE FACILITY OVERRIDE FOUND. FALLING BACK TO SERVICE MANAGEMENT.",
      override
    );

    const serviceRes = await fetch("/api/services?company=true",{
      headers:{
        Authorization:"Bearer " + token
      }
    });

    if(!serviceRes.ok){
      COMPANY_SERVICES = [];
      return;
    }

    const data =
      await serviceRes.json().catch(()=>[]);

    COMPANY_SERVICES =
      Array.isArray(data)
        ? data.map(s=>({
            ...s,
            __pricingSource:"SERVICE_MANAGEMENT"
          }))
        : [];

    console.log(
      "COMPANY SERVICES FROM SERVICE MANAGEMENT:",
      COMPANY_SERVICES
    );

  }catch(err){

    console.log("LOAD SERVICES ERROR:", err);

    COMPANY_SERVICES = [];
  }
}
function getServiceCodeFromTrip(trip){
  const direct = normalizeText(
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.serviceSuffix ||
    trip.vehicle ||
    ""
  ).toUpperCase();

  if(direct) return direct;

  const parts = String(trip.tripNumber || "").split("-");
  return normalizeText(parts[parts.length - 1] || "").toUpperCase();
}

function isSharedService(service){
  if(!service) return false;

  return (
    service.companyShared === true ||
    service.shared === true ||
    String(service.type || "").toUpperCase() === "SHARED" ||
    String(service.serviceType || "").toUpperCase() === "SHARED" ||
    String(service.title || service.name || "").toUpperCase() === "SHARED" ||
    String(service.serviceKey || "").toUpperCase() === "SHARED" ||
    String(service.companySuffix || service.suffix || "").toUpperCase() === "SH"
  );
}

function getServiceByTrip(trip){
  if(!trip) return null;

  const tripServiceId =
    normalizeText(trip.serviceId || "");

  if(tripServiceId){
    const byId =
      COMPANY_SERVICES.find(s =>
        String(s._id) === String(tripServiceId)
      );

    if(byId) return byId;
  }

  const code =
    getServiceCodeFromTrip(trip);

  const tripType =
    normalizeText(
      trip.tripType ||
      trip.type ||
      ""
    ).toUpperCase();

  /*
    Shared الحقيقي فقط
    ممنوع passengers لوحدها تعتبر الرحلة Shared
  */
  if(
    trip.isShared === true ||
    tripType === "SHARED" ||
    String(trip.tripNumber || "").toUpperCase().includes("-SH") ||
    code === "SH" ||
    code === "SHARED"
  ){
    return COMPANY_SERVICES.find(s=>isSharedService(s)) || null;
  }

  return COMPANY_SERVICES.find(s=>{

    const key =
      normalizeText(s.serviceKey).toUpperCase();

    const suffix =
      normalizeText(s.companySuffix || s.suffix).toUpperCase();

    const serviceCode =
      normalizeText(s.serviceCode || s.code).toUpperCase();

    const title =
      normalizeText(s.title || s.name).toUpperCase();

    return (
      key === code ||
      suffix === code ||
      serviceCode === code ||
      title === code ||
      (code === "WH" && key === "WHEELCHAIR") ||
      (code === "WC" && key === "WHEELCHAIR")
    );

  }) || null;
}


function getServiceTitleForTrip(trip){
  const service = getServiceByTrip(trip);
  return service?.name || service?.title || trip?.serviceType || trip?.serviceName || "--";
}

function isSharedTrip(t){

  if(!t) return false;

  const tripType =
    String(t.tripType || t.type || "").toUpperCase();

  const tripNumber =
    String(t.tripNumber || "").toUpperCase();

  const serviceCode =
    getServiceCodeFromTrip(t);

  const service =
    getServiceByTrip(t);

  /*
    مهم:
    passengers array لوحدها مش معناها Shared
    لأن الرحلة الفردي ممكن تتحفظ بجواها passenger واحد
  */

  return (
    t.isShared === true ||
    tripType === "SHARED" ||
    tripNumber.includes("-SH") ||
    serviceCode === "SH" ||
    serviceCode === "SHARED" ||
    isSharedService(service)
  );
}

function sharedEnabled(){
  const hasSharedTrips = trips.some(t=>isSharedTrip(t));
  const hasSharedService = COMPANY_SERVICES.some(s=>isSharedService(s));

  return hasSharedTrips || hasSharedService;
}
function getActiveAddStopRequest(trip){

  const req =
    trip?.addStopRequest || null;

  if(!req){
    return null;
  }

  const status =
    String(req.status || "").toUpperCase();

  if(
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_COMPANY",
      "CANCELLED_BY_CUSTOMER",
      "COMPLETED",
      "REJECTED"
    ].includes(status)
  ){
    return req;
  }

  return null;
}

function getAppliedAddStopRequest(trip){

  const req =
    trip?.addStopRequest || null;

  if(!req){
    return null;
  }

  const status =
    String(req.status || "").toUpperCase();

  if(
    req.appliedAutomatically === true &&
    status === "COMPLETED"
  ){
    return req;
  }

  return null;
}

function getVisibleAddStopRequest(trip){

  return (
    getActiveAddStopRequest(trip) ||
    getAppliedAddStopRequest(trip)
  );
}

function hasActiveAddStopRequest(trip){

  return !!getVisibleAddStopRequest(trip);

}
function getConfirmPickup(trip){

  const req =
    getVisibleAddStopRequest(trip);

  return (
    req?.pickup ||
    trip?.pickup ||
    ""
  );
}

function getConfirmStops(trip){

  const req =
    getActiveAddStopRequest(trip);

  if(
    req &&
    Array.isArray(req.finalStops)
  ){
    return req.finalStops
      .map(s => normalizeAddress(s))
      .filter(Boolean);
  }

  return Array.isArray(trip?.stops)
    ? trip.stops
        .map(s => normalizeAddress(s))
        .filter(Boolean)
    : [];
}

function getConfirmDropoff(trip){

  const req =
    getActiveAddStopRequest(trip);

  return (
    req?.dropoffAfter ||
    trip?.dropoff ||
    ""
  );
}

function getStopRequestBadge(trip){

  const req =
    getActiveAddStopRequest(trip);

  if(!req) return "";

  const added =
    Array.isArray(req.addedStops)
      ? req.addedStops.length
      : 0;

  return `
    <div class="route-locked-badge">
      Stop Request Pending${added ? " • " + added + " Stop" + (added === 1 ? "" : "s") : ""}
    </div>
  `;
}

function serviceAllowsAddStop(trip){

  if(isSharedTrip(trip)){
    return false;
  }

  const service =
    getServiceByTrip(trip);

  if(!service){
    return false;
  }

  if(!tripAllowsAddStop(trip, service)){
    return false;
  }

  const normalEnabled =
    service.companyAddStopEnabled === true;

  const customTime =
    service.companyAddStopCustomTimeEnabled === true;

  /* Normal Add Stop wins and stays active until the trip is closed. */
  if(normalEnabled){
    return true;
  }

  if(!customTime){
    return false;
  }

  const mins =
    minutesToTrip(trip);

  if(mins === null){
    return true;
  }

  const cutoff =
    Number(service.companyAddStopCutoffMinutes || 0);

  if(cutoff <= 0){
    return mins >= 0;
  }

  return mins >= cutoff;
}

function renderAddStopButton(trip){

  if(isSharedTrip(trip)){
    return "";
  }

  if(hasActiveAddStopRequest(trip)){
    return `
      <button class="btn cancel" data-action="cancel-stop">
        Cancel Stop
      </button>
    `;
  }

  if(!serviceAllowsAddStop(trip)){
    return "";
  }

  return `
    <button class="btn add-stop" data-action="add-stop">
      Add Stop
    </button>
  `;
}
function getWarningMinutes(service){
  return Number(service?.companyWarningMinutes ?? service?.warningMinutes ?? 120);
}

function warningEnabled(service){
  const disabled =
    service?.companyDisableCancel === true ||
    service?.disableCancel === true;

  return !disabled;
}

/* ================= SERVER PRICING ================= */

async function calculateServerPrice({
  serviceKey,
  miles,
  stops,
  minutes,
  passengerCount,

  company,
  companyName,
  facility,
  facilityName,

  facilityId,
  companyId,
  userId,

  isCompany
}) {

  const resolvedFacilityName =
    normalizeText(
      facilityName ||
      companyName ||
      facility ||
      company ||
      localStorage.getItem("facilityName") ||
      localStorage.getItem("companyName") ||
      localStorage.getItem("name") ||
      ""
    );

  const resolvedFacilityId =
    normalizeText(
      facilityId ||
      companyId ||
      userId ||
      localStorage.getItem("facilityId") ||
      localStorage.getItem("companyId") ||
      localStorage.getItem("userId") ||
      localStorage.getItem("_id") ||
      localStorage.getItem("id") ||
      ""
    );

  const body = {
    serviceKey,
    miles:Number(miles || 0),
    stops:Number(stops || 0),
    minutes:Number(minutes || 0),
    passengersCount:Number(passengerCount || 1),
    passengerCount:Number(passengerCount || 1),

    isCompany:isCompany !== false,

    facilityId:resolvedFacilityId,
    companyId:resolvedFacilityId,
    userId:resolvedFacilityId,

    facilityName:resolvedFacilityName,
    companyName:resolvedFacilityName,
    company:resolvedFacilityName,
    facility:resolvedFacilityName
  };

  console.log("PRICE REQUEST BODY:", body);

  const res = await fetch(
    "/api/company-core/calculate",
    {
      method:"POST",

      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },

      body:JSON.stringify(body)
    }
  );

  const data =
    await res.json().catch(() => ({}));

  console.log("PRICE RESPONSE:", data);

  if(!res.ok || data.success === false){
    throw new Error(
      data.message ||
      "Pricing failed"
    );
  }

  return Number(data.total || 0);
}

/* ================= GOOGLE ================= */

function normalizeUniqueAddress(address){
  return normalizeAddress(address);
}

function addressKey(address){
  return normalizeUniqueAddress(address)
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}

function pushUnique(arr,value){
  const v = normalizeUniqueAddress(value);
  if(!v) return;

  const exists = arr.some(x =>
    String(x).toLowerCase() === String(v).toLowerCase()
  );

  if(!exists) arr.push(v);
}

function uniqueAddressList(list){
  const out = [];
  const seen = new Set();

  list.forEach(address=>{
    const v = normalizeUniqueAddress(address);
    if(!v) return;

    const key = addressKey(v);
    if(seen.has(key)) return;

    seen.add(key);
    out.push(v);
  });

  return out;
}

async function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.DirectionsService){
    return;
  }

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async (resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json();

      if(!data.googleKey){
        reject(new Error("Google key missing"));
        return;
      }

      const existing =
        document.querySelector("script[data-google-maps='true']");

      if(existing){
        if(window.google && google.maps && google.maps.DirectionsService){
          resolve();
          return;
        }

        existing.addEventListener("load",()=>resolve());
        existing.addEventListener("error",()=>reject(new Error("Google failed")));
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;
      script.defer = true;
      script.setAttribute("data-google-maps","true");
      script.onload = ()=>resolve();
      script.onerror = ()=>reject(new Error("Google failed"));

      document.head.appendChild(script);

    }catch(err){
      reject(err);
    }
  });

  return googleLoadPromise;
}

async function getDrivingMetersBetween(origin,destination){
  await ensureGoogleLoaded();

  return new Promise((resolve)=>{
    const service = new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        travelMode:google.maps.TravelMode.DRIVING,
        unitSystem:google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){
        if(status !== "OK" || !response?.routes?.[0]){
          resolve(Number.MAX_SAFE_INTEGER);
          return;
        }

        let meters = 0;

        response.routes[0].legs.forEach(leg=>{
          meters += leg.distance ? leg.distance.value : 0;
        });

        resolve(meters);
      }
    );
  });
}

async function calculateRouteMiles(points){
  await ensureGoogleLoaded();

  const cleanPoints = Array.isArray(points)
    ? points.map(p => normalizeUniqueAddress(p)).filter(Boolean)
    : [];

  if(cleanPoints.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };
  }

  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const middle = cleanPoints.slice(1,-1);

  const waypoints = middle.map(address=>({
    location:address,
    stopover:true
  }));

  return new Promise((resolve,reject)=>{
    const service = new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints:false,
        travelMode:google.maps.TravelMode.DRIVING,
        unitSystem:google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){
        if(status !== "OK" || !response?.routes?.[0]){
          reject(new Error("Google route failed: " + status));
          return;
        }

        const route = response.routes[0];
        let meters = 0;
        let seconds = 0;

        route.legs.forEach(leg=>{
          meters += leg.distance ? leg.distance.value : 0;
          seconds += leg.duration ? leg.duration.value : 0;
        });

        resolve({
          miles:Number((meters * 0.000621371).toFixed(2)),
          distanceMeters:meters,
          durationSeconds:seconds,
          estimatedMinutes:Math.ceil(seconds / 60),
          googleRoute:{
            summary:route.summary || "",
            waypointOrder:route.waypoint_order || [],
            legs:route.legs.map((leg,index)=>({
              legIndex:index,
              startAddress:leg.start_address,
              endAddress:leg.end_address,
              distanceText:leg.distance ? leg.distance.text : "",
              distanceMeters:leg.distance ? leg.distance.value : 0,
              durationText:leg.duration ? leg.duration.text : "",
              durationSeconds:leg.duration ? leg.duration.value : 0
            }))
          }
        });
      }
    );
  });
}

/* ================= ROUTE POINTS ================= */

function buildIndividualRoutePoints(trip){

  const points = [];

  const pickup =
    getConfirmPickup(trip);

  const stops =
    getConfirmStops(trip);

  const dropoff =
    getConfirmDropoff(trip);

  if(pickup){
    points.push(pickup);
  }

  stops.forEach(s=>{
    if(normalizeText(s)){
      points.push(s);
    }
  });

  if(dropoff){
    points.push(dropoff);
  }

  return points;
}
function getServerSharedRoutePlan(group){
  const first = group?.[0] || {};

  if(Array.isArray(first.sharedRoutePlan) && first.sharedRoutePlan.length){
    return [...first.sharedRoutePlan].sort((a,b)=>
      Number(a.order || 0) - Number(b.order || 0)
    );
  }

  if(Array.isArray(first.routePlan) && first.routePlan.length){
    return [...first.routePlan].sort((a,b)=>
      Number(a.order || 0) - Number(b.order || 0)
    );
  }

  return [];
}

/*
  IMPORTANT:
  Company Review must NOT build shared route locally.
  Shared order / route must come from server only,
  exactly like Dispatch Add Trip confirm flow.
*/
async function optimizeStopsFromOrigin(origin,stops){
  const orderedStops =
    uniqueAddressList(
      Array.isArray(stops) ? stops : []
    );

  return [
    normalizeUniqueAddress(origin)
  ].filter(Boolean).concat(orderedStops);
}

async function buildFinalSharedRoute(group){

  const passengers =
    getServerSharedPassengers(group);

  const routePlan =
    getServerSharedRoutePlan(group);

  const routePoints =
    getServerSharedRoutePoints(group);

  const activePassengers =
    passengers.filter(passengerIsActive);

  return {
    routePoints,
    routePlan,
    passengers,
    activePassengers,
    activeCount:activePassengers.length
  };
}

async function buildSharedRoutePoints(group){
  return getServerSharedRoutePoints(group);
}

/* ================= SERVER ================= */

async function fetchTrips(){
  let list = [];

  const url = companyName
    ? "/api/trips/company/" + encodeURIComponent(companyName)
    : "/api/trips/company";

  const res = await fetch(url,{
    headers:{
      Authorization:"Bearer " + token
    }
  });

  if(res.ok){
    list = await res.json();
  }

  if((!Array.isArray(list) || list.length === 0) && companyName){
    const allRes = await fetch("/api/trips/company",{
      headers:{
        Authorization:"Bearer " + token
      }
    });

    if(allRes.ok){
      const all = await allRes.json();

      list = Array.isArray(all)
        ? all.filter(t =>
            String(t.company || "").trim().toLowerCase() ===
            String(companyName).trim().toLowerCase()
          )
        : [];
    }
  }

  if(!Array.isArray(list)){
    return [];
  }

  return list;
}

async function updateTrip(id,payload){
  const res = await fetch("/api/trips/" + id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || "Update failed");
  }

  return await res.json().catch(()=>null);
}

/* Reserved confirm endpoint removed from Company Review. */

async function confirmCompanySharedOnServer(id){
  const res = await fetch(
    "/api/company-review/confirm-shared/" + encodeURIComponent(id),
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      }
    }
  );

  const data = await res.json().catch(()=>({}));

  console.log("COMPANY SHARED CONFIRM RESPONSE:", data);

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Company shared confirm failed");
  }

  return data.trip || data.data || data;
}

async function deleteTrip(id){
  const res = await fetch("/api/trips/" + id,{
    method:"DELETE",
    headers:{
      Authorization:"Bearer " + token
    }
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || "Delete failed");
  }
}

/* ================= FILTERS ================= */

function isHiddenStatus(status){
  const s = cleanStatus(status);

  return (
    s.includes("complete") ||
    s.includes("cancel") ||
    s.includes("noshow") ||
    s === "no"
  );
}

function getTripsTabData(){
  return trips
    .filter(t=>{
      if(isSharedTrip(t)) return false;
      return !isHiddenStatus(t.status);
    })
    .sort((a,b)=>{
      const da = new Date(a.tripDate || a.createdAt || 0);
      const db = new Date(b.tripDate || b.createdAt || 0);
      return db - da;
    });
}

function getSharedGroups(){
  const map = {};

  trips.filter(t=>{
    if(!isSharedTrip(t)) return false;
    return !isHiddenStatus(t.status);
  }).forEach(t=>{
    const key = getSharedKey(t);

    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map).map(group=>{
    return group.sort((a,b)=>
      Number(a.passengerIndex || 0) -
      Number(b.passengerIndex || 0)
    );
  }).sort((a,b)=>{
    const da = new Date(a[0]?.tripDate || a[0]?.createdAt || 0);
    const db = new Date(b[0]?.tripDate || b[0]?.createdAt || 0);
    return db - da;
  });
}

/* ================= VIEW MODAL ================= */

function viewLine(label,value){
  return `
    <div class="view-line">
      <div class="view-label">${escapeHtml(label)}</div>
      <div class="view-value">${escapeHtml(value || "--")}</div>
    </div>
  `;
}

function getBookedDate(t){
  const d =
    t?.bookedAt ||
    t?.createdAt ||
    t?.updatedAt ||
    "";

  if(!d) return "--";

  const date = new Date(d);
  if(isNaN(date)) return String(d);

  return date.toLocaleDateString() + " " + date.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });
}

function openReviewView(kind,key){

  let trip = null;
  let group = null;

  if(kind === "trip"){
    trip = trips.find(t => String(t._id) === String(key));
  }

  if(kind === "shared"){
    group = getSharedGroups().find(g => getSharedKey(g[0]) === key);
    trip = group?.[0] || null;
  }

  if(!trip) return;

  const service = getServiceByTrip(trip);

  closeReviewView();

  const overlay = document.createElement("div");
  overlay.id = "reviewViewOverlay";
  overlay.className = "view-overlay";

  overlay.innerHTML = `
    <div class="view-box">
      <div class="view-head">
        <div>Trip Details</div>
        <button class="view-close" type="button" onclick="closeReviewView()">×</button>
      </div>

      <div class="view-body">
        ${viewLine("Trip Number",trip.tripNumber || "")}
        ${viewLine("Service",service?.name || service?.title || trip.serviceType || trip.serviceName || "")}
        ${viewLine("Entry Name",trip.entryName || "")}
        ${viewLine("Entry Phone",trip.entryPhone || "")}
        ${viewLine("Company",trip.company || companyName || "")}
        ${viewLine("Trip Date",trip.tripDate || "")}
        ${viewLine("Trip Time",trip.tripTime || "")}
        ${viewLine("Booked / Created",getBookedDate(trip))}
        ${viewLine("Route Locked",trip.routeLocked === true ? "Yes" : "No")}
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

/* ================= RENDER ================= */

function renderTabs(){
  const tabs = document.createElement("div");
  tabs.className = "review-tabs";

  if(activeTab === "SHARED" && !sharedEnabled()){
    activeTab = "TRIPS";
  }

  tabs.innerHTML = `
    <button id="reviewTripsTab" class="${activeTab === "TRIPS" ? "tab-active" : "tab-inactive"}" type="button">
      Trips
    </button>
    ${
      sharedEnabled()
      ? `<button id="reviewSharedTab" class="${activeTab === "SHARED" ? "tab-active" : "tab-inactive"}" type="button">Shared</button>`
      : ""
    }
  `;

  container.appendChild(tabs);

  document.getElementById("reviewTripsTab")?.addEventListener("click",()=>{
    activeTab = "TRIPS";
    render();
  });

  document.getElementById("reviewSharedTab")?.addEventListener("click",()=>{
    activeTab = "SHARED";
    render();
  });
}

function applyRowColor(tr,t){
  const mins = minutesToTrip(t);
  const status = cleanStatus(t.status);

  if(status.includes("cancel")){
    tr.classList.add("cancelled-row");
    return;
  }

  if(mins !== null && mins <= 0){
    tr.classList.add("past-row");
    return;
  }

  if(mins !== null){
    if(mins <= 30){
      tr.classList.add("red-dark");
      if(status.includes("confirm")) tr.classList.add("trip-blink");
    }else if(mins <= 60){
      tr.classList.add("red-mid");
      if(status.includes("confirm")) tr.classList.add("trip-blink");
    }else if(mins <= 120){
      tr.classList.add("red-light");
    }else if(mins <= 180){
      tr.classList.add("yellow");
    }else if(status.includes("confirm")){
      tr.classList.add("confirmed-row");
    }else{
      tr.classList.add("scheduled-row");
    }
  }
}

function renderTripButtons(t,editing){
  const service = getServiceByTrip(t);
  const mins = minutesToTrip(t);
  const warningMinutes = warningEnabled(service) ? getWarningMinutes(service) : 0;
  const status = cleanStatus(t.status);

  if(editing){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-trip">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  const stopBtn = renderAddStopButton(t);

  if(status.includes("cancel")){
    return `
      <div class="actions-wrap">
        ${stopBtn}
      </div>
    `;
  }

  if(mins > warningMinutes || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-trip">Edit</button>
        <button class="btn delete" data-action="delete-trip">Delete</button>
        <button class="btn confirm" data-action="confirm-trip">Confirm</button>
        ${stopBtn}
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && !status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="confirm-trip">Confirm</button>
        <button class="btn delete" data-action="delete-trip">Delete</button>
        ${stopBtn}
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn cancel" data-action="cancel-trip">Cancel</button>
        ${stopBtn}
      </div>
    `;
  }

  return `
    <div class="actions-wrap">
      ${stopBtn}
    </div>
  `;
}

function getGroupStatus(group){
  if(group.every(t=>cleanStatus(t.status).includes("cancel"))) return "Cancelled";
  if(group.every(t=>cleanStatus(t.status).includes("confirm"))) return "Confirmed";
  if(group.some(t=>cleanStatus(t.status).includes("confirm"))) return "Partially Confirmed";
  return group[0]?.status || "Scheduled";
}

function getGroupPrice(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    const passengerTotal = first.passengers.reduce((sum,p)=>{
      return sum + getPassengerPrice(p);
    },0);

    if(passengerTotal > 0) return passengerTotal;
  }

  return Number(first.priceAmount || first.finalPrice || 0);
}

function renderSharedButtons(group,editing){

  const first = group[0];
  const service = getServiceByTrip(first);
  const mins = minutesToTrip(first);

  const warningMinutes =
    warningEnabled(service)
      ? getWarningMinutes(service)
      : 0;

  const status =
    cleanStatus(
      getGroupStatus(group)
    );

  if(editing){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-shared">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(status.includes("cancel")) return "";

  if(mins > warningMinutes || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-shared">Edit</button>
        <button class="btn delete" data-action="delete-shared">Delete</button>
        <button class="btn confirm" data-action="confirm-shared">Confirm</button>
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && !status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="confirm-shared">Confirm</button>
        <button class="btn delete" data-action="delete-shared">Delete</button>
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn cancel" data-action="cancel-shared">Cancel</button>
      </div>
    `;
  }

  return "";
}

function renderTripRow(t,index){
  const tr = document.createElement("tr");
  tr.dataset.id = t._id;

  const editing = t.__editing === true;
const stops =
  getConfirmStops(t);

const reviewPickup =
  getConfirmPickup(t);

const reviewDropoff =
  getConfirmDropoff(t);

const stopRequestBadge =
  getStopRequestBadge(t);
  applyRowColor(tr,t);

  tr.innerHTML = `
    <td class="col-num">${index}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${escapeHtml(t.tripNumber || "")}</span>
      ${
        t.routeLocked === true
        ? `<div class="route-locked-badge">Route Locked</div>`
        : ""
      }

${stopRequestBadge}
    </td>

    <td class="col-client">
      ${editing ? createEditInput(t.clientName || "", "clientName") : cellBox(escapeHtml(t.clientName || "--"))}
    </td>

    <td class="col-phone">
      ${editing ? createEditInput(t.clientPhone || "", "clientPhone") : cellBox(escapeHtml(t.clientPhone || "--"))}
    </td>

    <td class="col-pickup">
      ${editing ? createEditInput(reviewPickup || "", "pickup") : cellBox(escapeHtml(reviewPickup || "--"))}
    </td>

    <td class="col-stops">
      ${
        editing
        ? stops.map((s,si)=>`<input class="edit-input" data-stop-index="${si}" value="${escapeHtml(s)}">`).join("")
        : cellBox(stops.length ? stops.map(s=>escapeHtml(s)) : "--")
      }
    </td>

    <td class="col-drop">
      ${editing ? createEditInput(reviewDropoff || "", "dropoff") : cellBox(escapeHtml(reviewDropoff || "--"))}
    </td>

    <td class="col-notes">
      ${editing ? createEditInput(t.notes || "", "notes") : cellBox(escapeHtml(t.notes || "--"))}
    </td>

    <td class="col-date">${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : escapeHtml(t.tripDate || "")}</td>

    <td class="col-time">${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : escapeHtml(t.tripTime || "")}</td>

    <td class="col-status"><strong>${escapeHtml(t.status || "Scheduled")}</strong></td>

    <td class="col-price"><span class="price-badge">$${formatMoney(getTripPrice(t))}</span></td>

    <td class="col-miles"><span class="miles-strong">${t.miles ? Number(t.miles).toFixed(1) + " mi" : "-- mi"}</span></td>

    <td class="col-actions">${renderTripButtons(t,editing)}</td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" data-action="view-trip">👁️</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(group,index){
  const first = group[0];
  const tr = document.createElement("tr");
  tr.dataset.groupId = getSharedKey(first);

  const editing = first.__editing === true;
  const passengers = getServerSharedPassengers(group);

  applyRowColor(tr,first);

  let clients = "";
  let phones = "";
  let pickups = "";
  let drops = "";

  if(editing){
    clients = passengers.map((p,idx)=>
      createSharedEditInput(p.name || p.clientName || "", `passenger_${idx}_name`)
    ).join("");

    phones = passengers.map((p,idx)=>
      createSharedEditInput(p.phone || p.clientPhone || "", `passenger_${idx}_phone`)
    ).join("");

    pickups = passengers.map((p,idx)=>
      createSharedEditInput(p.pickup || "", `passenger_${idx}_pickup`)
    ).join("");

    drops = passengers.map((p,idx)=>
      createSharedEditInput(p.dropoff || "", `passenger_${idx}_dropoff`)
    ).join("");
  }else{
    const sharedPlan =
      getServerSharedRoutePlan(group);

    const sharedPickupRoute =
      sharedPlan
        .filter(point=>{
          return String(point.type || "").toLowerCase() === "pickup";
        })
        .map(point=>point.address)
        .filter(Boolean);

    const sharedDropRoute =
      sharedPlan
        .filter(point=>{
          return String(point.type || "").toLowerCase() === "dropoff";
        })
        .map(point=>point.address)
        .filter(Boolean);

    clients = cellBox(passengers.map((p,idx)=>
      `${idx+1}. ${escapeHtml(p.name || p.clientName || "--")}`
    ));

    phones = cellBox(passengers.map((p,idx)=>
      `${idx+1}. ${escapeHtml(p.phone || p.clientPhone || "--")}`
    ));

    pickups = cellBox(
      sharedPickupRoute.length
        ? sharedPickupRoute.map((address,idx)=>
            `${idx+1}. ${escapeHtml(address || "--")}`
          )
        : passengers.map((p,idx)=>
            `${idx+1}. ${escapeHtml(p.pickup || "--")}`
          )
    );

    drops = cellBox(
      sharedDropRoute.length
        ? sharedDropRoute.map((address,idx)=>
            `${idx+1}. ${escapeHtml(address || "--")}`
          )
        : passengers.map((p,idx)=>
            `${idx+1}. ${escapeHtml(p.dropoff || "--")}`
          )
    );
  }

  tr.innerHTML = `
    <td class="col-num">${index}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${escapeHtml(first.tripNumber || "")}</span>
      ${
        first.routeLocked === true
        ? `<div class="route-locked-badge">Route Locked</div>`
        : ""
      }
    </td>

    <td class="col-client">
      ${editing ? `<div class="multi-line">${clients}</div>` : clients}
    </td>

    <td class="col-phone">
      ${editing ? `<div class="multi-line">${phones}</div>` : phones}
    </td>

    <td class="col-pickup">
      ${editing ? `<div class="multi-line">${pickups}</div>` : pickups}
    </td>

    <td class="col-stops">
      <strong>${Number(first.sharedStopsCount || Math.max(0,passengers.filter(passengerIsActive).length - 1))}</strong>
    </td>

    <td class="col-drop">
      ${editing ? `<div class="multi-line">${drops}</div>` : drops}
    </td>

    <td class="col-notes">
      ${editing ? createSharedEditInput(first.notes || "", "notes") : cellBox(escapeHtml(first.notes || "--"))}
    </td>

    <td class="col-date">${editing ? createSharedEditInput(first.tripDate || "", "tripDate", "date") : escapeHtml(first.tripDate || "")}</td>

    <td class="col-time">${editing ? createSharedEditInput(first.tripTime || "", "tripTime", "time") : escapeHtml(first.tripTime || "")}</td>

    <td class="col-status"><strong>${escapeHtml(getGroupStatus(group))}</strong></td>

    <td class="col-price"><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td>

    <td class="col-miles"><span class="miles-strong">${first.miles ? Number(first.miles).toFixed(1) + " mi" : "-- mi"}</span></td>

    <td class="col-actions">${renderSharedButtons(group,editing)}</td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" data-action="view-shared">👁️</button>
    </td>
  `;

  return tr;
}

function renderUnifiedTable(items,kind){

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "review-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-trip">Trip#</th>
        <th class="col-client">${kind === "shared" ? "Clients" : "Client"}</th>
        <th class="col-phone">${kind === "shared" ? "Phones" : "Phone"}</th>
        <th class="col-pickup">${kind === "shared" ? "Pickups" : "Pickup"}</th>
        <th class="col-stops">Stops</th>
        <th class="col-drop">${kind === "shared" ? "Drops" : "Drop"}</th>
        <th class="col-notes">Notes</th>
        <th class="col-date">Date</th>
        <th class="col-time">Time</th>
        <th class="col-status">Status</th>
        <th class="col-price">Price</th>
        <th class="col-miles">Miles</th>
        <th class="col-actions">Actions</th>
        <th class="col-eye">👁️</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  const grouped = groupItemsByTripDate(items);

  let counter = 1;

  Object.keys(grouped)
    .sort((a,b)=>{
      if(a === "Unknown") return 1;
      if(b === "Unknown") return -1;
      return new Date(b) - new Date(a);
    })
    .forEach(date=>{
      const dateRow = document.createElement("tr");
      dateRow.className = "date-row";
      dateRow.innerHTML = `<td colspan="15">Trip Date: ${escapeHtml(date)}</td>`;
      tbody.appendChild(dateRow);

      grouped[date].forEach(item=>{
        if(item.kind === "trip"){
          tbody.appendChild(renderTripRow(item.trip,counter++));
        }else{
          tbody.appendChild(renderSharedRow(item.group,counter++));
        }
      });
    });

  tableWrap.appendChild(table);
  container.appendChild(tableWrap);
}

function renderTripsTable(list){

  const items = list.map(t=>({
    kind:"trip",
    trip:t
  }));

  if(!items.length){
    const empty = document.createElement("div");
    empty.style.padding = "20px";
    empty.style.fontWeight = "700";
    empty.innerText = "No trips found.";
    container.appendChild(empty);
    return;
  }

  renderUnifiedTable(items,"trip");
}

function renderSharedTable(groups){

  const items = groups.map(group=>({
    kind:"shared",
    group
  }));

  if(!items.length){
    const empty = document.createElement("div");
    empty.style.padding = "20px";
    empty.style.fontWeight = "700";
    empty.innerText = "No shared trips found.";
    container.appendChild(empty);
    return;
  }

  renderUnifiedTable(items,"shared");
}

function render(){
  container.innerHTML = "";
  renderTabs();

  if(activeTab === "TRIPS"){
    renderTripsTable(getTripsTabData());
  }

  if(activeTab === "SHARED"){
    renderSharedTable(getSharedGroups());
  }
}


function normRouteAddressOnly(v){
  return normalizeAddress(v || "")
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}

function normalizeStopsForSignature(stops){
  return (Array.isArray(stops) ? stops : [])
    .map(normRouteAddressOnly)
    .filter(Boolean);
}

function buildIndividualRouteSignatureForEdit(trip,nextPayload = {},nextStops = null){
  return JSON.stringify({
    pickup:normRouteAddressOnly(nextPayload.pickup ?? trip.pickup),
    stops:Array.isArray(nextStops)
      ? normalizeStopsForSignature(nextStops)
      : normalizeStopsForSignature(trip.stops),
    dropoff:normRouteAddressOnly(nextPayload.dropoff ?? trip.dropoff)
  });
}

function buildSharedRouteSignatureForEdit(passengers){
  return JSON.stringify(
    (Array.isArray(passengers) ? passengers : [])
      .map((p,index)=>({
        id:String(p.passengerId || p._id || index),
        pickup:normRouteAddressOnly(p.pickup),
        dropoff:normRouteAddressOnly(p.dropoff),
        status:cleanStatus(p.status || "Scheduled")
      }))
  );
}

function coordinatesValue(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function routeAddressChanged(oldAddress,newAddress){
  return normRouteAddressOnly(oldAddress) !== normRouteAddressOnly(newAddress);
}


/* ================= ACTIONS ================= */

async function reloadTrips(){
  trips = await fetchTrips();
  render();
}

async function handleEditTrip(btn){

  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t => String(t._id) === String(id));

  if(!trip) return;

  const service = getServiceByTrip(trip);
  const mins = minutesToTrip(trip);

  if(
    warningEnabled(service) &&
    mins !== null &&
    mins <= getWarningMinutes(service) &&
    mins > 0
  ){
    const ok = confirm(
      `This trip is within ${getWarningMinutes(service)} minutes.

Continue editing?`
    );

    if(!ok) return;
  }

  trip.__editing = true;
  render();
}

async function handleEditShared(btn){

  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group =
    getSharedGroups().find(
      g => getSharedKey(g[0]) === groupId
    );

  if(!group) return;

  const first = group[0];

  const service = getServiceByTrip(first);
  const mins = minutesToTrip(first);

  if(
    warningEnabled(service) &&
    mins !== null &&
    mins <= getWarningMinutes(service) &&
    mins > 0
  ){
    const ok = confirm(
      `This shared trip is within ${getWarningMinutes(service)} minutes.

Continue editing?`
    );

    if(!ok) return;
  }

  group.forEach(t=>{
    t.__editing = true;
  });

  render();
}

async function handleCancelEdit(){
  await reloadTrips();
}

async function handleDeleteTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;

  if(!id) return;

  const ok = confirm("Delete this trip?");
  if(!ok) return;

  await deleteTrip(id);
  await reloadTrips();
}

async function handleDeleteShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group =
    getSharedGroups().find(g =>
      getSharedKey(g[0]) === groupId
    );

  if(!group) return;

  const ok = confirm("Delete this shared trip?");
  if(!ok) return;

  for(const t of group){
    await deleteTrip(t._id);
  }

  await reloadTrips();
}

async function handleSaveTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t => String(t._id) === String(id));

  if(!trip) return;

  const payload = {};
  const stops = Array.isArray(trip.stops) ? [...trip.stops] : [];

  tr.querySelectorAll(".edit-input").forEach(input=>{
    const field = input.dataset.field;
    const stopIndex = input.dataset.stopIndex;

    if(stopIndex !== undefined){
      stops[Number(stopIndex)] = normalizeAddress(input.value);
      return;
    }

    if(field === "pickup" || field === "dropoff"){
      payload[field] = normalizeAddress(input.value);
    }else if(field){
      payload[field] = input.value;
    }
  });

  validateRequiredTripFields({
    entryName:payload.entryName ?? trip.entryName,
    entryPhone:payload.entryPhone ?? trip.entryPhone,
    clientName:payload.clientName ?? trip.clientName,
    clientPhone:payload.clientPhone ?? trip.clientPhone,
    pickup:payload.pickup ?? trip.pickup,
    dropoff:payload.dropoff ?? trip.dropoff,
    tripDate:payload.tripDate ?? trip.tripDate,
    tripTime:payload.tripTime ?? trip.tripTime
  });

  validateFutureTripDateTime(
    payload.tripDate ?? trip.tripDate,
    payload.tripTime ?? trip.tripTime
  );

  const service = getServiceByTrip(trip);
  const mins = minutesToTrip({
    tripDate:payload.tripDate ?? trip.tripDate,
    tripTime:payload.tripTime ?? trip.tripTime
  });

  if(
    warningEnabled(service) &&
    mins !== null &&
    mins > 0 &&
    mins <= getWarningMinutes(service)
  ){
    const ok = confirm(
      `Warning: Trip is inside ${getWarningMinutes(service)} minute window.

Continue saving?`
    );

    if(!ok) return;
  }

  payload.stops = stops.filter(Boolean);

  const nextPickup =
    payload.pickup ?? trip.pickup ?? "";

  const nextDropoff =
    payload.dropoff ?? trip.dropoff ?? "";

  const pickupChanged =
    routeAddressChanged(trip.pickup,nextPickup);

  const dropoffChanged =
    routeAddressChanged(trip.dropoff,nextDropoff);

  payload.pickupLat =
    pickupChanged
      ? null
      : coordinatesValue(trip.pickupLat);

  payload.pickupLng =
    pickupChanged
      ? null
      : coordinatesValue(trip.pickupLng);

  payload.dropoffLat =
    dropoffChanged
      ? null
      : coordinatesValue(trip.dropoffLat);

  payload.dropoffLng =
    dropoffChanged
      ? null
      : coordinatesValue(trip.dropoffLng);

  const oldSignature =
    buildIndividualRouteSignatureForEdit(trip);

  const newSignature =
    buildIndividualRouteSignatureForEdit(trip,payload,stops);

  const routeChanged =
    oldSignature !== newSignature;

  if(routeChanged){

    payload.status = "Scheduled";
    payload.dispatchSelected = false;

    payload.priceAmount = 0;
    payload.finalPrice = 0;

    payload.miles = 0;
    payload.distanceMeters = 0;
    payload.durationSeconds = 0;
    payload.estimatedMinutes = 0;

    payload.googleRoute = null;
    payload.routePoints = [];
    payload.routePlan = [];
    payload.sharedRoutePlan = [];
    payload.optimizedRoute = null;

    payload.routeLocked = false;
    payload.routeFinalized = false;
    payload.routeSource = "route-edited";
    payload.routeUpdatedAt = null;

    payload.routeChangePending = true;
    payload.routeChangeStatus = "ROUTE_CHANGED";

  }else{

    payload.status = trip.status || "Confirmed";
    payload.dispatchSelected =
      trip.dispatchSelected === false
        ? false
        : true;

    delete payload.priceAmount;
    delete payload.finalPrice;

    delete payload.miles;
    delete payload.distanceMeters;
    delete payload.durationSeconds;
    delete payload.estimatedMinutes;

    delete payload.googleRoute;
    delete payload.routePoints;
    delete payload.routePlan;
    delete payload.sharedRoutePlan;
    delete payload.optimizedRoute;

    delete payload.routeLocked;
    delete payload.routeFinalized;
    delete payload.routeSource;
    delete payload.routeUpdatedAt;

    delete payload.routeChangePending;
    delete payload.routeChangeStatus;
  }

  await updateTrip(id,payload);
  await reloadTrips();
}

async function handleSaveShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group =
    getSharedGroups().find(g =>
      getSharedKey(g[0]) === groupId
    );

  if(!group) return;

  const originalPassengers =
    getServerSharedPassengers(group).map(p=>({...p}));

  const passengers =
    originalPassengers.map(p=>({...p}));

  const payload = {};

  tr.querySelectorAll(".edit-input").forEach(input=>{
    const field = input.dataset.field;

    if(!field) return;

    if(field.startsWith("passenger_")){
      const parts = field.split("_");
      const index = Number(parts[1]);
      const key = parts[2];

      if(!passengers[index]) return;

      if(key === "name"){
        passengers[index].name = input.value;
        passengers[index].clientName = input.value;
      }

      if(key === "phone"){
        passengers[index].phone = input.value;
        passengers[index].clientPhone = input.value;
      }

      if(key === "pickup"){
        passengers[index].pickup = normalizeAddress(input.value);
      }

      if(key === "dropoff"){
        passengers[index].dropoff = normalizeAddress(input.value);
      }

      return;
    }

    payload[field] = input.value;
  });

  for(const p of passengers){
    if(!String(p.clientName || p.name || "").trim()){
      throw new Error("Passenger name required");
    }

    if(!String(p.clientPhone || p.phone || "").trim()){
      throw new Error("Passenger phone required");
    }

    if(!String(p.pickup || "").trim()){
      throw new Error("Passenger pickup required");
    }

    if(!String(p.dropoff || "").trim()){
      throw new Error("Passenger dropoff required");
    }
  }

  validateFutureTripDateTime(
    payload.tripDate ?? group[0].tripDate,
    payload.tripTime ?? group[0].tripTime
  );

  const service = getServiceByTrip(group[0]);
  const mins = minutesToTrip({
    tripDate:payload.tripDate ?? group[0].tripDate,
    tripTime:payload.tripTime ?? group[0].tripTime
  });

  if(
    warningEnabled(service) &&
    mins !== null &&
    mins <= getWarningMinutes(service)
  ){
    const ok = confirm(
      `Warning: Shared trip is inside ${getWarningMinutes(service)} minute window.

Continue saving?`
    );

    if(!ok) return;
  }

  payload.passengers =
    passengers.map((p,index)=>{

      const oldPassenger =
        originalPassengers[index] || {};

      const pickupChanged =
        routeAddressChanged(oldPassenger.pickup,p.pickup);

      const dropoffChanged =
        routeAddressChanged(oldPassenger.dropoff,p.dropoff);

      return {
        ...p,

        passengerId:
          p.passengerId || oldPassenger.passengerId || "P" + (index + 1),

        name:
          normalizeText(p.name || p.clientName),

        phone:
          normalizeText(p.phone || p.clientPhone),

        clientName:
          normalizeText(p.clientName || p.name),

        clientPhone:
          normalizeText(p.clientPhone || p.phone),

        pickup:
          normalizeAddress(p.pickup),

        pickupLat:
          pickupChanged
            ? null
            : coordinatesValue(p.pickupLat ?? oldPassenger.pickupLat),

        pickupLng:
          pickupChanged
            ? null
            : coordinatesValue(p.pickupLng ?? oldPassenger.pickupLng),

        dropoff:
          normalizeAddress(p.dropoff),

        dropoffLat:
          dropoffChanged
            ? null
            : coordinatesValue(p.dropoffLat ?? oldPassenger.dropoffLat),

        dropoffLng:
          dropoffChanged
            ? null
            : coordinatesValue(p.dropoffLng ?? oldPassenger.dropoffLng),

        status:
          p.status || oldPassenger.status || "Scheduled",

        pickupOrder:
          p.pickupOrder ?? oldPassenger.pickupOrder ?? 0,

        dropoffOrder:
          p.dropoffOrder ?? oldPassenger.dropoffOrder ?? 0,

        routeOrder:
          p.routeOrder ?? oldPassenger.routeOrder ?? index + 1,

        passengerMiles:
          p.passengerMiles ?? oldPassenger.passengerMiles ?? 0,

        passengerMinutes:
          p.passengerMinutes ?? oldPassenger.passengerMinutes ?? 0,

        passengerDistanceMeters:
          p.passengerDistanceMeters ?? oldPassenger.passengerDistanceMeters ?? 0,

        passengerDurationSeconds:
          p.passengerDurationSeconds ?? oldPassenger.passengerDurationSeconds ?? 0,

        priceAmount:
          p.priceAmount ?? oldPassenger.priceAmount ?? 0,

        finalPrice:
          p.finalPrice ?? oldPassenger.finalPrice ?? 0
      };
    });

  payload.pickup =
    payload.passengers[0]?.pickup || "";
  payload.dropoff =
    payload.passengers[payload.passengers.length - 1]?.dropoff || "";
  payload.totalPassengers = payload.passengers.length;
  payload.passengerCount = payload.passengers.length;
  payload.passengersCount = payload.passengers.length;

  const oldSignature =
    buildSharedRouteSignatureForEdit(originalPassengers);

  const newSignature =
    buildSharedRouteSignatureForEdit(payload.passengers || passengers);

  const routeChanged =
    oldSignature !== newSignature;

  if(routeChanged){

    payload.status = "Scheduled";
    payload.dispatchSelected = false;

    payload.priceAmount = 0;
    payload.finalPrice = 0;
    payload.pricePerPassenger = 0;

    payload.miles = 0;
    payload.distanceMeters = 0;
    payload.durationSeconds = 0;
    payload.estimatedMinutes = 0;

    payload.googleRoute = null;
    payload.routePoints = [];
    payload.routePlan = [];
    payload.sharedRoutePlan = [];
    payload.optimizedRoute = null;

    payload.routeLocked = false;
    payload.routeFinalized = false;
    payload.routeSource = "route-edited";
    payload.routeUpdatedAt = null;

    payload.sharedRouteLocked = false;
    payload.sharedRouteLockedAt = null;
    payload.sharedRouteMeta = null;
    payload.sharedRoutePolyline = "";
    payload.sharedRouteMiles = 0;
    payload.sharedRouteMinutes = 0;
    payload.sharedRouteSignature = "";
    payload.sharedGoogleRequestsUsed = 0;

    payload.routeChangePending = true;
    payload.routeChangeStatus = "ROUTE_CHANGED";

    payload.passengers =
      payload.passengers.map((p,index)=>({
        ...p,
        pickupOrder:0,
        dropoffOrder:0,
        routeOrder:index + 1,
        passengerMiles:0,
        passengerMinutes:0,
        passengerDistanceMeters:0,
        passengerDurationSeconds:0,
        priceAmount:0,
        finalPrice:0
      }));

  }else{

    payload.status = group[0].status || "Confirmed";
    payload.dispatchSelected =
      group[0].dispatchSelected === false
        ? false
        : true;

    delete payload.priceAmount;
    delete payload.finalPrice;
    delete payload.pricePerPassenger;

    delete payload.miles;
    delete payload.distanceMeters;
    delete payload.durationSeconds;
    delete payload.estimatedMinutes;

    delete payload.googleRoute;
    delete payload.routePoints;
    delete payload.routePlan;
    delete payload.sharedRoutePlan;
    delete payload.optimizedRoute;

    delete payload.routeLocked;
    delete payload.routeFinalized;
    delete payload.routeSource;
    delete payload.routeUpdatedAt;

    delete payload.sharedRouteLocked;
    delete payload.sharedRouteLockedAt;
    delete payload.sharedRouteMeta;
    delete payload.sharedRoutePolyline;
    delete payload.sharedRouteMiles;
    delete payload.sharedRouteMinutes;
    delete payload.sharedRouteSignature;
    delete payload.sharedGoogleRequestsUsed;

    delete payload.routeChangePending;
    delete payload.routeChangeStatus;
  }

  for(const t of group){
    await updateTrip(t._id,payload);
  }

  await reloadTrips();
}

async function handleConfirmTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t => String(t._id) === String(id));

  if(!trip) return;

  const service = getServiceByTrip(trip);

  if(!service){
    throw new Error("Service not found for this trip");
  }

  btn.disabled = true;
  btn.textContent = "Routing...";

  const routePoints = buildIndividualRoutePoints(trip);
  const routeData = await calculateRouteMiles(routePoints);

  btn.textContent = "Pricing...";

  const serviceKey =
    service.serviceKey ||
    trip.serviceKey ||
    trip.serviceType ||
    "STANDARD";

  const finalStops =
    getConfirmStops(trip);

  const billableStopsCount =
    Array.isArray(finalStops)
      ? finalStops.length
      : 0;

  const total =
    await calculateServerPrice({
      serviceKey,

      company:
        trip.company ||
        trip.facilityName ||
        trip.companyName ||
        localStorage.getItem("name") ||
        "",

      facilityId:
        trip.facilityId ||
        trip.companyId ||
        trip.userId ||
        localStorage.getItem("localId") ||
        localStorage.getItem("companyId") ||
        localStorage.getItem("userId") ||
        localStorage.getItem("_id") ||
        localStorage.getItem("id") ||
        "",

      miles:
        routeData.miles,

      stops:
        billableStopsCount,

      minutes:
        routeData.estimatedMinutes,

      passengerCount:
        1,

      isCompany:
        true
    });

  await updateTrip(id,{
    status:"Confirmed",
    dispatchSelected:true,

    priceAmount:total,
    finalPrice:total,

    miles:routeData.miles,
    distanceMeters:routeData.distanceMeters,
    durationSeconds:routeData.durationSeconds,
    estimatedMinutes:routeData.estimatedMinutes,

    googleRoute:routeData.googleRoute,
    routePoints:routePoints,
    optimizedRoute:routeData.googleRoute,

    pickupLat:coordinatesValue(trip.pickupLat),
    pickupLng:coordinatesValue(trip.pickupLng),
    dropoffLat:coordinatesValue(trip.dropoffLat),
    dropoffLng:coordinatesValue(trip.dropoffLng),

    routeLocked:true,
    routeFinalized:true,
    routeSource:"company-review",
    routeUpdatedAt:new Date().toISOString(),

    serviceName:service?.name || service?.title || "",
    serviceCode:service?.serviceKey || service?.companySuffix || service?.code || service?.serviceCode || "",
    serviceId:service?._id || ""
  });

  await reloadTrips();
}

async function handleConfirmShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group =
    getSharedGroups().find(g =>
      getSharedKey(g[0]) === groupId
    );

  if(!group) return;

  const first = group[0];

  if(!first || !first._id){
    throw new Error("Shared trip id missing");
  }

  btn.disabled = true;
  btn.textContent = "Server Routing...";

  await confirmCompanySharedOnServer(first._id);

  btn.textContent = "Reloading...";

  await reloadTrips();
}

async function handleCancelTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;

  if(!id) return;

  const ok = confirm("Cancel this trip?");
  if(!ok) return;

  const res = await fetch(
    "/api/company/cancel-trip/" + id,
    {
      method:"POST",
      headers:{
        Authorization:"Bearer " + token
      }
    }
  );

  if(!res.ok){
    const err =
      await res.json()
      .catch(()=>({}));

    throw new Error(
      err.message ||
      "Cancel failed"
    );
  }

  await reloadTrips();
}

async function handleCancelShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group =
    getSharedGroups().find(g =>
      getSharedKey(g[0]) === groupId
    );

  if(!group) return;

  const ok = confirm("Cancel this shared trip?");
  if(!ok) return;

  for(const t of group){
    const res = await fetch(
      "/api/company/cancel-trip/" + t._id,
      {
        method:"POST",
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

    if(!res.ok){
      const err =
        await res.json()
        .catch(()=>({}));

      throw new Error(
        err.message ||
        "Cancel shared failed"
      );
    }
  }

  await reloadTrips();
}

async function handleAddStop(btn){
  const tr = btn.closest("tr");
  const id = tr?.dataset?.id;

  if(!id) return;

  const trip = trips.find(t => String(t._id) === String(id));

  if(!trip){
    alert("Trip not found");
    return;
  }

  if(isSharedTrip(trip)){
    alert("Add Stop is not available for shared trips");
    return;
  }

  if(!serviceAllowsAddStop(trip)){
    alert("Add Stop is not enabled for this service");
    return;
  }

  window.location.href =
    `/companies/company-add-stop.html?tripId=${encodeURIComponent(id)}`;
}

async function handleCancelStop(btn){

  const tr = btn.closest("tr");
  const id = tr?.dataset?.id;

  if(!id) return;

  const trip =
    trips.find(t => String(t._id) === String(id));

  if(!trip){
    alert("Trip not found");
    return;
  }

const activeReq =
  getVisibleAddStopRequest(trip);

  if(!activeReq){
    alert("There is no active stop request to cancel");
    await reloadTrips();
    return;
  }

  const ok =
    confirm("Cancel added stop request?");

  if(!ok) return;

  btn.disabled = true;
  btn.textContent = "Cancelling...";

  const res =
    await fetch(
      `/api/company/add-stop/${encodeURIComponent(id)}/cancel`,
      {
        method:"POST",
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

  const data =
    await res.json()
      .catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(
      data.message ||
      "Cancel stop failed"
    );
  }

  const freshTrips =
    await fetchTrips();

  const freshTrip =
    freshTrips.find(t => String(t._id) === String(id)) || trip;

  const service =
    getServiceByTrip(freshTrip);

  if(!service){
    await reloadTrips();
    return;
  }

  const pickup =
    activeReq.pickup ||
    freshTrip.pickup ||
    "";

  const stops =
    Array.isArray(activeReq.existingStopsBefore)
      ? activeReq.existingStopsBefore
          .map(s => normalizeAddress(s))
          .filter(Boolean)
      : Array.isArray(freshTrip.stops)
        ? freshTrip.stops
            .map(s => normalizeAddress(s))
            .filter(Boolean)
        : [];

  const dropoff =
    activeReq.dropoffBefore ||
    freshTrip.dropoff ||
    "";

  const routePoints =
    [
      pickup,
      ...stops,
      dropoff
    ].filter(Boolean);

  if(routePoints.length < 2){
    await reloadTrips();
    return;
  }

  btn.textContent = "Routing...";

  const routeData =
    await calculateRouteMiles(routePoints);

  btn.textContent = "Pricing...";

  const serviceKey =
    service.serviceKey ||
    freshTrip.serviceKey ||
    freshTrip.serviceType ||
    "STANDARD";

  const stopsCount =
    Array.isArray(stops)
      ? stops.length
      : 0;

  const total =
    await calculateServerPrice({
      serviceKey,
      miles:routeData.miles,
      stops:stopsCount,
      minutes:routeData.estimatedMinutes,
      passengerCount:1
    });

  await updateTrip(id,{

    pickup:pickup,
    stops:stops,
    dropoff:dropoff,

    pickupLat:
      routeAddressChanged(freshTrip.pickup,pickup)
        ? null
        : coordinatesValue(freshTrip.pickupLat),

    pickupLng:
      routeAddressChanged(freshTrip.pickup,pickup)
        ? null
        : coordinatesValue(freshTrip.pickupLng),

    dropoffLat:
      routeAddressChanged(freshTrip.dropoff,dropoff)
        ? null
        : coordinatesValue(freshTrip.dropoffLat),

    dropoffLng:
      routeAddressChanged(freshTrip.dropoff,dropoff)
        ? null
        : coordinatesValue(freshTrip.dropoffLng),

    priceAmount:total,
    finalPrice:total,

    miles:routeData.miles,
    distanceMeters:routeData.distanceMeters,
    durationSeconds:routeData.durationSeconds,
    estimatedMinutes:routeData.estimatedMinutes,

    googleRoute:routeData.googleRoute,
    routePoints:routePoints,
    optimizedRoute:routeData.googleRoute,

    routeLocked:true,
    routeFinalized:true,
    routeSource:"company-add-stop-cancel-auto-review",
    routeUpdatedAt:new Date().toISOString(),

    addStopRequest:{
      ...activeReq,
      active:false,
      status:"CANCELLED_BY_COMPANY",
      cancelledAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),

      cancelledAutomatically:true,
      restoredPickup:pickup,
      restoredStops:stops,
      restoredDropoff:dropoff,
      restoredMiles:routeData.miles,
      restoredPrice:total
    },

    routeChangePending:false,
    routeChangeStatus:"CANCELLED"
  });

  await reloadTrips();
}

/* ================= EVENTS ================= */

container.addEventListener("click", async e=>{
  const btn = e.target.closest("button");
  if(!btn) return;

  const action = btn.dataset.action;
  if(!action) return;

  try{
    if(action === "edit-trip") await handleEditTrip(btn);
    if(action === "edit-shared") await handleEditShared(btn);
    if(action === "cancel-edit") await handleCancelEdit();
    if(action === "delete-trip") await handleDeleteTrip(btn);
    if(action === "delete-shared") await handleDeleteShared(btn);
    if(action === "save-trip") await handleSaveTrip(btn);
    if(action === "save-shared") await handleSaveShared(btn);
    if(action === "confirm-trip") await handleConfirmTrip(btn);
    if(action === "confirm-shared") await handleConfirmShared(btn);
    if(action === "cancel-trip") await handleCancelTrip(btn);
    if(action === "cancel-shared") await handleCancelShared(btn);
    if(action === "add-stop") await handleAddStop(btn);
if(action === "cancel-stop") await handleCancelStop(btn);

    if(action === "view-trip"){
      const tr = btn.closest("tr");
      openReviewView("trip",tr?.dataset?.id || "");
    }

    if(action === "view-shared"){
      const tr = btn.closest("tr");
      openReviewView("shared",tr?.dataset?.groupId || "");
    }

  }catch(err){
    console.error(err);
    alert(err.message || "Server Error");
    await reloadTrips();
  }
});

/* ================= EXPORT ================= */

Object.assign(window,{
  openReviewView,
  closeReviewView
});

window.ReviewApp = {
  token,
  companyName,
  container,

  get trips(){ return trips; },
  set trips(v){ trips = v; },

  get COMPANY_SERVICES(){ return COMPANY_SERVICES; },

  refreshData,
  render,

  normalizeText,
  escapeHtml,
  formatMoney,
  getAZNow,
  normalizeAddress,
  parseTripDateTime,
  minutesToTrip,

  getSharedKey,
  getRealPassengersFromGroup,

  getServiceByTrip,
  isSharedTrip,
  isSharedService,
  getWarningMinutes,
  warningEnabled,

  calculateRouteMiles,
  buildIndividualRoutePoints,
  buildSharedRoutePoints,
  buildFinalSharedRoute,
  optimizeStopsFromOrigin,

  fetchTrips,
  updateTrip,
  deleteTrip,
  confirmCompanySharedOnServer,

  getTripsTabData,
  getSharedGroups,
  calculateServerPrice
};

/* ================= LOAD ================= */
async function autoApplyAddStopRequests(){

  const candidates =
    trips.filter(t=>{
      const req = getActiveAddStopRequest(t);

      return (
        req &&
        !isSharedTrip(t) &&
        !autoApplyingAddStops.has(String(t._id))
      );
    });

  if(!candidates.length){
    return;
  }

  for(const trip of candidates){

    const id =
      String(trip._id);

    try{

      autoApplyingAddStops.add(id);

      const service =
        getServiceByTrip(trip);

      if(!service){
        console.log("AUTO ADD STOP: service not found", trip.tripNumber);
        continue;
      }

      const activeReq =
        getActiveAddStopRequest(trip);

      if(!activeReq){
        continue;
      }

      const finalPickup =
        getConfirmPickup(trip);

      const finalStops =
        getConfirmStops(trip);

      const finalDropoff =
        getConfirmDropoff(trip);

      const routePoints =
        buildIndividualRoutePoints(trip);

      if(routePoints.length < 2){
        console.log("AUTO ADD STOP: route points missing", trip.tripNumber);
        continue;
      }

      const routeData =
        await calculateRouteMiles(routePoints);

      const serviceKey =
        service.serviceKey ||
        trip.serviceKey ||
        trip.serviceType ||
        "STANDARD";

    const finalStopsCount =
  Array.isArray(finalStops)
    ? finalStops.length
    : 0;

const addedStopsCountFromRequest =
  Array.isArray(activeReq.addedStopsDetailed) &&
  activeReq.addedStopsDetailed.length
    ? activeReq.addedStopsDetailed.length
    : Array.isArray(activeReq.addedStops)
      ? activeReq.addedStops.length
      : 0;

const addedStopsCount =
  addedStopsCountFromRequest;

const billableStopsCount =
  finalStopsCount;

      const total =
        await calculateServerPrice({
          serviceKey,
          miles:routeData.miles,
          stops:billableStopsCount,
          minutes:routeData.estimatedMinutes,
          passengerCount:1
        });

      await updateTrip(id,{

        pickup:finalPickup,
        stops:finalStops,
        dropoff:finalDropoff,

        pickupLat:
          routeAddressChanged(trip.pickup,finalPickup)
            ? null
            : coordinatesValue(trip.pickupLat),

        pickupLng:
          routeAddressChanged(trip.pickup,finalPickup)
            ? null
            : coordinatesValue(trip.pickupLng),

        dropoffLat:
          routeAddressChanged(trip.dropoff,finalDropoff)
            ? null
            : coordinatesValue(trip.dropoffLat),

        dropoffLng:
          routeAddressChanged(trip.dropoff,finalDropoff)
            ? null
            : coordinatesValue(trip.dropoffLng),

        priceAmount:total,
        finalPrice:total,

        miles:routeData.miles,
        distanceMeters:routeData.distanceMeters,
        durationSeconds:routeData.durationSeconds,
        estimatedMinutes:routeData.estimatedMinutes,

        googleRoute:routeData.googleRoute,
        routePoints:routePoints,
        optimizedRoute:routeData.googleRoute,

        routeLocked:true,
        routeFinalized:true,
        routeSource:"company-add-stop-auto-review",
        routeUpdatedAt:new Date().toISOString(),

        addStopRequest:{
          ...activeReq,
          active:false,
          status:"COMPLETED",
          completedAt:new Date().toISOString(),
          updatedAt:new Date().toISOString(),

          addedStopsCount:addedStopsCount,
          billableStopsCount:billableStopsCount,

          appliedAutomatically:true,
          appliedPickup:finalPickup,
          appliedStops:finalStops,
          appliedDropoff:finalDropoff,
          appliedMiles:routeData.miles,
          appliedPrice:total
        },

        routeChangePending:false,
        routeChangeStatus:"COMPLETED"
      });

      console.log("AUTO ADD STOP APPLIED:", trip.tripNumber, "$" + total);

    }catch(err){

      console.error("AUTO ADD STOP ERROR:", trip.tripNumber, err);

    }finally{

      autoApplyingAddStops.delete(id);

    }

  }

}
async function refreshData(){

  await loadSystemRegion();
  await loadServices();

  trips = await fetchTrips();

  await autoApplyAddStopRequests();

  trips = await fetchTrips();

  render();
}

await refreshData();

setInterval(async()=>{
  const hasEditing = trips.some(t=>t.__editing);
  if(hasEditing) return;

  await refreshData();
},30000);

});