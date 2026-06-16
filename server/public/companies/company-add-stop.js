/* =========================================
FILE: company-add-stop.js
COMPANY ADD STOP
Route Timeline UI
Add Stop Here after Pickup / after every Existing Stop
Calculate miles only
Send clean payload to server
========================================= */

(function(){

/* ================= SECURITY ================= */

const token = localStorage.getItem("token") || "";
const role = localStorage.getItem("role") || "";
const companyName = localStorage.getItem("name") || "";

if(!token || role !== "company"){
  window.location.href = "/companies/company-login.html";
  return;
}

/* ================= CONFIG ================= */

const params = new URLSearchParams(window.location.search);
const tripId = params.get("tripId") || "";

const MAX_STOPS = 5;
const REVIEW_URL = "/companies/review.html";

const API_TRIP_BY_ID = id =>
  `/api/trips/${encodeURIComponent(id)}`;

const API_COMPANY_TRIPS = companyName
  ? `/api/trips/company/${encodeURIComponent(companyName)}`
  : "/api/trips/company";

const API_ADD_STOP_CONFIRM = id =>
  `/api/company/add-stop/${encodeURIComponent(id)}/confirm`;

const DRIVER_LOCATION_ENDPOINTS = id => [
  `/api/track-driver/trip/${encodeURIComponent(id)}`,
  `/api/driver-location/trip/${encodeURIComponent(id)}`,
  `/api/dispatch/track-driver/${encodeURIComponent(id)}`
];

/* ================= STATE ================= */

let currentTrip = null;
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";
let SYSTEM_TIMEZONE = "America/Phoenix";
let googleLoadPromise = null;
let stopCounter = 0;

/* ================= DOM ================= */

const loadingBox = document.getElementById("loadingBox");
const form = document.getElementById("addStopForm");
const alertBox = document.getElementById("alertBox");

const pageStatusBadge = document.getElementById("pageStatusBadge");

const tripNumberInput = document.getElementById("tripNumber");
const clientNameInput = document.getElementById("clientName");
const pickupAddressInput = document.getElementById("pickupAddress");
const dropoffAddressInput = document.getElementById("dropoffAddress");

const stopsContainer = document.getElementById("stopsContainer");
const addStopBtn = document.getElementById("addStopBtn");

const backBtn = document.getElementById("backBtn");
const confirmAddStopBtn = document.getElementById("confirmAddStopBtn");

/* ================= STYLE ================= */

(function injectAddStopStyle(){

  const old = document.getElementById("company-add-stop-dynamic-style");
  if(old) old.remove();

  const style = document.createElement("style");
  style.id = "company-add-stop-dynamic-style";

  style.innerHTML = `
    .old-add-stop-hidden{
      display:none!important;
    }

    .route-timeline{
      margin:20px 0;
      background:#f8fafc;
      border:1px solid #dbeafe;
      border-radius:18px;
      overflow:hidden;
      box-shadow:0 12px 28px rgba(15,23,42,.10);
    }

    .route-timeline-head{
      background:linear-gradient(135deg,#0f172a,#1d4ed8);
      color:#fff;
      padding:16px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
      font-weight:900;
    }

    .route-timeline-head .title{
      font-size:18px;
      letter-spacing:.2px;
    }

    .route-timeline-head .badge{
      background:#fff;
      color:#1d4ed8;
      padding:6px 12px;
      border-radius:999px;
      font-size:12px;
      font-weight:900;
    }

    .route-timeline-body{
      padding:16px;
      display:grid;
      gap:0;
      background:#fff;
    }

    .route-node{
      display:grid;
      grid-template-columns:52px 1fr;
      gap:12px;
      align-items:stretch;
    }

    .route-dot-wrap{
      display:flex;
      flex-direction:column;
      align-items:center;
    }

    .route-dot{
      width:38px;
      height:38px;
      border-radius:50%;
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:18px;
      font-weight:900;
      box-shadow:0 8px 18px rgba(15,23,42,.18);
      z-index:2;
    }

    .route-dot.pickup{
      background:#16a34a;
    }

    .route-dot.stop{
      background:#7c3aed;
    }

    .route-dot.dropoff{
      background:#dc2626;
    }

    .route-line{
      width:4px;
      flex:1;
      background:#cbd5e1;
      margin:4px 0;
      border-radius:999px;
      min-height:18px;
    }

    .route-card{
      background:#ffffff;
      border:1px solid #e2e8f0;
      border-radius:14px;
      margin-bottom:10px;
      overflow:hidden;
      box-shadow:0 6px 16px rgba(15,23,42,.06);
    }

    .route-card-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      padding:10px 12px;
      background:#f1f5f9;
      border-bottom:1px solid #e2e8f0;
      font-weight:900;
      color:#0f172a;
      font-size:13px;
    }

    .route-card-head span{
      padding:4px 8px;
      border-radius:999px;
      font-size:11px;
      color:#fff;
      font-weight:900;
    }

    .route-card-head .pickup{
      background:#16a34a;
    }

    .route-card-head .stop{
      background:#7c3aed;
    }

    .route-card-head .dropoff{
      background:#dc2626;
    }

    .route-address{
      padding:12px;
      font-size:13px;
      font-weight:800;
      line-height:1.45;
      color:#111827;
      word-break:break-word;
      background:#fff;
    }

    .insert-zone{
      display:grid;
      grid-template-columns:52px 1fr;
      gap:12px;
      align-items:stretch;
    }

    .insert-line-wrap{
      display:flex;
      flex-direction:column;
      align-items:center;
    }

    .insert-line{
      width:4px;
      flex:1;
      background:#cbd5e1;
      border-radius:999px;
      min-height:28px;
    }

    .insert-content{
      padding:2px 0 14px;
    }

    .add-here-btn{
      width:100%;
      border:2px dashed #2563eb;
      background:#eff6ff;
      color:#1d4ed8;
      padding:12px;
      border-radius:14px;
      font-size:13px;
      font-weight:900;
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      transition:.18s ease;
    }

    .add-here-btn:hover{
      background:#dbeafe;
      transform:translateY(-1px);
    }

    .add-here-btn span{
      width:24px;
      height:24px;
      border-radius:50%;
      background:#2563eb;
      color:#fff;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      font-size:18px;
      line-height:1;
      font-weight:900;
    }

    .slot-panel{
      margin-top:10px;
      border:2px solid #2563eb;
      border-radius:16px;
      background:#f8fafc;
      overflow:hidden;
      box-shadow:0 12px 26px rgba(37,99,235,.18);
    }

    .slot-panel-head{
      background:#2563eb;
      color:#fff;
      padding:12px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      font-weight:900;
    }

    .slot-panel-head button{
      border:none;
      background:#fff;
      color:#dc2626;
      width:30px;
      height:30px;
      border-radius:50%;
      font-size:18px;
      font-weight:900;
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .slot-panel-body{
      padding:12px;
      display:grid;
      gap:10px;
    }

    .slot-stop-row{
      display:grid;
      grid-template-columns:1fr 38px;
      gap:8px;
      align-items:center;
    }

    .slot-stop-input{
      width:100%;
      padding:12px;
      border:1px solid #cbd5e1;
      border-radius:12px;
      font-size:13px;
      font-weight:800;
      box-sizing:border-box;
      outline:none;
      background:#fff;
      color:#111827;
    }

    .slot-stop-input:focus{
      border:2px solid #2563eb;
      box-shadow:0 0 0 3px rgba(37,99,235,.12);
    }

    .remove-slot-stop{
      width:38px;
      height:38px;
      border:none;
      border-radius:12px;
      background:#fee2e2;
      color:#dc2626;
      font-size:20px;
      font-weight:900;
      cursor:pointer;
    }

    .slot-actions{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      justify-content:flex-end;
      border-top:1px solid #e2e8f0;
      padding-top:10px;
    }

    .slot-add-more{
      border:none;
      background:#0f172a;
      color:#fff;
      padding:11px 14px;
      border-radius:12px;
      font-weight:900;
      cursor:pointer;
    }

    .slot-confirm{
      border:none;
      background:#16a34a;
      color:#fff;
      padding:11px 16px;
      border-radius:12px;
      font-weight:900;
      cursor:pointer;
    }

    .slot-add-more:disabled,
    .slot-confirm:disabled{
      opacity:.6;
      cursor:not-allowed;
    }

    .slot-note{
      color:#475569;
      font-size:11px;
      font-weight:800;
      line-height:1.4;
    }

    @media(max-width:700px){
      .route-node,
      .insert-zone{
        grid-template-columns:38px 1fr;
        gap:8px;
      }

      .route-dot{
        width:30px;
        height:30px;
        font-size:14px;
      }

      .route-card-head{
        align-items:flex-start;
        flex-direction:column;
      }

      .slot-actions{
        flex-direction:column;
      }

      .slot-add-more,
      .slot-confirm{
        width:100%;
      }
    }
  `;

  document.head.appendChild(style);

})();

/* ================= BASIC HELPERS ================= */

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function cleanStatus(v){
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"")
    .trim();
}

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function showAlert(type,message){
  if(!alertBox) return;
  alertBox.className = `alert ${type} show`;
  alertBox.textContent = message || "";
}

function hideAlert(){
  if(!alertBox) return;
  alertBox.className = "alert";
  alertBox.textContent = "";
}

function showLoading(){
  if(loadingBox) loadingBox.style.display = "flex";
  if(form) form.style.display = "none";
}

function showForm(){
  if(loadingBox) loadingBox.style.display = "none";
  if(form) form.style.display = "block";
}

function getNowISO(){
  return new Date().toISOString();
}

function goBackToReview(){
  window.location.href = REVIEW_URL;
}

function setGlobalLoading(isLoading,text){
  document.querySelectorAll(".slot-confirm,.slot-add-more,.add-here-btn,.slot-close,.remove-slot-stop")
    .forEach(btn=>{
      btn.disabled = isLoading;
    });

  if(confirmAddStopBtn){
    confirmAddStopBtn.disabled = isLoading;
    confirmAddStopBtn.textContent = isLoading
      ? (text || "Processing...")
      : "Confirm Add Stop";
  }

  if(backBtn){
    backBtn.disabled = isLoading;
  }
}

/* ================= SYSTEM ================= */

async function loadSystemDesign(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json().catch(()=>({}));

    SYSTEM_REGION = data?.region || "";
    SYSTEM_COUNTRY = data?.country || "";
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";

  }catch(err){
    console.log("SYSTEM DESIGN ERROR:",err);
  }
}

function normalizeAddress(address){
  let v = clean(address);
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

/* ================= TRIP LOADING ================= */

async function fetchTripById(){

  if(!tripId){
    throw new Error("Missing trip ID");
  }

  try{
    const direct = await fetch(API_TRIP_BY_ID(tripId),{
      headers:{
        Authorization:"Bearer " + token
      }
    });

    if(direct.ok){
      const data = await direct.json().catch(()=>null);

      if(data && data._id) return data;
      if(data && data.trip && data.trip._id) return data.trip;
    }
  }catch(err){
    console.log("DIRECT TRIP LOAD ERROR:",err);
  }

  const res = await fetch(API_COMPANY_TRIPS,{
    headers:{
      Authorization:"Bearer " + token
    }
  });

  if(!res.ok){
    throw new Error("Failed to load trip");
  }

  const list = await res.json().catch(()=>[]);

  if(!Array.isArray(list)){
    throw new Error("Invalid trips response");
  }

  const trip = list.find(t => String(t._id) === String(tripId));

  if(!trip){
    throw new Error("Trip not found");
  }

  return trip;
}

async function reloadFreshTrip(){
  currentTrip = await fetchTripById();
  return currentTrip;
}

/* ================= TRIP RULES ================= */

function isSharedTrip(trip){

  if(!trip) return false;

  const tripType = upper(trip.tripType || trip.type);
  const tripNumber = upper(trip.tripNumber);

  const serviceKey = upper(
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.serviceSuffix ||
    trip.vehicle ||
    ""
  );

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    tripNumber.includes("-SH") ||
    serviceKey === "SH" ||
    serviceKey === "SHARED"
  );
}

function tripIsClosed(trip){
  const s = cleanStatus(trip?.status);

  return (
    s.includes("complete") ||
    s.includes("cancel") ||
    s.includes("noshow") ||
    s.includes("notcompleted")
  );
}

function tripIsInProgress(trip){
  const s = cleanStatus(trip?.status);

  return [
    "ontrip",
    "started",
    "inprogress",
    "pickedup",
    "pickupcompleted",
    "passengerpickedup",
    "enroute",
    "active"
  ].includes(s);
}

function getClientName(trip){
  return (
    trip.clientName ||
    trip.name ||
    trip.customerName ||
    ""
  );
}

function getPickup(trip){
  return clean(
    trip.pickup ||
    trip.pickupAddress ||
    ""
  );
}

function getDropoff(trip){
  return clean(
    trip.dropoff ||
    trip.dropoffAddress ||
    ""
  );
}

function getExistingStops(trip){
  if(!Array.isArray(trip.stops)){
    return [];
  }

  return trip.stops
    .map(s => normalizeAddress(s))
    .filter(Boolean);
}

function hasActiveStopRequest(trip){
  const req = trip?.addStopRequest || {};
  const status = upper(req.status || "");

  return (
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_COMPANY",
      "CANCELLED_BY_CUSTOMER",
      "COMPLETED",
      "STOP_REACHED"
    ].includes(status)
  );
}

/* ================= GOOGLE ================= */

async function ensureGoogleLoaded(){

  if(window.google && google.maps && google.maps.DirectionsService){
    return;
  }

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async (resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json().catch(()=>({}));

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

function isLatLngPoint(p){
  return (
    p &&
    typeof p === "object" &&
    Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lng))
  );
}

function normalizeRoutePoint(p){
  if(isLatLngPoint(p)){
    return {
      lat:Number(p.lat),
      lng:Number(p.lng)
    };
  }

  return normalizeAddress(p);
}

function pointIsValid(p){
  if(isLatLngPoint(p)) return true;
  return !!clean(p);
}

async function calculateRouteMiles(points){

  await ensureGoogleLoaded();

  const cleanPoints = Array.isArray(points)
    ? points.map(normalizeRoutePoint).filter(pointIsValid)
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

  const waypoints = middle.map(point=>({
    location:point,
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

/* ================= DRIVER LOCATION ================= */

function extractLatLngFromObject(obj){

  if(!obj || typeof obj !== "object"){
    return null;
  }

  const directLat =
    obj.lat ??
    obj.latitude ??
    obj.driverLat ??
    obj.currentLat ??
    obj.locationLat;

  const directLng =
    obj.lng ??
    obj.lon ??
    obj.long ??
    obj.longitude ??
    obj.driverLng ??
    obj.currentLng ??
    obj.locationLng;

  if(
    Number.isFinite(Number(directLat)) &&
    Number.isFinite(Number(directLng))
  ){
    return {
      lat:Number(directLat),
      lng:Number(directLng)
    };
  }

  const containers = [
    obj.location,
    obj.currentLocation,
    obj.driverLocation,
    obj.liveLocation,
    obj.coords,
    obj.position,
    obj.assignment,
    obj.driver,
    obj.data
  ];

  for(const item of containers){
    const found = extractLatLngFromObject(item);
    if(found) return found;
  }

  return null;
}

function getDriverLocationFromTrip(trip){
  return extractLatLngFromObject(trip);
}

async function fetchDriverLocationFromServer(id){

  const endpoints = DRIVER_LOCATION_ENDPOINTS(id);

  for(const url of endpoints){
    try{
      const res = await fetch(url,{
        headers:{
          Authorization:"Bearer " + token
        }
      });

      if(!res.ok) continue;

      const data = await res.json().catch(()=>null);
      const loc = extractLatLngFromObject(data);

      if(loc) return loc;

    }catch(err){
      console.log("DRIVER LOCATION ERROR:",url,err);
    }
  }

  return null;
}

async function getFreshDriverLocation(trip){

  const fromTrip = getDriverLocationFromTrip(trip);

  if(fromTrip) return fromTrip;

  return await fetchDriverLocationFromServer(tripId);
}

/* ================= TIMELINE UI ================= */

function hideOldControls(){
  if(addStopBtn){
    addStopBtn.classList.add("old-add-stop-hidden");
  }

  if(confirmAddStopBtn){
    confirmAddStopBtn.classList.add("old-add-stop-hidden");
  }
}

function getTimelineRoot(){
  let root = document.getElementById("routeTimelineRoot");

  if(root) return root;

  root = document.createElement("div");
  root.id = "routeTimelineRoot";
  root.className = "route-timeline";

  if(stopsContainer){
    stopsContainer.innerHTML = "";
    stopsContainer.appendChild(root);
  }else if(form){
    form.appendChild(root);
  }

  return root;
}

function routePointHtml({type,label,value,index,isLast}){

  const icon =
    type === "pickup"
      ? "P"
      : type === "dropoff"
        ? "D"
        : String(index);

  return `
    <div class="route-node">
      <div class="route-dot-wrap">
        <div class="route-dot ${type}">${icon}</div>
        ${isLast ? "" : `<div class="route-line"></div>`}
      </div>

      <div class="route-card">
        <div class="route-card-head">
          <div>${esc(label)}</div>
          <span class="${type}">${type.toUpperCase()}</span>
        </div>

        <div class="route-address">
          ${esc(value || "--")}
        </div>
      </div>
    </div>
  `;
}

function insertZoneHtml(slotIndex,label){
  return `
    <div class="insert-zone" data-slot="${slotIndex}">
      <div class="insert-line-wrap">
        <div class="insert-line"></div>
      </div>

      <div class="insert-content">
        <button
          type="button"
          class="add-here-btn"
          data-action="open-slot"
          data-slot="${slotIndex}"
        >
          <span>+</span>
          Add Stop Here
        </button>

        <div class="slot-panel-holder" data-slot-holder="${slotIndex}"></div>

        <div class="slot-note">
          ${esc(label)}
        </div>
      </div>
    </div>
  `;
}

function renderRouteTimeline(trip){

  const root = getTimelineRoot();

  const pickup = getPickup(trip);
  const dropoff = getDropoff(trip);
  const existingStops = getExistingStops(trip);

  const points = [];

  points.push({
    type:"pickup",
    label:"Pickup",
    value:pickup,
    index:0
  });

  existingStops.forEach((stop,index)=>{
    points.push({
      type:"stop",
      label:`Existing Stop ${index + 1}`,
      value:stop,
      index:index + 1
    });
  });

  points.push({
    type:"dropoff",
    label:"Dropoff",
    value:dropoff,
    index:existingStops.length + 1
  });

  let body = "";

  points.forEach((point,index)=>{

    const isLast =
      index === points.length - 1;

    body += routePointHtml({
      ...point,
      isLast
    });

    /*
      Add Stop zone بعد Pickup وبعد كل Existing Stop فقط.
      مفيش Add Stop بعد Dropoff.
    */
    if(!isLast){

      let label = "";

      if(index === 0){
        label = existingStops.length
          ? "New stops added here will be placed after Pickup and before Existing Stop 1."
          : "New stops added here will be placed before Dropoff.";
      }else{
        label = index === existingStops.length
          ? `New stops added here will be placed after Existing Stop ${index} and before Dropoff.`
          : `New stops added here will be placed after Existing Stop ${index} and before Existing Stop ${index + 1}.`;
      }

      body += insertZoneHtml(index,label);
    }
  });

  root.innerHTML = `
    <div class="route-timeline-head">
      <div class="title">Current Route</div>
      <div class="badge">${existingStops.length} Existing Stop${existingStops.length === 1 ? "" : "s"}</div>
    </div>

    <div class="route-timeline-body">
      ${body}
    </div>
  `;
}

function closeAllPanels(){
  document.querySelectorAll(".slot-panel-holder").forEach(holder=>{
    holder.innerHTML = "";
  });
}

function openSlotPanel(slotIndex){

  closeAllPanels();

  const holder =
    document.querySelector(`[data-slot-holder="${slotIndex}"]`);

  if(!holder) return;

  holder.innerHTML = `
    <div class="slot-panel" data-slot-panel="${slotIndex}">
      <div class="slot-panel-head">
        <div>Add Stop Here</div>
        <button type="button" class="slot-close" data-action="close-slot">×</button>
      </div>

      <div class="slot-panel-body">
        <div class="slot-stops-list"></div>

        <div class="slot-actions">
          <button type="button" class="slot-add-more" data-action="slot-add-more">
            + Another Stop
          </button>

          <button type="button" class="slot-confirm" data-action="slot-confirm">
            Confirm Here
          </button>
        </div>

        <div class="slot-note">
          You can add up to ${MAX_STOPS} stops in this location. Use X to remove any stop before confirm.
        </div>
      </div>
    </div>
  `;

  addSlotStopRow(holder.querySelector(".slot-stops-list"));

  const input =
    holder.querySelector(".slot-stop-input");

  setTimeout(()=>{
    if(input) input.focus();
  },30);
}

function getPanelFromElement(el){
  return el.closest(".slot-panel");
}

function getPanelSlot(panel){
  return Number(panel?.dataset?.slotPanel || 0);
}

function getPanelStopRows(panel){
  return Array.from(
    panel.querySelectorAll(".slot-stop-row")
  );
}

function addSlotStopRow(list,value=""){

  if(!list) return;

  const panel =
    list.closest(".slot-panel");

  const count =
    getPanelStopRows(panel).length;

  if(count >= MAX_STOPS){
    return;
  }

  stopCounter += 1;

  const row = document.createElement("div");
  row.className = "slot-stop-row";
  row.dataset.stopUid = String(stopCounter);

  row.innerHTML = `
    <input
      class="slot-stop-input"
      type="text"
      placeholder="Enter new stop address"
      value="${esc(value)}"
    >

    <button
      type="button"
      class="remove-slot-stop"
      data-action="remove-slot-stop"
      title="Remove this stop"
    >
      ×
    </button>
  `;

  list.appendChild(row);

  updatePanelButtons(panel);
}

function updatePanelButtons(panel){

  if(!panel) return;

  const rows =
    getPanelStopRows(panel);

  const addMore =
    panel.querySelector(".slot-add-more");

  if(addMore){
    addMore.disabled =
      rows.length >= MAX_STOPS;
  }

  rows.forEach((row,index)=>{
    const input = row.querySelector(".slot-stop-input");
    if(input){
      input.placeholder = `Enter new stop ${index + 1} address`;
    }
  });
}

function removeSlotStop(btn){

  const panel =
    getPanelFromElement(btn);

  const row =
    btn.closest(".slot-stop-row");

  if(row){
    row.remove();
  }

  const rows =
    getPanelStopRows(panel);

  if(rows.length === 0){
    panel.remove();
    return;
  }

  updatePanelButtons(panel);
  hideAlert();
}

function readPanelStops(panel){

  const rows =
    getPanelStopRows(panel);

  const out = [];
  const seen = new Set();

  rows.forEach((row,index)=>{

    const input =
      row.querySelector(".slot-stop-input");

    const address =
      normalizeAddress(input?.value || "");

    if(!address) return;

    const key =
      address.toLowerCase().replace(/\s+/g," ").trim();

    if(seen.has(key)) return;

    seen.add(key);

    out.push({
      address,
      rowIndex:index
    });
  });

  return out.slice(0,MAX_STOPS);
}

/* ================= ROUTE BUILD ================= */

function buildFinalStops(existingStops,addedStopObjects){

  const oldStops =
    Array.isArray(existingStops)
      ? existingStops.filter(Boolean)
      : [];

  const added =
    Array.isArray(addedStopObjects)
      ? addedStopObjects.filter(s => s && s.address)
      : [];

  const finalStops = [];

  /*
    insertAfterIndex:
    0 = بعد Pickup / قبل أول Stop
    1 = بعد Stop 1
    2 = بعد Stop 2
    ...
    oldStops.length = بعد آخر Stop / قبل Dropoff
  */

  for(let anchorIndex = 0; anchorIndex <= oldStops.length; anchorIndex++){

    if(anchorIndex > 0){
      finalStops.push(oldStops[anchorIndex - 1]);
    }

    added
      .filter(s => Number(s.insertAfterIndex || 0) === anchorIndex)
      .sort((a,b)=>Number(a.rowIndex || 0) - Number(b.rowIndex || 0))
      .forEach(s=>{
        finalStops.push(s.address);
      });
  }

  return finalStops;
}

function buildOriginalRouteBeforeStart(trip){
  return [
    getPickup(trip),
    ...getExistingStops(trip),
    getDropoff(trip)
  ].filter(Boolean);
}

function buildNewRouteBeforeStart(trip,finalStops){
  return [
    getPickup(trip),
    ...finalStops,
    getDropoff(trip)
  ].filter(Boolean);
}

function buildOriginalRemainingRouteInProgress(driverLocation,trip){
  return [
    driverLocation,
    ...getExistingStops(trip),
    getDropoff(trip)
  ].filter(Boolean);
}

function buildNewRemainingRouteInProgress(driverLocation,trip,finalStops){
  return [
    driverLocation,
    ...finalStops,
    getDropoff(trip)
  ].filter(Boolean);
}

/* ================= CALCULATION ================= */

async function calculateAddStopNow(trip,addedStopObjects){

  if(!addedStopObjects.length){
    throw new Error("Please add at least one stop");
  }

  const pickup = getPickup(trip);
  const dropoff = getDropoff(trip);

  if(!pickup){
    throw new Error("Pickup address missing");
  }

  if(!dropoff){
    throw new Error("Dropoff address missing");
  }

  const existingStops =
    getExistingStops(trip);

  const finalStops =
    buildFinalStops(
      existingStops,
      addedStopObjects
    );

  const addedStops =
    addedStopObjects.map(s => s.address);

  const inProgress =
    tripIsInProgress(trip);

  let mode = "BEFORE_START";
  let driverLocationAtConfirm = null;

  let originalRoutePoints = [];
  let newRoutePoints = [];

  if(inProgress){

    mode = "IN_PROGRESS";

    driverLocationAtConfirm =
      await getFreshDriverLocation(trip);

    if(!driverLocationAtConfirm){
      throw new Error("Driver current location is missing");
    }

    originalRoutePoints =
      buildOriginalRemainingRouteInProgress(
        driverLocationAtConfirm,
        trip
      );

    newRoutePoints =
      buildNewRemainingRouteInProgress(
        driverLocationAtConfirm,
        trip,
        finalStops
      );

  }else{

    mode = "BEFORE_START";

    originalRoutePoints =
      buildOriginalRouteBeforeStart(trip);

    newRoutePoints =
      buildNewRouteBeforeStart(
        trip,
        finalStops
      );
  }

  const originalRoute =
    await calculateRouteMiles(originalRoutePoints);

  const newRoute =
    await calculateRouteMiles(newRoutePoints);

  const extraMiles =
    Math.max(
      0,
      Number(
        (
          Number(newRoute.miles || 0) -
          Number(originalRoute.miles || 0)
        ).toFixed(2)
      )
    );

  return {
    mode,
    driverLocationAtConfirm,

    existingStops,
    addedStops,
    addedStopsDetailed:addedStopObjects,
    finalStops,

    originalRoutePoints,
    newRoutePoints,

    originalRemainingMiles:originalRoute.miles,
    newRemainingMiles:newRoute.miles,
    extraMiles,

    originalRouteData:originalRoute,
    newRouteData:newRoute
  };
}

/* ================= SERVER SEND ================= */

async function notifyServerAddStop(payload){

  const res =
    await fetch(
      API_ADD_STOP_CONFIRM(tripId),
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization:"Bearer " + token
        },
        body:JSON.stringify(payload)
      }
    );

  const data =
    await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(
      data.message ||
      "Failed to send added stop request"
    );
  }

  return data;
}

/* ================= PAGE FILL ================= */

function fillPage(trip){

  if(tripNumberInput){
    tripNumberInput.value = trip.tripNumber || "";
  }

  if(clientNameInput){
    clientNameInput.value = getClientName(trip) || "";
  }

  if(pickupAddressInput){
    pickupAddressInput.value = getPickup(trip) || "";
  }

  if(dropoffAddressInput){
    dropoffAddressInput.value = getDropoff(trip) || "";
  }

  renderRouteTimeline(trip);

  if(pageStatusBadge){
    pageStatusBadge.textContent =
      hasActiveStopRequest(trip)
        ? "Stop Request Active"
        : "Company Request";
  }

  if(hasActiveStopRequest(trip)){
    showAlert(
      "info",
      "This trip already has an active added stop request. Cancel it from the Review page before adding another one."
    );

    document.querySelectorAll(".add-here-btn").forEach(btn=>{
      btn.disabled = true;
    });
  }
}

/* ================= CONFIRM PER SLOT ================= */

async function confirmSlot(panel){

  hideAlert();

  try{

    const slotIndex =
      getPanelSlot(panel);

    setGlobalLoading(true,"Checking trip...");

    const freshTrip =
      await reloadFreshTrip();

    currentTrip =
      freshTrip;

    if(isSharedTrip(freshTrip)){
      throw new Error("Add Stop is not available for shared trips");
    }

    if(tripIsClosed(freshTrip)){
      throw new Error("This trip is closed and cannot be modified");
    }

    if(hasActiveStopRequest(freshTrip)){
      throw new Error("This trip already has an active stop request");
    }

    const panelStops =
      readPanelStops(panel);

    if(!panelStops.length){
      throw new Error("Please add at least one stop");
    }

    const addedStopObjects =
      panelStops.map(stop=>({
        ...stop,
        insertAfterIndex:slotIndex
      }));

    setGlobalLoading(true,"Calculating miles...");

    const calc =
      await calculateAddStopNow(
        freshTrip,
        addedStopObjects
      );

    setGlobalLoading(true,"Sending to review...");

    const payload = {
      tripId:String(freshTrip._id || tripId),

      source:"company-add-stop",
      requestType:"ADD_STOP",

      status:"PENDING_REVIEW",
      active:true,
      calculatePriceOnReview:true,

      companyName,
      tripNumber:freshTrip.tripNumber || "",
      clientName:getClientName(freshTrip),

      tripStatusAtConfirm:freshTrip.status || "",
      confirmedAt:getNowISO(),

      mode:calc.mode,
      maxStops:MAX_STOPS,

      insertAfterIndex:slotIndex,

      addedStops:calc.addedStops,
      addedStopsDetailed:calc.addedStopsDetailed,

      existingStops:calc.existingStops,
      finalStops:calc.finalStops,
      finalRoutePoints:calc.newRoutePoints,

      driverLocationAtConfirm:
        calc.driverLocationAtConfirm,

      beforeStopChange:{
        pickup:getPickup(freshTrip),
        dropoff:getDropoff(freshTrip),
        stops:calc.existingStops,
        routePoints:Array.isArray(freshTrip.routePoints)
          ? freshTrip.routePoints
          : [],
        miles:Number(freshTrip.miles || 0),
        priceAmount:Number(freshTrip.priceAmount || 0),
        finalPrice:Number(freshTrip.finalPrice || 0)
      },

      originalRoutePoints:
        calc.originalRoutePoints,

      newRoutePoints:
        calc.newRoutePoints,

      originalRemainingMiles:
        calc.originalRemainingMiles,

      newRemainingMiles:
        calc.newRemainingMiles,

      extraMiles:
        calc.extraMiles,

      originalRouteData:
        calc.originalRouteData,

      newRouteData:
        calc.newRouteData
    };

    await notifyServerAddStop(payload);

    showAlert(
      "success",
      "Stop request sent to Review. Price will be calculated there."
    );

    setTimeout(()=>{
      goBackToReview();
    },700);

  }catch(err){

    console.error(err);

    showAlert(
      "error",
      err.message || "Failed to add stop"
    );

  }finally{

    setGlobalLoading(false);
  }
}

/* ================= EVENTS ================= */

if(backBtn){
  backBtn.addEventListener("click",()=>{
    goBackToReview();
  });
}

if(form){
  form.addEventListener("submit",e=>{
    e.preventDefault();
  });
}

document.addEventListener("click",async e=>{

  const btn =
    e.target.closest("button");

  if(!btn) return;

  const action =
    btn.dataset.action;

  if(!action) return;

  if(action === "open-slot"){
    const slot =
      Number(btn.dataset.slot || 0);

    openSlotPanel(slot);
    hideAlert();
    return;
  }

  if(action === "close-slot"){
    const panel =
      getPanelFromElement(btn);

    if(panel) panel.remove();

    hideAlert();
    return;
  }

  if(action === "slot-add-more"){
    const panel =
      getPanelFromElement(btn);

    const list =
      panel?.querySelector(".slot-stops-list");

    addSlotStopRow(list);

    const inputs =
      panel.querySelectorAll(".slot-stop-input");

    const last =
      inputs[inputs.length - 1];

    if(last) last.focus();

    return;
  }

  if(action === "remove-slot-stop"){
    removeSlotStop(btn);
    return;
  }

  if(action === "slot-confirm"){
    const panel =
      getPanelFromElement(btn);

    if(panel){
      await confirmSlot(panel);
    }

    return;
  }
});

/* ================= INIT ================= */

async function init(){

  try{

    showLoading();
    hideAlert();
    hideOldControls();

    await loadSystemDesign();

    currentTrip =
      await fetchTripById();

    if(isSharedTrip(currentTrip)){
      throw new Error("Add Stop is not available for shared trips");
    }

    if(tripIsClosed(currentTrip)){
      throw new Error("This trip is closed and cannot be modified");
    }

    fillPage(currentTrip);

    showForm();

  }catch(err){

    console.error(err);

    showAlert(
      "error",
      err.message || "Failed to load page"
    );

    if(loadingBox){
      loadingBox.innerHTML = `
        <div style="font-weight:900;color:#991b1b;">
          ${esc(err.message || "Failed to load page")}
        </div>
      `;
    }
  }
}

init();

})();