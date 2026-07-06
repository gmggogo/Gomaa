/* =========================================
FILE: review.js
COMPANY REVIEW - ONE FILE
SERVER PRICING ONLY
SHARED CONFIRM USES SERVER ROUTE LIKE DISPATCH ADD TRIP
NO NODE / NO REQUIRE / BROWSER FILE ONLY
========================================= */

window.ReviewApp = { container:null };

window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token") || "";
const role = localStorage.getItem("role") || "";
const companyName = localStorage.getItem("name") || "";
const ADD_STOP_ACTIVE_FROM = new Date("2026-06-20T05:58:00");

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
  .review-tabs{display:flex;gap:10px;margin:0 0 20px;background:#e2e8f0;padding:6px;border-radius:14px;}
  .review-tabs button{flex:1;padding:13px;border:none;border-radius:11px;font-size:14px;font-weight:700;cursor:pointer;}
  .tab-active{background:#2563eb;color:#fff;}
  .tab-inactive{background:#64748b;color:#fff;}
  .table-wrap{width:100%;overflow-x:auto;margin-bottom:20px;border-radius:12px;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.08);}
  .review-table{width:100%;border-collapse:collapse;background:#fff;min-width:1580px;table-layout:fixed;border-top:6px solid #000;}
  .review-table th,.review-table td{border:1px solid #dbe2ea;padding:5px;text-align:center;font-size:11px;vertical-align:middle;line-height:1.25;box-sizing:border-box;}
  .review-table th{background:#0f172a;color:#fff;font-weight:900;white-space:nowrap;}
  .date-row td{background:#bfdbfe!important;color:#1e3a8a!important;font-weight:900!important;text-align:center!important;padding:7px 8px!important;font-size:13px!important;line-height:1.15!important;border-top:3px solid #000!important;border-bottom:2px solid #60a5fa!important;letter-spacing:.3px!important;}
  .col-num{width:34px;}.col-trip{width:95px;}.col-client{width:150px;}.col-phone{width:95px;}.col-pickup{width:205px;}.col-stops{width:175px;}.col-drop{width:205px;}.col-notes{width:230px;}.col-date{width:88px;}.col-time{width:64px;}.col-status{width:90px;}.col-price{width:82px;}.col-miles{width:76px;}.col-actions{width:185px;}.col-eye{width:42px;}
  .btn{border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;margin:2px;white-space:nowrap;}
  .btn.edit{background:#2563eb;color:#fff;}.btn.delete{background:#111827;color:#fff;}.btn.confirm{background:#16a34a;color:#fff;}.btn.cancel{background:#dc2626;color:#fff;}.btn.add-stop{background:#7c3aed;color:#fff;}
  .actions-wrap{display:flex;justify-content:center;align-items:center;gap:4px;flex-wrap:wrap;min-width:170px;}
  .edit-input{width:100%;min-width:90px;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;background:#fff;color:#111827;}
  .multi-line{white-space:pre-line;line-height:1.5;text-align:left;word-break:break-word;}
  .cell-box{display:grid;border:1px solid #111;background:#fff;width:100%;box-sizing:border-box;border-radius:4px;overflow:hidden;}
  .cell-item{padding:4px 5px;min-height:22px;font-weight:700;white-space:normal;word-break:break-word;box-sizing:border-box;background:#fff;font-size:10.5px;line-height:1.35;text-align:left;}
  .cell-item + .cell-item{border-top:1px solid #111;}
  .trip-number-badge{font-weight:900;color:#2563eb;white-space:normal;word-break:break-word;font-size:10px;}
  .price-badge{font-weight:900;color:#15803d;white-space:nowrap;}
  .miles-strong{font-weight:900;color:#2563eb;white-space:nowrap;}
  .route-locked-badge{display:inline-block;margin-top:4px;padding:3px 6px;border-radius:999px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:9px;font-weight:900;}
  .eye-btn{border:none;background:transparent;color:#2563eb;width:30px;height:24px;cursor:pointer;font-size:18px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0;}
  .eye-btn:hover{color:#1d4ed8;background:#dbeafe;border-radius:6px;}
  .view-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:15px;}
  .view-box{background:#fff;width:min(570px,96vw);border-radius:15px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.28);}
  .view-head{background:#2563eb;color:#fff;padding:12px 15px;display:flex;justify-content:space-between;align-items:center;font-weight:900;}
  .view-close{border:none;background:#fff;color:#0f172a;width:30px;height:30px;border-radius:50%;font-size:18px;font-weight:900;cursor:pointer;}
  .view-body{padding:14px;display:grid;gap:8px;}
  .view-line{display:grid;grid-template-columns:150px 1fr;border:1px solid #e2e8f0;border-radius:9px;overflow:hidden;}
  .view-label{background:#f1f5f9;padding:9px;font-weight:900;color:#334155;}
  .view-value{padding:9px;font-weight:800;color:#0f172a;word-break:break-word;white-space:pre-line;}
  .scheduled-row{background:#fff;color:#111827;}.confirmed-row{background:#dcfce7;color:#111827;}.cancelled-row{background:#fecaca;color:#111827;}.yellow{background:#fef9c3;color:#111827;}.red-light{background:#fecaca;color:#111827;}.red-mid{background:#fca5a5;color:#111827;}.red-dark{background:#7f1d1d;color:#fff;}.past-row{background:#374151;color:#e5e7eb;}
  @keyframes blinkTrip{0%{opacity:1;}50%{opacity:.82;}100%{opacity:1;}}
  .trip-blink{animation:blinkTrip 1.8s infinite;}
  @media(max-width:768px){.review-table{min-width:1500px;}.review-table th,.review-table td{font-size:10px;padding:4px;}.btn{font-size:10px;padding:5px 7px;}.edit-input{font-size:10px;min-width:85px;}.cell-item{font-size:9.5px;padding:3px 4px;}.view-line{grid-template-columns:1fr;}}
  `;
  document.head.appendChild(style);
})();

/* ================= STATE ================= */
let activeTab = "TRIPS";
let trips = [];
let COMPANY_SERVICES = [];
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";
let SYSTEM_TIMEZONE = "America/Phoenix";
let googleLoadPromise = null;
const autoApplyingAddStops = new Set();

/* ================= HELPERS ================= */
function normalizeText(v){ return String(v ?? "").trim(); }
function cleanStatus(v){ return String(v || "").replace(/\s+/g,"").toLowerCase().trim(); }
function escapeHtml(value){ return String(value ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function formatMoney(value){ return Number(value || 0).toFixed(2); }
function coordinatesValue(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function getAZNow(){ return new Date(new Date().toLocaleString("en-US",{timeZone:SYSTEM_TIMEZONE || "America/Phoenix"})); }

async function loadSystemRegion(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json().catch(()=>({}));
    SYSTEM_REGION = data?.region || "";
    SYSTEM_COUNTRY = data?.country || "";
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";
  }catch(err){ console.log(err); }
}

function normalizeAddress(address){
  let v = normalizeText(address);
  if(!v) return "";
  v = v.replace(/\s+/g," ").trim();
  const lower = v.toLowerCase();
  if(SYSTEM_REGION && !lower.includes(SYSTEM_REGION.toLowerCase())) v += ", " + SYSTEM_REGION;
  if(SYSTEM_COUNTRY && !lower.includes(SYSTEM_COUNTRY.toLowerCase())) v += ", " + SYSTEM_COUNTRY;
  return v;
}
function normalizeUniqueAddress(address){ return normalizeAddress(address); }
function addressKey(address){ return normalizeUniqueAddress(address).toLowerCase().replace(/\s+/g," ").trim(); }
function uniqueAddressList(list){
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach(address=>{
    const v = normalizeUniqueAddress(address);
    if(!v) return;
    const key = addressKey(v);
    if(seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return out;
}

function parseTripDateTime(tripDate, tripTime){
  const d = normalizeText(tripDate);
  let t = normalizeText(tripTime);
  if(!d || !t) return null;
  const parts = d.split("-");
  if(parts.length < 3) return null;
  if(/^\d{1,2}:\d{2}$/.test(t)){
    const [hh,mm] = t.split(":");
    const dt = new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]),Number(hh),Number(mm),0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(ampm){
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();
    if(ap === "PM" && h < 12) h += 12;
    if(ap === "AM" && h === 12) h = 0;
    const dt = new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]),h,m,0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}
function minutesToTrip(t){ const dt = parseTripDateTime(t?.tripDate,t?.tripTime); return dt ? (dt - getAZNow()) / 60000 : null; }
function validateFutureTripDateTime(tripDate,tripTime){
  const tripDT = parseTripDateTime(tripDate,tripTime);
  if(!tripDT) throw new Error("Invalid date/time");
  if(tripDT <= getAZNow()) throw new Error("Trip time already passed");
}
function routeAddressChanged(oldAddress,newAddress){ return normRouteAddressOnly(oldAddress) !== normRouteAddressOnly(newAddress); }
function normRouteAddressOnly(v){ return normalizeAddress(v || "").toLowerCase().replace(/\s+/g," ").trim(); }
function normalizeStopsForSignature(stops){ return (Array.isArray(stops) ? stops : []).map(normRouteAddressOnly).filter(Boolean); }
function passengerIsActive(p){
  const s = cleanStatus(p?.status);
  return !s.includes("no") && !s.includes("cancel") && normalizeText(p?.pickup) && normalizeText(p?.dropoff);
}
function getTripPrice(t){ const p = Number(t?.priceAmount || 0); const f = Number(t?.finalPrice || 0); return p > 0 ? p : f; }
function getPassengerPrice(p){ const a = Number(p?.priceAmount || 0); const f = Number(p?.finalPrice || 0); return a > 0 ? a : f; }
function getSharedKey(t){ return normalizeText(t?.groupId) || normalizeText(t?.tripNumber) || String(t?._id || ""); }
function getTableDateKey(t){ return normalizeText(t?.tripDate) || (t?.createdAt ? new Date(t.createdAt).toLocaleDateString() : "Unknown"); }
function cellBox(items){
  const arr = Array.isArray(items) ? items : [items];
  return `<div class="cell-box">${arr.map(v=>`<div class="cell-item">${v || "--"}</div>`).join("")}</div>`;
}
function createEditInput(value,field,type="text"){ return `<input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value || "")}">`; }
function createSharedEditInput(value,field,type="text"){ return `<input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value || "")}">`; }

/* ================= SERVICES ================= */
function normalizeCode(v){
  const c = normalizeText(v).toUpperCase().replace(/[_-]/g," ").replace(/\s+/g," ").trim();
  if(!c) return "";
  if(c === "STANDARD" || c === "ST") return "ST";
  if(c === "WHEELCHAIR" || c === "WHEEL CHAIR" || c === "WC" || c === "WH") return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";
  return c;
}
function getServiceCodeFromTrip(trip){
  const direct = normalizeCode(trip?.serviceKey || trip?.serviceCode || trip?.serviceType || trip?.serviceSuffix || trip?.vehicle || "");
  if(direct) return direct;
  const parts = String(trip?.tripNumber || "").split("-");
  return normalizeCode(parts[parts.length - 1] || "");
}
function isSharedService(service){
  if(!service) return false;
  return service.companyShared === true || service.shared === true ||
    String(service.type || "").toUpperCase() === "SHARED" ||
    String(service.serviceType || "").toUpperCase() === "SHARED" ||
    normalizeCode(service.title || service.name || service.serviceName) === "SH" ||
    normalizeCode(service.serviceKey) === "SH" ||
    normalizeCode(service.companySuffix || service.suffix) === "SH";
}
function getServiceByTrip(trip){
  if(!trip) return null;
  const tripServiceId = normalizeText(trip.serviceId || "");
  if(tripServiceId){
    const byId = COMPANY_SERVICES.find(s=>String(s._id) === String(tripServiceId));
    if(byId) return byId;
  }
  const code = getServiceCodeFromTrip(trip);
  const tripType = normalizeText(trip.tripType || trip.type || "").toUpperCase();
  if(trip.isShared === true || tripType === "SHARED" || String(trip.tripNumber || "").toUpperCase().includes("-SH") || code === "SH"){
    return COMPANY_SERVICES.find(s=>isSharedService(s)) || null;
  }
  return COMPANY_SERVICES.find(s=>{
    return normalizeCode(s.serviceKey) === code || normalizeCode(s.companySuffix || s.suffix) === code || normalizeCode(s.serviceCode || s.code) === code || normalizeCode(s.title || s.name || s.serviceName) === code;
  }) || null;
}
function isSharedTrip(t){
  if(!t) return false;
  const tripType = String(t.tripType || t.type || "").toUpperCase();
  const tripNumber = String(t.tripNumber || "").toUpperCase();
  const code = getServiceCodeFromTrip(t);
  const service = getServiceByTrip(t);
  return t.isShared === true || tripType === "SHARED" || tripNumber.includes("-SH") || code === "SH" || code === "SHARED" || isSharedService(service);
}
function sharedEnabled(){ return trips.some(t=>isSharedTrip(t)) || COMPANY_SERVICES.some(s=>isSharedService(s)); }
function getWarningMinutes(service){ return Number(service?.companyWarningMinutes ?? service?.warningMinutes ?? 120); }
function warningEnabled(service){ return !(service?.companyDisableCancel === true || service?.disableCancel === true); }

async function loadServices(){
  try{
    COMPANY_SERVICES = [];
    const facilityId = localStorage.getItem("facilityId") || localStorage.getItem("companyId") || localStorage.getItem("userId") || localStorage.getItem("_id") || localStorage.getItem("id") || "";
    const facilityName = localStorage.getItem("facilityName") || localStorage.getItem("companyName") || localStorage.getItem("name") || companyName || "";
    let override = null;

    if(facilityId){
      const overrideRes = await fetch("/api/facility-pricing-override/" + encodeURIComponent(facilityId),{headers:{Authorization:"Bearer " + token}});
      const overrideData = await overrideRes.json().catch(()=>({}));
      if(overrideRes.ok) override = overrideData?.override || null;
    }

    if(!override && facilityName){
      const bootRes = await fetch("/api/facility-pricing-override/bootstrap",{headers:{Authorization:"Bearer " + token}});
      const bootData = await bootRes.json().catch(()=>({}));
      if(bootRes.ok){
        const nameLower = String(facilityName).trim().toLowerCase();
        override = Array.isArray(bootData.overrides) ? bootData.overrides.find(o=>String(o.facilityName || "").trim().toLowerCase() === nameLower) : null;
      }
    }

    if(override && override.active === true && Array.isArray(override.services) && override.services.length){
      COMPANY_SERVICES = override.services.map(s=>{
        const serviceKey = normalizeCode(s.serviceKey || s.serviceCode || s.code || s.companySuffix || s.suffix || "");
        const serviceName = s.serviceName || s.title || s.name || serviceKey;
        const serviceSuffix = s.serviceSuffix || s.companySuffix || s.suffix || serviceKey;
        return {
          ...s,_id:s._id || serviceKey,title:serviceName,name:serviceName,serviceName,serviceKey,serviceCode:serviceKey,code:serviceKey,
          companySuffix:serviceSuffix,suffix:serviceSuffix,companyShared:s.shared === true || serviceKey === "SH",shared:s.shared === true || serviceKey === "SH",
          companyPricingMode:s.pricingMode,companyBaseFare:Number(s.baseFare || 0),companyIncludedMiles:Number(s.includedMiles || 0),companyPerMile:Number(s.perMile || 0),
          companyHourlyRate:Number(s.hourlyRate || 0),companyHourlyBillingMode:s.hourlyBillingMode || "FULL",companyStopFee:Number(s.stopFee || 0),
          companyNoShowFee:Number(s.noShowFee || 0),companySharedPrice:Number(s.sharedPrice || 0),companyDisableCancel:s.disableCancel === true,
          companyWarningMinutes:Number(s.warningMinutes || 0),companyCancelFee:Number(s.cancelFee || 0),companyAddStopEnabled:s.addStopEnabled === true,
          companyAddStopCustomTimeEnabled:s.addStopCustomTimeEnabled === true,companyAddStopCutoffMinutes:Number(s.addStopCutoffMinutes || 0),__pricingSource:"FACILITY_OVERRIDE"
        };
      });
      return;
    }

    const serviceRes = await fetch("/api/services?company=true",{headers:{Authorization:"Bearer " + token}});
    const data = await serviceRes.json().catch(()=>[]);
    COMPANY_SERVICES = Array.isArray(data) ? data.map(s=>({...s,__pricingSource:"SERVICE_MANAGEMENT"})) : [];
  }catch(err){
    console.log("LOAD SERVICES ERROR:",err);
    COMPANY_SERVICES = [];
  }
}

/* ================= ADD STOP HELPERS ================= */
function tripAllowsAddStop(trip,service){
  if(!trip || !service || isSharedTrip(trip)) return false;
  if(service.companyAddStopEnabled !== true) return false;
  const created = new Date(trip.createdAt || trip.bookedAt || 0);
  if(created < ADD_STOP_ACTIVE_FROM) return false;
  return true;
}
function getActiveAddStopRequest(trip){
  const req = trip?.addStopRequest || null;
  if(!req) return null;
  const status = String(req.status || "").toUpperCase();
  if(req.active === true && !["CANCELLED","CANCELLED_BY_COMPANY","CANCELLED_BY_CUSTOMER","COMPLETED","REJECTED"].includes(status)) return req;
  return null;
}
function getAppliedAddStopRequest(trip){
  const req = trip?.addStopRequest || null;
  if(!req) return null;
  const status = String(req.status || "").toUpperCase();
  if(req.appliedAutomatically === true && status === "COMPLETED") return req;
  return null;
}
function getVisibleAddStopRequest(trip){ return getActiveAddStopRequest(trip) || getAppliedAddStopRequest(trip); }
function hasActiveAddStopRequest(trip){ return !!getVisibleAddStopRequest(trip); }
function getConfirmPickup(trip){ const req = getVisibleAddStopRequest(trip); return req?.pickup || trip?.pickup || ""; }
function getConfirmStops(trip){
  const req = getActiveAddStopRequest(trip);
  if(req && Array.isArray(req.finalStops)) return req.finalStops.map(s=>normalizeAddress(s)).filter(Boolean);
  return Array.isArray(trip?.stops) ? trip.stops.map(s=>normalizeAddress(s)).filter(Boolean) : [];
}
function getConfirmDropoff(trip){ const req = getActiveAddStopRequest(trip); return req?.dropoffAfter || trip?.dropoff || ""; }
function getStopRequestBadge(trip){
  const req = getActiveAddStopRequest(trip);
  if(!req) return "";
  const added = Array.isArray(req.addedStops) ? req.addedStops.length : 0;
  return `<div class="route-locked-badge">Stop Request Pending${added ? " • " + added + " Stop" + (added === 1 ? "" : "s") : ""}</div>`;
}
function serviceAllowsAddStop(trip){
  if(isSharedTrip(trip)) return false;
  const service = getServiceByTrip(trip);
  if(!tripAllowsAddStop(trip,service)) return false;
  if(service.companyAddStopCustomTimeEnabled !== true) return true;
  const mins = minutesToTrip(trip);
  if(mins === null) return true;
  const cutoff = Number(service.companyAddStopCutoffMinutes || 0);
  return cutoff <= 0 ? mins >= 0 : mins >= cutoff;
}
function renderAddStopButton(trip){
  if(isSharedTrip(trip)) return "";
  if(hasActiveAddStopRequest(trip)) return `<button class="btn cancel" data-action="cancel-stop">Cancel Stop</button>`;
  if(!serviceAllowsAddStop(trip)) return "";
  return `<button class="btn add-stop" data-action="add-stop">Add Stop</button>`;
}

/* ================= SERVER + GOOGLE ================= */
async function fetchTrips(){
  let list = [];
  const url = companyName ? "/api/trips/company/" + encodeURIComponent(companyName) : "/api/trips/company";
  const res = await fetch(url,{headers:{Authorization:"Bearer " + token}});
  if(res.ok) list = await res.json().catch(()=>[]);
  if((!Array.isArray(list) || list.length === 0) && companyName){
    const allRes = await fetch("/api/trips/company",{headers:{Authorization:"Bearer " + token}});
    if(allRes.ok){
      const all = await allRes.json().catch(()=>[]);
      list = Array.isArray(all) ? all.filter(t=>String(t.company || "").trim().toLowerCase() === String(companyName).trim().toLowerCase()) : [];
    }
  }
  return Array.isArray(list) ? list : [];
}
async function updateTrip(id,payload){
  const res = await fetch("/api/trips/" + encodeURIComponent(id),{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer " + token},body:JSON.stringify(payload)});
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.success === false) throw new Error(data.message || "Update failed");
  return data.trip || data.data || data;
}
async function deleteTrip(id){
  const res = await fetch("/api/trips/" + encodeURIComponent(id),{method:"DELETE",headers:{Authorization:"Bearer " + token}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.success === false) throw new Error(data.message || "Delete failed");
}
async function confirmTripOnServer(id){
  const res = await fetch("/api/dispatch-reserved-confirm/" + encodeURIComponent(id),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + token}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.success === false) throw new Error(data.message || "Confirm failed");
  return data.trip || data.data || data;
}
async function calculateServerPrice({serviceKey,miles,stops,minutes,passengerCount,company,companyName,facility,facilityName,facilityId,companyId,userId,isCompany}){
  const resolvedFacilityName = normalizeText(facilityName || companyName || facility || company || localStorage.getItem("facilityName") || localStorage.getItem("companyName") || localStorage.getItem("name") || "");
  const resolvedFacilityId = normalizeText(facilityId || companyId || userId || localStorage.getItem("facilityId") || localStorage.getItem("companyId") || localStorage.getItem("userId") || localStorage.getItem("_id") || localStorage.getItem("id") || "");
  const body = {serviceKey,miles:Number(miles||0),stops:Number(stops||0),minutes:Number(minutes||0),passengersCount:Number(passengerCount||1),passengerCount:Number(passengerCount||1),isCompany:isCompany!==false,facilityId:resolvedFacilityId,companyId:resolvedFacilityId,userId:resolvedFacilityId,facilityName:resolvedFacilityName,companyName:resolvedFacilityName,company:resolvedFacilityName,facility:resolvedFacilityName};
  const res = await fetch("/api/company-core/calculate",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + token},body:JSON.stringify(body)});
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.success === false) throw new Error(data.message || "Pricing failed");
  return Number(data.total || 0);
}
async function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.DirectionsService) return;
  if(googleLoadPromise) return googleLoadPromise;
  googleLoadPromise = new Promise(async (resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json().catch(()=>({}));
      if(!data.googleKey){ reject(new Error("Google key missing")); return; }
      const existing = document.querySelector("script[data-google-maps='true']");
      if(existing){ existing.addEventListener("load",()=>resolve()); existing.addEventListener("error",()=>reject(new Error("Google failed"))); return; }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true; script.defer = true; script.setAttribute("data-google-maps","true");
      script.onload = ()=>resolve(); script.onerror = ()=>reject(new Error("Google failed"));
      document.head.appendChild(script);
    }catch(err){ reject(err); }
  });
  return googleLoadPromise;
}
async function calculateRouteMiles(points){
  await ensureGoogleLoaded();
  const cleanPoints = Array.isArray(points) ? points.map(p=>normalizeUniqueAddress(p)).filter(Boolean) : [];
  if(cleanPoints.length < 2) return {miles:0,distanceMeters:0,durationSeconds:0,estimatedMinutes:0,googleRoute:{}};
  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const waypoints = cleanPoints.slice(1,-1).map(address=>({location:address,stopover:true}));
  return new Promise((resolve,reject)=>{
    const service = new google.maps.DirectionsService();
    service.route({origin,destination,waypoints,optimizeWaypoints:false,travelMode:google.maps.TravelMode.DRIVING,unitSystem:google.maps.UnitSystem.IMPERIAL},(response,status)=>{
      if(status !== "OK" || !response?.routes?.[0]){ reject(new Error("Google route failed: " + status)); return; }
      const route = response.routes[0]; let meters = 0; let seconds = 0;
      route.legs.forEach(leg=>{ meters += leg.distance ? leg.distance.value : 0; seconds += leg.duration ? leg.duration.value : 0; });
      resolve({miles:Number((meters * 0.000621371).toFixed(2)),distanceMeters:meters,durationSeconds:seconds,estimatedMinutes:Math.ceil(seconds/60),googleRoute:{summary:route.summary || "",waypointOrder:route.waypoint_order || [],legs:route.legs.map((leg,index)=>({legIndex:index,startAddress:leg.start_address,endAddress:leg.end_address,distanceText:leg.distance ? leg.distance.text : "",distanceMeters:leg.distance ? leg.distance.value : 0,durationText:leg.duration ? leg.duration.text : "",durationSeconds:leg.duration ? leg.duration.value : 0}))}});
    });
  });
}

/* ================= ROUTE DATA ================= */
function buildIndividualRoutePoints(trip){
  const points = [];
  const pickup = getConfirmPickup(trip);
  const stops = getConfirmStops(trip);
  const dropoff = getConfirmDropoff(trip);
  if(pickup) points.push(pickup);
  stops.forEach(s=>{ if(normalizeText(s)) points.push(s); });
  if(dropoff) points.push(dropoff);
  return points;
}
function getRealPassengersFromGroup(group){
  const first = group[0] || {};
  if(Array.isArray(first.passengers) && first.passengers.length) return first.passengers;
  return group.map((t,idx)=>({passengerId:"P"+(idx+1),name:t.name || t.clientName || "",phone:t.phone || t.clientPhone || "",clientName:t.clientName || t.name || "",clientPhone:t.clientPhone || t.phone || "",pickup:t.pickup || "",dropoff:t.dropoff || "",status:t.status || "Scheduled",priceAmount:t.priceAmount || 0,finalPrice:t.finalPrice || 0}));
}
function sortServerSharedPassengers(passengers){
  return [...(Array.isArray(passengers)?passengers:[])].sort((a,b)=>{
    const ap = Number(a.pickupOrder || 9999), bp = Number(b.pickupOrder || 9999); if(ap !== bp) return ap-bp;
    const ad = Number(a.dropoffOrder || 9999), bd = Number(b.dropoffOrder || 9999); if(ad !== bd) return ad-bd;
    const ar = Number(a.routeOrder || 9999), br = Number(b.routeOrder || 9999); if(ar !== br) return ar-br;
    return String(a.passengerId || "").localeCompare(String(b.passengerId || ""));
  });
}
function getServerSharedPassengers(group){ const first = group[0] || {}; return Array.isArray(first.passengers) && first.passengers.length ? sortServerSharedPassengers(first.passengers) : getRealPassengersFromGroup(group); }
function getServerSharedRoutePlan(group){
  const first = group?.[0] || {};
  const plan = Array.isArray(first.sharedRoutePlan) && first.sharedRoutePlan.length ? first.sharedRoutePlan : Array.isArray(first.routePlan) && first.routePlan.length ? first.routePlan : [];
  return [...plan].sort((a,b)=>Number(a.order || 0)-Number(b.order || 0));
}
function buildSharedRoutePointsFromPassengers(passengers){
  const active = (Array.isArray(passengers)?passengers:[]).filter(passengerIsActive);
  const pickups = [...active].sort((a,b)=>Number(a.pickupOrder ?? 9999)-Number(b.pickupOrder ?? 9999) || Number(a.routeOrder ?? 9999)-Number(b.routeOrder ?? 9999)).map(p=>normalizeAddress(p.pickup)).filter(Boolean);
  const dropoffs = [...active].sort((a,b)=>Number(a.dropoffOrder ?? 9999)-Number(b.dropoffOrder ?? 9999) || Number(a.routeOrder ?? 9999)-Number(b.routeOrder ?? 9999)).map(p=>normalizeAddress(p.dropoff)).filter(Boolean);
  return uniqueAddressList([...pickups,...dropoffs]);
}
function getServerSharedRoutePoints(group){
  const first = group[0] || {};
  const direct = Array.isArray(first.routePoints) ? first.routePoints.map(v=>typeof v === "string" ? normalizeAddress(v) : normalizeAddress(v?.address || "")).filter(Boolean) : [];
  if(direct.length >= 2) return uniqueAddressList(direct);
  const plan = getServerSharedRoutePlan(group);
  const fromPlan = plan.map(p=>normalizeAddress(p.address || "")).filter(Boolean);
  if(fromPlan.length >= 2) return uniqueAddressList(fromPlan);
  return buildSharedRoutePointsFromPassengers(getServerSharedPassengers(group));
}
async function buildSharedRoutePoints(group){ return getServerSharedRoutePoints(group); }
async function buildFinalSharedRoute(group){
  const passengers = getServerSharedPassengers(group);
  const routePlan = getServerSharedRoutePlan(group);
  const routePoints = getServerSharedRoutePoints(group);
  const activePassengers = passengers.filter(passengerIsActive);
  return {routePoints,routePlan,passengers,activePassengers,activeCount:activePassengers.length};
}
async function optimizeStopsFromOrigin(origin,stops){ return [normalizeUniqueAddress(origin)].filter(Boolean).concat(uniqueAddressList(stops || [])); }

/* ================= FILTERS ================= */
function isHiddenStatus(status){ const s = cleanStatus(status); return s.includes("complete") || s.includes("cancel") || s.includes("noshow") || s === "no"; }
function getTripsTabData(){ return trips.filter(t=>!isSharedTrip(t) && !isHiddenStatus(t.status)).sort((a,b)=>new Date(b.tripDate || b.createdAt || 0)-new Date(a.tripDate || a.createdAt || 0)); }
function getSharedGroups(){
  const map = {};
  trips.filter(t=>isSharedTrip(t) && !isHiddenStatus(t.status)).forEach(t=>{ const key = getSharedKey(t); if(!map[key]) map[key] = []; map[key].push(t); });
  return Object.values(map).map(group=>group.sort((a,b)=>Number(a.passengerIndex || 0)-Number(b.passengerIndex || 0))).sort((a,b)=>new Date(b[0]?.tripDate || b[0]?.createdAt || 0)-new Date(a[0]?.tripDate || a[0]?.createdAt || 0));
}
function groupItemsByTripDate(items){
  const groups = {};
  items.forEach(item=>{ const t = item.kind === "trip" ? item.trip : item.group[0]; const key = getTableDateKey(t); if(!groups[key]) groups[key] = []; groups[key].push(item); });
  return groups;
}

/* ================= VIEW ================= */
function viewLine(label,value){ return `<div class="view-line"><div class="view-label">${escapeHtml(label)}</div><div class="view-value">${escapeHtml(value || "--")}</div></div>`; }
function getBookedDate(t){ const raw = t?.bookedAt || t?.createdAt || t?.updatedAt || ""; if(!raw) return "--"; const d = new Date(raw); return isNaN(d) ? String(raw) : d.toLocaleDateString()+" "+d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function openReviewView(kind,key){
  let trip = null;
  if(kind === "trip") trip = trips.find(t=>String(t._id) === String(key));
  if(kind === "shared"){ const group = getSharedGroups().find(g=>getSharedKey(g[0]) === key); trip = group?.[0] || null; }
  if(!trip) return;
  const service = getServiceByTrip(trip);
  closeReviewView();
  const overlay = document.createElement("div");
  overlay.id = "reviewViewOverlay"; overlay.className = "view-overlay";
  overlay.innerHTML = `<div class="view-box"><div class="view-head"><div>Trip Details</div><button class="view-close" type="button" onclick="closeReviewView()">×</button></div><div class="view-body">${viewLine("Trip Number",trip.tripNumber || "")}${viewLine("Service",service?.name || service?.title || trip.serviceType || trip.serviceName || "")}${viewLine("Entry Name",trip.entryName || "")}${viewLine("Entry Phone",trip.entryPhone || "")}${viewLine("Company",trip.company || companyName || "")}${viewLine("Trip Date",trip.tripDate || "")}${viewLine("Trip Time",trip.tripTime || "")}${viewLine("Booked / Created",getBookedDate(trip))}${viewLine("Route Locked",trip.routeLocked === true ? "Yes" : "No")}</div></div>`;
  overlay.addEventListener("click",e=>{ if(e.target === overlay) closeReviewView(); });
  document.body.appendChild(overlay);
}
function closeReviewView(){ document.getElementById("reviewViewOverlay")?.remove(); }

/* ================= RENDER ================= */
function renderTabs(){
  if(activeTab === "SHARED" && !sharedEnabled()) activeTab = "TRIPS";
  const tabs = document.createElement("div"); tabs.className = "review-tabs";
  tabs.innerHTML = `<button id="reviewTripsTab" class="${activeTab === "TRIPS" ? "tab-active" : "tab-inactive"}" type="button">Trips</button>${sharedEnabled() ? `<button id="reviewSharedTab" class="${activeTab === "SHARED" ? "tab-active" : "tab-inactive"}" type="button">Shared</button>` : ""}`;
  container.appendChild(tabs);
  document.getElementById("reviewTripsTab")?.addEventListener("click",()=>{ activeTab="TRIPS"; render(); });
  document.getElementById("reviewSharedTab")?.addEventListener("click",()=>{ activeTab="SHARED"; render(); });
}
function applyRowColor(tr,t){
  const mins = minutesToTrip(t); const status = cleanStatus(t.status);
  if(status.includes("cancel")){ tr.classList.add("cancelled-row"); return; }
  if(mins !== null && mins <= 0){ tr.classList.add("past-row"); return; }
  if(mins !== null){
    if(mins <= 30){ tr.classList.add("red-dark"); if(status.includes("confirm")) tr.classList.add("trip-blink"); }
    else if(mins <= 60){ tr.classList.add("red-mid"); if(status.includes("confirm")) tr.classList.add("trip-blink"); }
    else if(mins <= 120) tr.classList.add("red-light");
    else if(mins <= 180) tr.classList.add("yellow");
    else if(status.includes("confirm")) tr.classList.add("confirmed-row");
    else tr.classList.add("scheduled-row");
  }
}
function renderTripButtons(t,editing){
  const service = getServiceByTrip(t); const mins = minutesToTrip(t); const warningMinutes = warningEnabled(service) ? getWarningMinutes(service) : 0; const status = cleanStatus(t.status); const stopBtn = renderAddStopButton(t);
  if(editing) return `<div class="actions-wrap"><button class="btn confirm" data-action="save-trip">Save</button><button class="btn cancel" data-action="cancel-edit">Cancel Edit</button></div>`;
  if(status.includes("cancel")) return `<div class="actions-wrap">${stopBtn}</div>`;
  if(mins > warningMinutes || mins === null) return `<div class="actions-wrap"><button class="btn edit" data-action="edit-trip">Edit</button><button class="btn delete" data-action="delete-trip">Delete</button><button class="btn confirm" data-action="confirm-trip">Confirm</button>${stopBtn}</div>`;
  if(mins <= warningMinutes && mins > 0 && !status.includes("confirm")) return `<div class="actions-wrap"><button class="btn confirm" data-action="confirm-trip">Confirm</button><button class="btn delete" data-action="delete-trip">Delete</button>${stopBtn}</div>`;
  if(mins <= warningMinutes && mins > 0 && status.includes("confirm")) return `<div class="actions-wrap"><button class="btn cancel" data-action="cancel-trip">Cancel</button>${stopBtn}</div>`;
  return `<div class="actions-wrap">${stopBtn}</div>`;
}
function getGroupStatus(group){ if(group.every(t=>cleanStatus(t.status).includes("cancel"))) return "Cancelled"; if(group.every(t=>cleanStatus(t.status).includes("confirm"))) return "Confirmed"; if(group.some(t=>cleanStatus(t.status).includes("confirm"))) return "Partially Confirmed"; return group[0]?.status || "Scheduled"; }
function getGroupPrice(group){
  const first = group[0] || {};
  if(Array.isArray(first.passengers) && first.passengers.length){ const total = first.passengers.reduce((sum,p)=>sum+getPassengerPrice(p),0); if(total > 0) return total; }
  return Number(first.priceAmount || first.finalPrice || 0);
}
function renderSharedButtons(group,editing){
  const first = group[0]; const service = getServiceByTrip(first); const mins = minutesToTrip(first); const warningMinutes = warningEnabled(service) ? getWarningMinutes(service) : 0; const status = cleanStatus(getGroupStatus(group));
  if(editing) return `<div class="actions-wrap"><button class="btn confirm" data-action="save-shared">Save</button><button class="btn cancel" data-action="cancel-edit">Cancel Edit</button></div>`;
  if(status.includes("cancel")) return "";
  if(mins > warningMinutes || mins === null) return `<div class="actions-wrap"><button class="btn edit" data-action="edit-shared">Edit</button><button class="btn delete" data-action="delete-shared">Delete</button><button class="btn confirm" data-action="confirm-shared">Confirm</button></div>`;
  if(mins <= warningMinutes && mins > 0 && !status.includes("confirm")) return `<div class="actions-wrap"><button class="btn confirm" data-action="confirm-shared">Confirm</button><button class="btn delete" data-action="delete-shared">Delete</button></div>`;
  if(mins <= warningMinutes && mins > 0 && status.includes("confirm")) return `<div class="actions-wrap"><button class="btn cancel" data-action="cancel-shared">Cancel</button></div>`;
  return "";
}
function renderTripRow(t,index){
  const tr = document.createElement("tr"); tr.dataset.id = t._id; const editing = t.__editing === true; const stops = getConfirmStops(t); const reviewPickup = getConfirmPickup(t); const reviewDropoff = getConfirmDropoff(t); applyRowColor(tr,t);
  tr.innerHTML = `<td class="col-num">${index}</td><td class="col-trip"><span class="trip-number-badge">${escapeHtml(t.tripNumber || "")}</span>${t.routeLocked === true ? `<div class="route-locked-badge">Route Locked</div>` : ""}${getStopRequestBadge(t)}</td><td class="col-client">${editing ? createEditInput(t.clientName || "","clientName") : cellBox(escapeHtml(t.clientName || "--"))}</td><td class="col-phone">${editing ? createEditInput(t.clientPhone || "","clientPhone") : cellBox(escapeHtml(t.clientPhone || "--"))}</td><td class="col-pickup">${editing ? createEditInput(reviewPickup || "","pickup") : cellBox(escapeHtml(reviewPickup || "--"))}</td><td class="col-stops">${editing ? stops.map((s,si)=>`<input class="edit-input" data-stop-index="${si}" value="${escapeHtml(s)}">`).join("") : cellBox(stops.length ? stops.map(s=>escapeHtml(s)) : "--")}</td><td class="col-drop">${editing ? createEditInput(reviewDropoff || "","dropoff") : cellBox(escapeHtml(reviewDropoff || "--"))}</td><td class="col-notes">${editing ? createEditInput(t.notes || "","notes") : cellBox(escapeHtml(t.notes || "--"))}</td><td class="col-date">${editing ? createEditInput(t.tripDate || "","tripDate","date") : escapeHtml(t.tripDate || "")}</td><td class="col-time">${editing ? createEditInput(t.tripTime || "","tripTime","time") : escapeHtml(t.tripTime || "")}</td><td class="col-status"><strong>${escapeHtml(t.status || "Scheduled")}</strong></td><td class="col-price"><span class="price-badge">$${formatMoney(getTripPrice(t))}</span></td><td class="col-miles"><span class="miles-strong">${t.miles ? Number(t.miles).toFixed(1)+" mi" : "-- mi"}</span></td><td class="col-actions">${renderTripButtons(t,editing)}</td><td class="col-eye"><button class="eye-btn" type="button" title="View" data-action="view-trip">👁️</button></td>`;
  return tr;
}
function renderSharedRow(group,index){
  const first = group[0]; const tr = document.createElement("tr"); tr.dataset.groupId = getSharedKey(first); const editing = first.__editing === true; const passengers = getServerSharedPassengers(group); applyRowColor(tr,first);
  let clients="",phones="",pickups="",drops="";
  if(editing){
    clients = passengers.map((p,idx)=>createSharedEditInput(p.name || p.clientName || "",`passenger_${idx}_name`)).join("");
    phones = passengers.map((p,idx)=>createSharedEditInput(p.phone || p.clientPhone || "",`passenger_${idx}_phone`)).join("");
    pickups = passengers.map((p,idx)=>createSharedEditInput(p.pickup || "",`passenger_${idx}_pickup`)).join("");
    drops = passengers.map((p,idx)=>createSharedEditInput(p.dropoff || "",`passenger_${idx}_dropoff`)).join("");
  }else{
    const plan = getServerSharedRoutePlan(group);
    const pickupRoute = plan.filter(p=>String(p.type || "").toLowerCase() === "pickup").map(p=>p.address).filter(Boolean);
    const dropRoute = plan.filter(p=>String(p.type || "").toLowerCase() === "dropoff").map(p=>p.address).filter(Boolean);
    clients = cellBox(passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.name || p.clientName || "--")}`));
    phones = cellBox(passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.phone || p.clientPhone || "--")}`));
    pickups = cellBox((pickupRoute.length ? pickupRoute : passengers.map(p=>p.pickup)).map((a,idx)=>`${idx+1}. ${escapeHtml(a || "--")}`));
    drops = cellBox((dropRoute.length ? dropRoute : passengers.map(p=>p.dropoff)).map((a,idx)=>`${idx+1}. ${escapeHtml(a || "--")}`));
  }
  tr.innerHTML = `<td class="col-num">${index}</td><td class="col-trip"><span class="trip-number-badge">${escapeHtml(first.tripNumber || "")}</span>${first.routeLocked === true ? `<div class="route-locked-badge">Route Locked</div>` : ""}</td><td class="col-client">${editing ? `<div class="multi-line">${clients}</div>` : clients}</td><td class="col-phone">${editing ? `<div class="multi-line">${phones}</div>` : phones}</td><td class="col-pickup">${editing ? `<div class="multi-line">${pickups}</div>` : pickups}</td><td class="col-stops"><strong>${Number(first.sharedStopsCount || Math.max(0,passengers.filter(passengerIsActive).length - 1))}</strong></td><td class="col-drop">${editing ? `<div class="multi-line">${drops}</div>` : drops}</td><td class="col-notes">${editing ? createSharedEditInput(first.notes || "","notes") : cellBox(escapeHtml(first.notes || "--"))}</td><td class="col-date">${editing ? createSharedEditInput(first.tripDate || "","tripDate","date") : escapeHtml(first.tripDate || "")}</td><td class="col-time">${editing ? createSharedEditInput(first.tripTime || "","tripTime","time") : escapeHtml(first.tripTime || "")}</td><td class="col-status"><strong>${escapeHtml(getGroupStatus(group))}</strong></td><td class="col-price"><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td><td class="col-miles"><span class="miles-strong">${first.miles ? Number(first.miles).toFixed(1)+" mi" : "-- mi"}</span></td><td class="col-actions">${renderSharedButtons(group,editing)}</td><td class="col-eye"><button class="eye-btn" type="button" title="View" data-action="view-shared">👁️</button></td>`;
  return tr;
}
function renderUnifiedTable(items,kind){
  const wrap = document.createElement("div"); wrap.className = "table-wrap";
  const table = document.createElement("table"); table.className = "review-table";
  table.innerHTML = `<thead><tr><th class="col-num">#</th><th class="col-trip">Trip#</th><th class="col-client">${kind === "shared" ? "Clients" : "Client"}</th><th class="col-phone">${kind === "shared" ? "Phones" : "Phone"}</th><th class="col-pickup">${kind === "shared" ? "Pickups" : "Pickup"}</th><th class="col-stops">Stops</th><th class="col-drop">${kind === "shared" ? "Drops" : "Drop"}</th><th class="col-notes">Notes</th><th class="col-date">Date</th><th class="col-time">Time</th><th class="col-status">Status</th><th class="col-price">Price</th><th class="col-miles">Miles</th><th class="col-actions">Actions</th><th class="col-eye">👁️</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody"); const grouped = groupItemsByTripDate(items); let counter = 1;
  Object.keys(grouped).sort((a,b)=>{ if(a === "Unknown") return 1; if(b === "Unknown") return -1; return new Date(b)-new Date(a); }).forEach(date=>{
    const dateRow = document.createElement("tr"); dateRow.className = "date-row"; dateRow.innerHTML = `<td colspan="15">Trip Date: ${escapeHtml(date)}</td>`; tbody.appendChild(dateRow);
    grouped[date].forEach(item=>{ tbody.appendChild(item.kind === "trip" ? renderTripRow(item.trip,counter++) : renderSharedRow(item.group,counter++)); });
  });
  wrap.appendChild(table); container.appendChild(wrap);
}
function renderTripsTable(list){ const items = list.map(t=>({kind:"trip",trip:t})); if(!items.length){ const e=document.createElement("div"); e.style.padding="20px"; e.style.fontWeight="700"; e.innerText="No trips found."; container.appendChild(e); return; } renderUnifiedTable(items,"trip"); }
function renderSharedTable(groups){ const items = groups.map(group=>({kind:"shared",group})); if(!items.length){ const e=document.createElement("div"); e.style.padding="20px"; e.style.fontWeight="700"; e.innerText="No shared trips found."; container.appendChild(e); return; } renderUnifiedTable(items,"shared"); }
function render(){ container.innerHTML = ""; renderTabs(); if(activeTab === "TRIPS") renderTripsTable(getTripsTabData()); if(activeTab === "SHARED") renderSharedTable(getSharedGroups()); }

/* ================= SAVE SIGNATURES ================= */
function buildIndividualRouteSignatureForEdit(trip,nextPayload={},nextStops=null){ return JSON.stringify({pickup:normRouteAddressOnly(nextPayload.pickup ?? trip.pickup),stops:Array.isArray(nextStops)?normalizeStopsForSignature(nextStops):normalizeStopsForSignature(trip.stops),dropoff:normRouteAddressOnly(nextPayload.dropoff ?? trip.dropoff)}); }
function buildSharedRouteSignatureForEdit(passengers){ return JSON.stringify((Array.isArray(passengers)?passengers:[]).map((p,index)=>({id:String(p.passengerId || p._id || index),pickup:normRouteAddressOnly(p.pickup),dropoff:normRouteAddressOnly(p.dropoff),status:cleanStatus(p.status || "Scheduled")}))); }

/* ================= ACTIONS ================= */
async function reloadTrips(){ trips = await fetchTrips(); render(); }
async function handleEditTrip(btn){ const id = btn.closest("tr")?.dataset?.id; const trip = trips.find(t=>String(t._id) === String(id)); if(!trip) return; trip.__editing = true; render(); }
async function handleEditShared(btn){ const groupId = btn.closest("tr")?.dataset?.groupId; const group = getSharedGroups().find(g=>getSharedKey(g[0]) === groupId); if(!group) return; group.forEach(t=>t.__editing = true); render(); }
async function handleCancelEdit(){ await reloadTrips(); }
async function handleDeleteTrip(btn){ const id = btn.closest("tr")?.dataset?.id; if(!id) return; if(!confirm("Delete this trip?")) return; await deleteTrip(id); await reloadTrips(); }
async function handleDeleteShared(btn){ const groupId = btn.closest("tr")?.dataset?.groupId; const group = getSharedGroups().find(g=>getSharedKey(g[0]) === groupId); if(!group) return; if(!confirm("Delete this shared trip?")) return; for(const t of group){ await deleteTrip(t._id); } await reloadTrips(); }

async function handleSaveTrip(btn){
  const tr = btn.closest("tr"); const id = tr.dataset.id; const trip = trips.find(t=>String(t._id) === String(id)); if(!trip) return;
  const payload = {}; const stops = Array.isArray(trip.stops) ? [...trip.stops] : [];
  tr.querySelectorAll(".edit-input").forEach(input=>{ const field=input.dataset.field; const stopIndex=input.dataset.stopIndex; if(stopIndex !== undefined){ stops[Number(stopIndex)] = normalizeAddress(input.value); return; } if(field === "pickup" || field === "dropoff") payload[field] = normalizeAddress(input.value); else if(field) payload[field] = input.value; });
  validateFutureTripDateTime(payload.tripDate ?? trip.tripDate,payload.tripTime ?? trip.tripTime);
  payload.stops = stops.filter(Boolean);
  const routeChanged = buildIndividualRouteSignatureForEdit(trip) !== buildIndividualRouteSignatureForEdit(trip,payload,stops);
  const nextPickup = payload.pickup ?? trip.pickup ?? ""; const nextDropoff = payload.dropoff ?? trip.dropoff ?? "";
  payload.pickupLat = routeAddressChanged(trip.pickup,nextPickup) ? null : coordinatesValue(trip.pickupLat);
  payload.pickupLng = routeAddressChanged(trip.pickup,nextPickup) ? null : coordinatesValue(trip.pickupLng);
  payload.dropoffLat = routeAddressChanged(trip.dropoff,nextDropoff) ? null : coordinatesValue(trip.dropoffLat);
  payload.dropoffLng = routeAddressChanged(trip.dropoff,nextDropoff) ? null : coordinatesValue(trip.dropoffLng);
  if(routeChanged){ Object.assign(payload,{status:"Scheduled",dispatchSelected:false,priceAmount:0,finalPrice:0,miles:0,distanceMeters:0,durationSeconds:0,estimatedMinutes:0,googleRoute:null,routePoints:[],routePlan:[],sharedRoutePlan:[],optimizedRoute:null,routeLocked:false,routeFinalized:false,routeSource:"route-edited",routeUpdatedAt:null,routeChangePending:true,routeChangeStatus:"ROUTE_CHANGED"}); }
  await updateTrip(id,payload); await reloadTrips();
}
async function handleSaveShared(btn){
  const tr = btn.closest("tr"); const groupId = tr.dataset.groupId; const group = getSharedGroups().find(g=>getSharedKey(g[0]) === groupId); if(!group) return;
  const originalPassengers = getServerSharedPassengers(group).map(p=>({...p})); const passengers = originalPassengers.map(p=>({...p})); const payload = {};
  tr.querySelectorAll(".edit-input").forEach(input=>{ const field=input.dataset.field; if(!field) return; if(field.startsWith("passenger_")){ const parts=field.split("_"); const index=Number(parts[1]); const key=parts[2]; if(!passengers[index]) return; if(key === "name"){ passengers[index].name=input.value; passengers[index].clientName=input.value; } if(key === "phone"){ passengers[index].phone=input.value; passengers[index].clientPhone=input.value; } if(key === "pickup") passengers[index].pickup=normalizeAddress(input.value); if(key === "dropoff") passengers[index].dropoff=normalizeAddress(input.value); return; } payload[field]=input.value; });
  for(const p of passengers){ if(!normalizeText(p.clientName || p.name)) throw new Error("Passenger name required"); if(!normalizeText(p.clientPhone || p.phone)) throw new Error("Passenger phone required"); if(!normalizeText(p.pickup)) throw new Error("Passenger pickup required"); if(!normalizeText(p.dropoff)) throw new Error("Passenger dropoff required"); }
  validateFutureTripDateTime(payload.tripDate ?? group[0].tripDate,payload.tripTime ?? group[0].tripTime);
  payload.passengers = passengers.map((p,index)=>{ const old=originalPassengers[index] || {}; const pickupChanged=routeAddressChanged(old.pickup,p.pickup); const dropChanged=routeAddressChanged(old.dropoff,p.dropoff); return {...p,passengerId:p.passengerId || old.passengerId || "P"+(index+1),name:normalizeText(p.name || p.clientName),phone:normalizeText(p.phone || p.clientPhone),clientName:normalizeText(p.clientName || p.name),clientPhone:normalizeText(p.clientPhone || p.phone),pickup:normalizeAddress(p.pickup),pickupLat:pickupChanged?null:coordinatesValue(p.pickupLat ?? old.pickupLat),pickupLng:pickupChanged?null:coordinatesValue(p.pickupLng ?? old.pickupLng),dropoff:normalizeAddress(p.dropoff),dropoffLat:dropChanged?null:coordinatesValue(p.dropoffLat ?? old.dropoffLat),dropoffLng:dropChanged?null:coordinatesValue(p.dropoffLng ?? old.dropoffLng),status:p.status || old.status || "Scheduled"}; });
  payload.pickup = payload.passengers[0]?.pickup || ""; payload.dropoff = payload.passengers[payload.passengers.length-1]?.dropoff || ""; payload.totalPassengers = payload.passengers.length; payload.passengerCount = payload.passengers.length; payload.passengersCount = payload.passengers.length;
  const routeChanged = buildSharedRouteSignatureForEdit(originalPassengers) !== buildSharedRouteSignatureForEdit(payload.passengers);
  if(routeChanged){ Object.assign(payload,{status:"Scheduled",dispatchSelected:false,priceAmount:0,finalPrice:0,pricePerPassenger:0,miles:0,distanceMeters:0,durationSeconds:0,estimatedMinutes:0,googleRoute:null,routePoints:[],routePlan:[],sharedRoutePlan:[],optimizedRoute:null,routeLocked:false,routeFinalized:false,routeSource:"route-edited",routeUpdatedAt:null,sharedRouteLocked:false,sharedRouteLockedAt:null,sharedRouteMeta:null,sharedRoutePolyline:"",sharedRouteMiles:0,sharedRouteMinutes:0,sharedRouteSignature:"",sharedGoogleRequestsUsed:0,routeChangePending:true,routeChangeStatus:"ROUTE_CHANGED"}); payload.passengers = payload.passengers.map((p,index)=>({...p,pickupOrder:0,dropoffOrder:0,routeOrder:index+1,passengerMiles:0,passengerMinutes:0,passengerDistanceMeters:0,passengerDurationSeconds:0,priceAmount:0,finalPrice:0})); }
  for(const t of group){ await updateTrip(t._id,payload); }
  await reloadTrips();
}

async function handleConfirmTrip(btn){
  const tr = btn.closest("tr"); const id = tr.dataset.id; const trip = trips.find(t=>String(t._id) === String(id)); if(!trip) return;
  const service = getServiceByTrip(trip); if(!service) throw new Error("Service not found for this trip");
  const oldText = btn.textContent;
  try{
    btn.disabled = true; btn.textContent = "Routing...";
    const routePoints = buildIndividualRoutePoints(trip); const routeData = await calculateRouteMiles(routePoints);
    btn.textContent = "Pricing...";
    const serviceKey = service.serviceKey || trip.serviceKey || trip.serviceType || "STANDARD";
    const finalStops = getConfirmStops(trip);
    const total = await calculateServerPrice({serviceKey,company:trip.company || trip.facilityName || trip.companyName || localStorage.getItem("name") || "",facilityId:trip.facilityId || trip.companyId || trip.userId || localStorage.getItem("facilityId") || localStorage.getItem("companyId") || localStorage.getItem("userId") || localStorage.getItem("_id") || localStorage.getItem("id") || "",miles:routeData.miles,stops:Array.isArray(finalStops)?finalStops.length:0,minutes:routeData.estimatedMinutes,passengerCount:1,isCompany:true});
    await updateTrip(id,{status:"Confirmed",dispatchSelected:true,priceAmount:total,finalPrice:total,miles:routeData.miles,distanceMeters:routeData.distanceMeters,durationSeconds:routeData.durationSeconds,estimatedMinutes:routeData.estimatedMinutes,googleRoute:routeData.googleRoute,routePoints,optimizedRoute:routeData.googleRoute,pickupLat:coordinatesValue(trip.pickupLat),pickupLng:coordinatesValue(trip.pickupLng),dropoffLat:coordinatesValue(trip.dropoffLat),dropoffLng:coordinatesValue(trip.dropoffLng),routeLocked:true,routeFinalized:true,routeSource:"company-review",routeUpdatedAt:new Date().toISOString(),serviceName:service?.name || service?.title || "",serviceCode:service?.serviceKey || service?.companySuffix || service?.code || service?.serviceCode || "",serviceId:service?._id || ""});
    await reloadTrips();
  }finally{ btn.disabled = false; btn.textContent = oldText || "Confirm"; }
}

async function handleConfirmShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g=>getSharedKey(g[0]) === groupId);
  if(!group || !group.length) throw new Error("Shared group not found");
  const first = group[0];
  if(!first?._id) throw new Error("Shared trip id missing");
  const service = getServiceByTrip(first) || COMPANY_SERVICES.find(s=>isSharedService(s));
  if(!service) throw new Error("Shared service not found");
  const oldText = btn.textContent;
  try{
    btn.disabled = true;
    btn.textContent = "Confirming...";
    /*
      IMPORTANT:
      Shared route / miles / minutes / price must be calculated by server only.
      Same flow as Dispatch Add Trip.
      No frontend Google route.
      No frontend shared ordering.
      No frontend price calculation.
    */
    await confirmTripOnServer(first._id);
    await reloadTrips();
  }catch(err){
    console.error("CONFIRM SHARED SERVER ERROR:",err);
    throw new Error(err.message || "Shared confirm failed");
  }finally{
    btn.disabled = false;
    btn.textContent = oldText || "Confirm";
  }
}

async function handleCancelTrip(btn){
  const id = btn.closest("tr")?.dataset?.id; if(!id) return; if(!confirm("Cancel this trip?")) return;
  const res = await fetch("/api/company/cancel-trip/" + encodeURIComponent(id),{method:"POST",headers:{Authorization:"Bearer " + token}});
  const data = await res.json().catch(()=>({})); if(!res.ok || data.success === false) throw new Error(data.message || "Cancel failed");
  await reloadTrips();
}
async function handleCancelShared(btn){
  const groupId = btn.closest("tr")?.dataset?.groupId; const group = getSharedGroups().find(g=>getSharedKey(g[0]) === groupId); if(!group) return; if(!confirm("Cancel this shared trip?")) return;
  for(const t of group){ const res = await fetch("/api/company/cancel-trip/" + encodeURIComponent(t._id),{method:"POST",headers:{Authorization:"Bearer " + token}}); const data = await res.json().catch(()=>({})); if(!res.ok || data.success === false) throw new Error(data.message || "Cancel shared failed"); }
  await reloadTrips();
}
async function handleAddStop(btn){ const id = btn.closest("tr")?.dataset?.id; if(!id) return; const trip = trips.find(t=>String(t._id) === String(id)); if(!trip) return; if(isSharedTrip(trip)){ alert("Add Stop is not available for shared trips"); return; } if(!serviceAllowsAddStop(trip)){ alert("Add Stop is not enabled for this service"); return; } window.location.href = `/companies/company-add-stop.html?tripId=${encodeURIComponent(id)}`; }
async function handleCancelStop(btn){
  const id = btn.closest("tr")?.dataset?.id; if(!id) return; const trip = trips.find(t=>String(t._id) === String(id)); if(!trip) return; const req = getVisibleAddStopRequest(trip); if(!req){ alert("There is no active stop request to cancel"); await reloadTrips(); return; } if(!confirm("Cancel added stop request?")) return;
  await updateTrip(id,{addStopRequest:{...req,active:false,status:"CANCELLED_BY_COMPANY",cancelledAt:new Date().toISOString(),updatedAt:new Date().toISOString()},routeChangePending:false,routeChangeStatus:"CANCELLED"});
  await reloadTrips();
}

/* ================= EVENTS ================= */
container.addEventListener("click",async e=>{
  const btn = e.target.closest("button"); if(!btn) return; const action = btn.dataset.action; if(!action) return;
  try{
    if(action === "edit-trip") await handleEditTrip(btn);
    if(action === "edit-shared") await handleEditShared(btn);
    if(action === "cancel-edit") await handleCancelEdit(btn);
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
    if(action === "view-trip"){ const tr = btn.closest("tr"); openReviewView("trip",tr?.dataset?.id || ""); }
    if(action === "view-shared"){ const tr = btn.closest("tr"); openReviewView("shared",tr?.dataset?.groupId || ""); }
  }catch(err){ console.error(err); alert(err.message || "Server Error"); await reloadTrips(); }
});

/* ================= EXPORT ================= */
Object.assign(window,{openReviewView,closeReviewView});
window.ReviewApp = {token,companyName,container,get trips(){return trips;},set trips(v){trips=v;},get COMPANY_SERVICES(){return COMPANY_SERVICES;},refreshData,render,normalizeText,escapeHtml,formatMoney,getAZNow,normalizeAddress,parseTripDateTime,minutesToTrip,getSharedKey,getRealPassengersFromGroup,getServiceByTrip,isSharedTrip,isSharedService,getWarningMinutes,warningEnabled,calculateRouteMiles,buildIndividualRoutePoints,buildSharedRoutePoints,buildFinalSharedRoute,optimizeStopsFromOrigin,fetchTrips,updateTrip,deleteTrip,confirmTripOnServer,getTripsTabData,getSharedGroups,calculateServerPrice};

/* ================= AUTO ADD STOP ================= */
async function autoApplyAddStopRequests(){
  const candidates = trips.filter(t=>getActiveAddStopRequest(t) && !isSharedTrip(t) && !autoApplyingAddStops.has(String(t._id)));
  for(const trip of candidates){
    const id = String(trip._id);
    try{
      autoApplyingAddStops.add(id);
      const service = getServiceByTrip(trip); if(!service) continue;
      const activeReq = getActiveAddStopRequest(trip); if(!activeReq) continue;
      const finalPickup = getConfirmPickup(trip); const finalStops = getConfirmStops(trip); const finalDropoff = getConfirmDropoff(trip); const routePoints = buildIndividualRoutePoints(trip);
      if(routePoints.length < 2) continue;
      const routeData = await calculateRouteMiles(routePoints);
      const serviceKey = service.serviceKey || trip.serviceKey || trip.serviceType || "STANDARD";
      const total = await calculateServerPrice({serviceKey,miles:routeData.miles,stops:finalStops.length,minutes:routeData.estimatedMinutes,passengerCount:1});
      await updateTrip(id,{pickup:finalPickup,stops:finalStops,dropoff:finalDropoff,pickupLat:routeAddressChanged(trip.pickup,finalPickup)?null:coordinatesValue(trip.pickupLat),pickupLng:routeAddressChanged(trip.pickup,finalPickup)?null:coordinatesValue(trip.pickupLng),dropoffLat:routeAddressChanged(trip.dropoff,finalDropoff)?null:coordinatesValue(trip.dropoffLat),dropoffLng:routeAddressChanged(trip.dropoff,finalDropoff)?null:coordinatesValue(trip.dropoffLng),priceAmount:total,finalPrice:total,miles:routeData.miles,distanceMeters:routeData.distanceMeters,durationSeconds:routeData.durationSeconds,estimatedMinutes:routeData.estimatedMinutes,googleRoute:routeData.googleRoute,routePoints,optimizedRoute:routeData.googleRoute,routeLocked:true,routeFinalized:true,routeSource:"company-add-stop-auto-review",routeUpdatedAt:new Date().toISOString(),addStopRequest:{...activeReq,active:false,status:"COMPLETED",completedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),appliedAutomatically:true,appliedPickup:finalPickup,appliedStops:finalStops,appliedDropoff:finalDropoff,appliedMiles:routeData.miles,appliedPrice:total},routeChangePending:false,routeChangeStatus:"COMPLETED"});
    }catch(err){ console.error("AUTO ADD STOP ERROR:",trip.tripNumber,err); }
    finally{ autoApplyingAddStops.delete(id); }
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
setInterval(async()=>{ const hasEditing = trips.some(t=>t.__editing); if(hasEditing) return; await refreshData(); },30000);

});
