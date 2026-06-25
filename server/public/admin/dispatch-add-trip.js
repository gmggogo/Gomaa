/* =====================================================
FILE: public/admin/dispatch-add-trip.js
DISPATCH ADD TRIP - RESERVED RV DB FIRST
Final Version

POLICY:
- Add Trip stays inside dispatchAddWrapper/container
- Review is full page outside any frame
- Review grouping by CREATED date, not trip date
- Add To Review stays on Add page and clears form
- Individual Add Stop returns, max 5 stops
- Confirm builds final route first, then miles/minutes, then price
- Shared: every passenger has own Base Fare + own Included Miles
- Shared stops count from final route
- No CSS injection
===================================================== */

document.addEventListener("DOMContentLoaded", async function(){

/* ================= CONFIG ================= */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
  return;
}

/* ================= STATE ================= */

let SERVICES = [];
let activeService = null;
let reviewTrips = [];
let addTripStops = [];

let SYSTEM_TIMEZONE = "America/Phoenix";
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";

let googleLoadPromise = null;

/* ================= DOM ================= */

const addWrapper =
  document.getElementById("dispatchAddWrapper");

const addTripPage =
  document.getElementById("dispatchAddPage");

const dispatchReviewPage =
  document.getElementById("dispatchReviewPage");

const dispatchReviewList =
  document.getElementById("dispatchReviewList");

const backToHubBtn =
  document.getElementById("backToHubBtn");

const showAddBtn =
  document.getElementById("showAddBtn");

const showReviewBtn =
  document.getElementById("showReviewBtn");

const reviewBackToHubBtn =
  document.getElementById("reviewBackToHubBtn");

const reviewShowAddBtn =
  document.getElementById("reviewShowAddBtn");

const reviewShowReviewBtn =
  document.getElementById("reviewShowReviewBtn");

const companyTabs =
  document.getElementById("companyTabs");

const individualSection =
  document.getElementById("individualSection");

const sharedSection =
  document.getElementById("sharedSection");

const entryName =
  document.getElementById("entryName");

const entryPhone =
  document.getElementById("entryPhone");

const editEntryBtn =
  document.getElementById("editEntryBtn");

const saveEntryBtn =
  document.getElementById("saveEntryBtn");

const clientName =
  document.getElementById("clientName");

const clientPhone =
  document.getElementById("clientPhone");

const pickupInput =
  document.getElementById("pickup");

const dropoffInput =
  document.getElementById("dropoff");

const tripDate =
  document.getElementById("tripDate");

const tripTime =
  document.getElementById("tripTime");

const notes =
  document.getElementById("notes");

const stopsBox =
  document.getElementById("stops");

let addStopBtn =
  document.getElementById("addStopBtn");

const submitTripBtn =
  document.getElementById("submitTrip");

const saveDraftBtn =
  document.getElementById("saveDraftBtn");

const sharedEntryName =
  document.getElementById("sharedEntryName");

const sharedEntryPhone =
  document.getElementById("sharedEntryPhone");

const editSharedEntryBtn =
  document.getElementById("editSharedEntryBtn");

const saveSharedEntryBtn =
  document.getElementById("saveSharedEntryBtn");

const passengerCount =
  document.getElementById("passengerCount");

const sharedDate =
  document.getElementById("sharedDate");

const sharedTime =
  document.getElementById("sharedTime");

const sharedNotes =
  document.getElementById("sharedNotes");

const passengersContainer =
  document.getElementById("passengersContainer");

const submitSharedBtn =
  document.getElementById("submitShared");

const saveSharedDraftBtn =
  document.getElementById("saveSharedDraftBtn");

/* ================= HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
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

function bool(v){
  return (
    v === true ||
    String(v).toLowerCase() === "true" ||
    String(v).toLowerCase() === "yes" ||
    String(v).toLowerCase() === "1"
  );
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function showAlert(msg){
  alert(msg);
}

function formatMoney(v){
  return Number(v || 0).toFixed(2);
}

function normalizeCode(v){

  const c =
    normalizeText(v)
      .toUpperCase()
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!c) return "";

  if(c === "STANDARD" || c === "ST") return "ST";

  if(
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c === "WC" ||
    c === "WH"
  ){
    return "WH";
  }

  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMO" || c === "LIMOUSINE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function isValidServiceCode(code){
  return ["ST","WH","XL","LM","TX","SH"].includes(normalizeCode(code));
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

function addressKey(v){
  return normalizeAddress(v).toLowerCase().replace(/\s+/g," ").trim();
}

function cellBox(items){

  const arr =
    Array.isArray(items)
      ? items
      : [items];

  return `
    <div class="cell-box">
      ${
        arr.map(v=>`
          <div class="cell-item">
            ${v || "--"}
          </div>
        `).join("")
      }
    </div>
  `;
}

function createEditInput(value,field,type="text"){
  return `
    <input
      class="edit-input"
      type="${type}"
      data-field="${field}"
      value="${escapeHtml(value || "")}"
    >
  `;
}

function createSharedEditInput(value,field,type="text"){
  return `
    <input
      class="edit-input"
      type="${type}"
      data-field="${field}"
      value="${escapeHtml(value || "")}"
    >
  `;
}

/* ================= UI FIXES ================= */

localStorage.removeItem("dispatchReviewTrips");

function hideDuplicateReviewTop(){

  if(!dispatchReviewPage) return;

  dispatchReviewPage
    .querySelectorAll(".review-top-actions,.dispatch-review-note")
    .forEach(el=>{
      el.style.display = "none";
    });
}

function ensureAddStopButton(){

  if(addStopBtn) return;

  if(!stopsBox) return;

  const actions =
    document.createElement("div");

  actions.className = "actions";
  actions.style.marginTop = "10px";

  actions.innerHTML = `
    <button class="btn-light" id="addStopBtn" type="button">
      + Add Stop
    </button>
  `;

  stopsBox.insertAdjacentElement("afterend",actions);

  addStopBtn =
    document.getElementById("addStopBtn");
}

hideDuplicateReviewTop();
ensureAddStopButton();

/* ================= SYSTEM ================= */

async function loadSystemInfo(){

  try{

    const res = await fetch("/api/system-design");
    const data = await res.json();

    SYSTEM_TIMEZONE =
      data?.timezone ||
      "America/Phoenix";

    SYSTEM_REGION =
      data?.region ||
      "";

    SYSTEM_COUNTRY =
      data?.country ||
      "";

  }catch(err){

    console.log(err);

    SYSTEM_TIMEZONE =
      "America/Phoenix";
  }
}

function getSystemNow(){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:SYSTEM_TIMEZONE || "America/Phoenix"
      }
    )
  );
}

function parseTripDateTime(dateValue,timeValue){

  const d = normalizeText(dateValue);
  let t = normalizeText(timeValue);

  if(!d || !t) return null;

  const ampm =
    t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if(ampm){

    let h = Number(ampm[1]);
    const m = String(ampm[2]).padStart(2,"0");
    const ap = ampm[3].toUpperCase();

    if(ap === "PM" && h < 12) h += 12;
    if(ap === "AM" && h === 12) h = 0;

    t = `${String(h).padStart(2,"0")}:${m}`;
  }

  if(/^\d{1,2}:\d{2}$/.test(t)){
    const [h,m] = t.split(":");
    t = `${String(h).padStart(2,"0")}:${m}`;
  }

  const dt = new Date(`${d}T${t}:00`);

  return Number.isNaN(dt.getTime()) ? null : dt;
}

function minutesToTrip(trip){

  const dt =
    parseTripDateTime(
      trip.tripDate,
      trip.tripTime
    );

  if(!dt) return null;

  return (dt - getSystemNow()) / 60000;
}

function getCreatedDateObject(trip){

  const raw =
    trip.createdAt ||
    trip.bookedAt ||
    trip.updatedAt ||
    trip.routeUpdatedAt ||
    trip.tripCreatedAt ||
    trip._createdAt ||
    "";

  const d =
    raw
      ? new Date(raw)
      : null;

  if(d && !Number.isNaN(d.getTime())){
    return d;
  }

  return new Date(0);
}

function getCreatedDateKey(trip){

  const d =
    getCreatedDateObject(trip);

  if(!d || Number.isNaN(d.getTime()) || d.getTime() === 0){
    return "Unknown";
  }

  const local =
    new Date(
      d.toLocaleString(
        "en-US",
        {
          timeZone:SYSTEM_TIMEZONE || "America/Phoenix"
        }
      )
    );

  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2,"0");
  const day = String(local.getDate()).padStart(2,"0");

  return `${y}-${m}-${day}`;
}

function dateOnlyLocal(date){

  const local =
    new Date(
      date.toLocaleString(
        "en-US",
        {
          timeZone:SYSTEM_TIMEZONE || "America/Phoenix"
        }
      )
    );

  return new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate()
  );
}

function labelCreatedDate(key){

  if(key === "Unknown") return "Unknown Date";

  const today =
    dateOnlyLocal(getSystemNow());

  const target =
    new Date(`${key}T00:00:00`);

  const diffDays =
    Math.round((today - target) / 86400000);

  if(diffDays === 0){
    return `Today - ${key}`;
  }

  if(diffDays === 1){
    return `Yesterday - ${key}`;
  }

  return key;
}

/* ================= SERVICE MAPPING ================= */

function resolveServiceCode(service){

  if(!service) return "";

  const fields = [
    service.reservedSuffix,
    service.serviceSuffix,
    service.suffix,
    service.companySuffix,
    service.getQuoteSuffix,
    service.reservedServiceSuffix,
    service.tripNumberSuffix,

    service.reservedServiceCode,
    service.serviceCode,
    service.code,

    service.reservedServiceKey,
    service.serviceKey,
    service.serviceType,
    service.vehicle
  ];

  for(const field of fields){

    const code =
      normalizeCode(field);

    if(isValidServiceCode(code)){
      return code;
    }
  }

  const name =
    normalizeCode(
      service.serviceName ||
      service.title ||
      service.name ||
      ""
    );

  if(name.includes("WHEEL")) return "WH";
  if(name.includes("CHAIR")) return "WH";
  if(name.includes("SHARED")) return "SH";
  if(name.includes("LIMO")) return "LM";
  if(name.includes("TAXI")) return "TX";
  if(name.includes("XL")) return "XL";
  if(name.includes("STANDARD")) return "ST";

  return "";
}

function serviceDisplayName(service,code){

  return (
    service?.serviceName ||
    service?.title ||
    service?.name ||
    (
      code === "ST" ? "Standard" :
      code === "WH" ? "Wheelchair" :
      code === "XL" ? "XL" :
      code === "LM" ? "Limousine" :
      code === "TX" ? "Taxi" :
      code === "SH" ? "Shared" :
      code || "Service"
    )
  );
}

function mapReservedService(s){

  const code =
    resolveServiceCode(s) || "ST";

  const serviceName =
    serviceDisplayName(s,code);

  const shared =
    bool(s.reservedShared) ||
    bool(s.shared) ||
    code === "SH" ||
    normalizeCode(s.reservedPricingMode || s.pricingMode) === "SHARED";

  return {
    ...s,

    _id:
      s._id || code,

    title:
      serviceName,

    name:
      serviceName,

    serviceName:
      serviceName,

    serviceKey:
      code,

    serviceCode:
      code,

    serviceType:
      code,

    code:
      code,

    reservedSuffix:
      code,

    serviceSuffix:
      code,

    suffix:
      code,

    tripNumberSuffix:
      code,

    reservedShared:
      shared,

    shared:
      shared
  };
}

function serviceVisible(service){
  return bool(service?.reservedEnabled);
}

function isSharedService(service){

  if(!service) return false;

  const code =
    resolveServiceCode(service);

  const title =
    normalizeCode(
      service.title ||
      service.name ||
      service.serviceName
    );

  const mode =
    normalizeCode(
      service.reservedPricingMode ||
      service.pricingMode
    );

  return (
    bool(service.reservedShared) ||
    bool(service.shared) ||
    code === "SH" ||
    title === "SH" ||
    title === "SHARED" ||
    mode === "SHARED" ||
    mode === "SH"
  );
}

function getCurrentReservedServiceConfig(){

  const code =
    resolveServiceCode(activeService);

  return SERVICES.find(s => resolveServiceCode(s) === code) || activeService || {};
}

function getServiceByTrip(trip){

  if(!trip) return null;

  const direct =
    normalizeCode(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.serviceSuffix ||
      trip.tripNumberSuffix ||
      ""
    );

  if(
    trip.isShared === true ||
    trip.tripType === "SHARED" ||
    direct === "SH"
  ){
    return SERVICES.find(s=>isSharedService(s)) || null;
  }

  return SERVICES.find(s=>{
    return resolveServiceCode(s) === direct;
  }) || null;
}

function getReservedPricing(service){

  return {
    pricingMode:
      normalizeText(service?.reservedPricingMode || "MILE").toUpperCase(),

    baseFare:
      num(service?.reservedBaseFare),

    includedMiles:
      num(service?.reservedIncludedMiles),

    perMile:
      num(service?.reservedPerMile),

    hourlyRate:
      num(service?.reservedHourlyRate),

    hourlyBillingMode:
      normalizeText(service?.reservedHourlyBillingMode || "FULL").toUpperCase(),

    stopFee:
      num(service?.reservedStopFee),

    noShowFee:
      num(service?.reservedNoShowFee),

    cancelFee:
      num(service?.reservedCancelFee),

    sharedPrice:
      num(service?.reservedSharedPrice),

    warningMinutes:
      Number(service?.reservedWarningMinutes ?? 120),

    disableCancel:
      bool(service?.reservedDisableCancel)
  };
}

function warningEnabled(service){
  return getReservedPricing(service).disableCancel !== true;
}

function getWarningMinutes(service){
  return Number(getReservedPricing(service).warningMinutes || 120);
}

/* ================= WARNING ================= */

function checkReservedDynamicWarning(dateValue,timeValue){

  if(!dateValue || !timeValue){
    return true;
  }

  const service =
    getCurrentReservedServiceConfig();

  const pricing =
    getReservedPricing(service);

  if(pricing.disableCancel === true){
    return true;
  }

  const warningMinutes =
    Number(pricing.warningMinutes || 120);

  if(warningMinutes <= 0){
    return true;
  }

  const tripDateTime =
    parseTripDateTime(dateValue,timeValue);

  if(!tripDateTime){
    return true;
  }

  const diff =
    (tripDateTime - getSystemNow()) / 60000;

  if(diff > 0 && diff <= warningMinutes){

    return confirm(
`WARNING

This trip is within ${warningMinutes} minutes.

Continue anyway?`
    );
  }

  return true;
}

function checkTripWarningByTrip(trip){

  if(!trip) return true;

  const service =
    getServiceByTrip(trip);

  if(!service) return true;

  const pricing =
    getReservedPricing(service);

  if(pricing.disableCancel === true){
    return true;
  }

  const warningMinutes =
    Number(pricing.warningMinutes || 120);

  const mins =
    minutesToTrip(trip);

  if(
    mins !== null &&
    mins > 0 &&
    mins <= warningMinutes
  ){
    return confirm(
`WARNING

This trip is within ${warningMinutes} minutes.

Continue anyway?`
    );
  }

  return true;
}

/* ================= PRICE ================= */

function calculateReservedPrice({service,miles,minutes,stops}){

  const p =
    getReservedPricing(service);

  const mode =
    p.pricingMode;

  const stopCount =
    Number(stops || 0);

  let total = 0;

  if(mode === "HOURLY"){

    const mins =
      Math.max(0,Number(minutes || 0));

    let billableHours = 0;

    if(p.hourlyBillingMode === "QUARTER"){
      billableHours = Math.ceil(mins / 15) * 0.25;
    }else{
      billableHours = Math.ceil(mins / 60);
    }

    total =
      (billableHours * p.hourlyRate) +
      (stopCount * p.stopFee);

  }else{

    const extraMiles =
      Math.max(0,Number(miles || 0) - p.includedMiles);

    total =
      p.baseFare +
      (extraMiles * p.perMile) +
      (stopCount * p.stopFee);
  }

  return Number(Number(total || 0).toFixed(2));
}

function calculatePassengerSpan(routeData,pickupOrder,dropoffOrder){

  const legs =
    routeData?.googleRoute?.legs || [];

  const startIndex =
    Math.max(0,Number(pickupOrder || 1) - 1);

  const endPointIndex =
    Math.max(0,Number(dropoffOrder || 1) - 1);

  const endLegIndex =
    Math.max(startIndex,endPointIndex - 1);

  let meters = 0;
  let seconds = 0;

  for(let i = startIndex; i <= endLegIndex; i++){

    const leg =
      legs[i];

    if(!leg) continue;

    meters += Number(leg.distanceMeters || 0);
    seconds += Number(leg.durationSeconds || 0);
  }

  return {
    passengerMiles:Number((meters * 0.000621371).toFixed(2)),
    passengerMinutes:Math.ceil(seconds / 60),
    passengerDistanceMeters:meters,
    passengerDurationSeconds:seconds
  };
}

function calculateSharedPricing({service,routeData,passengers,activeCount,stopsCount}){

  const p =
    getReservedPricing(service);

  const count =
    Math.max(1,Number(activeCount || 1));

  const routeMiles =
    Number(routeData?.miles || 0);

  /*
    Shared Price > 0
    سعر ثابت لكل راكب
    بدون miles
    بدون stops
  */
  if(Number(p.sharedPrice || 0) > 0){

    const fixed =
      Number(p.sharedPrice || 0);

    const total =
      Number((fixed * count).toFixed(2));

    const pricedPassengers =
      passengers.map(passenger=>{

        const status =
          cleanStatus(passenger.status);

        if(
          status.includes("no") ||
          status.includes("cancel") ||
          !passengerIsActive(passenger)
        ){
          return {
            ...passenger,
            passengerMiles:0,
            passengerMinutes:0,
            passengerDistanceMeters:0,
            passengerDurationSeconds:0,
            priceAmount:0,
            finalPrice:0
          };
        }

        return {
          ...passenger,
          passengerMiles:0,
          passengerMinutes:0,
          passengerDistanceMeters:0,
          passengerDurationSeconds:0,
          priceAmount:fixed,
          finalPrice:fixed
        };
      });

    return {
      total,
      pricePerPassenger:Number((total / count).toFixed(2)),
      stopTotal:0,
      stopShare:0,
      passengers:pricedPassengers
    };
  }

  /*
    Shared Price = 0
    الحساب العادي:
    base × passengers
    + route miles مرة واحدة
    + stop × passengers-1
  */

const includedMilesTotal =
  Number(p.includedMiles || 0) * count;

const extraMiles =
  Math.max(
    0,
    routeMiles - includedMilesTotal
  );

  const mileageTotal =
    Number(
      (extraMiles * Number(p.perMile || 0)).toFixed(2)
    );

  const baseTotal =
    Number(
      (Number(p.baseFare || 0) * count).toFixed(2)
    );

  const stopTotal =
    Number(
      (Number(stopsCount || 0) * Number(p.stopFee || 0)).toFixed(2)
    );

  const total =
    Number(
      (baseTotal + mileageTotal + stopTotal).toFixed(2)
    );

  const pricePerPassenger =
    Number((total / count).toFixed(2));

  const pricedPassengers =
    passengers.map(passenger=>{

      const status =
        cleanStatus(passenger.status);

      if(
        status.includes("no") ||
        status.includes("cancel") ||
        !passengerIsActive(passenger)
      ){
        return {
          ...passenger,
          passengerMiles:0,
          passengerMinutes:0,
          passengerDistanceMeters:0,
          passengerDurationSeconds:0,
          priceAmount:0,
          finalPrice:0
        };
      }

      return {
        ...passenger,
        passengerMiles:routeMiles,
        passengerMinutes:Number(routeData?.estimatedMinutes || 0),
        passengerDistanceMeters:Number(routeData?.distanceMeters || 0),
        passengerDurationSeconds:Number(routeData?.durationSeconds || 0),
        priceAmount:pricePerPassenger,
        finalPrice:pricePerPassenger
      };
    });

  return {
    total,
    pricePerPassenger,
    stopTotal,
    stopShare:Number((stopTotal / count).toFixed(2)),
    passengers:pricedPassengers
  };
}

/* ================= LOAD SERVICES ================= */

async function loadReservedServices(){

  try{

    const res =
      await fetch(SERVICES_URL,{
        headers:{
          Authorization:"Bearer " + token
        }
      });

    if(!res.ok){
      throw new Error("Failed loading services");
    }

    const data =
      await res.json().catch(()=>[]);

    const raw =
      Array.isArray(data)
        ? data
        : Array.isArray(data.services)
          ? data.services
          : Array.isArray(data.data)
            ? data.data
            : [];

    const unique =
      new Map();

    raw
      .map(mapReservedService)
      .filter(serviceVisible)
      .forEach(service=>{

        const code =
          resolveServiceCode(service);

        if(code && !unique.has(code)){
          unique.set(code,service);
        }
      });

    SERVICES =
      [...unique.values()];

    buildServiceTabs();

  }catch(err){

    console.error(err);

    SERVICES = [];

    buildServiceTabs();

    showAlert("Failed loading Reserved services");
  }
}

function buildServiceTabs(){

  if(!companyTabs) return;

  companyTabs.innerHTML = "";

  if(!SERVICES.length){

    companyTabs.innerHTML = `
      <div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:12px;padding:12px;font-weight:900;width:100%;">
        No Reserved services enabled.
      </div>
    `;

    if(individualSection) individualSection.style.display = "none";
    if(sharedSection) sharedSection.style.display = "none";

    return;
  }

  SERVICES.forEach((service,index)=>{

    const btn =
      document.createElement("button");

    btn.type =
      "button";

    btn.innerText =
      serviceDisplayName(
        service,
        resolveServiceCode(service)
      );

    btn.className =
      index === 0
        ? "btn-blue"
        : "btn-gray";

    btn.onclick =
      ()=>setActiveService(service,index);

    companyTabs.appendChild(btn);
  });

  setActiveService(SERVICES[0],0);
}

function setActiveService(service,index){

  activeService =
    service;

  companyTabs
    ?.querySelectorAll("button")
    .forEach(btn=>{
      btn.classList.remove("btn-blue");
      btn.classList.add("btn-gray");
    });

  const btn =
    companyTabs
      ?.querySelectorAll("button")[index];

  if(btn){
    btn.classList.remove("btn-gray");
    btn.classList.add("btn-blue");
  }

  if(isSharedService(service)){

    if(individualSection) individualSection.style.display = "none";
    if(sharedSection) sharedSection.style.display = "block";

  }else{

    if(individualSection) individualSection.style.display = "block";
    if(sharedSection) sharedSection.style.display = "none";
  }
}

/* ================= ADD TRIP STOPS UI ================= */

function renderAddTripStops(){

  if(!stopsBox) return;

  stopsBox.style.display = "block";
  stopsBox.innerHTML = "";

  addTripStops.forEach((stop,index)=>{

    const row =
      document.createElement("div");

    row.className =
      "stop-row";

    row.innerHTML = `
      <input
        class="add-trip-stop-input"
        value="${escapeHtml(stop)}"
        placeholder="Stop ${index + 1} Address"
        data-index="${index}"
      >

      <button
        type="button"
        class="remove-stop-btn"
        data-remove-stop="${index}"
      >
        Remove
      </button>
    `;

    stopsBox.appendChild(row);
  });
}

addStopBtn?.addEventListener("click",()=>{

  if(addTripStops.length >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }

  addTripStops.push("");

  renderAddTripStops();
});

stopsBox?.addEventListener("input",e=>{

  const input =
    e.target.closest(".add-trip-stop-input");

  if(!input) return;

  const index =
    Number(input.dataset.index);

  addTripStops[index] =
    input.value;
});

stopsBox?.addEventListener("click",e=>{

  const btn =
    e.target.closest("[data-remove-stop]");

  if(!btn) return;

  const index =
    Number(btn.dataset.removeStop);

  addTripStops.splice(index,1);

  renderAddTripStops();
});

/* ================= GOOGLE ROUTE ================= */

async function ensureGoogleLoaded(){

  if(window.google && google.maps && google.maps.DirectionsService){
    return;
  }

  if(googleLoadPromise){
    return googleLoadPromise;
  }

  googleLoadPromise =
    new Promise(async (resolve,reject)=>{

      try{

        const res =
          await fetch("/api/config");

        const data =
          await res.json();

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

        const script =
          document.createElement("script");

        script.src =
          "https://maps.googleapis.com/maps/api/js?key=" +
          encodeURIComponent(data.googleKey);

        script.async = true;
        script.defer = true;

        script.setAttribute("data-google-maps","true");

        script.onload =
          ()=>resolve();

        script.onerror =
          ()=>reject(new Error("Google failed"));

        document.head.appendChild(script);

      }catch(err){
        reject(err);
      }
    });

  return googleLoadPromise;
}

function uniqueAddressList(list){

  const out = [];
  const seen = new Set();

  list.forEach(address=>{

    const v =
      normalizeAddress(address);

    if(!v) return;

    const key =
      v.toLowerCase()
       .replace(/\s+/g," ")
       .trim();

    if(seen.has(key)) return;

    seen.add(key);
    out.push(v);
  });

  return out;
}

async function calculateRouteMiles(points){

  await ensureGoogleLoaded();

  const cleanPoints =
    Array.isArray(points)
      ? points.map(p=>normalizeAddress(p)).filter(Boolean)
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

  const origin =
    cleanPoints[0];

  const destination =
    cleanPoints[cleanPoints.length - 1];

  const waypoints =
    cleanPoints
      .slice(1,-1)
      .map(address=>({
        location:address,
        stopover:true
      }));

  return new Promise((resolve,reject)=>{

    const service =
      new google.maps.DirectionsService();

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

        const route =
          response.routes[0];

        let meters = 0;
        let seconds = 0;

        route.legs.forEach(leg=>{
          meters += leg.distance ? Number(leg.distance.value || 0) : 0;
          seconds += leg.duration ? Number(leg.duration.value || 0) : 0;
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
              startAddress:leg.start_address || "",
              endAddress:leg.end_address || "",
              distanceText:leg.distance?.text || "",
              distanceMeters:leg.distance?.value || 0,
              durationText:leg.duration?.text || "",
              durationSeconds:leg.duration?.value || 0
            }))
          }
        });
      }
    );
  });
}

async function orderNearestFromOrigin(origin,points){

  const cleanOrigin =
    normalizeAddress(origin);

  let remaining =
    uniqueAddressList(points);

  if(!cleanOrigin){
    return remaining;
  }

  const ordered = [];
  let current = cleanOrigin;

  while(remaining.length){

    let bestIndex = 0;
    let bestMiles = Number.MAX_SAFE_INTEGER;

    for(let i = 0; i < remaining.length; i++){

      try{

        const data =
          await calculateRouteMiles([
            current,
            remaining[i]
          ]);

        const miles =
          Number(data.miles || 0);

        if(miles < bestMiles){
          bestMiles = miles;
          bestIndex = i;
        }

      }catch(err){
        console.log("orderNearestFromOrigin error:",err);
      }

    }

    const next =
      remaining.splice(bestIndex,1)[0];

    ordered.push(next);
    current = next;
  }

  return [
    cleanOrigin,
    ...ordered
  ];
}
async function optimizeStopsFromOrigin(origin,stops){

  await ensureGoogleLoaded();

  const cleanOrigin =
    normalizeAddress(origin);

  const cleanStops =
    uniqueAddressList(stops);

  if(!cleanOrigin) return cleanStops;
  if(!cleanStops.length) return [cleanOrigin];
  if(cleanStops.length === 1) return [cleanOrigin,cleanStops[0]];

  return new Promise(resolve=>{

    const service =
      new google.maps.DirectionsService();

    service.route(
      {
        origin:cleanOrigin,
        destination:cleanOrigin,
        waypoints:cleanStops.map(address=>({
          location:address,
          stopover:true
        })),
        optimizeWaypoints:true,
        travelMode:google.maps.TravelMode.DRIVING,
        unitSystem:google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){

        if(status !== "OK" || !response?.routes?.[0]){
          resolve([cleanOrigin,...cleanStops]);
          return;
        }

        const order =
          response.routes[0].waypoint_order || [];

        const orderedStops =
          order.map(i=>cleanStops[i]).filter(Boolean);

        resolve([cleanOrigin,...orderedStops]);
      }
    );
  });
}

async function optimizeOpenRouteFromOrigin(origin,stops){

  await ensureGoogleLoaded();

  const cleanOrigin =
    normalizeAddress(origin);

  const cleanStops =
    uniqueAddressList(stops);

  if(!cleanOrigin) return cleanStops;

  if(cleanStops.length <= 1){
    return [cleanOrigin,...cleanStops];
  }

  let bestRoute =
    [cleanOrigin,...cleanStops];

  let bestMiles =
    Number.MAX_SAFE_INTEGER;

  for(const destination of cleanStops){

    const waypoints =
      cleanStops
        .filter(s=>addressKey(s) !== addressKey(destination))
        .map(address=>({
          location:address,
          stopover:true
        }));

    try{

      const candidate =
        await new Promise(resolve=>{

          const service =
            new google.maps.DirectionsService();

          service.route(
            {
              origin:cleanOrigin,
              destination,
              waypoints,
              optimizeWaypoints:true,
              travelMode:google.maps.TravelMode.DRIVING,
              unitSystem:google.maps.UnitSystem.IMPERIAL
            },
            function(response,status){

              if(status !== "OK" || !response?.routes?.[0]){
                resolve(null);
                return;
              }

              const route =
                response.routes[0];

              const orderedWaypoints =
                (route.waypoint_order || [])
                  .map(i=>waypoints[i]?.location)
                  .filter(Boolean);

              resolve([
                cleanOrigin,
                ...orderedWaypoints,
                destination
              ]);
            }
          );
        });

      if(!candidate){
        continue;
      }

      const data =
        await calculateRouteMiles(candidate);

      if(
        Number(data.miles || 0) > 0 &&
        Number(data.miles || 0) < bestMiles
      ){
        bestMiles = Number(data.miles || 0);
        bestRoute = candidate;
      }

    }catch(err){
      console.log("optimizeOpenRouteFromOrigin error:",err);
    }
  }

  return uniqueAddressList(bestRoute);
}


async function optimizeOpenRouteToDestination(points,destination){

  await ensureGoogleLoaded();

  const cleanPoints =
    uniqueAddressList(points);

  const cleanDestination =
    normalizeAddress(destination);

  if(!cleanDestination) return cleanPoints;

  if(cleanPoints.length <= 1){
    return [...cleanPoints,cleanDestination];
  }

  let bestRoute =
    [...cleanPoints,cleanDestination];

  let bestMiles =
    Number.MAX_SAFE_INTEGER;

  for(const origin of cleanPoints){

    const waypoints =
      cleanPoints
        .filter(s=>addressKey(s) !== addressKey(origin))
        .map(address=>({
          location:address,
          stopover:true
        }));

    try{

      const candidate =
        await new Promise(resolve=>{

          const service =
            new google.maps.DirectionsService();

          service.route(
            {
              origin,
              destination:cleanDestination,
              waypoints,
              optimizeWaypoints:true,
              travelMode:google.maps.TravelMode.DRIVING,
              unitSystem:google.maps.UnitSystem.IMPERIAL
            },
            function(response,status){

              if(status !== "OK" || !response?.routes?.[0]){
                resolve(null);
                return;
              }

              const route =
                response.routes[0];

              const orderedWaypoints =
                (route.waypoint_order || [])
                  .map(i=>waypoints[i]?.location)
                  .filter(Boolean);

              resolve([
                origin,
                ...orderedWaypoints,
                cleanDestination
              ]);
            }
          );
        });

      if(!candidate){
        continue;
      }

      const data =
        await calculateRouteMiles(candidate);

      if(
        Number(data.miles || 0) > 0 &&
        Number(data.miles || 0) < bestMiles
      ){
        bestMiles = Number(data.miles || 0);
        bestRoute = candidate;
      }

    }catch(err){
      console.log("optimizeOpenRouteToDestination error:",err);
    }
  }

  return uniqueAddressList(bestRoute);
}

function passengerIsActive(p){

  const s =
    cleanStatus(p.status);

  return (
    !s.includes("no") &&
    !s.includes("cancel") &&
    normalizeText(p.pickup) &&
    normalizeText(p.dropoff)
  );
}

function indexOfAddress(route,address){

  const key =
    addressKey(address);

  return route.findIndex(p=>addressKey(p) === key);
}
async function getRouteMilesSafe(points){

  try{

    const data =
      await calculateRouteMiles(points);

    return Number(data.miles || 0);

  }catch(err){

    console.log("getRouteMilesSafe error:",err);
    return Number.MAX_SAFE_INTEGER;
  }
}

async function findNearestPoint(origin,points){

  const cleanOrigin =
    normalizeAddress(origin);

  const cleanPoints =
    uniqueAddressList(points);

  if(!cleanOrigin || !cleanPoints.length){
    return "";
  }

  let bestPoint =
    cleanPoints[0];

  let bestMiles =
    Number.MAX_SAFE_INTEGER;

  for(const point of cleanPoints){

    const miles =
      await getRouteMilesSafe([
        cleanOrigin,
        point
      ]);

    if(miles < bestMiles){
      bestMiles = miles;
      bestPoint = point;
    }
  }

  return bestPoint;
}

async function findFarthestPoint(origin,points){

  const cleanOrigin =
    normalizeAddress(origin);

  const cleanPoints =
    uniqueAddressList(points);

  if(!cleanOrigin || !cleanPoints.length){
    return "";
  }

  let farthestPoint =
    cleanPoints[0];

  let farthestMiles =
    -1;

  for(const point of cleanPoints){

    const miles =
      await getRouteMilesSafe([
        cleanOrigin,
        point
      ]);

    if(
      miles !== Number.MAX_SAFE_INTEGER &&
      miles > farthestMiles
    ){
      farthestMiles = miles;
      farthestPoint = point;
    }
  }

  return farthestPoint;
}

async function buildPickupRoute(pickupAddresses){

  const pickups =
    uniqueAddressList(pickupAddresses);

  if(pickups.length <= 1){
    return pickups;
  }

  /*
    نرتب البيك أب الأول.
    مفيش driver start هنا، فهنبدأ من أول pickup موجود
    وبعده نختار أقرب pickup.
  */

  const origin =
    pickups[0];

  const rest =
    pickups.slice(1);

  const route =
    await orderNearestFromOrigin(
      origin,
      rest
    );

  return uniqueAddressList(route);
}

async function buildDirectionalDropoffRoute(origin,dropoffAddresses){

  const cleanOrigin =
    normalizeAddress(origin);

  const dropoffs =
    uniqueAddressList(dropoffAddresses);

  if(!cleanOrigin){
    return dropoffs;
  }

  if(dropoffs.length <= 1){
    return [
      cleanOrigin,
      ...dropoffs
    ];
  }

  /*
    أول Dropoff = الأقرب من آخر pickup.
    ده يفتح اتجاه النزول.
  */

  const firstDropoff =
    await findNearestPoint(
      cleanOrigin,
      dropoffs
    );

  const remainingAfterFirst =
    dropoffs.filter(d=>{
      return addressKey(d) !== addressKey(firstDropoff);
    });

  if(!remainingAfterFirst.length){

    return uniqueAddressList([
      cleanOrigin,
      firstDropoff
    ]);
  }

  /*
    آخر Dropoff = الأبعد من أول dropoff.
    ده يخلي العربية تكمل في اتجاه واحد بدل ما تلف وترجع.
  */

  const finalDropoff =
    await findFarthestPoint(
      firstDropoff,
      remainingAfterFirst
    );

  const middleDropoffs =
    remainingAfterFirst.filter(d=>{
      return addressKey(d) !== addressKey(finalDropoff);
    });

  if(!middleDropoffs.length){

    return uniqueAddressList([
      cleanOrigin,
      firstDropoff,
      finalDropoff
    ]);
  }

  /*
    نخلي Google يرتب النقط اللي في النص فقط.
    origin ثابت = آخر pickup
    destination ثابت = أبعد dropoff
  */

  try{

    await ensureGoogleLoaded();

    const service =
      new google.maps.DirectionsService();

    const optimizedRoute =
      await new Promise(resolve=>{

        const waypointLocations =
          [
            firstDropoff,
            ...middleDropoffs
          ];

        service.route(
          {
            origin:cleanOrigin,
            destination:finalDropoff,
            waypoints:waypointLocations.map(address=>({
              location:address,
              stopover:true
            })),
            optimizeWaypoints:true,
            travelMode:google.maps.TravelMode.DRIVING,
            unitSystem:google.maps.UnitSystem.IMPERIAL
          },
          function(response,status){

            if(status !== "OK" || !response?.routes?.[0]){
              resolve(null);
              return;
            }

            const ordered =
              (response.routes[0].waypoint_order || [])
                .map(i=>waypointLocations[i])
                .filter(Boolean);

            resolve([
              cleanOrigin,
              ...ordered,
              finalDropoff
            ]);
          }
        );
      });

    if(optimizedRoute && optimizedRoute.length){
      return uniqueAddressList(optimizedRoute);
    }

  }catch(err){

    console.log("buildDirectionalDropoffRoute error:",err);
  }

  return uniqueAddressList([
    cleanOrigin,
    firstDropoff,
    ...middleDropoffs,
    finalDropoff
  ]);
}

async function buildFinalSharedRoute(trip){

  const sourcePassengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  const passengers =
    sourcePassengers.map((p,index)=>({
      ...p,
      __originalIndex:index,
      __active:passengerIsActive(p),
      pickup:normalizeAddress(p.pickup),
      dropoff:normalizeAddress(p.dropoff)
    }));

  const activePassengers =
    passengers.filter(p=>p.__active);

  if(!activePassengers.length){

    return {
      routePoints:[],
      passengers,
      activePassengers:[],
      activeCount:0
    };
  }

  const pickupAddresses =
    uniqueAddressList(
      activePassengers.map(p=>p.pickup)
    );

  const dropoffAddresses =
    uniqueAddressList(
      activePassengers.map(p=>p.dropoff)
    );

  const pickupUnified =
    pickupAddresses.length === 1;

  const dropoffUnified =
    dropoffAddresses.length === 1;

  let finalRoutePoints = [];

  /* =====================================================
     CASE 1:
     Pickup موحد + Dropoff موحد
  ===================================================== */

  if(pickupUnified && dropoffUnified){

    finalRoutePoints =
      uniqueAddressList([
        pickupAddresses[0],
        dropoffAddresses[0]
      ]);
  }

  /* =====================================================
     CASE 2:
     Pickup موحد + Dropoff مختلف
     Pickup واحد
     ثم Dropoffs حسب الاتجاه
  ===================================================== */

  else if(pickupUnified && !dropoffUnified){

    const pickup =
      pickupAddresses[0];

    const dropoffRoute =
      await buildDirectionalDropoffRoute(
        pickup,
        dropoffAddresses
      );

    finalRoutePoints =
      uniqueAddressList([
        pickup,
        ...dropoffRoute.slice(1)
      ]);
  }

  /* =====================================================
     CASE 3:
     Pickup مختلف + Dropoff موحد
     Pickups الأول
     ثم Dropoff واحد
  ===================================================== */

  else if(!pickupUnified && dropoffUnified){

    const pickupRoute =
      await buildPickupRoute(
        pickupAddresses
      );

    finalRoutePoints =
      uniqueAddressList([
        ...pickupRoute,
        dropoffAddresses[0]
      ]);
  }

  /* =====================================================
     CASE 4:
     Pickup مختلف + Dropoff مختلف
     Pickups الأول
     ثم Dropoffs بالاتجاه
  ===================================================== */

  else{

    const pickupRoute =
      await buildPickupRoute(
        pickupAddresses
      );

    const lastPickup =
      pickupRoute[pickupRoute.length - 1];

    const dropoffRoute =
      await buildDirectionalDropoffRoute(
        lastPickup,
        dropoffAddresses
      );

    finalRoutePoints =
      uniqueAddressList([
        ...pickupRoute,
        ...dropoffRoute.slice(1)
      ]);
  }

  const orderedPassengers =
    passengers
      .map(p=>{

        if(!p.__active){

          return {
            ...p,
            pickupOrder:9999,
            dropoffOrder:9999,
            routeOrder:9999
          };
        }

        const pickupIndex =
          indexOfAddress(
            finalRoutePoints,
            p.pickup
          );

        const dropoffIndex =
          indexOfAddress(
            finalRoutePoints,
            p.dropoff
          );

        return {
          ...p,

          pickupOrder:
            pickupIndex < 0
              ? 9999
              : pickupIndex + 1,

          dropoffOrder:
            dropoffIndex < 0
              ? 9999
              : dropoffIndex + 1
        };
      })
      .sort((a,b)=>{

        if(a.__active !== b.__active){
          return a.__active ? -1 : 1;
        }

        if(Number(a.pickupOrder) !== Number(b.pickupOrder)){
          return Number(a.pickupOrder) - Number(b.pickupOrder);
        }

        if(Number(a.dropoffOrder) !== Number(b.dropoffOrder)){
          return Number(a.dropoffOrder) - Number(b.dropoffOrder);
        }

        return Number(a.__originalIndex) - Number(b.__originalIndex);
      })
      .map((p,index)=>{

        const cleaned =
          {...p};

        delete cleaned.__originalIndex;
        delete cleaned.__active;

        return {
          ...cleaned,
          routeOrder:index + 1
        };
      });

  return {
    routePoints:finalRoutePoints,
    passengers:orderedPassengers,
    activePassengers:
      orderedPassengers.filter(passengerIsActive),
    activeCount:activePassengers.length
  };
}

function buildIndividualRoutePoints(trip){

  const pickup =
    trip.pickup || "";

  const stops =
    Array.isArray(trip.stops)
      ? trip.stops
      : [];

  const dropoff =
    trip.dropoff || "";

  return [
    pickup,
    ...stops,
    dropoff
  ]
  .map(v=>normalizeAddress(v))
  .filter(Boolean);
}

/* ================= PAGE SWITCH ================= */

function showAddPage(){

  if(addWrapper){
    addWrapper.style.display = "block";
  }else if(addTripPage){
    addTripPage.style.display = "block";
  }

  if(dispatchReviewPage){
    dispatchReviewPage.style.display = "none";
  }

  if(companyTabs){
    companyTabs.style.display = "flex";
  }

  if(activeService && isSharedService(activeService)){

    if(individualSection) individualSection.style.display = "none";
    if(sharedSection) sharedSection.style.display = "block";

  }else{

    if(individualSection) individualSection.style.display = "block";
    if(sharedSection) sharedSection.style.display = "none";
  }

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}

function showReviewPage(){

  if(addWrapper){
    addWrapper.style.display = "none";
  }else if(addTripPage){
    addTripPage.style.display = "none";
  }

  if(dispatchReviewPage){
    dispatchReviewPage.style.display = "block";
  }

  hideDuplicateReviewTop();

  renderReviewTable();

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}

function updateReviewCounter(){

  const text =
    `Dispatch Review (${reviewTrips.length})`;

  if(showReviewBtn){
    showReviewBtn.innerText = text;
  }

  if(reviewShowReviewBtn){
    reviewShowReviewBtn.innerText = text;
  }
}

function goTripsHub(){
  window.location.href = "/admin/trips-hub.html";
}

backToHubBtn?.addEventListener("click",goTripsHub);
reviewBackToHubBtn?.addEventListener("click",goTripsHub);

showAddBtn?.addEventListener("click",showAddPage);
reviewShowAddBtn?.addEventListener("click",showAddPage);

showReviewBtn?.addEventListener("click",showReviewPage);
reviewShowReviewBtn?.addEventListener("click",showReviewPage);

/* ================= ENTRY ================= */

function loadEntryInfo(){

  const saved =
    JSON.parse(
      localStorage.getItem("dispatchEntryInfo") ||
      localStorage.getItem("entryInfo") ||
      "{}"
    );

  if(entryName) entryName.value = saved.entryName || "";
  if(entryPhone) entryPhone.value = saved.entryPhone || "";

  if(sharedEntryName) sharedEntryName.value = saved.entryName || "";
  if(sharedEntryPhone) sharedEntryPhone.value = saved.entryPhone || "";
}

function saveEntryInfo(){

  const data = {
    entryName:
      entryName?.value ||
      sharedEntryName?.value ||
      "",
    entryPhone:
      entryPhone?.value ||
      sharedEntryPhone?.value ||
      ""
  };

  localStorage.setItem(
    "dispatchEntryInfo",
    JSON.stringify(data)
  );

  localStorage.setItem(
    "entryInfo",
    JSON.stringify(data)
  );

  if(entryName) entryName.value = data.entryName;
  if(entryPhone) entryPhone.value = data.entryPhone;

  if(sharedEntryName) sharedEntryName.value = data.entryName;
  if(sharedEntryPhone) sharedEntryPhone.value = data.entryPhone;

  showAlert("Entry Info Saved ✔");
}

let entryEditMode = false;

function toggleEntryEdit(){

  if(!entryEditMode){

    entryEditMode = true;

    entryName?.removeAttribute("readonly");
    entryPhone?.removeAttribute("readonly");

    sharedEntryName?.removeAttribute("readonly");
    sharedEntryPhone?.removeAttribute("readonly");

    if(editEntryBtn) editEntryBtn.innerText = "Save";
    if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Save";

    entryName?.focus();

    return;
  }

  saveEntryInfo();

  entryEditMode = false;

  entryName?.setAttribute("readonly",true);
  entryPhone?.setAttribute("readonly",true);

  sharedEntryName?.setAttribute("readonly",true);
  sharedEntryPhone?.setAttribute("readonly",true);

  if(editEntryBtn) editEntryBtn.innerText = "Edit";
  if(editSharedEntryBtn) editSharedEntryBtn.innerText = "Edit";
}

editEntryBtn?.addEventListener("click",toggleEntryEdit);
editSharedEntryBtn?.addEventListener("click",toggleEntryEdit);
saveEntryBtn?.addEventListener("click",saveEntryInfo);
saveSharedEntryBtn?.addEventListener("click",saveEntryInfo);

/* ================= VALIDATION ================= */

function validateIndividualTrip(){

  if(!normalizeText(entryName?.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(entryPhone?.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!normalizeText(clientName?.value)){
    showAlert("Client Name Required");
    return false;
  }

  if(!normalizeText(clientPhone?.value)){
    showAlert("Client Phone Required");
    return false;
  }

  if(!normalizeText(pickupInput?.value)){
    showAlert("Pickup Required");
    return false;
  }

  if(!normalizeText(dropoffInput?.value)){
    showAlert("Dropoff Required");
    return false;
  }

  if(!tripDate?.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!tripTime?.value){
    showAlert("Trip Time Required");
    return false;
  }

  const dt =
    parseTripDateTime(tripDate.value,tripTime.value);

  if(!dt || dt <= getSystemNow()){
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  return true;
}

function validateSharedTrip(){

  if(!normalizeText(sharedEntryName?.value)){
    showAlert("Entry Name Required");
    return false;
  }

  if(!normalizeText(sharedEntryPhone?.value)){
    showAlert("Entry Phone Required");
    return false;
  }

  if(!sharedDate?.value){
    showAlert("Trip Date Required");
    return false;
  }

  if(!sharedTime?.value){
    showAlert("Trip Time Required");
    return false;
  }

  const dt =
    parseTripDateTime(sharedDate.value,sharedTime.value);

  if(!dt || dt <= getSystemNow()){
    showAlert("Trip Date/Time Already Passed");
    return false;
  }

  const cards =
    document.querySelectorAll(".passenger-card");

  if(cards.length < 2){
    showAlert("Minimum 2 Passengers");
    return false;
  }

  for(const card of cards){

    if(!normalizeText(card.querySelector(".sharedClientName")?.value)){
      showAlert("Passenger Name Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedClientPhone")?.value)){
      showAlert("Passenger Phone Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedPickup")?.value)){
      showAlert("Passenger Pickup Required");
      return false;
    }

    if(!normalizeText(card.querySelector(".sharedDropoff")?.value)){
      showAlert("Passenger Dropoff Required");
      return false;
    }
  }

  return true;
}

/* ================= SHARED UI ================= */

function renderSharedPassengers(count){

  if(!passengersContainer) return;

  passengersContainer.innerHTML = "";

  if(count < 2) return;

  for(let i = 1; i <= count; i++){

    const card =
      document.createElement("div");

    card.className =
      "passenger-card";

    card.innerHTML = `
      <div class="passenger-header">
        <h4>Passenger ${i}</h4>
      </div>

      <div class="form-grid">
        <div class="field-wrap">
          <input class="sharedClientName" placeholder="Client Name">
        </div>
        <div class="field-wrap">
          <input class="sharedClientPhone" placeholder="Client Phone">
        </div>
        <div class="field-wrap">
          <input class="sharedPickup" placeholder="Pickup Address">
        </div>
        <div class="field-wrap">
          <input class="sharedDropoff" placeholder="Dropoff Address">
        </div>
      </div>
    `;

    passengersContainer.appendChild(card);
  }
}

passengerCount?.addEventListener("change",function(){
  renderSharedPassengers(Number(this.value));
});

/* ================= CLEAR FORM ================= */

function clearIndividualForm(){

  if(clientName) clientName.value = "";
  if(clientPhone) clientPhone.value = "";
  if(pickupInput) pickupInput.value = "";
  if(dropoffInput) dropoffInput.value = "";
  if(tripDate) tripDate.value = "";
  if(tripTime) tripTime.value = "";
  if(notes) notes.value = "";

  addTripStops = [];

  if(stopsBox) stopsBox.innerHTML = "";

  if(submitTripBtn){
    submitTripBtn.innerText = "Add To Review";
  }
}

function clearSharedForm(){

  if(passengerCount) passengerCount.value = "";
  if(sharedDate) sharedDate.value = "";
  if(sharedTime) sharedTime.value = "";
  if(sharedNotes) sharedNotes.value = "";
  if(passengersContainer) passengersContainer.innerHTML = "";

  if(submitSharedBtn){
    submitSharedBtn.innerText = "Add Shared To Review";
  }
}

/* ================= PAYLOADS ================= */

function buildIndividualPayload(){

  const service =
    getCurrentReservedServiceConfig();

  const serviceCode =
    resolveServiceCode(service);

  const stops =
    addTripStops
      .map(s=>normalizeAddress(s))
      .filter(Boolean);

  return {
    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reservationStatus:"Review",
    reviewOnly:true,

    status:"Review",
    dispatchSelected:false,
    disabled:false,

    tripType:"INDIVIDUAL",
    isShared:false,

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceCode:serviceCode,
    serviceSuffix:serviceCode,
    tripNumberSuffix:serviceCode,
    serviceName:serviceDisplayName(service,serviceCode),
    serviceTitle:serviceDisplayName(service,serviceCode),
    serviceId:String(service?._id || ""),

    vehicleTypeFromQuote:serviceCode,
    vehicleType:serviceCode,

    entryName:normalizeText(entryName.value),
    entryPhone:normalizeText(entryPhone.value),

    clientName:normalizeText(clientName.value),
    clientPhone:normalizeText(clientPhone.value),

    pickup:normalizeAddress(pickupInput.value),
    dropoff:normalizeAddress(dropoffInput.value),
    stops,

    tripDate:tripDate.value,
    tripTime:tripTime.value,
    notes:normalizeText(notes.value),

    priceAmount:0,
    finalPrice:0,
    miles:0,
    estimatedMinutes:0,

    routePoints:[],
    googleRoute:null,
    optimizedRoute:null,
    routeLocked:false,
    routeFinalized:false,
    routeSource:"",
    routeUpdatedAt:null,

    createdFrom:"dispatch-add-trip"
  };
}

function buildSharedPayload(){

  const service =
    getCurrentReservedServiceConfig();

  const serviceCode =
    "SH";

  const passengers = [];

  document.querySelectorAll(".passenger-card").forEach((card,index)=>{

    const name =
      normalizeText(card.querySelector(".sharedClientName")?.value);

    const phone =
      normalizeText(card.querySelector(".sharedClientPhone")?.value);

    passengers.push({
      passengerId:"P" + (index + 1),

      name,
      phone,
      clientName:name,
      clientPhone:phone,

      pickup:normalizeAddress(card.querySelector(".sharedPickup")?.value),
      dropoff:normalizeAddress(card.querySelector(".sharedDropoff")?.value),

      status:"Scheduled",
      priceAmount:0,
      finalPrice:0,
      cancelFee:0,
      noShowFee:0,
      pickupOrder:0,
      dropoffOrder:0,
      routeOrder:index + 1,
      passengerMiles:0,
      passengerMinutes:0
    });
  });

  return {
    type:"reserved",
    reservation:true,
    source:"RV",
    bookingSource:"RV",
    reservationStatus:"Review",
    reviewOnly:true,

    status:"Review",
    dispatchSelected:false,
    disabled:false,

    tripType:"SHARED",
    isShared:true,

    serviceKey:serviceCode,
    serviceType:serviceCode,
    serviceCode:serviceCode,
    serviceSuffix:"SH",
    tripNumberSuffix:"SH",
    serviceName:serviceDisplayName(service,serviceCode),
    serviceTitle:serviceDisplayName(service,serviceCode),
    serviceId:String(service?._id || ""),

    vehicleTypeFromQuote:serviceCode,
    vehicleType:serviceCode,

    entryName:normalizeText(sharedEntryName.value),
    entryPhone:normalizeText(sharedEntryPhone.value),

    passengers,
    passengerCount:passengers.length,
    passengersCount:passengers.length,
    totalPassengers:passengers.length,

    pickup:passengers[0]?.pickup || "",
    dropoff:passengers[passengers.length - 1]?.dropoff || "",
    stops:[],

    tripDate:sharedDate.value,
    tripTime:sharedTime.value,
    notes:normalizeText(sharedNotes.value),

    priceAmount:0,
    finalPrice:0,
    pricePerPassenger:0,

    miles:0,
    estimatedMinutes:0,

    routePoints:[],
    googleRoute:null,
    optimizedRoute:null,
    routeLocked:false,
    routeFinalized:false,
    routeSource:"",
    routeUpdatedAt:null,

    createdFrom:"dispatch-add-trip"
  };
}

/* ================= SERVER ================= */

function extractTripResponse(data){
  return data?.trip || data?.data || data;
}

async function createTrip(payload){

  const res =
    await fetch(API_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(payload)
    });

  const data =
    await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Create trip failed");
  }

  return extractTripResponse(data);
}

async function updateTrip(id,payload){

  const res =
    await fetch(`${API_URL}/${encodeURIComponent(id)}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(payload)
    });

  const data =
    await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Update trip failed");
  }

  return extractTripResponse(data);
}

async function deleteTrip(id){

  const res =
    await fetch(`${API_URL}/${encodeURIComponent(id)}`,{
      method:"DELETE",
      headers:{
        Authorization:"Bearer " + token
      }
    });

  const data =
    await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Delete trip failed");
  }
}

async function fetchReviewTrips(){

  const res =
    await fetch(API_URL,{
      headers:{
        Authorization:"Bearer " + token
      }
    });

  const data =
    await res.json().catch(()=>[]);

  const list =
    Array.isArray(data)
      ? data
      : Array.isArray(data.trips)
        ? data.trips
        : Array.isArray(data.data)
          ? data.data
          : [];

  reviewTrips =
    list
      .filter(t=>{

        const type =
          normalizeText(t.type).toLowerCase();

        const source =
          normalizeText(t.source).toUpperCase();

        const booking =
          normalizeText(t.bookingSource).toUpperCase();

        const tripNumber =
          normalizeText(t.tripNumber).toUpperCase();

        const createdFrom =
          normalizeText(t.createdFrom);

        const isReserved =
          type === "reserved" ||
          source === "RV" ||
          booking === "RV" ||
          tripNumber.startsWith("RV-") ||
          createdFrom === "dispatch-add-trip";

        const status =
          cleanStatus(t.status);

        const hidden =
          status.includes("complete") ||
          status.includes("cancel") ||
          status.includes("noshow") ||
          status === "no";

        const dt =
          parseTripDateTime(t.tripDate,t.tripTime);

        const isOldUnconfirmed =
          dt &&
          dt <= getSystemNow() &&
          (
            status.includes("review") ||
            status === "scheduled" ||
            status === ""
          );

        return isReserved && !hidden && !isOldUnconfirmed;
      })
      .sort((a,b)=>{

        const da =
          getCreatedDateObject(a);

        const db =
          getCreatedDateObject(b);

        return db - da;
      });

  updateReviewCounter();
}

/* ================= ADD TRIP ================= */

submitTripBtn?.addEventListener("click",async ()=>{

  if(!validateIndividualTrip()){
    return;
  }

  if(!checkReservedDynamicWarning(tripDate.value,tripTime.value)){
    return;
  }

  submitTripBtn.disabled = true;
  submitTripBtn.innerText = "Submitting...";

  try{

    await createTrip(buildIndividualPayload());

    clearIndividualForm();

    localStorage.removeItem("dispatchTripDraft");

    await refreshReview();

    showAddPage();

    showAlert("Trip Added To Dispatch Review ✔");

  }catch(err){

    console.error(err);

    showAlert(err.message || "Add trip failed");

  }finally{

    submitTripBtn.disabled = false;
    submitTripBtn.innerText = "Add To Review";
  }
});

submitSharedBtn?.addEventListener("click",async ()=>{

  if(!validateSharedTrip()){
    return;
  }

  if(!checkReservedDynamicWarning(sharedDate.value,sharedTime.value)){
    return;
  }

  submitSharedBtn.disabled = true;
  submitSharedBtn.innerText = "Submitting...";

  try{

    await createTrip(buildSharedPayload());

    clearSharedForm();

    localStorage.removeItem("dispatchSharedDraft");

    await refreshReview();

    showAddPage();

    showAlert("Shared Trip Added To Dispatch Review ✔");

  }catch(err){

    console.error(err);

    showAlert(err.message || "Add shared trip failed");

  }finally{

    submitSharedBtn.disabled = false;
    submitSharedBtn.innerText = "Add Shared To Review";
  }
});

/* ================= BUTTON POLICY ================= */

function hasActiveAddStopRequest(trip){

  const req =
    trip?.addStopRequest || null;

  if(!req) return false;

  const status =
    normalizeText(req.status).toUpperCase();

  return (
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_DISPATCH",
      "COMPLETED",
      "REJECTED"
    ].includes(status)
  );
}

function reservedAllowsAddStop(trip){

  if(!trip || trip.isShared === true || trip.tripType === "SHARED"){
    return false;
  }

  const service =
    getServiceByTrip(trip);

  if(!service) return false;

  if(bool(service.reservedAddStopEnabled) !== true){
    return false;
  }

  const custom =
    bool(service.reservedAddStopCustomTimeEnabled);

  if(!custom) return true;

  const mins =
    minutesToTrip(trip);

  if(mins === null) return true;

  const cutoff =
    Number(service.reservedAddStopCutoffMinutes || 0);

  if(cutoff <= 0){
    return mins >= 0;
  }

  return mins >= cutoff;
}

function renderAddStopButton(t){

  if(t.isShared === true || t.tripType === "SHARED"){
    return "";
  }

  if(hasActiveAddStopRequest(t)){
    return `<button class="btn cancel" data-action="cancel-stop">Cancel Stop</button>`;
  }

  if(!reservedAllowsAddStop(t)){
    return "";
  }

  return `<button class="btn add-stop" data-action="add-stop">Add Stop</button>`;
}

function renderTripButtons(t){

  const service =
    getServiceByTrip(t);

  const mins =
    minutesToTrip(t);

  const warningMinutes =
    warningEnabled(service)
      ? getWarningMinutes(service)
      : 0;

  const status =
    cleanStatus(t.status);

  const stopBtn =
    renderAddStopButton(t);

  if(t.__editing === true){

    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-edit">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(status.includes("cancel")){
    return `<div class="actions-wrap">${stopBtn}</div>`;
  }

  if(mins > warningMinutes || mins === null){

    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-trip">Edit</button>
        <button class="btn delete" data-action="delete-trip">Delete</button>
        <button class="btn confirm" data-action="confirm-trip">
          ${status.includes("confirm") ? "Reconfirm" : "Confirm"}
        </button>
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

  return `<div class="actions-wrap">${stopBtn}</div>`;
}

/* ================= TABLE ================= */

function applyRowColor(tr,t){

  const mins =
    minutesToTrip(t);

  const status =
    cleanStatus(t.status);

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
    }else if(mins <= 60){
      tr.classList.add("red-mid");
    }else if(mins <= 120){
      tr.classList.add("red-light");
    }else if(mins <= 180){
      tr.classList.add("yellow");
    }else if(status.includes("confirm")){
      tr.classList.add("confirmed-row");
    }else if(status.includes("review")){
      tr.classList.add("review-row");
    }else{
      tr.classList.add("scheduled-row");
    }
  }
}

function getPassengers(t){

  const arr =
    Array.isArray(t.passengers)
      ? t.passengers
      : [];

  return [...arr].sort((a,b)=>{

    const ar =
      Number(a.routeOrder || 9999);

    const br =
      Number(b.routeOrder || 9999);

    if(ar !== br) return ar - br;

    const ap =
      Number(a.pickupOrder || 9999);

    const bp =
      Number(b.pickupOrder || 9999);

    if(ap !== bp) return ap - bp;

    const ad =
      Number(a.dropoffOrder || 9999);

    const bd =
      Number(b.dropoffOrder || 9999);

    return ad - bd;
  });
}

function renderTripRow(t,index){

  const tr =
    document.createElement("tr");

  tr.dataset.id =
    t._id || t.id || "";

  applyRowColor(tr,t);

  const isShared =
    t.isShared === true ||
    t.tripType === "SHARED";

  const editing =
    t.__editing === true;

  const passengers =
    getPassengers(t);

  const clients =
    isShared
      ? passengers.map((p,i)=>escapeHtml(`${i + 1}. ${p.clientName || p.name || "--"}`))
      : escapeHtml(t.clientName || "--");

  const phones =
    isShared
      ? passengers.map((p,i)=>escapeHtml(`${i + 1}. ${p.clientPhone || p.phone || "--"}`))
      : escapeHtml(t.clientPhone || "--");

  const pickups =
    isShared
      ? passengers.map((p,i)=>{
          const order =
            p.pickupOrder && p.pickupOrder !== 9999
              ? `P${p.pickupOrder}`
              : `${i + 1}`;
          return escapeHtml(`${order}. ${p.pickup || "--"}`);
        })
      : escapeHtml(t.pickup || "--");

  const drops =
    isShared
      ? passengers.map((p,i)=>{
          const order =
            p.dropoffOrder && p.dropoffOrder !== 9999
              ? `D${p.dropoffOrder}`
              : `${i + 1}`;
          return escapeHtml(`${order}. ${p.dropoff || "--"}`);
        })
      : escapeHtml(t.dropoff || "--");

  const stopsDisplay =
    isShared
      ? (
          Array.isArray(t.routePoints) && t.routePoints.length > 2
            ? t.routePoints.slice(1,-1).map((s,i)=>escapeHtml(`${i + 1}. ${s}`))
            : Math.max(0,passengers.filter(passengerIsActive).length - 1)
        )
      : Array.isArray(t.stops) && t.stops.length
        ? t.stops.map((s,i)=>escapeHtml(`${i + 1}. ${s}`))
        : "--";

  const sharedClientEdit =
    passengers.map((p,i)=>`
      ${createSharedEditInput(p.clientName || p.name || "",`passenger_${i}_name`)}
    `).join("");

  const sharedPhoneEdit =
    passengers.map((p,i)=>`
      ${createSharedEditInput(p.clientPhone || p.phone || "",`passenger_${i}_phone`)}
    `).join("");

  const sharedPickupEdit =
    passengers.map((p,i)=>`
      ${createSharedEditInput(p.pickup || "",`passenger_${i}_pickup`)}
    `).join("");

  const sharedDropEdit =
    passengers.map((p,i)=>`
      ${createSharedEditInput(p.dropoff || "",`passenger_${i}_dropoff`)}
    `).join("");

  tr.innerHTML = `
    <td class="col-num">${index}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${escapeHtml(t.tripNumber || "--")}</span>
      ${
        t.routeLocked === true
          ? `<div class="route-locked-badge">Route Locked</div>`
          : ""
      }
      ${
        hasActiveAddStopRequest(t)
          ? `<div class="route-locked-badge">Stop Pending</div>`
          : ""
      }
    </td>

    <td class="col-type">${escapeHtml(isShared ? "SHARED" : "TRIP")}</td>

    <td class="col-service">${escapeHtml(t.serviceTitle || t.serviceName || t.serviceType || t.serviceKey || "--")}</td>

    <td class="col-entry">
      ${editing ? createEditInput(t.entryName || "", "entryName") : cellBox(escapeHtml(t.entryName || "--"))}
    </td>

    <td class="col-entry-phone">
      ${editing ? createEditInput(t.entryPhone || "", "entryPhone") : cellBox(escapeHtml(t.entryPhone || "--"))}
    </td>

    <td class="col-client">
      ${
        editing
          ? (
              isShared
                ? sharedClientEdit
                : createEditInput(t.clientName || "", "clientName")
            )
          : cellBox(clients)
      }
    </td>

    <td class="col-phone">
      ${
        editing
          ? (
              isShared
                ? sharedPhoneEdit
                : createEditInput(t.clientPhone || "", "clientPhone")
            )
          : cellBox(phones)
      }
    </td>

    <td class="col-pickup">
      ${
        editing
          ? (
              isShared
                ? sharedPickupEdit
                : createEditInput(t.pickup || "", "pickup")
            )
          : cellBox(pickups)
      }
    </td>

    <td class="col-stops">
      ${
        editing && !isShared
          ? (
              Array.isArray(t.stops) && t.stops.length
                ? t.stops.map((s,si)=>`
                    <input
                      class="edit-input"
                      data-stop-index="${si}"
                      value="${escapeHtml(s)}"
                    >
                  `).join("")
                : "--"
            )
          : cellBox(stopsDisplay)
      }
    </td>

    <td class="col-drop">
      ${
        editing
          ? (
              isShared
                ? sharedDropEdit
                : createEditInput(t.dropoff || "", "dropoff")
            )
          : cellBox(drops)
      }
    </td>

    <td class="col-date">
      ${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : escapeHtml(t.tripDate || "--")}
    </td>

    <td class="col-time">
      ${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : escapeHtml(t.tripTime || "--")}
    </td>

    <td class="col-notes">
      ${editing ? createEditInput(t.notes || "", "notes") : cellBox(escapeHtml(t.notes || "--"))}
    </td>

    <td class="col-miles">
      <span class="miles-strong">
        ${Number(t.miles || 0).toFixed(2)} mi
      </span>
    </td>

    <td class="col-mins">
      ${Number(t.estimatedMinutes || 0)}
    </td>

    <td class="col-price">
      <span class="price-badge">
        $${formatMoney(t.priceAmount || t.finalPrice || 0)}
      </span>
    </td>

    <td class="col-status">
      <strong>${escapeHtml(t.status || "Review")}</strong>
    </td>

    <td class="col-actions">
      ${renderTripButtons(t)}
    </td>
  `;

  return tr;
}

function groupByCreatedDate(items){

  const groups = {};

  items.forEach(t=>{

    const key =
      getCreatedDateKey(t);

    if(!groups[key]){
      groups[key] = [];
    }

    groups[key].push(t);
  });

  Object.keys(groups).forEach(key=>{
    groups[key].sort((a,b)=>getCreatedDateObject(b) - getCreatedDateObject(a));
  });

  return groups;
}

function renderReviewTable(){

  if(!dispatchReviewList){
    return;
  }

  updateReviewCounter();

  if(!reviewTrips.length){

    dispatchReviewList.innerHTML = `
      <div class="empty-review">
        No RV trips in review.
      </div>
    `;

    return;
  }

  dispatchReviewList.innerHTML = `
    <div class="table-wrap">
      <table class="review-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-trip">Trip#</th>
            <th class="col-type">Type</th>
            <th class="col-service">Service</th>
            <th class="col-entry">Entry</th>
            <th class="col-entry-phone">Entry Phone</th>
            <th class="col-client">Client / Passengers</th>
            <th class="col-phone">Phone</th>
            <th class="col-pickup">Pickup</th>
            <th class="col-stops">Stops</th>
            <th class="col-drop">Dropoff</th>
            <th class="col-date">Trip Date</th>
            <th class="col-time">Time</th>
            <th class="col-notes">Notes</th>
            <th class="col-miles">Miles</th>
            <th class="col-mins">Minutes</th>
            <th class="col-price">Price</th>
            <th class="col-status">Status</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>

        <tbody id="dispatchReviewTbody"></tbody>
      </table>
    </div>
  `;

  const tbody =
    document.getElementById("dispatchReviewTbody");

  const grouped =
    groupByCreatedDate(reviewTrips);

  let counter = 1;

  Object.keys(grouped)
    .sort((a,b)=>{
      if(a === "Unknown") return 1;
      if(b === "Unknown") return -1;
      return new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`);
    })
    .forEach(date=>{

      const dateRow =
        document.createElement("tr");

      dateRow.className =
        "date-row";

      dateRow.innerHTML =
        `<td colspan="19">${escapeHtml(labelCreatedDate(date))}</td>`;

      tbody.appendChild(dateRow);

      grouped[date].forEach(t=>{
        tbody.appendChild(renderTripRow(t,counter++));
      });
    });
}

/* ================= ACTIONS ================= */

async function handleEditTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    reviewTrips.find(t=>String(t._id || t.id) === String(id));

  if(!trip) return;

  if(!checkTripWarningByTrip(trip)){
    return;
  }

  trip.__editing = true;

  renderReviewTable();
}

async function handleCancelEdit(){
  await refreshReview();
}

async function handleSaveEdit(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    reviewTrips.find(t=>String(t._id || t.id) === String(id));

  if(!trip) return;

  if(!checkTripWarningByTrip(trip)){
    return;
  }

  const isShared =
    trip.isShared === true ||
    trip.tripType === "SHARED";

  const payload = {};
  const stops =
    Array.isArray(trip.stops)
      ? [...trip.stops]
      : [];

  const passengers =
    Array.isArray(trip.passengers)
      ? getPassengers(trip).map(p=>({...p}))
      : [];

  tr.querySelectorAll(".edit-input").forEach(input=>{

    const field =
      input.dataset.field;

    const stopIndex =
      input.dataset.stopIndex;

    if(stopIndex !== undefined){

      stops[Number(stopIndex)] =
        normalizeAddress(input.value);

      return;
    }

    if(!field) return;

    if(field.startsWith("passenger_")){

      const parts =
        field.split("_");

      const index =
        Number(parts[1]);

      const key =
        parts[2];

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

    if(field === "pickup" || field === "dropoff"){
      payload[field] = normalizeAddress(input.value);
    }else{
      payload[field] = input.value;
    }
  });

  const nextDate =
    payload.tripDate ?? trip.tripDate;

  const nextTime =
    payload.tripTime ?? trip.tripTime;

  const dt =
    parseTripDateTime(nextDate,nextTime);

  if(!dt){
    showAlert("Invalid date/time");
    return;
  }

  if(dt <= getSystemNow()){
    showAlert("Trip time already passed");
    return;
  }

  if(isShared){

    for(const p of passengers){

      if(!normalizeText(p.clientName || p.name)){
        showAlert("Passenger name required");
        return;
      }

      if(!normalizeText(p.clientPhone || p.phone)){
        showAlert("Passenger phone required");
        return;
      }

      if(!normalizeText(p.pickup)){
        showAlert("Passenger pickup required");
        return;
      }

      if(!normalizeText(p.dropoff)){
        showAlert("Passenger dropoff required");
        return;
      }
    }

    payload.passengers = passengers;
    payload.pickup = passengers[0]?.pickup || "";
    payload.dropoff = passengers[passengers.length - 1]?.dropoff || "";
    payload.totalPassengers = passengers.length;
    payload.passengerCount = passengers.length;
    payload.passengersCount = passengers.length;

  }else{

    payload.stops =
      stops.filter(Boolean);
  }

  payload.status = "Review";
  payload.reservationStatus = "Review";
  payload.reviewOnly = true;
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
  payload.optimizedRoute = null;

  payload.routeLocked = false;
  payload.routeFinalized = false;
  payload.routeSource = "";
  payload.routeUpdatedAt = null;

  await updateTrip(id,payload);

  await refreshReview();

  showAlert("Trip Updated ✔");
}

async function handleDeleteTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  if(!id) return;

  if(!confirm("Delete this trip?")){
    return;
  }

  await deleteTrip(id);

  await refreshReview();

  showAlert("Trip Deleted ✔");
}

async function handleAddStop(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    reviewTrips.find(t=>String(t._id || t.id) === String(id));

  if(!trip) return;

  if(!reservedAllowsAddStop(trip)){
    showAlert("Add Stop is not available for this Reserved trip.");
    return;
  }

  if(!checkTripWarningByTrip(trip)){
    return;
  }

  const stop =
    prompt("Enter stop address:");

  if(!normalizeText(stop)){
    return;
  }

  const stops =
    Array.isArray(trip.stops)
      ? [...trip.stops]
      : [];

  if(stops.length >= 5){
    showAlert("Maximum 5 stops allowed.");
    return;
  }

  const newStop =
    normalizeAddress(stop);

  const finalStops =
    [...stops,newStop];

  await updateTrip(id,{
    stops:finalStops,

    priceAmount:0,
    finalPrice:0,
    pricePerPassenger:0,

    miles:0,
    distanceMeters:0,
    durationSeconds:0,
    estimatedMinutes:0,

    googleRoute:null,
    routePoints:[],
    optimizedRoute:null,

    routeLocked:false,
    routeFinalized:false,
    routeSource:"",
    routeUpdatedAt:null,

    addStopRequest:{
      active:true,
      status:"PENDING",
      source:"dispatch-add-trip",
      createdAt:new Date().toISOString(),
      pickup:trip.pickup,
      dropoffBefore:trip.dropoff,
      dropoffAfter:trip.dropoff,
      existingStopsBefore:stops,
      addedStops:[newStop],
      finalStops
    },

    routeChangePending:true,
    routeChangeStatus:"PENDING"
  });

  await refreshReview();

  showAlert("Stop Added ✔");
}

async function handleCancelStop(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    reviewTrips.find(t=>String(t._id || t.id) === String(id));

  if(!trip) return;

  const req =
    trip.addStopRequest || null;

  if(!req || req.active !== true){
    showAlert("No active stop request.");
    return;
  }

  if(!confirm("Cancel added stop request?")){
    return;
  }

  const restoredStops =
    Array.isArray(req.existingStopsBefore)
      ? req.existingStopsBefore
      : [];

  await updateTrip(id,{
    stops:restoredStops,

    priceAmount:0,
    finalPrice:0,
    pricePerPassenger:0,

    miles:0,
    distanceMeters:0,
    durationSeconds:0,
    estimatedMinutes:0,

    googleRoute:null,
    routePoints:[],
    optimizedRoute:null,

    routeLocked:false,
    routeFinalized:false,

    addStopRequest:{
      ...req,
      active:false,
      status:"CANCELLED_BY_DISPATCH",
      cancelledAt:new Date().toISOString()
    },

    routeChangePending:false,
    routeChangeStatus:"CANCELLED"
  });

  await refreshReview();

  showAlert("Stop Cancelled ✔");
}

async function handleConfirmTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    reviewTrips.find(t=>String(t._id || t.id) === String(id));

  if(!trip) return;

  if(!checkTripWarningByTrip(trip)){
    return;
  }

  const service =
    getServiceByTrip(trip);

  if(!service){
    throw new Error("Reserved service not found");
  }

  const oldText =
    btn.textContent;

  try{

    btn.disabled = true;
    btn.textContent = "Routing...";

    const isShared =
      trip.isShared === true ||
      trip.tripType === "SHARED";

    let routePoints = [];
    let passengers = [];
    let activeCount = 1;

    if(isShared){

      const finalRoute =
        await buildFinalSharedRoute(trip);

      routePoints =
        finalRoute.routePoints;

      passengers =
        finalRoute.passengers;

      activeCount =
        finalRoute.activeCount || 1;

    }else{

      routePoints =
        buildIndividualRoutePoints(trip);

      passengers = [];
      activeCount = 1;
    }

    if(routePoints.length < 2){
      throw new Error("Route is missing pickup/dropoff");
    }

    const routeData =
      await calculateRouteMiles(routePoints);

    btn.textContent = "Pricing...";

    const pricing =
      getReservedPricing(service);

   const stopsCount =
  isShared
    ? Math.max(0,activeCount - 1)
    : Array.isArray(trip.stops)
      ? trip.stops.length
      : 0;

    let total = 0;
    let pricePerPassenger = 0;
    let sharedStopTotal = 0;
    let sharedStopShare = 0;

    if(isShared){

      const sharedPricing =
        calculateSharedPricing({
          service,
          routeData,
          passengers,
          activeCount,
          stopsCount
        });

      total =
        sharedPricing.total;

      pricePerPassenger =
        sharedPricing.pricePerPassenger;

      sharedStopTotal =
        sharedPricing.stopTotal;

      sharedStopShare =
        sharedPricing.stopShare;

      passengers =
        sharedPricing.passengers.map(p=>{

          const s =
            cleanStatus(p.status);

          if(s.includes("no") || s.includes("cancel")){
            return p;
          }

          return {
            ...p,
            status:"Confirmed",
            cancelFee:Number(pricing.cancelFee || 0),
            noShowFee:Number(pricing.noShowFee || 0)
          };
        });

    }else{

      total =
        calculateReservedPrice({
          service,
          miles:routeData.miles,
          minutes:routeData.estimatedMinutes,
          stops:stopsCount
        });
    }

    const serviceCode =
      isShared
        ? "SH"
        : resolveServiceCode(service);

    btn.textContent =
      "Saving...";

    await updateTrip(id,{
      status:"Confirmed",
      reservationStatus:"RV",
      reviewOnly:false,

      type:"reserved",
      reservation:true,
      source:"RV",
      bookingSource:"RV",

      dispatchSelected:true,
      disabled:false,

      isShared,
      tripType:isShared ? "SHARED" : "INDIVIDUAL",

      serviceKey:serviceCode,
      serviceType:serviceCode,
      serviceCode:serviceCode,
      serviceSuffix:serviceCode,
      tripNumberSuffix:serviceCode,
      serviceName:serviceDisplayName(service,serviceCode),
      serviceTitle:serviceDisplayName(service,serviceCode),
      serviceId:String(service?._id || ""),

      vehicleTypeFromQuote:serviceCode,
      vehicleType:serviceCode,

      passengers,
      totalPassengers:isShared ? passengers.length : 1,
      passengerCount:isShared ? passengers.length : 1,
      passengersCount:isShared ? passengers.length : 1,

      pickup:isShared
        ? passengers?.[0]?.pickup || trip.pickup || ""
        : trip.pickup,

      dropoff:isShared
        ? passengers?.[passengers.length - 1]?.dropoff || trip.dropoff || ""
        : trip.dropoff,

      stops:isShared
        ? []
        : Array.isArray(trip.stops)
          ? trip.stops
          : [],

      priceAmount:Number(total || 0),
      finalPrice:Number(total || 0),
      pricePerPassenger:Number(pricePerPassenger || 0),

      miles:Number(routeData.miles || 0),
      distanceMeters:Number(routeData.distanceMeters || 0),
      durationSeconds:Number(routeData.durationSeconds || 0),
      estimatedMinutes:Number(routeData.estimatedMinutes || 0),

      googleRoute:routeData.googleRoute || {},
      routePoints,
      optimizedRoute:routeData.googleRoute || {},

      sharedStopsCount:isShared ? stopsCount : 0,
      sharedStopTotal:isShared ? sharedStopTotal : 0,
      sharedStopShare:isShared ? sharedStopShare : 0,

      cancelFee:Number(pricing.cancelFee || 0),
      noShowFee:Number(pricing.noShowFee || 0),

      reservedPricingMode:pricing.pricingMode,

      reservedPriceSnapshot:{
        pricingMode:pricing.pricingMode,
        baseFare:pricing.baseFare,
        includedMiles:pricing.includedMiles,
        perMile:pricing.perMile,
        hourlyRate:pricing.hourlyRate,
        hourlyBillingMode:pricing.hourlyBillingMode,
        stopFee:pricing.stopFee,
        noShowFee:pricing.noShowFee,
        cancelFee:pricing.cancelFee,
        sharedPrice:pricing.sharedPrice,
        warningMinutes:pricing.warningMinutes,
        disableCancel:pricing.disableCancel,
        sharedStopsCount:isShared ? stopsCount : 0,
        sharedStopTotal:isShared ? sharedStopTotal : 0,
        sharedStopShare:isShared ? sharedStopShare : 0
      },

      routeLocked:true,
      routeFinalized:true,
      routeSource:"dispatch-add-trip",
      routeUpdatedAt:new Date().toISOString(),

      createdFrom:"dispatch-add-trip"
    });

    await refreshReview();

    showAlert("RV Trip Confirmed ✔");

  }catch(err){

    console.error(err);

    showAlert(err.message || "Confirm failed");

    btn.disabled = false;
    btn.textContent = oldText || "Confirm";
  }
}

async function handleCancelTrip(btn){

  const tr =
    btn.closest("tr");

  const id =
    tr.dataset.id;

  const trip =
    reviewTrips.find(t=>String(t._id || t.id) === String(id));

  if(!trip) return;

  if(!checkTripWarningByTrip(trip)){
    return;
  }

  if(!confirm("Cancel this RV trip?")){
    return;
  }

  const service =
    getServiceByTrip(trip);

  if(!service){
    showAlert("Reserved service not found");
    return;
  }

  const pricing =
    getReservedPricing(service);

  const cancelFee =
    warningEnabled(service)
      ? Number(pricing.cancelFee || 0)
      : 0;

  const isShared =
    trip.isShared === true ||
    trip.tripType === "SHARED";

  const passengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  const count =
    isShared
      ? Math.max(1,passengers.length)
      : 1;

  await updateTrip(id,{
    status:"Cancelled",
    reservationStatus:"RV",
    reviewOnly:false,
    dispatchSelected:false,

    priceAmount:isShared ? cancelFee * count : cancelFee,
    finalPrice:isShared ? cancelFee * count : cancelFee,
    cancelFee,

    passengers:isShared
      ? passengers.map(p=>({
          ...p,
          status:"Cancelled",
          cancelFee,
          priceAmount:cancelFee,
          finalPrice:cancelFee
        }))
      : passengers,

    routeLocked:false,
    routeFinalized:false,
    routeSource:"dispatch-add-trip-cancel",
    routeUpdatedAt:new Date().toISOString()
  });

  await refreshReview();

  showAlert("RV Trip Cancelled ✔");
}

/* ================= EVENTS ================= */

document.addEventListener("click",async e=>{

  const btn =
    e.target.closest("button");

  if(!btn) return;

  const action =
    btn.dataset.action;

  if(!action) return;

  try{

    if(action === "edit-trip") await handleEditTrip(btn);
    if(action === "save-edit") await handleSaveEdit(btn);
    if(action === "cancel-edit") await handleCancelEdit(btn);
    if(action === "delete-trip") await handleDeleteTrip(btn);
    if(action === "confirm-trip") await handleConfirmTrip(btn);
    if(action === "cancel-trip") await handleCancelTrip(btn);
    if(action === "add-stop") await handleAddStop(btn);
    if(action === "cancel-stop") await handleCancelStop(btn);

  }catch(err){

    console.error(err);

    showAlert(err.message || "Server Error");

    await refreshReview();
  }
});

/* ================= DRAFTS ================= */

saveDraftBtn?.addEventListener("click",()=>{

  localStorage.setItem(
    "dispatchTripDraft",
    JSON.stringify({
      clientName:clientName?.value || "",
      clientPhone:clientPhone?.value || "",
      pickup:pickupInput?.value || "",
      dropoff:dropoffInput?.value || "",
      tripDate:tripDate?.value || "",
      tripTime:tripTime?.value || "",
      notes:notes?.value || "",
      stops:addTripStops || []
    })
  );

  showAlert("Draft Saved ✔");
});

saveSharedDraftBtn?.addEventListener("click",()=>{

  const passengers = [];

  document
    .querySelectorAll(".passenger-card")
    .forEach(card=>{

      passengers.push({
        clientName:card.querySelector(".sharedClientName")?.value || "",
        clientPhone:card.querySelector(".sharedClientPhone")?.value || "",
        pickup:card.querySelector(".sharedPickup")?.value || "",
        dropoff:card.querySelector(".sharedDropoff")?.value || ""
      });
    });

  localStorage.setItem(
    "dispatchSharedDraft",
    JSON.stringify({
      passengerCount:passengerCount?.value || "",
      sharedDate:sharedDate?.value || "",
      sharedTime:sharedTime?.value || "",
      sharedNotes:sharedNotes?.value || "",
      passengers
    })
  );

  showAlert("Shared Draft Saved ✔");
});

function loadDrafts(){

  const draft =
    JSON.parse(
      localStorage.getItem("dispatchTripDraft") ||
      "{}"
    );

  if(clientName) clientName.value = draft.clientName || "";
  if(clientPhone) clientPhone.value = draft.clientPhone || "";
  if(pickupInput) pickupInput.value = draft.pickup || "";
  if(dropoffInput) dropoffInput.value = draft.dropoff || "";
  if(tripDate) tripDate.value = draft.tripDate || "";
  if(tripTime) tripTime.value = draft.tripTime || "";
  if(notes) notes.value = draft.notes || "";

  addTripStops =
    Array.isArray(draft.stops)
      ? draft.stops
      : [];

  renderAddTripStops();

  const sharedDraft =
    JSON.parse(
      localStorage.getItem("dispatchSharedDraft") ||
      "{}"
    );

  if(passengerCount) passengerCount.value = sharedDraft.passengerCount || "";
  if(sharedDate) sharedDate.value = sharedDraft.sharedDate || "";
  if(sharedTime) sharedTime.value = sharedDraft.sharedTime || "";
  if(sharedNotes) sharedNotes.value = sharedDraft.sharedNotes || "";

  if(sharedDraft.passengerCount){

    renderSharedPassengers(Number(sharedDraft.passengerCount));

    const cards =
      document.querySelectorAll(".passenger-card");

    (sharedDraft.passengers || []).forEach((p,index)=>{

      const card =
        cards[index];

      if(!card) return;

      card.querySelector(".sharedClientName").value = p.clientName || "";
      card.querySelector(".sharedClientPhone").value = p.clientPhone || "";
      card.querySelector(".sharedPickup").value = p.pickup || "";
      card.querySelector(".sharedDropoff").value = p.dropoff || "";
    });
  }
}

/* ================= REFRESH ================= */

async function refreshReview(){
  await fetchReviewTrips();
  renderReviewTable();
}

/* ================= INIT ================= */

loadEntryInfo();
loadDrafts();

await loadSystemInfo();
await loadReservedServices();
await refreshReview();

showAddPage();

});