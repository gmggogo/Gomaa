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
   - Pickup timer duration is read from System Design when available.
   - Intermediate stop timer duration is read from System Design when available.
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
  pickupWaitMinutes: 10,
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

function applyExecutionSettings(){
  const pickup = pickPositiveMinutes(
    systemDesign.driverPickupWaitMinutes,
    systemDesign.pickupWaitMinutes,
    systemDesign.driverPickupTimerMinutes,
    systemDesign.pickupTimerMinutes,
    systemDesign.sharedPickupWaitMinutes
  );

  const stop = pickPositiveMinutes(
    systemDesign.driverStopWaitMinutes,
    systemDesign.stopWaitMinutes,
    systemDesign.driverStopTimerMinutes,
    systemDesign.stopTimerMinutes,
    systemDesign.intermediateStopWaitMinutes
  );

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

  applyExecutionSettings();
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
      "&v=weekly";

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

async function updateTrip(body){
  const res = await fetch(`/api/trips/${TRIP_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if(!res.ok){
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Trip update failed");
  }

  tripDoc = await res.json();
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

function buildScheduledTime(trip, source = null){
  const direct = firstValue(
    source?.scheduledAt,
    source?.tripDateTime,
    source?.pickupDateTime
  );

  if(direct){
    const ms = new Date(direct).getTime();
    if(Number.isFinite(ms)) return ms;
  }

  const date = clean(
    firstValue(
      source?.tripDate,
      trip?.tripDate,
      trip?.date
    )
  );

  const time = clean(
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

  const ms = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(ms) ? ms : null;
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
  const point = pickupPoint(p, trip);

  if(address && group.addressKey === address){
    return true;
  }

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

    const pu = pickupPoint(p, trip);
    const dr = dropoffPoint(p, trip);

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
  if(!stop) return false;

  if(validPoint(stop.lat, stop.lng)){
    return true;
  }

  const saved =
    findSavedRoutePoint(stop.address, stop.type) ||
    findSavedRoutePoint(stop.address, "");

  if(saved){
    stop.lat = saved.lat;
    stop.lng = saved.lng;
    return true;
  }

  const legPoint = findSavedLegPointByAddress(stop.address);

  if(legPoint){
    stop.lat = legPoint.lat;
    stop.lng = legPoint.lng;
    return true;
  }

  const sequence = savedRouteCoordinateSequence();
  const index = routeStops.indexOf(stop);

  if(
    index >= 0 &&
    validPoint(sequence?.[index]?.lat, sequence?.[index]?.lng)
  ){
    stop.lat = Number(sequence[index].lat);
    stop.lng = Number(sequence[index].lng);
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
    if(readStopState(routeStops[i]).completed !== true){
      currentStopIndex = i;
      return;
    }
  }

  currentStopIndex = Math.max(0, routeStops.length - 1);
}

function currentStop(){
  return routeStops[currentStopIndex] || null;
}

/* ================= PASSENGER STATUS ================= */

function canonicalPickupState(status){
  const s = normalizeStatus(status);

  if([
    "picked",
    "picked up",
    "pickup complete",
    "on trip",
    "ontrip",
    "in progress",
    "inprogress"
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
    .filter(p => !isDriverIdentity(p.name, p.phone))
    .filter(p => !pickupPassengerFinal(stop, p));
}

function allPickupPassengersResolved(stop){
  const list = (stop?.passengers || [])
    .filter(p => !isDriverIdentity(p.name, p.phone));

  return (
    list.length > 0 &&
    list.every(p => pickupPassengerFinal(stop, p))
  );
}

function pickedPassengers(stop){
  return (stop?.passengers || [])
    .filter(p => !isDriverIdentity(p.name, p.phone))
    .filter(p => pickupPassengerState(stop, p) === "PICKED");
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

  return (
    d !== null &&
    d <= EXECUTION.stopRadiusMiles
  );
}

/* ================= TIMER ================= */

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
  return Math.max(
    0,
    Number(waitMinutesForStop(stop) || 0)
  ) * 60;
}

function waitStart(stop){
  const state = readStopState(stop);
  const arrivedAt = num(state.arrivedAt);

  if(!Number.isFinite(arrivedAt)){
    return null;
  }

  if(stop?.type === "pickup"){
    const scheduledAt = num(stop?.scheduledAt);

    if(Number.isFinite(scheduledAt)){
      return Math.max(arrivedAt, scheduledAt);
    }
  }

  return arrivedAt;
}

function timerStarted(stop){
  const start = waitStart(stop);

  return (
    Number.isFinite(start) &&
    serverNow() >= start
  );
}

function timerRemaining(stop){
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
  return (
    timerStarted(stop) &&
    timerRemaining(stop) <= 0
  );
}

function startTimerWatcher(){
  if(timerInterval){
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(renderExecutionState, 1000);
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
  routeMarkers.forEach(marker => marker.setMap(null));
  routeMarkers = [];
}

function drawRouteMarkers(){
  if(!map) return;

  clearRouteMarkers();

  routeStops.forEach((stop, index) => {
    if(!validPoint(stop.lat, stop.lng)){
      return;
    }

    let color = "#64748b";

    if(index === currentStopIndex){
      color =
        stop.type === "pickup"
          ? "#2563eb"
          : stop.type === "dropoff"
            ? "#16a34a"
            : "#7c3aed";
    }else if(index > currentStopIndex){
      color = "#64748b";
    }

    const marker = new google.maps.Marker({
      map,
      position: {
        lat: stop.lat,
        lng: stop.lng
      },
      title: stop.address || stop.type,
      label: {
        text: String(index + 1),
        color: "#fff",
        fontWeight: "900",
        fontSize: "11px"
      },
      icon: markerIcon(color, index === currentStopIndex ? 11 : 8),
      zIndex: index === currentStopIndex ? 30 : 10
    });

    routeMarkers.push(marker);
  });
}

function drawDisplayLine(){
  if(!map) return;

  if(routePolyline){
    routePolyline.setMap(null);
    routePolyline = null;
  }

  if(guidePolyline){
    guidePolyline.setMap(null);
    guidePolyline = null;
  }

  const path = routeStops
    .slice(currentStopIndex)
    .filter(stop => validPoint(stop.lat, stop.lng))
    .map(stop => ({
      lat: Number(stop.lat),
      lng: Number(stop.lng)
    }));

  if(path.length >= 2){
    routePolyline = new google.maps.Polyline({
      map,
      path,
      geodesic: true,
      strokeColor: "#2f7df6",
      strokeOpacity: 0.86,
      strokeWeight: 5
    });
  }

  const stop = currentStop();

  if(
    validPoint(driverLat, driverLng) &&
    validPoint(stop?.lat, stop?.lng)
  ){
    guidePolyline = new google.maps.Polyline({
      map,
      path: [
        {
          lat: Number(driverLat),
          lng: Number(driverLng)
        },
        {
          lat: Number(stop.lat),
          lng: Number(stop.lng)
        }
      ],
      geodesic: true,
      strokeColor: "#f59e0b",
      strokeOpacity: 0.75,
      strokeWeight: 4,
      icons: [{
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 2.4,
          strokeColor: "#f59e0b"
        },
        offset: "100%"
      }]
    });
  }
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
  const stop = currentStop();
  if(!stop) return;

  let destination = "";

  if(validPoint(stop.lat, stop.lng)){
    destination = `${stop.lat},${stop.lng}`;
  }else{
    destination = encodeURIComponent(stop.address || "");
  }

  if(!destination){
    alert("Destination not found");
    return;
  }

  const origin =
    validPoint(driverLat, driverLng)
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
      await updateTrip({
        status: "InProgress",
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
      passengerStatus: status,
      cancelReason: reason,
      cancelFee: Number(tripDoc?.cancelFee || 0),
      driverId: DRIVER_ID,
      driverName: DRIVER_NAME
    });
  }else if(pickupState === "NO_SHOW"){
    await updateTrip({
      status: "No Show",
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

function renderPickupPassengers(stop){
  const passengers = (stop.passengers || [])
    .filter(p => !isDriverIdentity(p.name, p.phone));

  passengersSection.style.display = passengers.length ? "block" : "none";

  currentPassengersEl.innerHTML = passengers.map(p => {
    const state = pickupPassengerState(stop, p);
    const final = pickupPassengerFinal(stop, p);
    const cancelLabel = timerExpired(stop) ? "NO SHOW" : "CANCEL";

    return `
      <div class="passenger-row" data-passenger-id="${escapeHtml(p.passengerId)}">
        <div class="passenger-main">
          <div class="passenger-avatar" aria-hidden="true">●</div>

          <div class="passenger-name-wrap">
            <div class="passenger-name-line">
              <strong>${escapeHtml(p.name)}</strong>

              ${
                p.phone
                  ? `
                    <button
                      class="passenger-call"
                      type="button"
                      data-action="call"
                      aria-label="Call ${escapeHtml(p.name)}"
                    >
                      ☎
                    </button>
                  `
                  : ""
              }
            </div>

            ${passengerStatusBadge(state)}
          </div>
        </div>

        <div class="passenger-actions">
          ${
            final
              ? ""
              : `
                <button
                  class="passenger-btn pickup"
                  type="button"
                  data-action="pickup"
                >
                  PICK UP
                </button>

                <button
                  class="passenger-btn danger"
                  type="button"
                  data-action="${timerExpired(stop) ? "no-show" : "cancel"}"
                >
                  ${cancelLabel}
                </button>
              `
          }
        </div>
      </div>
    `;
  }).join("");

  currentPassengersEl
    .querySelectorAll(".passenger-row")
    .forEach(row => {
      const passengerIdValue = row.dataset.passengerId;

      const passenger = passengers.find(p =>
        String(p.passengerId) === String(passengerIdValue)
      );

      if(!passenger) return;

      row.querySelector('[data-action="call"]')
        ?.addEventListener("click", () => {
          dialPassenger(stop, passenger);
        });

      row.querySelector('[data-action="pickup"]')
        ?.addEventListener("click", async () => {
          try{
            await persistPassengerPickupState(
              stop,
              passenger,
              "PICKED"
            );

            renderExecutionState();
          }catch(err){
            alert(err.message);
          }
        });

      row.querySelector('[data-action="cancel"]')
        ?.addEventListener("click", () => {
          if(!passengerWasCalled(stop, passenger)){
            dialPassenger(stop, passenger, "CANCELLED");
            return;
          }

          openReasonModal("CANCELLED", stop, passenger);
        });

      row.querySelector('[data-action="no-show"]')
        ?.addEventListener("click", () => {
          if(
            EXECUTION.noShowRequiresTimer &&
            !timerExpired(stop)
          ){
            alert("Wait timer must finish first.");
            return;
          }

          if(!passengerWasCalled(stop, passenger)){
            dialPassenger(stop, passenger, "NO_SHOW");
            return;
          }

          openReasonModal("NO_SHOW", stop, passenger);
        });
    });
}

function renderNonPickupPassenger(stop){
  const passengers = (stop.passengers || [])
    .filter(p => !isDriverIdentity(p.name, p.phone));

  if(!passengers.length){
    passengersSection.style.display = "none";
    currentPassengersEl.innerHTML = "";
    return;
  }

  passengersSection.style.display = "block";

  currentPassengersEl.innerHTML = passengers.map(p => `
    <div class="passenger-row simple">
      <div class="passenger-main">
        <div class="passenger-avatar" aria-hidden="true">●</div>

        <div class="passenger-name-wrap">
          <div class="passenger-name-line">
            <strong>${escapeHtml(p.name)}</strong>

            ${
              p.phone
                ? `
                  <button
                    class="passenger-call"
                    type="button"
                    data-passenger-id="${escapeHtml(p.passengerId)}"
                    aria-label="Call ${escapeHtml(p.name)}"
                  >
                    ☎
                  </button>
                `
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `).join("");

  currentPassengersEl
    .querySelectorAll(".passenger-call")
    .forEach(button => {
      const passenger = passengers.find(p =>
        String(p.passengerId) ===
        String(button.dataset.passengerId)
      );

      if(passenger){
        button.addEventListener("click", () => {
          dialPassenger(stop, passenger);
        });
      }
    });
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
  renderPassengers();
  drawRouteMarkers();
  drawDisplayLine();

  const state = readStopState(stop);
  const distance = currentDistance();

  hideTimer();
  showPrimaryButton();

  if(stop.type !== "pickup"){
    btnStartRide.style.display = "none";
  }

  /* ---------- BEFORE ARRIVED ---------- */

  if(state.arrived !== true){
    btnStartRide.style.display = "none";

    if(!inside250()){
      gpsBadge.textContent = validPoint(driverLat, driverLng)
        ? "GPS Active"
        : "GPS";

      setStopStatus(
        distance !== null
          ? `${distance.toFixed(2)} mi from current stop`
          : "Directions available by saved stop address"
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

  /* ---------- PICKUP ---------- */

  if(stop.type === "pickup"){
    const scheduledAt = num(stop.scheduledAt);

    if(
      Number.isFinite(scheduledAt) &&
      serverNow() < scheduledAt
    ){
      setStopStatus(`Scheduled ${formatScheduledTime(scheduledAt)}`);
      showTimer(waitDurationSeconds(stop));

      setPrimaryButton(
        "WAITING FOR TRIP TIME",
        false,
        "muted"
      );

      btnPrimaryAction.dataset.mode = "waiting";
      btnStartRide.style.display = "block";
      btnStartRide.disabled = true;
      btnStartRide.classList.remove("ready");
      return;
    }

    showTimer(timerRemaining(stop));

    setStopStatus(
      timerExpired(stop)
        ? "Waiting time finished"
        : "Pickup waiting time"
    );

    hidePrimaryButton();

    btnStartRide.style.display = "block";

    const canStart = allPickupPassengersResolved(stop);

    btnStartRide.disabled = !canStart;
    btnStartRide.classList.toggle("ready", canStart);

    return;
  }

  /* ---------- INTERMEDIATE STOP ---------- */

  if(stop.type === "stop"){
    showTimer(timerRemaining(stop));

    setStopStatus(
      timerExpired(stop)
        ? "Stop waiting time finished"
        : "Stop waiting time"
    );

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

  if(currentStopIndex < routeStops.length - 1){
    currentStopIndex++;
    renderExecutionState();
    fitMap();

    if(autoOpenGoogle){
      setTimeout(openGoogleNavigation, 250);
    }

    return;
  }

  setStopStatus("All trip stops finished");
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
    if(!inside250()){
      alert("You must be inside the 250 meter area first.");
      renderExecutionState();
      return;
    }

    const arrivedAt = serverNow();

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
    if(!inside250()){
      alert("You must be inside the 250 meter stop area first.");
      return;
    }

    await advanceStop(true);
    return;
  }

  if(mode === "complete-dropoff"){
    if(!inside250()){
      alert("You must be inside the 250 meter dropoff area first.");
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

    await advanceStop(true);
  }
});

/* ================= START RIDE ================= */

btnStartRide?.addEventListener("click", async () => {
  const stop = currentStop();

  if(
    !stop ||
    stop.type !== "pickup" ||
    !allPickupPassengersResolved(stop)
  ){
    return;
  }

  if(
    Number.isFinite(stop.scheduledAt) &&
    serverNow() < stop.scheduledAt
  ){
    alert("Trip time has not started yet.");
    return;
  }

  const picked = pickedPassengers(stop);
  const startedAt = serverNow();

  try{
    if(isSharedTrip()){
      const pickedIds = new Set(
        picked.map(p => String(p.passengerId))
      );

      const passengers = (tripDoc.passengers || [])
        .map((p, index) => {
          const id = passengerId(p, index);

          if(pickedIds.has(String(id))){
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
      if(picked.length){
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
  renderExecutionState();
});

/* ================= DETAILS ================= */

eyeBtn?.addEventListener("click", () => {
  renderTripDetails();
  show(detailsBox, "flex");
});

btnCloseDetails?.addEventListener("click", () => {
  hide(detailsBox);
});

/* ================= RECENTER ================= */

recenterBtn?.addEventListener("click", () => {
  userMovedMap = false;
  fitMap();
});

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

    routeStops = buildRouteStops(tripDoc);

    for(const stop of routeStops){
      await ensureStopCoordinates(stop);
    }

    if(!routeStops.length){
      throw new Error("No route stops found");
    }

    restoreCurrentStop();

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