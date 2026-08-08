/* =====================================================
   SUNBEAM DRIVER MAP — FINAL REBUILD V1

   CORE RULES
   -----------------------------------------------------
   1) REAL MAP = Leaflet + OpenStreetMap tiles.
   2) NO geocoding in driver app.
   3) NO Google Directions API request.
   4) External Google Maps opens only from Directions.
   5) Server route order wins.
   6) One stop at a time.
   7) Every physical stop uses SAME 250 meter geofence.
   8) Pickup / Intermediate Stop / Dropoff are different
      execution types.
   9) Shared passengers at same pickup share one timer.
   10) Different shared pickup location = different timer.
   11) Wait timer never starts before scheduled trip time.
   12) No Show fee is NEVER calculated in client.
===================================================== */

console.log("Sunbeam Driver Map FINAL rebuild");

/* =========================
   CONSTANTS
========================= */

const METERS_PER_MILE =
  1609.344;

const STOP_RADIUS_METERS =
  250;

const STOP_RADIUS_MILES =
  STOP_RADIUS_METERS /
  METERS_PER_MILE;

/*
  Temporary.
  Later Admin controls these.
*/
const EXECUTION = {

  waitTimerEnabled:true,

  waitMinutes:10,

  stopRadiusMiles:
    STOP_RADIUS_MILES,

  noShowRequiresTimer:true,

  noShowRequiresCall:false

};

/* =========================
   AUTH
========================= */

const rawDriver =
  localStorage.getItem(
    "loggedDriver"
  ) ||
  localStorage.getItem(
    "user"
  );

if(!rawDriver){

  window.location.href =
    "/driver/login.html";
}

let driver = {};

try{

  driver =
    JSON.parse(
      rawDriver
    );

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
  String(
    driver.name ||
    driver.fullName ||
    driver.username ||
    "Driver"
  ).trim();

const DRIVER_PHONE =
  String(
    driver.phone ||
    driver.mobile ||
    driver.phoneNumber ||
    ""
  ).trim();

/* =========================
   TRIP ID
========================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const TRIP_ID =
  String(
    params.get(
      "tripId"
    ) ||
    ""
  );

/* =========================
   DOM
========================= */

const navTextEl =
  document.getElementById(
    "navText"
  );

const gpsBadge =
  document.getElementById(
    "gpsBadge"
  );

const stopTypeBadge =
  document.getElementById(
    "stopTypeBadge"
  );

const stopProgress =
  document.getElementById(
    "stopProgress"
  );

const currentStopAddressEl =
  document.getElementById(
    "currentStopAddress"
  );

const currentPassengersEl =
  document.getElementById(
    "currentPassengers"
  );

const stopStatusText =
  document.getElementById(
    "stopStatusText"
  );

const waitTimerEl =
  document.getElementById(
    "waitTimer"
  );

const scheduledTimeBox =
  document.getElementById(
    "scheduledTimeBox"
  );

const recenterBtn =
  document.getElementById(
    "recenterBtn"
  );

const btnDirections =
  document.getElementById(
    "btnDirections"
  );

const btnArrived =
  document.getElementById(
    "btnArrived"
  );

const btnStartRide =
  document.getElementById(
    "btnStartRide"
  );

const btnCancel =
  document.getElementById(
    "btnCancel"
  );

const btnCall =
  document.getElementById(
    "btnCall"
  );

const btnNoShow =
  document.getElementById(
    "btnNoShow"
  );

const btnCompleteStop =
  document.getElementById(
    "btnCompleteStop"
  );

const btnCompleteDropoff =
  document.getElementById(
    "btnCompleteDropoff"
  );

const cancelBox =
  document.getElementById(
    "cancelBox"
  );

const btnCloseCancel =
  document.getElementById(
    "btnCloseCancel"
  );

const cancelNotes =
  document.getElementById(
    "cancelNotes"
  );

const btnCompleteCancel =
  document.getElementById(
    "btnCompleteCancel"
  );

const noShowBox =
  document.getElementById(
    "noShowBox"
  );

const btnCloseNoShow =
  document.getElementById(
    "btnCloseNoShow"
  );

const noShowNotes =
  document.getElementById(
    "noShowNotes"
  );

const btnCompleteNoShow =
  document.getElementById(
    "btnCompleteNoShow"
  );

/* =========================
   GLOBAL STATE
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

let timerInterval = null;

let serverOffset = 0;

let lastSentLocationAt = 0;

let lastSentLat = null;

let lastSentLng = null;

const LOCATION_PUSH_MS =
  20000;

const LOCATION_PUSH_MILES =
  0.25;

/* =========================
   HELPERS
========================= */

function clean(v){

  return String(
    v ?? ""
  )
  .trim();
}

function lower(v){

  return clean(v)
    .toLowerCase();
}

function num(
  v,
  def=null
){

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

function firstValue(
  ...values
){

  for(
    const value of values
  ){

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

function esc(v){

  return clean(v)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function normalizeStatus(v){

  return lower(v)
    .replace(
      /[_-]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function show(
  el,
  display="block"
){

  if(el){
    el.style.display =
      display;
  }
}

function hide(el){

  if(el){
    el.style.display =
      "none";
  }
}

function setNavText(text){

  if(navTextEl){
    navTextEl.textContent =
      text;
  }
}

function setStopStatus(text){

  if(stopStatusText){
    stopStatusText.textContent =
      text;
  }
}

function validLatitude(v){

  return (
    Number.isFinite(v) &&
    v >= -90 &&
    v <= 90
  );
}

function validLongitude(v){

  return (
    Number.isFinite(v) &&
    v >= -180 &&
    v <= 180
  );
}

function validPoint(
  lat,
  lng
){

  return (
    validLatitude(lat) &&
    validLongitude(lng) &&
    !(
      lat === 0 &&
      lng === 0
    )
  );
}

/* =========================
   SERVER CLOCK
========================= */

function serverNow(){

  return (
    Date.now() +
    serverOffset
  );
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
      res.headers.get(
        "date"
      );

    if(dateHeader){

      const serverMs =
        new Date(
          dateHeader
        )
        .getTime();

      if(
        Number.isFinite(
          serverMs
        )
      ){

        serverOffset =
          serverMs -
          Date.now();
      }
    }

  }catch(err){

    console.log(
      "SERVER CLOCK ERROR:",
      err
    );
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
    ) /
    180;

  const dLon =
    (
      (lon2-lon1) *
      Math.PI
    ) /
    180;

  const a =
    Math.sin(
      dLat/2
    ) ** 2 +
    Math.cos(
      lat1 *
      Math.PI /
      180
    ) *
    Math.cos(
      lat2 *
      Math.PI /
      180
    ) *
    Math.sin(
      dLon/2
    ) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1-a)
    )
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

function currentDistance(){

  const stop =
    currentStop();

  if(
    !stop ||
    !validPoint(
      stop.lat,
      stop.lng
    ) ||
    !validPoint(
      driverLat,
      driverLng
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

function insideCurrentStopRadius(){

  const d =
    currentDistance();

  return (
    d !== null &&
    d <=
    EXECUTION.stopRadiusMiles
  );
}

/* =========================
   DRIVER IDENTITY GUARD
========================= */

function normalizePhone(v){

  return clean(v)
    .replace(
      /\D/g,
      ""
    );
}

function isDriverIdentity(
  name,
  phone
){

  const n1 =
    lower(name);

  const n2 =
    lower(
      DRIVER_NAME
    );

  const p1 =
    normalizePhone(
      phone
    );

  const p2 =
    normalizePhone(
      DRIVER_PHONE
    );

  const sameName =
    n1 &&
    n2 &&
    n1 === n2;

  const samePhone =
    p1 &&
    p2 &&
    p1 === p2;

  return (
    sameName ||
    samePhone
  );
}

/* =========================
   TRIP TIME
========================= */

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
      new Date(
        direct
      )
      .getTime();

    if(
      Number.isFinite(
        ms
      )
    ){
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

  if(
    !date ||
    !time
  ){
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

  if(
    !Number.isFinite(ms)
  ){
    return "";
  }

  return (
    new Intl.DateTimeFormat(
      "en-US",
      {
        hour:"numeric",
        minute:"2-digit",
        hour12:true
      }
    )
    .format(
      new Date(ms)
    )
  );
}

/* =========================
   PASSENGER HELPERS
========================= */

function passengerId(
  p,
  index
){

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
      p?.riderName,
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
      p?.riderPhone,
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

function getPassengers(
  trip
){

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
    tripDate:
      trip?.tripDate,
    tripTime:
      trip?.tripTime
  }];
}

/* =========================
   NORMAL TRIP EXTRA STOPS
========================= */

function normalizeExtraStop(
  raw,
  index
){

  if(!raw){
    return null;
  }

  if(
    typeof raw ===
    "string"
  ){

    return {
      stopId:
        `mid-${index+1}`,
      type:"stop",
      order:
        1000 +
        index,
      address:
        clean(raw),
      lat:null,
      lng:null,
      title:
        `Stop ${index+1}`,
      sourceIndex:index
    };
  }

  const address =
    clean(
      firstValue(
        raw.address,
        raw.fullAddress,
        raw.location,
        raw.name,
        raw.stopAddress
      )
    );

  const lat =
    num(
      firstValue(
        raw.lat,
        raw.latitude,
        raw.stopLat
      )
    );

  const lng =
    num(
      firstValue(
        raw.lng,
        raw.lon,
        raw.longitude,
        raw.stopLng
      )
    );

  const order =
    num(
      firstValue(
        raw.order,
        raw.routeOrder,
        raw.sequence,
        raw.stopOrder,
        raw.index
      ),
      1000 +
      index
    );

  return {
    stopId:
      String(
        firstValue(
          raw.stopId,
          raw._id,
          raw.id,
          `mid-${index+1}`
        )
      ),
    type:"stop",
    order,
    address,
    lat,
    lng,
    title:
      clean(
        firstValue(
          raw.title,
          raw.label,
          raw.name,
          `Stop ${index+1}`
        )
      ),
    sourceIndex:index
  };
}

function getNormalTripStops(
  trip
){

  const rawStops =
    Array.isArray(
      trip?.stops
    )
      ? trip.stops
      : Array.isArray(
          trip?.extraStops
        )
        ? trip.extraStops
        : Array.isArray(
            trip?.stopAddresses
          )
          ? trip.stopAddresses
          : [];

  return rawStops
    .map(
      normalizeExtraStop
    )
    .filter(Boolean);
}

/* =========================
   SAME PICKUP GROUP
========================= */

function normalizeAddressKey(v){

  return clean(v)
    .toLowerCase()
    .replace(
      /[.,#]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function sameCoordinate(
  a,
  b
){

  if(
    !a ||
    !b ||
    !validPoint(
      a.lat,
      a.lng
    ) ||
    !validPoint(
      b.lat,
      b.lng
    )
  ){
    return false;
  }

  return (
    distanceMiles(
      a.lat,
      a.lng,
      b.lat,
      b.lng
    )
    <=
    0.02
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

  return {

    explicit:
      explicit
        ? `KEY:${explicit.toLowerCase()}`
        : "",

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
   BUILD COMPLETE ROUTE
========================= */

function buildRouteStops(
  trip
){

  const passengers =
    getPassengers(
      trip
    );

  const pickupGroups = [];

  const dropoffs = [];

  passengers.forEach(
    (p,index)=>{

      const id =
        passengerId(
          p,
          index
        );

      const name =
        passengerName(
          p,
          index
        );

      const phone =
        passengerPhone(
          p
        );

      const pickup =
        passengerPickup(
          p,
          trip
        );

      const dropoff =
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

      const identity =
        pickupIdentity(
          p,
          trip
        );

      let group =
        pickupGroups.find(
          g =>
            pickupGroupMatches(
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

          order:
            pickupOrder,

          address:
            pickup,

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

        const nextTime =
          buildScheduledTime(
            trip,
            p
          );

        if(
          Number.isFinite(
            nextTime
          ) &&
          (
            !Number.isFinite(
              group.scheduledAt
            ) ||
            nextTime <
            group.scheduledAt
          )
        ){

          group.scheduledAt =
            nextTime;
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

        order:
          dropoffOrder,

        address:
          dropoff,

        lat:
          dPoint.lat,

        lng:
          dPoint.lng,

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

  const extraStops =
    getNormalTripStops(
      trip
    );

  /*
    If explicit order exists in data,
    it wins.

    If normal trip has old simple stops
    without order:
    Pickup = first
    Extra stops = middle
    Dropoff = last
  */
  const hasSharedPassengers =
    Array.isArray(
      trip?.passengers
    ) &&
    trip.passengers.length > 1;

  if(
    !hasSharedPassengers &&
    pickupGroups.length === 1 &&
    dropoffs.length === 1 &&
    extraStops.length
  ){

    pickupGroups[0].order =
      1;

    extraStops.forEach(
      (stop,index)=>{

        if(
          !Number.isFinite(
            num(
              stop.order,
              null
            )
          ) ||
          stop.order >= 1000
        ){

          stop.order =
            index + 2;
        }
      }
    );

    dropoffs[0].order =
      extraStops.length +
      2;
  }

  return [
    ...pickupGroups,
    ...extraStops,
    ...dropoffs
  ]
  .filter(
    stop =>
      clean(
        stop.address
      ) ||
      validPoint(
        stop.lat,
        stop.lng
      )
  )
  .sort(
    (a,b)=>
      num(
        a.order,
        999999
      ) -
      num(
        b.order,
        999999
      )
  );
}

/* =========================
   ACTIVE PASSENGERS
========================= */

function activePassengers(
  stop
){

  if(!stop){
    return [];
  }

  return (
    Array.isArray(
      stop.passengers
    )
      ? stop.passengers
      : []
  )
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
      .includes(
        s
      );
    }
  );
}

/* =========================
   SERVER AUTHORITY
========================= */

function tripExecutionStartedOnServer(
  trip
){

  if(!trip){
    return false;
  }

  const status =
    normalizeStatus(
      firstValue(
        trip.dispatchStatus,
        trip.status,
        trip.tripStatus
      )
    );

  if(
    [
      "arrived",
      "on trip",
      "in progress",
      "started"
    ]
    .includes(
      status
    )
  ){
    return true;
  }

  return Boolean(
    firstValue(
      trip.arrivedAt,
      trip.startedAt,
      trip.driverExecutionAt,
      trip.currentStopId
    )
  );
}

function tripIsFreshDispatch(
  trip
){

  if(!trip){
    return false;
  }

  const status =
    normalizeStatus(
      firstValue(
        trip.dispatchStatus,
        trip.status,
        "scheduled"
      )
    );

  const fresh =
    [
      "scheduled",
      "confirmed",
      "assigned",
      "sent",
      "dispatched",
      "accepted",
      "upcoming",
      "ready"
    ]
    .includes(
      status
    );

  return (
    fresh &&
    !tripExecutionStartedOnServer(
      trip
    )
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

      keys.push(
        key
      );
    }
  }

  keys.forEach(
    key =>
      localStorage.removeItem(
        key
      )
  );
}

function restoreCurrentStop(){

  if(
    tripIsFreshDispatch(
      tripDoc
    )
  ){

    clearTripLocalState();

    currentStopIndex =
      0;

    return;
  }

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
      state.completed !==
      true
    ){

      currentStopIndex =
        i;

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
   WAIT TIMER
========================= */

function waitDurationSeconds(){

  return Math.max(
    0,
    Number(
      EXECUTION.waitMinutes ||
      0
    ) *
    60
  );
}

function waitStart(
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

    /*
      If early:
      timer begins at scheduled time.

      If late:
      timer begins at arrived time.
    */
    return Math.max(
      arrivedAt,
      scheduledAt
    );
  }

  return arrivedAt;
}

function timerStarted(
  stop
){

  if(
    !EXECUTION.waitTimerEnabled
  ){

    return true;
  }

  const start =
    waitStart(
      stop
    );

  return (
    Number.isFinite(
      start
    ) &&
    serverNow() >=
    start
  );
}

function timerRemaining(
  stop
){

  if(
    !EXECUTION.waitTimerEnabled
  ){

    return 0;
  }

  const start =
    waitStart(
      stop
    );

  if(
    !Number.isFinite(
      start
    )
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

function timerExpired(
  stop
){

  if(
    !EXECUTION.waitTimerEnabled
  ){

    return true;
  }

  return (
    timerStarted(
      stop
    ) &&
    timerRemaining(
      stop
    ) <= 0
  );
}

function formatTimer(
  seconds
){

  const safe =
    Math.max(
      0,
      Math.floor(
        seconds
      )
    );

  const min =
    Math.floor(
      safe /
      60
    );

  const sec =
    safe %
    60;

  return (
    `${String(min).padStart(2,"0")}:` +
    `${String(sec).padStart(2,"0")}`
  );
}

function startTimerWatcher(){

  if(
    timerInterval
  ){

    clearInterval(
      timerInterval
    );
  }

  timerInterval =
    setInterval(
      renderExecutionState,
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

              currentStopType:
                stop?.type ||
                "",

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
      "SAVE EXECUTION ERROR:",
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

  if(
    !lastSentLocationAt
  ){

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
    validPoint(
      lastSentLat,
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

            currentStopIndex,

            time:
              lastSentLocationAt
          })
      }
    );

  }catch(err){

    console.log(
      "LOCATION PUSH ERROR:",
      err
    );
  }
}

/* =========================
   REAL OSM MAP
========================= */

function markerIcon(
  type
){

  let cssClass =
    "stop-pin pickup-pin";

  let text =
    "P";

  if(
    type === "driver"
  ){

    cssClass =
      "driver-pin";

    text =
      "●";

  }else if(
    type === "stop"
  ){

    cssClass =
      "stop-pin stop-mid-pin";

    text =
      "S";

  }else if(
    type === "dropoff"
  ){

    cssClass =
      "stop-pin dropoff-pin";

    text =
      "D";
  }

  return L.divIcon({

    className:"",

    html:
      `<div class="${cssClass}">` +
      `${text}` +
      `</div>`,

    iconSize:[
      28,
      28
    ],

    iconAnchor:[
      14,
      14
    ]
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

  const startPoint =
    validPoint(
      stop?.lat,
      stop?.lng
    )
      ? [
          stop.lat,
          stop.lng
        ]
      : [
          33.4484,
          -112.0740
        ];

  map =
    L.map(
      "map",
      {
        zoomControl:false,
        attributionControl:true
      }
    )
    .setView(
      startPoint,
      15
    );

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom:19,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  )
  .addTo(
    map
  );

  L.control.zoom({
    position:"bottomleft"
  })
  .addTo(
    map
  );

  map.on(
    "dragstart",
    ()=>{
      userMovedMap =
        true;
    }
  );

  map.on(
    "zoomstart",
    ()=>{

      if(
        !firstGpsFix
      ){

        userMovedMap =
          true;
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
        [
          lat,
          lng
        ],
        {
          icon:
            markerIcon(
              "driver"
            )
        }
      )
      .addTo(
        map
      );

  }else{

    driverMarker
      .setLatLng(
        [
          lat,
          lng
        ]
      );
  }
}

function updateMapTarget(){

  if(!map){
    return;
  }

  const stop =
    currentStop();

  if(
    stopMarker
  ){

    map.removeLayer(
      stopMarker
    );

    stopMarker =
      null;
  }

  if(
    stop &&
    validPoint(
      stop.lat,
      stop.lng
    )
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
      .addTo(
        map
      );

    stopMarker
      .bindPopup(
        esc(
          stop.address ||
          (
            stop.type ===
            "pickup"
              ? "Pickup"
              : stop.type ===
                "dropoff"
                ? "Dropoff"
                : "Stop"
          )
        )
      );
  }

  drawStraightLine();

  if(
    !userMovedMap
  ){

    fitMap();
  }
}

function drawStraightLine(){

  if(!map){
    return;
  }

  if(
    straightLine
  ){

    map.removeLayer(
      straightLine
    );

    straightLine =
      null;
  }

  const stop =
    currentStop();

  if(
    !stop ||
    !validPoint(
      stop.lat,
      stop.lng
    ) ||
    !validPoint(
      driverLat,
      driverLng
    )
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
          stop.type ===
          "pickup"
            ? "#2563eb"
            : stop.type ===
              "dropoff"
              ? "#16a34a"
              : "#7c3aed",
        weight:5,
        opacity:.85
      }
    )
    .addTo(
      map
    );
}

function fitMap(){

  if(!map){
    return;
  }

  const points = [];

  if(
    validPoint(
      driverLat,
      driverLng
    )
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
    validPoint(
      stop?.lat,
      stop?.lng
    )
  ){

    points.push(
      [
        stop.lat,
        stop.lng
      ]
    );
  }

  if(
    points.length >= 2
  ){

    map.fitBounds(
      points,
      {
        padding:[
          55,
          55
        ],
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
   EXTERNAL GOOGLE DIRECTIONS
========================= */

function openDirections(){

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
    validPoint(
      driverLat,
      driverLng
    )
  ){

    origin =
      `&origin=${driverLat},${driverLng}`;
  }

  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `${origin}` +
    `&destination=${destination}` +
    `&travelmode=driving`;

  window.open(
    url,
    "_blank"
  );
}

/* =========================
   RENDER PASSENGERS
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

  const visible =
    activePassengers(
      stop
    )
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
              <strong>
                ${esc(p.name)}
              </strong>

              ${
                p.phone
                  ? `
                    <span>
                      ${esc(p.phone)}
                    </span>
                  `
                  : ""
              }
            </div>
          `
        )
        .join("");

  currentPassengersEl
    .style
    .display =
      visible.length
        ? "flex"
        : "none";
}

/* =========================
   UI BUTTONS
========================= */

function hideAllButtons(){

  hide(
    btnDirections
  );

  hide(
    btnArrived
  );

  hide(
    btnStartRide
  );

  hide(
    btnCancel
  );

  hide(
    btnCall
  );

  hide(
    btnNoShow
  );

  hide(
    btnCompleteStop
  );

  hide(
    btnCompleteDropoff
  );
}

function closeReasonBoxes(){

  hide(
    cancelBox
  );

  hide(
    noShowBox
  );
}

/* =========================
   CURRENT STOP LABEL
========================= */

function renderStopHeader(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  if(
    stopTypeBadge
  ){

    stopTypeBadge
      .classList
      .remove(
        "dropoff",
        "stop"
      );

    if(
      stop.type ===
      "pickup"
    ){

      stopTypeBadge
        .textContent =
          "PICKUP";

    }else if(
      stop.type ===
      "dropoff"
    ){

      stopTypeBadge
        .textContent =
          "DROPOFF";

      stopTypeBadge
        .classList
        .add(
          "dropoff"
        );

    }else{

      stopTypeBadge
        .textContent =
          "STOP";

      stopTypeBadge
        .classList
        .add(
          "stop"
        );
    }
  }

  if(
    stopProgress
  ){

    stopProgress
      .textContent =
        `Stop ${currentStopIndex+1} of ${routeStops.length}`;
  }

  if(
    currentStopAddressEl
  ){

    currentStopAddressEl
      .textContent =
        stop.address ||
        "Address unavailable";
  }

  renderPassengers();
}

/* =========================
   STRICT STATE MACHINE
========================= */

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
    currentDistance();

  hideAllButtons();

  closeReasonBoxes();

  hide(
    waitTimerEl
  );

  hide(
    scheduledTimeBox
  );

  renderStopHeader();

  /* =====================================
     STEP A
     BEFORE ARRIVED
  ===================================== */

  if(
    state.arrived !==
    true
  ){

    if(
      !insideCurrentStopRadius()
    ){

      if(
        stop.type ===
        "pickup"
      ){

        setNavText(
          "Go to pickup"
        );

      }else if(
        stop.type ===
        "dropoff"
      ){

        setNavText(
          "Go to dropoff"
        );

      }else{

        setNavText(
          "Go to stop"
        );
      }

      if(
        distance !==
        null
      ){

        setStopStatus(
          `${distance.toFixed(2)} mi from stop`
        );

      }else if(
        stop.address &&
        !validPoint(
          stop.lat,
          stop.lng
        )
      ){

        setStopStatus(
          "Coordinates missing — use address directions"
        );

      }else{

        setStopStatus(
          "Drive to current stop"
        );
      }

      show(
        btnDirections
      );

      return;
    }

    /*
      Inside 250m:
      ARRIVED is the only execution button.
    */

    if(
      stop.type ===
      "pickup"
    ){

      setNavText(
        "Pickup reached"
      );

    }else if(
      stop.type ===
      "dropoff"
    ){

      setNavText(
        "Dropoff reached"
      );

    }else{

      setNavText(
        "Stop reached"
      );
    }

    setStopStatus(
      "Press ARRIVED"
    );

    show(
      btnArrived
    );

    return;
  }

  /* =====================================
     PICKUP AFTER ARRIVED
  ===================================== */

  if(
    stop.type ===
    "pickup"
  ){

    const scheduledAt =
      num(
        stop.scheduledAt,
        null
      );

    /*
      Arrived early:
      timer not active.
      no action can jump ahead.
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

        scheduledTimeBox
          .textContent =
            `Starts ${formatScheduledTime(scheduledAt)}`;

        show(
          scheduledTimeBox
        );
      }

      return;
    }

    /*
      Timer active:
      START RIDE + CANCEL
    */
    if(
      EXECUTION.waitTimerEnabled &&
      !timerExpired(
        stop
      )
    ){

      setNavText(
        "Waiting for passenger"
      );

      setStopStatus(
        activePassengers(
          stop
        ).length > 1
          ? "Shared pickup timer running"
          : "Passenger wait timer running"
      );

      if(
        waitTimerEl
      ){

        waitTimerEl
          .textContent =
            formatTimer(
              timerRemaining(
                stop
              )
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
      Timer expired:
      START RIDE + NO SHOW
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

      waitTimerEl
        .textContent =
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

  /* =====================================
     INTERMEDIATE STOP AFTER ARRIVED
  ===================================== */

  if(
    stop.type ===
    "stop"
  ){

    setNavText(
      "Stop reached"
    );

    setStopStatus(
      "Complete this stop to continue"
    );

    show(
      btnCompleteStop
    );

    return;
  }

  /* =====================================
     DROPOFF AFTER ARRIVED
  ===================================== */

  if(
    stop.type ===
    "dropoff"
  ){

    setNavText(
      "Dropoff reached"
    );

    setStopStatus(
      "Complete this dropoff"
    );

    show(
      btnCompleteDropoff
    );
  }
}

/* =========================
   ADVANCE
========================= */

function markStopCompleted(
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
  autoOpenDirections=true
){

  const stop =
    currentStop();

  if(stop){

    markStopCompleted(
      stop
    );
  }

  if(
    currentStopIndex <
    routeStops.length-1
  ){

    currentStopIndex++;

    updateMapTarget();

    renderExecutionState();

    if(
      autoOpenDirections
    ){

      setTimeout(
        openDirections,
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
}

/* =========================
   BUTTON EVENTS
========================= */

btnDirections
  ?.addEventListener(
    "click",
    openDirections
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
        !insideCurrentStopRadius()
      ){

        alert(
          "You must be inside the 250 meter stop area first."
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
        "STOP_ARRIVED",
        {
          stopId:
            stop.stopId,

          stopType:
            stop.type,

          passengerIds:
            activePassengers(
              stop
            )
            .map(
              p =>
                p.passengerId
            ),

          arrivedAt,

          scheduledAt:
            stop.scheduledAt ||
            null,

          geofenceMeters:
            STOP_RADIUS_METERS
        }
      );

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
        stop.type !==
        "pickup"
      ){

        return;
      }

      const state =
        readStopState(
          stop
        );

      if(
        state.arrived !==
        true
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

      await saveExecutionEvent(
        "PICKUP_STARTED",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            activePassengers(
              stop
            )
            .map(
              p =>
                p.passengerId
            ),

          startedAt,

          arrivedAt:
            state.arrivedAt ||
            null,

          waitStartedAt:
            waitStart(
              stop
            ),

          waitExpired:
            timerExpired(
              stop
            )
        }
      );

      saveStopState(
        stop,
        {
          rideStarted:true,
          rideStartedAt:
            startedAt,
          completed:true
        }
      );

      /*
        Mandatory automatic Google Maps
        navigation to NEXT server-ordered stop.
      */
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
        stop.type !==
        "pickup"
      ){

        return;
      }

      if(
        timerExpired(
          stop
        )
      ){

        renderExecutionState();

        return;
      }

      if(
        cancelNotes
      ){

        cancelNotes.value =
          "";
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

      if(
        cancelNotes
      ){

        cancelNotes.value =
          "";
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
          cancelNotes
            ?.value
        );

      if(!reason){

        alert(
          "Please enter cancel reason."
        );

        return;
      }

      await saveExecutionEvent(
        "PICKUP_CANCELLED",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            activePassengers(
              stop
            )
            .map(
              p =>
                p.passengerId
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
        activePassengers(
          stop
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
        stop.type !==
        "pickup"
      ){

        return;
      }

      if(
        EXECUTION.noShowRequiresTimer &&
        !timerExpired(
          stop
        )
      ){

        alert(
          "Wait timer must finish first."
        );

        return;
      }

      if(
        noShowNotes
      ){

        noShowNotes.value =
          "";
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

      if(
        noShowNotes
      ){

        noShowNotes.value =
          "";
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
          noShowNotes
            ?.value
        );

      if(!reason){

        alert(
          "Please enter no show reason."
        );

        return;
      }

      if(
        EXECUTION.noShowRequiresTimer &&
        !timerExpired(
          stop
        )
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

      await saveExecutionEvent(
        "PICKUP_NO_SHOW",
        {
          pickupGroupId:
            stop.stopId,

          passengerIds:
            activePassengers(
              stop
            )
            .map(
              p =>
                p.passengerId
            ),

          noShowReason:
            reason,

          arrivedAt:
            state.arrivedAt ||
            null,

          scheduledAt:
            stop.scheduledAt ||
            null,

          waitStartedAt:
            waitStart(
              stop
            ),

          waitDurationSeconds:
            waitDurationSeconds(),

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

btnCompleteStop
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !==
        "stop"
      ){

        return;
      }

      if(
        !insideCurrentStopRadius()
      ){

        alert(
          "You must be inside the 250 meter stop area first."
        );

        renderExecutionState();

        return;
      }

      const completedAt =
        serverNow();

      await saveExecutionEvent(
        "INTERMEDIATE_STOP_COMPLETED",
        {
          stopId:
            stop.stopId,

          completedAt,

          geofenceMeters:
            STOP_RADIUS_METERS
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

btnCompleteDropoff
  ?.addEventListener(
    "click",
    async ()=>{

      const stop =
        currentStop();

      if(
        !stop ||
        stop.type !==
        "dropoff"
      ){

        return;
      }

      if(
        !insideCurrentStopRadius()
      ){

        alert(
          "You must be inside the 250 meter dropoff area first."
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
            stop.passengers?.[0]
              ?.passengerId ||
            "",

          stopId:
            stop.stopId,

          completedAt,

          geofenceMeters:
            STOP_RADIUS_METERS
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

      userMovedMap =
        false;

      fitMap();
    }
  );

/* =========================
   GPS
========================= */

function startGpsWatch(){

  if(
    !navigator.geolocation
  ){

    if(
      gpsBadge
    ){

      gpsBadge.textContent =
        "GPS unavailable";
    }

    return;
  }

  if(
    watchId !==
    null
  ){

    navigator
      .geolocation
      .clearWatch(
        watchId
      );

    watchId =
      null;
  }

  watchId =
    navigator
      .geolocation
      .watchPosition(

        async position=>{

          driverLat =
            position.coords.latitude;

          driverLng =
            position.coords.longitude;

          if(
            gpsBadge
          ){

            gpsBadge.textContent =
              "GPS Active";
          }

          updateDriverMarker(
            driverLat,
            driverLng
          );

          drawStraightLine();

          if(
            firstGpsFix
          ){

            firstGpsFix =
              false;

            userMovedMap =
              false;

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
            Every GPS update can change
            which button is allowed.
          */
          renderExecutionState();
        },

        error=>{

          console.log(
            "GPS ERROR:",
            error
          );

          if(
            gpsBadge
          ){

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

/* =========================
   RETURN FROM GOOGLE MAPS
========================= */

document.addEventListener(
  "visibilitychange",
  async ()=>{

    if(
      document.hidden
    ){

      return;
    }

    await syncServerClock();

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

    if(
      timerInterval
    ){

      clearInterval(
        timerInterval
      );
    }

    if(
      watchId !==
      null &&
      navigator.geolocation
    ){

      navigator
        .geolocation
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