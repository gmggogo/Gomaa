/* =====================================================
   SUNBEAM DRIVER MAP — EXECUTION UI FINAL

   PURPOSE
   - Driver Map executes a trip that is already prepared by the server.
   - NO route re-ordering.
   - NO Google Directions API request inside the page.
   - NO Google Geocoder request inside the page.
   - Uses only saved trip / routePlan / saved route-leg coordinates.
   - External Google Maps opens only when driver asks for navigation.

   EXECUTION
   - 250 meter geofence for Pickup / Stop / Dropoff.
   - Shared same-pickup passengers use ONE pickup timer.
   - Pickup timer is read from Service Management for the trip service.
   - Intermediate Stop timer is read from Service Management for the trip service.
   - Timer never starts before scheduled trip time for the first/current pickup.
   - Every passenger at a pickup has independent state:
       PICKED / CANCELLED / NO SHOW
   - CANCEL / NO SHOW is passenger-specific.
   - A call is mandatory before CANCEL or NO SHOW.
   - CANCEL / NO SHOW always requires a written reason.
   - START RIDE / CONTINUE is enabled only after every passenger in the
     current pickup group has a final pickup state.
===================================================== */

console.log("Sunbeam Driver Map EXECUTION UI FINAL");

/* ================= CONFIG ================= */

const METERS_PER_MILE = 1609.344;
const STOP_RADIUS_METERS = 250;
const STOP_RADIUS_MILES = STOP_RADIUS_METERS / METERS_PER_MILE;

const DEFAULT_EXECUTION = {
  pickupWaitEnabled: true,
  pickupWaitMinutes: 10,
  stopWaitEnabled: true,
  stopWaitMinutes: 5,
  stopRadiusMiles: STOP_RADIUS_MILES,
  noShowRequiresTimer: true
};

const EXECUTION = { ...DEFAULT_EXECUTION };

const LOCATION_PUSH_MS = 20000;
const LOCATION_PUSH_MILES = 0.25;

/* ================= HELPERS ================= */

function clean(v){
  return String(v ?? "").trim();
}

function lower(v){
  return clean(v).toLowerCase();
}

function num(v, def = null){
  if(v === undefined || v === null || clean(v) === ""){
    return def;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function firstValue(...values){
  for(const value of values){
    if(value !== undefined && value !== null && clean(value) !== ""){
      return value;
    }
  }
  return "";
}

function normalizeStatus(v){
  return lower(v)
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddressKey(v){
  return lower(v)
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validPoint(lat, lng){
  lat = Number(lat);
  lng = Number(lng);

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

function show(el, display = "block"){
  if(el) el.style.display = display;
}

function hide(el){
  if(el) el.style.display = "none";
}

function escapeHtml(v){
  return clean(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function serverNow(){
  return Date.now() + serverOffset;
}

function distanceMiles(lat1, lon1, lat2, lon2){
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePhone(v){
  return clean(v).replace(/\D/g, "");
}

function formatTimer(sec){
  const safe = Math.max(0, Math.floor(sec));
  const min = Math.floor(safe / 60);
  const s = safe % 60;

  return (
    `${String(min).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")}`
  );
}

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

const DRIVER_ID = String(driver._id || driver.id || "");

const DRIVER_NAME = clean(
  driver.name ||
  driver.fullName ||
  driver.username ||
  "Driver"
);

const DRIVER_PHONE = clean(
  driver.phone ||
  driver.mobile ||
  driver.phoneNumber ||
  ""
);

function isDriverIdentity(name, phone){
  const sameName =
    lower(name) &&
    lower(name) === lower(DRIVER_NAME);

  const p1 = normalizePhone(phone);
  const p2 = normalizePhone(DRIVER_PHONE);

  return sameName || (p1 && p2 && p1 === p2);
}

/* ================= TRIP ID ================= */

const params = new URLSearchParams(window.location.search);
const TRIP_ID = clean(params.get("tripId"));

/* ================= DOM ================= */

const mapEl = document.getElementById("map");
const gpsBadge = document.getElementById("gpsBadge");
const currentActionBadge = document.getElementById("currentActionBadge");
const tripTimeValue = document.getElementById("tripTimeValue");
const stopProgress = document.getElementById("stopProgress");
const locationLabel = document.getElementById("locationLabel");
const currentStopAddressEl = document.getElementById("currentStopAddress");
const waitTimerEl = document.getElementById("waitTimer");
const passengersSection = document.getElementById("passengersSection");
const currentPassengersEl = document.getElementById("currentPassengers");
const stopStatusText = document.getElementById("stopStatusText");
const recenterBtn = document.getElementById("recenterBtn");
const btnPrimaryAction = document.getElementById("btnPrimaryAction");
const btnStartRide = document.getElementById("btnStartRide");
const eyeBtn = document.getElementById("eyeBtn");

const reasonBox = document.getElementById("reasonBox");
const reasonTitle = document.getElementById("reasonTitle");
const reasonPassenger = document.getElementById("reasonPassenger");
const reasonNotes = document.getElementById("reasonNotes");
const btnCloseReason = document.getElementById("btnCloseReason");
const btnSubmitReason = document.getElementById("btnSubmitReason");

const detailsBox = document.getElementById("detailsBox");
const detailsContent = document.getElementById("detailsContent");
const btnCloseDetails = document.getElementById("btnCloseDetails");

/* ================= STATE ================= */

let appConfig = {};
let systemDesign = {};
let serviceWaitConfig = {};
let appTimezone = "America/Phoenix";
let serverOffset = 0;

let tripDoc = null;
let routeStops = [];
let currentStopIndex = 0;

let map = null;
let driverMarker = null;
let routePolyline = null;
let guidePolyline = null;
let routeMarkers = [];

let driverLat = null;
let driverLng = null;
let lastGpsAccuracyMeters = 0;
let watchId = null;

let firstGpsFix = true;
let userMovedMap = false;

let timerInterval = null;

let lastSentLocationAt = 0;
let lastSentLat = null;
let lastSentLng = null;

let reasonContext = null;
let pendingReasonAfterCall = null;

/* ================= SERVER CLOCK ================= */

async function syncServerClock(){
  try{
    const res = await fetch("/api/config", { cache: "no-store" });
    const header = res.headers.get("date");

    if(header){
      const ms = new Date(header).getTime();

      if(Number.isFinite(ms)){
        serverOffset = ms - Date.now();
      }
    }
  }catch{}
}

/* ================= CONFIG LOAD ================= */

async function loadAppConfig(){
  try{
    const res = await fetch("/api/config", { cache: "no-store" });

    if(res.ok){
      appConfig = await res.json();
    }
  }catch{
    appConfig = {};
  }
}

function pickPositiveMinutes(...values){
  for(const value of values){
    const n = Number(value);

    if(Number.isFinite(n) && n >= 0){
      return n;
    }
  }

  return null;
}

function pickBoolean(...values){
  for(const value of values){
    if(value === true || value === false){
      return value;
    }

    const s = clean(value).toLowerCase();

    if(["true","1","yes","on","enabled"].includes(s)){
      return true;
    }

    if(["false","0","no","off","disabled"].includes(s)){
      return false;
    }
  }

  return null;
}

function applyServiceExecutionSettings(config={}){

  const pickupEnabled = pickBoolean(
    config.driverPickupWaitEnabled
  );

  const stopEnabled = pickBoolean(
    config.driverStopWaitEnabled
  );

  const pickup = pickPositiveMinutes(
    config.driverPickupWaitMinutes
  );

  const stop = pickPositiveMinutes(
    config.driverStopWaitMinutes
  );

  EXECUTION.pickupWaitEnabled =
    pickupEnabled === null
      ? DEFAULT_EXECUTION.pickupWaitEnabled
      : pickupEnabled;

  EXECUTION.stopWaitEnabled =
    stopEnabled === null
      ? DEFAULT_EXECUTION.stopWaitEnabled
      : stopEnabled;

  EXECUTION.pickupWaitMinutes =
    pickup === null
      ? DEFAULT_EXECUTION.pickupWaitMinutes
      : pickup;

  EXECUTION.stopWaitMinutes =
    stop === null
      ? DEFAULT_EXECUTION.stopWaitMinutes
      : stop;
}

async function loadSystemDesign(){
  try{
    const res = await fetch("/api/system-design", { cache: "no-store" });

    if(res.ok){
      systemDesign = await res.json();
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
  return new Promise((resolve, reject) => {
    if(window.google && google.maps && google.maps.Map){
      resolve();
      return;
    }

    const key = getGoogleMapsKey();

    if(!key){
      reject(new Error("Google Maps API key missing"));
      return;
    }

    const old = document.getElementById("google-maps-script");
    if(old) old.remove();

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.async = true;
    script.defer = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(key) +
      "&v=weekly&libraries=geometry";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));

    document.head.appendChild(script);
  });
}

/* ================= TRIP API ================= */

async function fetchTrip(){
  if(!TRIP_ID){
    alert("No trip found");
    window.location.href = "/driver/trips.html";
    return null;
  }

  const res = await fetch(`/api/trips/${TRIP_ID}`, {
    cache: "no-store"
  });

  if(!res.ok){
    throw new Error("Trip load failed");
  }

  return await res.json();
}

function addServiceCandidate(list,value){

  if(
    value === undefined ||
    value === null
  ){
    return;
  }

  if(typeof value === "object"){
    [
      value._id,
      value.id,
      value.serviceKey,
      value.key,
      value.code,
      value.title,
      value.name
    ].forEach(v=>
      addServiceCandidate(list,v)
    );
    return;
  }

  const text = clean(value);

  if(
    text &&
    text !== "[object Object]" &&
    !list.includes(text)
  ){
    list.push(text);
  }
}

function tripServiceCandidates(trip){

  const list = [];

  [
    trip?.serviceId,
    trip?.service?._id,
    trip?.service,
    trip?.serviceKey,
    trip?.serviceCode,
    trip?.serviceType,
    trip?.serviceName,
    trip?.serviceTitle,
    trip?.reservedServiceKey,
    trip?.companyServiceKey
  ].forEach(v=>
    addServiceCandidate(list,v)
  );

  return list;
}

async function loadTripServiceWaitConfig(){

  serviceWaitConfig = {};

  const candidates =
    tripServiceCandidates(
      tripDoc
    );

  for(const candidate of candidates){

    try{

      const res =
        await fetch(
          `/api/services/driver-config/${encodeURIComponent(candidate)}`,
          { cache:"no-store" }
        );

      if(!res.ok){
        continue;
      }

      const data =
        await res.json();

      if(data?.success === false){
        continue;
      }

      serviceWaitConfig = data || {};

      applyServiceExecutionSettings(
        serviceWaitConfig
      );

      console.log(
        "Driver wait config loaded:",
        candidate,
        serviceWaitConfig
      );

      return true;

    }catch(err){
      console.log(
        "Driver wait config lookup failed:",
        candidate,
        err
      );
    }
  }

  /* Safe fallback if an old trip has no recognized service identifier. */
  applyServiceExecutionSettings({});

  console.log(
    "Driver wait config fallback used",
    candidates
  );

  return false;
}

async function updateTrip(body){

  const res =
    await fetch(
      `/api/trips/${TRIP_ID}`,
      {
        method:"PUT",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(body)
      }
    );

  const data =
    await res.json().catch(
      ()=>({})
    );

  if(!res.ok){

    throw new Error(
      data.message ||
      "Trip update failed"
    );
  }

  /*
    Different trip routes may return:
      trip document directly
      { success:true, trip:{...} }
      { success:true, item:{...} }

    Keep tripDoc pointing to the actual trip.
  */
  const nextTrip =
    data?.trip ||
    data?.item ||
    data?.data ||
    data;

  if(
    nextTrip &&
    typeof nextTrip === "object"
  ){
    tripDoc = nextTrip;
  }

  return tripDoc;
}

/* ================= PASSENGERS ================= */

function passengerId(p, index){
  return String(
    firstValue(
      p?.passengerId,
      p?._id,
      p?.id,
      index
    )
  );
}

function passengerName(p, index){
  return clean(
    firstValue(
      p?.clientName,
      p?.passengerName,
      p?.memberName,
      p?.patientName,
      p?.name,
      `Passenger ${index + 1}`
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

function passengerPickup(p, trip){
  return clean(
    firstValue(
      p?.pickup,
      p?.pickupAddress,
      trip?.pickup,
      trip?.pickupAddress
    )
  );
}

function passengerDropoff(p, trip){
  return clean(
    firstValue(
      p?.dropoff,
      p?.dropoffAddress,
      trip?.dropoff,
      trip?.dropoffAddress
    )
  );
}

function pickupPoint(p, trip){
  return {
    lat: num(
      firstValue(
        p?.pickupLat,
        p?.pickupLatitude,
        trip?.pickupLat,
        trip?.pickupLatitude
      )
    ),
    lng: num(
      firstValue(
        p?.pickupLng,
        p?.pickupLongitude,
        trip?.pickupLng,
        trip?.pickupLongitude
      )
    )
  };
}

function dropoffPoint(p, trip){
  return {
    lat: num(
      firstValue(
        p?.dropoffLat,
        p?.dropLat,
        p?.dropoffLatitude,
        trip?.dropoffLat,
        trip?.dropLat
      )
    ),
    lng: num(
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

function sharedPickupPoint(p){
  return {
    lat: num(
      firstValue(
        p?.pickupLat,
        p?.pickupLatitude
      )
    ),
    lng: num(
      firstValue(
        p?.pickupLng,
        p?.pickupLongitude
      )
    )
  };
}

function sharedDropoffPoint(p){
  return {
    lat: num(
      firstValue(
        p?.dropoffLat,
        p?.dropLat,
        p?.dropoffLatitude
      )
    ),
    lng: num(
      firstValue(
        p?.dropoffLng,
        p?.dropLng,
        p?.dropoffLongitude
      )
    )
  };
}

function getPassengers(trip){
  if(Array.isArray(trip?.passengers) && trip.passengers.length){
    return trip.passengers;
  }

  return [{
    passengerId: "single",
    clientName: firstValue(
      trip?.clientName,
      trip?.passengerName,
      trip?.memberName,
      trip?.patientName,
      "Passenger"
    ),
    clientPhone: firstValue(
      trip?.clientPhone,
      trip?.passengerPhone,
      trip?.memberPhone,
      trip?.patientPhone
    ),
    pickup: firstValue(trip?.pickup, trip?.pickupAddress),
    dropoff: firstValue(trip?.dropoff, trip?.dropoffAddress),
    pickupLat: trip?.pickupLat,
    pickupLng: trip?.pickupLng,
    dropoffLat: firstValue(trip?.dropoffLat, trip?.dropLat),
    dropoffLng: firstValue(trip?.dropoffLng, trip?.dropLng),
    pickupOrder: 1,
    dropoffOrder: 999999,
    tripDate: trip?.tripDate,
    tripTime: trip?.tripTime,
    status: firstValue(trip?.passengerStatus, trip?.status, "Scheduled")
  }];
}

/* ================= TRIP TIME ================= */

function phoenixLocalDateTimeToMs(date,time){

  const d =
    clean(date);

  const t =
    clean(time);

  if(
    !d ||
    !t
  ){
    return null;
  }

  const match =
    t.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

  if(!match){
    return null;
  }

  const hh =
    Number(match[1]);

  const mm =
    Number(match[2]);

  const ss =
    Number(
      match[3] || 0
    );

  const dateMatch =
    d.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if(!dateMatch){
    return null;
  }

  const year =
    Number(dateMatch[1]);

  const month =
    Number(dateMatch[2]);

  const day =
    Number(dateMatch[3]);

  /*
    Arizona / America-Phoenix = UTC-7 year-round.
    Convert stored app-local trip date/time to one absolute UTC instant.
  */
  return Date.UTC(
    year,
    month - 1,
    day,
    hh + 7,
    mm,
    ss,
    0
  );
}

function buildScheduledTime(trip, source = null){

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
      ).getTime();

    if(
      Number.isFinite(ms)
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

  if(
    appTimezone ===
    "America/Phoenix"
  ){
    const phoenixMs =
      phoenixLocalDateTimeToMs(
        date,
        time
      );

    if(
      Number.isFinite(
        phoenixMs
      )
    ){
      return phoenixMs;
    }
  }

  const ms =
    new Date(
      `${date}T${time}`
    ).getTime();

  return Number.isFinite(ms)
    ? ms
    : null;
}

function formatScheduledTime(ms){
  if(!Number.isFinite(ms)) return "--:--";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: appTimezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(ms));
}

/* ================= NORMAL STOPS ================= */

function buildNormalStops(trip){
  const stops = Array.isArray(trip?.stops) ? trip.stops : [];
  const coords = Array.isArray(trip?.stopCoords) ? trip.stopCoords : [];
  const out = [];

  for(let i = 0; i < stops.length; i++){
    const raw = stops[i];

    const address = clean(
      typeof raw === "string"
        ? raw
        : firstValue(
            raw?.address,
            raw?.fullAddress,
            raw?.stopAddress,
            raw?.location
          )
    );

    const coordByAddress = coords.find(c =>
      normalizeAddressKey(firstValue(c?.address, c?.fullAddress)) ===
      normalizeAddressKey(address)
    );

    const coord = coordByAddress || coords[i] || {};

    out.push({
      stopId: String(
        firstValue(
          raw?.stopId,
          raw?._id,
          raw?.id,
          `stop-${i + 1}`
        )
      ),
      type: "stop",
      order: i + 2,
      address,
      lat: num(
        firstValue(
          raw?.lat,
          raw?.latitude,
          coord?.lat,
          coord?.latitude
        )
      ),
      lng: num(
        firstValue(
          raw?.lng,
          raw?.lon,
          raw?.longitude,
          coord?.lng,
          coord?.lon,
          coord?.longitude
        )
      ),
      scheduledAt: null,
      passengers: []
    });
  }

  return out;
}

/* ================= SHARED GROUPS ================= */

function samePickupGroup(group, p, trip){
  const address = normalizeAddressKey(passengerPickup(p, trip));
  const groupAddress = normalizeAddressKey(group?.addressKey || group?.address);

  /*
    IMPORTANT:
    If both passengers have real pickup addresses, the address decides the group.
    Do NOT fall back to trip-level coordinates when the addresses are different,
    because shared passengers may inherit the same trip pickup lat/lng fallback.
  */
  if(address && groupAddress){
    return address === groupAddress;
  }

  /* Coordinate fallback is allowed only when one side has no usable address. */
  const point = sharedPickupPoint(p);

  if(
    validPoint(group.lat, group.lng) &&
    validPoint(point.lat, point.lng)
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
  const passengers = getPassengers(trip);
  const pickupGroups = [];
  const dropoffs = [];

  passengers.forEach((p, index) => {
    const id = passengerId(p, index);
    const name = passengerName(p, index);
    const phone = passengerPhone(p);

    const pPickup = passengerPickup(p, trip);
    const pDropoff = passengerDropoff(p, trip);

    const pu = sharedPickupPoint(p);
    const dr = sharedDropoffPoint(p);

    const pickupOrder = num(
      firstValue(
        p?.pickupOrder,
        p?.pickupSequence,
        p?.routePickupOrder
      ),
      index * 10 + 1
    );

    const dropoffOrder = num(
      firstValue(
        p?.dropoffOrder,
        p?.dropoffSequence,
        p?.routeDropoffOrder
      ),
      index * 10 + 9
    );

    let group = pickupGroups.find(g => samePickupGroup(g, p, trip));

    if(!group){
      group = {
        stopId: `pickup-${pickupGroups.length + 1}`,
        type: "pickup",
        order: pickupOrder,
        address: pPickup,
        addressKey: normalizeAddressKey(pPickup),
        lat: pu.lat,
        lng: pu.lng,
        scheduledAt: buildScheduledTime(trip, p),
        passengers: []
      };

      pickupGroups.push(group);
    }else{
      group.order = Math.min(group.order, pickupOrder);
    }

    group.passengers.push({
      passengerId: id,
      name,
      phone,
      sourceIndex: index,
      status: clean(p?.status || "Scheduled")
    });

    dropoffs.push({
      stopId: `dropoff-${id}`,
      type: "dropoff",
      order: dropoffOrder,
      address: pDropoff,
      lat: dr.lat,
      lng: dr.lng,
      scheduledAt: null,
      passengers: [{
        passengerId: id,
        name,
        phone,
        sourceIndex: index,
        status: clean(p?.status || "Scheduled")
      }]
    });
  });

  return [...pickupGroups, ...dropoffs]
    .sort((a, b) => a.order - b.order);
}

/* ================= ROUTE BUILD ================= */

function isSharedTrip(){
  return (
    tripDoc?.isShared === true ||
    clean(tripDoc?.tripType).toUpperCase() === "SHARED" ||
    clean(tripDoc?.serviceCode).toUpperCase() === "SH" ||
    clean(tripDoc?.serviceKey).toUpperCase() === "SH" ||
    (
      Array.isArray(tripDoc?.passengers) &&
      tripDoc.passengers.length > 1
    )
  );
}

function buildRouteStops(trip){
  const shared =
    trip?.isShared === true ||
    clean(trip?.tripType).toUpperCase() === "SHARED" ||
    clean(trip?.serviceCode).toUpperCase() === "SH" ||
    clean(trip?.serviceKey).toUpperCase() === "SH" ||
    (
      Array.isArray(trip?.passengers) &&
      trip.passengers.length > 1
    );

  if(shared){
    return buildSharedStops(trip);
  }

  const passengers = getPassengers(trip);
  const p = passengers[0];

  const pu = pickupPoint(p, trip);
  const dr = dropoffPoint(p, trip);

  const pickup = {
    stopId: "pickup-1",
    type: "pickup",
    order: 1,
    address: passengerPickup(p, trip),
    lat: pu.lat,
    lng: pu.lng,
    scheduledAt: buildScheduledTime(trip, p),
    passengers: [{
      passengerId: passengerId(p, 0),
      name: passengerName(p, 0),
      phone: passengerPhone(p),
      sourceIndex: 0,
      status: clean(p?.status || "Scheduled")
    }]
  };

  const middle = buildNormalStops(trip);

  const dropoff = {
    stopId: "dropoff-1",
    type: "dropoff",
    order: middle.length + 2,
    address: passengerDropoff(p, trip),
    lat: dr.lat,
    lng: dr.lng,
    scheduledAt: null,
    passengers: [{
      passengerId: passengerId(p, 0),
      name: passengerName(p, 0),
      phone: passengerPhone(p),
      sourceIndex: 0,
      status: clean(p?.status || "Scheduled")
    }]
  };

  return [pickup, ...middle, dropoff];
}

/* ================= SAVED COORDINATES ================= */

function findSavedRoutePoint(address, type){
  if(!tripDoc) return null;

  const wantedAddress = normalizeAddressKey(address);
  const wantedType = clean(type).toLowerCase();

  if(!wantedAddress) return null;

  const plans = [
    tripDoc.sharedRoutePlan,
    tripDoc.routePlan
  ];

  for(const plan of plans){
    if(!Array.isArray(plan)) continue;

    const found = plan.find(point => {
      const pointAddress = normalizeAddressKey(point?.address);

      if(pointAddress !== wantedAddress){
        return false;
      }

      const pointType = clean(point?.type).toLowerCase();

      if(wantedType && pointType && pointType !== wantedType){
        return false;
      }

      return validPoint(point?.lat, point?.lng);
    });

    if(found){
      return {
        lat: Number(found.lat),
        lng: Number(found.lng)
      };
    }
  }

  return null;
}

function readSavedRouteLegs(){
  if(!tripDoc) return [];

  const candidates = [
    tripDoc?.googleRoute?.legs,
    tripDoc?.googleRoute?.routes?.[0]?.legs,
    tripDoc?.optimizedRoute?.legs,
    tripDoc?.optimizedRoute?.routes?.[0]?.legs
  ];

  for(const legs of candidates){
    if(Array.isArray(legs) && legs.length){
      return legs;
    }
  }

  return [];
}

function legLocationPoint(leg, side){
  if(!leg) return null;

  const prefix = side === "start" ? "start" : "end";

  const directLat = num(
    firstValue(
      leg?.[`${prefix}Lat`],
      leg?.[`${prefix}_lat`]
    )
  );

  const directLng = num(
    firstValue(
      leg?.[`${prefix}Lng`],
      leg?.[`${prefix}Lon`],
      leg?.[`${prefix}_lng`]
    )
  );

  if(validPoint(directLat, directLng)){
    return { lat: directLat, lng: directLng };
  }

  const location = firstValue(
    leg?.[`${prefix}Location`],
    leg?.[`${prefix}_location`],
    leg?.[`${prefix}Point`]
  );

  if(location && typeof location === "object"){
    const latValue =
      typeof location.lat === "function"
        ? location.lat()
        : firstValue(location.lat, location.latitude);

    const lngValue =
      typeof location.lng === "function"
        ? location.lng()
        : firstValue(
            location.lng,
            location.lon,
            location.longitude
          );

    const lat = num(latValue);
    const lng = num(lngValue);

    if(validPoint(lat, lng)){
      return { lat, lng };
    }
  }

  return null;
}

function savedRouteCoordinateSequence(){
  const legs = readSavedRouteLegs();
  if(!legs.length) return [];

  const out = [];
  const first = legLocationPoint(legs[0], "start");

  if(first) out.push(first);

  for(const leg of legs){
    const end = legLocationPoint(leg, "end");
    if(end) out.push(end);
  }

  return out;
}

function findSavedLegPointByAddress(address){
  const wanted = normalizeAddressKey(address);
  if(!wanted) return null;

  const legs = readSavedRouteLegs();

  for(const leg of legs){
    const startAddress = normalizeAddressKey(
      firstValue(leg?.startAddress, leg?.start_address)
    );

    const endAddress = normalizeAddressKey(
      firstValue(leg?.endAddress, leg?.end_address)
    );

    if(startAddress === wanted){
      const point = legLocationPoint(leg, "start");
      if(point) return point;
    }

    if(endAddress === wanted){
      const point = legLocationPoint(leg, "end");
      if(point) return point;
    }
  }

  return null;
}

async function ensureStopCoordinates(stop){

  if(!stop){
    return false;
  }

  /*
    ARRIVED depends on this coordinate.
    Use the route that was already saved by the server.
    This applies to BOTH Individual and Shared.

    Priority:
      1) exact routePlan/sharedRoutePlan address
      2) exact saved Google/optimized leg address
      3) saved route-leg sequence by current route order
      4) coordinates already stored directly on the stop/trip

    ZERO Directions requests.
    ZERO Geocoder requests.
  */

  const saved =
    findSavedRoutePoint(
      stop.address,
      stop.type
    ) ||
    findSavedRoutePoint(
      stop.address,
      ""
    );

  if(saved){

    stop.lat =
      Number(saved.lat);

    stop.lng =
      Number(saved.lng);

    return true;
  }

  const legPoint =
    findSavedLegPointByAddress(
      stop.address
    );

  if(legPoint){

    stop.lat =
      Number(legPoint.lat);

    stop.lng =
      Number(legPoint.lng);

    return true;
  }

  const sequence =
    savedRouteCoordinateSequence();

  const index =
    routeStops.indexOf(
      stop
    );

  if(
    index >= 0 &&
    validPoint(
      sequence?.[index]?.lat,
      sequence?.[index]?.lng
    )
  ){

    stop.lat =
      Number(
        sequence[index].lat
      );

    stop.lng =
      Number(
        sequence[index].lng
      );

    return true;
  }

  if(
    validPoint(
      stop.lat,
      stop.lng
    )
  ){
    return true;
  }

  return false;
}

/* ================= LOCAL STOP STATE ================= */

function stateKey(stop){
  return (
    `driver_stop_state_${TRIP_ID}_${stop?.stopId || "none"}`
  );
}

function readStopState(stop){
  if(!stop) return {};

  try{
    return JSON.parse(
      localStorage.getItem(stateKey(stop)) || "{}"
    );
  }catch{
    return {};
  }
}

function saveStopState(stop, patch = {}){
  if(!stop) return;

  const old = readStopState(stop);

  localStorage.setItem(
    stateKey(stop),
    JSON.stringify({
      ...old,
      ...patch,
      stopId: stop.stopId,
      tripId: TRIP_ID
    })
  );
}

function passengerStateKey(stop, passengerIdValue){
  return (
    `driver_passenger_state_${TRIP_ID}_` +
    `${stop?.stopId || "none"}_` +
    `${String(passengerIdValue || "none")}`
  );
}

function readPassengerLocalState(stop, passengerIdValue){
  try{
    return JSON.parse(
      localStorage.getItem(
        passengerStateKey(stop, passengerIdValue)
      ) || "{}"
    );
  }catch{
    return {};
  }
}

function savePassengerLocalState(stop, passengerIdValue, patch = {}){
  const old = readPassengerLocalState(stop, passengerIdValue);

  localStorage.setItem(
    passengerStateKey(stop, passengerIdValue),
    JSON.stringify({
      ...old,
      ...patch,
      tripId: TRIP_ID,
      stopId: stop?.stopId || "",
      passengerId: String(passengerIdValue || "")
    })
  );
}

function clearTripLocalState(){
  const prefixes = [
    `driver_stop_state_${TRIP_ID}_`,
    `driver_passenger_state_${TRIP_ID}_`
  ];

  const keys = [];

  for(let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i);

    if(
      key &&
      prefixes.some(prefix => key.startsWith(prefix))
    ){
      keys.push(key);
    }
  }

  keys.forEach(key => localStorage.removeItem(key));
}

function tripIsFresh(){
  const s = normalizeStatus(
    firstValue(
      tripDoc?.dispatchStatus,
      tripDoc?.status,
      "scheduled"
    )
  );

  const fresh = [
    "scheduled",
    "confirmed",
    "assigned",
    "sent",
    "accepted",
    "dispatched",
    "upcoming",
    "ready",
    "paid"
  ].includes(s);

  return fresh && !tripDoc?.startedAt && !tripDoc?.arrivedAt;
}

function restoreCurrentStop(){
  if(tripIsFresh()){
    clearTripLocalState();
    currentStopIndex = 0;
    return;
  }

  for(let i = 0; i < routeStops.length; i++){
    if(readStopState(routeStops[i]).completed === true){
      continue;
    }

    if(!stopHasActionablePassenger(routeStops[i])){
      saveStopState(routeStops[i],{
        completed:true,
        skipped:true,
        completedAt:serverNow()
      });
      continue;
    }

    currentStopIndex = i;
    return;
  }

  currentStopIndex = Math.max(0, routeStops.length - 1);
}

function currentStop(){
  return routeStops[currentStopIndex] || null;
}

function stopIsArrived(stop){
  return readStopState(stop).arrived === true;
}

function requireArrived(stop){

  const active =
    currentStop();

  if(
    !stop ||
    !active ||
    String(active.stopId) !==
    String(stop.stopId)
  ){
    return false;
  }

  if(
    !stopIsArrived(stop)
  ){
    alert(
      "Press ARRIVED first."
    );

    return false;
  }

  return true;
}

function currentStopCanShowActions(stop){

  const active =
    currentStop();

  return (
    !!stop &&
    !!active &&
    String(active.stopId) ===
      String(stop.stopId) &&
    stopIsArrived(stop)
  );
}

/* ================= PASSENGER STATUS ================= */

function canonicalPickupState(status){
  const s = normalizeStatus(status);

  if([
    "picked",
    "picked up",
    "pickup complete",
    "on trip",
    "ontrip"
  ].includes(s)){
    return "PICKED";
  }

  if(["cancelled", "canceled", "cancel"].includes(s)){
    return "CANCELLED";
  }

  if(["no show", "noshow"].includes(s)){
    return "NO_SHOW";
  }

  return "WAITING";
}

function pickupPassengerState(stop, passenger){
  const local = readPassengerLocalState(stop, passenger.passengerId);

  if(local.pickupState){
    return clean(local.pickupState).toUpperCase();
  }

  return canonicalPickupState(passenger.status);
}

function pickupPassengerFinal(stop, passenger){
  return ["PICKED", "CANCELLED", "NO_SHOW"].includes(
    pickupPassengerState(stop, passenger)
  );
}

function unresolvedPickupPassengers(stop){
  if(!stop || stop.type !== "pickup"){
    return [];
  }

  return (stop.passengers || [])
    .filter(p => !pickupPassengerFinal(stop, p));
}

function allPickupPassengersResolved(stop){
  const list = (stop?.passengers || []);

  return (
    list.length > 0 &&
    list.every(p => pickupPassengerFinal(stop, p))
  );
}

function canStartRideNow(stop){
  if(!stop || stop.type !== "pickup"){
    return false;
  }

  const stopState = readStopState(stop);

  if(stopState.arrived !== true){
    return false;
  }

  const list = (stop.passengers || []);

  if(!list.length){
    return false;
  }

  /*
    HARD SAFETY GATE:
    every passenger must have an explicit final passenger state.
    WAITING blocks Start Ride.
  */
  return list.every(p => {
    const state = pickupPassengerState(stop, p);
    return ["PICKED", "CANCELLED", "NO_SHOW"].includes(state);
  });
}

function pickedPassengers(stop){
  return (stop?.passengers || [])
    .filter(p => pickupPassengerState(stop, p) === "PICKED");
}

function pickupResolutionSummary(stop){
  const list = (stop?.passengers || []);

  const states = list.map(p => pickupPassengerState(stop, p));

  return {
    total: list.length,
    picked: states.filter(s => s === "PICKED").length,
    cancelled: states.filter(s => s === "CANCELLED").length,
    noShow: states.filter(s => s === "NO_SHOW").length,
    waiting: states.filter(s => s === "WAITING").length
  };
}

function hasAnyPickedPassenger(stop){
  return pickupResolutionSummary(stop).picked > 0;
}

function allPickupPassengersNonRideFinal(stop){
  const summary = pickupResolutionSummary(stop);

  return (
    summary.total > 0 &&
    summary.waiting === 0 &&
    summary.picked === 0 &&
    (summary.cancelled + summary.noShow) === summary.total
  );
}

function tripPassengerRecords(){
  if(Array.isArray(tripDoc?.passengers) && tripDoc.passengers.length){
    return tripDoc.passengers.map((p,index)=>(
      {
        id:passengerId(p,index),
        status:firstValue(p?.status,"Scheduled"),
        source:p
      }
    ));
  }

  return [{
    id:"single",
    status:firstValue(
      tripDoc?.passengerStatus,
      tripDoc?.status,
      "Scheduled"
    ),
    source:tripDoc
  }];
}

function tripPassengerStatus(passengerIdValue){
  const wanted = String(passengerIdValue ?? "");
  const record = tripPassengerRecords()
    .find(r=>String(r.id) === wanted);

  return normalizeStatus(record?.status || "");
}

function isTerminalPassengerStatus(status){
  const s = normalizeStatus(status);

  return [
    "completed",
    "cancelled",
    "canceled",
    "no show",
    "noshow"
  ].includes(s);
}

function isNonRidePassengerStatus(status){
  const s = normalizeStatus(status);

  return [
    "cancelled",
    "canceled",
    "no show",
    "noshow"
  ].includes(s);
}

function isRidePassengerStatus(status){
  const s = normalizeStatus(status);

  return [
    "picked",
    "picked up",
    "on trip",
    "ontrip",
    "in progress",
    "inprogress"
  ].includes(s);
}

function allTripPassengersTerminal(){
  const records = tripPassengerRecords();

  return (
    records.length > 0 &&
    records.every(r=>isTerminalPassengerStatus(r.status))
  );
}

function tripHasRidePassenger(){
  return tripPassengerRecords()
    .some(r=>isRidePassengerStatus(r.status));
}

function hasAnyPickedPassengerForRide(){

  /*
    Local pickup state is the source of truth immediately after the
    driver presses PICK UP. This avoids waiting for a server response
    shape or refresh before START RIDE becomes active.
  */
  for(
    const stop of routeStops
  ){

    if(
      stop?.type !== "pickup"
    ){
      continue;
    }

    const passengers =
      Array.isArray(stop.passengers)
        ? stop.passengers
        : [];

    for(
      const passenger of passengers
    ){

      /* Every record in stop.passengers is a real rider.
         Never hide a rider because their name/phone happens to match the driver. */
      if(
        pickupPassengerState(
          stop,
          passenger
        ) === "PICKED"
      ){
        return true;
      }
    }
  }

  /*
    Server state remains a second source of truth after refresh.
  */
  return tripHasRidePassenger();
}

function finalTripStatusFromPassengers(){
  const statuses = tripPassengerRecords()
    .map(r=>normalizeStatus(r.status));

  if(statuses.some(s=>s === "completed")){
    return "Completed";
  }

  const allNoShow = statuses.length > 0 &&
    statuses.every(s=>["no show","noshow"].includes(s));

  if(allNoShow){
    return "No Show";
  }

  const allCancelled = statuses.length > 0 &&
    statuses.every(s=>["cancelled","canceled"].includes(s));

  if(allCancelled){
    return "Cancelled";
  }

  /* Mixed Cancelled + No Show, with nobody transported. */
  return "Cancelled";
}

function stopHasActionablePassenger(stop){
  if(!stop){
    return false;
  }

  if(stop.type === "stop"){
    return !allTripPassengersTerminal();
  }

  const passengers = Array.isArray(stop.passengers)
    ? stop.passengers
    : [];

  if(!passengers.length){
    return stop.type === "pickup";
  }

  if(stop.type === "pickup"){
    return passengers.some(p=>{
      const local = pickupPassengerState(stop,p);

      if(["CANCELLED","NO_SHOW"].includes(local)){
        return false;
      }

      const serverStatus = tripPassengerStatus(p.passengerId);
      return !isTerminalPassengerStatus(serverStatus);
    });
  }

  if(stop.type === "dropoff"){
    return passengers.some(p=>{
      const status = tripPassengerStatus(p.passengerId);
      return !isTerminalPassengerStatus(status) &&
             !isNonRidePassengerStatus(status);
    });
  }

  return true;
}

function nextActionableStopIndex(fromIndex=currentStopIndex+1){
  for(let i=fromIndex;i<routeStops.length;i++){
    const stop = routeStops[i];

    if(readStopState(stop).completed === true){
      continue;
    }

    if(!stopHasActionablePassenger(stop)){
      saveStopState(stop,{
        completed:true,
        skipped:true,
        completedAt:serverNow()
      });
      continue;
    }

    return i;
  }

  return -1;
}

async function finishTripAndReturnToTrips(forceStatus=""){
  const status = clean(forceStatus) || finalTripStatusFromPassengers();
  const now = serverNow();

  try{
    await updateTrip({
      status,
      dispatchStatus:
        normalizeStatus(status) === "completed"
          ? "COMPLETED"
          : normalizeStatus(status) === "no show"
            ? "NOSHOW"
            : normalizeStatus(status) === "not completed"
              ? "NOTCOMPLETED"
              : "CANCELLED",
      completedAt:
        status === "Completed"
          ? now
          : tripDoc?.completedAt,
      finalStatusAt:now,
      driverId:DRIVER_ID,
      driverName:DRIVER_NAME
    });
  }catch(err){
    console.log("FINAL TRIP UPDATE ERROR:",err);
  }

  clearTripLocalState();
  localStorage.removeItem("activeDriverTripId");

  if(timerInterval){
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if(
    watchId !== null &&
    navigator.geolocation
  ){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  window.location.replace("/driver/trips.html");
}

async function handleResolvedPickupGroup(stop,autoOpenGoogle=true){
  if(!stop || stop.type !== "pickup"){
    return false;
  }

  if(!allPickupPassengersResolved(stop)){
    return false;
  }

  /* If the entire trip is terminal, remove it immediately from driver execution. */
  if(allTripPassengersTerminal()){
    await finishTripAndReturnToTrips();
    return true;
  }

  const nextIndex = nextActionableStopIndex(currentStopIndex+1);

  /*
    Different pickup location:
    once the CURRENT pickup group's passengers are all resolved,
    automatically move to the next pickup group and show only its passengers.
  */
  if(
    nextIndex >= 0 &&
    routeStops[nextIndex]?.type === "pickup"
  ){
    saveStopState(stop,{
      completed:true,
      completedAt:serverNow(),
      pickupGroupResolved:true
    });

    currentStopIndex = nextIndex;
    renderExecutionState();
    fitMap();

    if(autoOpenGoogle){
      setTimeout(openGoogleNavigation,250);
    }

    return true;
  }

  /*
    No more pickup groups before the next ride leg.
    Keep the current pickup screen and enable START RIDE only if at least
    one passenger anywhere in the trip was actually picked up.
  */
  renderExecutionState();
  return true;
}

async function finishPickupWithoutRide(stop){
  if(!allPickupPassengersNonRideFinal(stop)){
    return false;
  }

  if(allTripPassengersTerminal()){
    await finishTripAndReturnToTrips();
    return true;
  }

  return await handleResolvedPickupGroup(stop,true);
}

/* ================= GEOFENCE ================= */

function currentDistance(){
  const stop = currentStop();

  if(
    !stop ||
    !validPoint(driverLat, driverLng) ||
    !validPoint(stop.lat, stop.lng)
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
  const d = currentDistance();

  if(d === null){
    return false;
  }

  /*
    Main arrival radius = 250m.
    Allow up to 40m extra only for the phone's reported GPS accuracy,
    preventing false lockout while standing at the pickup point.
  */
  const accuracy = Number(lastGpsAccuracyMeters || 0);

  const allowanceMeters =
    Number.isFinite(accuracy)
      ? Math.min(Math.max(accuracy, 0), 40)
      : 0;

  const allowedMiles =
    (STOP_RADIUS_METERS + allowanceMeters) /
    METERS_PER_MILE;

  return d <= allowedMiles;
}

/* ================= TIMER ================= */

function waitEnabledForStop(stop){
  if(stop?.type === "pickup"){
    return EXECUTION.pickupWaitEnabled === true;
  }

  if(stop?.type === "stop"){
    return EXECUTION.stopWaitEnabled === true;
  }

  return false;
}

function waitMinutesForStop(stop){
  if(stop?.type === "pickup"){
    return EXECUTION.pickupWaitMinutes;
  }

  if(stop?.type === "stop"){
    return EXECUTION.stopWaitMinutes;
  }

  return 0;
}

function waitDurationSeconds(stop){
  if(!waitEnabledForStop(stop)){
    return 0;
  }

  return Math.max(
    0,
    Number(waitMinutesForStop(stop) || 0)
  ) * 60;
}

function waitStart(stop){

  if(
    !waitEnabledForStop(stop)
  ){
    return null;
  }

  const state =
    readStopState(stop);

  const arrivedAt =
    num(state.arrivedAt);

  if(
    !Number.isFinite(arrivedAt)
  ){
    return null;
  }

  /*
    PICKUP TIMER RULE:
    start = max(TRIP_TIME, ARRIVED_TIME)

    - Driver arrives early:
      timer waits until the exact scheduled trip time.
    - Driver arrives late:
      timer starts from ARRIVED time.
    - Uses serverNow() / serverOffset, so device clock cannot start it early.
  */
  if(
    stop?.type === "pickup"
  ){
    const scheduledAt =
      num(stop?.scheduledAt);

    if(
      Number.isFinite(
        scheduledAt
      )
    ){
      return Math.max(
        scheduledAt,
        arrivedAt
      );
    }
  }

  /*
    STOP TIMER:
    no independent booking time.
    It starts from ARRIVED at that stop.
  */
  return arrivedAt;
}

function timerStarted(stop){
  if(!waitEnabledForStop(stop)){
    return false;
  }

  const start = waitStart(stop);

  return (
    Number.isFinite(start) &&
    serverNow() >= start
  );
}

function timerRemaining(stop){
  if(!waitEnabledForStop(stop)){
    return 0;
  }

  const start = waitStart(stop);
  const duration = waitDurationSeconds(stop);

  if(!Number.isFinite(start)){
    return duration;
  }

  const elapsed = Math.floor((serverNow() - start) / 1000);

  return Math.max(
    0,
    duration - elapsed
  );
}

function timerExpired(stop){
  if(!waitEnabledForStop(stop)){
    return false;
  }

  return (
    timerStarted(stop) &&
    timerRemaining(stop) <= 0
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

  let syncCounter = 0;

  timerInterval =
    setInterval(
      async ()=>{

        syncCounter++;

        /*
          Re-sync server clock every 30 seconds.
          Timer always uses serverNow(), never raw device Date.now().
        */
        if(
          syncCounter >= 30
        ){
          syncCounter = 0;

          await syncServerClock();
        }

        renderExecutionState();

      },
      1000
    );
}

/* ================= GOOGLE MAP ================= */

function initGoogleMap(){
  map = new google.maps.Map(mapEl, {
    center: {
      lat: 33.4484,
      lng: -112.0740
    },
    zoom: 15,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    zoomControl: false
  });

  map.addListener("dragstart", () => {
    userMovedMap = true;
  });

  map.addListener("zoom_changed", () => {
    if(!firstGpsFix){
      userMovedMap = true;
    }
  });
}

function markerIcon(color, scale = 9){
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
    scale
  };
}

function updateDriverMarker(){
  if(!map || !validPoint(driverLat, driverLng)){
    return;
  }

  const pos = {
    lat: driverLat,
    lng: driverLng
  };

  if(!driverMarker){
    driverMarker = new google.maps.Marker({
      map,
      position: pos,
      title: "Driver",
      icon: markerIcon("#f59e0b", 9)
    });
  }else{
    driverMarker.setPosition(pos);
  }
}

function clearRouteMarkers(){

  routeMarkers.forEach(marker => {
    if(marker){
      marker.setMap(null);
    }
  });

  routeMarkers = [];
}

/*
  PERSISTENT ROUTE MARKERS

  IMPORTANT:
  renderExecutionState() runs every second because of the timer.
  The old code deleted and recreated every marker every second,
  which caused Pickup / Dropoff markers to flash.

  This version creates each marker once and only updates it when
  position / active-state actually changes.
*/
function drawRouteMarkers(){

  if(!map){
    return;
  }

  routeStops.forEach((stop,index)=>{

    if(
      !validPoint(
        stop.lat,
        stop.lng
      )
    ){
      if(routeMarkers[index]){
        routeMarkers[index].setMap(null);
        routeMarkers[index] = null;
      }

      return;
    }

    let color =
      "#64748b";

    if(
      index ===
      currentStopIndex
    ){
      color =
        stop.type === "pickup"
          ? "#2563eb"
          : stop.type === "dropoff"
            ? "#16a34a"
            : "#7c3aed";
    }

    const scale =
      index === currentStopIndex
        ? 11
        : 8;

    const stateKey =
      `${index}|${color}|${scale}|${stop.type}`;

    const position = {
      lat:Number(stop.lat),
      lng:Number(stop.lng)
    };

    let marker =
      routeMarkers[index];

    if(!marker){

      marker =
        new google.maps.Marker({
          map,
          position,
          title:
            stop.address ||
            stop.type,
          label:{
            text:String(index + 1),
            color:"#fff",
            fontWeight:"900",
            fontSize:"11px"
          },
          icon:
            markerIcon(
              color,
              scale
            ),
          zIndex:
            index === currentStopIndex
              ? 30
              : 10
        });

      marker.__sunbeamStateKey =
        stateKey;

      marker.__sunbeamLat =
        position.lat;

      marker.__sunbeamLng =
        position.lng;

      routeMarkers[index] =
        marker;

      return;
    }

    if(
      marker.getMap() !== map
    ){
      marker.setMap(map);
    }

    if(
      marker.__sunbeamLat !== position.lat ||
      marker.__sunbeamLng !== position.lng
    ){
      marker.setPosition(
        position
      );

      marker.__sunbeamLat =
        position.lat;

      marker.__sunbeamLng =
        position.lng;
    }

    if(
      marker.__sunbeamStateKey !==
      stateKey
    ){
      marker.setIcon(
        markerIcon(
          color,
          scale
        )
      );

      marker.setZIndex(
        index === currentStopIndex
          ? 30
          : 10
      );

      marker.__sunbeamStateKey =
        stateKey;
    }

    const title =
      stop.address ||
      stop.type;

    if(
      marker.getTitle() !==
      title
    ){
      marker.setTitle(
        title
      );
    }
  });

  /*
    Remove only markers that no longer belong to this route.
    Normal timer re-renders never touch existing route markers.
  */
  for(
    let i = routeStops.length;
    i < routeMarkers.length;
    i++
  ){
    if(routeMarkers[i]){
      routeMarkers[i].setMap(null);
    }
  }

  routeMarkers.length =
    routeStops.length;
}

function savedEncodedPolyline(){

  const direct =
    firstValue(
      tripDoc?.googleRoute?.overviewPolyline?.points,
      tripDoc?.googleRoute?.overview_polyline?.points,
      tripDoc?.googleRoute?.routes?.[0]?.overviewPolyline?.points,
      tripDoc?.googleRoute?.routes?.[0]?.overview_polyline?.points,
      tripDoc?.optimizedRoute?.overviewPolyline?.points,
      tripDoc?.optimizedRoute?.overview_polyline?.points,
      tripDoc?.optimizedRoute?.routes?.[0]?.overviewPolyline?.points,
      tripDoc?.optimizedRoute?.routes?.[0]?.overview_polyline?.points,
      tripDoc?.overviewPolyline?.points,
      tripDoc?.overview_polyline?.points,
      tripDoc?.overviewPolyline,
      tripDoc?.overview_polyline,
      tripDoc?.routePolyline?.points,
      tripDoc?.encodedPolyline?.points,
      tripDoc?.routePolyline,
      tripDoc?.encodedPolyline,
      tripDoc?.polyline
    );

  if(
    typeof direct === "string"
  ){
    return clean(direct);
  }

  return "";
}

function savedRoutePathArray(){

  const candidates = [
    tripDoc?.googleRoute?.path,
    tripDoc?.googleRoute?.routePath,
    tripDoc?.googleRoute?.polylinePath,
    tripDoc?.optimizedRoute?.path,
    tripDoc?.optimizedRoute?.routePath,
    tripDoc?.routePath,
    tripDoc?.polylinePath
  ];

  for(
    const candidate of candidates
  ){

    if(
      !Array.isArray(candidate) ||
      !candidate.length
    ){
      continue;
    }

    const path =
      candidate
      .map(point=>{

        const lat =
          num(
            firstValue(
              point?.lat,
              point?.latitude
            )
          );

        const lng =
          num(
            firstValue(
              point?.lng,
              point?.lon,
              point?.longitude
            )
          );

        if(
          !validPoint(
            lat,
            lng
          )
        ){
          return null;
        }

        return {
          lat:Number(lat),
          lng:Number(lng)
        };
      })
      .filter(Boolean);

    if(
      path.length >= 2
    ){
      return path;
    }
  }

  return [];
}

function drawDisplayLine(){

  if(!map){
    return;
  }

  /*
    The saved road line is static for this trip.
    If it already exists, keep it on the map instead of rebuilding it
    every second with the timer render.
  */
  if(routePolyline){
    return;
  }

  if(guidePolyline){
    guidePolyline.setMap(null);
    guidePolyline = null;
  }

  /*
    PRIORITY 1:
    TRUE encoded road polyline already stored with the trip.
    ZERO Directions requests.
  */
  const encoded =
    savedEncodedPolyline();

  if(
    encoded &&
    google?.maps?.geometry?.encoding
  ){
    try{

      const fullPath =
        google.maps.geometry.encoding.decodePath(
          encoded
        );

      if(
        fullPath?.length >= 2
      ){
        routePolyline =
          new google.maps.Polyline({
            map,
            path:fullPath,
            geodesic:false,
            strokeColor:"#2f7df6",
            strokeOpacity:0.92,
            strokeWeight:5,
            zIndex:5
          });

        return;
      }

    }catch(err){

      console.log(
        "SAVED POLYLINE DRAW ERROR:",
        err
      );
    }
  }

  /*
    PRIORITY 2:
    saved road path as lat/lng points.
    This is also a real previously-calculated route and makes ZERO requests.
  */
  const savedPath =
    savedRoutePathArray();

  if(
    savedPath.length >= 2
  ){
    routePolyline =
      new google.maps.Polyline({
        map,
        path:savedPath,
        geodesic:false,
        strokeColor:"#2f7df6",
        strokeOpacity:0.92,
        strokeWeight:5,
        zIndex:5
      });

    return;
  }

  /*
    NO FAKE ROUTE:
    if the trip has no saved road path, show only the fixed markers.
    Never invent a straight line between stops.
  */
}

function fitMap(){
  if(!map) return;

  const bounds = new google.maps.LatLngBounds();
  let count = 0;

  if(validPoint(driverLat, driverLng)){
    bounds.extend({
      lat: driverLat,
      lng: driverLng
    });
    count++;
  }

  routeStops
    .slice(currentStopIndex, currentStopIndex + 3)
    .forEach(stop => {
      if(validPoint(stop.lat, stop.lng)){
        bounds.extend({
          lat: Number(stop.lat),
          lng: Number(stop.lng)
        });
        count++;
      }
    });

  if(count){
    map.fitBounds(bounds, {
      top: 84,
      right: 52,
      bottom: 58,
      left: 52
    });
  }
}

/* ================= EXTERNAL NAVIGATION ================= */

function openGoogleNavigation(){

  const stop =
    currentStop();

  if(!stop){
    return;
  }

  let destination =
    "";

  if(
    validPoint(
      stop.lat,
      stop.lng
    )
  ){

    destination =
      `${Number(stop.lat)},${Number(stop.lng)}`;

  }else{

    destination =
      clean(
        stop.address
      );

  }

  if(!destination){

    alert(
      "Destination not found"
    );

    return;
  }

  /*
    DIRECT GOOGLE MAPS OPEN

    - No window.open()
    - No target="_blank"
    - No extra app-created blank tab/page

    Android:
      google.navigation: opens Google Maps navigation directly.

    iPhone / other:
      Google Maps universal URL in the same browsing context.
  */

  const isAndroid =
    /Android/i.test(
      navigator.userAgent
    );

  if(isAndroid){

    const navigationUrl =
      "google.navigation:q=" +
      encodeURIComponent(
        destination
      ) +
      "&mode=d";

    window.location.replace(
      navigationUrl
    );

    return;
  }

  const origin =
    validPoint(
      driverLat,
      driverLng
    )
      ? `${driverLat},${driverLng}`
      : "";

  let mapsUrl =
    "https://www.google.com/maps/dir/?api=1";

  if(origin){

    mapsUrl +=
      "&origin=" +
      encodeURIComponent(
        origin
      );

  }

  mapsUrl +=
    "&destination=" +
    encodeURIComponent(
      destination
    ) +
    "&travelmode=driving";

  window.location.replace(
    mapsUrl
  );
}

/* ================= CURRENT TRIP UI ================= */

function currentScheduledTime(){
  const stop = currentStop();

  if(Number.isFinite(num(stop?.scheduledAt))){
    return num(stop.scheduledAt);
  }

  return buildScheduledTime(tripDoc);
}

function actionLabelForStop(stop){
  if(!stop) return "TRIP";

  if(stop.type === "pickup") return "PICKUP";
  if(stop.type === "dropoff") return "DROPOFF";
  return "STOP";
}

function setCurrentInfo(){
  const stop = currentStop();
  if(!stop) return;

  const scheduled = currentScheduledTime();

  tripTimeValue.textContent = formatScheduledTime(scheduled);
  currentActionBadge.textContent = actionLabelForStop(stop);
  stopProgress.textContent =
    `Stop ${currentStopIndex + 1} of ${routeStops.length}`;

  locationLabel.textContent =
    stop.type === "pickup"
      ? "PICKUP LOCATION"
      : stop.type === "dropoff"
        ? "DROPOFF LOCATION"
        : "STOP LOCATION";

  currentStopAddressEl.textContent =
    stop.address ||
    stop.resolvedAddress ||
    "Address unavailable";
}

function setStopStatus(text){
  if(stopStatusText){
    stopStatusText.textContent = text;
  }
}

function setPrimaryButton(text, enabled = true, mode = "blue"){
  if(!btnPrimaryAction) return;

  btnPrimaryAction.textContent = text;
  btnPrimaryAction.disabled = !enabled;
  btnPrimaryAction.classList.remove(
    "blue",
    "green",
    "gold",
    "red",
    "muted"
  );
  btnPrimaryAction.classList.add(mode);
}

function hidePrimaryButton(){
  hide(btnPrimaryAction);
}

function showPrimaryButton(){
  show(btnPrimaryAction);
}

/* ================= CALL / REASON FLOW ================= */

function callState(stop, passenger){
  return readPassengerLocalState(stop, passenger.passengerId);
}

function markPassengerCalled(stop, passenger){
  savePassengerLocalState(
    stop,
    passenger.passengerId,
    {
      calledAt: serverNow()
    }
  );
}

function passengerWasCalled(stop, passenger){
  return Number.isFinite(
    num(
      callState(stop, passenger).calledAt
    )
  );
}

function dialPassenger(stop, passenger, forcedReasonAction = ""){
  if(!passenger?.phone){
    alert("Passenger phone not found.");
    return false;
  }

  markPassengerCalled(stop, passenger);

  if(forcedReasonAction){
    pendingReasonAfterCall = {
      action: forcedReasonAction,
      passengerId: passenger.passengerId,
      stopId: stop.stopId
    };
  }

  window.location.href = `tel:${passenger.phone}`;
  return true;
}

function openReasonModal(action, stop, passenger){
  reasonContext = {
    action,
    stopId: stop.stopId,
    passengerId: passenger.passengerId
  };

  reasonTitle.textContent =
    action === "NO_SHOW"
      ? "No Show Reason"
      : "Cancel Reason";

  reasonPassenger.textContent = passenger.name || "Passenger";
  reasonNotes.value = "";

  show(reasonBox, "flex");
  setTimeout(() => reasonNotes.focus(), 100);
}

function closeReasonModal(){
  reasonContext = null;
  reasonNotes.value = "";
  hide(reasonBox);
}

function maybeOpenPendingReasonAfterCall(){
  if(!pendingReasonAfterCall) return;

  const stop = currentStop();

  if(
    !stop ||
    stop.stopId !== pendingReasonAfterCall.stopId
  ){
    pendingReasonAfterCall = null;
    return;
  }

  const passenger = (stop.passengers || [])
    .find(p =>
      String(p.passengerId) ===
      String(pendingReasonAfterCall.passengerId)
    );

  const action = pendingReasonAfterCall.action;
  pendingReasonAfterCall = null;

  if(passenger){
    setTimeout(
      () => openReasonModal(action, stop, passenger),
      180
    );
  }
}

/* ================= PERSIST PASSENGER STATE ================= */

function updateOnePassengerArray(passengerIdValue, patch){
  if(
    Array.isArray(tripDoc?.passengers) &&
    tripDoc.passengers.length
  ){
    return tripDoc.passengers.map((p, index) => {
      const id = passengerId(p, index);

      if(String(id) !== String(passengerIdValue)){
        return p;
      }

      return {
        ...p,
        ...patch
      };
    });
  }

  return null;
}

async function persistPassengerPickupState(stop, passenger, pickupState, reason = ""){
  const now = serverNow();
  let status = "Scheduled";
  const extra = {};

  if(pickupState === "PICKED"){
    status = "Picked";
    extra.pickedAt = now;
  }

  if(pickupState === "CANCELLED"){
    status = "Cancelled";
    extra.cancelReason = reason;
    extra.cancelledAt = now;
    extra.cancelFee = Number(tripDoc?.cancelFee || 0);
  }

  if(pickupState === "NO_SHOW"){
    status = "No Show";
    extra.noShowReason = reason;
    extra.noShowAt = now;
    extra.noShowFee = Number(tripDoc?.noShowFee || 0);
    extra.finalPrice = Number(tripDoc?.noShowFee || 0);
    extra.priceAmount = Number(tripDoc?.noShowFee || 0);
  }

  savePassengerLocalState(
    stop,
    passenger.passengerId,
    {
      pickupState,
      status,
      reason,
      updatedAt: now
    }
  );

  if(isSharedTrip()){
    const passengers = updateOnePassengerArray(
      passenger.passengerId,
      {
        status,
        ...extra
      }
    );

    if(passengers){
      const allTerminal = passengers.every(p=>
        isTerminalPassengerStatus(p?.status)
      );

      const nextTripStatus = allTerminal
        ? (()=>{
            const statuses = passengers.map(p=>normalizeStatus(p?.status));

            if(statuses.some(s=>s === "completed")){
              return "Completed";
            }

            if(statuses.every(s=>["no show","noshow"].includes(s))){
              return "No Show";
            }

            return "Cancelled";
          })()
        : "InProgress";

      await updateTrip({
        status: nextTripStatus,
        dispatchStatus:
          nextTripStatus === "Completed"
            ? "COMPLETED"
            : nextTripStatus === "No Show"
              ? "NOSHOW"
              : nextTripStatus === "Cancelled"
                ? "CANCELLED"
                : "ON_TRIP",
        passengers,
        driverId: DRIVER_ID,
        driverName: DRIVER_NAME
      });
    }

    return;
  }

  /*
    Individual trip:
    keep trip active on PICKED.
    CANCEL / NO SHOW remains trip-level, same as existing server behavior.
  */
  if(pickupState === "PICKED"){
    await updateTrip({
      passengerStatus: status,
      pickedAt: now,
      driverId: DRIVER_ID,
      driverName: DRIVER_NAME
    });
  }else if(pickupState === "CANCELLED"){
    await updateTrip({
      status: "Cancelled",
      dispatchStatus: "CANCELLED",
      passengerStatus: status,
      cancelReason: reason,
      cancelFee: Number(tripDoc?.cancelFee || 0),
      driverId: DRIVER_ID,
      driverName: DRIVER_NAME
    });
  }else if(pickupState === "NO_SHOW"){
    await updateTrip({
      status: "No Show",
      dispatchStatus: "NOSHOW",
      passengerStatus: status,
      noShowReason: reason,
      noShowFee: Number(tripDoc?.noShowFee || 0),
      driverId: DRIVER_ID,
      driverName: DRIVER_NAME
    });
  }
}

/* ================= PASSENGER RENDER ================= */

function passengerStatusBadge(state){
  if(state === "PICKED"){
    return '<span class="passenger-state picked">PICKED ✓</span>';
  }

  if(state === "CANCELLED"){
    return '<span class="passenger-state cancelled">CANCELLED</span>';
  }

  if(state === "NO_SHOW"){
    return '<span class="passenger-state noshow">NO SHOW</span>';
  }

  return "";
}


function refreshCurrentPickupPassengersFromTrip(){

  const stop = currentStop();

  if(
    !stop ||
    stop.type !== "pickup" ||
    !isSharedTrip()
  ){
    return;
  }

  const latestPassengers =
    Array.isArray(tripDoc?.passengers)
      ? tripDoc.passengers
      : [];

  if(!latestPassengers.length){
    return;
  }

  /*
    IMPORTANT:
    Keep the passenger membership of the pickup group that was built when
    routeStops was created.  After Passenger #1 is updated on the server,
    tripDoc is replaced with the server response.  Re-hydrate the CURRENT
    pickup group by passengerId first so Pickup #2/#3 can never lose its
    passenger controls.

    Address matching remains a fallback for older trips without stable IDs.
  */
  const existingIds =
    new Set(
      (stop.passengers || [])
        .map(p=>String(p?.passengerId || ""))
        .filter(Boolean)
    );

  let matched = [];

  if(existingIds.size){

    latestPassengers.forEach((p,index)=>{

      const id =
        passengerId(p,index);

      if(
        !existingIds.has(
          String(id)
        )
      ){
        return;
      }

      matched.push({
        passengerId:id,
        name:passengerName(p,index),
        phone:passengerPhone(p),
        sourceIndex:index,
        status:clean(p?.status || "Scheduled")
      });
    });
  }

  /*
    Older data fallback:
    if IDs could not be matched, rebuild this pickup group from its address.
  */
  if(!matched.length){

    const wantedAddress =
      normalizeAddressKey(
        stop.address
      );

    latestPassengers.forEach((p,index)=>{

      const pickupAddress =
        normalizeAddressKey(
          passengerPickup(
            p,
            tripDoc
          )
        );

      if(
        wantedAddress &&
        pickupAddress &&
        pickupAddress !== wantedAddress
      ){
        return;
      }

      const point =
        sharedPickupPoint(p);

      if(
        !wantedAddress &&
        validPoint(
          stop.lat,
          stop.lng
        ) &&
        validPoint(
          point.lat,
          point.lng
        ) &&
        distanceMiles(
          Number(stop.lat),
          Number(stop.lng),
          Number(point.lat),
          Number(point.lng)
        ) > 0.02
      ){
        return;
      }

      matched.push({
        passengerId:
          passengerId(p,index),
        name:
          passengerName(p,index),
        phone:
          passengerPhone(p),
        sourceIndex:index,
        status:
          clean(
            p?.status ||
            "Scheduled"
          )
      });
    });
  }

  if(matched.length){
    stop.passengers = matched;
  }
}

function renderPickupPassengers(stop){

  const passengers =
    (stop.passengers || []);

  passengersSection.style.display =
    passengers.length
      ? "block"
      : "none";

  currentPassengersEl.innerHTML =
    passengers.map(p => {

      const state =
        pickupPassengerState(
          stop,
          p
        );

      const final =
        pickupPassengerFinal(
          stop,
          p
        );

      const noShowMode =
        waitEnabledForStop(stop) &&
        timerExpired(stop);

      const cancelLabel =
        noShowMode
          ? "NO SHOW"
          : "CANCEL";

      const stateClass =
        state === "PICKED"
          ? "picked-card"
          : state === "CANCELLED"
            ? "cancelled-card"
            : state === "NO_SHOW"
              ? "noshow-card"
              : "waiting-card";

      const finalLabel =
        state === "PICKED"
          ? "PICKED UP"
          : state === "CANCELLED"
            ? "✕ CANCELLED"
            : state === "NO_SHOW"
              ? "✕ NO SHOW"
              : "";

      return `
        <div
          class="passenger-row ${stateClass}"
          data-passenger-id="${escapeHtml(p.passengerId)}"
        >

          <div class="passenger-main">
            <div class="passenger-name-wrap">
              <div class="passenger-name-line">
                <strong>${escapeHtml(p.name)}</strong>
              </div>
            </div>
          </div>

          ${
            final
              ? `
                <div class="passenger-final-state">
                  ${escapeHtml(finalLabel)}
                </div>
              `
              : `
                <div class="passenger-actions">

                  <button
                    class="passenger-btn pickup"
                    type="button"
                    data-action="pickup"
                  >
                    ▲<span>PICK UP</span>
                  </button>

                  <button
                    class="passenger-btn danger"
                    type="button"
                    data-action="${noShowMode ? "no-show" : "cancel"}"
                  >
                    ✕<span>${cancelLabel}</span>
                  </button>

                  <button
                    class="passenger-btn call"
                    type="button"
                    data-action="call"
                    ${p.phone ? "" : "disabled"}
                    aria-label="Call ${escapeHtml(p.name)}"
                  >
                    ☎<span>CALL</span>
                  </button>

                </div>
              `
          }

        </div>
      `;
    }).join("");

  currentPassengersEl
    .querySelectorAll(
      ".passenger-row"
    )
    .forEach(row => {

      const passengerIdValue =
        row.dataset.passengerId;

      const passenger =
        passengers.find(p =>
          String(p.passengerId) ===
          String(passengerIdValue)
        );

      if(!passenger){
        return;
      }

      row.querySelector(
        '[data-action="call"]'
      )?.addEventListener(
        "click",
        () => {

          if(
            !requireArrived(stop)
          ){
            return;
          }

          dialPassenger(
            stop,
            passenger
          );
        }
      );

      row.querySelector(
        '[data-action="pickup"]'
      )?.addEventListener(
        "click",
        async () => {

          if(
            !requireArrived(stop)
          ){
            renderExecutionState();
            return;
          }

          try{

            await persistPassengerPickupState(
              stop,
              passenger,
              "PICKED"
            );

            if(
              allPickupPassengersResolved(
                stop
              )
            ){
              await handleResolvedPickupGroup(
                stop,
                true
              );
              return;
            }

            renderExecutionState();

          }catch(err){

            alert(
              err.message
            );
          }
        }
      );

      row.querySelector(
        '[data-action="cancel"]'
      )?.addEventListener(
        "click",
        () => {

          if(
            !requireArrived(stop)
          ){
            return;
          }

          if(
            !passengerWasCalled(
              stop,
              passenger
            )
          ){
            dialPassenger(
              stop,
              passenger,
              "CANCELLED"
            );
            return;
          }

          openReasonModal(
            "CANCELLED",
            stop,
            passenger
          );
        }
      );

      row.querySelector(
        '[data-action="no-show"]'
      )?.addEventListener(
        "click",
        () => {

          if(
            !requireArrived(stop)
          ){
            return;
          }

          if(
            EXECUTION.noShowRequiresTimer &&
            waitEnabledForStop(stop) &&
            !timerExpired(stop)
          ){
            alert(
              "Wait timer must finish first."
            );
            return;
          }

          if(
            !passengerWasCalled(
              stop,
              passenger
            )
          ){
            dialPassenger(
              stop,
              passenger,
              "NO_SHOW"
            );
            return;
          }

          openReasonModal(
            "NO_SHOW",
            stop,
            passenger
          );
        }
      );
    });
}

function renderNonPickupPassenger(stop){

  const passengers =
    (stop.passengers || []);

  if(!passengers.length){

    passengersSection.style.display =
      "none";

    currentPassengersEl.innerHTML =
      "";

    return;
  }

  passengersSection.style.display =
    "block";

  currentPassengersEl.innerHTML =
    passengers.map(p => `
      <div class="passenger-row simple">
        <div class="passenger-main">
          <div class="passenger-name-wrap">
            <div class="passenger-name-line">
              <strong>${escapeHtml(p.name)}</strong>
            </div>
          </div>
        </div>
      </div>
    `).join("");
}

function renderPassengers(){
  const stop = currentStop();

  if(!stop){
    passengersSection.style.display = "none";
    return;
  }

  if(stop.type === "pickup"){
    renderPickupPassengers(stop);
  }else{
    renderNonPickupPassenger(stop);
  }
}

/* ================= DETAILS EYE ================= */

function renderTripDetails(){
  if(!tripDoc) return;

  const passengers = getPassengers(tripDoc);

  const passengerCards = passengers.map((p, index) => {
    const name = passengerName(p, index);
    const phone = passengerPhone(p);
    const pickup = passengerPickup(p, tripDoc);
    const dropoff = passengerDropoff(p, tripDoc);

    return `
      <div class="detail-passenger">
        <strong>${escapeHtml(name)}</strong>
        ${phone ? `<div>Phone: ${escapeHtml(phone)}</div>` : ""}
        ${pickup ? `<div>Pickup: ${escapeHtml(pickup)}</div>` : ""}
        ${dropoff ? `<div>Dropoff: ${escapeHtml(dropoff)}</div>` : ""}
        ${
          p?.notes || p?.driverNotes
            ? `<div>Notes: ${escapeHtml(p.notes || p.driverNotes)}</div>`
            : ""
        }
      </div>
    `;
  }).join("");

  detailsContent.innerHTML = `
    <div class="detail-grid">
      <div>
        <span>Trip</span>
        <strong>${escapeHtml(firstValue(tripDoc.tripNumber, tripDoc._id, ""))}</strong>
      </div>
      <div>
        <span>Service</span>
        <strong>${escapeHtml(firstValue(tripDoc.serviceName, tripDoc.serviceCode, tripDoc.serviceKey, ""))}</strong>
      </div>
      <div>
        <span>Date</span>
        <strong>${escapeHtml(firstValue(tripDoc.tripDate, ""))}</strong>
      </div>
      <div>
        <span>Time</span>
        <strong>${escapeHtml(firstValue(tripDoc.tripTime, ""))}</strong>
      </div>
    </div>

    <div class="detail-grid timer-detail-grid">
      <div>
        <span>Pickup Timer</span>
        <strong>${
          EXECUTION.pickupWaitEnabled
            ? `${EXECUTION.pickupWaitMinutes} min`
            : "Off"
        }</strong>
      </div>
      <div>
        <span>Stop Timer</span>
        <strong>${
          EXECUTION.stopWaitEnabled
            ? `${EXECUTION.stopWaitMinutes} min`
            : "Off"
        }</strong>
      </div>
    </div>

    <div class="detail-passengers">
      ${passengerCards}
    </div>
  `;
}

/* ================= EXECUTION RENDER ================= */

function hideTimer(){
  hide(waitTimerEl);
}

function showTimer(sec){
  waitTimerEl.textContent = formatTimer(sec);
  show(waitTimerEl);
}

function renderExecutionState(){
  const stop = currentStop();

  if(!stop){
    return;
  }

  setCurrentInfo();
  drawRouteMarkers();
  drawDisplayLine();

  const state = readStopState(stop);
  const distance = currentDistance();

  hideTimer();
  showPrimaryButton();

  /*
    STRICT FLOW:
    Before ARRIVED, no passenger execution controls are visible.
  */
  if(state.arrived !== true){
    passengersSection.style.display = "none";
    currentPassengersEl.innerHTML = "";
    btnStartRide.style.display = "none";
    btnStartRide.disabled = true;
    btnStartRide.classList.remove("ready");
    btnStartRide.setAttribute("aria-disabled", "true");

    /* ---------- BEFORE ARRIVED ---------- */

    if(!inside250()){
      gpsBadge.textContent = validPoint(driverLat, driverLng)
        ? "GPS Active"
        : "GPS";

      setStopStatus(
        distance !== null
          ? (
              distance <= 0.25
                ? `${Math.round(
                    distance *
                    METERS_PER_MILE
                  )} m from current stop`
                : `${distance.toFixed(2)} mi from current stop`
            )
          : validPoint(
              driverLat,
              driverLng
            )
            ? "Current stop coordinates unavailable for ARRIVED check"
            : "Waiting for GPS location"
      );

      setPrimaryButton(
        stop.type === "pickup"
          ? "GO TO PICKUP / DIRECTIONS"
          : stop.type === "dropoff"
            ? "GO TO DROPOFF / DIRECTIONS"
            : "GO TO STOP / DIRECTIONS",
        true,
        "blue"
      );

      btnPrimaryAction.dataset.mode = "directions";
      return;
    }

    setStopStatus("You are inside the arrival area");

    setPrimaryButton(
      "ARRIVED",
      true,
      "green"
    );

    btnPrimaryAction.dataset.mode = "arrived";
    return;
  }

  /*
    ARRIVED has been confirmed for the CURRENT stop.
    Only now may passenger/action controls appear.
  */
  if(
    !currentStopCanShowActions(stop)
  ){
    passengersSection.style.display =
      "none";

    currentPassengersEl.innerHTML =
      "";

    btnStartRide.style.display =
      "none";

    return;
  }

  if(stop.type === "pickup"){
    refreshCurrentPickupPassengersFromTrip();
  }

  renderPassengers();

  if(stop.type !== "pickup"){
    btnStartRide.style.display = "none";
  }

  /* ---------- PICKUP ---------- */

  if(stop.type === "pickup"){
    const scheduledAt = num(stop.scheduledAt);

    if(
      Number.isFinite(scheduledAt) &&
      serverNow() < scheduledAt
    ){

      /*
        EARLY ARRIVAL POLICY

        The official trip time controls the WAIT TIMER only.

        If the passenger is physically ready and the driver has already
        completed a real PICK UP, START RIDE may become active before
        the scheduled time.

        Safety gates remain:
          - ARRIVED must already be pressed.
          - Every passenger in the CURRENT pickup group must be resolved.
          - At least one real passenger must be PICKED.
          - If another pickup group is still ahead, handleResolvedPickupGroup()
            advances there first, so Start Ride cannot skip required pickups.
      */

      const canStartEarly =
        canStartRideNow(stop) &&
        hasAnyPickedPassengerForRide();

      if(
        waitEnabledForStop(stop)
      ){
        /*
          Timer remains frozen at its full configured value until the
          official scheduled time. Early Ride Start does not back-start it.
        */
        showTimer(
          waitDurationSeconds(stop)
        );
      }else{
        hideTimer();
      }

      if(canStartEarly){

        setStopStatus(
          "Passenger picked up — ready to start early"
        );

        hidePrimaryButton();

        btnStartRide.style.display =
          "block";

        btnStartRide.disabled =
          false;

        btnStartRide.classList.add(
          "ready"
        );

        btnStartRide.setAttribute(
          "aria-disabled",
          "false"
        );

        return;
      }

      setStopStatus(
        `Scheduled ${formatScheduledTime(scheduledAt)}`
      );

      setPrimaryButton(
        "WAITING FOR TRIP TIME",
        false,
        "muted"
      );

      btnPrimaryAction.dataset.mode =
        "waiting";

      btnStartRide.style.display =
        "block";

      btnStartRide.disabled =
        true;

      btnStartRide.classList.remove(
        "ready"
      );

      btnStartRide.setAttribute(
        "aria-disabled",
        "true"
      );

      return;
    }

    if(waitEnabledForStop(stop)){
      showTimer(timerRemaining(stop));

      setStopStatus(
        timerExpired(stop)
          ? "Waiting time finished"
          : "Pickup waiting time"
      );
    }else{
      hideTimer();
      setStopStatus("Pickup");
    }

    hidePrimaryButton();

    if(
      allPickupPassengersNonRideFinal(stop) &&
      !hasAnyPickedPassengerForRide()
    ){
      btnStartRide.style.display = "none";
      btnStartRide.disabled = true;
      btnStartRide.classList.remove("ready");
      btnStartRide.setAttribute("aria-disabled", "true");
      return;
    }

    btnStartRide.style.display = "block";

    const canStart =
      canStartRideNow(stop) &&
      hasAnyPickedPassengerForRide();

    btnStartRide.disabled = !canStart;
    btnStartRide.classList.toggle("ready", canStart);
    btnStartRide.setAttribute(
      "aria-disabled",
      canStart ? "false" : "true"
    );

    return;
  }

  /* ---------- INTERMEDIATE STOP ---------- */

  if(stop.type === "stop"){
    if(waitEnabledForStop(stop)){
      showTimer(timerRemaining(stop));

      setStopStatus(
        timerExpired(stop)
          ? "Stop waiting time finished"
          : "Stop waiting time"
      );
    }else{
      hideTimer();
      setStopStatus("Stop reached");
    }

    setPrimaryButton(
      "CONTINUE TO NEXT STOP",
      true,
      "gold"
    );

    btnPrimaryAction.dataset.mode = "complete-stop";
    return;
  }

  /* ---------- DROPOFF ---------- */

  if(stop.type === "dropoff"){
    setStopStatus("Ready to complete dropoff");

    setPrimaryButton(
      "DROP OFF / COMPLETE",
      true,
      "green"
    );

    btnPrimaryAction.dataset.mode = "complete-dropoff";
  }
}

/* ================= ADVANCE ================= */

async function advanceStop(autoOpenGoogle = true){
  const stop = currentStop();

  if(stop){
    saveStopState(stop, {
      completed: true,
      completedAt: serverNow()
    });
  }

  if(allTripPassengersTerminal()){
    await finishTripAndReturnToTrips();
    return;
  }

  const nextIndex = nextActionableStopIndex(currentStopIndex + 1);

  if(nextIndex >= 0){

    currentStopIndex =
      nextIndex;

    /*
      Each new Pickup / Stop / Dropoff has its OWN ARRIVED gate.
      Do not inherit arrival from the previous point.
    */
    const nextStop =
      currentStop();

    const nextState =
      readStopState(
        nextStop
      );

    if(
      nextState.arrived === true &&
      nextState.completed !== true
    ){
      /*
        Preserve a real previous arrival only when returning to the
        same unfinished stop after refresh. Normal advance uses a
        different stopId and therefore remains locked.
      */
    }

    renderExecutionState();
    fitMap();

    if(autoOpenGoogle){
      setTimeout(openGoogleNavigation, 250);
    }

    return;
  }

  /* No actionable stop remains. If passengers are terminal, close the trip. */
  if(allTripPassengersTerminal()){
    await finishTripAndReturnToTrips();
    return;
  }

  setStopStatus("All route stops finished");
  hidePrimaryButton();
  btnStartRide.style.display = "none";
  localStorage.removeItem("activeDriverTripId");
}

/* ================= PRIMARY BUTTON ================= */

btnPrimaryAction?.addEventListener("click", async () => {
  const stop = currentStop();
  if(!stop) return;

  const mode = btnPrimaryAction.dataset.mode;

  if(mode === "directions"){
    openGoogleNavigation();
    return;
  }

  if(mode === "arrived"){

    if(
      String(
        currentStop()?.stopId ||
        ""
      ) !==
      String(
        stop.stopId ||
        ""
      )
    ){
      renderExecutionState();
      return;
    }

    if(!inside250()){

      alert(
        "You must be inside the 250 meter area first."
      );

      renderExecutionState();

      return;
    }

    if(
      stopIsArrived(stop)
    ){
      renderExecutionState();
      return;
    }

    const arrivedAt =
      serverNow();

    saveStopState(stop, {
      arrived: true,
      arrivedAt
    });

    if(stop.type === "pickup" && currentStopIndex === 0){
      try{
        await updateTrip({
          status: "Arrived",
          arrivedAt,
          driverId: DRIVER_ID,
          driverName: DRIVER_NAME
        });
      }catch(err){
        console.log(err);
      }
    }

    renderExecutionState();
    return;
  }

  if(mode === "complete-stop"){

    if(
      !requireArrived(stop)
    ){
      renderExecutionState();
      return;
    }

    await advanceStop(true);
    return;
  }

  if(mode === "complete-dropoff"){

    if(
      !requireArrived(stop)
    ){
      renderExecutionState();
      return;
    }

    try{
      if(isSharedTrip()){
        const ids = new Set(
          (stop.passengers || []).map(p => String(p.passengerId))
        );

        const passengers = (tripDoc.passengers || [])
          .map((p, index) => {
            const id = passengerId(p, index);

            if(ids.has(String(id))){
              return {
                ...p,
                status: "Completed",
                completedAt: serverNow()
              };
            }

            return p;
          });

        const allCompleted = passengers.every(p => {
          const s = canonicalPickupState(p.status);

          return (
            s === "CANCELLED" ||
            s === "NO_SHOW" ||
            normalizeStatus(p.status) === "completed"
          );
        });

        await updateTrip({
          status: allCompleted ? "Completed" : "InProgress",
          dispatchStatus: allCompleted ? "COMPLETED" : "ON_TRIP",
          passengers,
          finalPrice: Number(
            tripDoc.finalPrice ||
            tripDoc.priceAmount ||
            0
          )
        });
      }else{
        await updateTrip({
          status: "Completed",
          dispatchStatus: "COMPLETED",
          completedAt: serverNow(),
          finalPrice: Number(
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

    if(allTripPassengersTerminal()){
      await finishTripAndReturnToTrips();
      return;
    }

    await advanceStop(true);
  }
});

/* ================= START RIDE ================= */

btnStartRide?.addEventListener("click", async () => {
  const stop = currentStop();

  if(!requireArrived(stop)){
    return;
  }

  /*
    SECOND HARD SAFETY GATE:
    even if CSS/UI state is wrong, click cannot start the ride until
    every passenger has PICKED / CANCELLED / NO SHOW.
  */
  if(
    !canStartRideNow(stop) ||
    !hasAnyPickedPassengerForRide()
  ){
    btnStartRide.disabled = true;
    btnStartRide.classList.remove("ready");
    btnStartRide.setAttribute("aria-disabled", "true");
    return;
  }

  const picked = pickedPassengers(stop);
  const startedAt = serverNow();

  try{
    if(isSharedTrip()){
      const passengers = (tripDoc.passengers || [])
        .map((p, index) => {
          const status = normalizeStatus(p?.status);

          if([
            "picked",
            "picked up"
          ].includes(status)){
            return {
              ...p,
              status: "On Trip",
              startedAt
            };
          }

          return p;
        });

      await updateTrip({
        status: "InProgress",
        passengers,
        driverId: DRIVER_ID,
        driverName: DRIVER_NAME
      });
    }else{
      /*
        If the only individual passenger was cancelled/no-show,
        do not convert the trip back to InProgress.
      */
      if(hasAnyPickedPassengerForRide()){
        await updateTrip({
          status: "InProgress",
          startedAt,
          passengerStatus: "On Trip",
          driverId: DRIVER_ID,
          driverName: DRIVER_NAME
        });
      }
    }
  }catch(err){
    alert(err.message);
    return;
  }

  saveStopState(stop, {
    rideStarted: true,
    rideStartedAt: startedAt,
    completed: true
  });

  await advanceStop(true);
});

/* ================= REASON SUBMIT ================= */

btnCloseReason?.addEventListener("click", closeReasonModal);

btnSubmitReason?.addEventListener("click", async () => {
  if(!reasonContext) return;

  const stop = currentStop();

  if(!requireArrived(stop)){
    closeReasonModal();
    return;
  }

  if(!stop || stop.stopId !== reasonContext.stopId){
    closeReasonModal();
    return;
  }

  const passenger = (stop.passengers || [])
    .find(p =>
      String(p.passengerId) ===
      String(reasonContext.passengerId)
    );

  if(!passenger){
    closeReasonModal();
    return;
  }

  const reason = clean(reasonNotes.value);

  if(!reason){
    alert("Please enter a reason.");
    return;
  }

  if(!passengerWasCalled(stop, passenger)){
    closeReasonModal();
    dialPassenger(stop, passenger, reasonContext.action);
    return;
  }

  if(
    reasonContext.action === "NO_SHOW" &&
    EXECUTION.noShowRequiresTimer &&
    waitEnabledForStop(stop) &&
    !timerExpired(stop)
  ){
    alert("Wait timer must finish first.");
    return;
  }

  const action = reasonContext.action;

  try{
    await persistPassengerPickupState(
      stop,
      passenger,
      action,
      reason
    );
  }catch(err){
    alert(err.message);
    return;
  }

  closeReasonModal();

  const resolvedStop = currentStop();

  if(
    resolvedStop?.type === "pickup" &&
    allPickupPassengersResolved(resolvedStop)
  ){
    await handleResolvedPickupGroup(resolvedStop,true);
    return;
  }

  renderExecutionState();
});

/* ================= DETAILS ================= */


btnCloseDetails?.addEventListener("click", () => {
  hide(detailsBox);
});

/* ================= RECENTER ================= */


/* ================= LOCATION PUSH ================= */

function shouldSendLocation(lat, lng){
  if(!lastSentLocationAt){
    return true;
  }

  if(serverNow() - lastSentLocationAt >= LOCATION_PUSH_MS){
    return true;
  }

  if(validPoint(lastSentLat, lastSentLng)){
    return (
      distanceMiles(
        lastSentLat,
        lastSentLng,
        lat,
        lng
      ) >= LOCATION_PUSH_MILES
    );
  }

  return false;
}

async function sendLocation(lat, lng){
  if(
    !DRIVER_ID ||
    !shouldSendLocation(lat, lng)
  ){
    return;
  }

  lastSentLocationAt = serverNow();
  lastSentLat = lat;
  lastSentLng = lng;

  try{
    await fetch("/api/driver/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        driverId: DRIVER_ID,
        name: DRIVER_NAME,
        lat,
        lng,
        tripId: TRIP_ID,
        currentStopId: currentStop()?.stopId || "",
        currentStopIndex,
        time: lastSentLocationAt
      })
    });
  }catch{}
}

/* ================= GPS ================= */

function startGps(){
  if(!navigator.geolocation){
    gpsBadge.textContent = "GPS unavailable";
    return;
  }

  if(watchId !== null){
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(
    async pos => {
      driverLat = pos.coords.latitude;
      driverLng = pos.coords.longitude;
      lastGpsAccuracyMeters =
        Number(pos.coords.accuracy || 0);

      gpsBadge.textContent = "GPS Active";

      updateDriverMarker();

      await sendLocation(driverLat, driverLng);

      if(firstGpsFix){
        firstGpsFix = false;
        userMovedMap = false;

        drawRouteMarkers();
        drawDisplayLine();
        fitMap();
      }else if(!userMovedMap){
        fitMap();
      }

      renderExecutionState();
    },

    err => {
      console.log("GPS error:", err);
      gpsBadge.textContent = "GPS Error";
      setStopStatus("Enable location access");
    },

    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

/* ================= INIT ================= */

async function initPage(){
  try{
    setStopStatus("Loading trip...");

    await syncServerClock();
    await loadSystemDesign();
    await loadAppConfig();
    await loadGoogleMaps();
    await syncServerClock();

    initGoogleMap();

    tripDoc = await fetchTrip();

    await loadTripServiceWaitConfig();

    routeStops = buildRouteStops(tripDoc);

    for(const stop of routeStops){
      await ensureStopCoordinates(stop);
    }

    if(!routeStops.length){
      throw new Error("No route stops found");
    }

    if(allTripPassengersTerminal()){
      await finishTripAndReturnToTrips();
      return;
    }

    restoreCurrentStop();

    /*
      Final coordinate pass for the CURRENT stop.
      Important for both Individual and Shared ARRIVED geofence.
    */
    await ensureStopCoordinates(
      currentStop()
    );

    setCurrentInfo();
    renderExecutionState();
    drawRouteMarkers();
    drawDisplayLine();
    fitMap();

    startTimerWatcher();
    startGps();
  }catch(err){
    console.log("MAP INIT ERROR:", err);
    setStopStatus(err.message || "Unable to load trip");
  }
}

/* ================= RETURN FROM PHONE / GOOGLE ================= */

document.addEventListener("visibilitychange", async () => {
  if(document.hidden){
    return;
  }

  await syncServerClock();
  renderExecutionState();

  if(map){
    fitMap();
  }

  maybeOpenPendingReasonAfterCall();
});

window.addEventListener("pageshow", async () => {
  await syncServerClock();
  renderExecutionState();
  maybeOpenPendingReasonAfterCall();
});

window.addEventListener("beforeunload", () => {
  if(timerInterval){
    clearInterval(timerInterval);
  }

  if(watchId !== null && navigator.geolocation){
    navigator.geolocation.clearWatch(watchId);
  }
});

/* ================= START ================= */

initPage();