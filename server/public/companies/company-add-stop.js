/* =========================================
FILE: company-add-stop.js
COMPANY ADD STOP
Dynamic stops UI
Calculate miles only
Send request to Review page
No price calculation here
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

const API_TRIP_BY_ID = id => `/api/trips/${encodeURIComponent(id)}`;

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

/* ================= BASIC HELPERS ================= */

function clean(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"")
    .trim();
}

function showAlert(type,message){
  alertBox.className = `alert ${type} show`;
  alertBox.textContent = message || "";
}

function hideAlert(){
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

function setButtonLoading(isLoading,text){
  if(confirmAddStopBtn){
    confirmAddStopBtn.disabled = isLoading;
    confirmAddStopBtn.textContent = isLoading
      ? (text || "Processing...")
      : "Confirm Add Stop";
  }

  if(addStopBtn) addStopBtn.disabled = isLoading || getStopInputs().length >= MAX_STOPS;
  if(backBtn) backBtn.disabled = isLoading;
}

function getNowISO(){
  return new Date().toISOString();
}

function goBackToReview(){
  window.location.href = REVIEW_URL;
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

  return (
    trip.isShared === true ||
    String(trip.tripType || "").toUpperCase() === "SHARED" ||
    String(trip.type || "").toUpperCase() === "SHARED" ||
    String(trip.tripNumber || "").toUpperCase().includes("-SH") ||
    (Array.isArray(trip.passengers) && trip.passengers.length > 0)
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
  return clean(trip.pickup || trip.pickupAddress || "");
}

function getDropoff(trip){
  return clean(trip.dropoff || trip.dropoffAddress || "");
}

function getExistingStops(trip){
  if(!Array.isArray(trip.stops)) return [];

  return trip.stops
    .map(s => normalizeAddress(s))
    .filter(Boolean);
}

function hasActiveStopRequest(trip){
  const req = trip?.addStopRequest || {};
  const status = String(req.status || "").toUpperCase();

  return (
    req.active === true &&
    !["CANCELLED","CANCELLED_BY_COMPANY","COMPLETED","STOP_REACHED"].includes(status)
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
  if(!obj || typeof obj !== "object") return null;

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

async function fetchDriverLocationFromServer(tripId){
  const endpoints = DRIVER_LOCATION_ENDPOINTS(tripId);

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

  if(fromTrip){
    return fromTrip;
  }

  return await fetchDriverLocationFromServer(tripId);
}

/* ================= DYNAMIC STOPS UI ================= */

function getStopInputs(){
  return Array.from(document.querySelectorAll(".dynamic-stop-input"));
}

function renumberStops(){
  const items = Array.from(document.querySelectorAll(".stop-item"));

  items.forEach((item,index)=>{
    const label = item.querySelector(".stop-label");
    const input = item.querySelector(".dynamic-stop-input");

    if(label) label.textContent = `Stop ${index + 1}`;
    if(input) input.placeholder = `Enter stop ${index + 1} address`;
    if(input) input.dataset.stopIndex = String(index);
  });

  if(addStopBtn){
    addStopBtn.style.display = items.length >= MAX_STOPS ? "none" : "inline-flex";
    addStopBtn.disabled = items.length >= MAX_STOPS;
  }
}

function createStopRow(value){
  const currentCount = getStopInputs().length;

  if(currentCount >= MAX_STOPS){
    return;
  }

  stopCounter += 1;

  const item = document.createElement("div");
  item.className = "stop-item";
  item.dataset.stopUid = String(stopCounter);

  item.innerHTML = `
    <div class="stop-head">
      <div class="stop-label">Stop ${currentCount + 1}</div>
      <button type="button" class="remove-stop-btn" title="Remove stop">×</button>
    </div>
    <input
      class="dynamic-stop-input"
      type="text"
      data-stop-index="${currentCount}"
      placeholder="Enter stop ${currentCount + 1} address"
      value=""
    >
  `;

  const input = item.querySelector(".dynamic-stop-input");
  const removeBtn = item.querySelector(".remove-stop-btn");

  if(input && value){
    input.value = value;
  }

  if(removeBtn){
    removeBtn.addEventListener("click",()=>{
      item.remove();
      renumberStops();
      hideAlert();
    });
  }

  stopsContainer.appendChild(item);
  renumberStops();

  setTimeout(()=>{
    if(input) input.focus();
  },30);
}

function getRequestedStops(){
  const stops =
    getStopInputs()
      .map(input => normalizeAddress(input.value))
      .filter(Boolean);

  const unique = [];
  const seen = new Set();

  stops.forEach(stop=>{
    const key = stop.toLowerCase().replace(/\s+/g," ").trim();

    if(seen.has(key)) return;

    seen.add(key);
    unique.push(stop);
  });

  return unique.slice(0,MAX_STOPS);
}

function lockStops(){
  if(addStopBtn) addStopBtn.disabled = true;
  getStopInputs().forEach(input=>input.disabled = true);
  document.querySelectorAll(".remove-stop-btn").forEach(btn=>{
    btn.disabled = true;
  });
}

/* ================= ROUTE BUILD ================= */

function buildOriginalRouteBeforeStart(trip){
  return [
    getPickup(trip),
    ...getExistingStops(trip),
    getDropoff(trip)
  ].filter(Boolean);
}

function buildNewRouteBeforeStart(trip,addedStops){
  return [
    getPickup(trip),
    ...getExistingStops(trip),
    ...addedStops,
    getDropoff(trip)
  ].filter(Boolean);
}

function buildOriginalRemainingRouteInProgress(driverLocation,trip){
  return [
    driverLocation,
    getDropoff(trip)
  ].filter(Boolean);
}

function buildNewRemainingRouteInProgress(driverLocation,trip,addedStops){
  return [
    driverLocation,
    ...addedStops,
    getDropoff(trip)
  ].filter(Boolean);
}

/* ================= CALCULATION ================= */

async function calculateAddStopNow(trip,addedStops){

  if(!addedStops.length){
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

  const inProgress = tripIsInProgress(trip);

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
        addedStops
      );

  }else{
    mode = "BEFORE_START";

    originalRoutePoints =
      buildOriginalRouteBeforeStart(trip);

    newRoutePoints =
      buildNewRouteBeforeStart(
        trip,
        addedStops
      );
  }

  const originalRoute =
    await calculateRouteMiles(originalRoutePoints);

  const newRoute =
    await calculateRouteMiles(newRoutePoints);

  const extraMiles =
    Math.max(
      0,
      Number((Number(newRoute.miles || 0) - Number(originalRoute.miles || 0)).toFixed(2))
    );

  return {
    mode,
    driverLocationAtConfirm,
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

  const res = await fetch(API_ADD_STOP_CONFIRM(tripId),{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok || data.success === false){
    throw new Error(data.message || "Failed to send added stop request");
  }

  return data;
}

/* ================= PAGE FILL ================= */

function fillPage(trip){
  if(tripNumberInput) tripNumberInput.value = trip.tripNumber || "";
  if(clientNameInput) clientNameInput.value = getClientName(trip) || "";
  if(pickupAddressInput) pickupAddressInput.value = getPickup(trip) || "";
  if(dropoffAddressInput) dropoffAddressInput.value = getDropoff(trip) || "";

  if(pageStatusBadge){
    pageStatusBadge.textContent = hasActiveStopRequest(trip)
      ? "Stop Request Active"
      : "Company Request";
  }

  if(hasActiveStopRequest(trip)){
    showAlert(
      "info",
      "This trip already has an active added stop request. Cancel it from the Review page before adding another one."
    );

    if(confirmAddStopBtn) confirmAddStopBtn.disabled = true;
    lockStops();
  }

  renumberStops();
}

/* ================= CONFIRM ================= */

async function handleConfirmSubmit(e){
  e.preventDefault();

  hideAlert();

  try{
    setButtonLoading(true,"Checking trip...");

    const freshTrip =
      await reloadFreshTrip();

    if(isSharedTrip(freshTrip)){
      throw new Error("Add Stop is not available for shared trips");
    }

    if(tripIsClosed(freshTrip)){
      throw new Error("This trip is closed and cannot be modified");
    }

    if(hasActiveStopRequest(freshTrip)){
      throw new Error("This trip already has an active stop request");
    }

    const addedStops =
      getRequestedStops();

    if(!addedStops.length){
      throw new Error("Please add at least one stop");
    }

    setButtonLoading(true,"Calculating miles...");

    const calc =
      await calculateAddStopNow(
        freshTrip,
        addedStops
      );

    setButtonLoading(true,"Sending to review...");

    const oldStops = getExistingStops(freshTrip);

    const payload = {
      tripId:String(freshTrip._id || tripId),

      source:"company-add-stop",
      requestType:"ADD_STOP",

      /*
        الصفحة دي لا تحسب فلوس.
        السعر يتحسب في Review page.
      */
      status:"PENDING_REVIEW",
      active:true,
      calculatePriceOnReview:true,

      companyName,
      tripNumber:freshTrip.tripNumber || "",
      clientName:getClientName(freshTrip),

      tripStatusAtConfirm:freshTrip.status || "",
      confirmedAt:getNowISO(),

      mode:calc.mode,

      addedStops,
      maxStops:MAX_STOPS,

      driverLocationAtConfirm:
        calc.driverLocationAtConfirm,

      beforeStopChange:{
        pickup:getPickup(freshTrip),
        dropoff:getDropoff(freshTrip),
        stops:oldStops,
        routePoints:Array.isArray(freshTrip.routePoints) ? freshTrip.routePoints : [],
        miles:Number(freshTrip.miles || 0)
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
    showAlert("error",err.message || "Failed to add stop");
  }finally{
    setButtonLoading(false);
    renumberStops();
  }
}

/* ================= EVENTS ================= */

if(addStopBtn){
  addStopBtn.addEventListener("click",()=>{
    createStopRow("");
  });
}

if(backBtn){
  backBtn.addEventListener("click",()=>{
    goBackToReview();
  });
}

if(form){
  form.addEventListener("submit",handleConfirmSubmit);
}

/* ================= INIT ================= */

async function init(){
  try{
    showLoading();
    hideAlert();

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
    showAlert("error",err.message || "Failed to load page");

    if(loadingBox){
      loadingBox.innerHTML = `
        <div style="font-weight:900;color:#991b1b;">
          ${err.message || "Failed to load page"}
        </div>
      `;
    }
  }
}

init();

})();