function getCompanyToken(){
  const own = String(localStorage.getItem("companyToken") || "").trim();
  if(own) return own;
  if(String(localStorage.getItem("role") || "").toLowerCase() === "company"){
    return String(localStorage.getItem("token") || "").trim();
  }
  return "";
}
function getCompanyRole(){
  const own = String(localStorage.getItem("companyRole") || "").trim();
  if(own) return own;
  const legacy = String(localStorage.getItem("role") || "").trim();
  return legacy.toLowerCase() === "company" ? legacy : "";
}
function getCompanyName(){
  const own = String(localStorage.getItem("companyName") || "").trim();
  if(own) return own;
  if(String(localStorage.getItem("role") || "").toLowerCase() === "company"){
    return String(localStorage.getItem("name") || "").trim();
  }
  return "";
}
function getCompanyTenantSlug(){
  return String(
    localStorage.getItem("companyTenantSlug") ||
    sessionStorage.getItem("companyTenantSlug") ||
    ""
  ).trim().toLowerCase();
}
function companyLoginUrl(){
  const slug = getCompanyTenantSlug();
  return slug
    ? `/companies/company-login.html?tenant=${encodeURIComponent(slug)}`
    : "/companies/company-login.html";
}
function companyStorageKey(baseKey){
  const scope =
    getCompanyTenantSlug() ||
    String(localStorage.getItem("companyTenantId") || "").trim() ||
    "company";
  return `${baseKey}:${scope}`;
}

const COMPANY_TOKEN = getCompanyToken();
const COMPANY_NAME = getCompanyName();

if(!COMPANY_TOKEN || getCompanyRole() !== "company"){
  window.location.replace(companyLoginUrl());
}

// summary.js
// COMPANY SUMMARY - FULL DYNAMIC VERSION

let allTrips = [];
let SERVICES = [];
let currentTab = "ALL";
let autoRefreshTimer = null;
let lastServicesRefreshAt = 0;

/* =========================
LOAD
========================= */

async function load(){

  try{

    await Promise.all([
      loadServices(),
      loadTrips()
    ]);

    buildFilters();
    buildTabs();
    render();

  }catch(err){

    console.log(err);

    const wrap =
      document.getElementById("summaryContent");

    if(wrap){
      wrap.innerHTML = `
        <div class="empty-state">
          Failed To Load Summary
        </div>
      `;
    }

  }

}

function extractServicesPayload(payload){

  const candidates = [
    payload,
    payload?.services,
    payload?.items,
    payload?.results,
    payload?.data,
    payload?.data?.services,
    payload?.data?.items,
    payload?.result,
    payload?.result?.services
  ];

  for(const candidate of candidates){
    if(Array.isArray(candidate)){
      return candidate;
    }
  }

  return [];
}

async function loadServices(){

  try{

    const token = COMPANY_TOKEN;

    const facilityId =
      localStorage.getItem("companyFacilityId") ||
      localStorage.getItem("companyUserId") ||
      localStorage.getItem("companyId") ||
      localStorage.getItem("facilityId") ||
      localStorage.getItem("userId") ||
      "";

    const facilityName =
      localStorage.getItem("companyName") ||
      localStorage.getItem("facilityName") ||
      COMPANY_NAME ||
      "";

    /*
      1) Load the normal Company service catalog from Service Management.
    */
    const res =
      await fetch("/api/services?company=true",{
        cache:"no-store",
        headers:{
          Authorization:"Bearer " + token
        }
      });

    if(!res.ok){
      throw new Error("Failed loading services");
    }

    const data =
      await res.json();

    let services =
      extractServicesPayload(data)
        .filter(s =>
          s &&
          typeof s === "object"
        );

    /*
      2) Facility Override is the FINAL switch for this facility.

      If the override is active and a service has:
        facilityEnabled:false

      that service must disappear from Summary completely.
      It must NOT come back from Service Management.
    */
    let override = null;

    try{

      const bootRes =
        await fetch(
          "/api/facility-pricing-override/bootstrap",
          {
            cache:"no-store",
            headers:{
              Authorization:"Bearer " + token
            }
          }
        );

      const bootData =
        await bootRes.json().catch(()=>({}));

      if(
        bootRes.ok &&
        bootData?.success === true &&
        Array.isArray(bootData.overrides)
      ){

        const fid =
          String(facilityId || "").trim();

        const fname =
          String(facilityName || "")
            .trim()
            .toLowerCase();

        override =
          bootData.overrides.find(o=>{

            const oid =
              String(o?.facilityId || "").trim();

            const oname =
              String(o?.facilityName || "")
                .trim()
                .toLowerCase();

            return (
              (
                fid &&
                oid &&
                oid === fid
              ) ||
              (
                fname &&
                oname &&
                oname === fname
              )
            );
          }) || null;
      }

    }catch(overrideErr){
      console.log(
        "SUMMARY FACILITY OVERRIDE LOAD ERROR",
        overrideErr
      );
    }

    if(
      override &&
      override.active === true &&
      Array.isArray(override.services)
    ){

      const facilityStateByCode =
        new Map();

      override.services.forEach(service=>{

        const code =
          getServiceCode(service);

        if(!code){
          return;
        }

        facilityStateByCode.set(
          code,
          service.facilityEnabled !== false
        );
      });

      services =
        services.filter(service=>{

          const code =
            getServiceCode(service);

          /*
            If this service exists inside the active Facility Override,
            obey the facility switch. A missing old flag means ENABLED.
            Services not present in the override keep their base visibility.
          */
          if(
            code &&
            facilityStateByCode.has(code)
          ){
            return (
              facilityStateByCode.get(code) === true
            );
          }

          return true;
        });
    }

    /*
      Always replace the catalog.
      This prevents an old/stale service list from surviving
      after Service Management or Facility Override changes.
    */
    SERVICES = services;
    lastServicesRefreshAt = Date.now();

  }catch(err){

    console.log("SUMMARY SERVICES LOAD ERROR",err);

    if(!Array.isArray(SERVICES)){
      SERVICES = [];
    }

  }

}

async function loadTrips(){

  const company = COMPANY_NAME;

  const token = COMPANY_TOKEN;

  const res =
    await fetch(
      `/api/trips/summary?company=${encodeURIComponent(company)}`,
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

  if(!res.ok){
    throw new Error("Failed loading trips");
  }

  const data =
    await res.json();

  allTrips =
    Array.isArray(data)
    ? data
    : [];

}

/* =========================
HELPERS
========================= */

function safeText(v){
  return String(v ?? "")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function locationParts(value){

  if(Array.isArray(value)){
    return value
      .map(v => String(v ?? "").trim())
      .filter(Boolean);
  }

  const text =
    String(value ?? "").trim();

  if(!text){
    return [];
  }

  const parts =
    text
      .split(/\r?\n+/)
      .map(v => v.trim())
      .filter(Boolean);

  return parts.length
    ? parts
    : [text];

}

function locationBoxes(value){

  const parts =
    locationParts(value);

  if(!parts.length){
    return `<div class="location-box">-</div>`;
  }

  return `
    <div class="location-boxes">
      ${parts.map(part => `
        <div class="location-box">${safeText(part)}</div>
      `).join("")}
    </div>
  `;

}

function stopsBoxes(value){

  const parts =
    Array.isArray(value)
      ? value
          .map(v => {
            if(typeof v === "string"){
              return v.trim();
            }

            if(v && typeof v === "object"){
              return String(
                v.address ||
                v.stop ||
                v.location ||
                v.name ||
                ""
              ).trim();
            }

            return "";
          })
          .filter(Boolean)
      : locationParts(value);

  if(!parts.length){
    return `<div class="location-box">-</div>`;
  }

  return `
    <div class="location-boxes">
      ${parts.map((part,index) => `
        <div class="location-box stop-box">
          <span class="stop-number">${index + 1}.</span>
          <span>${safeText(part)}</span>
        </div>
      `).join("")}
    </div>
  `;

}

function getSummaryNote(trip){

  return String(
    trip?.note ??
    trip?.notes ??
    trip?.tripNote ??
    trip?.tripNotes ??
    trip?.companyNote ??
    trip?.companyNotes ??
    trip?.entryNote ??
    trip?.entryNotes ??
    ""
  ).trim();

}

function getSummaryBookedDate(trip){

  if(trip?.bookingDate){
    return String(trip.bookingDate);
  }

  const raw =
    trip?.bookedAt ||
    trip?.createdAt ||
    "";

  if(!raw){
    return "-";
  }

  const d =
    new Date(raw);

  if(isNaN(d.getTime())){
    return "-";
  }

  return d.toLocaleDateString("en-US",{
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    timeZone:"America/Phoenix"
  });

}

function getSummaryBookedTime(trip){

  if(trip?.bookingTime){
    return String(trip.bookingTime);
  }

  const raw =
    trip?.bookedAt ||
    trip?.createdAt ||
    "";

  if(!raw){
    return "-";
  }

  const d =
    new Date(raw);

  if(isNaN(d.getTime())){
    return "-";
  }

  return d.toLocaleTimeString("en-US",{
    hour:"numeric",
    minute:"2-digit",
    hour12:true,
    timeZone:"America/Phoenix"
  });

}

function summaryDetailRow(label,value){

  const clean =
    String(value ?? "").trim();

  if(!clean){
    return "";
  }

  return `
    <div class="summary-detail-item">
      <div class="summary-detail-label">${safeText(label)}</div>
      <div class="summary-detail-value">${safeText(clean)}</div>
    </div>
  `;

}

function renderSummaryDetails(trip){

  if(!trip){
    return `
      <div class="summary-detail-empty">
        Trip Details Not Available
      </div>
    `;
  }

  const note =
    getSummaryNote(trip);

  return `
    <div class="summary-details-grid">
      ${summaryDetailRow("Company",trip.company || trip.companyName || trip.facilityName || "-")}
      ${summaryDetailRow("Entry Name",trip.entryName || "-")}
      ${summaryDetailRow("Entry Phone",trip.entryPhone || "-")}
      ${summaryDetailRow("Booked Date",getSummaryBookedDate(trip))}
      ${summaryDetailRow("Booked Time",getSummaryBookedTime(trip))}
      ${note ? summaryDetailRow("Note",note) : ""}
    </div>
  `;

}

function closeSummaryDetails(){

  document
    .getElementById("summaryDetailsOverlay")
    ?.remove();

}

async function openSummaryDetails(tripId){

  const id =
    String(tripId || "").trim();

  const localTrip =
    allTrips.find(t =>
      String(t?._id || "") === id
    ) || null;

  closeSummaryDetails();

  const overlay =
    document.createElement("div");

  overlay.id =
    "summaryDetailsOverlay";

  overlay.className =
    "summary-details-overlay";

  overlay.innerHTML = `
    <div class="summary-details-modal" role="dialog" aria-modal="true">
      <div class="summary-details-head">
        <div>Trip Details</div>
        <button
          type="button"
          class="summary-details-close"
          aria-label="Close"
          onclick="closeSummaryDetails()">
          ×
        </button>
      </div>

      <div
        id="summaryDetailsBody"
        class="summary-details-body">
        ${renderSummaryDetails(localTrip)}
      </div>
    </div>
  `;

  overlay.addEventListener("click",event=>{
    if(event.target === overlay){
      closeSummaryDetails();
    }
  });

  document.body.appendChild(overlay);

  if(!id){
    return;
  }

  try{

    const res =
      await fetch(
        `/api/trips/${encodeURIComponent(id)}`,
        {
          headers:{
            Authorization:"Bearer " + COMPANY_TOKEN
          }
        }
      );

    if(!res.ok){
      return;
    }

    const payload =
      await res.json();

    const fullTrip =
      payload?.trip ||
      payload?.data ||
      payload;

    if(!fullTrip || typeof fullTrip !== "object"){
      return;
    }

    const body =
      document.getElementById("summaryDetailsBody");

    if(body){
      body.innerHTML =
        renderSummaryDetails({
          ...(localTrip || {}),
          ...fullTrip
        });
    }

  }catch(err){
    console.log(err);
  }

}

function num(v){
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function money(v){
  return "$" + num(v).toFixed(2);
}

function getTripSuffix(trip){

  const parts =
    String(trip?.tripNumber || "")
    .split("-");

  return String(parts[parts.length - 1] || "")
    .trim()
    .toUpperCase();

}

function normalizeServiceCode(value){

  const raw =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if(!raw){
    return "";
  }

  if(raw === "STANDARD") return "ST";
  if(raw === "WHEELCHAIR") return "WH";
  if(raw === "SHARED") return "SH";
  if(raw === "LIMO" || raw === "LIMOUSINE") return "LM";
  if(raw === "TAXI") return "TX";
  if(raw === "XL") return "XL";

  return raw;
}

function getServiceKey(service){

  if(!service || typeof service !== "object"){
    return "";
  }

  return String(
    service.serviceKey ??
    service.key ??
    service.slug ??
    service.type ??
    service.value ??
    service.code ??
    service.serviceCode ??
    service.suffix ??
    service.title ??
    service.name ??
    service.serviceName ??
    ""
  ).trim().toUpperCase();

}

function getServiceTitle(service){

  if(!service || typeof service !== "object"){
    return "Service";
  }

  return String(
    service.title ??
    service.name ??
    service.serviceName ??
    service.label ??
    service.displayName ??
    getServiceKey(service) ??
    "Service"
  ).trim() || "Service";

}

function getServiceCode(service){

  if(!service || typeof service !== "object"){
    return normalizeServiceCode(service);
  }

  /*
    New/custom services must use their explicit generated suffix/code first.
    This keeps Summary aligned with the trip number/service code generated
    by Service Management.
  */
  const explicit =
    service.customServiceCode ??
    service.companySuffix ??
    service.suffix ??
    service.serviceSuffix ??
    service.serviceCode ??
    service.code ??
    "";

  if(String(explicit ?? "").trim()){
    return normalizeServiceCode(explicit);
  }

  return normalizeServiceCode(
    getServiceKey(service)
  );

}

function getTripServiceCode(trip){

  if(!trip || typeof trip !== "object"){
    return "";
  }

  const serviceObject =
    trip.service &&
    typeof trip.service === "object"
      ? trip.service
      : null;

  const direct =
    trip.serviceCode ??
    trip.serviceSuffix ??
    trip.serviceKey ??
    trip.serviceType ??
    trip.serviceName ??
    serviceObject?.suffix ??
    serviceObject?.serviceSuffix ??
    serviceObject?.serviceCode ??
    serviceObject?.code ??
    serviceObject?.serviceKey ??
    serviceObject?.key ??
    (
      typeof trip.service === "string"
        ? trip.service
        : ""
    );

  const normalized =
    normalizeServiceCode(direct);

  if(normalized){
    return normalized;
  }

  return normalizeServiceCode(
    getTripSuffix(trip)
  );

}

function getServiceCatalog(){

  const byCode =
    new Map();

  /*
    SUMMARY SERVICE SOURCE:
    Only services returned by /api/services?company=true are allowed
    to create Summary tabs/stat cards.

    Do NOT add services discovered from historical trips.
    Old trips remain visible under "All", but an old/disabled service
    must not recreate a service tab after Service Management disabled it.
  */
  (Array.isArray(SERVICES) ? SERVICES : [])
    .forEach(service=>{

      const code =
        getServiceCode(service);

      if(!code){
        return;
      }

      byCode.set(code,{
        code,
        title:getServiceTitle(service),
        service
      });

    });

  return [...byCode.values()];

}

function isSharedTrip(trip){

  return (
    trip?.isShared === true ||
    getTripSuffix(trip) === "SH" ||
    getTripServiceCode(trip) === "SH" ||
    Array.isArray(trip?.passengers)
  );

}

function normalizeStatus(status){

  return String(status || "")
    .trim()
    .toLowerCase();

}

function isCompleted(status){
  return normalizeStatus(status).includes("complete");
}

function isEndedAtStop(t){
  return (
    t?.endedAtStop === true ||
    String(t?.completionType || "").trim().toUpperCase() === "ENDED_AT_STOP" ||
    Boolean(t?.stopEndAt) ||
    Boolean(t?.stopExecution?.endedAt)
  );
}

function isCancelled(status){
  return normalizeStatus(status).includes("cancel");
}

function isNoShow(status){
  return (
    normalizeStatus(status).includes("no show") ||
    normalizeStatus(status).includes("noshow")
  );
}

function isNotCompleted(trip){

  const status =
    String(trip.status || "")
    .toLowerCase();

  if(
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("show")
  ){
    return false;
  }

  if(!trip.tripDate){
    return false;
  }

  const tripDateTime =
    new Date(
      `${trip.tripDate} ${trip.tripTime || "00:00"}`
    );

  if(isNaN(tripDateTime.getTime())){
    return false;
  }

  const diffHours =
    (Date.now() - tripDateTime.getTime())
    / 1000 / 60 / 60;

  return diffHours >= 10;
}

function isScheduled(status){
  return normalizeStatus(status) === "scheduled";
}

function isConfirmed(status){
  return normalizeStatus(status) === "confirmed";
}

function getTripDateTime(t){

  if(!t || !t.tripDate){
    return null;
  }

  const date =
    String(t.tripDate || "").trim();

  let time =
    String(t.tripTime || "00:00").trim();

  if(!time){
    time = "00:00";
  }

  const d =
    new Date(`${date}T${time}`);

  if(isNaN(d.getTime())){
    return null;
  }

  return d;

}

function isNotCompletedTrip(t){

  if(!t){
    return false;
  }

  if(isSharedTrip(t)){

    const passengers =
      Array.isArray(t.passengers)
      ? t.passengers
      : [];

    return passengers.some(p =>
      isNotCompletedStatus(p.status,t)
    );

  }

  return isNotCompletedStatus(t.status,t);

}

function isNotCompletedStatus(status,trip){

  if(
    isCompleted(status) ||
    isCancelled(status) ||
    isNoShow(status)
  ){
    return false;
  }

  if(
    !isScheduled(status) &&
    !isConfirmed(status)
  ){
    return false;
  }

  const dt =
    getTripDateTime(trip);

  if(!dt){
    return false;
  }

  const diff =
    Date.now() - dt.getTime();

  return diff >= 10 * 60 * 60 * 1000;

}

function displayStatus(status,trip){

  if(isNotCompletedStatus(status,trip)){
    return "Not Completed";
  }

  return status || "-";

}

/* =========================
PRICE / MILES
========================= */
function getPassengerPrice(p){

  if(isCancelled(p.status)){

    return Number(
      p.cancelFee ??
      p.finalPrice ??
      p.priceAmount ??
      p.price ??
      0
    );

  }

  if(isNoShow(p.status)){

    return Number(
      p.noShowFee ??
      p.finalPrice ??
      p.priceAmount ??
      p.price ??
      0
    );

  }

  return Number(
    p.finalPrice ??
    p.priceAmount ??
    p.price ??
    0
  );

}

function getIndividualMiles(t){

  if(isCancelled(t?.status)){
    return 0;
  }

  if(isNotCompletedStatus(t?.status,t)){
    return 0;
  }

  if(isEndedAtStop(t)){
    return num(
      t?.stopEndMiles ??
      t?.stopExecution?.miles ??
      0
    );
  }

  return num(t?.miles);

}

function getSharedMiles(t){

  const passengers =
    Array.isArray(t?.passengers)
    ? t.passengers
    : [];

  const hasCompleted =
    passengers.some(p =>
      isCompleted(p.status)
    );

  if(!hasCompleted){
    return 0;
  }

  return num(t?.miles);

}

function getTripPrice(t){

  if(isNotCompletedStatus(t?.status,t)){
    return 0;
  }

  if(isCancelled(t?.status)){

    return num(
      t.cancelFee ??
      t.finalPrice ??
      t.priceAmount ??
      0
    );

  }

  if(isNoShow(t?.status)){

    return num(
      t.noShowFee ??
      t.finalPrice ??
      t.priceAmount ??
      0
    );

  }

  if(isEndedAtStop(t)){
    return firstPositiveNumber(
      t?.finalPrice,
      t?.priceAmount,
      t?.totalPrice,
      t?.stopExecution?.finalPrice
    );
  }

  return num(
    t.finalPrice ??
    t.priceAmount ??
    0
  );

}

function firstPositiveNumber(...values){
  for(const value of values){
    if(
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ){
      continue;
    }

    const number = num(value);

    if(number > 0){
      return number;
    }
  }

  return 0;
}

/* =========================
TABS
========================= */

function buildTabs(){

  const wrap =
    document.getElementById("serviceTabs");

  if(!wrap){
    return;
  }

  let html = `
    <button
      class="tab ${currentTab === "ALL" ? "active" : ""}"
      onclick="switchTab('ALL',this)">
      All
    </button>
  `;

  const tabs =
    getServiceCatalog();

  /*
    If a service was removed while its tab was selected,
    safely return to All.
  */
  if(
    currentTab !== "ALL" &&
    !tabs.some(tab => tab.code === currentTab)
  ){
    currentTab = "ALL";
  }

  tabs.forEach(tab=>{

    html += `
      <button
        class="tab ${currentTab === tab.code ? "active" : ""}"
        onclick="switchTab('${safeText(tab.code)}',this)">
        ${safeText(tab.title)}
      </button>
    `;

  });

  wrap.innerHTML = html;

}

function switchTab(tab,btn){

  currentTab =
    String(tab || "ALL").toUpperCase();

  document
    .querySelectorAll(".tab")
    .forEach(t =>
      t.classList.remove("active")
    );

  if(btn){
    btn.classList.add("active");
  }

  render();

}

/* =========================
FILTERS
========================= */

function buildFilters(){

  const year =
    document.getElementById("yearFilter");

  const month =
    document.getElementById("monthFilter");

  if(!year || !month){
    return;
  }

  const oldYear =
    year.value || "";

  const oldMonth =
    month.value || "";

  const years =
    new Set();

  allTrips.forEach(t=>{

    if(t.tripDate){

      const y =
        String(t.tripDate)
        .split("-")[0];

      if(y){
        years.add(y);
      }

    }

  });

  year.innerHTML = `
    <option value="">All Years</option>
  `;

  [...years]
    .sort((a,b)=>Number(b)-Number(a))
    .forEach(y=>{

      year.innerHTML += `
        <option value="${safeText(y)}">
          ${safeText(y)}
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

  year.value = oldYear;
  month.value = oldMonth;

}

/* =========================
FILTER DATA
========================= */

function getFilteredTrips(){

  const q =
    document
      .getElementById("searchInput")
      ?.value
      ?.toLowerCase()
      ?.trim() || "";

  const year =
    document
      .getElementById("yearFilter")
      ?.value || "";

  const month =
    document
      .getElementById("monthFilter")
      ?.value || "";

  let data =
    allTrips.filter(t=>{

      let txt = `
        ${t.tripNumber || ""}
        ${t.company || ""}
        ${t.entryName || ""}
        ${t.entryPhone || ""}
        ${t.clientName || ""}
        ${t.clientPhone || ""}
      `;

      if(Array.isArray(t.passengers)){

        t.passengers.forEach(p=>{

          txt += `
            ${p.clientName || ""}
            ${p.clientPhone || ""}
            ${p.passengerName || ""}
            ${p.passengerPhone || ""}
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
          String(t.tripDate).split("-");

        if(year && parts[0] !== year){
          return false;
        }

        if(month && parts[1] !== month){
          return false;
        }

      }

      return true;

    });

  if(currentTab !== "ALL"){

    data =
      data.filter(t =>
        getTripServiceCode(t) === currentTab
      );

  }

  return data;

}

/* =========================
STATS
========================= */

function buildServiceStats(data){

  return getServiceCatalog().map(item=>{

    const service =
      item.service || {};

    const code =
      item.code || getServiceCode(service);

    const serviceTrips =
      data.filter(t =>
        getTripServiceCode(t) === code
      );

    let trips = 0;
    let miles = 0;
    let revenue = 0;
    let passengers = 0;

    serviceTrips.forEach(t=>{

      trips++;

      if(isSharedTrip(t)){

        const list =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        passengers += list.length;

        revenue += list.reduce((sum,p)=>{
          return sum + getPassengerPrice(p);
        },0);

        miles += getSharedMiles(t);

      }else{

        revenue += getTripPrice(t);
        miles += getIndividualMiles(t);

      }

    });

    return {
      title:item.title || getServiceTitle(service),
      code,
      trips,
      miles,
      revenue,
      passengers
    };

  });

}

function updateStats(filteredData){

  let totalTrips = 0;
  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let notCompleted = 0;
  let totalRevenue = 0;
  let totalMiles = 0;
  let totalPassengers = 0;

  filteredData.forEach(t=>{

    totalTrips++;

    if(isSharedTrip(t)){

      const passengers =
        Array.isArray(t.passengers)
        ? t.passengers
        : [];

      totalPassengers += passengers.length;

      passengers.forEach(p=>{

        if(isCompleted(p.status)){
          completed++;
        }

        else if(isCancelled(p.status)){
          cancelled++;
        }

        else if(isNoShow(p.status)){
          noshow++;
        }

        else if(isNotCompletedStatus(p.status,t)){
          notCompleted++;
        }

        totalRevenue +=
          getPassengerPrice(p);

      });

      totalMiles +=
        getSharedMiles(t);

    }else{

      if(isCompleted(t.status)){
        completed++;
      }

      else if(isCancelled(t.status)){
        cancelled++;
      }

      else if(isNoShow(t.status)){
        noshow++;
      }

      else if(isNotCompletedStatus(t.status,t)){
        notCompleted++;
      }

      totalRevenue +=
        getTripPrice(t);

      totalMiles +=
        getIndividualMiles(t);

    }

  });

  const servicesWrap =
    document.getElementById("servicesStats");

  if(servicesWrap){

    const services =
      buildServiceStats(filteredData);

    servicesWrap.innerHTML =
      services.map(s=>`

        <div class="stat">

          <div class="stat-title">
            ${safeText(s.title)}
          </div>

          <div class="stat-lines">
            Trips:
            <span class="big">${s.trips}</span><br>

            Miles:
            <span class="big">${s.miles.toFixed(1)}</span><br>

            Revenue:
            <span class="big">${money(s.revenue)}</span>

            ${
              s.code === "SH"
              ? `<br>Passengers: <span class="big">${s.passengers}</span>`
              : ""
            }
          </div>

        </div>

      `).join("");

  }

  const totalsWrap =
    document.getElementById("totalsStats");

  if(totalsWrap){

    totalsWrap.innerHTML = `

      <div class="stat">
        <div class="stat-title">Total Trips</div>
        <div class="stat-value">${totalTrips}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Completed</div>
        <div class="stat-value">${completed}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Cancelled</div>
        <div class="stat-value">${cancelled}</div>
      </div>

      <div class="stat">
        <div class="stat-title">No Show</div>
        <div class="stat-value">${noshow}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Not Completed</div>
        <div class="stat-value">${notCompleted}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Revenue</div>
        <div class="stat-value">${money(totalRevenue)}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Miles</div>
        <div class="stat-value">${totalMiles.toFixed(1)}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Passengers</div>
        <div class="stat-value">${totalPassengers}</div>
      </div>

    `;

  }

}

/* =========================
GROUP
========================= */

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

/* =========================
STATUS HTML
========================= */

function statusHTML(status,trip){

  const label =
    displayStatus(status,trip);

  let cls = "";

  if(label === "Not Completed"){
    cls = "notcompleted";
  }

  else if(isCompleted(status)){
    cls = "completed";
  }

  else if(isCancelled(status)){
    cls = "cancelled";
  }

  else if(isNoShow(status)){
    cls = "noshow";
  }

  else if(isScheduled(status)){
    cls = "scheduled";
  }

  else if(isConfirmed(status)){
    cls = "confirmed";
  }

  return `
    <span class="status ${cls}">
      ${safeText(label)}
    </span>
  `;

}

/* =========================
RENDER
========================= */

function render(){

  const wrap =
    document.getElementById("summaryContent");

  if(!wrap){
    return;
  }

  const data =
    getFilteredTrips();

  updateStats(data);

  const groups =
    groupByDay(data);

  const sortedDays =
    Object.keys(groups)
      .sort((a,b)=>
        new Date(b) - new Date(a)
      );

  if(!sortedDays.length){

    wrap.innerHTML = `
      <div class="empty-state">
        No Trips Found
      </div>
    `;

    return;

  }

  const pageParts = [];

  sortedDays.forEach(day=>{

    const rowParts = [];

    groups[day].forEach(t=>{

      if(!isSharedTrip(t)){

        const total =
          getTripPrice(t);

        const miles =
          getIndividualMiles(t);

        rowParts.push(`

          <tr>
            <td class="col-trip-number single-value-cell">${safeText(t.tripNumber || "-")}</td>
            <td class="col-passenger single-value-cell">${safeText(t.clientName || "-")}</td>
            <td class="col-phone single-value-cell">${safeText(t.clientPhone || "-")}</td>

            <td class="location-cell col-pickup">
              ${locationBoxes(t.pickup)}
            </td>

            <td class="location-cell col-stops">
              ${stopsBoxes(t.stops)}
            </td>

            <td class="location-cell col-dropoff">
              ${locationBoxes(t.dropoff)}
            </td>

            <td class="col-date single-value-cell">${safeText(t.tripDate || "-")}</td>
            <td class="col-time single-value-cell">${safeText(t.tripTime || "-")}</td>
            <td class="col-miles single-value-cell">${miles.toFixed(1)}</td>
            <td class="col-status single-value-cell">${statusHTML(t.status,t)}</td>
            <td class="total col-price single-value-cell">${money(total)}</td>
            <td class="total col-total single-value-cell">${money(total)}</td>

            <td class="col-eye single-value-cell">
              <button
                type="button"
                class="summary-eye-btn"
                title="View Trip Details"
                aria-label="View Trip Details"
                onclick="openSummaryDetails('${safeText(t._id || "")}')">
                👁
              </button>
            </td>
          </tr>

          <tr class="trip-divider-line">
            <td colspan="13"></td>
          </tr>

        `);

      }else{

        const passengers =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        const sharedTotal =
          passengers.reduce((sum,p)=>{
            return sum + getPassengerPrice(p);
          },0);

        const sharedMiles =
          getSharedMiles(t);

        const rowCount =
          Math.max(passengers.length,1);

        if(!passengers.length){

          rowParts.push(`
            <tr>
              <td class="col-trip-number single-value-cell">${safeText(t.tripNumber || "-")}</td>
              <td class="col-passenger single-value-cell">-</td>
              <td class="col-phone single-value-cell">-</td>

              <td class="location-cell col-pickup">
                ${locationBoxes(t.pickup)}
              </td>

              <td class="location-cell col-stops">
                ${stopsBoxes(t.stops)}
              </td>

              <td class="location-cell col-dropoff">
                ${locationBoxes(t.dropoff)}
              </td>

              <td class="col-date single-value-cell">${safeText(t.tripDate || "-")}</td>
              <td class="col-time single-value-cell">${safeText(t.tripTime || "-")}</td>
              <td class="col-miles single-value-cell">${sharedMiles.toFixed(1)}</td>
              <td class="col-status single-value-cell">${statusHTML(t.status || "Scheduled",t)}</td>
              <td class="total col-price single-value-cell">${money(0)}</td>
              <td class="total col-total single-value-cell">${money(sharedTotal)}</td>
              <td class="col-eye single-value-cell">
                <button
                  type="button"
                  class="summary-eye-btn"
                  title="View Trip Details"
                  aria-label="View Trip Details"
                  onclick="openSummaryDetails('${safeText(t._id || "")}')">
                  👁
                </button>
              </td>
            </tr>

            <tr class="trip-divider-line">
              <td colspan="13"></td>
            </tr>
          `);

        }else{

          passengers.forEach((p,index)=>{

            const passengerPrice =
              getPassengerPrice(p);

            rowParts.push(`

              <tr class="${
                index !== passengers.length - 1
                ? "shared-separator"
                : ""
              }">

                ${
                  index === 0
                  ? `
                    <td
                      class="col-trip-number shared-master-cell"
                      rowspan="${rowCount}">
                      ${safeText(t.tripNumber || "-")}
                    </td>
                  `
                  : ""
                }

                <td class="col-passenger single-value-cell">
                  ${safeText(p.clientName || p.passengerName || "-")}
                </td>

                <td class="col-phone single-value-cell">
                  ${safeText(p.clientPhone || p.passengerPhone || "-")}
                </td>

                <td class="location-cell col-pickup">
                  ${locationBoxes(p.pickup)}
                </td>

                <td class="location-cell col-stops">
                  ${stopsBoxes(p.stops || t.stops)}
                </td>

                <td class="location-cell col-dropoff">
                  ${locationBoxes(p.dropoff)}
                </td>

                ${
                  index === 0
                  ? `
                    <td
                      class="col-date shared-master-cell"
                      rowspan="${rowCount}">
                      ${safeText(t.tripDate || "-")}
                    </td>

                    <td
                      class="col-time shared-master-cell"
                      rowspan="${rowCount}">
                      ${safeText(t.tripTime || "-")}
                    </td>

                    <td
                      class="col-miles shared-master-cell"
                      rowspan="${rowCount}">
                      ${sharedMiles.toFixed(1)}
                    </td>
                  `
                  : ""
                }

                <td class="col-status single-value-cell">
                  ${statusHTML(p.status || "Scheduled",t)}
                </td>

                <td class="total col-price single-value-cell">
                  ${money(passengerPrice)}
                </td>

                ${
                  index === 0
                  ? `
                    <td
                      class="total col-total shared-master-cell"
                      rowspan="${rowCount}">
                      ${money(sharedTotal)}
                    </td>

                    <td
                      class="col-eye shared-master-cell"
                      rowspan="${rowCount}">
                      <button
                        type="button"
                        class="summary-eye-btn"
                        title="View Trip Details"
                        aria-label="View Trip Details"
                        onclick="openSummaryDetails('${safeText(t._id || "")}')">
                        👁
                      </button>
                    </td>
                  `
                  : ""
                }

              </tr>

            `);

          });

          rowParts.push(`
            <tr class="trip-divider-line">
              <td colspan="13"></td>
            </tr>
          `);

        }

      }

    });

    pageParts.push(`

      <section class="summary-day-section">

        <div class="day-title">
          ${safeText(day)}
        </div>

        <div class="table-wrap">

          <table class="summary-table">

            <thead>
              <tr>
                <th class="col-trip-number">Trip#</th>
                <th class="col-passenger">Passenger</th>
                <th class="col-phone">Phone</th>
                <th class="col-pickup">Pickup</th>
                <th class="col-stops">Stops</th>
                <th class="col-dropoff">Dropoff</th>
                <th class="col-date">Trip Date</th>
                <th class="col-time">Trip Time</th>
                <th class="col-miles">Miles</th>
                <th class="col-status">Status</th>
                <th class="col-price">Price</th>
                <th class="col-total">Total</th>
                <th class="col-eye">View</th>
              </tr>
            </thead>

            <tbody>
              ${rowParts.join("")}
            </tbody>

          </table>

        </div>

      </section>

    `);

  });

  wrap.innerHTML =
    pageParts.join("");

}


/* =========================
EXPORT
========================= */

function exportFileName(ext){

  const company =
    String(COMPANY_NAME || "company")
      .trim()
      .replace(/[^a-z0-9]+/gi,"-")
      .replace(/^-+|-+$/g,"")
      .toLowerCase() || "company";

  return `${company}-summary.${ext}`;

}

function downloadBlob(content,type,fileName){

  const blob =
    new Blob([content],{type});

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(()=>{
    URL.revokeObjectURL(url);
  },1000);

}

function exportStopText(value){

  if(!value){
    return "";
  }

  const list =
    Array.isArray(value)
      ? value
      : [value];

  return list
    .map((item,index)=>{

      let text = "";

      if(typeof item === "string"){
        text = item;
      }

      else if(item && typeof item === "object"){
        text =
          item.address ||
          item.stop ||
          item.location ||
          item.name ||
          "";
      }

      text =
        String(text || "").trim();

      return text
        ? `${index + 1}. ${text}`
        : "";

    })
    .filter(Boolean)
    .join(" | ");

}

function getExportRows(){

  const data =
    getFilteredTrips();

  const rows = [[
    "Trip#",
    "Passenger",
    "Phone",
    "Pickup",
    "Stops",
    "Dropoff",
    "Trip Date",
    "Trip Time",
    "Miles",
    "Status",
    "Price",
    "Total",
    "Company",
    "Entry Name",
    "Entry Phone",
    "Booked Date",
    "Booked Time",
    "Note"
  ]];

  data.forEach(t=>{

    const company =
      t?.company ||
      t?.companyName ||
      t?.facilityName ||
      "";

    const entryName =
      t?.entryName || "";

    const entryPhone =
      t?.entryPhone || "";

    const bookedDate =
      getSummaryBookedDate(t);

    const bookedTime =
      getSummaryBookedTime(t);

    const note =
      getSummaryNote(t);

    if(isSharedTrip(t)){

      const passengers =
        Array.isArray(t?.passengers)
        ? t.passengers
        : [];

      const sharedTotal =
        passengers.reduce(
          (sum,p)=>sum + getPassengerPrice(p),
          0
        );

      const sharedMiles =
        getSharedMiles(t);

      if(!passengers.length){

        rows.push([
          t?.tripNumber || "",
          "",
          "",
          t?.pickup || "",
          exportStopText(t?.stops),
          t?.dropoff || "",
          t?.tripDate || "",
          t?.tripTime || "",
          sharedMiles.toFixed(1),
          displayStatus(t?.status,t),
          money(0),
          money(sharedTotal),
          company,
          entryName,
          entryPhone,
          bookedDate,
          bookedTime,
          note
        ]);

        return;
      }

      passengers.forEach((p,index)=>{

        rows.push([
          index === 0 ? (t?.tripNumber || "") : "",
          p?.clientName || p?.passengerName || "",
          p?.clientPhone || p?.passengerPhone || "",
          p?.pickup || "",
          exportStopText(p?.stops || t?.stops),
          p?.dropoff || "",
          index === 0 ? (t?.tripDate || "") : "",
          index === 0 ? (t?.tripTime || "") : "",
          index === 0 ? sharedMiles.toFixed(1) : "",
          displayStatus(p?.status || "Scheduled",t),
          money(getPassengerPrice(p)),
          index === 0 ? money(sharedTotal) : "",
          index === 0 ? company : "",
          index === 0 ? entryName : "",
          index === 0 ? entryPhone : "",
          index === 0 ? bookedDate : "",
          index === 0 ? bookedTime : "",
          index === 0 ? note : ""
        ]);

      });

      return;
    }

    const total =
      getTripPrice(t);

    rows.push([
      t?.tripNumber || "",
      t?.clientName || "",
      t?.clientPhone || "",
      t?.pickup || "",
      exportStopText(t?.stops),
      t?.dropoff || "",
      t?.tripDate || "",
      t?.tripTime || "",
      getIndividualMiles(t).toFixed(1),
      displayStatus(t?.status,t),
      money(total),
      money(total),
      company,
      entryName,
      entryPhone,
      bookedDate,
      bookedTime,
      note
    ]);

  });

  return rows;

}

function csvEscape(value){

  return `"${String(value ?? "").replace(/"/g,'""')}"`;

}

function exportSummaryCSV(){

  const rows =
    getExportRows();

  const content =
    "\uFEFF" +
    rows
      .map(row =>
        row.map(csvEscape).join(",")
      )
      .join("\r\n");

  downloadBlob(
    content,
    "text/csv;charset=utf-8",
    exportFileName("csv")
  );

}

function exportSummaryExcel(){

  const rows =
    getExportRows();

  const body =
    rows.map((row,rowIndex)=>{

      const tag =
        rowIndex === 0
        ? "th"
        : "td";

      return `
        <tr>
          ${row.map(cell =>
            `<${tag}>${safeText(cell)}</${tag}>`
          ).join("")}
        </tr>
      `;

    }).join("");

  const file = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        table{
          border-collapse:collapse;
          font-family:Arial,sans-serif;
        }
        th,td{
          border:1px solid #999;
          padding:6px;
          vertical-align:middle;
          text-align:center;
          white-space:normal;
        }
        th{
          background:#dbe4f0;
          font-weight:bold;
        }
      </style>
    </head>
    <body>
      <table>
        ${body}
      </table>
    </body>
    </html>
  `;

  downloadBlob(
    "\uFEFF" + file,
    "application/vnd.ms-excel;charset=utf-8",
    exportFileName("xls")
  );

}

/* =========================
EVENTS
========================= */

let searchRenderTimer = null;

document.addEventListener("input",e=>{

  if(e.target.id === "searchInput"){

    if(searchRenderTimer){
      clearTimeout(searchRenderTimer);
    }

    searchRenderTimer =
      setTimeout(()=>{
        render();
      },180);

  }

});

document.addEventListener("change",e=>{

  if(
    e.target.id === "yearFilter" ||
    e.target.id === "monthFilter"
  ){
    render();
  }

});

/* =========================
AUTO REFRESH
========================= */

function startAutoRefresh(){

  if(autoRefreshTimer){
    clearInterval(autoRefreshTimer);
  }

  autoRefreshTimer =
    setInterval(async ()=>{

      const oldTab =
        currentTab;

      /*
        Trips stay live every 30 seconds.
        Services refresh only every 5 minutes, so Summary can pick up
        newly-created services without adding a service request every cycle.
      */
      await loadTrips();

      if(
        !lastServicesRefreshAt ||
        Date.now() - lastServicesRefreshAt >= 5 * 60 * 1000
      ){
        await loadServices();
      }

      currentTab =
        oldTab;

      buildFilters();
      buildTabs();
      render();

    },30000);

}

/*
  If Service Management was changed in another tab/window,
  refresh services immediately when the user returns to Summary.
*/
document.addEventListener("visibilitychange",async ()=>{

  if(document.visibilityState !== "visible"){
    return;
  }

  const oldTab =
    currentTab;

  await Promise.all([
    loadServices(),
    loadTrips()
  ]);

  currentTab =
    oldTab;

  buildFilters();
  buildTabs();
  render();

});


/* =========================
INIT
========================= */

load().then(()=>{
  startAutoRefresh();
});