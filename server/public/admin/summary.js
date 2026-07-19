/* ==========================================================================
   ADMIN SUMMARY V4
   Admin / SuperAdmin / Dispatcher
   Facility / Get Quote / Reserved
   Closed Trips Financial Summary
   Print + CSV + Excel Export
   Show ONLY trips finalized after Dispatch Review / Final Confirmation
   ========================================================================== */

const API_URL = "/api/admin-summary";
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
const sourceFilter = document.getElementById("sourceFilter");
const facilityFilter = document.getElementById("facilityFilter");
const serviceFilter = document.getElementById("serviceFilter");
const statusFilter = document.getElementById("statusFilter");
const yearFilter = document.getElementById("yearFilter");
const monthFilter = document.getElementById("monthFilter");
const dayFilter = document.getElementById("dayFilter");
const summaryContent = document.getElementById("summaryContent");

const printBtn = document.getElementById("printBtn");
const csvBtn = document.getElementById("csvBtn");
const excelBtn = document.getElementById("excelBtn");

/* ===============================
   BASIC HELPERS
================================ */

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function clean(v){
  return String(v ?? "").trim();
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v){
  return "$" + num(v).toFixed(2);
}

function normalizeStatus(v){
  return String(v || "")
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .toLowerCase()
    .trim();
}

function compactStatus(v){
  return normalizeStatus(v).replace(/\s+/g,"");
}

function cellBox(items){
  const arr = Array.isArray(items) ? items : [items];

  return `
    <div class="cell-box">
      ${arr.map(v=>`
        <div class="cell-item">${safe(v || "--")}</div>
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

function getBookedDateObj(t){
  return new Date(
    t?.bookedAt ||
    t?.createdAt ||
    t?.updatedAt ||
    t?.bookingDate ||
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
  if(t?.bookingDate) return t.bookingDate;
  return formatDateObj(getBookedDateObj(t));
}

function getBookedTime(t){
  if(t?.bookingTime) return t.bookingTime;
  return formatTimeObj(getBookedDateObj(t));
}

function getTripNumber(t){
  return String(t?.tripNumber || t?.bookingNumber || t?.id || "-");
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

function getNotes(t){
  return t?.notes ?? t?.tripNotes ?? t?.note ?? "";
}

/* ===============================
   DISPATCH REVIEW / FINAL CONFIRMATION GATE
================================ */

function hasDispatchReviewFinalMarker(trip){

  if(!trip){
    return false;
  }

  if(
    trip.dispatchReviewConfirmed === true ||
    trip.dispatchReviewConfirmedAt ||
    trip.dispatchReviewFinalized === true ||
    trip.dispatchReviewFinalizedAt ||
    trip.dispatchFinalConfirmed === true ||
    trip.dispatchFinalConfirmedAt ||
    trip.finalStatusConfirmed === true ||
    trip.finalStatusConfirmedAt ||
    trip.sharedFinalConfirmed === true ||
    trip.sharedFinalConfirmedAt ||
    trip.adminSummaryReady === true ||
    trip.summaryReady === true ||
    trip.billingReady === true
  ){
    return true;
  }

  const passengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  return passengers.some(p =>
    p.dispatchReviewConfirmed === true ||
    p.dispatchReviewConfirmedAt ||
    p.dispatchFinalConfirmed === true ||
    p.dispatchFinalConfirmedAt ||
    p.finalStatusConfirmed === true ||
    p.finalStatusConfirmedAt ||
    p.finalStatusConfirmedBy ||
    p.adminSummaryReady === true ||
    p.summaryReady === true ||
    p.billingReady === true
  );
}

function groupHasDispatchReviewFinalMarker(group){

  const arr =
    Array.isArray(group)
      ? group
      : [];

  if(arr.some(t => hasDispatchReviewFinalMarker(t))){
    return true;
  }

  const first = arr[0] || {};
  const passengers = getRealPassengersFromGroup(arr);

  return passengers.some(p =>
    p.dispatchReviewConfirmed === true ||
    p.dispatchReviewConfirmedAt ||
    p.dispatchFinalConfirmed === true ||
    p.dispatchFinalConfirmedAt ||
    p.finalStatusConfirmed === true ||
    p.finalStatusConfirmedAt ||
    p.finalStatusConfirmedBy ||
    p.adminSummaryReady === true ||
    p.summaryReady === true ||
    p.billingReady === true ||
    first.dispatchReviewConfirmed === true ||
    first.dispatchReviewConfirmedAt ||
    first.dispatchFinalConfirmed === true ||
    first.dispatchFinalConfirmedAt ||
    first.finalStatusConfirmed === true ||
    first.finalStatusConfirmedAt
  );
}

/* ===============================
   STATUS ENGINE
================================ */

function isCompletedStatus(status){
  const s = normalizeStatus(status);
  return s === "completed" || s === "complete";
}

function isCancelledStatus(status){
  return normalizeStatus(status).includes("cancel");
}

function isNoShowStatus(status){
  const s = normalizeStatus(status);
  return s.includes("no show") || s.includes("noshow");
}

function isScheduledStatus(status){
  return normalizeStatus(status) === "scheduled";
}

function isConfirmedStatus(status){
  return normalizeStatus(status) === "confirmed";
}

function isNotCompletedStatus(status,trip){

  const s = normalizeStatus(status);
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

  const label =
    status === "Mixed Closed"
      ? "Mixed Closed"
      : displayStatus(status,trip);

  if(label === "Completed") return "completed";
  if(label === "Cancelled") return "cancelled";
  if(label === "No Show") return "noshow";
  if(label === "Not Completed") return "notcompleted";
  if(label === "Mixed Closed") return "mixed";

  return "";
}

function statusHTML(status,trip){

  if(status === "Mixed Closed"){
    return `<span class="status-pill mixed">Mixed Closed</span>`;
  }

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
  return (
    s.enabled === true ||
    s.companyEnabled === true ||
    s.reservedEnabled === true
  );
}

function normalizeKnownCode(code){

  const c = clean(code).toUpperCase();

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

function hasSharedService(){
  return services.some(s => getServiceCodeFromService(s) === "SH");
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

  const direct = clean(
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

  const num = clean(t?.tripNumber).toUpperCase();

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

function getServiceByTrip(t){
  const code = getServiceCodeFromTrip(t);
  return services.find(s => getServiceCodeFromService(s) === code) || null;
}

function tripMatchesService(t,code){
  if(code === "ALL") return true;
  return getServiceCodeFromTrip(t) === code;
}

/* ===============================
   SOURCE ENGINE
================================ */

function getFacilityName(t){
  return clean(
    t?.facilityName ||
    t?.organizationName ||
    t?.customerCompany ||
    t?.companyName ||
    t?.company ||
    ""
  );
}

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

function getFacilityOnly(t){
  if(getSourceCode(t) !== "FACILITY"){
    return "--";
  }

  return getFacilityName(t) || "--";
}

function sourceLabel(t){
  const code = getSourceCode(t);

  if(code === "RV") return "Reserved";
  if(code === "FACILITY") return "Facility";

  return "Get Quote";
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

/* ===============================
   PASSENGERS / SHARED
================================ */

function isSharedTrip(t){
  return (
    t?.isShared === true ||
    String(t?.tripType || "").toUpperCase() === "SHARED" ||
    String(t?.type || "").toLowerCase() === "shared" ||
    clean(t?.tripNumber).toUpperCase().includes("-SH") ||
    (Array.isArray(t?.passengers) && t.passengers.length > 0)
  );
}

function getSharedKey(t){
  return (
    clean(t?.groupId) ||
    clean(t?.sharedGroupId) ||
    clean(t?.tripNumber) ||
    String(t?._id || t?.id)
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

function getPassengerEmail(p,t){
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

function getPickup(t,p){
  return p?.pickup || p?.pickupAddress || t?.pickup || "-";
}

function getDropoff(t,p){
  return p?.dropoff || p?.dropoffAddress || t?.dropoff || "-";
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
    status:t.status || "Scheduled",
    finalPrice:t.finalPrice,
    priceAmount:t.priceAmount,
    price:t.price,
    cancelFee:t.cancelFee,
    noShowFee:t.noShowFee
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

function getClosedPassengers(group){
  const first = group[0] || {};
  return getRealPassengersFromGroup(group).filter(p =>
    isClosedStatus(p.status || first.status,first)
  );
}

function hasClosedPassenger(group){
  return getClosedPassengers(group).length > 0;
}

function getGroupStatus(group){

  const first = group[0] || {};
  const closed = getClosedPassengers(group);

  if(!closed.length){
    return first.status || "Scheduled";
  }

  const statuses =
    closed.map(p =>
      displayStatus(p.status || first.status,first)
    );

  if(statuses.includes("Completed")){
    return "Completed";
  }

  if(statuses.every(s => s === "Cancelled")){
    return "Cancelled";
  }

  if(statuses.every(s => s === "No Show")){
    return "No Show";
  }

  if(statuses.every(s => s === "Not Completed")){
    return "Not Completed";
  }

  return "Mixed Closed";
}

/* ===============================
   MONEY / MILES ENGINE
================================ */

function feeFromService(t,type){

  const s = getServiceByTrip(t) || {};
  const ps = t?.pricingSnapshot || t?.priceSnapshot || {};

  if(type === "cancel"){
    return num(
      t?.cancelFee ??
      t?.companyCancelFee ??
      ps?.cancelFee ??
      ps?.companyCancelFee ??
      s?.companyCancelFee ??
      s?.cancelFee ??
      0
    );
  }

  if(type === "noshow"){
    return num(
      t?.noShowFee ??
      t?.companyNoShowFee ??
      ps?.noShowFee ??
      ps?.companyNoShowFee ??
      s?.companyNoShowFee ??
      s?.noShowFee ??
      0
    );
  }

  return 0;
}

function getTripBasePrice(t){

  return num(
    t?.finalPrice ??
    t?.priceAmount ??
    t?.totalPrice ??
    t?.price ??
    t?.pricingSnapshot?.finalPrice ??
    t?.pricingSnapshot?.priceAmount ??
    t?.priceSnapshot?.finalPrice ??
    t?.priceSnapshot?.priceAmount ??
    0
  );
}

function getPassengerBasePrice(p,t){

  return num(
    p?.finalPrice ??
    p?.priceAmount ??
    p?.totalPrice ??
    p?.price ??
    p?.pricingSnapshot?.finalPrice ??
    p?.pricingSnapshot?.priceAmount ??
    0
  );
}

function getPassengerFee(p,t){

  const status =
    p?.status ||
    t?.status ||
    "";

  if(isCancelledStatus(status)){
    return num(
      p?.cancelFee ??
      p?.companyCancelFee ??
      feeFromService(t,"cancel") ??
      0
    );
  }

  if(isNoShowStatus(status)){
    return num(
      p?.noShowFee ??
      p?.companyNoShowFee ??
      feeFromService(t,"noshow") ??
      0
    );
  }

  return 0;
}

function getPassengerMoney(p,t){

  const status = p?.status || t?.status;

  if(isNotCompletedStatus(status,t)){
    return 0;
  }

  if(isCancelledStatus(status) || isNoShowStatus(status)){
    return getPassengerFee(p,t);
  }

  if(isCompletedStatus(status)){
    return getPassengerBasePrice(p,t);
  }

  return 0;
}

function getTripMoney(t){

  if(isNotCompletedStatus(t?.status,t)){
    return 0;
  }

  if(isCancelledStatus(t?.status)){
    return feeFromService(t,"cancel");
  }

  if(isNoShowStatus(t?.status)){
    return feeFromService(t,"noshow");
  }

  if(isCompletedStatus(t?.status)){
    return getTripBasePrice(t);
  }

  return 0;
}

function getTripMiles(t){

  if(!isCompletedStatus(t?.status)){
    return 0;
  }

  return num(
    t?.miles ??
    t?.distanceMiles ??
    t?.totalMiles ??
    t?.pricingSnapshot?.miles ??
    t?.priceSnapshot?.miles ??
    0
  );
}

function getSharedMoney(group){

  const first = group[0] || {};
  const passengers = getClosedPassengers(group);

  return passengers.reduce((sum,p)=>{
    return sum + getPassengerMoney(p,first);
  },0);
}

function getSharedMiles(group){

  const first = group[0] || {};
  const passengers = getClosedPassengers(group);

  const hasCompleted =
    passengers.some(p =>
      isCompletedStatus(p.status || first.status)
    );

  if(!hasCompleted){
    return 0;
  }

  return num(
    first?.miles ??
    first?.distanceMiles ??
    first?.totalMiles ??
    first?.pricingSnapshot?.miles ??
    first?.priceSnapshot?.miles ??
    0
  );
}

function getItemMoney(item){
  if(item.kind === "shared"){
    return getSharedMoney(item.group);
  }

  return getTripMoney(item.trip);
}

function getItemMiles(item){
  if(item.kind === "shared"){
    return getSharedMiles(item.group);
  }

  return getTripMiles(item.trip);
}

function passengerStatusLine(p,t,index){
  return `${index + 1}. ${displayStatus(p.status || t.status,t)}`;
}

function passengerFeeLine(p,t,index){
  return `${index + 1}. ${money(getPassengerFee(p,t))}`;
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

  const r = normalizeStatus(
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
  return clean(
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

    facilities =
      [...new Set(
        users
          .filter(isFacilityUser)
          .map(getFacilityNameFromUser)
          .filter(Boolean)
      )].sort((a,b)=>a.localeCompare(b));

  }catch(err){
    facilities = [];
  }
}

function buildFacilityFallbackFromTrips(){

  const names =
    allTrips
      .filter(t => getSourceCode(t) === "FACILITY")
      .map(getFacilityName)
      .filter(Boolean);

  facilities =
    [...new Set([...facilities,...names])]
    .sort((a,b)=>a.localeCompare(b));
}

function renderFacilityFilter(){

  if(!facilityFilter) return;

  facilityFilter.innerHTML =
    `<option value="ALL">All Facilities</option>`;

  facilities.forEach(name=>{
    facilityFilter.innerHTML += `
      <option value="${safe(name)}">${safe(name)}</option>
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

    const list =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.trips)
          ? data.trips
          : Array.isArray(data?.data)
            ? data.data
            : [];

    allTrips =
      list.sort((a,b)=>
        getBookedDateObj(b) - getBookedDateObj(a)
      );

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

  }catch(err){
    console.log(err);
    allTrips = [];
  }
}

/* ===============================
   FILTER BUILDERS
================================ */

function buildDateFilters(){

  if(!yearFilter || !monthFilter || !dayFilter) return;

  const oldYear = yearFilter.value || "";
  const oldMonth = monthFilter.value || "";
  const oldDay = dayFilter.value || "";

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
        <option value="${safe(y)}">${safe(y)}</option>
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

  dayFilter.innerHTML =
    `<option value="">All Days</option>`;

  for(let i=1;i<=31;i++){
    const d = String(i).padStart(2,"0");
    dayFilter.innerHTML += `
      <option value="${d}">${d}</option>
    `;
  }

  yearFilter.value = oldYear;
  monthFilter.value = oldMonth;
  dayFilter.value = oldDay;
}

function renderServiceFilter(){

  if(!serviceFilter) return;

  serviceFilter.innerHTML =
    `<option value="ALL">All Services</option>`;

  services.forEach(s=>{
    const code = getServiceCodeFromService(s);
    serviceFilter.innerHTML += `
      <option value="${safe(code)}">${safe(getServiceTitle(s))}</option>
    `;
  });

  serviceFilter.value = activeService;
}

/* ===============================
   DISPLAY ITEMS
================================ */

function isClosedTrip(t){

  if(!t) return false;

  if(isSharedTrip(t)){

    const group =
      getSharedGroups(allTrips)
        .find(g => getSharedKey(g[0]) === getSharedKey(t)) ||
      [t];

    if(!groupHasDispatchReviewFinalMarker(group)){
      return false;
    }

    return hasClosedPassenger(group);
  }

  if(!hasDispatchReviewFinalMarker(t)){
    return false;
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

      if(!groupHasDispatchReviewFinalMarker(group)){
        return;
      }

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
    sourceLabel(first),
    getServiceTitleByTrip(first),
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
    stopsDisplay(first),
    first.tripDate,
    first.tripTime,
    first.status,
    getNotes(first),
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
  const d = dayFilter?.value || "";

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

  if(d){
    out = out.filter(item =>
      String(item.tripDate || "").split("-")[2] === d
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
   STATS
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
    mixed:0,

    revenue:0,
    miles:0,

    facility:0,
    gq:0,
    reserved:0,

    facilityRevenue:0,
    gqRevenue:0,
    reservedRevenue:0,

    shared:0,
    sharedPassengers:0,
    individual:0
  };
}

function countStatus(stats,status,trip){

  const label =
    status === "Mixed Closed"
      ? "Mixed Closed"
      : displayStatus(status,trip);

  if(label === "Completed") stats.completed++;
  else if(label === "Cancelled") stats.cancelled++;
  else if(label === "No Show") stats.noshow++;
  else if(label === "Not Completed") stats.notCompleted++;
  else if(label === "Mixed Closed") stats.mixed++;
}

function countItem(stats,item){

  const first =
    item.kind === "trip"
      ? item.trip
      : item.group[0];

  const azNow = getAZNow();
  const today = dateKey(azNow);
  const month = monthKey(azNow);

  const itemRevenue = getItemMoney(item);
  const itemMiles = getItemMiles(item);

  stats.total++;

  if(first.tripDate === today) stats.today++;
  if(String(first.tripDate || "").slice(0,7) === month) stats.month++;

  stats.revenue += itemRevenue;
  stats.miles += itemMiles;

  const src = getSourceCode(first);

  if(src === "RV"){
    stats.reserved++;
    stats.reservedRevenue += itemRevenue;
  }else if(src === "FACILITY"){
    stats.facility++;
    stats.facilityRevenue += itemRevenue;
  }else{
    stats.gq++;
    stats.gqRevenue += itemRevenue;
  }

  if(item.kind === "shared"){

    stats.shared++;
    stats.sharedPassengers += getClosedPassengers(item.group).length;

    const gStatus = getGroupStatus(item.group);

    countStatus(stats,gStatus,first);

    return;
  }

  stats.individual++;
  countStatus(stats,first.status,first);
}

function countItemsByService(code){

  const baseItems = buildDisplayItems(allTrips);

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

  const wrap = document.getElementById("summaryStats");
  if(!wrap) return;

  wrap.classList.toggle("no-shared", !hasSharedService());

  const sharedCards =
    hasSharedService()
      ? `
        <div class="stat-card shared">
          <div class="stat-number">${stats.shared}</div>
          <div class="stat-label">Shared Trips</div>
        </div>

        <div class="stat-card shared">
          <div class="stat-number">${stats.sharedPassengers}</div>
          <div class="stat-label">Shared Passengers</div>
        </div>

        <div class="stat-card total">
          <div class="stat-number">${stats.individual}</div>
          <div class="stat-label">Individual Trips</div>
        </div>
      `
      : "";

  wrap.innerHTML = `
    <div class="stat-card total">
      <div class="stat-number">${stats.total}</div>
      <div class="stat-label">Total Closed</div>
    </div>

    <div class="stat-card completed">
      <div class="stat-number">${stats.completed}</div>
      <div class="stat-label">Completed</div>
    </div>

    <div class="stat-card cancelled">
      <div class="stat-number">${stats.cancelled}</div>
      <div class="stat-label">Cancelled</div>
    </div>

    <div class="stat-card noshow">
      <div class="stat-number">${stats.noshow}</div>
      <div class="stat-label">No Show</div>
    </div>

    <div class="stat-card notcompleted">
      <div class="stat-number">${stats.notCompleted}</div>
      <div class="stat-label">Not Completed</div>
    </div>

    <div class="stat-card money big-card">
      <div class="stat-number">${money(stats.revenue)}</div>
      <div class="stat-label">Total Revenue</div>
    </div>

    <div class="stat-card miles">
      <div class="stat-number">${stats.miles.toFixed(1)}</div>
      <div class="stat-label">Total Miles</div>
    </div>

    <div class="stat-card facility big-card">
      <div class="stat-number">${money(stats.facilityRevenue)}</div>
      <div class="stat-label">Facility Revenue</div>
    </div>

    <div class="stat-card gq big-card">
      <div class="stat-number">${money(stats.gqRevenue)}</div>
      <div class="stat-label">Get Quote Revenue</div>
    </div>

    <div class="stat-card reserved big-card">
      <div class="stat-number">${money(stats.reservedRevenue)}</div>
      <div class="stat-label">Reserved Revenue</div>
    </div>

    ${sharedCards}
  `;
}

/* ===============================
   SERVICE CARDS RESPONSIVE LAYOUT
================================ */

function updateServiceCardsLayout(){

  const wrap = document.getElementById("serviceCards");
  if(!wrap) return;

  const count = wrap.querySelectorAll(".service-card").length || 1;

  const desktopCols =
    count >= 6
      ? 6
      : count;

  const tabletCols =
    count >= 4
      ? 4
      : count >= 2
        ? count
        : 1;

  const mobileCols =
    count >= 2
      ? 2
      : 1;

  wrap.style.setProperty("--service-cols", desktopCols);
  wrap.style.setProperty("--service-cols-tablet", tabletCols);
  wrap.style.setProperty("--service-cols-mobile", mobileCols);
}

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
        <div class="service-line"><span>Total</span><span>${c.total}</span></div>
        <div class="service-line"><span>Revenue</span><span>${money(c.revenue)}</span></div>
        <div class="service-line"><span>Miles</span><span>${c.miles.toFixed(1)}</span></div>
        <div class="service-line"><span>Facility</span><span>${money(c.facilityRevenue)}</span></div>
        <div class="service-line"><span>Get Quote</span><span>${money(c.gqRevenue)}</span></div>
        <div class="service-line"><span>Reserved</span><span>${money(c.reservedRevenue)}</span></div>
        <div class="service-line"><span>Completed</span><span>${c.completed}</span></div>
        <div class="service-line"><span>No Show</span><span>${c.noshow}</span></div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll(".service-card").forEach(card=>{
    card.onclick = ()=>{
      activeService = card.dataset.service || "ALL";
      if(serviceFilter) serviceFilter.value = activeService;
      applyFilters();
    };
  });

  updateServiceCardsLayout();
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

function passengerBreakdownText(item){

  if(item.kind !== "shared"){

    const t = item.trip;

    return [
      `Name: ${t.clientName || t.name || "-"}`,
      `Phone: ${t.clientPhone || t.phone || "-"}`,
      `Email: ${t.clientEmail || t.email || "-"}`,
      `Status: ${displayStatus(t.status,t)}`,
      `Fees: ${money(getPassengerFee(t,t))}`,
      `Total: ${money(getTripMoney(t))}`
    ].join("\n");
  }

  const first = item.group[0] || {};
  const passengers = getClosedPassengers(item.group);

  return passengers.map((p,i)=>[
    `${i+1}. ${getPassengerName(p,first)}`,
    `Phone: ${getPassengerPhone(p,first)}`,
    `Email: ${getPassengerEmail(p,first)}`,
    `Pickup: ${getPickup(first,p)}`,
    `Dropoff: ${getDropoff(first,p)}`,
    `Status: ${displayStatus(p.status || first.status,first)}`,
    `Fees: ${money(getPassengerFee(p,first))}`,
    `Total: ${money(getPassengerMoney(p,first))}`
  ].join("\n")).join("\n\n");
}

function moneyBreakdownText(item){

  if(item.kind !== "shared"){

    const t = item.trip;

    return [
      `Trip Status: ${displayStatus(t.status,t)}`,
      `Miles Driven: ${getTripMiles(t).toFixed(1)}`,
      `Fees: ${money(getPassengerFee(t,t))}`,
      `Total: ${money(getTripMoney(t))}`
    ].join("\n");
  }

  const first = item.group[0] || {};
  const passengers = getClosedPassengers(item.group);

  const lines = passengers.map((p,i)=>{
    return `${i+1}. ${getPassengerName(p,first)} | ${displayStatus(p.status || first.status,first)} | Fees ${money(getPassengerFee(p,first))} | Total ${money(getPassengerMoney(p,first))}`;
  });

  lines.push("");
  lines.push(`Shared Miles: ${getSharedMiles(item.group).toFixed(1)}`);
  lines.push(`Shared Total: ${money(getSharedMoney(item.group))}`);

  return lines.join("\n");
}

function openSummaryView(key){

  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  const t = item.kind === "trip" ? item.trip : item.group[0];

  closeSummaryView();

  const overlay = document.createElement("div");
  overlay.id = "summaryViewOverlay";
  overlay.className = "view-overlay";

  overlay.innerHTML = `
    <div class="view-box">
      <div class="view-head">
        <div>Summary Details</div>
        <button class="view-close" type="button" onclick="closeSummaryView()">×</button>
      </div>

      <div class="view-body">
        ${viewLine("Trip Number",getTripNumber(t))}
        ${viewLine("Source",sourceLabel(t))}
        ${viewLine("Service",getServiceTitleByTrip(t))}
        ${viewLine("Facility",getFacilityOnly(t))}
        ${viewLine("Entry Name",t.entryName || "")}
        ${viewLine("Entry Phone",t.entryPhone || "")}
        ${viewLine("Client Phone",t.clientPhone || t.phone || "")}
        ${viewLine("Client Email",t.clientEmail || t.email || t.entryEmail || "")}
        ${viewLine("Passengers",passengerBreakdownText(item))}
        ${viewLine("Pickup",t.pickup || "")}
        ${viewLine("Stops",stopsDisplay(t))}
        ${viewLine("Dropoff",t.dropoff || "")}
        ${viewLine("Trip Date",t.tripDate || "")}
        ${viewLine("Trip Time",t.tripTime || "")}
        ${viewLine("Booked Date",getBookedDate(t))}
        ${viewLine("Booked Time",getBookedTime(t))}
        ${viewLine("Money Breakdown",moneyBreakdownText(item))}
        ${viewLine("Notes",getNotes(t))}
      </div>
    </div>
  `;

  overlay.addEventListener("click",e=>{
    if(e.target === overlay) closeSummaryView();
  });

  document.body.appendChild(overlay);
}

function closeSummaryView(){
  document.getElementById("summaryViewOverlay")?.remove();
}

/* ===============================
   TABLE
================================ */

function itemStatus(item){

  if(item.kind === "shared"){
    return getGroupStatus(item.group);
  }

  return displayStatus(item.trip.status,item.trip);
}

function rowClass(item){

  const first =
    item.kind === "trip"
      ? item.trip
      : item.group[0];

  const status = itemStatus(item);
  const cls = statusClass(status,first);
  const src = getSourceCode(first);

  let out = "";

  if(item.kind === "shared") out += "shared-row ";

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

let rowCounter = 1;

function render(){

  rowCounter = 1;

  renderStats();
  renderServiceCards();

  if(!summaryContent) return;

  summaryContent.innerHTML = "";

  if(!displayItems.length){
    summaryContent.innerHTML =
      `<div class="empty-state">No Summary Trips Found</div>`;
    return;
  }

  const groups = groupByTripDate(displayItems);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-trip">Trip #</th>
        <th class="col-source">Source</th>
        <th class="wide-company">Facility</th>
        <th class="col-service">Service</th>
        <th class="wide-passenger">Passenger</th>
        <th class="wide-address">Pickup</th>
        <th class="wide-stops">Stops</th>
        <th class="wide-address">Dropoff</th>
        <th class="col-date">Trip Date</th>
        <th class="col-time">Time</th>
        <th class="col-status">Trip Status</th>
        <th class="col-miles">Miles</th>
        <th class="wide-passenger-status">Passenger Status</th>
        <th class="wide-fees">Fees</th>
        <th class="col-money">Total</th>
        <th class="col-passengers">Count</th>
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
      dateRow.innerHTML = `<td colspan="18">Trip Date: ${safe(day)}</td>`;
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
  summaryContent.appendChild(wrap);
}

function renderTripRow(item){

  const t = item.trip;
  const tr = document.createElement("tr");

  tr.className = rowClass(item);

  const client =
    t.clientName ||
    t.name ||
    "--";

  const moneyValue = getTripMoney(t);
  const milesValue = getTripMiles(t);
  const feeValue = getPassengerFee(t,t);

  tr.innerHTML = `
    <td class="col-num">${rowCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(t))}</span>
    </td>

    <td class="col-source">
      ${sourceHTML(t)}
    </td>

    <td class="wide-company">
      ${cellBox(getFacilityOnly(t))}
    </td>

    <td class="col-service">
      ${cellBox(getServiceTitleByTrip(t))}
    </td>

    <td class="wide-passenger">
      ${cellBox(client)}
    </td>

    <td class="wide-address">
      ${cellBox(t.pickup || "--")}
    </td>

    <td class="wide-stops">
      ${cellBox(stopsDisplay(t))}
    </td>

    <td class="wide-address">
      ${cellBox(t.dropoff || "--")}
    </td>

    <td class="col-date">${safe(t.tripDate || "-")}</td>
    <td class="col-time">${safe(t.tripTime || "-")}</td>

    <td class="col-status">
      ${statusHTML(t.status,t)}
    </td>

    <td class="col-miles">
      ${milesValue.toFixed(1)}
    </td>

    <td class="wide-passenger-status">
      ${cellBox(displayStatus(t.status,t))}
    </td>

    <td class="wide-fees">
      ${cellBox(money(feeValue))}
    </td>

    <td class="col-money">
      <b>${money(moneyValue)}</b>
    </td>

    <td class="col-passengers">
      1
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openSummaryView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(item){

  const group = item.group;
  const first = group[0] || {};
  const passengers = getClosedPassengers(group);
  const groupStatus = getGroupStatus(group);

  const names = passengers.map((p,i)=>
    `${i+1}. ${getPassengerName(p,first)}`
  );

  const pickups = passengers.map((p,i)=>
    `${i+1}. ${getPickup(first,p)}`
  );

  const dropoffs = passengers.map((p,i)=>
    `${i+1}. ${getDropoff(first,p)}`
  );

  const passengerStatuses = passengers.map((p,i)=>
    passengerStatusLine(p,first,i)
  );

  const passengerFees = passengers.map((p,i)=>
    passengerFeeLine(p,first,i)
  );

  const sharedMoney = getSharedMoney(group);
  const sharedMiles = getSharedMiles(group);

  const tr = document.createElement("tr");
  tr.className = rowClass(item);

  tr.innerHTML = `
    <td class="col-num">${rowCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(first))}</span>
    </td>

    <td class="col-source">
      ${sourceHTML(first)}
    </td>

    <td class="wide-company">
      ${cellBox(getFacilityOnly(first))}
    </td>

    <td class="col-service">
      ${cellBox(getServiceTitleByTrip(first))}
    </td>

    <td class="wide-passenger">
      ${cellBox(names)}
    </td>

    <td class="wide-address">
      ${cellBox(pickups)}
    </td>

    <td class="wide-stops">
      ${cellBox(stopsDisplay(first))}
    </td>

    <td class="wide-address">
      ${cellBox(dropoffs)}
    </td>

    <td class="col-date">${safe(first.tripDate || "-")}</td>
    <td class="col-time">${safe(first.tripTime || "-")}</td>

    <td class="col-status">
      ${statusHTML(groupStatus,first)}
    </td>

    <td class="col-miles">
      ${sharedMiles.toFixed(1)}
    </td>

    <td class="wide-passenger-status">
      ${cellBox(passengerStatuses)}
    </td>

    <td class="wide-fees">
      ${cellBox(passengerFees)}
    </td>

    <td class="col-money">
      <b>${money(sharedMoney)}</b>
    </td>

    <td class="col-passengers">
      ${passengers.length}
    </td>

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openSummaryView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

/* ===============================
   EXPORT ENGINE
================================ */

function getExportRows(){

  const rows = [];

  displayItems.forEach(item=>{

    const first =
      item.kind === "trip"
        ? item.trip
        : item.group[0];

    if(item.kind === "trip"){

      const t = item.trip;

      rows.push({
        tripNumber:getTripNumber(t),
        source:sourceLabel(t),
        facility:getFacilityOnly(t) === "--" ? "" : getFacilityOnly(t),
        service:getServiceTitleByTrip(t),
        passenger:t.clientName || t.name || "",
        phone:t.clientPhone || t.phone || "",
        pickup:t.pickup || "",
        stops:stopsDisplay(t) === "--" ? "" : stopsDisplay(t),
        dropoff:t.dropoff || "",
        tripDate:t.tripDate || "",
        tripTime:t.tripTime || "",
        tripStatus:displayStatus(t.status,t),
        miles:getTripMiles(t).toFixed(1),
        passengerStatus:displayStatus(t.status,t),
        fees:money(getPassengerFee(t,t)),
        total:money(getTripMoney(t)),
        count:1,
        notes:getNotes(t)
      });

      return;
    }

    const passengers = getClosedPassengers(item.group);

    passengers.forEach((p,index)=>{

      rows.push({
        tripNumber:index === 0 ? getTripNumber(first) : "",
        source:index === 0 ? sourceLabel(first) : "",
        facility:index === 0
          ? (getFacilityOnly(first) === "--" ? "" : getFacilityOnly(first))
          : "",
        service:index === 0 ? getServiceTitleByTrip(first) : "",
        passenger:getPassengerName(p,first),
        phone:getPassengerPhone(p,first),
        pickup:getPickup(first,p),
        stops:index === 0
          ? (stopsDisplay(first) === "--" ? "" : stopsDisplay(first))
          : "",
        dropoff:getDropoff(first,p),
        tripDate:index === 0 ? first.tripDate || "" : "",
        tripTime:index === 0 ? first.tripTime || "" : "",
        tripStatus:index === 0 ? getGroupStatus(item.group) : "",
        miles:index === 0 ? getSharedMiles(item.group).toFixed(1) : "",
        passengerStatus:displayStatus(p.status || first.status,first),
        fees:money(getPassengerFee(p,first)),
        total:index === 0 ? money(getSharedMoney(item.group)) : "",
        count:index === 0 ? passengers.length : "",
        notes:index === 0 ? getNotes(first) : ""
      });

    });

  });

  return rows;
}

function downloadFile(filename,content,type){

  const blob =
    new Blob([content],{
      type
    });

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV(){

  const rows = getExportRows();

  const headers = [
    "Trip Number",
    "Source",
    "Facility",
    "Service",
    "Passenger",
    "Phone",
    "Pickup",
    "Stops",
    "Dropoff",
    "Trip Date",
    "Trip Time",
    "Trip Status",
    "Miles",
    "Passenger Status",
    "Fees",
    "Total",
    "Count",
    "Notes"
  ];

  const keys = [
    "tripNumber",
    "source",
    "facility",
    "service",
    "passenger",
    "phone",
    "pickup",
    "stops",
    "dropoff",
    "tripDate",
    "tripTime",
    "tripStatus",
    "miles",
    "passengerStatus",
    "fees",
    "total",
    "count",
    "notes"
  ];

  const csv = [
    headers.join(","),
    ...rows.map(row =>
      keys.map(k=>{
        const value =
          String(row[k] ?? "")
            .replace(/"/g,'""');

        return `"${value}"`;
      }).join(",")
    )
  ].join("\n");

  downloadFile(
    "admin-summary.csv",
    csv,
    "text/csv;charset=utf-8;"
  );
}

function exportExcel(){

  const rows = getExportRows();

  const headers = [
    "Trip Number",
    "Source",
    "Facility",
    "Service",
    "Passenger",
    "Phone",
    "Pickup",
    "Stops",
    "Dropoff",
    "Trip Date",
    "Trip Time",
    "Trip Status",
    "Miles",
    "Passenger Status",
    "Fees",
    "Total",
    "Count",
    "Notes"
  ];

  const keys = [
    "tripNumber",
    "source",
    "facility",
    "service",
    "passenger",
    "phone",
    "pickup",
    "stops",
    "dropoff",
    "tripDate",
    "tripTime",
    "tripStatus",
    "miles",
    "passengerStatus",
    "fees",
    "total",
    "count",
    "notes"
  ];

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              ${headers.map(h=>`<th>${safe(h)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row=>`
              <tr>
                ${keys.map(k=>`<td>${safe(row[k] ?? "")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  downloadFile(
    "admin-summary.xls",
    html,
    "application/vnd.ms-excel"
  );
}

/* ===============================
   EVENTS
================================ */

searchInput?.addEventListener("input",applyFilters);

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

serviceFilter?.addEventListener("change",()=>{
  activeService = serviceFilter.value || "ALL";
  applyFilters();
});

statusFilter?.addEventListener("change",applyFilters);
yearFilter?.addEventListener("change",applyFilters);
monthFilter?.addEventListener("change",applyFilters);
dayFilter?.addEventListener("change",applyFilters);

printBtn?.addEventListener("click",()=>{
  window.print();
});

csvBtn?.addEventListener("click",exportCSV);
excelBtn?.addEventListener("click",exportExcel);

Object.assign(window,{
  openSummaryView,
  closeSummaryView,
  exportCSV,
  exportExcel
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

  buildFacilityFallbackFromTrips();
  buildDateFilters();
  renderServiceFilter();
  renderFacilityFilter();

  applyFilters();
}

(async function init(){

  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);

  refreshTimer =
    setInterval(refreshEverything,30000);

})();