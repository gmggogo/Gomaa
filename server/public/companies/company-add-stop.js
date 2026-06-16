/* =========================================
FILE: company-add-stop.js
COMPANY ADD STOP - CLEAN BUILD
No editor under Submit
Root only inside stopsContainer
Confirm calculates route on click
========================================= */

(function(){

/* ================= SECURITY ================= */

const token =
  localStorage.getItem("token") || "";

const role =
  localStorage.getItem("role") || "";

const companyName =
  localStorage.getItem("name") ||
  localStorage.getItem("companyName") ||
  "";

if(!token || role !== "company"){
  window.location.href = "/companies/company-login.html";
  return;
}

/* ================= CONFIG ================= */

const params =
  new URLSearchParams(window.location.search);

const tripId =
  params.get("tripId") ||
  params.get("id") ||
  "";

const MAX_STOPS = 5;

const REVIEW_URL =
  "/companies/review.html";

const API_TRIP_BY_ID = id =>
  `/api/trips/${encodeURIComponent(id)}`;

const API_COMPANY_TRIPS = companyName
  ? `/api/trips/company/${encodeURIComponent(companyName)}`
  : "/api/trips/company";

const API_ADD_STOP_CONFIRM = id =>
  `/api/company/add-stop/${encodeURIComponent(id)}/confirm`;

const DRIVER_LOCATION_ENDPOINTS = id => [
  `/api/track-driver/trip/${encodeURIComponent(id)}`,
  `/api/trips/${encodeURIComponent(id)}/driver-location`,
  `/api/driver-location/trip/${encodeURIComponent(id)}`
];

/* ================= STATE ================= */

let trip = null;
let routeStops = [];
let originalStops = [];
let editorReady = false;
let googleDirectionsService = null;
let googleGeocoder = null;
let calculatedRoute = null;
let driverStartLocation = null;
let confirmedOnce = false;

/* ================= DOM HELPERS ================= */

function $(id){
  return document.getElementById(id);
}

function firstEl(ids){
  for(const id of ids){
    const el = $(id);
    if(el) return el;
  }
  return null;
}

const form =
  firstEl([
    "addStopForm",
    "companyAddStopForm",
    "routeForm",
    "companyForm"
  ]) ||
  document.querySelector("form");

const stopsContainer =
  firstEl([
    "stopsContainer",
    "routeStopsContainer",
    "addStopsContainer",
    "extraStopsContainer",
    "routeEditorContainer"
  ]);

const pageMessage =
  firstEl([
    "pageMessage",
    "addStopMessage",
    "messageBox",
    "companyMessage"
  ]);

const submitBtn =
  firstEl([
    "submitBtn",
    "confirmBtn",
    "confirmAddStopBtn",
    "addStopSubmitBtn"
  ]) ||
  document.querySelector("button[type='submit']");

const backBtn =
  firstEl([
    "backBtn",
    "cancelBtn",
    "goBackBtn"
  ]);

const tripNumberBox =
  firstEl([
    "tripNumber",
    "tripNumberBox",
    "tripIdBox"
  ]);

const clientNameBox =
  firstEl([
    "clientName",
    "passengerName",
    "nameBox"
  ]);

const pickupBox =
  firstEl([
    "pickupAddress",
    "pickupBox",
    "pickup"
  ]);

const dropoffBox =
  firstEl([
    "dropoffAddress",
    "dropoffBox",
    "dropoff"
  ]);

const dateBox =
  firstEl([
    "tripDate",
    "dateBox"
  ]);

const timeBox =
  firstEl([
    "tripTime",
    "timeBox"
  ]);

const milesBox =
  firstEl([
    "milesBox",
    "routeMiles",
    "calculatedMiles"
  ]);

const priceBox =
  firstEl([
    "priceBox",
    "extraPrice",
    "calculatedPrice"
  ]);

/* ================= BASIC HELPERS ================= */

function clean(v){
  return String(v ?? "").trim();
}

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function money(n){
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}

function miles(n){
  const num = Number(n || 0);
  return `${num.toFixed(2)} mi`;
}

function setMsg(msg,type="info"){
  if(!pageMessage) return;

  pageMessage.textContent = msg;
  pageMessage.className = `message ${type}`;
  pageMessage.style.display = msg ? "block" : "none";
}

function setLoading(isLoading,text){
  if(!submitBtn) return;

  submitBtn.disabled = !!isLoading;
  submitBtn.dataset.oldText =
    submitBtn.dataset.oldText ||
    submitBtn.textContent ||
    "Submit";

  submitBtn.textContent = isLoading
    ? (text || "Please wait...")
    : submitBtn.dataset.oldText;
}

async function fetchJSON(url,options={}){
  const res = await fetch(url,{
    ...options,
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  let data = null;

  try{
    data = await res.json();
  }catch(_){
    data = null;
  }

  if(!res.ok){
    throw new Error(
      data?.message ||
      data?.error ||
      `Request failed: ${res.status}`
    );
  }

  return data;
}

/* ================= TRIP HELPERS ================= */

function getTripId(t){
  return clean(
    t?._id ||
    t?.id ||
    t?.tripId ||
    t?.tripNumber ||
    ""
  );
}

function getTripNumber(t){
  return clean(
    t?.tripNumber ||
    t?.confirmationNumber ||
    t?.reservationNumber ||
    t?._id ||
    ""
  );
}

function getPickup(t){
  return clean(
    t?.pickup ||
    t?.pickupAddress ||
    t?.from ||
    t?.origin ||
    ""
  );
}

function getDropoff(t){
  return clean(
    t?.dropoff ||
    t?.dropoffAddress ||
    t?.to ||
    t?.destination ||
    ""
  );
}

function getTripDate(t){
  return clean(
    t?.date ||
    t?.tripDate ||
    t?.scheduledDate ||
    ""
  );
}

function getTripTime(t){
  return clean(
    t?.time ||
    t?.tripTime ||
    t?.scheduledTime ||
    ""
  );
}

function getClientName(t){
  return clean(
    t?.clientName ||
    t?.passengerName ||
    t?.name ||
    t?.customerName ||
    ""
  );
}

function normalizeStops(stops){
  if(!Array.isArray(stops)) return [];

  return stops
    .map((s,index)=>{
      if(typeof s === "string"){
        return {
          id:`old-${index}`,
          address:clean(s),
          old:true
        };
      }

      return {
        id:clean(s?.id || s?._id || `old-${index}`),
        address:clean(
          s?.address ||
          s?.stop ||
          s?.location ||
          s?.name ||
          ""
        ),
        old:true
      };
    })
    .filter(s=>s.address);
}

function isTripStarted(t){
  const status =
    clean(t?.status || t?.tripStatus || "")
    .toLowerCase();

  return [
    "started",
    "on trip",
    "on_trip",
    "ontrip",
    "picked up",
    "pickedup",
    "in progress",
    "in_progress"
  ].includes(status);
}

/* ================= CLEAN OLD BAD ROOTS ================= */

function removeEditorOutsideStopsContainer(){

  const roots =
    Array.from(document.querySelectorAll("#routeEditorRoot"));

  roots.forEach(root=>{

    if(!stopsContainer){
      root.remove();
      return;
    }

    if(!stopsContainer.contains(root)){
      root.remove();
    }

  });

}

/* ================= EDITOR ROOT ================= */

function getEditorRoot(){

  removeEditorOutsideStopsContainer();

  let root =
    stopsContainer
      ? stopsContainer.querySelector("#routeEditorRoot")
      : null;

  if(root) return root;

  root =
    document.createElement("div");

  root.id =
    "routeEditorRoot";

  root.className =
    "route-editor";

  /*
    ممنوع نهائيًا:
    form.appendChild(root)

    السبب:
    لما stopsContainer ميتقريش صح،
    الكود القديم كان بيرمي الـ editor تحت زرار Submit.
  */

  if(!stopsContainer){
    console.warn("stopsContainer not found - route editor was not added under Submit");
    return root;
  }

  stopsContainer.innerHTML = "";
  stopsContainer.appendChild(root);

  return root;
}

/* ================= ROUTE EDITOR ================= */

function makeStopId(){
  return `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addStopAfter(index){

  const used =
    routeStops.length;

  if(used >= MAX_STOPS){
    setMsg(`Maximum ${MAX_STOPS} stops allowed`,"error");
    return;
  }

  routeStops.splice(index + 1,0,{
    id:makeStopId(),
    address:"",
    old:false
  });

  calculatedRoute = null;
  renderRouteEditor();

  setTimeout(()=>{
    const inputs =
      document.querySelectorAll(".route-stop-input");

    const input =
      inputs[index + 1];

    if(input) input.focus();
  },30);

}

function removeStop(index){

  routeStops.splice(index,1);

  calculatedRoute = null;
  renderRouteEditor();

}

function updateStop(index,value){

  if(!routeStops[index]) return;

  routeStops[index].address = clean(value);
  calculatedRoute = null;

}

function updateDropoff(value){

  if(!trip) return;

  trip.dropoff =
    clean(value);

  trip.dropoffAddress =
    clean(value);

  calculatedRoute = null;

}

function renderRouteEditor(){

  const root =
    getEditorRoot();

  if(!stopsContainer) return;

  const pickup =
    getPickup(trip);

  const dropoff =
    getDropoff(trip);

  const stopCount =
    routeStops.length;

  root.innerHTML = `
    <div class="route-editor-box">

      <div class="route-title">
        Edit Route
      </div>

      <div class="route-line route-line-pickup">
        <div class="route-label">Pickup</div>
        <div class="route-value">${esc(pickup || "-")}</div>

        <button type="button" class="add-stop-btn" data-add-after="-1">
          + Add Stop
        </button>
      </div>

      <div class="route-stops-list">
        ${
          routeStops.length
          ? routeStops.map((stop,index)=>`
              <div class="route-line route-line-stop" data-stop-index="${index}">
                <div class="route-label">
                  ${stop.old ? "Existing Stop" : "New Stop"} ${index + 1}
                </div>

                <input
                  type="text"
                  class="route-stop-input"
                  value="${esc(stop.address)}"
                  placeholder="Stop address"
                  data-stop-input="${index}"
                />

                <div class="route-stop-actions">
                  <button type="button" class="add-stop-btn" data-add-after="${index}">
                    + Add Stop
                  </button>

                  <button type="button" class="remove-stop-btn" data-remove-stop="${index}">
                    Remove
                  </button>
                </div>
              </div>
            `).join("")
          : `
            <div class="empty-stops">
              No stops added yet
            </div>
          `
        }
      </div>

      <div class="route-line route-line-dropoff">
        <div class="route-label">Dropoff</div>

        <input
          type="text"
          id="editableDropoffInput"
          class="route-dropoff-input"
          value="${esc(dropoff)}"
          placeholder="Dropoff address"
        />
      </div>

      <div class="route-summary">
        <div>Stops: <b>${stopCount}</b> / ${MAX_STOPS}</div>
        <div id="liveRouteMiles">
          ${
            calculatedRoute
            ? `Miles: <b>${miles(calculatedRoute.miles)}</b>`
            : `Miles calculated when you confirm`
          }
        </div>
        <div id="liveRoutePrice">
          ${
            calculatedRoute
            ? `Extra Cost: <b>${money(calculatedRoute.price)}</b>`
            : `Price calculated when you confirm`
          }
        </div>
      </div>

    </div>
  `;

  bindRouteEditorEvents();

}

function bindRouteEditorEvents(){

  const root =
    getEditorRoot();

  root.querySelectorAll("[data-add-after]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const index =
        Number(btn.dataset.addAfter);
      addStopAfter(index);
    });
  });

  root.querySelectorAll("[data-remove-stop]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const index =
        Number(btn.dataset.removeStop);
      removeStop(index);
    });
  });

  root.querySelectorAll("[data-stop-input]").forEach(input=>{
    input.addEventListener("input",()=>{
      const index =
        Number(input.dataset.stopInput);
      updateStop(index,input.value);
    });

    input.addEventListener("change",()=>{
      const index =
        Number(input.dataset.stopInput);
      updateStop(index,input.value);
      input.value = clean(input.value);
    });
  });

  const dropoffInput =
    root.querySelector("#editableDropoffInput");

  if(dropoffInput){
    dropoffInput.addEventListener("input",()=>{
      updateDropoff(dropoffInput.value);
    });

    dropoffInput.addEventListener("change",()=>{
      updateDropoff(dropoffInput.value);
      dropoffInput.value = clean(dropoffInput.value);
    });
  }

}

/* ================= GOOGLE HELPERS ================= */

function initGoogle(){

  if(window.google?.maps){
    googleDirectionsService =
      googleDirectionsService ||
      new google.maps.DirectionsService();

    googleGeocoder =
      googleGeocoder ||
      new google.maps.Geocoder();

    return true;
  }

  return false;
}

function geocodeAddress(address){
  return new Promise((resolve,reject)=>{

    if(!initGoogle()){
      reject(new Error("Google Maps is not loaded"));
      return;
    }

    googleGeocoder.geocode(
      { address },
      (results,status)=>{
        if(status === "OK" && results && results[0]){
          const loc =
            results[0].geometry.location;

          resolve({
            lat:loc.lat(),
            lng:loc.lng(),
            formatted:results[0].formatted_address
          });

          return;
        }

        reject(new Error(`Could not geocode address: ${address}`));
      }
    );

  });
}

function haversineMiles(a,b){

  const R = 3958.8;

  const lat1 = Number(a.lat);
  const lon1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lon2 = Number(b.lng);

  const dLat =
    (lat2 - lat1) * Math.PI / 180;

  const dLon =
    (lon2 - lon1) * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c =
    2 * Math.atan2(Math.sqrt(x),Math.sqrt(1 - x));

  return R * c;
}

async function calculateFallbackRoute(addresses){

  const points = [];

  for(const address of addresses){
    points.push(await geocodeAddress(address));
  }

  let totalMiles = 0;

  for(let i = 0; i < points.length - 1; i++){
    totalMiles += haversineMiles(points[i],points[i + 1]);
  }

  return {
    miles:totalMiles,
    minutes:Math.round(totalMiles * 2.4),
    source:"fallback"
  };

}

function calculateGoogleRoute(addresses){

  return new Promise((resolve,reject)=>{

    if(!initGoogle()){
      reject(new Error("Google Maps is not loaded"));
      return;
    }

    if(addresses.length < 2){
      reject(new Error("Route needs pickup and dropoff"));
      return;
    }

    const origin =
      addresses[0];

    const destination =
      addresses[addresses.length - 1];

    const waypoints =
      addresses
        .slice(1,-1)
        .map(address=>({
          location:address,
          stopover:true
        }));

    googleDirectionsService.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints:false,
        travelMode:google.maps.TravelMode.DRIVING
      },
      (result,status)=>{

        if(status !== "OK" || !result?.routes?.[0]){
          reject(new Error("Could not calculate route"));
          return;
        }

        const legs =
          result.routes[0].legs || [];

        const meters =
          legs.reduce((sum,leg)=>sum + Number(leg.distance?.value || 0),0);

        const seconds =
          legs.reduce((sum,leg)=>sum + Number(leg.duration?.value || 0),0);

        resolve({
          miles:meters / 1609.344,
          minutes:Math.round(seconds / 60),
          source:"google"
        });

      }
    );

  });

}

/* ================= DRIVER LOCATION ================= */

async function loadDriverStartLocation(){

  if(!trip || !isTripStarted(trip)){
    return null;
  }

  if(driverStartLocation){
    return driverStartLocation;
  }

  const id =
    getTripId(trip);

  for(const url of DRIVER_LOCATION_ENDPOINTS(id)){

    try{

      const data =
        await fetchJSON(url);

      const lat =
        data?.lat ||
        data?.latitude ||
        data?.location?.lat ||
        data?.driver?.lat ||
        data?.driverLocation?.lat;

      const lng =
        data?.lng ||
        data?.longitude ||
        data?.location?.lng ||
        data?.driver?.lng ||
        data?.driverLocation?.lng;

      if(lat && lng){
        driverStartLocation = {
          lat:Number(lat),
          lng:Number(lng)
        };

        return driverStartLocation;
      }

    }catch(_){}

  }

  return null;

}

/* ================= PRICE ================= */

function estimateExtraPrice(newMiles){

  const oldMiles =
    Number(
      trip?.miles ||
      trip?.distanceMiles ||
      trip?.routeMiles ||
      0
    );

  const extraMiles =
    Math.max(0,Number(newMiles || 0) - oldMiles);

  const service =
    trip?.service ||
    trip?.serviceData ||
    {};

  const perMile =
    Number(
      trip?.companyPerMile ||
      trip?.perMile ||
      service?.companyPerMile ||
      service?.perMile ||
      0
    );

  const stopFee =
    Number(
      trip?.companyStopFee ||
      trip?.stopFee ||
      service?.companyStopFee ||
      service?.stopFee ||
      0
    );

  const oldStopCount =
    originalStops.length;

  const extraStopCount =
    Math.max(0,routeStops.length - oldStopCount);

  const price =
    (extraMiles * perMile) +
    (extraStopCount * stopFee);

  return Math.max(0,price);

}

/* ================= ROUTE CALCULATION ================= */

function getRouteAddresses(){

  const pickup =
    getPickup(trip);

  const dropoff =
    getDropoff(trip);

  const stops =
    routeStops
      .map(s=>clean(s.address))
      .filter(Boolean);

  return [
    pickup,
    ...stops,
    dropoff
  ].filter(Boolean);

}

async function calculateRouteNow(){

  const addresses =
    getRouteAddresses();

  if(addresses.length < 2){
    throw new Error("Pickup and dropoff are required");
  }

  for(const s of routeStops){
    if(!clean(s.address)){
      throw new Error("Please fill all stop addresses or remove empty stops");
    }
  }

  if(!getDropoff(trip)){
    throw new Error("Dropoff address is required");
  }

  let start =
    addresses[0];

  const driverLocation =
    await loadDriverStartLocation();

  if(driverLocation){
    start =
      new google.maps.LatLng(
        driverLocation.lat,
        driverLocation.lng
      );
  }

  const calcAddresses =
    [
      start,
      ...addresses.slice(1)
    ];

  let routeResult = null;

  try{
    routeResult =
      await calculateGoogleRoute(calcAddresses);
  }catch(_){
    routeResult =
      await calculateFallbackRoute(addresses);
  }

  const price =
    estimateExtraPrice(routeResult.miles);

  calculatedRoute = {
    miles:Number(routeResult.miles || 0),
    minutes:Number(routeResult.minutes || 0),
    price:Number(price || 0),
    source:routeResult.source || "system"
  };

  updateCalculatedUI();

  return calculatedRoute;

}

function updateCalculatedUI(){

  if(!calculatedRoute) return;

  if(milesBox){
    milesBox.textContent =
      miles(calculatedRoute.miles);
  }

  if(priceBox){
    priceBox.textContent =
      money(calculatedRoute.price);
  }

  const liveMiles =
    $("liveRouteMiles");

  const livePrice =
    $("liveRoutePrice");

  if(liveMiles){
    liveMiles.innerHTML =
      `Miles: <b>${miles(calculatedRoute.miles)}</b>`;
  }

  if(livePrice){
    livePrice.innerHTML =
      `Extra Cost: <b>${money(calculatedRoute.price)}</b>`;
  }

}

/* ================= LOAD TRIP ================= */

async function loadTrip(){

  if(!tripId){
    throw new Error("Missing trip id");
  }

  try{

    const data =
      await fetchJSON(API_TRIP_BY_ID(tripId));

    trip =
      data?.trip ||
      data?.data ||
      data;

    if(trip && getTripId(trip)){
      return trip;
    }

  }catch(_){}

  const listData =
    await fetchJSON(API_COMPANY_TRIPS);

  const list =
    Array.isArray(listData)
      ? listData
      : Array.isArray(listData?.trips)
        ? listData.trips
        : Array.isArray(listData?.data)
          ? listData.data
          : [];

  trip =
    list.find(t =>
      getTripId(t) === tripId ||
      getTripNumber(t) === tripId
    );

  if(!trip){
    throw new Error("Trip not found");
  }

  return trip;

}

/* ================= PAGE RENDER ================= */

function renderTripInfo(){

  if(tripNumberBox){
    tripNumberBox.textContent =
      getTripNumber(trip) || "-";
  }

  if(clientNameBox){
    clientNameBox.textContent =
      getClientName(trip) || "-";
  }

  if(pickupBox){
    pickupBox.textContent =
      getPickup(trip) || "-";
  }

  if(dropoffBox){
    dropoffBox.textContent =
      getDropoff(trip) || "-";
  }

  if(dateBox){
    dateBox.textContent =
      getTripDate(trip) || "-";
  }

  if(timeBox){
    timeBox.textContent =
      getTripTime(trip) || "-";
  }

}

function prepareStops(){

  originalStops =
    normalizeStops(
      trip?.stops ||
      trip?.extraStops ||
      trip?.routeStops ||
      []
    );

  routeStops =
    originalStops.map(s=>({
      ...s,
      old:true
    }));

}

/* ================= CONFIRM ================= */

function buildConfirmPayload(){

  return {
    tripId:getTripId(trip),

    pickup:getPickup(trip),

    dropoff:getDropoff(trip),

    stops:routeStops
      .map((s,index)=>({
        index:index + 1,
        address:clean(s.address),
        old:!!s.old
      }))
      .filter(s=>s.address),

    miles:Number(calculatedRoute?.miles || 0),
    minutes:Number(calculatedRoute?.minutes || 0),
    extraPrice:Number(calculatedRoute?.price || 0),

    routeSource:
      calculatedRoute?.source || "system",

    driverStartLocation:
      driverStartLocation || null,

    editedByCompany:true,

    companyName:
      companyName || "",

    requestedAt:
      new Date().toISOString()
  };

}

async function confirmAddStops(event){

  if(event){
    event.preventDefault();
    event.stopPropagation();
  }

  if(confirmedOnce) return;

  try{

    confirmedOnce = true;
    setLoading(true,"Calculating...");
    setMsg("Calculating route...","info");

    await calculateRouteNow();

    setLoading(true,"Confirming...");
    setMsg("Saving changes...","info");

    const id =
      getTripId(trip);

    const payload =
      buildConfirmPayload();

    await fetchJSON(
      API_ADD_STOP_CONFIRM(id),
      {
        method:"POST",
        body:JSON.stringify(payload)
      }
    );

    setMsg("Route updated successfully","success");

    setTimeout(()=>{
      window.location.href = REVIEW_URL;
    },500);

  }catch(err){

    confirmedOnce = false;
    setLoading(false);
    setMsg(err.message || "Failed to update route","error");

  }

}

/* ================= EVENTS ================= */

function bindEvents(){

  if(form){
    form.addEventListener("submit",confirmAddStops);
  }

  if(submitBtn){
    submitBtn.addEventListener("click",confirmAddStops);
  }

  if(backBtn){
    backBtn.addEventListener("click",()=>{
      window.location.href = REVIEW_URL;
    });
  }

}

/* ================= BOOT ================= */

async function boot(){

  try{

    removeEditorOutsideStopsContainer();

    setMsg("Loading trip...","info");

    initGoogle();

    await loadTrip();

    prepareStops();

    renderTripInfo();

    renderRouteEditor();

    bindEvents();

    editorReady = true;

    setMsg("", "info");

  }catch(err){

    console.error(err);

    setMsg(
      err.message || "Failed to load trip",
      "error"
    );

  }

}

document.addEventListener("DOMContentLoaded",boot);

})();