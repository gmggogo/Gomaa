/* =====================================================
   SUNBEAM DRIVER MAP V2 — STRICT EXECUTION FLOW

   REAL MAP:
   - Leaflet + OpenStreetMap tiles.
   - NO route calculation.
   - NO geocoding.
   - NO Google Directions API.
   - External navigation opens Google Maps only when required.

   STRICT BUTTON ORDER:
   1) GO TO PICKUP while outside pickup radius.
   2) ARRIVED only inside pickup radius.
   3) If early, wait until scheduled trip time.
   4) At scheduled time, wait timer starts.
      START RIDE + CANCEL are available during timer.
   5) After timer expires:
      START RIDE + NO SHOW.
   6) START RIDE automatically opens Google Maps to next stop.
   7) At dropoff radius:
      DROP OFF / COMPLETE.

   SHARED:
   - Same physical pickup => one pickup group and one timer.
   - Different pickup => separate pickup group and timer.
   - Server route order is preserved.
===================================================== */

console.log("Sunbeam Driver Map V2 strict flow");

/* =========================
   AUTH
========================= */

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
  String(
    driver._id ||
    driver.id ||
    ""
  );

const DRIVER_NAME =
  driver.name ||
  driver.fullName ||
  driver.username ||
  "Driver";

/* =========================
   TRIP ID
========================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const TRIP_ID =
  String(
    params.get("tripId") ||
    ""
  );

/* =========================
   TEMP EXECUTION SETTINGS

   Later these values come from Admin.
========================= */

const EXECUTION = {

  waitTimerEnabled:true,

  waitMinutes:10,

  pickupRadiusMiles:0.15,

  dropoffRadiusMiles:0.10,

  noShowRequiresTimer:true,

  noShowRequiresCall:false

};

/* =========================
   DOM
========================= */

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

const btnGoPickup =
  document.getElementById("btnGoPickup");

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

const btnDropoff =
  document.getElementById("btnDropoff");

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

/* =========================
   PAGE STATE
========================= */

let tripDoc = null;

let routeStops = [];

let currentStopIndex = 0;

let map = null;

let driverMarker = null;

let stopMarker = null;

let straightLine = null;

let driverLat = null;

let driverLng = null;

let firstGpsFix = true;

let userMovedMap = false;

let watchId = null;

let waitInterval = null;

let serverOffset = 0;

let lastSentLocationAt = 0;

let lastSentLat = null;

let lastSentLng = null;

const LOCATION_PUSH_MS = 20000;

const LOCATION_PUSH_MILES = 0.25;

/* =========================
   BASIC HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function num(v,def=null){

  const n =
    Number(v);

  return Number.isFinite(n)
    ? n
    : def;
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

function show(el,display="block"){

  if(el){
    el.style.display = display;
  }
}

function hide(el){

  if(el){
    el.style.display = "none";
  }
}

function setNavText(text){

  if(navTextEl){
    navTextEl.textContent = text;
  }
}

function setStopStatus(text){

  if(stopStatusText){
    stopStatusText.textContent = text;
  }
}

function normalizeStatus(v){

  return clean(v)
    .toLowerCase()
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

/* =========================
   SERVER CLOCK

   App logic never trusts phone clock directly.
========================= */

function serverNow(){
  return Date.now() + serverOffset;
}

async function syncServerClock(){

  try{

    const res =
      await fetch(
        "/api/config",
        {
          cache:"no-store"
        }
      );

    const dateHeader =
      res.headers.get("date");

    if(dateHeader){

      const serverMs =
        new Date(
          dateHeader
        ).getTime();

      if(Number.isFinite(serverMs)){

        serverOffset =
          serverMs - Date.now();
      }
    }

  }catch(err){
    console.log("SERVER CLOCK:",err);
  }
}

/* =========================
   DISTANCE
========================= */

function distanceMiles(
  lat1,
  lon1,
  lat2,
  lon2
){

  const R =
    3958.8;

  const dLat =
    (
      (lat2-lat1) *
      Math.PI
    ) / 180;

  const dLon =
    (
      (lon2-lon1) *
      Math.PI
    ) / 180;

  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1-a)
    )
  );
}

function currentDistanceToStop(){

  const stop =
    currentStop();

  if(
    !stop ||
    !Number.isFinite(stop.lat) ||
    !Number.isFinite(stop.lng) ||
    !Number.isFinite(driverLat) ||
    !Number.isFinite(driverLng)
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

function insidePickupRadius(){

  const d =
    currentDistanceToStop();

  return (
    d !== null &&
    d <= EXECUTION.pickupRadiusMiles
  );
}

function insideDropoffRadius(){

  const d =
    currentDistanceToStop();

  return (
    d !== null &&
    d <= EXECUTION.dropoffRadiusMiles
  );
}

/* =========================
   TRIP TIME
========================= */

function buildTripScheduledTime(
  trip,
  stop=null
){

  const direct =
    firstValue(
      stop?.scheduledAt,
      stop?.tripDateTime,
      stop?.pickupDateTime
    );

  if(direct){

    const ms =
      new Date(
        direct
      ).getTime();

    if(Number.isFinite(ms)){
      return ms;
    }
  }

  const date =
    clean(
      firstValue(
        stop?.tripDate,
        trip?.tripDate,
        trip?.date
      )
    );

  const time =
    clean(
      firstValue(
        stop?.tripTime,
        stop?.pickupTime,
        trip?.tripTime,
        trip?.time
      )
    );

  if(
    !date ||
    !time
  ){
    return null;
  }

  const parsed =
    new Date(
      `${date}T${time}`
    ).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatScheduledTime(ms){

  if(!Number.isFinite(ms)){
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      hour:"numeric",
      minute:"2-digit",
      hour12:true
    }
  ).format(
    new Date(ms)
  );
}

/* =========================
   PASSENGERS
========================= */

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

function passengerName(
  p,
  index
){

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

function passengerPickup(
  p,
  trip
){

  return clean(
    firstValue(
      p?.pickup,
      p?.pickupAddress,
      trip?.pickup,
      trip?.pickupAddress
    )
  );
}

function passengerDropoff(
  p,
  trip
){

  return clean(
    firstValue(
      p?.dropoff,
      p?.dropoffAddress,
      trip?.dropoff,
      trip?.dropoffAddress
    )
  );
}

function pickupPoint(
  p,
  trip
){

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

function dropoffPoint(
  p,
  trip
){

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
    Array.isArray(
      trip?.passengers
    ) &&
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
        trip?.name,
        "Passenger"
      ),
    clientPhone:
      firstValue(
        trip?.clientPhone,
        trip?.phone
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
    dropoffOrder:2,
    tripDate:trip?.tripDate,
    tripTime:trip?.tripTime
  }];
}

/* =========================
   PICKUP GROUP MATCHING
========================= */

function normalizeAddressKey(v){

  return clean(v)
    .toLowerCase()
    .replace(/[.,#]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function sameCoordinate(
  a,
  b
){

  if(
    !a ||
    !b ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lng)
  ){
    return false;
  }

  /*
    ~100 feet.
    Same physical pickup can share one wait timer.
  */
  return (
    distanceMiles(
      a.lat,
      a.lng,
      b.lat,
      b.lng
    ) <= 0.02
  );
}

function pickupIdentity(
  passenger,
  trip
){

  const explicit =
    clean(
      firstValue(
        passenger?.pickupGroupId,
        passenger?.pickupStopId,
        passenger?.pickupAddressKey,
        passenger?.addressKey
      )
    );

  if(explicit){

    return {
      explicit:
        `KEY:${explicit.toLowerCase()}`,
      address:"",
      point:
        pickupPoint(
          passenger,
          trip
        )
    };
  }

  return {
    explicit:"",
    address:
      normalizeAddressKey(
        passengerPickup(
          passenger,
          trip
        )
      ),
    point:
      pickupPoint(
        passenger,
        trip
      )
  };
}

function pickupGroupMatches(
  group,
  passenger,
  trip
){

  const identity =
    pickupIdentity(
      passenger,
      trip
    );

  if(
    identity.explicit &&
    group.explicit
  ){
    return (
      identity.explicit ===
      group.explicit
    );
  }

  if(
    identity.address &&
    group.addressKey &&
    identity.address ===
    group.addressKey
  ){
    return true;
  }

  return sameCoordinate(
    group.point,
    identity.point
  );
}

/* =========================
   ROUTE BUILD

   Saved server order always wins.
========================= */

function buildRouteStops(trip){

  const passengers =
    getPassengers(trip);

  const pickupGroups = [];

  const dropoffs = [];

  passengers.forEach(
    (p,index)=>{

      const pId =
        passengerId(
          p,
          index
        );

      const pName =
        passengerName(
          p,
          index
        );

      const phone =
        passengerPhone(p);

      const pPickup =
        passengerPickup(
          p,
          trip
        );

      const pDropoff =
        passengerDropoff(
          p,
          trip
        );

      const pPoint =
        pickupPoint(
          p,
          trip
        );

      const dPoint =
        dropoffPoint(
          p,
          trip
        );

      const pickupOrder =
        num(
          firstValue(
            p?.pickupOrder,
            p?.pickupSequence,
            p?.routePickupOrder
          ),
          index*2+1
        );

      const dropoffOrder =
        num(
          firstValue(
            p?.dropoffOrder,
            p?.dropoffSequence,
            p?.routeDropoffOrder
          ),
          index*2+2
        );

      const identity =
        pickupIdentity(
          p,
          trip
        );

      let group =
        pickupGroups.find(
          existing =>
            pickupGroupMatches(
              existing,
              p,
              trip
            )
        );

      if(!group){

        group = {

          stopId:
            `pickup-${pickupGroups.length+1}`,

          type:"pickup",

          order:
            pickupOrder,

          address:
            pPickup,

          lat:
            pPoint.lat,

          lng:
            pPoint.lng,

          point:
            pPoint,

          explicit:
            identity.explicit,

          addressKey:
            identity.address,

          scheduledAt:
            buildTripScheduledTime(
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

        const schedule =
          buildTripScheduledTime(
            trip,
            p
          );

        /*
          Same pickup group uses the earliest scheduled pickup time
          if passengers at that location have different times.
        */
        if(
          Number.isFinite(schedule) &&
          (
            !Number.isFinite(
              group.scheduledAt
            ) ||
            schedule <
            group.scheduledAt
          )
        ){
          group.scheduledAt =
            schedule;
        }
      }

      group.passengers.push({

        passengerId:pId,

        name:pName,

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
          `dropoff-${pId}`,

        type:"dropoff",

        order:
          dropoffOrder,

        address:
          pDropoff,

        lat:
          dPoint.lat,

        lng:
          dPoint.lng,

        passengers:[{
          passengerId:pId,
          name:pName,
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
      a.order-b.order ||
      (
        a.type === "pickup"
          ? -1
          : 1
      )
  );
}

/* =========================
   CURRENT STOP
========================= */

function currentStop(){

  return (
    routeStops[
      currentStopIndex
    ] ||
    null
  );
}

function activePassengers(
  stop
){

  if(!stop){
    return [];
  }

  return stop.passengers.filter(
    p=>{

      const s =
        normalizeStatus(
          p.status
        );

      return ![
        "no show",
        "cancelled",
        "canceled",
        "completed"
      ].includes(s);
    }
  );
}

/* =========================
   LOCAL STOP STATE
========================= */

function stopStateKey(
  stop
){

  return (
    `driver_stop_state_` +
    `${TRIP_ID}_` +
    `${stop?.stopId || "none"}`
  );
}

function readStopState(
  stop
){

  if(!stop){
    return {};
  }

  try{

    return JSON.parse(
      localStorage.getItem(
        stopStateKey(
          stop
        )
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
    stopStateKey(
      stop
    ),
    JSON.stringify({
      ...old,
      ...patch,
      tripId:TRIP_ID,
      stopId:stop.stopId
    })
  );
}

function restoreCurrentStop(){

  for(
    let i=0;
    i<routeStops.length;
    i++
  ){

    const state =
      readStopState(
        routeStops[i]
      );

    if(
      state.completed !== true
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

/* =========================
   TIMER

   If driver arrives early:
   timerStart = scheduled trip time.

   If driver arrives late:
   timerStart = arrived time.

   Therefore:
   waitStart = max(arrivedAt, scheduledAt)
========================= */

function waitSeconds(){

  return Math.max(
    0,
    Number(
      EXECUTION.waitMinutes ||
      0
    ) * 60
  );
}

function waitStartForStop(
  stop
){

  const state =
    readStopState(
      stop
    );

  const arrivedAt =
    num(
      state.arrivedAt,
      null
    );

  const scheduledAt =
    num(
      stop?.scheduledAt,
      null
    );

  if(
    !Number.isFinite(
      arrivedAt
    )
  ){
    return null;
  }

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

function waitHasStarted(
  stop
){

  if(
    !EXECUTION.waitTimerEnabled
  ){
    return true;
  }

  const start =
    waitStartForStop(
      stop
    );

  if(
    !Number.isFinite(
      start
    )
  ){
    return false;
  }

  return (
    serverNow() >=
    start
  );
}

function waitRemaining(
  stop
){

  if(
    !EXECUTION.waitTimerEnabled
  ){
    return 0;
  }

  const start =
    waitStartForStop(
      stop
    );

  if(
    !Number.isFinite(
      start
    )
  ){
    return waitSeconds();
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
    waitSeconds() -
    elapsed
  );
}

function timerExpired(
  stop
){

  if(
    !EXECUTION.waitTimerEnabled
  ){
    return true;
  }

  return (
    waitHasStarted(stop) &&
    waitRemaining(stop) <= 0
  );
}

function formatTimer(sec){

  const safe =
    Math.max(
      0,
      Math.floor(sec)
    );

  const m =
    Math.floor(
      safe/60
    );

  const s =
    safe%60;

  return (
    `${String(m).padStart(2,"0")}:` +
    `${String(s).padStart(2,"0")}`
  );
}

function stopTimer(){

  if(waitInterval){

    clearInterval(
      waitInterval
    );

    waitInterval = null;
  }

  hide(waitTimerEl);
}

function startTimerWatcher(){

  stopTimer();

  waitInterval =
    setInterval(
      ()=>{
        renderExecutionState();
      },
      1000
    );
}

/* =========================
   API
========================= */

async function fetchTrip(){

  if(!TRIP_ID){

    alert(
      "No trip found"
    );

    window.location.href =
      "/driver/trips.html";

    return null;
  }

  const res =
    await fetch(
      `/api/trips/${TRIP_ID}`,
      {
        cache:"no-store"
      }
    );

  if(!res.ok){

    throw new Error(
      "Trip load failed"
    );
  }

  return await res.json();
}

/*
  IMPORTANT:
  This sends execution evidence only.
  The DRIVER APP does NOT calculate No Show fees.
  The server/service pricing policy decides any fee.
*/
async function saveExecutionEvent(
  event,
  payload={}
){

  const stop =
    currentStop();

  try{

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
            JSON.stringify({

              driverId:
                DRIVER_ID,

              driverName:
                DRIVER_NAME,

              driverExecutionEvent:
                event,

              driverExecutionAt:
                serverNow(),

              currentStopId:
                stop?.stopId ||
                "",

              currentStopIndex,

              ...payload
            })
        }
      );

    if(res.ok){

      try{
        tripDoc =
          await res.json();
      }catch{}
    }

    return res.ok;

  }catch(err){

    console.log(
      "EXECUTION SAVE:",
      err
    );

    return false;
  }
}

/* =========================
   LOCATION PUSH
========================= */

function shouldSendLocation(
  lat,
  lng
){

  if(!lastSentLocationAt){
    return true;
  }

  const now =
    serverNow();

  if(
    now -
    lastSentLocationAt
    >=
    LOCATION_PUSH_MS
  ){
    return true;
  }

  if(
    Number.isFinite(
      lastSentLat
    ) &&
    Number.isFinite(
      lastSentLng
    )
  ){

    const moved =
      distanceMiles(
        lastSentLat,
        lastSentLng,
        lat,
        lng
      );

    if(
      moved >=
      LOCATION_PUSH_MILES
    ){
      return true;
    }
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

  lastSentLat =
    lat;

  lastSentLng =
    lng;

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

            driverId:
              DRIVER_ID,

            name:
              DRIVER_NAME,

            lat,

            lng,

            tripId:
              TRIP_ID,

            currentStopId:
              currentStop()?.stopId ||
              "",

            time:
              lastSentLocationAt
          })
      }
    );

  }catch(err){
    console.log(
      "LOCATION PUSH:",
      err
    );
  }
}

/* =========================
   REAL OSM MAP
========================= */

function markerIcon(
  kind
){

  const className =
    kind === "driver"
      ? "driver-pin"
      : kind === "pickup"
        ? "stop-pin pickup-pin"
        : "stop-pin dropoff-pin";

  const text =
    kind === "driver"
      ? "●"
      : kind === "pickup"
        ? "P"
        : "D";

  return L.divIcon({

    className:"",

    html:
      `<div class="${className}">` +
      `${text}` +
      `</div>`,

    iconSize:[28,28],

    iconAnchor:[14,14]
  });
}

function initMap(){

  if(
    typeof L ===
    "undefined"
  ){
    throw new Error(
      "Map library failed to load"
    );
  }

  const stop =
    currentStop();

  const lat =
    Number.isFinite(
      stop?.lat
    )
      ? stop.lat
      : 33.4484;

  const lng =
    Number.isFinite(
      stop?.lng
    )
      ? stop.lng
      : -112.0740;

  map =
    L.map(
      "map",
      {
        zoomControl:false,
        attributionControl:true
      }
    )
    .setView(
      [lat,lng],
      15
    );

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom:19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  )
  .addTo(map);

  L.control.zoom({
    position:"bottomleft"
  })
  .addTo(map);

  map.on(
    "dragstart",
    ()=>{
      userMovedMap = true;
    }
  );

  map.on(
    "zoomstart",
    ()=>{
      if(!firstGpsFix){
        userMovedMap = true;
      }
    }
  );

  updateMapTarget();
}

function updateDriverMarker(
  lat,
  lng
){

  if(!map){
    return;
  }

  if(!driverMarker){

    driverMarker =
      L.marker(
        [lat,lng],
        {
          icon:
            markerIcon(
              "driver"
            )
        }
      )
      .addTo(map);

  }else{

    driverMarker.setLatLng(
      [lat,lng]
    );
  }
}

function updateMapTarget(){

  if(!map){
    return;
  }

  const stop =
    currentStop();

  if(stopMarker){

    map.removeLayer(
      stopMarker
    );

    stopMarker = null;
  }

  if(
    stop &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lng)
  ){

    stopMarker =
      L.marker(
        [
          stop.lat,
          stop.lng
        ],
        {
          icon:
            markerIcon(
              stop.type
            )
        }
      )
      .addTo(map);

    stopMarker.bindPopup(
      esc(
        stop.address ||
        (
          stop.type === "pickup"
            ? "Pickup"
            : "Dropoff"
        )
      )
    );
  }

  drawStraightLine();

  if(!userMovedMap){
    fitMap();
  }
}

function drawStraightLine(){

  if(!map){
    return;
  }

  if(straightLine){

    map.removeLayer(
      straightLine
    );

    straightLine = null;
  }

  const stop =
    currentStop();

  if(
    !stop ||
    !Number.isFinite(stop.lat) ||
    !Number.isFinite(stop.lng) ||
    !Number.isFinite(driverLat) ||
    !Number.isFinite(driverLng)
  ){
    return;
  }

  straightLine =
    L.polyline(
      [
        [
          driverLat,
          driverLng
        ],
        [
          stop.lat,
          stop.lng
        ]
      ],
      {
        color:
          stop.type === "pickup"
            ? "#2563eb"
            : "#16a34a",
        weight:5,
        opacity:.85
      }
    )
    .addTo(map);
}

function fitMap(){

  if(!map){
    return;
  }

  const points = [];

  if(
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng)
  ){

    points.push(
      [
        driverLat,
        driverLng
      ]
    );
  }

  const stop =
    currentStop();

  if(
    Number.isFinite(stop?.lat) &&
    Number.isFinite(stop?.lng)
  ){

    points.push(
      [
        stop.lat,
        stop.lng
      ]
    );
  }

  if(points.length >= 2){

    map.fitBounds(
      points,
      {
        padding:[55,55],
        maxZoom:16
      }
    );

  }else if(
    points.length === 1
  ){

    map.setView(
      points[0],
      15
    );
  }
}

/* =========================
   GOOGLE MAPS EXTERNAL NAV

   No API request.
========================= */

function openDirectionsToStop(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  let destination = "";

  if(
    Number.isFinite(
      stop.lat
    ) &&
    Number.isFinite(
      stop.lng
    )
  ){

    destination =
      `${stop.lat},${stop.lng}`;

  }else if(
    stop.address
  ){

    destination =
      encodeURIComponent(
        stop.address
      );

  }else{

    alert(
      "Destination not found"
    );

    return;
  }

  let origin = "";

  if(
    Number.isFinite(
      driverLat
    ) &&
    Number.isFinite(
      driverLng
    )
  ){

    origin =
      `&origin=` +
      `${driverLat},${driverLng}`;
  }

  const url =
    `https://www.google.com/maps/dir/` +
    `?api=1` +
    `${origin}` +
    `&destination=${destination}` +
    `&travelmode=driving`;

  window.open(
    url,
    "_blank"
  );
}

/* =========================
   UI PASSENGERS
========================= */

function renderPassengers(){

  const stop =
    currentStop();

  if(
    !currentPassengersEl ||
    !stop
  ){
    return;
  }

  currentPassengersEl.innerHTML =
    activePassengers(stop)
      .map(
        p=>`
          <div class="passenger-chip">
            <strong>
              ${esc(p.name)}
            </strong>

            <span>
              ${esc(p.phone || "No phone")}
            </span>
          </div>
        `
      )
      .join("");
}

/* =========================
   STRICT STATE MACHINE
========================= */

function hideActionButtons(){

  hide(btnGoPickup);
  hide(btnArrived);
  hide(btnStartRide);
  hide(btnCancel);
  hide(btnCall);
  hide(btnNoShow);
  hide(btnDropoff);
}

function closeReasonBoxes(){

  hide(cancelBox);
  hide(noShowBox);
}

function renderExecutionState(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  const state =
    readStopState(
      stop
    );

  const distance =
    currentDistanceToStop();

  hideActionButtons();

  closeReasonBoxes();

  hide(waitTimerEl);

  hide(scheduledTimeBox);

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
      stop.address ||
      "Address unavailable";
  }

  renderPassengers();

  /* =================
     PICKUP
  ================= */

  if(
    stop.type === "pickup"
  ){

    /*
      STEP 1
      Outside pickup radius.
      GO TO PICKUP only.
    */
    if(
      state.arrived !== true
    ){

      if(
        !insidePickupRadius()
      ){

        setNavText(
          "Go to pickup"
        );

        if(
          distance !== null
        ){

          setStopStatus(
            `${distance.toFixed(2)} mi from pickup`
          );

        }else{

          setStopStatus(
            "Drive to the pickup location"
          );
        }

        show(
          btnGoPickup
        );

        return;
      }

      /*
        STEP 2
        Inside pickup radius.
        ARRIVED only.
      */

      setNavText(
        "Pickup reached"
      );

      setStopStatus(
        "Press ARRIVED"
      );

      show(
        btnArrived
      );

      return;
    }

    const scheduledAt =
      num(
        stop.scheduledAt,
        null
      );

    /*
      STEP 3
      Driver arrived before scheduled time.
      NO TIMER.
      NO START.
      NO CANCEL.
      Wait for server/app time.
    */
    if(
      Number.isFinite(
        scheduledAt
      ) &&
      serverNow() <
      scheduledAt
    ){

      setNavText(
        "Waiting for scheduled time"
      );

      setStopStatus(
        "Wait timer has not started"
      );

      if(
        scheduledTimeBox
      ){

        scheduledTimeBox.textContent =
          `Starts ${formatScheduledTime(scheduledAt)}`;

        show(
          scheduledTimeBox
        );
      }

      return;
    }

    /*
      STEP 4
      Scheduled time reached.
      Timer starts.

      During timer:
      START RIDE + CANCEL
    */

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

      if(waitTimerEl){

        waitTimerEl.textContent =
          formatTimer(
            waitRemaining(stop)
          );

        show(
          waitTimerEl
        );
      }

      show(
        btnStartRide
      );

      show(
        btnCancel
      );

      return;
    }

    /*
      STEP 5
      Timer expired.

      START RIDE + NO SHOW.
      CALL is available as an additional helper.
    */

    setNavText(
      "Waiting time finished"
    );

    setStopStatus(
      "Choose Start Ride or No Show"
    );

    if(
      EXECUTION.waitTimerEnabled &&
      waitTimerEl
    ){

      waitTimerEl.textContent =
        "TIME UP";

      show(
        waitTimerEl
      );
    }

    show(
      btnStartRide
    );

    show(
      btnCall
    );

    show(
      btnNoShow
    );

    return;
  }

  /* =================
     DROPOFF
  ================= */

  if(
    stop.type === "dropoff"
  ){

    /*
      Driver is still outside the dropoff radius.
      There is no Complete button yet.
      Google navigation is already opened automatically
      after Start Ride / previous stop.
    */

    if(
      !insideDropoffRadius()
    ){

      setNavText(
        "Go to dropoff"
      );

      if(
        distance !== null
      ){

        setStopStatus(
          `${distance.toFixed(2)} mi from dropoff`
        );

      }else{

        setStopStatus(
          "Driving to dropoff"
        );
      }

      return;
    }

    /*
      STEP 7
      Inside dropoff radius.
    */

    setNavText(
      "Dropoff reached"
    );

    setStopStatus(
      "Complete this dropoff"
    );

    show(
      btnDropoff
    );
  }
}

/* =========================
   ADVANCE STOP
========================= */

function markStopComplete(
  stop,
  extra={}
){

  saveStopState(
    stop,
    {
      completed:true,
      completedAt:
        serverNow(),
      ...extra
    }
  );
}

function advanceStop(
  openNavigation=true
){

  const stop =
    currentStop();

  if(stop){

    markStopComplete(
      stop
    );
  }

  stopTimer();

  if(
    currentStopIndex <
    routeStops.length-1
  ){

    currentStopIndex++;

    renderExecutionState();

    updateMapTarget();

    if(openNavigation){

      /*
        Start Ride / completed previous stop
        automatically opens Google Maps
        to the NEXT server-ordered stop.
      */
      setTimeout(
        openDirectionsToStop,
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

  hideActionButtons();
}

/* =========================
   BUTTON EVENTS
========================= */

btnGoPickup
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

      /*
        GO TO PICKUP always launches directions.
      */
      openDirectionsToStop();
    }
  );

btnArrived
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

      /*
        ARRIVED is blocked outside the pickup radius.
      */
      if(
        !insidePickupRadius()
      ){

        alert(
          "You must be inside the pickup area first."
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

      await saveExecutionEvent(
        "PICKUP_GROUP_ARRIVED",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            stop.passengers.map(
              p=>p.passengerId
            ),

          arrivedAt,

          scheduledAt:
            stop.scheduledAt ||
            null
        }
      );

      startTimerWatcher();

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

      const state =
        readStopState(
          stop
        );

      if(
        state.arrived !== true
      ){
        return;
      }

      /*
        Cannot start ride before scheduled trip time.
      */
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

      const passengers =
        activePassengers(
          stop
        );

      const startedAt =
        serverNow();

      saveStopState(
        stop,
        {
          rideStarted:true,
          rideStartedAt:
            startedAt,
          completed:true
        }
      );

      await saveExecutionEvent(
        "PICKUP_GROUP_STARTED",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            passengers.map(
              p=>p.passengerId
            ),

          startedAt,

          arrivedAt:
            readStopState(stop)
              .arrivedAt ||
            null,

          waitStartedAt:
            waitStartForStop(
              stop
            ),

          waitExpired:
            timerExpired(
              stop
            )
        }
      );

      advanceStop(
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

      /*
        CANCEL is allowed only while timer is active.
        It is not No Show and does not create No Show fee evidence.
      */
      if(
        timerExpired(
          stop
        )
      ){

        renderExecutionState();

        return;
      }

      if(cancelNotes){
        cancelNotes.value = "";
      }

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

      hide(
        cancelBox
      );

      if(cancelNotes){
        cancelNotes.value = "";
      }
    }
  );

btnCompleteCancel
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(!stop){
        return;
      }

      const reason =
        clean(
          cancelNotes?.value
        );

      if(!reason){

        alert(
          "Please enter cancel reason."
        );

        return;
      }

      /*
        This is CANCEL, not NO SHOW.
        Server pricing should not treat this event as No Show.
      */
      await saveExecutionEvent(
        "PICKUP_GROUP_CANCELLED",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            activePassengers(stop)
              .map(
                p=>p.passengerId
              ),

          cancelReason:
            reason,

          cancelledAt:
            serverNow(),

          noShowEligible:
            false
        }
      );

      saveStopState(
        stop,
        {
          cancelled:true,
          cancelReason:
            reason,
          completed:true
        }
      );

      hide(
        cancelBox
      );

      advanceStop(
        true
      );
    }
  );

btnCall
  ?.addEventListener(
    "click",
    ()=>{

      const stop =
        currentStop();

      if(!stop){
        return;
      }

      const phone =
        activePassengers(stop)
          .find(
            p=>p.phone
          )
          ?.phone ||
        "";

      if(!phone){

        alert(
          "Passenger phone not found."
        );

        return;
      }

      saveStopState(
        stop,
        {
          called:true,
          calledAt:
            serverNow()
        }
      );

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

      /*
        No Show cannot exist before timer expiration
        when timer enforcement is enabled.
      */
      if(
        EXECUTION.noShowRequiresTimer &&
        !timerExpired(stop)
      ){

        alert(
          "Wait timer must finish first."
        );

        return;
      }

      if(noShowNotes){
        noShowNotes.value = "";
      }

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

      hide(
        noShowBox
      );

      if(noShowNotes){
        noShowNotes.value = "";
      }
    }
  );

btnCompleteNoShow
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(!stop){
        return;
      }

      const reason =
        clean(
          noShowNotes?.value
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

        hide(
          noShowBox
        );

        renderExecutionState();

        return;
      }

      const state =
        readStopState(
          stop
        );

      const noShowAt =
        serverNow();

      const waitStartedAt =
        waitStartForStop(
          stop
        );

      /*
        IMPORTANT NO SHOW FEE SAFETY:

        Client does NOT calculate or apply money.
        It sends evidence that the timer expired.
        Server/service pricing decides whether a fee exists
        and what amount applies.
      */
      await saveExecutionEvent(
        "PICKUP_GROUP_NO_SHOW",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            activePassengers(stop)
              .map(
                p=>p.passengerId
              ),

          noShowReason:
            reason,

          arrivedAt:
            state.arrivedAt ||
            null,

          scheduledAt:
            stop.scheduledAt ||
            null,

          waitStartedAt,

          waitDurationSeconds:
            waitSeconds(),

          waitExpired:
            true,

          noShowAt,

          noShowFeeEvidence:{
            timerRequired:
              EXECUTION.noShowRequiresTimer,
            timerExpired:
              true,
            feeCalculatedByClient:
              false
          }
        }
      );

      saveStopState(
        stop,
        {
          noShow:true,
          noShowReason:
            reason,
          noShowAt,
          completed:true
        }
      );

      hide(
        noShowBox
      );

      advanceStop(
        true
      );
    }
  );

btnDropoff
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

      if(
        !insideDropoffRadius()
      ){

        alert(
          "You must be inside the dropoff area first."
        );

        renderExecutionState();

        return;
      }

      const completedAt =
        serverNow();

      await saveExecutionEvent(
        "DROPOFF_COMPLETED",
        {
          passengerId:
            stop.passengers[0]
              ?.passengerId ||
            "",

          completedAt
        }
      );

      saveStopState(
        stop,
        {
          completed:true,
          completedAt
        }
      );

      advanceStop(
        true
      );
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

/* =========================
   GPS WATCH
========================= */

function startGpsWatch(){

  if(
    !navigator.geolocation
  ){

    if(gpsBadge){
      gpsBadge.textContent =
        "GPS unavailable";
    }

    return;
  }

  if(
    watchId !== null
  ){

    navigator.geolocation
      .clearWatch(
        watchId
      );

    watchId = null;
  }

  watchId =
    navigator.geolocation
      .watchPosition(

        async pos=>{

          driverLat =
            pos.coords.latitude;

          driverLng =
            pos.coords.longitude;

          if(gpsBadge){
            gpsBadge.textContent =
              "GPS Active";
          }

          updateDriverMarker(
            driverLat,
            driverLng
          );

          drawStraightLine();

          if(firstGpsFix){

            firstGpsFix = false;

            userMovedMap = false;

            fitMap();

          }else if(
            !userMovedMap
          ){

            fitMap();
          }

          await sendLocation(
            driverLat,
            driverLng
          );

          /*
            GPS changes which strict button
            is allowed to appear.
          */
          renderExecutionState();
        },

        err=>{

          console.log(
            "GPS ERROR:",
            err
          );

          if(gpsBadge){
            gpsBadge.textContent =
              "GPS Error";
          }

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

/* =========================
   INIT
========================= */

async function initPage(){

  try{

    setNavText(
      "Loading trip..."
    );

    await syncServerClock();

    tripDoc =
      await fetchTrip();

    if(!tripDoc){
      return;
    }

    routeStops =
      buildRouteStops(
        tripDoc
      );

    if(
      !routeStops.length
    ){

      throw new Error(
        "No route stops found"
      );
    }

    restoreCurrentStop();

    initMap();

    renderExecutionState();

    startTimerWatcher();

    startGpsWatch();

  }catch(err){

    console.log(
      "MAP INIT:",
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

/* =========================
   RETURN FROM GOOGLE MAPS
========================= */

document.addEventListener(
  "visibilitychange",
  async ()=>{

    if(document.hidden){
      return;
    }

    await syncServerClock();

    /*
      Restore strict state after returning from
      external Google Maps navigation.
    */
    renderExecutionState();

    if(map){
      setTimeout(
        ()=>{
          map.invalidateSize();
          updateMapTarget();
        },
        150
      );
    }
  }
);

window.addEventListener(
  "pageshow",
  async ()=>{

    await syncServerClock();

    renderExecutionState();

    if(map){

      setTimeout(
        ()=>{
          map.invalidateSize();
        },
        150
      );
    }
  }
);

window.addEventListener(
  "beforeunload",
  ()=>{

    stopTimer();

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

/* =========================
   START
========================= */

initPage();