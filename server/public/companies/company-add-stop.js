/* =========================================
FILE: company-add-stop.js
COMPANY ADD STOP
Final Route Editor
Add Stops + Edit Existing Stops + Edit Dropoff
Local Confirm per row
Final Submit sends request to server
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
let uid = 0;

/*
  newStopDrafts:
  {
    id,
    insertAfterIndex,
    value
  }

  confirmedNewStops:
  {
    id,
    address,
    insertAfterIndex,
    rowIndex
  }

  insertAfterIndex:
  0 = after pickup
  1 = after existing stop 1
  2 = after existing stop 2
*/

let newStopDrafts = [];
let confirmedNewStops = [];

let editingExistingIndex = null;
let existingEditDrafts = {};
let confirmedExistingEdits = {};

let editingDropoff = false;
let dropoffDraft = "";
let confirmedDropoff = null;

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

(function injectStyle(){

  const old = document.getElementById("company-add-stop-dynamic-style");
  if(old) old.remove();

  const style = document.createElement("style");
  style.id = "company-add-stop-dynamic-style";

  style.innerHTML = `
    .old-add-stop-hidden{
      display:none!important;
    }

    .route-editor{
      margin:20px 0;
      background:#fff;
      border:1px solid #dbeafe;
      border-radius:18px;
      overflow:hidden;
      box-shadow:0 12px 28px rgba(15,23,42,.10);
    }

    .route-editor-head{
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

    .route-editor-title{
      font-size:18px;
    }

    .route-editor-badge{
      background:#fff;
      color:#1d4ed8;
      padding:6px 12px;
      border-radius:999px;
      font-size:12px;
      font-weight:900;
    }

    .route-editor-body{
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
      font-size:14px;
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
      min-height:20px;
    }

    .route-card{
      background:#fff;
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

    .route-card-head-left{
      display:flex;
      align-items:center;
      gap:8px;
      flex-wrap:wrap;
    }

    .route-card-head span.route-type{
      padding:4px 8px;
      border-radius:999px;
      font-size:11px;
      color:#fff;
      font-weight:900;
    }

    .route-card-head span.pickup{
      background:#16a34a;
    }

    .route-card-head span.stop{
      background:#7c3aed;
    }

    .route-card-head span.dropoff{
      background:#dc2626;
    }

    .route-card-head span.edited{
      background:#f59e0b;
      color:#111827;
      padding:4px 8px;
      border-radius:999px;
      font-size:11px;
      font-weight:900;
    }

    .route-address{
      padding:12px;
      font-size:13px;
      font-weight:800;
      line-height:1.45;
      color:#111827;
      word-break:break-word;
    }

    .route-action-btn{
      border:none;
      background:#0f172a;
      color:#fff;
      padding:8px 11px;
      border-radius:10px;
      font-size:12px;
      font-weight:900;
      cursor:pointer;
    }

    .route-action-btn.edit{
      background:#2563eb;
    }

    .route-action-btn.cancel{
      background:#64748b;
    }

    .route-action-btn.confirm{
      background:#16a34a;
    }

    .edit-box{
      padding:12px;
      display:grid;
      gap:10px;
      background:#f8fafc;
    }

    .edit-input-row{
      display:grid;
      grid-template-columns:1fr auto auto;
      gap:8px;
      align-items:center;
    }

    .edit-input{
      width:100%;
      padding:12px;
      border:1px solid #cbd5e1;
      border-radius:12px;
      font-size:13px;
      font-weight:800;
      outline:none;
      background:#fff;
      color:#111827;
      box-sizing:border-box;
    }

    .edit-input:focus{
      border:2px solid #2563eb;
      box-shadow:0 0 0 3px rgba(37,99,235,.12);
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
      font-weight:900;
    }

    .slot-area{
      margin-top:10px;
      display:grid;
      gap:8px;
    }

    .draft-stop-row{
      display:grid;
      grid-template-columns:1fr auto auto;
      gap:8px;
      align-items:center;
      background:#f8fafc;
      border:1px solid #bfdbfe;
      border-radius:14px;
      padding:8px;
    }

    .draft-stop-input{
      width:100%;
      padding:12px;
      border:1px solid #cbd5e1;
      border-radius:12px;
      font-size:13px;
      font-weight:800;
      outline:none;
      background:#fff;
      color:#111827;
      box-sizing:border-box;
    }

    .draft-stop-input:focus{
      border:2px solid #2563eb;
      box-shadow:0 0 0 3px rgba(37,99,235,.12);
    }

    .draft-confirm-btn{
      border:none;
      background:#16a34a;
      color:#fff;
      padding:12px 14px;
      border-radius:12px;
      font-weight:900;
      cursor:pointer;
      white-space:nowrap;
    }

    .draft-remove-btn{
      width:40px;
      height:40px;
      border:none;
      border-radius:12px;
      background:#fee2e2;
      color:#dc2626;
      font-size:20px;
      font-weight:900;
      cursor:pointer;
    }

    .confirmed-stop-chip{
      display:grid;
      grid-template-columns:1fr 40px;
      gap:8px;
      align-items:center;
      background:#ecfdf5;
      border:1px solid #bbf7d0;
      border-radius:14px;
      padding:9px;
    }

    .confirmed-stop-text{
      font-size:12px;
      font-weight:900;
      color:#14532d;
      line-height:1.35;
      word-break:break-word;
    }

    .confirmed-stop-remove{
      width:40px;
      height:40px;
      border:none;
      border-radius:12px;
      background:#fee2e2;
      color:#dc2626;
      font-size:20px;
      font-weight:900;
      cursor:pointer;
    }

    .slot-note{
      color:#475569;
      font-size:11px;
      font-weight:800;
      line-height:1.4;
      margin-top:6px;
    }

    .submit-box{
      margin:18px 0 6px;
      background:#fff;
      border:1px solid #e2e8f0;
      border-radius:16px;
      padding:14px;
      display:flex;
      gap:10px;
      justify-content:flex-end;
      flex-wrap:wrap;
      box-shadow:0 6px 16px rgba(15,23,42,.06);
    }

    .submit-main-btn{
      border:none;
      background:#16a34a;
      color:#fff;
      padding:13px 18px;
      border-radius:14px;
      font-weight:900;
      cursor:pointer;
      min-width:240px;
    }

    .submit-main-btn:disabled,
    .route-action-btn:disabled,
    .add-here-btn:disabled,
    .draft-confirm-btn:disabled,
    .draft-remove-btn:disabled,
    .confirmed-stop-remove:disabled{
      opacity:.55;
      cursor:not-allowed;
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
        font-size:12px;
      }

      .route-card-head{
        align-items:flex-start;
        flex-direction:column;
      }

      .edit-input-row,
      .draft-stop-row{
        grid-template-columns:1fr;
      }

      .draft-confirm-btn,
      .route-action-btn,
      .submit-main-btn{
        width:100%;
      }

      .draft-remove-btn,
      .confirmed-stop-remove{
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

function nextId(){
  uid += 1;
  return String(uid);
}

function setGlobalLoading(isLoading,text){

  document
    .querySelectorAll(
      ".submit-main-btn,.route-action-btn,.add-here-btn,.draft-confirm-btn,.draft-remove-btn,.confirmed-stop-remove"
    )
    .forEach(btn=>{
      btn.disabled = isLoading;
    });

  const submitBtn =
    document.getElementById("submitAddStopRequestBtn");

  if(submitBtn){
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading
      ? (text || "Processing...")
      : getSubmitButtonText();
  }

  if(backBtn){
    backBtn.disabled = isLoading;
  }
}

function totalConfirmedNewStops(){
  return confirmedNewStops.length;
}

function hasExistingEdits(){
  return Object.keys(confirmedExistingEdits).length > 0;
}

function hasDropoffEdit(){
  return !!confirmedDropoff && confirmedDropoff !== getDropoff(currentTrip || {});
}

function hasAnyChange(){
  return (
    totalConfirmedNewStops() > 0 ||
    hasExistingEdits() ||
    hasDropoffEdit()
  );
}

/* ================= SYSTEM ================= */

async function loadSystemDesign(){

  try{

    const res =
      await fetch("/api/system-design");

    const data =
      await res.json().catch(()=>({}));

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

  const lower =
    v.toLowerCase();

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

    const direct =
      await fetch(
        API_TRIP_BY_ID(tripId),
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

    if(direct.ok){

      const data =
        await direct.json().catch(()=>null);

      if(data && data._id) return data;
      if(data && data.trip && data.trip._id) return data.trip;
    }

  }catch(err){
    console.log("DIRECT TRIP LOAD ERROR:",err);
  }

  const res =
    await fetch(
      API_COMPANY_TRIPS,
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

  if(!res.ok){
    throw new Error("Failed to load trip");
  }

  const list =
    await res.json().catch(()=>[]);

  if(!Array.isArray(list)){
    throw new Error("Invalid trips response");
  }

  const trip =
    list.find(t => String(t._id) === String(tripId));

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

  const tripType =
    upper(trip.tripType || trip.type);

  const tripNumber =
    upper(trip.tripNumber);

  const serviceKey =
    upper(
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

  const s =
    cleanStatus(trip?.status);

  return (
    s.includes("complete") ||
    s.includes("cancel") ||
    s.includes("noshow") ||
    s.includes("notcompleted")
  );
}

function tripIsInProgress(trip){

  const s =
    cleanStatus(trip?.status);

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

function getFinalDropoff(){
  return confirmedDropoff || getDropoff(currentTrip || {});
}

function getExistingStops(trip){

  if(!Array.isArray(trip.stops)){
    return [];
  }

  return trip.stops
    .map(s => normalizeAddress(s))
    .filter(Boolean);
}

function getEditedExistingStops(trip){

  const original =
    getExistingStops(trip);

  return original.map((stop,index)=>{
    return confirmedExistingEdits[index] || stop;
  });
}

function hasActiveStopRequest(trip){

  const req =
    trip?.addStopRequest || {};

  const status =
    upper(req.status || "");

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

  if(googleLoadPromise){
    return googleLoadPromise;
  }

  googleLoadPromise =
    new Promise(async (resolve,reject)=>{

      try{

        const res =
          await fetch("/api/config");

        const data =
          await res.json().catch(()=>({}));

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

  const cleanPoints =
    Array.isArray(points)
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

  const origin =
    cleanPoints[0];

  const destination =
    cleanPoints[cleanPoints.length - 1];

  const middle =
    cleanPoints.slice(1,-1);

  const waypoints =
    middle.map(point=>({
      location:point,
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
    const found =
      extractLatLngFromObject(item);

    if(found) return found;
  }

  return null;
}

function getDriverLocationFromTrip(trip){
  return extractLatLngFromObject(trip);
}

async function fetchDriverLocationFromServer(id){

  const endpoints =
    DRIVER_LOCATION_ENDPOINTS(id);

  for(const url of endpoints){

    try{

      const res =
        await fetch(
          url,
          {
            headers:{
              Authorization:"Bearer " + token
            }
          }
        );

      if(!res.ok) continue;

      const data =
        await res.json().catch(()=>null);

      const loc =
        extractLatLngFromObject(data);

      if(loc) return loc;

    }catch(err){
      console.log("DRIVER LOCATION ERROR:",url,err);
    }
  }

  return null;
}

async function getFreshDriverLocation(trip){

  const fromTrip =
    getDriverLocationFromTrip(trip);

  if(fromTrip) return fromTrip;

  return await fetchDriverLocationFromServer(tripId);
}

/* ================= UI ROOT ================= */

function hideOldControls(){

  if(addStopBtn){
    addStopBtn.classList.add("old-add-stop-hidden");
    addStopBtn.style.display = "none";
  }

  if(confirmAddStopBtn){
    confirmAddStopBtn.classList.add("old-add-stop-hidden");
    confirmAddStopBtn.style.display = "none";
  }

  /*
    نخفي أي خانات Add Stop قديمة موجودة في HTML
    عشان الصفحة الجديدة تعتمد على Route Editor فقط
  */
  document
    .querySelectorAll(
      ".stop-item, .dynamic-stop-input, .dynamic-stop-position, .insert-select, .stop-position-note"
    )
    .forEach(el=>{
      el.classList.add("old-add-stop-hidden");
      el.style.display = "none";
    });

  /*
    لو في خانة قديمة تحت التايملاين جوه stopsContainer
    امسحها قبل ما نبني Route Editor
  */
  if(stopsContainer){
    stopsContainer.innerHTML = "";
  }
}

function getEditorRoot(){

  let root =
    document.getElementById("routeEditorRoot");

  if(root) return root;

  root =
    document.createElement("div");

  root.id =
    "routeEditorRoot";

  root.className =
    "route-editor";

  if(stopsContainer){
    stopsContainer.innerHTML = "";
    stopsContainer.appendChild(root);
  }else if(form){
    form.appendChild(root);
  }

  return root;
}

function ensureSubmitBox(){

  let box =
    document.getElementById("submitAddStopBox");

  if(box) return box;

  box =
    document.createElement("div");

  box.id =
    "submitAddStopBox";

  box.className =
    "submit-box";

  box.innerHTML = `
    <button
      type="button"
      id="submitAddStopRequestBtn"
      class="submit-main-btn"
    >
      Submit Add Stop Request
    </button>
  `;

  const root =
    getEditorRoot();

  root.insertAdjacentElement("afterend",box);

  return box;
}

function getSubmitButtonText(){

  const parts = [];

  if(totalConfirmedNewStops()){
    parts.push(`${totalConfirmedNewStops()} Added Stop${totalConfirmedNewStops() === 1 ? "" : "s"}`);
  }

  if(hasExistingEdits()){
    parts.push("Edited Stops");
  }

  if(hasDropoffEdit()){
    parts.push("Edited Dropoff");
  }

  if(!parts.length){
    return "Submit Add Stop Request";
  }

  return `Submit Add Stop Request (${parts.join(" + ")})`;
}

function updateSubmitButtonState(){

  const btn =
    document.getElementById("submitAddStopRequestBtn");

  if(!btn) return;

  btn.textContent =
    getSubmitButtonText();

  btn.disabled =
    hasActiveStopRequest(currentTrip) ||
    !hasAnyChange();
}

/* ================= UI RENDER HELPERS ================= */

function renderRoutePoint({type,label,value,index,isLast,editable=false,edited=false}){

  const icon =
    type === "pickup"
      ? "P"
      : type === "dropoff"
        ? "D"
        : String(index);

  const editButton =
    editable
      ? `
        <button
          type="button"
          class="route-action-btn edit"
          data-action="${type === "dropoff" ? "edit-dropoff" : "edit-existing"}"
          data-index="${index - 1}"
        >
          Edit
        </button>
      `
      : "";

  return `
    <div class="route-node">
      <div class="route-dot-wrap">
        <div class="route-dot ${type}">${esc(icon)}</div>
        ${isLast ? "" : `<div class="route-line"></div>`}
      </div>

      <div class="route-card">
        <div class="route-card-head">
          <div class="route-card-head-left">
            <div>${esc(label)}</div>
            <span class="route-type ${type}">${esc(type.toUpperCase())}</span>
            ${edited ? `<span class="edited">EDITED</span>` : ""}
          </div>

          ${editButton}
        </div>

        <div class="route-address">
          ${esc(value || "--")}
        </div>

        ${renderInlineEditBox(type,index,value)}
      </div>
    </div>
  `;
}

function renderInlineEditBox(type,index,value){

  if(type === "stop"){

    const stopIndex =
      index - 1;

    if(Number(editingExistingIndex) !== Number(stopIndex)){
      return "";
    }

    const draft =
      existingEditDrafts[stopIndex] ?? value ?? "";

    return `
      <div class="edit-box">
        <div class="edit-input-row">
          <input
            type="text"
            class="edit-input existing-edit-input"
            data-index="${stopIndex}"
            value="${esc(draft)}"
            placeholder="Edit existing stop address"
          >

          <button
            type="button"
            class="route-action-btn confirm"
            data-action="confirm-existing-edit"
            data-index="${stopIndex}"
          >
            Confirm
          </button>

          <button
            type="button"
            class="route-action-btn cancel"
            data-action="cancel-existing-edit"
            data-index="${stopIndex}"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  if(type === "dropoff" && editingDropoff){

    const draft =
      dropoffDraft || value || "";

    return `
      <div class="edit-box">
        <div class="edit-input-row">
          <input
            type="text"
            class="edit-input dropoff-edit-input"
            value="${esc(draft)}"
            placeholder="Edit dropoff address"
          >

          <button
            type="button"
            class="route-action-btn confirm"
            data-action="confirm-dropoff-edit"
          >
            Confirm
          </button>

          <button
            type="button"
            class="route-action-btn cancel"
            data-action="cancel-dropoff-edit"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  return "";
}

function getDraftsForSlot(slotIndex){
  return newStopDrafts
    .filter(s => Number(s.insertAfterIndex) === Number(slotIndex));
}

function getConfirmedNewStopsForSlot(slotIndex){
  return confirmedNewStops
    .filter(s => Number(s.insertAfterIndex) === Number(slotIndex))
    .sort((a,b)=>Number(a.rowIndex || 0) - Number(b.rowIndex || 0));
}

function renderDraftRows(slotIndex){

  const drafts =
    getDraftsForSlot(slotIndex);

  if(!drafts.length){
    return "";
  }

  return drafts.map(draft=>`
    <div class="draft-stop-row" data-draft-id="${esc(draft.id)}">
      <input
        type="text"
        class="draft-stop-input"
        data-id="${esc(draft.id)}"
        value="${esc(draft.value || "")}"
        placeholder="Enter new stop address"
      >

      <button
        type="button"
        class="draft-confirm-btn"
        data-action="confirm-new-stop"
        data-id="${esc(draft.id)}"
      >
        Confirm
      </button>

      <button
        type="button"
        class="draft-remove-btn"
        data-action="remove-draft-stop"
        data-id="${esc(draft.id)}"
        title="Remove"
      >
        ×
      </button>
    </div>
  `).join("");
}

function renderConfirmedNewStops(slotIndex){

  const list =
    getConfirmedNewStopsForSlot(slotIndex);

  if(!list.length){
    return "";
  }

  return list.map(stop=>`
    <div class="confirmed-stop-chip" data-stop-id="${esc(stop.id)}">
      <div class="confirmed-stop-text">
        ${esc(stop.address)}
      </div>

      <button
        type="button"
        class="confirmed-stop-remove"
        data-action="remove-confirmed-new-stop"
        data-id="${esc(stop.id)}"
        title="Remove"
      >
        ×
      </button>
    </div>
  `).join("");
}

function renderInsertZone(slotIndex,label){

  const cannotAdd =
    totalConfirmedNewStops() + newStopDrafts.length >= MAX_STOPS;

  return `
    <div class="insert-zone" data-slot="${slotIndex}">
      <div class="insert-line-wrap">
        <div class="insert-line"></div>
      </div>

      <div class="insert-content">

        <button
          type="button"
          class="add-here-btn"
          data-action="add-draft-stop"
          data-slot="${slotIndex}"
          ${cannotAdd ? "disabled" : ""}
        >
          <span>+</span>
          Add Stop Here
        </button>

        <div class="slot-area">
          ${renderDraftRows(slotIndex)}
          ${renderConfirmedNewStops(slotIndex)}
        </div>

        <div class="slot-note">
          ${esc(label)}
        </div>
      </div>
    </div>
  `;
}

/* ================= MAIN RENDER ================= */

function renderRouteEditor(trip){

  const root =
    getEditorRoot();

  const pickup =
    getPickup(trip);

  const dropoffOriginal =
    getDropoff(trip);

  const finalDropoff =
    getFinalDropoff();

  const existingOriginal =
    getExistingStops(trip);

  const existingEdited =
    getEditedExistingStops(trip);

  const points = [];

  points.push({
    type:"pickup",
    label:"Pickup",
    value:pickup,
    index:0,
    editable:false,
    edited:false
  });

  existingEdited.forEach((stop,index)=>{
    points.push({
      type:"stop",
      label:`Existing Stop ${index + 1}`,
      value:stop,
      index:index + 1,
      editable:true,
      edited:stop !== existingOriginal[index]
    });
  });

  points.push({
    type:"dropoff",
    label:"Dropoff",
    value:finalDropoff,
    index:existingEdited.length + 1,
    editable:true,
    edited:finalDropoff !== dropoffOriginal
  });

  let body = "";

  points.forEach((point,index)=>{

    const isLast =
      index === points.length - 1;

    body += renderRoutePoint({
      ...point,
      isLast
    });

    /*
      Add Stop يظهر بعد Pickup وبعد كل Existing Stop فقط.
      مفيش Add Stop بعد Dropoff.
    */
    if(!isLast){

      let label = "";

      if(index === 0){
        label = existingEdited.length
          ? "Stops added here will be placed after Pickup and before Existing Stop 1."
          : "Stops added here will be placed before Dropoff.";
      }else{
        label = index === existingEdited.length
          ? `Stops added here will be placed after Existing Stop ${index} and before Dropoff.`
          : `Stops added here will be placed after Existing Stop ${index} and before Existing Stop ${index + 1}.`;
      }

      body += renderInsertZone(index,label);
    }
  });

  root.innerHTML = `
    <div class="route-editor-head">
      <div class="route-editor-title">
        Current Route Editor
      </div>

      <div class="route-editor-badge">
        ${existingOriginal.length} Existing Stop${existingOriginal.length === 1 ? "" : "s"}
      </div>
    </div>

    <div class="route-editor-body">
      ${body}
    </div>
  `;

  ensureSubmitBox();
  updateSubmitButtonState();
}

function rerender(){
  renderRouteEditor(currentTrip || {});
}

/* ================= ADD NEW STOP ACTIONS ================= */

function addDraftStop(slotIndex){

  hideAlert();

  const total =
    totalConfirmedNewStops() + newStopDrafts.length;

  if(total >= MAX_STOPS){
    showAlert("error",`Maximum ${MAX_STOPS} added stops allowed`);
    return;
  }

  const id =
    nextId();

  newStopDrafts.push({
    id,
    insertAfterIndex:Number(slotIndex || 0),
    value:""
  });

  rerender();

  setTimeout(()=>{
    const input =
      document.querySelector(`.draft-stop-input[data-id="${id}"]`);

    if(input) input.focus();
  },30);
}

function updateDraftValue(id,value){

  const item =
    newStopDrafts.find(s => String(s.id) === String(id));

  if(item){
    item.value = value;
  }
}

function removeDraftStop(id){

  newStopDrafts =
    newStopDrafts.filter(s => String(s.id) !== String(id));

  hideAlert();
  rerender();
}

function confirmNewStop(id){

  hideAlert();

  const draft =
    newStopDrafts.find(s => String(s.id) === String(id));

  if(!draft) return;

  const input =
    document.querySelector(`.draft-stop-input[data-id="${id}"]`);

  const raw =
    input ? input.value : draft.value;

  const address =
    normalizeAddress(raw);

  if(!address){
    showAlert("error","Please enter stop address first");
    if(input) input.focus();
    return;
  }

  const duplicate =
    confirmedNewStops.some(s =>
      clean(s.address).toLowerCase() === address.toLowerCase()
    );

  if(duplicate){
    showAlert("error","This stop is already confirmed");
    if(input) input.focus();
    return;
  }

  const slotIndex =
    Number(draft.insertAfterIndex || 0);

  const rowIndex =
    confirmedNewStops
      .filter(s => Number(s.insertAfterIndex) === slotIndex)
      .length;

  confirmedNewStops.push({
    id:nextId(),
    address,
    insertAfterIndex:slotIndex,
    rowIndex
  });

  newStopDrafts =
    newStopDrafts.filter(s => String(s.id) !== String(id));

  rerender();
}

function removeConfirmedNewStop(id){

  const removed =
    confirmedNewStops.find(s => String(s.id) === String(id));

  const slotIndex =
    removed ? Number(removed.insertAfterIndex || 0) : null;

  confirmedNewStops =
    confirmedNewStops.filter(s => String(s.id) !== String(id));

  if(slotIndex !== null){
    const slotStops =
      confirmedNewStops
        .filter(s => Number(s.insertAfterIndex) === slotIndex)
        .sort((a,b)=>Number(a.rowIndex || 0) - Number(b.rowIndex || 0));

    slotStops.forEach((s,index)=>{
      s.rowIndex = index;
    });
  }

  hideAlert();
  rerender();
}

/* ================= EXISTING STOP EDIT ================= */

function startExistingEdit(index){

  hideAlert();

  editingExistingIndex =
    Number(index);

  const stops =
    getEditedExistingStops(currentTrip || {});

  existingEditDrafts[index] =
    confirmedExistingEdits[index] ||
    stops[index] ||
    "";

  rerender();

  setTimeout(()=>{
    const input =
      document.querySelector(`.existing-edit-input[data-index="${index}"]`);

    if(input) input.focus();
  },30);
}

function confirmExistingEdit(index){

  hideAlert();

  const input =
    document.querySelector(`.existing-edit-input[data-index="${index}"]`);

  const value =
    normalizeAddress(input?.value || "");

  if(!value){
    showAlert("error","Existing stop address cannot be empty");
    if(input) input.focus();
    return;
  }

  const original =
    getExistingStops(currentTrip || {})[index] || "";

  if(value === original){
    delete confirmedExistingEdits[index];
  }else{
    confirmedExistingEdits[index] = value;
  }

  delete existingEditDrafts[index];
  editingExistingIndex = null;

  rerender();
}

function cancelExistingEdit(index){

  delete existingEditDrafts[index];
  editingExistingIndex = null;

  hideAlert();
  rerender();
}

/* ================= DROPOFF EDIT ================= */

function startDropoffEdit(){

  hideAlert();

  editingDropoff = true;
  dropoffDraft = getFinalDropoff();

  rerender();

  setTimeout(()=>{
    const input =
      document.querySelector(".dropoff-edit-input");

    if(input) input.focus();
  },30);
}

function confirmDropoffEdit(){

  hideAlert();

  const input =
    document.querySelector(".dropoff-edit-input");

  const value =
    normalizeAddress(input?.value || "");

  if(!value){
    showAlert("error","Dropoff address cannot be empty");
    if(input) input.focus();
    return;
  }

  const original =
    getDropoff(currentTrip || {});

  confirmedDropoff =
    value === original ? null : value;

  dropoffDraft = "";
  editingDropoff = false;

  rerender();
}

function cancelDropoffEdit(){

  dropoffDraft = "";
  editingDropoff = false;

  hideAlert();
  rerender();
}

/* ================= ROUTE BUILD ================= */

function buildFinalStops(originalExistingStops,addedStopObjects){

  const oldStops =
    Array.isArray(originalExistingStops)
      ? originalExistingStops.filter(Boolean)
      : [];

  const editedStops =
    oldStops.map((stop,index)=>{
      return confirmedExistingEdits[index] || stop;
    });

  const added =
    Array.isArray(addedStopObjects)
      ? addedStopObjects.filter(s => s && s.address)
      : [];

  const finalStops = [];

  for(let anchorIndex = 0; anchorIndex <= editedStops.length; anchorIndex++){

    if(anchorIndex > 0){
      finalStops.push(editedStops[anchorIndex - 1]);
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

function buildNewRouteBeforeStart(trip,finalStops,dropoffAfter){

  return [
    getPickup(trip),
    ...finalStops,
    dropoffAfter
  ].filter(Boolean);
}

function buildOriginalRemainingRouteInProgress(driverLocation,trip){

  return [
    driverLocation,
    ...getExistingStops(trip),
    getDropoff(trip)
  ].filter(Boolean);
}

function buildNewRemainingRouteInProgress(driverLocation,finalStops,dropoffAfter){

  return [
    driverLocation,
    ...finalStops,
    dropoffAfter
  ].filter(Boolean);
}

/* ================= CALCULATION ================= */

async function calculateFinalRouteChange(trip,addedStopObjects){

  const pickup =
    getPickup(trip);

  const dropoffBefore =
    getDropoff(trip);

  const dropoffAfter =
    getFinalDropoff();

  if(!pickup){
    throw new Error("Pickup address missing");
  }

  if(!dropoffBefore){
    throw new Error("Dropoff address missing");
  }

  if(!dropoffAfter){
    throw new Error("Final dropoff address missing");
  }

  const existingStopsBefore =
    getExistingStops(trip);

  const finalStops =
    buildFinalStops(
      existingStopsBefore,
      addedStopObjects
    );

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
        finalStops,
        dropoffAfter
      );

  }else{

    originalRoutePoints =
      buildOriginalRouteBeforeStart(trip);

    newRoutePoints =
      buildNewRouteBeforeStart(
        trip,
        finalStops,
        dropoffAfter
      );
  }

  const originalRoute =
    await calculateRouteMiles(originalRoutePoints);

  const newRoute =
    await calculateRouteMiles(newRoutePoints);

  const extraMiles =
    Number(
      (
        Number(newRoute.miles || 0) -
        Number(originalRoute.miles || 0)
      ).toFixed(2)
    );

  const addedStops =
    addedStopObjects.map(s => s.address);

  const editedExistingStops =
    Object.keys(confirmedExistingEdits).map(key=>{
      const index = Number(key);
      return {
        index,
        oldAddress:existingStopsBefore[index] || "",
        newAddress:confirmedExistingEdits[key]
      };
    });

  return {
    mode,
    driverLocationAtConfirm,

    pickup,

    dropoffBefore,
    dropoffAfter,

    existingStopsBefore,
    editedExistingStops,

    addedStops,
    addedStopsDetailed:addedStopObjects,

    finalStops,
    finalRoutePoints:newRoutePoints,

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

/* ================= FINAL SUBMIT ================= */

async function finalSubmitAddStop(){

  hideAlert();

  try{

    if(newStopDrafts.length){
      throw new Error("You have unconfirmed stop fields. Confirm or remove them first.");
    }

    if(!hasAnyChange()){
      throw new Error("No changes to submit");
    }

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

    const addedStopObjects =
      confirmedNewStops.map((s,index)=>({
        address:s.address,
        insertAfterIndex:Number(s.insertAfterIndex || 0),
        rowIndex:Number(s.rowIndex ?? index)
      }));

    setGlobalLoading(true,"Calculating miles...");

    const calc =
      await calculateFinalRouteChange(
        freshTrip,
        addedStopObjects
      );

    setGlobalLoading(true,"Sending request...");

    const payload = {
      tripId:String(freshTrip._id || tripId),

      source:"company-add-stop",
      requestType:"ROUTE_CHANGE",

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

      pickup:calc.pickup,

      dropoffBefore:calc.dropoffBefore,
      dropoffAfter:calc.dropoffAfter,

      existingStopsBefore:calc.existingStopsBefore,
      editedExistingStops:calc.editedExistingStops,

      addedStops:calc.addedStops,
      addedStopsDetailed:calc.addedStopsDetailed,

      finalStops:calc.finalStops,
      finalRoutePoints:calc.finalRoutePoints,

      driverLocationAtConfirm:
        calc.driverLocationAtConfirm,

      beforeStopChange:{
        pickup:getPickup(freshTrip),
        dropoff:getDropoff(freshTrip),
        stops:calc.existingStopsBefore,
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
      "Route change request sent to Review. Price will be calculated there."
    );

    setTimeout(()=>{
      goBackToReview();
    },700);

  }catch(err){

    console.error(err);

    showAlert(
      "error",
      err.message || "Failed to submit route change"
    );

  }finally{

    setGlobalLoading(false);
    updateSubmitButtonState();
  }
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

  renderRouteEditor(trip);

  if(pageStatusBadge){
    pageStatusBadge.textContent =
      hasActiveStopRequest(trip)
        ? "Stop Request Active"
        : "Route Change Request";
  }

  if(hasActiveStopRequest(trip)){
    showAlert(
      "info",
      "This trip already has an active route change request. Cancel it from the Review page before adding another one."
    );
  }

  updateSubmitButtonState();
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
    finalSubmitAddStop();
  });
}

document.addEventListener("input",e=>{

  const draftInput =
    e.target.closest(".draft-stop-input");

  if(draftInput){
    updateDraftValue(
      draftInput.dataset.id || "",
      draftInput.value || ""
    );
    return;
  }

  const existingInput =
    e.target.closest(".existing-edit-input");

  if(existingInput){
    existingEditDrafts[existingInput.dataset.index] =
      existingInput.value || "";
    return;
  }

  const dropoffInput =
    e.target.closest(".dropoff-edit-input");

  if(dropoffInput){
    dropoffDraft = dropoffInput.value || "";
    return;
  }
});

document.addEventListener("click",e=>{

  const btn =
    e.target.closest("button");

  if(!btn) return;

  const action =
    btn.dataset.action;

  if(!action) return;

  if(action === "add-draft-stop"){
    addDraftStop(Number(btn.dataset.slot || 0));
    return;
  }

  if(action === "remove-draft-stop"){
    removeDraftStop(btn.dataset.id || "");
    return;
  }

  if(action === "confirm-new-stop"){
    confirmNewStop(btn.dataset.id || "");
    return;
  }

  if(action === "remove-confirmed-new-stop"){
    removeConfirmedNewStop(btn.dataset.id || "");
    return;
  }

  if(action === "edit-existing"){
    startExistingEdit(Number(btn.dataset.index || 0));
    return;
  }

  if(action === "confirm-existing-edit"){
    confirmExistingEdit(Number(btn.dataset.index || 0));
    return;
  }

  if(action === "cancel-existing-edit"){
    cancelExistingEdit(Number(btn.dataset.index || 0));
    return;
  }

  if(action === "edit-dropoff"){
    startDropoffEdit();
    return;
  }

  if(action === "confirm-dropoff-edit"){
    confirmDropoffEdit();
    return;
  }

  if(action === "cancel-dropoff-edit"){
    cancelDropoffEdit();
    return;
  }
});

document.addEventListener("click",e=>{
  const submitBtn =
    e.target.closest("#submitAddStopRequestBtn");

  if(submitBtn){
    finalSubmitAddStop();
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