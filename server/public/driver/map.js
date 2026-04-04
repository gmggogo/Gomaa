console.log("✅ Driver Map Engine Loaded");

/* =========================================
   CONFIG
========================================= */
const DEFAULT_CENTER = [33.4484, -112.0740]; // Phoenix
const DEFAULT_ZOOM = 11;
const GPS_ZOOM = 17;
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const GEO_CACHE_KEY = "dispatch_geo_cache";
const LAST_ROUTE_INFO_KEY = "driver_last_route_info";

/* =========================================
   AUTH
========================================= */
const driver = JSON.parse(localStorage.getItem("loggedDriver") || "null");
if (!driver) {
  alert("Driver not logged in");
  location.href = "login.html";
  throw new Error("Driver not logged in");
}

/* =========================================
   MAP
========================================= */
const map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/741/741407.png",
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -18]
});

const pickupIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -30]
});

const stopIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -26]
});

const dropoffIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1483/1483336.png",
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -30]
});

/* =========================================
   STATE
========================================= */
let driverMarker = null;
let routeLayer = null;
let locationWatchId = null;
let firstFix = true;
let isDrawingRoute = false;
let lastDriverCoords = null;

let currentTrip = null;
let currentStage = "toPickup"; // toPickup | toStop | toDropoff | completed
let currentTargetIndex = -1;   // stop index when currentStage === "toStop"

let pointMarkers = [];
let lastRouteSignature = "";
let latestRouteInfo = {
  distanceMiles: 0,
  durationMinutes: 0,
  stage: "toPickup",
  targetLabel: "",
  tripId: null
};

let geoCache = {};
try {
  geoCache = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}");
} catch {
  geoCache = {};
}

/* =========================================
   HELPERS
========================================= */
function normId(v) {
  return String(v || "").trim();
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function cleanString(v) {
  return String(v || "").trim();
}

function getTripId(trip) {
  return String(trip?._id || trip?.id || trip?.tripNumber || "");
}

function getTrips() {
  try {
    return JSON.parse(localStorage.getItem("trips") || "[]");
  } catch {
    return [];
  }
}

function setTrips(trips) {
  localStorage.setItem("trips", JSON.stringify(trips || []));
}

function isTripDone(status) {
  const s = cleanString(status).toLowerCase();
  return s === "completed" || s === "complete" || s === "no show" || s === "cancelled" || s === "canceled";
}

function tripBelongsToDriver(trip) {
  const tripDriverId = normId(trip?.driverId || trip?.assignedDriverId || trip?.driver?._id || trip?.driver?.id);
  return tripDriverId && tripDriverId === normId(driver.id || driver._id);
}

function getTripDateTimeValue(trip) {
  const d = cleanString(trip?.tripDate);
  const t = cleanString(trip?.tripTime);

  if (!d && !t) return 0;

  const isoCandidate = d && t ? `${d}T${t}` : d || t;
  const parsed = new Date(isoCandidate);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();

  const parsed2 = new Date(`${d} ${t}`);
  if (!Number.isNaN(parsed2.getTime())) return parsed2.getTime();

  return 0;
}

function getCurrentTrip() {
  const trips = getTrips()
    .filter(tripBelongsToDriver)
    .filter(t => !isTripDone(t.status))
    .sort((a, b) => getTripDateTimeValue(a) - getTripDateTimeValue(b));

  return trips[0] || null;
}

function updateTripInStorage(updatedTrip) {
  if (!updatedTrip) return;
  const trips = getTrips();
  const updatedId = getTripId(updatedTrip);

  let found = false;
  const next = trips.map(t => {
    if (getTripId(t) === updatedId) {
      found = true;
      return { ...t, ...updatedTrip };
    }
    return t;
  });

  if (!found) next.push(updatedTrip);
  setTrips(next);
}

function emitRouteInfo(info) {
  latestRouteInfo = {
    ...latestRouteInfo,
    ...(info || {}),
    tripId: getTripId(currentTrip)
  };

  localStorage.setItem(LAST_ROUTE_INFO_KEY, JSON.stringify(latestRouteInfo));

  window.dispatchEvent(
    new CustomEvent("driver-route-updated", {
      detail: latestRouteInfo
    })
  );
}

function parseStops(trip) {
  const rawStops = safeArray(trip?.stops);
  const out = [];

  for (const s of rawStops) {
    if (!s) continue;

    if (typeof s === "string") {
      const val = cleanString(s);
      if (val) out.push(val);
      continue;
    }

    if (typeof s === "object") {
      const val =
        cleanString(s.address) ||
        cleanString(s.location) ||
        cleanString(s.stop) ||
        cleanString(s.name) ||
        cleanString(s.text);
      if (val) out.push(val);
    }
  }

  return out;
}

function getStageFromTrip(trip) {
  const status = cleanString(trip?.status).toLowerCase();
  const stops = parseStops(trip);

  if (status === "completed" || status === "complete") {
    return { stage: "completed", targetIndex: -1 };
  }

  if (status === "started" || status === "in progress" || status === "inprogress" || status === "picked up") {
    if (stops.length > 0) {
      const idx = Number.isInteger(trip.currentStopIndex) ? trip.currentStopIndex : 0;
      if (idx < stops.length) {
        return { stage: "toStop", targetIndex: idx };
      }
    }
    return { stage: "toDropoff", targetIndex: -1 };
  }

  if (status === "arrived") {
    return { stage: "toPickup", targetIndex: -1 };
  }

  if (status === "en route" || status === "on the way" || status === "assigned" || status === "scheduled" || !status) {
    return { stage: "toPickup", targetIndex: -1 };
  }

  return { stage: "toPickup", targetIndex: -1 };
}

function saveGeoCache() {
  localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache));
}

function getAddressCacheKey(address) {
  return cleanString(address).toLowerCase();
}

async function geocodeAddress(address) {
  const addr = cleanString(address);
  if (!addr) return null;

  const key = getAddressCacheKey(addr);
  if (geoCache[key]) return geoCache[key];

  const url = `${NOMINATIM_BASE}?format=json&limit=1&q=${encodeURIComponent(addr)}`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;

  const result = {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name || addr
  };

  if (Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
    geoCache[key] = result;
    saveGeoCache();
    return result;
  }

  return null;
}

function clearPointMarkers() {
  for (const m of pointMarkers) {
    try { map.removeLayer(m); } catch {}
  }
  pointMarkers = [];
}

function addPointMarker(lat, lng, label, icon) {
  const marker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(label);
  pointMarkers.push(marker);
  return marker;
}

function clearRouteLayer() {
  if (routeLayer) {
    try { map.removeLayer(routeLayer); } catch {}
    routeLayer = null;
  }
}

function getRouteColor(stage) {
  if (stage === "toPickup") return "#f59e0b";
  if (stage === "toStop") return "#2563eb";
  if (stage === "toDropoff") return "#16a34a";
  return "#64748b";
}

function milesFromMeters(meters) {
  return Number((meters / 1609.344).toFixed(1));
}

function minutesFromSeconds(seconds) {
  return Math.max(1, Math.round(seconds / 60));
}

function buildGoogleMapsUrl(origin, destination, waypoints = []) {
  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = `${destination.lat},${destination.lng}`;
  const wp = safeArray(waypoints)
    .map(p => `${p.lat},${p.lng}`)
    .join("|");

  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&travelmode=driving`;
  if (wp) {
    url += `&waypoints=${encodeURIComponent(wp)}`;
  }
  return url;
}

function getRouteSegmentsForCurrentStage(driverLat, driverLng, trip, stage, targetIndex) {
  const pickup = trip._geoPickup || null;
  const dropoff = trip._geoDropoff || null;
  const stops = safeArray(trip._geoStops);

  if (!pickup || !dropoff) return null;

  if (stage === "toPickup") {
    const coords = [
      { lat: driverLat, lng: driverLng, label: "Driver" },
      { lat: pickup.lat, lng: pickup.lng, label: "Pickup" }
    ];
    return {
      coords,
      targetLabel: "Pickup",
      googleUrl: buildGoogleMapsUrl(coords[0], coords[1]),
      fitPoints: [coords[0], coords[1]]
    };
  }

  if (stage === "toStop") {
    const idx = Number.isInteger(targetIndex) ? targetIndex : 0;
    const stopPoint = stops[idx];
    if (!stopPoint) {
      const coords = [
        { lat: driverLat, lng: driverLng, label: "Driver" },
        { lat: dropoff.lat, lng: dropoff.lng, label: "Dropoff" }
      ];
      return {
        coords,
        targetLabel: "Dropoff",
        googleUrl: buildGoogleMapsUrl(coords[0], coords[1]),
        fitPoints: [coords[0], coords[1]]
      };
    }

    const coords = [
      { lat: driverLat, lng: driverLng, label: "Driver" },
      { lat: stopPoint.lat, lng: stopPoint.lng, label: `Stop ${idx + 1}` }
    ];

    return {
      coords,
      targetLabel: `Stop ${idx + 1}`,
      googleUrl: buildGoogleMapsUrl(coords[0], coords[1]),
      fitPoints: [coords[0], coords[1]]
    };
  }

  if (stage === "toDropoff") {
    const coords = [
      { lat: driverLat, lng: driverLng, label: "Driver" },
      { lat: dropoff.lat, lng: dropoff.lng, label: "Dropoff" }
    ];
    return {
      coords,
      targetLabel: "Dropoff",
      googleUrl: buildGoogleMapsUrl(coords[0], coords[1]),
      fitPoints: [coords[0], coords[1]]
    };
  }

  return null;
}

function buildFullTripSignature(driverLat, driverLng, trip, stage, targetIndex) {
  const base = [
    getTripId(trip),
    stage,
    targetIndex,
    driverLat?.toFixed?.(5),
    driverLng?.toFixed?.(5),
    cleanString(trip?.pickup),
    cleanString(trip?.dropoff),
    parseStops(trip).join("|"),
    cleanString(trip?.status),
    cleanString(trip?.notes),
    cleanString(trip?.noShowReason)
  ];
  return base.join("::");
}

async function hydrateTripGeometry(trip) {
  if (!trip) return trip;

  const nextTrip = { ...trip };

  if (!nextTrip._geoPickup) {
    nextTrip._geoPickup = await geocodeAddress(nextTrip.pickup);
  }

  if (!nextTrip._geoDropoff) {
    nextTrip._geoDropoff = await geocodeAddress(nextTrip.dropoff);
  }

  const stops = parseStops(nextTrip);
  if (!Array.isArray(nextTrip._geoStops) || nextTrip._geoStops.length !== stops.length) {
    nextTrip._geoStops = [];
    for (const stopAddress of stops) {
      const geo = await geocodeAddress(stopAddress);
      nextTrip._geoStops.push(geo);
    }
  }

  return nextTrip;
}

function renderTripMarkers(trip) {
  clearPointMarkers();
  if (!trip) return;

  if (trip._geoPickup) {
    addPointMarker(trip._geoPickup.lat, trip._geoPickup.lng, `Pickup: ${trip.pickup}`, pickupIcon);
  }

  const stopAddresses = parseStops(trip);
  safeArray(trip._geoStops).forEach((geo, idx) => {
    if (!geo) return;
    addPointMarker(
      geo.lat,
      geo.lng,
      `Stop ${idx + 1}: ${stopAddresses[idx] || ""}`,
      stopIcon
    );
  });

  if (trip._geoDropoff) {
    addPointMarker(trip._geoDropoff.lat, trip._geoDropoff.lng, `Dropoff: ${trip.dropoff}`, dropoffIcon);
  }
}

async function fetchOsrmRoute(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const coordString = points
    .map(p => `${p.lng},${p.lat}`)
    .join(";");

  const url = `${OSRM_BASE}/${coordString}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data || !Array.isArray(data.routes) || !data.routes.length) return null;

  return data.routes[0];
}

function fitMapToPoints(points) {
  if (!Array.isArray(points) || !points.length) return;
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });
}

function updateAdminLiveLocation(lat, lng) {
  const payload = {
    id: driver.id || driver._id,
    name: driver.name || driver.username || "Driver",
    lat,
    lng,
    time: Date.now(),
    tripId: getTripId(currentTrip),
    tripNumber: currentTrip?.tripNumber || "",
    status: currentTrip?.status || "",
    stage: currentStage,
    targetIndex: currentTargetIndex
  };

  localStorage.setItem(`driverLocation_${driver.id || driver._id}`, JSON.stringify(payload));
}

function updateDriverMarker(lat, lng) {
  if (!driverMarker) {
    driverMarker = L.marker([lat, lng], { icon: driverIcon })
      .addTo(map)
      .bindPopup("🚗 You");
  } else {
    driverMarker.setLatLng([lat, lng]);
  }

  if (firstFix) {
    map.setView([lat, lng], GPS_ZOOM);
    firstFix = false;
  }
}

async function drawCurrentRoute(force = false) {
  if (!currentTrip || !lastDriverCoords) {
    clearRouteLayer();
    emitRouteInfo({
      distanceMiles: 0,
      durationMinutes: 0,
      stage: currentStage,
      targetLabel: "",
      tripId: getTripId(currentTrip)
    });
    return;
  }

  if (isDrawingRoute) return;
  isDrawingRoute = true;

  try {
    currentTrip = await hydrateTripGeometry(currentTrip);
    updateTripInStorage(currentTrip);

    renderTripMarkers(currentTrip);

    const signature = buildFullTripSignature(
      lastDriverCoords.lat,
      lastDriverCoords.lng,
      currentTrip,
      currentStage,
      currentTargetIndex
    );

    if (!force && signature === lastRouteSignature) {
      return;
    }

    lastRouteSignature = signature;

    const segment = getRouteSegmentsForCurrentStage(
      lastDriverCoords.lat,
      lastDriverCoords.lng,
      currentTrip,
      currentStage,
      currentTargetIndex
    );

    if (!segment) {
      clearRouteLayer();
      return;
    }

    const route = await fetchOsrmRoute(segment.coords);
    if (!route) {
      clearRouteLayer();
      emitRouteInfo({
        distanceMiles: 0,
        durationMinutes: 0,
        stage: currentStage,
        targetLabel: segment.targetLabel
      });
      return;
    }

    clearRouteLayer();

    routeLayer = L.geoJSON(route.geometry, {
      style: {
        color: getRouteColor(currentStage),
        weight: 5,
        opacity: 0.95
      }
    }).addTo(map);

    fitMapToPoints(segment.fitPoints);

    emitRouteInfo({
      distanceMiles: milesFromMeters(route.distance || 0),
      durationMinutes: minutesFromSeconds(route.duration || 0),
      stage: currentStage,
      targetLabel: segment.targetLabel,
      googleUrl: segment.googleUrl
    });

    console.log(
      `📍 ${latestRouteInfo.distanceMiles} mi • ⏱ ${latestRouteInfo.durationMinutes} min • ${segment.targetLabel}`
    );
  } catch (err) {
    console.error("drawCurrentRoute error:", err);
  } finally {
    isDrawingRoute = false;
  }
}

function syncCurrentTripState() {
  currentTrip = getCurrentTrip();

  if (!currentTrip) {
    currentStage = "completed";
    currentTargetIndex = -1;
    clearPointMarkers();
    clearRouteLayer();
    emitRouteInfo({
      distanceMiles: 0,
      durationMinutes: 0,
      stage: "completed",
      targetLabel: ""
    });
    return;
  }

  const state = getStageFromTrip(currentTrip);
  currentStage = state.stage;
  currentTargetIndex = state.targetIndex;
}

function refreshCurrentTrip(forceRoute = true) {
  syncCurrentTripState();
  if (forceRoute) {
    drawCurrentRoute(true);
  }
}

function getRouteInfo() {
  return { ...latestRouteInfo };
}

function getCurrentTripSnapshot() {
  return currentTrip ? { ...currentTrip } : null;
}

/* =========================================
   GPS
========================================= */
function startGpsWatch() {
  if (!navigator.geolocation) {
    alert("GPS not supported");
    return;
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      lastDriverCoords = { lat, lng };

      updateDriverMarker(lat, lng);
      syncCurrentTripState();
      updateAdminLiveLocation(lat, lng);
      await drawCurrentRoute(false);
    },
    err => {
      console.error("GPS error:", err);
      alert("GPS error – allow location");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

/* =========================================
   ACTIONS
========================================= */
function arrived() {
  if (!currentTrip) return false;

  currentTrip.status = "Arrived";
  currentStage = "toPickup";
  currentTargetIndex = -1;

  updateTripInStorage(currentTrip);
  refreshCurrentTrip(true);

  console.log("✅ Arrived");
  return true;
}

function startTrip() {
  if (!currentTrip) return false;

  currentTrip.status = "Started";

  const stops = parseStops(currentTrip);
  if (stops.length > 0) {
    currentStage = "toStop";
    currentTargetIndex = 0;
    currentTrip.currentStopIndex = 0;
  } else {
    currentStage = "toDropoff";
    currentTargetIndex = -1;
    currentTrip.currentStopIndex = -1;
  }

  updateTripInStorage(currentTrip);
  refreshCurrentTrip(true);

  console.log("🚀 Trip Started");
  return true;
}

function nextStop() {
  if (!currentTrip) return false;

  const stops = parseStops(currentTrip);
  if (!stops.length) {
    currentStage = "toDropoff";
    currentTargetIndex = -1;
    currentTrip.currentStopIndex = -1;
    currentTrip.status = "Started";
    updateTripInStorage(currentTrip);
    refreshCurrentTrip(true);
    return true;
  }

  const current = Number.isInteger(currentTrip.currentStopIndex)
    ? currentTrip.currentStopIndex
    : 0;

  const next = current + 1;

  if (next < stops.length) {
    currentTrip.currentStopIndex = next;
    currentStage = "toStop";
    currentTargetIndex = next;
  } else {
    currentTrip.currentStopIndex = -1;
    currentStage = "toDropoff";
    currentTargetIndex = -1;
  }

  currentTrip.status = "Started";
  updateTripInStorage(currentTrip);
  refreshCurrentTrip(true);

  console.log("➡️ Next stop/dropoff");
  return true;
}

function completeTrip() {
  if (!currentTrip) return false;

  currentTrip.status = "Completed";
  currentTrip.completedAt = Date.now();
  currentStage = "completed";
  currentTargetIndex = -1;

  updateTripInStorage(currentTrip);
  refreshCurrentTrip(true);

  console.log("🏁 Trip Completed");
  return true;
}

function noShow(reason = "") {
  if (!currentTrip) return false;

  currentTrip.status = "No Show";
  currentTrip.noShowReason = cleanString(reason);
  currentTrip.noShowAt = Date.now();
  currentStage = "completed";
  currentTargetIndex = -1;

  updateTripInStorage(currentTrip);
  refreshCurrentTrip(true);

  console.log("❌ No Show");
  return true;
}

function saveNote(note = "") {
  if (!currentTrip) return false;

  currentTrip.notes = cleanString(note);
  currentTrip.lastNoteAt = Date.now();

  updateTripInStorage(currentTrip);
  refreshCurrentTrip(false);

  console.log("📝 Note Saved");
  return true;
}

function openGoogleMaps() {
  if (!currentTrip || !lastDriverCoords) return false;

  const pickup = currentTrip._geoPickup;
  const dropoff = currentTrip._geoDropoff;
  const stops = safeArray(currentTrip._geoStops).filter(Boolean);

  let url = "";

  if (currentStage === "toPickup" && pickup) {
    url = buildGoogleMapsUrl(
      { lat: lastDriverCoords.lat, lng: lastDriverCoords.lng },
      pickup
    );
  } else if (currentStage === "toStop" && Number.isInteger(currentTargetIndex) && stops[currentTargetIndex]) {
    url = buildGoogleMapsUrl(
      { lat: lastDriverCoords.lat, lng: lastDriverCoords.lng },
      stops[currentTargetIndex]
    );
  } else if (currentStage === "toDropoff" && dropoff) {
    url = buildGoogleMapsUrl(
      { lat: lastDriverCoords.lat, lng: lastDriverCoords.lng },
      dropoff
    );
  }

  if (!url) return false;

  window.open(url, "_blank");
  return true;
}

/* =========================================
   FULL PATH PREVIEW
   يرسم الرحلة كاملة: driver -> pickup -> stops -> dropoff
   للعرض فقط لو احتجته
========================================= */
async function previewFullTripPath() {
  if (!currentTrip || !lastDriverCoords) return false;

  try {
    currentTrip = await hydrateTripGeometry(currentTrip);
    updateTripInStorage(currentTrip);
    renderTripMarkers(currentTrip);

    const points = [
      { lat: lastDriverCoords.lat, lng: lastDriverCoords.lng, label: "Driver" }
    ];

    if (currentTrip._geoPickup) {
      points.push({ lat: currentTrip._geoPickup.lat, lng: currentTrip._geoPickup.lng, label: "Pickup" });
    }

    for (const s of safeArray(currentTrip._geoStops)) {
      if (s) points.push({ lat: s.lat, lng: s.lng, label: "Stop" });
    }

    if (currentTrip._geoDropoff) {
      points.push({ lat: currentTrip._geoDropoff.lat, lng: currentTrip._geoDropoff.lng, label: "Dropoff" });
    }

    if (points.length < 2) return false;

    const route = await fetchOsrmRoute(points);
    if (!route) return false;

    clearRouteLayer();

    routeLayer = L.geoJSON(route.geometry, {
      style: {
        color: "#7c3aed",
        weight: 5,
        opacity: 0.95,
        dashArray: "8,8"
      }
    }).addTo(map);

    fitMapToPoints(points);

    emitRouteInfo({
      distanceMiles: milesFromMeters(route.distance || 0),
      durationMinutes: minutesFromSeconds(route.duration || 0),
      stage: "fullPreview",
      targetLabel: "Full Trip Preview"
    });

    return true;
  } catch (err) {
    console.error("previewFullTripPath error:", err);
    return false;
  }
}

/* =========================================
   INIT
========================================= */
async function initDriverMapEngine() {
  syncCurrentTripState();
  startGpsWatch();
}

initDriverMapEngine();

/* =========================================
   EXPOSE TO WINDOW
   عشان الهتميل يقدر يناديهم بعدين
========================================= */
window.driverMapEngine = {
  refreshCurrentTrip,
  getCurrentTrip: getCurrentTripSnapshot,
  getRouteInfo,
  arrived,
  startTrip,
  nextStop,
  completeTrip,
  noShow,
  saveNote,
  openGoogleMaps,
  previewFullTripPath
};

window.arrived = arrived;
window.startTrip = startTrip;
window.nextStop = nextStop;
window.completeTrip = completeTrip;
window.noShow = noShow;
window.saveNote = saveNote;
window.openGoogleMaps = openGoogleMaps;
window.refreshCurrentTrip = refreshCurrentTrip;
window.previewFullTripPath = previewFullTripPath;