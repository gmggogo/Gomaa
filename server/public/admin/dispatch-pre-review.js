/* =========================================
DISPATCH PRE REVIEW - CLEAN BUILD
ADD TRIP -> REVIEW -> CREATE RV -> TRIPS HUB
========================================= */

(function(){

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
  return;
}

const API_URL = "/api/trips";
const REVIEW_KEY = "dispatchReviewTrips";

let pendingTrips = [];
let SERVICES = [];
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";
let SYSTEM_TIMEZONE = "America/Phoenix";
let googleLoadPromise = null;
let calcMap = new Map();

function $(id){ return document.getElementById(id); }

const addPage = () => $("dispatchAddPage");
const reviewPage = () => $("dispatchReviewPage");
const box = () => $("dispatchTripsContainer");

function clean(v){ return String(v ?? "").trim(); }

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function money(v){ return Number(v || 0).toFixed(2); }

function now(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:SYSTEM_TIMEZONE}));
}

function parseDT(date,time){
  if(!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return isNaN(d) ? null : d;
}

function normalizeAddress(v){
  let a = clean(v);
  if(!a) return "";

  const low = a.toLowerCase();

  if(SYSTEM_REGION && !low.includes(SYSTEM_REGION.toLowerCase())){
    a += ", " + SYSTEM_REGION;
  }

  if(SYSTEM_COUNTRY && !low.includes(SYSTEM_COUNTRY.toLowerCase())){
    a += ", " + SYSTEM_COUNTRY;
  }

  return a;
}

/* ================= LOAD ================= */

async function loadSystemDesign(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json();
    SYSTEM_REGION = data?.region || "";
    SYSTEM_COUNTRY = data?.country || "";
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";
  }catch(e){ console.log(e); }
}

async function loadServices(){
  try{
    const res = await fetch("/api/services?company=true",{
      headers:{Authorization:"Bearer " + token}
    });
    const data = await res.json();
    SERVICES = Array.isArray(data) ? data : [];
  }catch(e){
    SERVICES = [];
  }
}

function loadPending(){
  try{
    const raw = localStorage.getItem(REVIEW_KEY);
    pendingTrips = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(pendingTrips)) pendingTrips = [];
  }catch(e){
    pendingTrips = [];
  }

  pendingTrips = pendingTrips.map((t,i)=>normalizeTrip(t,i));
  savePending();
}

function savePending(){
  localStorage.setItem(REVIEW_KEY,JSON.stringify(pendingTrips));
  window.pendingTrips = pendingTrips;
}

function normalizeTrip(t,i){
  const isShared =
    t.isShared === true ||
    String(t.tripType || "").toUpperCase() === "SHARED" ||
    Array.isArray(t.passengers);

  if(isShared){
    return {
      ...t,
      localId:t.localId || `SH-${Date.now()}-${i}`,
      isShared:true,
      tripType:"SHARED",
      serviceKey:t.serviceKey || t.serviceType || "SHARED",
      tripDate:t.tripDate || t.sharedDate || "",
      tripTime:t.tripTime || t.sharedTime || "",
      status:"Review",
      passengers:(t.passengers || []).map((p,idx)=>({
        passengerId:p.passengerId || "P" + (idx + 1),
        clientName:p.clientName || p.name || "",
        clientPhone:p.clientPhone || p.phone || "",
        pickup:p.pickup || "",
        dropoff:p.dropoff || "",
        status:"Review"
      }))
    };
  }

  return {
    ...t,
    localId:t.localId || `IN-${Date.now()}-${i}`,
    isShared:false,
    tripType:"INDIVIDUAL",
    serviceKey:t.serviceKey || t.serviceType || "",
    status:"Review",
    stops:Array.isArray(t.stops) ? t.stops : []
  };
}

/* ================= SERVICE ================= */

function code(v){ return clean(v).toUpperCase(); }

function isSharedService(s){
  return (
    s?.companyShared === true ||
    s?.shared === true ||
    code(s?.serviceKey) === "SHARED" ||
    code(s?.serviceKey) === "SH" ||
    code(s?.companySuffix) === "SH" ||
    code(s?.suffix) === "SH" ||
    code(s?.title) === "SHARED" ||
    code(s?.name) === "SHARED"
  );
}

function tripServiceCode(t){
  return code(
    t.serviceKey ||
    t.serviceCode ||
    t.serviceType ||
    t.serviceSuffix ||
    t.service ||
    ""
  );
}

function getService(t){

  if(t.isShared){
    return SERVICES.find(isSharedService) || SERVICES[0] || null;
  }

  const c = tripServiceCode(t);

  let service = SERVICES.find(s=>{
    const arr = [
      s.serviceKey,
      s.companySuffix,
      s.suffix,
      s.serviceCode,
      s.code,
      s.title,
      s.name,
      s.type,
      s.serviceType
    ].map(code);

    return arr.includes(c);
  });

  if(service) return service;

  service = SERVICES.find(s=>{
    const title = code(s.title || s.name || "");
    return title && c && (title.includes(c) || c.includes(title));
  });

  if(service) return service;

  return SERVICES.find(s=>!isSharedService(s)) || SERVICES[0] || null;
}

function serviceName(t){
  const s = getService(t);
  return s?.title || s?.name || t.serviceTitle || t.serviceType || t.serviceKey || "-";
}

function warningMinutes(t){
  const s = getService(t);
  return Number(s?.companyWarningMinutes || s?.warningMinutes || 120);
}

/* ================= TIME POLICY ================= */

function minutesLeft(t){
  const dt = parseDT(t.tripDate,t.tripTime);
  if(!dt) return -999999;
  return Math.floor((dt.getTime() - now().getTime()) / 60000);
}

function rowClass(t){
  const m = minutesLeft(t);

  if(m <= 0) return "past-row";
  if(m <= 30) return "red-dark";
  if(m <= 60) return "red-mid";
  if(m <= warningMinutes(t)) return "red-light";
  return "yellow";
}

function actionButtons(t){
  const m = minutesLeft(t);
  const w = warningMinutes(t);

  if(m <= 0){
    return `<strong style="color:#64748b;">Past</strong>`;
  }

  if(m <= w){
    return `
      <button class="btn cancel" data-action="cancel" type="button">Cancel</button>
      <button class="btn confirm" data-action="confirm" type="button">Confirm</button>
    `;
  }

  return `
    <button class="btn edit" data-action="edit" type="button">Edit</button>
    <button class="btn delete" data-action="delete" type="button">Delete</button>
    <button class="btn confirm" data-action="confirm" type="button">Confirm</button>
  `;
}

/* ================= GOOGLE ================= */

async function ensureGoogle(){
  if(window.google && google.maps && google.maps.DirectionsService) return;

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async(resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json();

      if(!data.googleKey) return reject(new Error("Google key missing"));

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = ()=>reject(new Error("Google failed"));
      document.head.appendChild(script);
    }catch(e){
      reject(e);
    }
  });

  return googleLoadPromise;
}

async function routeMiles(points){
  await ensureGoogle();

  const cleanPoints = points.map(normalizeAddress).filter(Boolean);

  if(cleanPoints.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      routePoints:cleanPoints,
      googleRoute:{}
    };
  }

  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const waypoints = cleanPoints.slice(1,-1).map(x=>({location:x,stopover:true}));

  return new Promise((resolve,reject)=>{
    const ds = new google.maps.DirectionsService();

    ds.route({
      origin,
      destination,
      waypoints,
      optimizeWaypoints:false,
      travelMode:google.maps.TravelMode.DRIVING,
      unitSystem:google.maps.UnitSystem.IMPERIAL
    },(res,status)=>{
      if(status !== "OK" || !res?.routes?.[0]){
        reject(new Error("Google route failed: " + status));
        return;
      }

      const route = res.routes[0];
      let meters = 0;
      let seconds = 0;

      route.legs.forEach(l=>{
        meters += l.distance?.value || 0;
        seconds += l.duration?.value || 0;
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
          legs:route.legs.map((l,i)=>({
            legIndex:i,
            startAddress:l.start_address,
            endAddress:l.end_address,
            distanceText:l.distance?.text || "",
            distanceMeters:l.distance?.value || 0,
            durationText:l.duration?.text || "",
            durationSeconds:l.duration?.value || 0
          }))
        }
      });
    });
  });
}

function routePoints(t){
  if(t.isShared){
    const arr = [];
    (t.passengers || []).forEach(p=>{ if(p.pickup) arr.push(p.pickup); });
    (t.passengers || []).forEach(p=>{ if(p.dropoff) arr.push(p.dropoff); });
    return arr;
  }

  const arr = [];
  if(t.pickup) arr.push(t.pickup);
  (t.stops || []).forEach(s=>{ if(clean(s)) arr.push(s); });
  if(t.dropoff) arr.push(t.dropoff);
  return arr;
}

/* ================= PRICE ================= */

async function serverPrice({serviceKey,miles,stops,minutes,passengerCount}){
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

async function calculateTrip(t){
  if(calcMap.has(t.localId)) return calcMap.get(t.localId);

  const s = getService(t);
  if(!s) throw new Error("Service not found");

  const points = routePoints(t);
  const route = await routeMiles(points);

  const passengerCount = t.isShared ? Math.max(1,(t.passengers || []).length) : 1;
  const stops = t.isShared ? Math.max(0,passengerCount - 1) : (t.stops || []).filter(Boolean).length;

  const serviceKey = t.isShared ? "SHARED" : (s.serviceKey || t.serviceKey || t.serviceType || "STANDARD");

  const total = await serverPrice({
    serviceKey,
    miles:route.miles,
    stops,
    minutes:route.estimatedMinutes,
    passengerCount
  });

  const calc = {
    service:s,
    serviceKey,
    route,
    total,
    pricePerPassenger:t.isShared ? Number((total / passengerCount).toFixed(2)) : total,
    stops,
    passengerCount
  };

  calcMap.set(t.localId,calc);
  return calc;
}

/* ================= RENDER ================= */

function showAddPage(){
  if(addPage()) addPage().style.display = "block";
  if(reviewPage()) reviewPage().style.display = "none";
}

async function showReviewPage(){
  loadPending();

  if(addPage()) addPage().style.display = "none";
  if(reviewPage()) reviewPage().style.display = "block";

  await render();
}

function loading(){
  if(box()){
    box().innerHTML = `<div class="empty-review">Calculating trips...</div>`;
  }
}

async function render(){
  if(!box()) return;

  loading();

  if(!pendingTrips.length){
    box().innerHTML = `<div class="empty-review">No trips in Dispatch Review.</div>`;
    return;
  }

  let rows = "";

  for(let i=0;i<pendingTrips.length;i++){
    try{
      const t = pendingTrips[i];
      const calc = await calculateTrip(t);
      rows += buildRow(t,calc,i);
    }catch(e){
      rows += buildErrorRow(pendingTrips[i],e,i);
    }
  }

  box().innerHTML = `
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

function buildRow(t,calc,i){
  let names = "";
  let phones = "";
  let pickups = "";
  let dropoffs = "";

  if(t.isShared){
    names = (t.passengers || []).map((p,x)=>`${x+1}. ${esc(p.clientName || p.name || "")}`).join("\n");
    phones = (t.passengers || []).map((p,x)=>`${x+1}. ${esc(p.clientPhone || p.phone || "")}`).join("\n");
    pickups = (t.passengers || []).map((p,x)=>`${x+1}. ${esc(p.pickup || "")}`).join("\n");
    dropoffs = (t.passengers || []).map((p,x)=>`${x+1}. ${esc(p.dropoff || "")}`).join("\n");
  }else{
    names = esc(t.clientName || "");
    phones = esc(t.clientPhone || "");
    pickups = esc(t.pickup || "");
    dropoffs = esc(t.dropoff || "");
  }

  return `
    <tr class="${rowClass(t)}" data-local-id="${esc(t.localId)}">
      <td>${i+1}</td>
      <td><strong>${t.isShared ? "SHARED" : "TRIP"}</strong></td>
      <td>${esc(serviceName(t))}</td>
      <td>${esc(t.entryName || "")}</td>
      <td>${esc(t.entryPhone || "")}</td>
      <td><div class="multi-line">${names}</div></td>
      <td><div class="multi-line">${phones}</div></td>
      <td><div class="multi-line">${pickups}</div></td>
      <td><strong>${calc.stops}</strong></td>
      <td><div class="multi-line">${dropoffs}</div></td>
      <td>${esc(t.tripDate || "")}</td>
      <td>${esc(t.tripTime || "")}</td>
      <td><strong>${Number(calc.route.miles || 0).toFixed(2)} mi</strong></td>
      <td><strong>${calc.route.estimatedMinutes || 0}</strong></td>
      <td><span class="price-badge">$${money(calc.total)}</span></td>
      <td><strong>Review</strong></td>
      <td><div class="actions-wrap">${actionButtons(t)}</div></td>
    </tr>
  `;
}

function buildErrorRow(t,e,i){
  return `
    <tr class="cancelled-row" data-local-id="${esc(t.localId)}">
      <td>${i+1}</td>
      <td>${t.isShared ? "SHARED" : "TRIP"}</td>
      <td colspan="13"><strong>${esc(e.message || "Calculation Error")}</strong></td>
      <td>Error</td>
      <td>
        <button class="btn delete" data-action="delete" type="button">Delete</button>
      </td>
    </tr>
  `;
}

/* ================= CREATE RV ================= */

function createPayload(t,calc){

  const payload = {
    ...t,

    status:"RV",
    reservationStatus:"RV",

    dispatchSelected:false,
    driverAssigned:false,

    priceAmount:calc.total,
    finalPrice:calc.total,

    miles:calc.route.miles,
    distanceMeters:calc.route.distanceMeters,
    durationSeconds:calc.route.durationSeconds,
    estimatedMinutes:calc.route.estimatedMinutes,

    routePoints:calc.route.routePoints,
    googleRoute:calc.route.googleRoute,
    optimizedRoute:calc.route.googleRoute,

    serviceId:calc.service?._id || "",
    serviceName:calc.service?.name || calc.service?.title || "",
    serviceCode:
      calc.service?.serviceKey ||
      calc.service?.companySuffix ||
      calc.service?.suffix ||
      "",

    serviceKey:calc.serviceKey,

    createdFrom:"DISPATCH_REVIEW"
  };

  delete payload.localId;
  delete payload.reviewOnly;

  if(t.isShared){

    payload.isShared = true;
    payload.tripType = "SHARED";

    payload.totalPassengers = calc.passengerCount;
    payload.passengersCount = calc.passengerCount;

    payload.pricePerPassenger = calc.pricePerPassenger;
    payload.sharedStopsCount = calc.stops;

    payload.passengers = (t.passengers || []).map(p => ({
      ...p,
      status:"RV",
      priceAmount:calc.pricePerPassenger,
      finalPrice:calc.pricePerPassenger
    }));

  }

  return payload;
}

async function postTrip(payload){

  const res = await fetch(API_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){

    console.log("SERVER ERROR =>",data);

    throw new Error(
      data.message ||
      data.error ||
      JSON.stringify(data)
    );
  }

  return data;
}

function removeLocal(id){

  pendingTrips =
    pendingTrips.filter(t => t.localId !== id);

  calcMap.delete(id);

  savePending();
}

async function getLatLng(address){

  await ensureGoogle();

  return new Promise((resolve,reject)=>{

    const geocoder = new google.maps.Geocoder();

    geocoder.geocode(
      { address: normalizeAddress(address) },
      (results,status)=>{

        if(status !== "OK" || !results || !results.length){
          reject(new Error("Geocode failed"));
          return;
        }

        const loc = results[0].geometry.location;

        resolve({
          lat: loc.lat(),
          lng: loc.lng()
        });

      }
    );

  });

}

async function confirmOne(id){

  try{

    const t =
      pendingTrips.find(x => x.localId === id);

    if(!t) return;

    if(!confirm("Confirm and create RV reservation?"))
      return;

    const calc =
  await calculateTrip(t);

const pickupGeo =
  await getLatLng(t.pickup);

const dropoffGeo =
  await getLatLng(t.dropoff);

const payload =
  createPayload(t,calc);

payload.pickupLat = pickupGeo.lat;
payload.pickupLng = pickupGeo.lng;

payload.dropoffLat = dropoffGeo.lat;
payload.dropoffLng = dropoffGeo.lng;

const result =
  await postTrip(payload);

    console.log("RESULT =>",result);

    removeLocal(id);

    await render();

    alert("RV Created Successfully");

  }catch(err){

    console.error(err);

    alert(
      err.message ||
      "Create RV Failed"
    );

  }
}
async function confirmAll(){
  if(!pendingTrips.length){
    alert("No trips to submit.");
    return;
  }

  if(!confirm("Submit all reviewed trips to Trips Hub as RV?")) return;

  const btn = $("submitAllToHubBtn");
  if(btn){
    btn.disabled = true;
    btn.textContent = "Submitting...";
  }

  try{
    for(const t of [...pendingTrips]){
      const calc = await calculateTrip(t);
      const payload = createPayload(t,calc);
      await postTrip(payload);
      removeLocal(t.localId);
    }

    localStorage.removeItem(REVIEW_KEY);
    window.location.href = "/admin/trips-hub.html";

  }catch(e){
    alert(e.message || "Submit failed");
    if(btn){
      btn.disabled = false;
      btn.textContent = "Submit All To Trips Hub";
    }
  }
}

/* ================= EDIT / DELETE / CANCEL ================= */

function deleteOne(id){
  if(!confirm("Delete this trip from review?")) return;
  removeLocal(id);
  render();
}

function cancelOne(id){
  if(!confirm("Cancel this reviewed reservation?")) return;
  removeLocal(id);
  render();
}

function editOne(id){
  const t = pendingTrips.find(x=>x.localId === id);
  if(!t) return;

  if(t.isShared){
    localStorage.setItem("dispatchSharedDraft",JSON.stringify({
      passengerCount:(t.passengers || []).length,
      sharedDate:t.tripDate,
      sharedTime:t.tripTime,
      sharedNotes:t.notes || "",
      passengers:(t.passengers || []).map(p=>({
        clientName:p.clientName || p.name || "",
        clientPhone:p.clientPhone || p.phone || "",
        pickup:p.pickup || "",
        dropoff:p.dropoff || ""
      }))
    }));
  }else{
    localStorage.setItem("dispatchTripDraft",JSON.stringify({
      clientName:t.clientName || "",
      clientPhone:t.clientPhone || "",
      pickup:t.pickup || "",
      dropoff:t.dropoff || "",
      tripDate:t.tripDate || "",
      tripTime:t.tripTime || "",
      notes:t.notes || "",
      stops:t.stops || []
    }));
  }

window.currentEditTrip = t;
window.currentEditTripId = id;

showAddPage();

}

/* ================= EVENTS ================= */

document.addEventListener("click",async e=>{
  const btn = e.target.closest("button");
  if(!btn) return;

  if(btn.id === "backToHubBtn"){
    window.location.href = "/admin/trips-hub.html";
    return;
  }

  if(btn.id === "showAddBtn" || btn.id === "reviewBackToAddBtn"){
    showAddPage();
    return;
  }

  if(btn.id === "showReviewBtn"){
    await showReviewPage();
    return;
  }

  if(btn.id === "submitAllToHubBtn"){
    await confirmAll();
    return;
  }

  const tr = btn.closest("tr");
  const id = tr?.dataset.localId;
  if(!id) return;

  if(btn.dataset.action === "edit") editOne(id);
  if(btn.dataset.action === "delete") deleteOne(id);
  if(btn.dataset.action === "cancel") cancelOne(id);
  if(btn.dataset.action === "confirm") await confirmOne(id);
});

/* ================= EXPORT ================= */

window.DispatchReview = {
  showAddPage,
  showReviewPage,
  render,
  confirmAll,
  loadPending,
  savePending,
  get pendingTrips(){ return pendingTrips; }
};

window.showAddPage = showAddPage;
window.showReviewPage = showReviewPage;

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded",async()=>{
  await loadSystemDesign();
  await loadServices();
  loadPending();

  if($("submitAllToHubBtn")) $("submitAllToHubBtn").onclick = confirmAll;
  if($("reviewBackToAddBtn")) $("reviewBackToAddBtn").onclick = showAddPage;
  if($("showReviewBtn")) $("showReviewBtn").onclick = showReviewPage;
  if($("showAddBtn")) $("showAddBtn").onclick = showAddPage;
  if($("backToHubBtn")) $("backToHubBtn").onclick = ()=>window.location.href="/admin/trips-hub.html";
});

})();