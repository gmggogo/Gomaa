/* =====================================================
   DRIVER MAP - GOOGLE DISPLAY ONLY / NO ROUTING REQUESTS
   WHITE LABEL - SAAS READY
===================================================== */

console.log("Driver map loaded");

/* ================= AUTH ================= */

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

/* ================= DOM ================= */

const driverNameEl =
  document.getElementById("driverName");

const datetimeEl =
  document.getElementById("datetime");

const navTextEl =
  document.getElementById("navText");

const pickupTextEl =
  document.getElementById("pickupText");

const dropoffTextEl =
  document.getElementById("dropoffText");

const gpsBadge =
  document.getElementById("gpsBadge");

const recenterBtn =
  document.getElementById("recenterBtn");

const btnGoPickup =
  document.getElementById("btnGoPickup");

const btnGoDropoff =
  document.getElementById("btnGoDropoff");

const btnGoogle =
  document.getElementById("btnGoogle");

const btnStart =
  document.getElementById("btnStart");

const btnCallClient =
  document.getElementById("btnCallClient");

const btnNoShow =
  document.getElementById("btnNoShow");

const btnComplete =
  document.getElementById("btnComplete");

const waitTimerEl =
  document.getElementById("waitTimer");

const noShowBox =
  document.getElementById("noShowBox");

const btnCloseNoShow =
  document.getElementById("btnCloseNoShow");

const noShowNotes =
  document.getElementById("noShowNotes");

const btnCompleteNoShow =
  document.getElementById("btnCompleteNoShow");

const navHome =
  document.getElementById("navHome");

const navTrips =
  document.getElementById("navTrips");

const navMap =
  document.getElementById("navMap");

const navChat =
  document.getElementById("navChat");

const navLogout =
  document.getElementById("navLogout");

if(driverNameEl){
  driverNameEl.innerText = DRIVER_NAME;
}

/* ================= TRIP ================= */

const urlParams =
  new URLSearchParams(window.location.search);

const TRIP_ID =
  String(urlParams.get("tripId") || "");

let tripDoc = null;
let systemDesign = {};
let appConfig = {};
let clientPhone = "";
let tripDateTime = null;

let pickupLat = null;
let pickupLng = null;
let dropLat = null;
let dropLng = null;

let pickupAddress = "";
let dropoffAddress = "";

let hasPickup = false;
let hasDropoff = false;

/* ================= MAP STATE ================= */

let map = null;
let driverMarker = null;
let pickupMarker = null;
let dropoffMarker = null;
let routeLine = null;
let firstFix = true;

let driverLat = null;
let driverLng = null;

let watchId = null;
let userMovedMap = false;

/* ================= TRIP STATE ================= */

let arrived = false;
let started = false;
let completed = false;
let noShowDone = false;
let calledClient = false;
let waitingForTripTime = false;

let routeMode = "pickup"; 
// pickup | waiting | dropoff_live | completed

/* ================= TIMER ================= */

const WAIT_DURATION_SECONDS = 900;

let waitInterval = null;
let tripTimeWatcher = null;

let timerStartTime = null;

/* ================= LOCATION PUSH ================= */

let lastSentLocationAt = 0;
let lastSentLat = null;
let lastSentLng = null;

const LOCATION_PUSH_MS = 60000;
const LOCATION_PUSH_MILES = 0.25;

/* ================= SERVER TIME ================= */

let serverOffset = 0;
let appTimezone = "America/Phoenix";

function serverNow(){
  return Date.now() + serverOffset;
}

async function syncServerClock(){

  try{

    const res =
      await fetch("/api/time",{
        cache:"no-store"
      });

    if(res.ok){

      const data =
        await res.json();

      const value =
        data.serverTime ||
        data.now ||
        data.timestamp ||
        data.time;

      const parsed =
        typeof value === "number"
          ? value
          : new Date(value).getTime();

      if(Number.isFinite(parsed)){
        serverOffset = parsed - Date.now();
        return;
      }

    }

  }catch(err){}

  try{

    const res =
      await fetch("/api/system-design",{
        cache:"no-store"
      });

    const dateHeader =
      res.headers.get("date");

    if(dateHeader){

      const parsed =
        new Date(dateHeader).getTime();

      if(Number.isFinite(parsed)){
        serverOffset = parsed - Date.now();
      }

    }

  }catch(err){}

}

/* ================= UI HELPERS ================= */

function setNavText(text){
  if(navTextEl){
    navTextEl.innerText = text;
  }
}

function showEl(el,display="block"){
  if(el){
    el.style.display = display;
  }
}

function hideEl(el){
  if(el){
    el.style.display = "none";
  }
}

function hideAllMainButtons(){
  hideEl(btnGoPickup);
  hideEl(btnGoDropoff);
  hideEl(btnGoogle);
  hideEl(btnStart);
  hideEl(btnCallClient);
  hideEl(btnNoShow);
  hideEl(btnComplete);
}

function resetNoShowBox(){
  hideEl(noShowBox);
  if(noShowNotes){
    noShowNotes.value = "";
  }
}

function resetUI(){
  hideAllMainButtons();
  hideEl(waitTimerEl);
  resetNoShowBox();

  if(btnComplete){
    btnComplete.classList.remove("enabled");
  }
}

function finishUI(){
  resetUI();
  stopTimer(false);
  routeMode = "completed";
  saveLocalState();
  drawStraightLine();
}

function updateClock(){

  if(!datetimeEl){
    return;
  }

  datetimeEl.innerText =
    new Date(serverNow()).toLocaleString(
      "en-US",
      {
        timeZone:appTimezone
      }
    );

}

setInterval(updateClock,1000);

/* ================= LOCAL STATE ================= */

function getStateKey(){
  return `driver_trip_state_${TRIP_ID || "no_trip"}`;
}

function saveLocalState(){

  if(!TRIP_ID){
    return;
  }

  const data = {
    tripId:TRIP_ID,
    arrived,
    started,
    completed,
    noShowDone,
    calledClient,
    waitingForTripTime,
    routeMode,
    timerStartTime
  };

  localStorage.setItem(
    getStateKey(),
    JSON.stringify(data)
  );

  localStorage.setItem(
    "activeDriverTripId",
    TRIP_ID
  );

}

function restoreLocalState(){

  try{

    const raw =
      localStorage.getItem(getStateKey());

    if(!raw){
      return;
    }

    const data =
      JSON.parse(raw);

    if(data.tripId !== TRIP_ID){
      return;
    }

    arrived =
      Boolean(data.arrived);

    started =
      Boolean(data.started);

    completed =
      Boolean(data.completed);

    noShowDone =
      Boolean(data.noShowDone);

    calledClient =
      Boolean(data.calledClient);

    waitingForTripTime =
      Boolean(data.waitingForTripTime);

    routeMode =
      data.routeMode || routeMode;

    timerStartTime =
      Number(data.timerStartTime) || timerStartTime;

  }catch(err){}

}

function clearLocalState(){

  localStorage.removeItem(getStateKey());

  if(
    localStorage.getItem("activeDriverTripId") === TRIP_ID
  ){
    localStorage.removeItem("activeDriverTripId");
  }

}

/* ================= TIME LOGIC ================= */

function parseServerTimeValue(v){

  if(!v){
    return null;
  }

  if(typeof v === "number"){
    return Number.isFinite(v) ? v : null;
  }

  const d =
    new Date(v).getTime();

  return Number.isFinite(d) ? d : null;

}

function buildTripDateTime(trip){

  if(!trip){
    return null;
  }

  if(trip.tripDate && trip.tripTime){

    const d =
      new Date(
        `${trip.tripDate}T${trip.tripTime}`
      );

    if(!Number.isNaN(d.getTime())){
      return d;
    }

  }

  return null;

}

function isTripTimeStarted(){

  if(!tripDateTime){
    return true;
  }

  return serverNow() >= tripDateTime.getTime();

}

function formatTimer(sec){

  const safe =
    Math.max(0,sec);

  const m =
    Math.floor(safe / 60);

  const s =
    safe % 60;

  return (
    String(m).padStart(2,"0") +
    ":" +
    String(s).padStart(2,"0")
  );

}

function getTimerRemainingSeconds(){

  if(!timerStartTime){
    return WAIT_DURATION_SECONDS;
  }

  const elapsed =
    Math.floor(
      (serverNow() - timerStartTime) / 1000
    );

  return Math.max(
    0,
    WAIT_DURATION_SECONDS - elapsed
  );

}

function hasTimerExpired(){
  return getTimerRemainingSeconds() <= 0;
}

function clearTimerWatcher(){

  if(tripTimeWatcher){
    clearInterval(tripTimeWatcher);
    tripTimeWatcher = null;
  }

}

function stopTimer(clearSaved=false){

  if(waitInterval){
    clearInterval(waitInterval);
    waitInterval = null;
  }

  clearTimerWatcher();
  waitingForTripTime = false;

  if(clearSaved){
    timerStartTime = null;
  }

  if(waitTimerEl){
    waitTimerEl.innerText = "15:00";
    hideEl(waitTimerEl);
  }

  saveLocalState();

}

function startTimer(){

  if(
    !waitTimerEl ||
    started ||
    completed ||
    noShowDone
  ){
    return;
  }

  if(!timerStartTime){

    timerStartTime =
      parseServerTimeValue(tripDoc?.arrivedAt) ||
      serverNow();

  }

  showEl(waitTimerEl);
  saveLocalState();

  if(waitInterval){
    clearInterval(waitInterval);
  }

  const tick = ()=>{

    const remaining =
      getTimerRemainingSeconds();

    if(remaining <= 0){

      waitTimerEl.innerText =
        "TIME UP";

      if(waitInterval){
        clearInterval(waitInterval);
        waitInterval = null;
      }

      if(!calledClient){
        showCallClientState();
      }

      return;

    }

    waitTimerEl.innerText =
      formatTimer(remaining);

  };

  tick();

  waitInterval =
    setInterval(tick,1000);

}

function watchTripTimeThenStartTimer(){

  clearTimerWatcher();

  waitingForTripTime = true;
  saveLocalState();

  tripTimeWatcher =
    setInterval(()=>{

      if(
        completed ||
        noShowDone ||
        started
      ){
        clearTimerWatcher();
        waitingForTripTime = false;
        saveLocalState();
        return;
      }

      if(
        arrived &&
        isTripTimeStarted()
      ){
        clearTimerWatcher();
        waitingForTripTime = false;
        setNavText("Waiting for passenger");
        startTimer();
      }

    },1000);

}

/* ================= GEO ================= */

function distanceMiles(lat1,lon1,lat2,lon2){

  const R = 3958.8;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) *
    Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;

}

function isNearPickup(distance){
  return Number.isFinite(distance) && distance <= 0.5;
}

function isNearDropoff(distance){
  return Number.isFinite(distance) && distance <= 0.1;
}

function shouldSendLocation(lat,lng){

  const now =
    serverNow();

  if(!lastSentAtValid()){
    return true;
  }

  if(now - lastSentLocationAt >= LOCATION_PUSH_MS){
    return true;
  }

  if(
    Number.isFinite(lastSentLat) &&
    Number.isFinite(lastSentLng)
  ){

    const moved =
      distanceMiles(
        lastSentLat,
        lastSentLng,
        lat,
        lng
      );

    if(moved >= LOCATION_PUSH_MILES){
      return true;
    }

  }

  return false;

}

function lastSentAtValid(){
  return Number.isFinite(lastSentLocationAt) &&
    lastSentLocationAt > 0;
}

/* ================= API ================= */

async function fetchTrip(){

  if(!TRIP_ID){

    alert("No trip found");
    window.location.href = "/driver/trips.html";
    return null;

  }

  try{

    const res =
      await fetch(`/api/trips/${TRIP_ID}`,{
        cache:"no-store"
      });

    if(!res.ok){
      throw new Error("Trip not found");
    }

    return await res.json();

  }catch(err){

    console.log("fetchTrip error:",err);
    alert("Error loading trip");
    window.location.href = "/driver/trips.html";
    return null;

  }

}

async function updateTripStatus(status,extra={}){

  if(!TRIP_ID){
    return null;
  }

  const body = {
    status,
    driverId:DRIVER_ID,
    driverName:DRIVER_NAME,
    routeMode,
    serverClientTime:serverNow(),
    ...extra
  };

  try{

    const res =
      await fetch(`/api/trips/${TRIP_ID}`,{
        method:"PUT",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(body)
      });

    if(res.ok){

      try{
        tripDoc = await res.json();
      }catch(e){}

    }

    return tripDoc;

  }catch(err){

    console.log("updateTripStatus error:",err);
    return null;

  }

}

async function sendLocation(lat,lng){

  if(!DRIVER_ID){
    return;
  }

  if(!shouldSendLocation(lat,lng)){
    return;
  }

  lastSentLocationAt =
    serverNow();

  lastSentLat = lat;
  lastSentLng = lng;

  try{

    await fetch("/api/driver/location",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        driverId:DRIVER_ID,
        name:DRIVER_NAME,
        lat,
        lng,
        tripId:TRIP_ID,
        routeMode,
        time:lastSentLocationAt
      })
    });

  }catch(err){
    console.log("sendLocation error:",err);
  }

}

/* ================= SYSTEM DESIGN / GOOGLE ================= */

async function loadSystemDesign(){

  try{

    const res =
      await fetch("/api/system-design",{
        cache:"no-store"
      });

    systemDesign =
      await res.json();

  }catch(err){

    systemDesign = {};

  }

  appTimezone =
    systemDesign.timezone ||
    systemDesign.appTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Phoenix";

  document.title =
    (
      systemDesign.companyName ||
      "Driver"
    ) + " - Driver Map";

}

async function loadAppConfig(){

  try{

    const res =
      await fetch("/api/config",{
        cache:"no-store"
      });

    if(res.ok){

      appConfig =
        await res.json();

      window.GOOGLE_MAPS_KEY =
        appConfig.googleKey ||
        appConfig.googleMapsKey ||
        "";

    }

  }catch(err){

    console.log(
      "config load error",
      err
    );

  }

}

function getGoogleMapsKey(){

  return (

    appConfig.googleKey ||

    appConfig.googleMapsKey ||

    systemDesign.googleKey ||

    systemDesign.googleMapsKey ||

    systemDesign.googleMapKey ||

    systemDesign.googleMapsApiKey ||

    systemDesign.mapsApiKey ||

    window.GOOGLE_MAPS_KEY ||

    ""

  );

}

function loadGoogleMapsScript(){

  return new Promise((resolve,reject)=>{

    if(
      window.google &&
      google.maps &&
      google.maps.Map
    ){
      resolve();
      return;
    }

    const key =
      getGoogleMapsKey();

    if(!key){
      reject(
        new Error("Google Maps API key missing")
      );
      return;
    }

    const old =
      document.getElementById("google-maps-script");

    if(old){
      old.addEventListener("load",resolve);
      old.addEventListener("error",reject);
      return;
    }

    const script =
      document.createElement("script");

    script.id =
      "google-maps-script";

    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(key);

    script.async = true;
    script.defer = true;

    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);

  });

}

/* ================= GOOGLE MAP DISPLAY ONLY ================= */

function createMarkerIcon(color,label){

  return {
    path:google.maps.SymbolPath.CIRCLE,
    fillColor:color,
    fillOpacity:1,
    strokeColor:"#ffffff",
    strokeWeight:3,
    scale:10,
    labelOrigin:new google.maps.Point(0,0)
  };

}

function initMap(){

  const center =
    hasPickup
      ? {
          lat:pickupLat,
          lng:pickupLng
        }
      : {
          lat:33.4484,
          lng:-112.0740
        };

  map =
    new google.maps.Map(
      document.getElementById("map"),
      {
        center,
        zoom:14,
        mapTypeId:"roadmap",
        streetViewControl:false,
        fullscreenControl:false,
        mapTypeControl:false,
        clickableIcons:false,
        gestureHandling:"greedy"
      }
    );

  map.addListener("dragstart",()=>{
    userMovedMap = true;
  });

  map.addListener("zoom_changed",()=>{
    if(!firstFix){
      userMovedMap = true;
    }
  });

  if(hasPickup){

    pickupMarker =
      new google.maps.Marker({
        position:{
          lat:pickupLat,
          lng:pickupLng
        },
        map,
        title:"Pickup",
        label:{
          text:"P",
          color:"#ffffff",
          fontWeight:"900"
        },
        icon:createMarkerIcon("#2563eb","P")
      });

  }

  if(hasDropoff){

    dropoffMarker =
      new google.maps.Marker({
        position:{
          lat:dropLat,
          lng:dropLng
        },
        map,
        title:"Dropoff",
        label:{
          text:"D",
          color:"#ffffff",
          fontWeight:"900"
        },
        icon:createMarkerIcon("#16a34a","D")
      });

  }

  if(recenterBtn){

    recenterBtn.onclick = ()=>{
      userMovedMap = false;
      fitMapToActivePoints();
    };

  }

  resetUI();
  restoreViewFromState();
  setNavText("Waiting for GPS...");
  startGpsWatch();

}

function updateDriverMarker(lat,lng){

  const pos = {
    lat,
    lng
  };

  if(!driverMarker){

    driverMarker =
      new google.maps.Marker({
        position:pos,
        map,
        title:"Driver",
        label:{
          text:"●",
          color:"#ffffff",
          fontWeight:"900"
        },
        icon:createMarkerIcon("#f59e0b","")
      });

  }else{

    driverMarker.setPosition(pos);

  }

}

function getCurrentTarget(){

  if(routeMode === "dropoff_live" && hasDropoff){
    return {
      lat:dropLat,
      lng:dropLng
    };
  }

  if(started && hasDropoff){
    return {
      lat:dropLat,
      lng:dropLng
    };
  }

  if(arrived && hasDropoff){
    return {
      lat:dropLat,
      lng:dropLng
    };
  }

  if(hasPickup){
    return {
      lat:pickupLat,
      lng:pickupLng
    };
  }

  return null;

}

function drawStraightLine(){

  if(!map){
    return;
  }

  if(routeLine){
    routeLine.setMap(null);
    routeLine = null;
  }

  if(
    !Number.isFinite(driverLat) ||
    !Number.isFinite(driverLng)
  ){
    return;
  }

  const target =
    getCurrentTarget();

  if(!target){
    return;
  }

  routeLine =
    new google.maps.Polyline({
      path:[
        {
          lat:driverLat,
          lng:driverLng
        },
        target
      ],
      geodesic:true,
      strokeColor:
        routeMode === "dropoff_live" ||
        started ||
        arrived
          ? "#16a34a"
          : "#2563eb",
      strokeOpacity:.95,
      strokeWeight:5,
      map
    });

}

function fitMapToActivePoints(){

  if(!map){
    return;
  }

  const bounds =
    new google.maps.LatLngBounds();

  let count = 0;

  function add(lat,lng){
    if(
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ){
      bounds.extend({lat,lng});
      count++;
    }
  }

  add(driverLat,driverLng);

  const target =
    getCurrentTarget();

  if(target){
    add(target.lat,target.lng);
  }

  if(hasPickup){
    add(pickupLat,pickupLng);
  }

  if(hasDropoff){
    add(dropLat,dropLng);
  }

  if(count >= 2){
    map.fitBounds(bounds,80);
  }else if(count === 1 && Number.isFinite(driverLat)){
    map.setCenter({
      lat:driverLat,
      lng:driverLng
    });
    map.setZoom(15);
  }

}

/* ================= GOOGLE NAVIGATION ================= */

function openGoogleMaps(){

  let destination = "";

  if(routeMode === "dropoff_live" && hasDropoff){
    destination =
      `${dropLat},${dropLng}`;
  }else if(started && hasDropoff){
    destination =
      `${dropLat},${dropLng}`;
  }else if(hasPickup){
    destination =
      `${pickupLat},${pickupLng}`;
  }else{
    alert("Destination not found");
    return;
  }

  let origin = "";

  if(
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng)
  ){
    origin =
      `&origin=${driverLat},${driverLng}`;
  }

  const url =
    `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`;

  window.open(url,"_blank");

}

/* ================= VIEW STATES ================= */

function showPickupState(){

  resetUI();
  showEl(btnGoPickup);
  showEl(btnGoogle);
  setNavText("Go to pickup");

}

function showWaitingState(){

  resetUI();
  showEl(btnStart);
  showEl(btnNoShow);
  showEl(btnGoogle);

  if(timerStartTime && !hasTimerExpired()){

    showEl(waitTimerEl);
    setNavText("Waiting for passenger");

  }else if(waitingForTripTime){

    setNavText("Waiting until trip time");

  }else if(calledClient){

    setNavText("Client contacted. Choose action");

  }else if(hasTimerExpired()){

    showCallClientState();

  }else{

    setNavText("Waiting for passenger");

  }

}

function showCallClientState(){

  resetUI();
  showEl(btnCallClient);
  showEl(btnGoogle);
  showEl(waitTimerEl);

  if(waitTimerEl){
    waitTimerEl.innerText = "TIME UP";
  }

  setNavText("Call client first");

}

function showNoShowState(){

  hideEl(btnStart);
  hideEl(btnNoShow);
  hideEl(btnCallClient);
  hideEl(waitTimerEl);
  showEl(noShowBox,"flex");

  setNavText("Enter no show reason");

}

function showDropoffState(canComplete){

  resetUI();
  showEl(btnGoDropoff);
  showEl(btnGoogle);

  if(canComplete){

    showEl(btnComplete);

    if(btnComplete){
      btnComplete.classList.add("enabled");
    }

    setNavText("Press COMPLETE");

  }else{

    if(btnComplete){
      btnComplete.classList.remove("enabled");
    }

    setNavText("Go to dropoff");

  }

}

function restoreViewFromState(){

  if(completed || noShowDone){
    finishUI();
    setNavText("Trip finished");
    return;
  }

  if(started){
    routeMode = "dropoff_live";
    showDropoffState(false);
    return;
  }

  if(arrived){

    routeMode = "waiting";

    if(isTripTimeStarted()){
      startTimer();
      showWaitingState();
    }else{
      watchTripTimeThenStartTimer();
      showWaitingState();
    }

    return;

  }

  routeMode = "pickup";
  showPickupState();

}

/* ================= FLOW ================= */

async function autoArriveFlow(){

  if(
    arrived ||
    completed ||
    noShowDone
  ){
    return;
  }

  arrived = true;
  routeMode = "waiting";

  const arrivedAt =
    parseServerTimeValue(tripDoc?.arrivedAt) ||
    serverNow();

  timerStartTime = arrivedAt;

  await updateTripStatus(
    "Arrived",
    {
      arrivedAt,
      routeMode:"waiting"
    }
  );

  saveLocalState();
  drawStraightLine();

  if(isTripTimeStarted()){
    setNavText("Waiting for passenger");
    startTimer();
  }else{
    setNavText("Waiting until trip time");
    watchTripTimeThenStartTimer();
  }

  showWaitingState();

}

/* ================= BUTTONS ================= */

if(btnGoogle){
  btnGoogle.onclick = openGoogleMaps;
}

if(btnGoPickup){
  btnGoPickup.onclick = ()=>{
    routeMode = "pickup";
    saveLocalState();
    openGoogleMaps();
  };
}

if(btnGoDropoff){
  btnGoDropoff.onclick = ()=>{
    routeMode = "dropoff_live";
    saveLocalState();
    openGoogleMaps();
  };
}

if(btnStart){

  btnStart.onclick = async ()=>{

    if(completed || noShowDone){
      return;
    }

    if(hasTimerExpired() && !calledClient){
      alert("Call client first");
      return;
    }

    started = true;
    calledClient = false;
    routeMode = "dropoff_live";

    resetNoShowBox();
    stopTimer(true);

    const startedAt =
      serverNow();

    await updateTripStatus(
      "InProgress",
      {
        startedAt,
        routeMode:"dropoff_live"
      }
    );

    saveLocalState();
    drawStraightLine();
    showDropoffState(false);

  };

}

if(btnCallClient){

  btnCallClient.onclick = ()=>{

    if(!clientPhone){
      alert("Client phone not found");
      return;
    }

    calledClient = true;
    saveLocalState();

    window.location.href =
      `tel:${clientPhone}`;

    hideEl(btnCallClient);
    showEl(btnStart);
    showEl(btnNoShow);
    showEl(btnGoogle);

    setNavText("Client contacted. Choose action");

  };

}

if(btnNoShow){

  btnNoShow.onclick = ()=>{

    if(completed || noShowDone){
      return;
    }

    showNoShowState();

  };

}

if(btnCloseNoShow){

  btnCloseNoShow.onclick = ()=>{

    hideEl(noShowBox);
    restoreViewFromState();

  };

}

if(btnCompleteNoShow){

  btnCompleteNoShow.onclick = async ()=>{

    const reason =
      (noShowNotes?.value || "").trim();

    if(!reason){
      alert("Please enter reason");
      return;
    }

    noShowDone = true;
    completed = false;
    routeMode = "completed";

    await updateTripStatus(
      "NoShow",
      {
        noShowReason:reason,
        noShowAt:serverNow(),
        routeMode:"completed"
      }
    );

    finishUI();
    clearLocalState();

    setNavText("No show completed");
    alert("No Show Completed");

    window.location.href =
      "/driver/trips.html";

  };

}

if(btnComplete){

  btnComplete.onclick = async ()=>{

    if(!started){
      return;
    }

    if(
      !btnComplete.classList.contains("enabled")
    ){
      alert("You must be near the dropoff location first");
      return;
    }

    completed = true;
    routeMode = "completed";

    await updateTripStatus(
      "Completed",
      {
        completedAt:serverNow(),
        routeMode:"completed"
      }
    );

    finishUI();
    clearLocalState();

    setNavText("Trip completed");
    alert("Trip Completed");

    window.location.href =
      "/driver/trips.html";

  };

}

if(recenterBtn){

  recenterBtn.onclick = ()=>{
    userMovedMap = false;
    fitMapToActivePoints();
  };

}

/* ================= GPS WATCH ================= */

function startGpsWatch(){

  if(!navigator.geolocation){

    alert("GPS not supported");
    return;

  }

  if(watchId !== null){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watchId =
    navigator.geolocation.watchPosition(
      async pos=>{

        const lat =
          pos.coords.latitude;

        const lng =
          pos.coords.longitude;

        driverLat = lat;
        driverLng = lng;

        if(gpsBadge){
          gpsBadge.style.display = "block";
          gpsBadge.innerText = "GPS Active";
        }

        updateDriverMarker(lat,lng);
        drawStraightLine();

        if(firstFix){

          firstFix = false;
          userMovedMap = false;
          fitMapToActivePoints();

        }else if(!userMovedMap){

          const target =
            getCurrentTarget();

          if(target){
            fitMapToActivePoints();
          }else{
            map.panTo({lat,lng});
          }

        }

        await sendLocation(lat,lng);

        if(completed || noShowDone){
          return;
        }

        const dPickup =
          hasPickup
            ? distanceMiles(
                lat,lng,
                pickupLat,pickupLng
              )
            : Infinity;

        const dDrop =
          hasDropoff
            ? distanceMiles(
                lat,lng,
                dropLat,dropLng
              )
            : Infinity;

        if(!arrived){

          routeMode = "pickup";
          showPickupState();

          if(isNearPickup(dPickup)){
            await autoArriveFlow();
          }

          return;

        }

        if(arrived && !started){

          routeMode = "waiting";

          if(
            noShowBox &&
            noShowBox.style.display === "flex"
          ){
            return;
          }

          if(timerStartTime && !hasTimerExpired()){
            showWaitingState();
          }else if(hasTimerExpired() && !calledClient){
            showCallClientState();
          }else{
            showWaitingState();
          }

          return;

        }

        if(started){

          routeMode = "dropoff_live";

          const canComplete =
            isNearDropoff(dDrop);

          showDropoffState(canComplete);

        }

      },
      err=>{

        console.log("GPS error:",err);

        if(gpsBadge){
          gpsBadge.style.display = "block";
          gpsBadge.innerText = "GPS Error";
        }

        alert("Enable GPS");

      },
      {
        enableHighAccuracy:true,
        maximumAge:1000,
        timeout:10000
      }
    );

}

/* ================= RESTORE FROM TRIP ================= */

function normalizeStatus(status){

  return String(status || "")
    .toLowerCase()
    .replace(/\s+/g,"")
    .trim();

}

function applyTripStatusState(trip){

  const s =
    normalizeStatus(trip.status);

  const arrivedAt =
    parseServerTimeValue(trip.arrivedAt);

  const startedAt =
    parseServerTimeValue(trip.startedAt);

  if(
    s.includes("complete") &&
    !s.includes("no")
  ){
    completed = true;
    routeMode = "completed";
    return;
  }

  if(
    s.includes("noshow") ||
    s.includes("no-show") ||
    s.includes("no")
  ){
    noShowDone = true;
    routeMode = "completed";
    return;
  }

  if(
    s.includes("progress") ||
    s.includes("inprogress") ||
    startedAt
  ){
    arrived = true;
    started = true;
    routeMode = "dropoff_live";
    timerStartTime = arrivedAt || timerStartTime;
    return;
  }

  if(
    s.includes("arrived") ||
    arrivedAt
  ){
    arrived = true;
    started = false;
    routeMode = "waiting";
    timerStartTime =
      arrivedAt ||
      timerStartTime ||
      serverNow();
    return;
  }

  arrived = false;
  started = false;
  routeMode = "pickup";

}

function fillTripInfo(){

  if(pickupTextEl){
    pickupTextEl.innerText =
      pickupAddress || "Pickup";
  }

  if(dropoffTextEl){
    dropoffTextEl.innerText =
      dropoffAddress || "Dropoff";
  }

}

/* ================= PAGE INIT ================= */

async function initPage(){

  try{

    setNavText("Loading trip...");

   await syncServerClock();

await loadSystemDesign();

await loadAppConfig();

await syncServerClock();

updateClock();

console.log(
  "GOOGLE KEY =",
  getGoogleMapsKey()
);

await loadGoogleMapsScript();

    tripDoc =
      await fetchTrip();

    if(!tripDoc){
      return;
    }

    tripDateTime =
      buildTripDateTime(tripDoc);

    clientPhone =
      tripDoc.clientPhone ||
      tripDoc.entryPhone ||
      tripDoc.phone ||
      tripDoc.client_phone ||
      "";

    pickupAddress =
      tripDoc.pickup ||
      tripDoc.pickupAddress ||
      "";

    dropoffAddress =
      tripDoc.dropoff ||
      tripDoc.dropoffAddress ||
      "";

    pickupLat =
      parseFloat(tripDoc.pickupLat);

    pickupLng =
      parseFloat(tripDoc.pickupLng);

    dropLat =
      parseFloat(
        tripDoc.dropoffLat ||
        tripDoc.dropLat
      );

    dropLng =
      parseFloat(
        tripDoc.dropoffLng ||
        tripDoc.dropLng
      );

    hasPickup =
      Number.isFinite(pickupLat) &&
      Number.isFinite(pickupLng);

    hasDropoff =
      Number.isFinite(dropLat) &&
      Number.isFinite(dropLng);

    fillTripInfo();

    restoreLocalState();
    applyTripStatusState(tripDoc);
    saveLocalState();

    initMap();

  }catch(err){

    console.log(err);
    setNavText("Map failed to load");
    alert("Map failed to load");

  }

}

/* ================= BACKGROUND / RETURN ================= */

document.addEventListener(
  "visibilitychange",
  async ()=>{

    if(document.hidden){
      saveLocalState();
      return;
    }

    await syncServerClock();

    const fresh =
      await fetchTrip();

    if(fresh){
      tripDoc = fresh;
      applyTripStatusState(tripDoc);
      saveLocalState();
      restoreViewFromState();
      drawStraightLine();
    }

  }
);

window.addEventListener(
  "pageshow",
  async ()=>{

    await syncServerClock();

    if(tripDoc){
      applyTripStatusState(tripDoc);
      restoreViewFromState();
      drawStraightLine();
    }

  }
);

window.addEventListener(
  "beforeunload",
  ()=>{
    saveLocalState();
  }
);

/* ================= BOTTOM NAV ================= */

if(navHome){
  navHome.onclick = ()=>{
    window.location.href =
      "/driver/dashboard.html";
  };
}

if(navTrips){
  navTrips.onclick = ()=>{
    window.location.href =
      "/driver/trips.html";
  };
}

if(navMap){
  navMap.onclick = ()=>{
    if(TRIP_ID){
      window.location.href =
        `/driver/map.html?tripId=${TRIP_ID}`;
    }else{
      window.location.href =
        "/driver/trips.html";
    }
  };
}

if(navChat){
  navChat.onclick = ()=>{
    alert("Chat coming soon");
  };
}

if(navLogout){
  navLogout.onclick = ()=>{
    saveLocalState();
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("user");
    window.location.href =
      "/driver/login.html";
  };
}

/* ================= START ================= */

initPage();