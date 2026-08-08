/* =====================================================
   DRIVER MAP V1
   - Google map display only
   - NO Directions API / NO geocoding
   - External Directions button opens Google Maps
   - Shared pickup groups share ONE timer when pickup is the same
   - Different pickup locations get separate timers
   - Route order is taken from saved server order
===================================================== */

console.log("Driver map V1 shared pickup groups");

const rawDriver =
  localStorage.getItem("loggedDriver") ||
  localStorage.getItem("user");

if(!rawDriver){
  window.location.href = "/driver/login.html";
}

let driver = {};

try{
  driver = JSON.parse(rawDriver);
}catch(err){
  window.location.href = "/driver/login.html";
}

const DRIVER_ID =
  String(driver._id || driver.id || "");

const DRIVER_NAME =
  driver.name || driver.username || "Driver";

const params =
  new URLSearchParams(window.location.search);

const TRIP_ID =
  String(params.get("tripId") || "");

/* =========================
   TEMP SETTINGS
   Later these come from Admin
========================= */

const DRIVER_EXECUTION_SETTINGS = {
  waitTimerEnabled:true,
  waitMinutes:10,
  noShowRequiresTimer:true,
  noShowRequiresCall:true,
  autoArriveEnabled:false,
  pickupArrivalRadiusMiles:0.15,
  dropoffCompleteRadiusMiles:0.10
};

function waitDurationSeconds(){
  return Math.max(
    0,
    Number(DRIVER_EXECUTION_SETTINGS.waitMinutes || 0) * 60
  );
}

/* =========================
   DOM
========================= */

const navTextEl = document.getElementById("navText");
const gpsBadge = document.getElementById("gpsBadge");
const mapEl = document.getElementById("map");
const currentStopAddressEl = document.getElementById("currentStopAddress");
const currentPassengersEl = document.getElementById("currentPassengers");
const stopTypeBadge = document.getElementById("stopTypeBadge");
const stopProgress = document.getElementById("stopProgress");
const stopStatusText = document.getElementById("stopStatusText");
const waitTimerEl = document.getElementById("waitTimer");

const recenterBtn = document.getElementById("recenterBtn");
const btnGoogle = document.getElementById("btnGoogle");
const btnArrived = document.getElementById("btnArrived");
const btnCallClient = document.getElementById("btnCallClient");
const btnStart = document.getElementById("btnStart");
const btnNoShow = document.getElementById("btnNoShow");
const btnCompleteStop = document.getElementById("btnCompleteStop");

const noShowBox = document.getElementById("noShowBox");
const btnCloseNoShow = document.getElementById("btnCloseNoShow");
const noShowNotes = document.getElementById("noShowNotes");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");

/* =========================
   GLOBAL STATE
========================= */

let tripDoc = null;
let appConfig = {};
let systemDesign = {};

let map = null;
let driverMarker = null;
let stopMarker = null;
let routeLine = null;

let driverLat = null;
let driverLng = null;
let watchId = null;
let firstGpsFix = true;
let userMovedMap = false;

let routeStops = [];
let currentStopIndex = 0;

let waitInterval = null;
let serverOffset = 0;

let lastSentLocationAt = 0;
let lastSentLat = null;
let lastSentLng = null;

const LOCATION_PUSH_MS = 20000;
const LOCATION_PUSH_MILES = 0.25;

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function num(v,d=null){
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function esc(v){
  return clean(v)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function firstValue(...values){
  for(const value of values){
    if(value !== undefined && value !== null && clean(value)!==""){
      return value;
    }
  }
  return "";
}

function serverNow(){
  return Date.now() + serverOffset;
}

function parseTimeValue(v){
  if(!v) return null;
  if(typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}

function setNavText(text){
  if(navTextEl) navTextEl.textContent = text;
}

function setStopStatus(text){
  if(stopStatusText) stopStatusText.textContent = text;
}

function show(el,display="block"){
  if(el) el.style.display = display;
}

function hide(el){
  if(el) el.style.display = "none";
}

function formatTimer(sec){
  const safe = Math.max(0,Math.floor(sec));
  const m = Math.floor(safe/60);
  const s = safe%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function distanceMiles(lat1,lon1,lat2,lon2){
  const R=3958.8;
  const dLat=((lat2-lat1)*Math.PI)/180;
  const dLon=((lon2-lon1)*Math.PI)/180;
  const a=
    Math.sin(dLat/2)**2+
    Math.cos(lat1*Math.PI/180)*
    Math.cos(lat2*Math.PI/180)*
    Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function sameCoordinate(a,b){
  if(!a || !b) return false;
  if(!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return false;
  if(!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false;

  /*
    Treat locations within ~100 feet as the same physical pickup.
    Later the server addressKey should be the primary match.
  */
  return distanceMiles(a.lat,a.lng,b.lat,b.lng) <= 0.02;
}

function normalizeAddressKey(v){
  return clean(v)
    .toLowerCase()
    .replace(/[.,#]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

/* =========================
   DRIVER / PASSENGER DATA
========================= */

function isSharedTrip(t){
  const c = clean(
    firstValue(
      t?.serviceCode,
      t?.serviceKey,
      t?.serviceType,
      t?.tripType
    )
  ).toUpperCase();

  return (
    t?.isShared === true ||
    t?.shared === true ||
    c === "SH" ||
    c === "SHARED" ||
    (Array.isArray(t?.passengers) && t.passengers.length > 1)
  );
}

function passengerId(p,index){
  return String(
    firstValue(
      p?.passengerId,
      p?._id,
      p?.id,
      index
    )
  );
}

function passengerName(p,index){
  return clean(
    firstValue(
      p?.clientName,
      p?.passengerName,
      p?.memberName,
      p?.name,
      `Passenger ${index+1}`
    )
  );
}

function passengerPhone(p){
  return clean(
    firstValue(
      p?.clientPhone,
      p?.passengerPhone,
      p?.memberPhone,
      p?.phone
    )
  );
}

function passengerPickup(p,t){
  return clean(
    firstValue(
      p?.pickup,
      p?.pickupAddress,
      t?.pickup,
      t?.pickupAddress
    )
  );
}

function passengerDropoff(p,t){
  return clean(
    firstValue(
      p?.dropoff,
      p?.dropoffAddress,
      t?.dropoff,
      t?.dropoffAddress
    )
  );
}

function pickupPoint(p,t){
  return {
    lat:num(firstValue(p?.pickupLat,p?.pickupLatitude,t?.pickupLat,t?.pickupLatitude)),
    lng:num(firstValue(p?.pickupLng,p?.pickupLongitude,t?.pickupLng,t?.pickupLongitude))
  };
}

function dropoffPoint(p,t){
  return {
    lat:num(firstValue(p?.dropoffLat,p?.dropLat,p?.dropoffLatitude,t?.dropoffLat,t?.dropLat)),
    lng:num(firstValue(p?.dropoffLng,p?.dropLng,p?.dropoffLongitude,t?.dropoffLng,t?.dropLng))
  };
}

function getPassengers(t){

  if(Array.isArray(t?.passengers) && t.passengers.length){
    return t.passengers;
  }

  return [{
    passengerId:"single",
    clientName:firstValue(t?.clientName,t?.passengerName,t?.name,"Passenger"),
    clientPhone:firstValue(t?.clientPhone,t?.phone),
    pickup:firstValue(t?.pickup,t?.pickupAddress),
    dropoff:firstValue(t?.dropoff,t?.dropoffAddress),
    pickupLat:t?.pickupLat,
    pickupLng:t?.pickupLng,
    dropoffLat:firstValue(t?.dropoffLat,t?.dropLat),
    dropoffLng:firstValue(t?.dropoffLng,t?.dropLng),
    pickupOrder:1,
    dropoffOrder:2
  }];
}

/* =========================
   BUILD SERVER-ORDER STOPS
========================= */

function getPickupGroupIdentity(p,t){

  const explicit =
    clean(
      firstValue(
        p?.pickupGroupId,
        p?.pickupStopId,
        p?.pickupAddressKey,
        p?.addressKey
      )
    );

  if(explicit){
    return `KEY:${explicit.toLowerCase()}`;
  }

  const address =
    normalizeAddressKey(
      passengerPickup(p,t)
    );

  const point =
    pickupPoint(p,t);

  return {
    explicit:"",
    address,
    point
  };
}

function pickupGroupsMatch(group,p,t){

  const identity =
    getPickupGroupIdentity(p,t);

  if(typeof identity === "string"){
    return group.identity === identity;
  }

  if(group.identity && group.identity.startsWith("KEY:")){
    return false;
  }

  if(
    identity.address &&
    group.address &&
    identity.address === group.address
  ){
    return true;
  }

  if(
    sameCoordinate(
      group.point,
      identity.point
    )
  ){
    return true;
  }

  return false;
}

function buildRouteStops(t){

  const passengers =
    getPassengers(t);

  const pickupGroups = [];
  const dropoffs = [];

  passengers.forEach((p,index)=>{

    const pId =
      passengerId(p,index);

    const pName =
      passengerName(p,index);

    const phone =
      passengerPhone(p);

    const pickupAddress =
      passengerPickup(p,t);

    const dropoffAddress =
      passengerDropoff(p,t);

    const pPoint =
      pickupPoint(p,t);

    const dPoint =
      dropoffPoint(p,t);

    const pickupOrder =
      num(firstValue(p?.pickupOrder,p?.pickupSequence),index*2+1);

    const dropoffOrder =
      num(firstValue(p?.dropoffOrder,p?.dropoffSequence),index*2+2);

    let group =
      pickupGroups.find(g=>
        pickupGroupsMatch(g,p,t)
      );

    if(!group){

      const identity =
        getPickupGroupIdentity(p,t);

      group = {
        stopId:`pickup-${pickupGroups.length+1}`,
        type:"pickup",
        order:pickupOrder,
        address:pickupAddress,
        lat:pPoint.lat,
        lng:pPoint.lng,
        addressKey:
          typeof identity === "string"
            ? identity
            : identity.address,
        identity:
          typeof identity === "string"
            ? identity
            : "",
        address:
          pickupAddress,
        point:pPoint,
        passengers:[],
        arrivedAt:null,
        waitStartedAt:null,
        completed:false
      };

      pickupGroups.push(group);

    }else{
      group.order = Math.min(group.order,pickupOrder);
    }

    group.passengers.push({
      passengerId:pId,
      name:pName,
      phone,
      status:clean(p?.status || "Scheduled"),
      noShowReason:clean(p?.noShowReason || ""),
      sourceIndex:index
    });

    dropoffs.push({
      stopId:`dropoff-${pId}`,
      type:"dropoff",
      order:dropoffOrder,
      address:dropoffAddress,
      lat:dPoint.lat,
      lng:dPoint.lng,
      passengers:[{
        passengerId:pId,
        name:pName,
        phone,
        status:clean(p?.status || "Scheduled"),
        sourceIndex:index
      }],
      completed:false
    });

  });

  /*
    Server order wins.
    Grouped pickups use the earliest pickupOrder of the passengers at that location.
  */
  return [...pickupGroups,...dropoffs]
    .sort((a,b)=>
      a.order-b.order ||
      (a.type==="pickup" ? -1 : 1)
    );
}

/* =========================
   STOP STATE
========================= */

function currentStop(){
  return routeStops[currentStopIndex] || null;
}

function activePassengersForStop(stop){
  if(!stop) return [];

  return stop.passengers.filter(p=>{
    const s = clean(p.status).toLowerCase().replace(/\s+/g,"");
    return !["noshow","cancelled","canceled","completed"].includes(s);
  });
}

function stopStateKey(stop){
  return `driver_stop_state_${TRIP_ID}_${stop?.stopId || "none"}`;
}

function loadStopLocalState(stop){

  if(!stop) return {};

  try{
    return JSON.parse(
      localStorage.getItem(stopStateKey(stop)) || "{}"
    );
  }catch{
    return {};
  }
}

function saveStopLocalState(stop,patch={}){

  if(!stop) return;

  const old =
    loadStopLocalState(stop);

  localStorage.setItem(
    stopStateKey(stop),
    JSON.stringify({
      ...old,
      ...patch,
      stopId:stop.stopId,
      tripId:TRIP_ID
    })
  );
}

function restoreStopProgress(){

  for(let i=0;i<routeStops.length;i++){

    const s =
      loadStopLocalState(routeStops[i]);

    if(s.completed !== true){
      currentStopIndex = i;
      return;
    }
  }

  currentStopIndex =
    Math.max(0,routeStops.length-1);
}

function advanceStop(){

  const stop =
    currentStop();

  if(stop){
    saveStopLocalState(stop,{
      completed:true,
      completedAt:serverNow()
    });
  }

  stopTimer();

  if(currentStopIndex < routeStops.length-1){
    currentStopIndex++;
    renderCurrentStop();
    updateMapTarget();
    return;
  }

  setNavText("Route complete");
  setStopStatus("All route stops finished");

  hide(btnArrived);
  hide(btnStart);
  hide(btnNoShow);
  hide(btnCallClient);
  hide(btnCompleteStop);
}

/* =========================
   TIMER PER PICKUP GROUP
========================= */

function getWaitStart(stop){

  const state =
    loadStopLocalState(stop);

  return (
    parseTimeValue(state.waitStartedAt) ||
    parseTimeValue(state.arrivedAt) ||
    null
  );
}

function getWaitRemaining(stop){

  if(!DRIVER_EXECUTION_SETTINGS.waitTimerEnabled){
    return 0;
  }

  const start =
    getWaitStart(stop);

  if(!start){
    return waitDurationSeconds();
  }

  const elapsed =
    Math.floor(
      (serverNow()-start)/1000
    );

  return Math.max(
    0,
    waitDurationSeconds()-elapsed
  );
}

function timerExpired(stop){

  if(!DRIVER_EXECUTION_SETTINGS.waitTimerEnabled){
    return true;
  }

  return getWaitRemaining(stop) <= 0;
}

function stopTimer(){

  if(waitInterval){
    clearInterval(waitInterval);
    waitInterval = null;
  }

  hide(waitTimerEl);
}

function startPickupGroupTimer(stop){

  if(!stop || stop.type!=="pickup"){
    return;
  }

  if(!DRIVER_EXECUTION_SETTINGS.waitTimerEnabled){
    hide(waitTimerEl);
    renderButtons();
    return;
  }

  let state =
    loadStopLocalState(stop);

  if(!state.waitStartedAt){

    saveStopLocalState(stop,{
      arrived:true,
      arrivedAt:state.arrivedAt || serverNow(),
      waitStartedAt:serverNow()
    });

  }

  show(waitTimerEl);

  if(waitInterval){
    clearInterval(waitInterval);
  }

  const tick = ()=>{

    const remaining =
      getWaitRemaining(stop);

    waitTimerEl.textContent =
      remaining > 0
        ? formatTimer(remaining)
        : "TIME UP";

    renderButtons();

    if(remaining<=0 && waitInterval){
      clearInterval(waitInterval);
      waitInterval = null;
    }

  };

  tick();
  waitInterval=setInterval(tick,1000);
}

/* =========================
   RENDER
========================= */

function renderPassengers(stop){

  if(!currentPassengersEl) return;

  const passengers =
    activePassengersForStop(stop);

  currentPassengersEl.innerHTML =
    passengers.map(p=>`
      <div class="passenger-chip">
        <strong>${esc(p.name)}</strong>
        <span>${esc(p.phone || "No phone")}</span>
      </div>
    `).join("");
}

function renderCurrentStop(){

  const stop =
    currentStop();

  if(!stop){
    setNavText("No active stop");
    return;
  }

  const state =
    loadStopLocalState(stop);

  if(stopTypeBadge){
    stopTypeBadge.textContent =
      stop.type === "pickup"
        ? "PICKUP"
        : "DROPOFF";

    stopTypeBadge.classList.toggle(
      "dropoff",
      stop.type === "dropoff"
    );
  }

  if(stopProgress){
    stopProgress.textContent =
      `Stop ${currentStopIndex+1} of ${routeStops.length}`;
  }

  if(currentStopAddressEl){
    currentStopAddressEl.textContent =
      stop.address || "Address unavailable";
  }

  renderPassengers(stop);

  if(stop.type==="pickup"){

    if(state.pickedUp){
      setNavText("Pickup completed");
      setStopStatus("Moving to next stop");
    }else if(state.arrived){

      if(timerExpired(stop)){
        setNavText("Pickup waiting time finished");
        setStopStatus("Choose Picked Up or No Show");
      }else{
        setNavText("Waiting for passenger");
        setStopStatus(
          activePassengersForStop(stop).length > 1
            ? "One timer for this shared pickup location"
            : "Passenger wait timer running"
        );
      }

    }else{
      setNavText("Go to pickup");
      setStopStatus(
        activePassengersForStop(stop).length > 1
          ? `${activePassengersForStop(stop).length} passengers at this pickup`
          : "Drive to current pickup"
      );
    }

  }else{

    setNavText("Go to dropoff");
    setStopStatus("Complete this dropoff to continue");
  }

  renderButtons();

  if(stop.type==="pickup" && state.arrived){
    startPickupGroupTimer(stop);
  }else{
    stopTimer();
  }
}

function renderButtons(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  const state =
    loadStopLocalState(stop);

  show(btnGoogle);

  hide(btnArrived);
  hide(btnCallClient);
  hide(btnStart);
  hide(btnNoShow);
  hide(btnCompleteStop);

  if(stop.type==="dropoff"){
    show(btnCompleteStop);
    return;
  }

  if(!state.arrived){
    show(btnArrived);
    return;
  }

  const active =
    activePassengersForStop(stop);

  if(!active.length){
    advanceStop();
    return;
  }

  const canNoShowByTimer =
    !DRIVER_EXECUTION_SETTINGS.noShowRequiresTimer ||
    timerExpired(stop);

  const called =
    state.called === true;

  if(
    DRIVER_EXECUTION_SETTINGS.noShowRequiresCall &&
    canNoShowByTimer &&
    !called
  ){
    show(btnCallClient);
  }

  show(btnStart);

  if(
    canNoShowByTimer &&
    (
      !DRIVER_EXECUTION_SETTINGS.noShowRequiresCall ||
      called
    )
  ){
    show(btnNoShow);
  }
}

/* =========================
   MAP
========================= */

function createMarkerIcon(color){
  return {
    path:google.maps.SymbolPath.CIRCLE,
    fillColor:color,
    fillOpacity:1,
    strokeColor:"#fff",
    strokeWeight:3,
    scale:10
  };
}

function currentTargetPoint(){

  const stop =
    currentStop();

  if(!stop) return null;

  if(
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lng)
  ){
    return {
      lat:stop.lat,
      lng:stop.lng
    };
  }

  return null;
}

function initMap(){

  const target =
    currentTargetPoint();

  map =
    new google.maps.Map(
      mapEl,
      {
        center:
          target || {
            lat:33.4484,
            lng:-112.0740
          },
        zoom:15,
        mapTypeId:"roadmap",
        streetViewControl:false,
        fullscreenControl:false,
        mapTypeControl:false,
        clickableIcons:false,
        gestureHandling:"greedy"
      }
    );

  map.addListener("dragstart",()=>{
    userMovedMap=true;
  });

  map.addListener("zoom_changed",()=>{
    if(!firstGpsFix){
      userMovedMap=true;
    }
  });

  updateMapTarget();
  startGpsWatch();
}

function updateMapTarget(){

  if(!map){
    return;
  }

  const stop =
    currentStop();

  if(stopMarker){
    stopMarker.setMap(null);
    stopMarker=null;
  }

  const target =
    currentTargetPoint();

  if(target){

    stopMarker =
      new google.maps.Marker({
        position:target,
        map,
        title:
          stop?.type==="pickup"
            ? "Pickup"
            : "Dropoff",
        label:{
          text:
            stop?.type==="pickup"
              ? "P"
              : "D",
          color:"#fff",
          fontWeight:"900"
        },
        icon:createMarkerIcon(
          stop?.type==="pickup"
            ? "#2563eb"
            : "#16a34a"
        )
      });

  }

  drawStraightLine();

  if(!userMovedMap){
    fitMap();
  }
}

function updateDriverMarker(lat,lng){

  if(!map) return;

  const pos={lat,lng};

  if(!driverMarker){

    driverMarker =
      new google.maps.Marker({
        position:pos,
        map,
        title:"Driver",
        icon:createMarkerIcon("#f59e0b")
      });

  }else{
    driverMarker.setPosition(pos);
  }
}

function drawStraightLine(){

  if(!map) return;

  if(routeLine){
    routeLine.setMap(null);
    routeLine=null;
  }

  const target =
    currentTargetPoint();

  if(
    !target ||
    !Number.isFinite(driverLat) ||
    !Number.isFinite(driverLng)
  ){
    return;
  }

  routeLine =
    new google.maps.Polyline({
      path:[
        {lat:driverLat,lng:driverLng},
        target
      ],
      geodesic:true,
      strokeColor:
        currentStop()?.type==="pickup"
          ? "#2563eb"
          : "#16a34a",
      strokeOpacity:.90,
      strokeWeight:5,
      map
    });
}

function fitMap(){

  if(!map) return;

  const bounds =
    new google.maps.LatLngBounds();

  let count=0;

  if(
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng)
  ){
    bounds.extend({
      lat:driverLat,
      lng:driverLng
    });
    count++;
  }

  const target =
    currentTargetPoint();

  if(target){
    bounds.extend(target);
    count++;
  }

  if(count>=2){
    map.fitBounds(bounds,70);
  }else if(target){
    map.setCenter(target);
    map.setZoom(15);
  }
}

/* =========================
   GOOGLE EXTERNAL DIRECTIONS
   No Directions API request
========================= */

function openGoogleMaps(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  const target =
    currentTargetPoint();

  let destination="";

  if(target){
    destination=`${target.lat},${target.lng}`;
  }else if(stop.address){
    destination=encodeURIComponent(stop.address);
  }else{
    alert("Destination not found");
    return;
  }

  let origin="";

  if(
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng)
  ){
    origin=`&origin=${driverLat},${driverLng}`;
  }

  const url =
    `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`;

  window.open(url,"_blank");
}

/* =========================
   SERVER / API
========================= */

async function syncServerClock(){

  try{
    const res =
      await fetch("/api/config",{cache:"no-store"});

    const h =
      res.headers.get("date");

    if(h){
      const parsed=new Date(h).getTime();
      if(Number.isFinite(parsed)){
        serverOffset=parsed-Date.now();
      }
    }
  }catch{}
}

async function loadAppConfig(){

  try{
    const res =
      await fetch("/api/config",{cache:"no-store"});

    if(res.ok){
      appConfig=await res.json();
      window.GOOGLE_MAPS_KEY=
        appConfig.googleKey||
        appConfig.googleMapsKey||
        "";
    }
  }catch{}
}

async function loadSystemDesign(){

  try{
    const res =
      await fetch("/api/system-design",{cache:"no-store"});

    if(res.ok){
      systemDesign=await res.json();
    }
  }catch{
    systemDesign={};
  }
}

function getGoogleMapsKey(){

  return (
    appConfig.googleKey||
    appConfig.googleMapsKey||
    systemDesign.googleKey||
    systemDesign.googleMapsKey||
    systemDesign.googleMapsApiKey||
    systemDesign.mapsApiKey||
    window.GOOGLE_MAPS_KEY||
    ""
  );
}

function loadGoogleMapsScript(){

  return new Promise((resolve,reject)=>{

    if(window.google?.maps?.Map){
      resolve();
      return;
    }

    const key=
      getGoogleMapsKey();

    if(!key){
      reject(new Error("Google Maps API key missing"));
      return;
    }

    const script=
      document.createElement("script");

    script.async=true;
    script.defer=true;
    script.src=
      "https://maps.googleapis.com/maps/api/js?key="+
      encodeURIComponent(key)+
      "&v=weekly";

    script.onload=resolve;
    script.onerror=reject;

    document.head.appendChild(script);
  });
}

async function fetchTrip(){

  if(!TRIP_ID){
    alert("No trip found");
    location.href="/driver/trips.html";
    return null;
  }

  const res=
    await fetch(`/api/trips/${TRIP_ID}`,{
      cache:"no-store"
    });

  if(!res.ok){
    throw new Error("Trip load failed");
  }

  return await res.json();
}

/*
  Temporary generic trip update.
  When the server shared-stop endpoints are ready,
  this function should be replaced by explicit stop/passenger endpoints.
*/
async function saveExecutionEvent(event,payload={}){

  try{

    const res=
      await fetch(`/api/trips/${TRIP_ID}`,{
        method:"PUT",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          driverId:DRIVER_ID,
          driverName:DRIVER_NAME,
          driverExecutionEvent:event,
          driverExecutionAt:serverNow(),
          currentStopId:currentStop()?.stopId || "",
          currentStopIndex,
          ...payload
        })
      });

    if(res.ok){
      try{
        tripDoc=await res.json();
      }catch{}
    }

    return res.ok;

  }catch(err){
    console.log("saveExecutionEvent",err);
    return false;
  }
}

async function sendLocation(lat,lng){

  const now=serverNow();

  if(lastSentLocationAt){

    const timeEnough=
      now-lastSentLocationAt>=LOCATION_PUSH_MS;

    const movedEnough=
      Number.isFinite(lastSentLat) &&
      Number.isFinite(lastSentLng)
        ? distanceMiles(
            lastSentLat,lastSentLng,
            lat,lng
          )>=LOCATION_PUSH_MILES
        : false;

    if(!timeEnough && !movedEnough){
      return;
    }
  }

  lastSentLocationAt=now;
  lastSentLat=lat;
  lastSentLng=lng;

  try{
    await fetch("/api/driver/location",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        driverId:DRIVER_ID,
        name:DRIVER_NAME,
        lat,lng,
        tripId:TRIP_ID,
        currentStopId:currentStop()?.stopId || "",
        time:now
      })
    });
  }catch{}
}

/* =========================
   BUTTON FLOW
========================= */

btnGoogle?.addEventListener("click",openGoogleMaps);

btnArrived?.addEventListener("click",async ()=>{

  const stop=currentStop();

  if(!stop || stop.type!=="pickup"){
    return;
  }

  saveStopLocalState(stop,{
    arrived:true,
    arrivedAt:serverNow(),
    waitStartedAt:serverNow()
  });

  await saveExecutionEvent(
    "PICKUP_GROUP_ARRIVED",
    {
      pickupGroupId:stop.stopId,
      passengerIds:stop.passengers.map(p=>p.passengerId),
      arrivedAt:serverNow()
    }
  );

  startPickupGroupTimer(stop);
  renderCurrentStop();
});

btnCallClient?.addEventListener("click",()=>{

  const stop=currentStop();
  if(!stop) return;

  const passengers=
    activePassengersForStop(stop);

  /*
    For a shared pickup group the call button calls the first active passenger.
    After Admin/server workflow is connected, we can expose one call button per passenger.
  */
  const phone=
    passengers.find(p=>p.phone)?.phone || "";

  if(!phone){
    alert("Passenger phone not found");
    return;
  }

  saveStopLocalState(stop,{
    called:true,
    calledAt:serverNow()
  });

  window.location.href=`tel:${phone}`;

  setTimeout(renderButtons,300);
});

btnStart?.addEventListener("click",async ()=>{

  const stop=currentStop();
  if(!stop || stop.type!=="pickup") return;

  const active=
    activePassengersForStop(stop);

  if(!active.length){
    advanceStop();
    return;
  }

  saveStopLocalState(stop,{
    pickedUp:true,
    pickedUpAt:serverNow(),
    completed:true
  });

  await saveExecutionEvent(
    "PICKUP_GROUP_COMPLETED",
    {
      pickupGroupId:stop.stopId,
      passengerIds:active.map(p=>p.passengerId),
      pickedUpAt:serverNow()
    }
  );

  advanceStop();
});

btnNoShow?.addEventListener("click",()=>{

  const stop=currentStop();
  if(!stop || stop.type!=="pickup") return;

  show(noShowBox,"flex");
});

btnCloseNoShow?.addEventListener("click",()=>{
  hide(noShowBox);
  if(noShowNotes) noShowNotes.value="";
});

btnCompleteNoShow?.addEventListener("click",async ()=>{

  const stop=currentStop();
  if(!stop) return;

  const reason=
    clean(noShowNotes?.value);

  if(!reason){
    alert("Please enter no show reason");
    return;
  }

  const active=
    activePassengersForStop(stop);

  if(!active.length){
    hide(noShowBox);
    advanceStop();
    return;
  }

  /*
    V1 applies No Show to all still-active passengers at this pickup group.
    This is correct when nobody at the shared pickup arrives.
    Per-passenger partial pickup/no-show controls can be added next.
  */
  for(const p of stop.passengers){
    if(active.some(a=>a.passengerId===p.passengerId)){
      p.status="No Show";
      p.noShowReason=reason;
    }
  }

  saveStopLocalState(stop,{
    noShow:true,
    noShowAt:serverNow(),
    noShowReason:reason,
    completed:true
  });

  await saveExecutionEvent(
    "PICKUP_GROUP_NO_SHOW",
    {
      pickupGroupId:stop.stopId,
      passengerIds:active.map(p=>p.passengerId),
      noShowReason:reason,
      noShowAt:serverNow()
    }
  );

  hide(noShowBox);
  if(noShowNotes) noShowNotes.value="";

  advanceStop();
});

btnCompleteStop?.addEventListener("click",async ()=>{

  const stop=currentStop();

  if(!stop || stop.type!=="dropoff"){
    return;
  }

  const target=currentTargetPoint();

  if(
    target &&
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng)
  ){

    const d=
      distanceMiles(
        driverLat,driverLng,
        target.lat,target.lng
      );

    if(
      d >
      DRIVER_EXECUTION_SETTINGS.dropoffCompleteRadiusMiles
    ){
      alert("You must be near the dropoff location first");
      return;
    }
  }

  saveStopLocalState(stop,{
    completed:true,
    completedAt:serverNow()
  });

  await saveExecutionEvent(
    "DROPOFF_COMPLETED",
    {
      passengerId:stop.passengers[0]?.passengerId || "",
      completedAt:serverNow()
    }
  );

  advanceStop();
});

recenterBtn?.addEventListener("click",()=>{
  userMovedMap=false;
  fitMap();
});

/* =========================
   GPS
========================= */

function startGpsWatch(){

  if(!navigator.geolocation){
    if(gpsBadge) gpsBadge.textContent="GPS unavailable";
    return;
  }

  watchId=
    navigator.geolocation.watchPosition(
      async pos=>{

        driverLat=pos.coords.latitude;
        driverLng=pos.coords.longitude;

        if(gpsBadge){
          gpsBadge.textContent="GPS Active";
        }

        updateDriverMarker(driverLat,driverLng);
        drawStraightLine();

        if(firstGpsFix){
          firstGpsFix=false;
          userMovedMap=false;
          fitMap();
        }else if(!userMovedMap){
          fitMap();
        }

        await sendLocation(driverLat,driverLng);

        const stop=currentStop();
        const target=currentTargetPoint();

        if(!stop || !target){
          return;
        }

        const d=
          distanceMiles(
            driverLat,driverLng,
            target.lat,target.lng
          );

        /*
          Default V1 keeps Arrived manual.
          If Admin later enables auto-arrive, this uses the configured radius.
        */
        if(
          DRIVER_EXECUTION_SETTINGS.autoArriveEnabled &&
          stop.type==="pickup" &&
          !loadStopLocalState(stop).arrived &&
          d<=DRIVER_EXECUTION_SETTINGS.pickupArrivalRadiusMiles
        ){
          btnArrived?.click();
        }

      },
      err=>{
        console.log("GPS error",err);
        if(gpsBadge) gpsBadge.textContent="GPS Error";
      },
      {
        enableHighAccuracy:true,
        maximumAge:1000,
        timeout:10000
      }
    );
}

/* =========================
   INIT
========================= */

async function initPage(){

  try{

    setNavText("Loading trip...");

    await syncServerClock();
    await loadSystemDesign();
    await loadAppConfig();
    await syncServerClock();

    tripDoc=
      await fetchTrip();

    if(!tripDoc){
      return;
    }

    routeStops=
      buildRouteStops(tripDoc);

    if(!routeStops.length){
      throw new Error("No route stops found");
    }

    restoreStopProgress();
    renderCurrentStop();

    await loadGoogleMapsScript();
    initMap();

  }catch(err){

    console.log("MAP INIT ERROR",err);

    setNavText("Map failed to load");
    setStopStatus(err.message || "Unable to load trip");

    /*
      Even if Google map fails, keep the execution controls visible.
      Driver can still see the current stop and use external Directions if address exists.
    */
    renderCurrentStop();
  }
}

document.addEventListener("visibilitychange",async ()=>{

  if(document.hidden){
    return;
  }

  await syncServerClock();

  try{

    const fresh=
      await fetchTrip();

    if(fresh){
      tripDoc=fresh;

      /*
        Rebuild route data from the server, but preserve which local stop
        is already completed.
      */
      routeStops=buildRouteStops(tripDoc);
      restoreStopProgress();
      renderCurrentStop();
      updateMapTarget();
    }

  }catch{}
});

window.addEventListener("beforeunload",()=>{
  stopTimer();
});

initPage();