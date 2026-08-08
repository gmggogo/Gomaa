/* =====================================================
   SUNBEAM DRIVER MAP — GOOGLE FINAL

   - Google Maps inside Driver App for DISPLAY ONLY
   - NO internal road-route calculation
   - 250 meter geofence for Pickup / Stop / Dropoff
   - Strict button flow: no button can skip another
   - Individual: Pickup -> 0..N Stops -> Dropoff
   - Shared: server pickupOrder/dropoffOrder, grouped same pickups
   - Same pickup location = one wait timer
   - Different pickup location = separate timer
   - Wait timer never starts before scheduled trip time
   - No Show reason required
   - External Google Maps handles navigation
   - No Show fee is passed to server; client never calculates price
===================================================== */

console.log("Sunbeam Driver Map GOOGLE FINAL");

/* ================= CONFIG ================= */

const METERS_PER_MILE = 1609.344;

const STOP_RADIUS_METERS = 250;

/* Internal map: display only. No routing/geocoding requests. */
const STOP_RADIUS_MILES =
  STOP_RADIUS_METERS /
  METERS_PER_MILE;

const EXECUTION = {
  waitTimerEnabled:true,
  waitMinutes:10,
  stopRadiusMiles:STOP_RADIUS_MILES,
  noShowRequiresTimer:true
};


const LOCATION_PUSH_MS = 20000;
const LOCATION_PUSH_MILES = 0.25;

/* ================= AUTH ================= */

const rawDriver =
  localStorage.getItem("loggedDriver") ||
  localStorage.getItem("user");

if(!rawDriver){
  window.location.href =
    "/driver/login.html";
}

let driver = {};

try{
  driver = JSON.parse(rawDriver);
}catch(err){
  window.location.href =
    "/driver/login.html";
}

const DRIVER_ID =
  String(
    driver._id ||
    driver.id ||
    ""
  );

const DRIVER_NAME =
  clean(
    driver.name ||
    driver.fullName ||
    driver.username ||
    "Driver"
  );

const DRIVER_PHONE =
  clean(
    driver.phone ||
    driver.mobile ||
    driver.phoneNumber ||
    ""
  );

/* ================= TRIP ID ================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const TRIP_ID =
  clean(
    params.get("tripId")
  );

/* ================= DOM ================= */

const navTextEl =
  document.getElementById("navText");

const gpsBadge =
  document.getElementById("gpsBadge");

const stopTypeBadge =
  document.getElementById("stopTypeBadge");

const stopProgress =
  document.getElementById("stopProgress");

const currentStopAddressEl =
  document.getElementById("currentStopAddress");

const currentPassengersEl =
  document.getElementById("currentPassengers");

const stopStatusText =
  document.getElementById("stopStatusText");

const waitTimerEl =
  document.getElementById("waitTimer");

const scheduledTimeBox =
  document.getElementById("scheduledTimeBox");

const recenterBtn =
  document.getElementById("recenterBtn");

const btnDirections =
  document.getElementById("btnDirections");

const btnArrived =
  document.getElementById("btnArrived");

const btnStartRide =
  document.getElementById("btnStartRide");

const btnCancel =
  document.getElementById("btnCancel");

const btnCall =
  document.getElementById("btnCall");

const btnNoShow =
  document.getElementById("btnNoShow");

const btnCompleteStop =
  document.getElementById("btnCompleteStop");

const btnCompleteDropoff =
  document.getElementById("btnCompleteDropoff");

const cancelBox =
  document.getElementById("cancelBox");

const btnCloseCancel =
  document.getElementById("btnCloseCancel");

const cancelNotes =
  document.getElementById("cancelNotes");

const btnCompleteCancel =
  document.getElementById("btnCompleteCancel");

const noShowBox =
  document.getElementById("noShowBox");

const btnCloseNoShow =
  document.getElementById("btnCloseNoShow");

const noShowNotes =
  document.getElementById("noShowNotes");

const btnCompleteNoShow =
  document.getElementById("btnCompleteNoShow");

/* ================= STATE ================= */

let appConfig = {};
let systemDesign = {};
let appTimezone = "America/Phoenix";
let serverOffset = 0;

let tripDoc = null;
let routeStops = [];
let currentStopIndex = 0;

let map = null;

let driverMarker = null;
let stopMarker = null;

let driverLat = null;
let driverLng = null;
let watchId = null;

let firstGpsFix = true;
let userMovedMap = false;

let timerInterval = null;


let lastSentLocationAt = 0;
let lastSentLat = null;
let lastSentLng = null;

/* ================= HELPERS ================= */

function clean(v){
  return String(v ?? "").trim();
}

function lower(v){
  return clean(v).toLowerCase();
}

function num(v,def=null){

  if(
    v === undefined ||
    v === null ||
    clean(v) === ""
  ){
    return def;
  }

  const n =
    Number(v);

  return Number.isFinite(n)
    ? n
    : def;
}

function firstValue(...values){

  for(const value of values){

    if(
      value !== undefined &&
      value !== null &&
      clean(value) !== ""
    ){
      return value;
    }
  }

  return "";
}

function normalizeStatus(v){

  return lower(v)
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function normalizeAddressKey(v){

  return lower(v)
    .replace(/[.,#]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function findSavedRoutePoint(address,type){

  if(!tripDoc){
    return null;
  }

  const wantedAddress =
    normalizeAddressKey(
      address
    );

  const wantedType =
    clean(type)
      .toLowerCase();

  if(!wantedAddress){
    return null;
  }

  const plans = [
    tripDoc.sharedRoutePlan,
    tripDoc.routePlan
  ];

  for(const plan of plans){

    if(!Array.isArray(plan)){
      continue;
    }

    const found =
      plan.find(point=>{

        const pointAddress =
          normalizeAddressKey(
            point?.address
          );

        if(
          pointAddress !==
          wantedAddress
        ){
          return false;
        }

        const pointType =
          clean(
            point?.type
          )
          .toLowerCase();

        if(
          wantedType &&
          pointType &&
          pointType !==
          wantedType
        ){
          return false;
        }

        return validPoint(
          Number(point?.lat),
          Number(point?.lng)
        );
      });

    if(found){
      return {
        lat:Number(found.lat),
        lng:Number(found.lng)
      };
    }
  }

  return null;
}

function validPoint(lat,lng){

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function show(el,display="block"){
  if(el) el.style.display = display;
}

function hide(el){
  if(el) el.style.display = "none";
}

function setNavText(text){
  if(navTextEl) navTextEl.textContent = text;
}

function setStopStatus(text){
  if(stopStatusText) stopStatusText.textContent = text;
}

function serverNow(){
  return Date.now() + serverOffset;
}

function distanceMiles(
  lat1,
  lon1,
  lat2,
  lon2
){

  const R = 3958.8;

  const dLat =
    ((lat2-lat1)*Math.PI)/180;

  const dLon =
    ((lon2-lon1)*Math.PI)/180;

  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)**2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1-a)
    )
  );
}

function normalizePhone(v){
  return clean(v).replace(/\D/g,"");
}

function isDriverIdentity(name,phone){

  const sameName =
    lower(name) &&
    lower(name) ===
    lower(DRIVER_NAME);

  const p1 =
    normalizePhone(phone);

  const p2 =
    normalizePhone(DRIVER_PHONE);

  const samePhone =
    p1 &&
    p2 &&
    p1 === p2;

  return (
    sameName ||
    samePhone
  );
}

/* ================= SERVER CLOCK ================= */

async function syncServerClock(){

  try{

    const res =
      await fetch(
        "/api/config",
        {cache:"no-store"}
      );

    const header =
      res.headers.get("date");

    if(header){

      const ms =
        new Date(header)
        .getTime();

      if(Number.isFinite(ms)){
        serverOffset =
          ms - Date.now();
      }
    }

  }catch{}
}

/* ================= GOOGLE LOAD ================= */

async function loadAppConfig(){

  try{

    const res =
      await fetch(
        "/api/config",
        {cache:"no-store"}
      );

    if(res.ok){
      appConfig =
        await res.json();
    }

  }catch{
    appConfig = {};
  }
}

async function loadSystemDesign(){

  try{

    const res =
      await fetch(
        "/api/system-design",
        {cache:"no-store"}
      );

    if(res.ok){
      systemDesign =
        await res.json();
    }

  }catch{
    systemDesign = {};
  }

  appTimezone =
    systemDesign.timezone ||
    systemDesign.appTimezone ||
    "America/Phoenix";
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
    ""
  );
}

function loadGoogleMaps(){

  return new Promise(
    (resolve,reject)=>{

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
          new Error(
            "Google Maps API key missing"
          )
        );
        return;
      }

      const old =
        document.getElementById(
          "google-maps-script"
        );

      if(old){
        old.remove();
      }

      const script =
        document.createElement(
          "script"
        );

      script.id =
        "google-maps-script";

      script.async = true;
      script.defer = true;

      script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(key) +
        "&v=weekly";

      script.onload =
        ()=>resolve();

      script.onerror =
        ()=>reject(
          new Error(
            "Google Maps failed to load"
          )
        );

      document.head
        .appendChild(
          script
        );
    }
  );
}

/* ================= TRIP API ================= */

async function fetchTrip(){

  if(!TRIP_ID){

    alert("No trip found");

    window.location.href =
      "/driver/trips.html";

    return null;
  }

  const res =
    await fetch(
      `/api/trips/${TRIP_ID}`,
      {cache:"no-store"}
    );

  if(!res.ok){
    throw new Error(
      "Trip load failed"
    );
  }

  return await res.json();
}

async function updateTrip(
  body
){

  const res =
    await fetch(
      `/api/trips/${TRIP_ID}`,
      {
        method:"PUT",
        headers:{
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(body)
      }
    );

  if(!res.ok){

    const data =
      await res
      .json()
      .catch(()=>({}));

    throw new Error(
      data.message ||
      "Trip update failed"
    );
  }

  tripDoc =
    await res.json();

  return tripDoc;
}

/* ================= PASSENGERS ================= */

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
      p?.patientName,
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
      p?.patientPhone,
      p?.phone,
      p?.mobile
    )
  );
}

function passengerPickup(p,trip){

  return clean(
    firstValue(
      p?.pickup,
      p?.pickupAddress,
      trip?.pickup,
      trip?.pickupAddress
    )
  );
}

function passengerDropoff(p,trip){

  return clean(
    firstValue(
      p?.dropoff,
      p?.dropoffAddress,
      trip?.dropoff,
      trip?.dropoffAddress
    )
  );
}

function pickupPoint(p,trip){

  return {
    lat:
      num(
        firstValue(
          p?.pickupLat,
          p?.pickupLatitude,
          trip?.pickupLat,
          trip?.pickupLatitude
        )
      ),
    lng:
      num(
        firstValue(
          p?.pickupLng,
          p?.pickupLongitude,
          trip?.pickupLng,
          trip?.pickupLongitude
        )
      )
  };
}

function dropoffPoint(p,trip){

  return {
    lat:
      num(
        firstValue(
          p?.dropoffLat,
          p?.dropLat,
          p?.dropoffLatitude,
          trip?.dropoffLat,
          trip?.dropLat
        )
      ),
    lng:
      num(
        firstValue(
          p?.dropoffLng,
          p?.dropLng,
          p?.dropoffLongitude,
          trip?.dropoffLng,
          trip?.dropLng
        )
      )
  };
}

function getPassengers(trip){

  if(
    Array.isArray(trip?.passengers) &&
    trip.passengers.length
  ){
    return trip.passengers;
  }

  return [{
    passengerId:"single",
    clientName:
      firstValue(
        trip?.clientName,
        trip?.passengerName,
        trip?.memberName,
        trip?.patientName,
        "Passenger"
      ),
    clientPhone:
      firstValue(
        trip?.clientPhone,
        trip?.passengerPhone,
        trip?.memberPhone,
        trip?.patientPhone
      ),
    pickup:
      firstValue(
        trip?.pickup,
        trip?.pickupAddress
      ),
    dropoff:
      firstValue(
        trip?.dropoff,
        trip?.dropoffAddress
      ),
    pickupLat:
      trip?.pickupLat,
    pickupLng:
      trip?.pickupLng,
    dropoffLat:
      firstValue(
        trip?.dropoffLat,
        trip?.dropLat
      ),
    dropoffLng:
      firstValue(
        trip?.dropoffLng,
        trip?.dropLng
      ),
    pickupOrder:1,
    dropoffOrder:999999,
    tripDate:trip?.tripDate,
    tripTime:trip?.tripTime
  }];
}

/* ================= TRIP TIME ================= */

function buildScheduledTime(
  trip,
  source=null
){

  const direct =
    firstValue(
      source?.scheduledAt,
      source?.tripDateTime,
      source?.pickupDateTime
    );

  if(direct){

    const ms =
      new Date(direct)
      .getTime();

    if(Number.isFinite(ms)){
      return ms;
    }
  }

  const date =
    clean(
      firstValue(
        source?.tripDate,
        trip?.tripDate,
        trip?.date
      )
    );

  const time =
    clean(
      firstValue(
        source?.tripTime,
        source?.pickupTime,
        trip?.tripTime,
        trip?.time
      )
    );

  if(!date || !time){
    return null;
  }

  const ms =
    new Date(
      `${date}T${time}`
    )
    .getTime();

  return Number.isFinite(ms)
    ? ms
    : null;
}

function formatScheduledTime(ms){

  if(!Number.isFinite(ms)){
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:appTimezone,
      hour:"numeric",
      minute:"2-digit",
      hour12:true
    }
  )
  .format(
    new Date(ms)
  );
}

/* ================= NORMAL STOPS ================= */

function buildNormalStops(trip){

  const stops =
    Array.isArray(trip?.stops)
      ? trip.stops
      : [];

  const coords =
    Array.isArray(trip?.stopCoords)
      ? trip.stopCoords
      : [];

  const out = [];

  for(
    let i=0;
    i<stops.length;
    i++
  ){

    const raw =
      stops[i];

    const address =
      clean(
        typeof raw === "string"
          ? raw
          : firstValue(
              raw?.address,
              raw?.fullAddress,
              raw?.stopAddress,
              raw?.location
            )
      );

    const coordByAddress =
      coords.find(
        c =>
          normalizeAddressKey(
            firstValue(
              c?.address,
              c?.fullAddress
            )
          ) ===
          normalizeAddressKey(
            address
          )
      );

    const coord =
      coordByAddress ||
      coords[i] ||
      {};

    out.push({
      stopId:
        String(
          firstValue(
            raw?.stopId,
            raw?._id,
            raw?.id,
            `stop-${i+1}`
          )
        ),
      type:"stop",
      order:i+2,
      address,
      lat:
        num(
          firstValue(
            raw?.lat,
            raw?.latitude,
            coord?.lat,
            coord?.latitude
          )
        ),
      lng:
        num(
          firstValue(
            raw?.lng,
            raw?.lon,
            raw?.longitude,
            coord?.lng,
            coord?.lon,
            coord?.longitude
          )
        ),
      passengers:[]
    });
  }

  return out;
}

/* ================= SHARED GROUPS ================= */

function samePickupGroup(
  group,
  p,
  trip
){

  const address =
    normalizeAddressKey(
      passengerPickup(
        p,
        trip
      )
    );

  const point =
    pickupPoint(
      p,
      trip
    );

  if(
    address &&
    group.addressKey ===
    address
  ){
    return true;
  }

  if(
    validPoint(
      group.lat,
      group.lng
    ) &&
    validPoint(
      point.lat,
      point.lng
    )
  ){

    return (
      distanceMiles(
        group.lat,
        group.lng,
        point.lat,
        point.lng
      ) <= 0.02
    );
  }

  return false;
}

function buildSharedStops(trip){

  const passengers =
    getPassengers(trip);

  const pickupGroups = [];
  const dropoffs = [];

  passengers.forEach(
    (p,index)=>{

      const id =
        passengerId(p,index);

      const name =
        passengerName(p,index);

      const phone =
        passengerPhone(p);

      const pPickup =
        passengerPickup(p,trip);

      const pDropoff =
        passengerDropoff(p,trip);

      const pu =
        pickupPoint(p,trip);

      const dr =
        dropoffPoint(p,trip);

      const pickupOrder =
        num(
          firstValue(
            p?.pickupOrder,
            p?.pickupSequence,
            p?.routePickupOrder
          ),
          index*10+1
        );

      const dropoffOrder =
        num(
          firstValue(
            p?.dropoffOrder,
            p?.dropoffSequence,
            p?.routeDropoffOrder
          ),
          index*10+9
        );

      let group =
        pickupGroups.find(
          g =>
            samePickupGroup(
              g,
              p,
              trip
            )
        );

      if(!group){

        group = {
          stopId:
            `pickup-${pickupGroups.length+1}`,
          type:"pickup",
          order:pickupOrder,
          address:pPickup,
          addressKey:
            normalizeAddressKey(
              pPickup
            ),
          lat:pu.lat,
          lng:pu.lng,
          scheduledAt:
            buildScheduledTime(
              trip,
              p
            ),
          passengers:[]
        };

        pickupGroups.push(
          group
        );

      }else{

        group.order =
          Math.min(
            group.order,
            pickupOrder
          );

        const t =
          buildScheduledTime(
            trip,
            p
          );

        if(
          Number.isFinite(t) &&
          (
            !Number.isFinite(
              group.scheduledAt
            ) ||
            t <
            group.scheduledAt
          )
        ){
          group.scheduledAt = t;
        }
      }

      group.passengers.push({
        passengerId:id,
        name,
        phone,
        sourceIndex:index,
        status:
          clean(
            p?.status ||
            "Scheduled"
          )
      });

      dropoffs.push({
        stopId:
          `dropoff-${id}`,
        type:"dropoff",
        order:dropoffOrder,
        address:pDropoff,
        lat:dr.lat,
        lng:dr.lng,
        passengers:[{
          passengerId:id,
          name,
          phone,
          sourceIndex:index,
          status:
            clean(
              p?.status ||
              "Scheduled"
            )
        }]
      });
    }
  );

  return [
    ...pickupGroups,
    ...dropoffs
  ]
  .sort(
    (a,b)=>
      a.order-b.order
  );
}

/* ================= ROUTE BUILD ================= */

function buildRouteStops(trip){

  const shared =
    trip?.isShared === true ||
    clean(trip?.tripType)
      .toUpperCase() ===
      "SHARED" ||
    (
      Array.isArray(
        trip?.passengers
      ) &&
      trip.passengers.length > 1
    );

  if(shared){
    return buildSharedStops(
      trip
    );
  }

  const passengers =
    getPassengers(trip);

  const p =
    passengers[0];

  const pu =
    pickupPoint(p,trip);

  const dr =
    dropoffPoint(p,trip);

  const pickup = {
    stopId:"pickup-1",
    type:"pickup",
    order:1,
    address:
      passengerPickup(p,trip),
    lat:pu.lat,
    lng:pu.lng,
    scheduledAt:
      buildScheduledTime(
        trip,
        p
      ),
    passengers:[{
      passengerId:
        passengerId(p,0),
      name:
        passengerName(p,0),
      phone:
        passengerPhone(p),
      sourceIndex:0,
      status:
        clean(
          p?.status ||
          "Scheduled"
        )
    }]
  };

  const middle =
    buildNormalStops(
      trip
    );

  const dropoff = {
    stopId:"dropoff-1",
    type:"dropoff",
    order:
      middle.length + 2,
    address:
      passengerDropoff(p,trip),
    lat:dr.lat,
    lng:dr.lng,
    passengers:[{
      passengerId:
        passengerId(p,0),
      name:
        passengerName(p,0),
      phone:
        passengerPhone(p),
      sourceIndex:0,
      status:
        clean(
          p?.status ||
          "Scheduled"
        )
    }]
  };

  return [
    pickup,
    ...middle,
    dropoff
  ];
}

/* ================= STOP COORDINATES =================

   DISPLAY-ONLY POLICY:
   - No Address Cache request from Driver Map.
   - No Google Geocoder request.
   - No Directions API request.
   - The page uses ONLY lat/lng already saved with the trip.
   - If coordinates are missing, external Google Maps can still open by address,
     but ARRIVED remains locked because a 250m geofence cannot be verified safely.
========================= */

async function ensureStopCoordinates(stop){

  if(!stop){
    return false;
  }

  if(
    validPoint(
      stop.lat,
      stop.lng
    )
  ){
    return true;
  }

  /*
    First fallback:
    use the already-saved server route plan.
    This makes ZERO new Google requests.
  */
  const saved =
    findSavedRoutePoint(
      stop.address,
      stop.type
    );

  if(saved){

    stop.lat =
      saved.lat;

    stop.lng =
      saved.lng;

    return true;
  }

  /*
    Second fallback:
    same saved address regardless of route type.
    Useful for older saved route plans.
  */
  const anySaved =
    findSavedRoutePoint(
      stop.address,
      ""
    );

  if(anySaved){

    stop.lat =
      anySaved.lat;

    stop.lng =
      anySaved.lng;

    return true;
  }

  return false;
}

/* ================= ACTIVE PASSENGERS ================= */

function activePassengers(stop){

  if(
    !stop ||
    !Array.isArray(
      stop.passengers
    )
  ){
    return [];
  }

  return stop.passengers
    .filter(
      p=>{

        const s =
          normalizeStatus(
            p.status
          );

        return ![
          "completed",
          "cancelled",
          "canceled",
          "no show"
        ]
        .includes(s);
      }
    );
}

/* ================= LOCAL STOP STATE ================= */

function stateKey(stop){

  return (
    `driver_stop_state_` +
    `${TRIP_ID}_` +
    `${stop?.stopId || "none"}`
  );
}

function readStopState(stop){

  if(!stop){
    return {};
  }

  try{

    return JSON.parse(
      localStorage.getItem(
        stateKey(stop)
      ) ||
      "{}"
    );

  }catch{
    return {};
  }
}

function saveStopState(
  stop,
  patch={}
){

  if(!stop){
    return;
  }

  const old =
    readStopState(
      stop
    );

  localStorage.setItem(
    stateKey(stop),
    JSON.stringify({
      ...old,
      ...patch,
      stopId:stop.stopId,
      tripId:TRIP_ID
    })
  );
}

function clearTripLocalState(){

  const prefix =
    `driver_stop_state_${TRIP_ID}_`;

  const keys = [];

  for(
    let i=0;
    i<localStorage.length;
    i++
  ){

    const key =
      localStorage.key(i);

    if(
      key &&
      key.startsWith(
        prefix
      )
    ){
      keys.push(key);
    }
  }

  keys.forEach(
    key =>
      localStorage.removeItem(
        key
      )
  );
}

function tripIsFresh(){

  const s =
    normalizeStatus(
      firstValue(
        tripDoc?.dispatchStatus,
        tripDoc?.status,
        "scheduled"
      )
    );

  const fresh =
    [
      "scheduled",
      "confirmed",
      "assigned",
      "sent",
      "accepted",
      "dispatched",
      "upcoming",
      "ready",
      "paid"
    ]
    .includes(s);

  return (
    fresh &&
    !tripDoc?.startedAt &&
    !tripDoc?.arrivedAt
  );
}

function restoreCurrentStop(){

  if(tripIsFresh()){
    clearTripLocalState();
    currentStopIndex = 0;
    return;
  }

  for(
    let i=0;
    i<routeStops.length;
    i++
  ){

    if(
      readStopState(
        routeStops[i]
      ).completed !== true
    ){
      currentStopIndex = i;
      return;
    }
  }

  currentStopIndex =
    Math.max(
      0,
      routeStops.length-1
    );
}

function currentStop(){

  return (
    routeStops[
      currentStopIndex
    ] ||
    null
  );
}

/* ================= GEOFENCE ================= */

function currentDistance(){

  const stop =
    currentStop();

  if(
    !stop ||
    !validPoint(
      driverLat,
      driverLng
    ) ||
    !validPoint(
      stop.lat,
      stop.lng
    )
  ){
    return null;
  }

  return distanceMiles(
    driverLat,
    driverLng,
    stop.lat,
    stop.lng
  );
}

function inside250(){

  const d =
    currentDistance();

  return (
    d !== null &&
    d <=
    EXECUTION.stopRadiusMiles
  );
}

/* ================= TIMER ================= */

function waitDurationSeconds(){

  return (
    Math.max(
      0,
      Number(
        EXECUTION.waitMinutes ||
        0
      )
    ) *
    60
  );
}

function waitStart(stop){

  const state =
    readStopState(stop);

  const arrivedAt =
    num(
      state.arrivedAt
    );

  if(
    !Number.isFinite(
      arrivedAt
    )
  ){
    return null;
  }

  const scheduledAt =
    num(
      stop?.scheduledAt
    );

  if(
    Number.isFinite(
      scheduledAt
    )
  ){

    return Math.max(
      arrivedAt,
      scheduledAt
    );
  }

  return arrivedAt;
}

function timerStarted(stop){

  if(
    !EXECUTION.waitTimerEnabled
  ){
    return true;
  }

  const start =
    waitStart(stop);

  return (
    Number.isFinite(start) &&
    serverNow() >= start
  );
}

function timerRemaining(stop){

  if(
    !EXECUTION.waitTimerEnabled
  ){
    return 0;
  }

  const start =
    waitStart(stop);

  if(
    !Number.isFinite(start)
  ){
    return waitDurationSeconds();
  }

  const elapsed =
    Math.floor(
      (
        serverNow() -
        start
      ) /
      1000
    );

  return Math.max(
    0,
    waitDurationSeconds() -
    elapsed
  );
}

function timerExpired(stop){

  if(
    !EXECUTION.waitTimerEnabled
  ){
    return true;
  }

  return (
    timerStarted(stop) &&
    timerRemaining(stop) <= 0
  );
}

function formatTimer(sec){

  const safe =
    Math.max(
      0,
      Math.floor(sec)
    );

  const min =
    Math.floor(
      safe/60
    );

  const s =
    safe%60;

  return (
    `${String(min).padStart(2,"0")}:` +
    `${String(s).padStart(2,"0")}`
  );
}

function startTimerWatcher(){

  if(timerInterval){
    clearInterval(timerInterval);
  }

  timerInterval =
    setInterval(
      renderExecutionState,
      1000
    );
}

/* ================= GOOGLE MAP ================= */

function markerIcon(color){

  return {
    path:
      google.maps.SymbolPath.CIRCLE,
    fillColor:color,
    fillOpacity:1,
    strokeColor:"#ffffff",
    strokeWeight:3,
    scale:10
  };
}

function initGoogleMap(){

  map =
    new google.maps.Map(
      document.getElementById("map"),
      {
        center:{
          lat:33.4484,
          lng:-112.0740
        },
        zoom:15,
        mapTypeId:
          google.maps.MapTypeId.ROADMAP,
        streetViewControl:false,
        fullscreenControl:false,
        mapTypeControl:false,
        clickableIcons:false,
        gestureHandling:"greedy"
      }
    );

  map.addListener(
    "dragstart",
    ()=>{
      userMovedMap = true;
    }
  );

  map.addListener(
    "zoom_changed",
    ()=>{
      if(!firstGpsFix){
        userMovedMap = true;
      }
    }
  );
}

function updateDriverMarker(){

  if(
    !map ||
    !validPoint(
      driverLat,
      driverLng
    )
  ){
    return;
  }

  const pos = {
    lat:driverLat,
    lng:driverLng
  };

  if(!driverMarker){

    driverMarker =
      new google.maps.Marker({
        map,
        position:pos,
        title:"Driver",
        icon:
          markerIcon(
            "#f59e0b"
          )
      });

  }else{
    driverMarker.setPosition(
      pos
    );
  }
}

function updateStopMarker(){

  const stop =
    currentStop();

  if(!map || !stop){
    return;
  }

  if(stopMarker){
    stopMarker.setMap(null);
    stopMarker = null;
  }

  if(
    !validPoint(
      stop.lat,
      stop.lng
    )
  ){
    return;
  }

  const color =
    stop.type === "pickup"
      ? "#2563eb"
      : stop.type === "dropoff"
        ? "#16a34a"
        : "#7c3aed";

  stopMarker =
    new google.maps.Marker({
      map,
      position:{
        lat:stop.lat,
        lng:stop.lng
      },
      title:
        stop.address ||
        stop.type,
      label:{
        text:
          stop.type === "pickup"
            ? "P"
            : stop.type === "dropoff"
              ? "D"
              : "S",
        color:"#fff",
        fontWeight:"900"
      },
      icon:
        markerIcon(color)
    });
}

function fitMap(){

  if(!map){
    return;
  }

  const bounds =
    new google.maps.LatLngBounds();

  let count = 0;

  if(
    validPoint(
      driverLat,
      driverLng
    )
  ){
    bounds.extend({
      lat:driverLat,
      lng:driverLng
    });
    count++;
  }

  const stop =
    currentStop();

  if(
    validPoint(
      stop?.lat,
      stop?.lng
    )
  ){
    bounds.extend({
      lat:stop.lat,
      lng:stop.lng
    });
    count++;
  }

  if(count >= 2){
    map.fitBounds(bounds,70);
  }else if(count === 1){
    map.fitBounds(bounds,70);
  }
}

function drawDisplayLine(){

  /*
    Intentionally empty:
    Internal map is display-only.
    No route calculation and no Directions request.
  */
}

/* ================= EXTERNAL NAVIGATION ================= */

function openGoogleNavigation(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  let destination = "";

  if(
    validPoint(
      stop.lat,
      stop.lng
    )
  ){
    destination =
      `${stop.lat},${stop.lng}`;
  }else{
    destination =
      encodeURIComponent(
        stop.address || ""
      );
  }

  if(!destination){
    alert("Destination not found");
    return;
  }

  const origin =
    validPoint(
      driverLat,
      driverLng
    )
      ? `&origin=${driverLat},${driverLng}`
      : "";

  window.open(
    "https://www.google.com/maps/dir/?api=1" +
    origin +
    "&destination=" +
    destination +
    "&travelmode=driving",
    "_blank"
  );
}

/* ================= RENDER PASSENGERS ================= */

function renderPassengers(){

  const stop =
    currentStop();

  if(
    !stop ||
    !currentPassengersEl
  ){
    return;
  }

  const visible =
    activePassengers(stop)
    .filter(
      p =>
        !isDriverIdentity(
          p.name,
          p.phone
        )
    );

  currentPassengersEl
    .innerHTML =
      visible
      .map(
        p=>`
          <div class="passenger-chip">
            <strong>${p.name}</strong>
            ${
              p.phone
                ? `<span>${p.phone}</span>`
                : ""
            }
          </div>
        `
      )
      .join("");

  currentPassengersEl
    .style.display =
      visible.length
        ? "flex"
        : "none";
}

/* ================= BUTTON VISIBILITY ================= */

function hideAllButtons(){

  hide(btnDirections);
  hide(btnArrived);
  hide(btnStartRide);
  hide(btnCancel);
  hide(btnCall);
  hide(btnNoShow);
  hide(btnCompleteStop);
  hide(btnCompleteDropoff);
}

function closeReasonBoxes(){

  hide(cancelBox);
  hide(noShowBox);
}

function renderStopHeader(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  stopTypeBadge
    ?.classList
    .remove(
      "dropoff",
      "stop"
    );

  if(stop.type === "pickup"){

    stopTypeBadge.textContent =
      "PICKUP";

  }else if(
    stop.type === "dropoff"
  ){

    stopTypeBadge.textContent =
      "DROPOFF";

    stopTypeBadge
      .classList
      .add("dropoff");

  }else{

    stopTypeBadge.textContent =
      "STOP";

    stopTypeBadge
      .classList
      .add("stop");
  }

  stopProgress.textContent =
    `Stop ${currentStopIndex+1} of ${routeStops.length}`;

  currentStopAddressEl
    .textContent =
      stop.address ||
      stop.resolvedAddress ||
      "Address unavailable";

  renderPassengers();
}

/* ================= STRICT FLOW ================= */

function renderExecutionState(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  const state =
    readStopState(stop);

  hideAllButtons();
  closeReasonBoxes();
  hide(waitTimerEl);
  hide(scheduledTimeBox);

  renderStopHeader();

  const distance =
    currentDistance();

  /* BEFORE ARRIVED */

  if(
    state.arrived !== true
  ){

    if(
      !inside250()
    ){

      setNavText(
        stop.type === "pickup"
          ? "Go to pickup"
          : stop.type === "dropoff"
            ? "Go to dropoff"
            : "Go to stop"
      );

      if(distance !== null){

        setStopStatus(
          `${distance.toFixed(2)} mi from current stop`
        );

      }else{

        setStopStatus(
          "Stop coordinates are not saved — Directions can open by address"
        );
      }

      btnDirections.textContent =
        stop.type === "pickup"
          ? "Go To Pickup / Directions"
          : stop.type === "dropoff"
            ? "Go To Dropoff / Directions"
            : "Go To Stop / Directions";

      show(btnDirections);

      return;
    }

    setNavText(
      stop.type === "pickup"
        ? "Pickup reached"
        : stop.type === "dropoff"
          ? "Dropoff reached"
          : "Stop reached"
    );

    setStopStatus(
      "Press ARRIVED"
    );

    show(btnArrived);

    return;
  }

  /* PICKUP AFTER ARRIVED */

  if(stop.type === "pickup"){

    const scheduledAt =
      num(
        stop.scheduledAt
      );

    if(
      Number.isFinite(scheduledAt) &&
      serverNow() <
      scheduledAt
    ){

      setNavText(
        "Waiting for scheduled time"
      );

      setStopStatus(
        "Wait timer has not started"
      );

      scheduledTimeBox.textContent =
        `Starts ${formatScheduledTime(scheduledAt)}`;

      show(scheduledTimeBox);

      return;
    }

    if(
      EXECUTION.waitTimerEnabled &&
      !timerExpired(stop)
    ){

      setNavText(
        "Waiting for passenger"
      );

      setStopStatus(
        activePassengers(stop).length > 1
          ? "Shared pickup timer running"
          : "Passenger wait timer running"
      );

      waitTimerEl.textContent =
        formatTimer(
          timerRemaining(stop)
        );

      show(waitTimerEl);

      show(btnStartRide);
      show(btnCancel);

      return;
    }

    setNavText(
      "Waiting time finished"
    );

    setStopStatus(
      "Choose Start Ride or No Show"
    );

    if(
      EXECUTION.waitTimerEnabled
    ){
      waitTimerEl.textContent =
        "TIME UP";

      show(waitTimerEl);
    }

    show(btnStartRide);
    show(btnCall);
    show(btnNoShow);

    return;
  }

  /* INTERMEDIATE STOP AFTER ARRIVED */

  if(stop.type === "stop"){

    setNavText(
      "Stop reached"
    );

    setStopStatus(
      "Complete this stop to continue"
    );

    show(btnCompleteStop);

    return;
  }

  /* DROPOFF AFTER ARRIVED */

  if(stop.type === "dropoff"){

    setNavText(
      "Dropoff reached"
    );

    setStopStatus(
      "Complete this dropoff"
    );

    show(btnCompleteDropoff);
  }
}

/* ================= PASSENGER STATUS UPDATES ================= */

function isSharedTrip(){

  return (
    tripDoc?.isShared === true ||
    clean(tripDoc?.tripType)
      .toUpperCase() ===
      "SHARED" ||
    (
      Array.isArray(
        tripDoc?.passengers
      ) &&
      tripDoc.passengers.length > 1
    )
  );
}

function updateSharedPassengers(
  stop,
  status,
  extra={}
){

  const ids =
    new Set(
      activePassengers(stop)
      .map(
        p =>
          String(
            p.passengerId
          )
      )
    );

  const next =
    (tripDoc.passengers || [])
    .map(
      (p,index)=>{

        const id =
          passengerId(
            p,
            index
          );

        if(
          !ids.has(
            String(id)
          )
        ){
          return p;
        }

        return {
          ...p,
          status,
          ...extra
        };
      }
    );

  return next;
}

function allSharedPassengersFinal(
  passengers
){

  return passengers.every(
    p=>{

      const s =
        normalizeStatus(
          p.status
        );

      return [
        "completed",
        "cancelled",
        "canceled",
        "no show"
      ]
      .includes(s);
    }
  );
}

/* ================= ADVANCE ================= */

async function advanceStop(
  autoOpenGoogle=true
){

  const stop =
    currentStop();

  if(stop){

    saveStopState(
      stop,
      {
        completed:true,
        completedAt:
          serverNow()
      }
    );
  }

  if(
    currentStopIndex <
    routeStops.length - 1
  ){

    currentStopIndex++;

    updateStopMarker();

    renderExecutionState();

    fitMap();

    if(autoOpenGoogle){
      setTimeout(
        openGoogleNavigation,
        250
      );
    }

    return;
  }

  setNavText(
    "Route complete"
  );

  setStopStatus(
    "All trip stops finished"
  );

  hideAllButtons();

  localStorage.removeItem(
    "activeDriverTripId"
  );
}

/* ================= BUTTONS ================= */

btnDirections
  ?.addEventListener(
    "click",
    ()=>{
      openGoogleNavigation();
    }
  );

btnArrived
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(!stop){
        return;
      }

      if(
        !inside250()
      ){

        alert(
          "You must be inside the 250 meter area first."
        );

        renderExecutionState();

        return;
      }

      const arrivedAt =
        serverNow();

      saveStopState(
        stop,
        {
          arrived:true,
          arrivedAt
        }
      );

      /*
        Trip-level Arrived is only used for the first pickup.
        Other stops remain local/per-stop so they do not overwrite
        the entire trip workflow.
      */
      if(
        stop.type === "pickup" &&
        currentStopIndex === 0
      ){

        try{

          await updateTrip({
            status:"Arrived",
            arrivedAt,
            driverId:DRIVER_ID,
            driverName:DRIVER_NAME
          });

        }catch(err){
          console.log(err);
        }
      }

      renderExecutionState();
    }
  );

btnStartRide
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !== "pickup"
      ){
        return;
      }

      if(
        Number.isFinite(
          stop.scheduledAt
        ) &&
        serverNow() <
        stop.scheduledAt
      ){

        alert(
          "Trip time has not started yet."
        );

        return;
      }

      const startedAt =
        serverNow();

      try{

        if(isSharedTrip()){

          const passengers =
            updateSharedPassengers(
              stop,
              "On Trip",
              {
                startedAt
              }
            );

          await updateTrip({
            status:"InProgress",
            passengers,
            driverId:DRIVER_ID,
            driverName:DRIVER_NAME
          });

        }else{

          await updateTrip({
            status:"InProgress",
            startedAt,
            driverId:DRIVER_ID,
            driverName:DRIVER_NAME
          });
        }

      }catch(err){

        alert(err.message);
        return;
      }

      saveStopState(
        stop,
        {
          rideStarted:true,
          rideStartedAt:
            startedAt,
          completed:true
        }
      );

      await advanceStop(
        true
      );
    }
  );

btnCancel
  ?.addEventListener(
    "click",
    ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !== "pickup"
      ){
        return;
      }

      if(
        timerExpired(stop)
      ){
        renderExecutionState();
        return;
      }

      cancelNotes.value = "";

      show(
        cancelBox,
        "flex"
      );
    }
  );

btnCloseCancel
  ?.addEventListener(
    "click",
    ()=>{

      hide(cancelBox);
      cancelNotes.value = "";
      renderExecutionState();
    }
  );

btnCompleteCancel
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      const reason =
        clean(
          cancelNotes.value
        );

      if(!reason){

        alert(
          "Please enter cancel reason."
        );

        return;
      }

      try{

        if(isSharedTrip()){

          const passengers =
            updateSharedPassengers(
              stop,
              "Cancelled",
              {
                cancelReason:reason,
                cancelFee:
                  Number(
                    tripDoc.cancelFee ||
                    0
                  )
              }
            );

          await updateTrip({
            status:
              allSharedPassengersFinal(
                passengers
              )
                ? "Cancelled"
                : "InProgress",
            passengers
          });

        }else{

          await updateTrip({
            status:"Cancelled",
            cancelReason:reason,
            cancelFee:
              Number(
                tripDoc.cancelFee ||
                0
              )
          });
        }

      }catch(err){

        alert(err.message);
        return;
      }

      saveStopState(
        stop,
        {
          cancelled:true,
          cancelReason:reason,
          completed:true
        }
      );

      hide(cancelBox);

      await advanceStop(true);
    }
  );

btnCall
  ?.addEventListener(
    "click",
    ()=>{

      const phone =
        activePassengers(
          currentStop()
        )
        .filter(
          p =>
            !isDriverIdentity(
              p.name,
              p.phone
            )
        )
        .find(
          p =>
            p.phone
        )
        ?.phone ||
        "";

      if(!phone){

        alert(
          "Passenger phone not found."
        );

        return;
      }

      window.location.href =
        `tel:${phone}`;
    }
  );

btnNoShow
  ?.addEventListener(
    "click",
    ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !== "pickup"
      ){
        return;
      }

      if(
        EXECUTION.noShowRequiresTimer &&
        !timerExpired(stop)
      ){

        alert(
          "Wait timer must finish first."
        );

        return;
      }

      noShowNotes.value = "";

      show(
        noShowBox,
        "flex"
      );
    }
  );

btnCloseNoShow
  ?.addEventListener(
    "click",
    ()=>{

      hide(noShowBox);
      noShowNotes.value = "";
      renderExecutionState();
    }
  );

btnCompleteNoShow
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      const reason =
        clean(
          noShowNotes.value
        );

      if(!reason){

        alert(
          "Please enter no show reason."
        );

        return;
      }

      if(
        EXECUTION.noShowRequiresTimer &&
        !timerExpired(stop)
      ){

        alert(
          "Wait timer must finish first."
        );

        return;
      }

      const fee =
        Number(
          tripDoc.noShowFee ||
          0
        );

      try{

        if(isSharedTrip()){

          const passengers =
            updateSharedPassengers(
              stop,
              "No Show",
              {
                noShowReason:reason,
                noShowFee:fee,
                finalPrice:fee,
                priceAmount:fee
              }
            );

          await updateTrip({
            status:
              allSharedPassengersFinal(
                passengers
              )
                ? "No Show"
                : "InProgress",
            passengers,
            noShowFee:fee
          });

        }else{

          /*
            Server finalizer owns the actual No Show fee logic.
            The driver app passes the configured trip noShowFee only.
          */
          await updateTrip({
            status:"No Show",
            noShowReason:reason,
            noShowFee:fee
          });
        }

      }catch(err){

        alert(err.message);
        return;
      }

      saveStopState(
        stop,
        {
          noShow:true,
          noShowReason:reason,
          completed:true
        }
      );

      hide(noShowBox);

      await advanceStop(true);
    }
  );

btnCompleteStop
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !== "stop"
      ){
        return;
      }

      if(!inside250()){

        alert(
          "You must be inside the 250 meter stop area first."
        );

        return;
      }

      saveStopState(
        stop,
        {
          completed:true,
          completedAt:
            serverNow()
        }
      );

      await advanceStop(true);
    }
  );

btnCompleteDropoff
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !== "dropoff"
      ){
        return;
      }

      if(!inside250()){

        alert(
          "You must be inside the 250 meter dropoff area first."
        );

        return;
      }

      try{

        if(isSharedTrip()){

          const ids =
            new Set(
              stop.passengers
              .map(
                p =>
                  String(
                    p.passengerId
                  )
              )
            );

          const passengers =
            (tripDoc.passengers || [])
            .map(
              (p,index)=>{

                const id =
                  passengerId(
                    p,
                    index
                  );

                if(
                  ids.has(
                    String(id)
                  )
                ){
                  return {
                    ...p,
                    status:"Completed",
                    completedAt:
                      serverNow()
                  };
                }

                return p;
              }
            );

          const allFinal =
            allSharedPassengersFinal(
              passengers
            );

          await updateTrip({
            status:
              allFinal
                ? "Completed"
                : "InProgress",
            passengers,
            finalPrice:
              Number(
                tripDoc.finalPrice ||
                tripDoc.priceAmount ||
                0
              )
          });

        }else{

          await updateTrip({
            status:"Completed",
            completedAt:
              serverNow(),
            finalPrice:
              Number(
                tripDoc.finalPrice ||
                tripDoc.priceAmount ||
                0
              )
          });
        }

      }catch(err){

        alert(err.message);
        return;
      }

      saveStopState(
        stop,
        {
          completed:true,
          completedAt:
            serverNow()
        }
      );

      await advanceStop(true);
    }
  );

recenterBtn
  ?.addEventListener(
    "click",
    ()=>{

      userMovedMap = false;
      fitMap();
    }
  );

/* ================= LOCATION PUSH ================= */

function shouldSendLocation(
  lat,
  lng
){

  if(!lastSentLocationAt){
    return true;
  }

  if(
    serverNow() -
    lastSentLocationAt >=
    LOCATION_PUSH_MS
  ){
    return true;
  }

  if(
    validPoint(
      lastSentLat,
      lastSentLng
    )
  ){

    return (
      distanceMiles(
        lastSentLat,
        lastSentLng,
        lat,
        lng
      ) >=
      LOCATION_PUSH_MILES
    );
  }

  return false;
}

async function sendLocation(
  lat,
  lng
){

  if(
    !DRIVER_ID ||
    !shouldSendLocation(
      lat,
      lng
    )
  ){
    return;
  }

  lastSentLocationAt =
    serverNow();

  lastSentLat = lat;
  lastSentLng = lng;

  try{

    await fetch(
      "/api/driver/location",
      {
        method:"POST",
        headers:{
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            driverId:DRIVER_ID,
            name:DRIVER_NAME,
            lat,
            lng,
            tripId:TRIP_ID,
            currentStopId:
              currentStop()?.stopId ||
              "",
            currentStopIndex,
            time:
              lastSentLocationAt
          })
      }
    );

  }catch{}
}

/* ================= GPS ================= */

function startGps(){

  if(
    !navigator.geolocation
  ){

    gpsBadge.textContent =
      "GPS unavailable";

    return;
  }

  if(watchId !== null){

    navigator.geolocation
      .clearWatch(
        watchId
      );
  }

  watchId =
    navigator.geolocation
    .watchPosition(

      async pos=>{

        driverLat =
          pos.coords.latitude;

        driverLng =
          pos.coords.longitude;

        gpsBadge.textContent =
          "GPS Active";

        updateDriverMarker();

        await sendLocation(
          driverLat,
          driverLng
        );

        const stop =
          currentStop();

        if(firstGpsFix){

          firstGpsFix = false;
          userMovedMap = false;

          updateStopMarker();
          fitMap();

        }else if(
          !userMovedMap
        ){

          fitMap();
        }

        renderExecutionState();
      },

      err=>{

        console.log(
          "GPS error:",
          err
        );

        gpsBadge.textContent =
          "GPS Error";

        setStopStatus(
          "Enable location access"
        );
      },

      {
        enableHighAccuracy:true,
        maximumAge:1000,
        timeout:10000
      }
    );
}

/* ================= INIT ================= */

async function initPage(){

  try{

    setNavText(
      "Loading trip..."
    );

    await syncServerClock();
    await loadSystemDesign();
    await loadAppConfig();
    await loadGoogleMaps();
    await syncServerClock();

    initGoogleMap();

    tripDoc =
      await fetchTrip();

    routeStops =
      buildRouteStops(
        tripDoc
      );

    for(const stop of routeStops){
      await ensureStopCoordinates(
        stop
      );
    }

    if(!routeStops.length){
      throw new Error(
        "No route stops found"
      );
    }

    restoreCurrentStop();

    updateStopMarker();
    renderExecutionState();

    startTimerWatcher();
    startGps();

  }catch(err){

    console.log(
      "MAP INIT ERROR:",
      err
    );

    setNavText(
      "Map failed to load"
    );

    setStopStatus(
      err.message ||
      "Unable to load trip"
    );
  }
}

/* ================= RETURN FROM GOOGLE NAV ================= */

document.addEventListener(
  "visibilitychange",
  async ()=>{

    if(document.hidden){
      return;
    }

    await syncServerClock();

    renderExecutionState();

    if(map){
      fitMap();
    }
  }
);

window.addEventListener(
  "pageshow",
  async ()=>{

    await syncServerClock();
    renderExecutionState();
  }
);

window.addEventListener(
  "beforeunload",
  ()=>{

    if(timerInterval){
      clearInterval(
        timerInterval
      );
    }

    if(
      watchId !== null &&
      navigator.geolocation
    ){
      navigator.geolocation
        .clearWatch(
          watchId
        );
    }
  }
);

/* ================= START ================= */

initPage();