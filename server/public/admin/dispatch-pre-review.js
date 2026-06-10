/* =========================================
DISPATCH REVIEW - CLEAN BUILD
ADD TRIP -> REVIEW -> CREATE RV -> TRIPS HUB
COMPANY SERVICES / SERVER PRICING ONLY
========================================= */

(function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
  return;
}

/* ================= CONFIG ================= */

const REVIEW_KEYS = [
  "dispatchReviewTrips",
  "dispatchPendingTrips",
  "pendingTrips",
  "dispatchDraftTrip"
];

let pendingTrips = [];
let COMPANY_SERVICES = [];
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";
let SYSTEM_TIMEZONE = "America/Phoenix";
let googleLoadPromise = null;
let calculatedMap = new Map();

/* ================= DOM ================= */

function $id(id){
  return document.getElementById(id);
}

const addPage = () => $id("dispatchAddPage");
const reviewPage = () => $id("dispatchReviewPage");
const container = () => $id("dispatchTripsContainer");

/* ================= BASIC HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return String(v || "").replace(/\s+/g,"").toLowerCase().trim();
}

function escapeHtml(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function money(v){
  return Number(v || 0).toFixed(2);
}

function getNow(){
  return new Date(
    new Date().toLocaleString("en-US",{
      timeZone:SYSTEM_TIMEZONE || "America/Phoenix"
    })
  );
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

function parseDateTime(date,time){
  if(!date || !time) return null;

  const d = String(date).split("-");
  if(d.length < 3) return null;

  let t = String(time).trim();

  if(/^\d{1,2}:\d{2}$/.test(t)){
    const [h,m] = t.split(":");
    const dt = new Date(+d[0], +d[1]-1, +d[2], +h, +m, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(ampm){
    let h = +ampm[1];
    const m = +ampm[2];
    const ap = ampm[3].toUpperCase();

    if(ap === "PM" && h < 12) h += 12;
    if(ap === "AM" && h === 12) h = 0;

    const dt = new Date(+d[0], +d[1]-1, +d[2], h, m, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

/* ================= DATA LOAD ================= */

async function loadSystemDesign(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json();

    SYSTEM_REGION = data?.region || "";
    SYSTEM_COUNTRY = data?.country || "";
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";
  }catch(e){
    console.warn(e);
  }
}

async function loadCompanyServices(){
  const res = await fetch("/api/services?company=true",{
    headers:{Authorization:"Bearer " + token}
  });

  if(!res.ok){
    COMPANY_SERVICES = [];
    return;
  }

  const data = await res.json();
  COMPANY_SERVICES = Array.isArray(data) ? data : [];
}

function loadPendingTrips(){
  let found = [];

  for(const key of REVIEW_KEYS){
    const raw = localStorage.getItem(key);
    if(!raw) continue;

    try{
      const parsed = JSON.parse(raw);

      if(Array.isArray(parsed)){
        found = parsed;
        break;
      }

      if(parsed && typeof parsed === "object"){
        found = [parsed];
        break;
      }
    }catch(e){}
  }

  if(!found.length && Array.isArray(window.pendingTrips)){
    found = window.pendingTrips;
  }

  pendingTrips = found.map((t,i)=>normalizeTrip(t,i));
  window.pendingTrips = pendingTrips;
  savePendingTrips();
}

function savePendingTrips(){
  localStorage.setItem("dispatchReviewTrips",JSON.stringify(pendingTrips));
}

/* ================= TRIP NORMALIZER ================= */

function normalizeTrip(t,index){
  const tripType = String(t.tripType || t.type || "").toUpperCase();

  const isShared =
    t.isShared === true ||
    tripType === "SHARED" ||
    Array.isArray(t.passengers);

  if(isShared){
    const passengers = Array.isArray(t.passengers) ? t.passengers : [];

    return {
      ...t,
      localId:t.localId || "LOCAL-SH-" + Date.now() + "-" + index,
      isShared:true,
      tripType:"SHARED",
      serviceKey:t.serviceKey || t.serviceType || "SHARED",
      status:t.status || "Review",
      passengers:passengers.map((p,pi)=>({
        passengerId:p.passengerId || "P" + (pi + 1),
        name:p.name || p.clientName || "",
        phone:p.phone || p.clientPhone || "",
        clientName:p.clientName || p.name || "",
        clientPhone:p.clientPhone || p.phone || "",
        pickup:p.pickup || "",
        dropoff:p.dropoff || "",
        status:p.status || "Scheduled"
      }))
    };
  }

  return {
    ...t,
    localId:t.localId || "LOCAL-IN-" + Date.now() + "-" + index,
    isShared:false,
    tripType:t.tripType || "INDIVIDUAL",
    serviceKey:t.serviceKey || t.serviceType || t.serviceCode || t.vehicle || "",
    status:t.status || "Review",
    stops:Array.isArray(t.stops) ? t.stops : []
  };
}

/* ================= SERVICE HELPERS ================= */

function isSharedService(s){
  if(!s) return false;

  return (
    s.companyShared === true ||
    s.shared === true ||
    String(s.type || "").toUpperCase() === "SHARED" ||
    String(s.serviceType || "").toUpperCase() === "SHARED" ||
    String(s.serviceKey || "").toUpperCase() === "SHARED" ||
    String(s.title || s.name || "").toUpperCase() === "SHARED" ||
    String(s.companySuffix || s.suffix || "").toUpperCase() === "SH"
  );
}

function getServiceCode(trip){
  return normalizeText(
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.vehicle ||
    trip.service ||
    ""
  ).toUpperCase();
}

function getServiceByTrip(trip){
  if(!trip) return null;

  if(trip.isShared === true || String(trip.tripType || "").toUpperCase() === "SHARED"){
    return COMPANY_SERVICES.find(isSharedService) || null;
  }

  const code = getServiceCode(trip);

  return COMPANY_SERVICES.find(s=>{
    const values = [
      s.serviceKey,
      s.companySuffix,
      s.suffix,
      s.serviceCode,
      s.code,
      s.title,
      s.name
    ].map(x=>normalizeText(x).toUpperCase());

    return values.includes(code);
  }) || null;
}

/* ================= GOOGLE ROUTE ================= */

async function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.DirectionsService) return;

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async(resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json();

      if(!data.googleKey){
        reject(new Error("Google key missing"));
        return;
      }

      const old = document.querySelector("script[data-google-maps='true']");
      if(old){
        old.addEventListener("load",resolve);
        old.addEventListener("error",()=>reject(new Error("Google failed")));
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;
      script.defer = true;
      script.setAttribute("data-google-maps","true");
      script.onload = resolve;
      script.onerror = ()=>reject(new Error("Google failed"));
      document.head.appendChild(script);

    }catch(e){
      reject(e);
    }
  });

  return googleLoadPromise;
}

async function calculateRouteMiles(points){
  await ensureGoogleLoaded();

  const cleanPoints = points.map(normalizeAddress).filter(Boolean);

  if(cleanPoints.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{},
      routePoints:cleanPoints
    };
  }

  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const waypoints = cleanPoints.slice(1,-1).map(x=>({
    location:x,
    stopover:true
  }));

  return new Promise((resolve,reject)=>{
    const service = new google.maps.DirectionsService();

    service.route({
      origin,
      destination,
      waypoints,
      optimizeWaypoints:false,
      travelMode:google.maps.TravelMode.DRIVING,
      unitSystem:google.maps.UnitSystem.IMPERIAL
    },(response,status)=>{
      if(status !== "OK" || !response?.routes?.[0]){
        reject(new Error("Google route failed: " + status));
        return;
      }

      const route = response.routes[0];
      let meters = 0;
      let seconds = 0;

      route.legs.forEach(leg=>{
        meters += leg.distance?.value || 0;
        seconds += leg.duration?.value || 0;
      });

      resolve({
        miles:Number((meters * 0.000621371).toFixed(2)),
        distanceMeters:meters,
        durationSeconds:seconds,
        estimatedMinutes:Math.ceil(seconds / 60),
        routePoints:cleanPoints,
        googleRoute:{
          summary:route.summary || "",
          waypointOrder:route.waypoint_order || [],
          legs:route.legs.map((leg,i)=>({
            legIndex:i,
            startAddress:leg.start_address,
            endAddress:leg.end_address,
            distanceText:leg.distance?.text || "",
            distanceMeters:leg.distance?.value || 0,
            durationText:leg.duration?.text || "",
            durationSeconds:leg.duration?.value || 0
          }))
        }
      });
    });
  });
}

/* ================= ROUTE POINTS ================= */

function buildIndividualRoutePoints(trip){
  const points = [];

  if(trip.pickup) points.push(trip.pickup);

  if(Array.isArray(trip.stops)){
    trip.stops.forEach(s=>{
      if(normalizeText(s)) points.push(s);
    });
  }

  if(trip.dropoff) points.push(trip.dropoff);

  return points;
}

function buildSharedRoutePoints(trip){
  const passengers = Array.isArray(trip.passengers) ? trip.passengers : [];

  const route = [];

  passengers.forEach(p=>{
    if(p.pickup) route.push(p.pickup);
  });

  passengers.forEach(p=>{
    if(p.dropoff) route.push(p.dropoff);
  });

  return route;
}

/* ================= SERVER PRICING ================= */

async function calculateServerPrice({serviceKey,miles,stops,minutes,passengerCount}){
  const res = await fetch("/api/company-core/calculate",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify({
      serviceKey,
      miles:Number(miles || 0),
      stops:Number(stops || 0),
      minutes:Number(minutes || 0),
      passengerCount:Number(passengerCount || 1),
      passengersCount:Number(passengerCount || 1),
      isCompany:true
    })
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Pricing failed");
  }

  return Number(data.total || data.price || data.finalPrice || 0);
}

/* ================= CALCULATE ONE TRIP ================= */

async function calculateTrip(trip){
  const service = getServiceByTrip(trip);

  if(!service){
    throw new Error("Company service not found: " + (trip.serviceKey || trip.serviceType || "UNKNOWN"));
  }

  let routePoints = [];
  let stops = 0;
  let passengerCount = 1;
  let serviceKey = service.serviceKey || trip.serviceKey || trip.serviceType || "STANDARD";

  if(trip.isShared){
    routePoints = buildSharedRoutePoints(trip);
    passengerCount = Math.max(1, trip.passengers?.length || 1);
    stops = Math.max(0, passengerCount - 1);
    serviceKey = "SHARED";
  }else{
    routePoints = buildIndividualRoutePoints(trip);
    stops = Array.isArray(trip.stops) ? trip.stops.filter(Boolean).length : 0;
  }

  const routeData = await calculateRouteMiles(routePoints);

  const total = await calculateServerPrice({
    serviceKey,
    miles:routeData.miles,
    stops,
    minutes:routeData.estimatedMinutes,
    passengerCount
  });

  const pricePerPassenger = trip.isShared
    ? Number((total / passengerCount).toFixed(2))
    : total;

  const result = {
    service,
    serviceKey,
    routeData,
    total,
    pricePerPassenger,
    stops,
    passengerCount
  };

  calculatedMap.set(trip.localId,result);
  return result;
}

/* ================= RENDER ================= */

function showAddPage(){
  if(addPage()) addPage().style.display = "block";
  if(reviewPage()) reviewPage().style.display = "none";
}

async function showReviewPage(){
  loadPendingTrips();

  if(addPage()) addPage().style.display = "none";
  if(reviewPage()) reviewPage().style.display = "block";

  await renderDispatchReview();
}

function renderLoading(){
  if(!container()) return;
  container().innerHTML = `
    <div class="empty-review">
      Calculating route, miles and company pricing...
    </div>
  `;
}

async function renderDispatchReview(){
  if(!container()) return;

  renderLoading();

  if(!pendingTrips.length){
    container().innerHTML = `
      <div class="empty-review">
        No trips in Dispatch Review.
      </div>
    `;
    return;
  }

  let rows = "";

  for(let i=0;i<pendingTrips.length;i++){
    const trip = pendingTrips[i];

    try{
      const calc = await calculateTrip(trip);
      rows += buildRow(trip,calc,i);
    }catch(e){
      console.error(e);
      rows += buildErrorRow(trip,e,i);
    }
  }

  container().innerHTML = `
    <div class="table-wrap">
      <table class="review-table">
        <tr>
          <th>#</th>
          <th>Type</th>
          <th>Service</th>
          <th>Entry</th>
          <th>Entry Phone</th>
          <th>Client / Passengers</th>
          <th>Phone</th>
          <th>Pickup</th>
          <th>Stops</th>
          <th>Dropoff</th>
          <th>Date</th>
          <th>Time</th>
          <th>Miles</th>
          <th>Minutes</th>
          <th>Price</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
        ${rows}
      </table>
    </div>
  `;
}

function buildRow(trip,calc,i){
  const serviceName =
    calc.service?.name ||
    calc.service?.title ||
    trip.serviceType ||
    trip.serviceKey ||
    "--";

  let client = "";
  let phone = "";
  let pickup = "";
  let dropoff = "";

  if(trip.isShared){
    client = trip.passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.name || p.clientName || "")}`).join("\n");
    phone = trip.passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.phone || p.clientPhone || "")}`).join("\n");
    pickup = trip.passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.pickup || "")}`).join("\n");
    dropoff = trip.passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.dropoff || "")}`).join("\n");
  }else{
    client = escapeHtml(trip.clientName || "");
    phone = escapeHtml(trip.clientPhone || "");
    pickup = escapeHtml(trip.pickup || "");
    dropoff = escapeHtml(trip.dropoff || "");
  }

  return `
    <tr class="scheduled-row" data-local-id="${escapeHtml(trip.localId)}">
      <td>${i+1}</td>
      <td><strong>${trip.isShared ? "SHARED" : "TRIP"}</strong></td>
      <td>${escapeHtml(serviceName)}</td>
      <td>${escapeHtml(trip.entryName || "")}</td>
      <td>${escapeHtml(trip.entryPhone || "")}</td>
      <td><div class="multi-line">${client}</div></td>
      <td><div class="multi-line">${phone}</div></td>
      <td><div class="multi-line">${pickup}</div></td>
      <td><strong>${calc.stops}</strong></td>
      <td><div class="multi-line">${dropoff}</div></td>
      <td>${escapeHtml(trip.tripDate || trip.sharedDate || "")}</td>
      <td>${escapeHtml(trip.tripTime || trip.sharedTime || "")}</td>
      <td><strong>${Number(calc.routeData.miles || 0).toFixed(2)} mi</strong></td>
      <td><strong>${calc.routeData.estimatedMinutes || 0}</strong></td>
      <td><span class="price-badge">$${money(calc.total)}</span></td>
      <td><strong>Ready RV</strong></td>
      <td>
        <div class="actions-wrap">
          <button class="btn delete" data-action="remove-review" type="button">Remove</button>
        </div>
      </td>
    </tr>
  `;
}

function buildErrorRow(trip,e,i){
  return `
    <tr class="cancelled-row" data-local-id="${escapeHtml(trip.localId)}">
      <td>${i+1}</td>
      <td>${trip.isShared ? "SHARED" : "TRIP"}</td>
      <td colspan="13"><strong>${escapeHtml(e.message || "Calculation Error")}</strong></td>
      <td>Error</td>
      <td>
        <button class="btn delete" data-action="remove-review" type="button">Remove</button>
      </td>
    </tr>
  `;
}

/* ================= CREATE TRIPS ================= */

function buildCreatePayload(trip,calc){
  const base = {
    ...trip,

    status:"RV",
    reservationStatus:"RV",
    dispatchSelected:false,
    driverAssigned:false,

    priceAmount:calc.total,
    finalPrice:calc.total,

    miles:calc.routeData.miles,
    distanceMeters:calc.routeData.distanceMeters,
    durationSeconds:calc.routeData.durationSeconds,
    estimatedMinutes:calc.routeData.estimatedMinutes,

    routePoints:calc.routeData.routePoints,
    googleRoute:calc.routeData.googleRoute,
    optimizedRoute:calc.routeData.googleRoute,

    serviceId:calc.service?._id || "",
    serviceName:calc.service?.name || calc.service?.title || "",
    serviceCode:calc.service?.serviceKey || calc.service?.companySuffix || calc.service?.suffix || "",
    serviceKey:calc.serviceKey,

    createdFrom:"DISPATCH_ADD_REVIEW"
  };

  delete base.localId;

  if(trip.isShared){
    base.isShared = true;
    base.tripType = "SHARED";
    base.totalPassengers = calc.passengerCount;
    base.pricePerPassenger = calc.pricePerPassenger;
    base.sharedStopsCount = calc.stops;

    base.passengers = trip.passengers.map(p=>({
      ...p,
      status:"RV",
      priceAmount:calc.pricePerPassenger,
      finalPrice:calc.pricePerPassenger
    }));
  }

  return base;
}

async function createTrip(payload){
  const res = await fetch("/api/trips",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Create trip failed");
  }

  return data;
}

async function submitAllToHub(){
  if(!pendingTrips.length){
    alert("No trips to submit.");
    return;
  }

  const ok = confirm("Submit all reviewed trips to Trips Hub as RV?");
  if(!ok) return;

  const btn = $id("submitAllToHubBtn");
  if(btn){
    btn.disabled = true;
    btn.textContent = "Submitting...";
  }

  try{
    for(const trip of pendingTrips){
      let calc = calculatedMap.get(trip.localId);
      if(!calc){
        calc = await calculateTrip(trip);
      }

      const payload = buildCreatePayload(trip,calc);
      await createTrip(payload);
    }

    pendingTrips = [];
    calculatedMap.clear();

    REVIEW_KEYS.forEach(k=>localStorage.removeItem(k));
    localStorage.removeItem("dispatchReviewTrips");
    window.pendingTrips = [];

    window.location.href = "/admin/trips-hub.html";

  }catch(e){
    console.error(e);
    alert(e.message || "Submit failed");

    if(btn){
      btn.disabled = false;
      btn.textContent = "Submit All To Trips Hub";
    }
  }
}

/* ================= EVENTS ================= */

document.addEventListener("click",async e=>{
  const btn = e.target.closest("button");
  if(!btn) return;

  if(btn.id === "backToHubBtn"){
    window.location.href = "/admin/trips-hub.html";
  }

  if(btn.id === "showAddBtn" || btn.id === "reviewBackToAddBtn"){
    showAddPage();
  }

  if(btn.id === "showReviewBtn"){
    await showReviewPage();
  }

  if(btn.id === "submitAllToHubBtn"){
    await submitAllToHub();
  }

  if(btn.dataset.action === "remove-review"){
    const tr = btn.closest("tr");
    const id = tr?.dataset.localId;
    pendingTrips = pendingTrips.filter(t=>t.localId !== id);
    savePendingTrips();
    await renderDispatchReview();
  }
});

/* ================= EXPORT ================= */

window.DispatchReview = {
  showAddPage,
  showReviewPage,
  renderDispatchReview,
  submitAllToHub,
  loadPendingTrips,
  savePendingTrips,
  calculateTrip,
  calculateRouteMiles,
  calculateServerPrice,
  getServiceByTrip,
  get pendingTrips(){ return pendingTrips; },
  set pendingTrips(v){
    pendingTrips = Array.isArray(v) ? v.map(normalizeTrip) : [];
    savePendingTrips();
  }
};

window.showAddPage = showAddPage;
window.showReviewPage = showReviewPage;

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded",async()=>{
  await loadSystemDesign();
  await loadCompanyServices();
  loadPendingTrips();

  const submitBtn = $id("submitAllToHubBtn");
  if(submitBtn){
    submitBtn.onclick = submitAllToHub;
  }

  const backBtn = $id("reviewBackToAddBtn");
  if(backBtn){
    backBtn.onclick = showAddPage;
  }

  const reviewBtn = $id("showReviewBtn");
  if(reviewBtn){
    reviewBtn.onclick = showReviewPage;
  }

  const addBtn = $id("showAddBtn");
  if(addBtn){
    addBtn.onclick = showAddPage;
  }

  const hubBtn = $id("backToHubBtn");
  if(hubBtn){
    hubBtn.onclick = ()=>{
      window.location.href = "/admin/trips-hub.html";
    };
  }
});

})();