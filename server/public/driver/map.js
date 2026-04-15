/* =====================================================
   SUNBEAM DRIVER MAP – COMPLETE FINAL
===================================================== */

console.log("Sunbeam driver map final loaded");

/* ===============================
   AUTH
================================ */
const rawDriver =
  localStorage.getItem("loggedDriver") ||
  localStorage.getItem("user");

if (!rawDriver) {
  window.location.href = "/driver/login.html";
}

let driver = {};
try {
  driver = JSON.parse(rawDriver);
} catch (err) {
  console.log("Driver parse error:", err);
  window.location.href = "/driver/login.html";
}

const DRIVER_ID = String(driver._id || driver.id || "");
const DRIVER_NAME = driver.name || driver.username || "Driver";

/* ===============================
   DOM
================================ */
const driverNameEl = document.getElementById("driverName");
const datetimeEl = document.getElementById("datetime");
const navTextEl = document.getElementById("navText");

const etaBox = document.getElementById("etaBox");
const etaTimeEl = document.getElementById("etaTime");
const etaDistanceEl = document.getElementById("etaDistance");

const btnGoPickup = document.getElementById("btnGoPickup");
const btnGoDropoff = document.getElementById("btnGoDropoff");
const btnGoogle = document.getElementById("btnGoogle");
const btnStart = document.getElementById("btnStart");
const btnCallClient = document.getElementById("btnCallClient");
const btnNoShow = document.getElementById("btnNoShow");
const btnComplete = document.getElementById("btnComplete");

const waitTimerEl = document.getElementById("waitTimer");

const noShowBox = document.getElementById("noShowBox");
const btnCloseNoShow = document.getElementById("btnCloseNoShow");
const noShowNotes = document.getElementById("noShowNotes");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");

const navHome = document.getElementById("navHome");
const navTrips = document.getElementById("navTrips");
const navMap = document.getElementById("navMap");
const navChat = document.getElementById("navChat");
const navLogout = document.getElementById("navLogout");

/* ===============================
   PAGE / TRIP
================================ */
const urlParams = new URLSearchParams(window.location.search);
const TRIP_ID = String(urlParams.get("tripId") || "");

let tripDoc = null;
let clientPhone = "";
let tripDateTime = null;

let pickupLat = null;
let pickupLng = null;
let dropLat = null;
let dropLng = null;

let hasPickup = false;
let hasDropoff = false;

/* ===============================
   STATE
================================ */
let map = null;
let driverMarker = null;
let pickupMarker = null;
let dropoffMarker = null;
let routeControl = null;
let firstFix = true;

let driverLat = null;
let driverLng = null;

let arrived = false;
let started = false;
let completed = false;
let noShowDone = false;
let calledClient = false;
let autoArrivedDone = false;
let waitingForTripTime = false;

let routeMode = "pickup"; // pickup | preview_dropoff | dropoff_live
let lastRouteRefresh = 0;
const ROUTE_REFRESH_MS = 4000;

let waitInterval = null;
let waitSeconds = 900;
let tripTimeWatcher = null;

/* ===============================
   UI BASICS
================================ */
if (driverNameEl) driverNameEl.innerText = DRIVER_NAME;

function updateClock() {
  if (!datetimeEl) return;
  datetimeEl.innerText = new Date().toLocaleString("en-US", {
    timeZone: "America/Phoenix"
  });
}
updateClock();
setInterval(updateClock, 1000);

function setNavText(text) {
  if (navTextEl) navTextEl.innerText = text;
}

function showEl(el, display = "block") {
  if (el) el.style.display = display;
}

function hideEl(el) {
  if (el) el.style.display = "none";
}

function hideETA() {
  if (etaBox) etaBox.style.display = "none";
}

function showETA(timeMin, distanceMi) {
  if (!etaBox || !etaTimeEl || !etaDistanceEl) return;
  etaTimeEl.innerText = `${timeMin} min`;
  etaDistanceEl.innerText = `${distanceMi} mi`;
  etaBox.style.display = "flex";
}

function hideAllMainButtons() {
  hideEl(btnGoPickup);
  hideEl(btnGoDropoff);
  hideEl(btnGoogle);
  hideEl(btnStart);
  hideEl(btnCallClient);
  hideEl(btnNoShow);
  hideEl(btnComplete);
}

function resetNoShowBox() {
  hideEl(noShowBox);
  if (noShowNotes) noShowNotes.value = "";
}

function resetUI() {
  hideAllMainButtons();
  hideEl(waitTimerEl);
  resetNoShowBox();
  hideETA();
  if (btnComplete) btnComplete.classList.remove("enabled");
}

function finishUI() {
  resetUI();
  stopTimer();
  clearRoute();
}

/* ===============================
   TIME LOGIC
================================ */
function buildTripDateTime(trip) {
  if (!trip) return null;

  if (trip.tripDate && trip.tripTime) {
    const d = new Date(`${trip.tripDate}T${trip.tripTime}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (trip.tripTime) {
    const d = new Date(trip.tripTime);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function isTripTimeStarted() {
  if (!tripDateTime) return true;
  return new Date() >= tripDateTime;
}

function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopTimer() {
  if (waitInterval) {
    clearInterval(waitInterval);
    waitInterval = null;
  }

  if (tripTimeWatcher) {
    clearInterval(tripTimeWatcher);
    tripTimeWatcher = null;
  }

  waitSeconds = 900;
  waitingForTripTime = false;

  if (waitTimerEl) {
    waitTimerEl.innerText = "15:00";
    hideEl(waitTimerEl);
  }
}

function startTimer() {
  if (!waitTimerEl || waitInterval || started || completed || noShowDone) return;

  waitSeconds = 900;
  waitTimerEl.innerText = formatTimer(waitSeconds);
  showEl(waitTimerEl);

  waitInterval = setInterval(() => {
    waitSeconds--;
    waitTimerEl.innerText = formatTimer(Math.max(0, waitSeconds));

    if (waitSeconds <= 0) {
      clearInterval(waitInterval);
      waitInterval = null;
      waitTimerEl.innerText = "TIME UP";

      hideEl(btnStart);
      hideEl(btnNoShow);
      showEl(btnCallClient);
      setNavText("Call client first");
    }
  }, 1000);
}

function watchTripTimeThenStartTimer() {
  if (tripTimeWatcher) clearInterval(tripTimeWatcher);

  waitingForTripTime = true;
  tripTimeWatcher = setInterval(() => {
    if (completed || noShowDone || started) {
      clearInterval(tripTimeWatcher);
      tripTimeWatcher = null;
      waitingForTripTime = false;
      return;
    }

    if (arrived && isTripTimeStarted()) {
      clearInterval(tripTimeWatcher);
      tripTimeWatcher = null;
      waitingForTripTime = false;
      setNavText("Waiting for passenger");
      startTimer();
    }
  }, 1000);
}

/* ===============================
   DISTANCE / GEO
================================ */
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isNearPickup(distance) {
  return Number.isFinite(distance) && distance <= 0.5;
}

function isNearDropoff(distance) {
  return Number.isFinite(distance) && distance <= 0.1;
}

function fitMapToPoints(points) {
  if (!map) return;

  const good = points.filter(
    p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  if (good.length < 2) return;

  const bounds = L.latLngBounds(good.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [34, 34] });
}

/* ===============================
   ROUTING
================================ */
function clearRoute() {
  if (routeControl && map) {
    try {
      map.removeControl(routeControl);
    } catch (e) {}
    routeControl = null;
  }
}

function updateRouteEtaFromEvent(e) {
  try {
    const route = e.routes[0];
    const distance = (route.summary.totalDistance / 1609.344).toFixed(1);
    const time = Math.max(1, Math.round(route.summary.totalTime / 60));
    showETA(time, distance);
  } catch (err) {
    console.log("ETA parse error:", err);
  }
}

function drawRoute(fromLat, fromLng, toLat, toLng, color = "#2563eb") {
  if (
    !map ||
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLng) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLng)
  ) {
    return;
  }

  if (!window.L || !L.Routing || !L.Routing.control) {
    console.log("Routing lib not loaded");
    return;
  }

  const styles = [
    { color: "#ffffff", weight: 10, opacity: 0.35 },
    { color, weight: 6, opacity: 0.98 }
  ];

  if (!routeControl) {
    routeControl = L.Routing.control({
      waypoints: [
        L.latLng(fromLat, fromLng),
        L.latLng(toLat, toLng)
      ],
      addWaypoints: false,
      draggableWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoutes: false,
      show: false,
      showAlternatives: false,
      createMarker: () => null,
      lineOptions: { styles }
    })
      .on("routesfound", updateRouteEtaFromEvent)
      .addTo(map);
  } else {
    routeControl.options.lineOptions.styles = styles;
    routeControl.setWaypoints([
      L.latLng(fromLat, fromLng),
      L.latLng(toLat, toLng)
    ]);
  }

  fitMapToPoints([
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng }
  ]);
}

function drawRouteFlow(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  if (routeMode === "pickup" && hasPickup) {
    drawRoute(lat, lng, pickupLat, pickupLng, "#2563eb");
    return;
  }

  if (routeMode === "preview_dropoff" && hasPickup && hasDropoff) {
    drawRoute(pickupLat, pickupLng, dropLat, dropLng, "#16a34a");
    return;
  }

  if (routeMode === "dropoff_live" && hasDropoff) {
    drawRoute(lat, lng, dropLat, dropLng, "#16a34a");
  }
}

/* ===============================
   API
================================ */
async function fetchTrip() {
  if (!TRIP_ID) {
    alert("No trip found");
    window.location.href = "/driver/trips.html";
    return null;
  }

  try {
    const res = await fetch(`/api/trips/${TRIP_ID}`);
    if (!res.ok) throw new Error("Trip not found");
    return await res.json();
  } catch (err) {
    console.log("fetchTrip error:", err);
    alert("Error loading trip");
    window.location.href = "/driver/trips.html";
    return null;
  }
}

async function updateTripStatus(status, extra = {}) {
  if (!TRIP_ID) return;

  try {
    await fetch(`/api/trips/${TRIP_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...extra
      })
    });
  } catch (err) {
    console.log("updateTripStatus error:", err);
  }
}

async function sendLocation(lat, lng) {
  if (!DRIVER_ID) return;

  try {
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
        routeMode,
        time: Date.now()
      })
    });
  } catch (err) {
    console.log("sendLocation error:", err);
  }
}

/* ===============================
   GOOGLE MAPS
================================ */
function openGoogleMaps() {
  if (!Number.isFinite(driverLat) || !Number.isFinite(driverLng)) {
    alert("Waiting for GPS...");
    return;
  }

  let destination = "";

  if (routeMode === "dropoff_live" && hasDropoff) {
    destination = `${dropLat},${dropLng}`;
  } else if (hasPickup) {
    destination = `${pickupLat},${pickupLng}`;
  } else {
    alert("Trip destination not found");
    return;
  }

  const url =
    `https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLng}&destination=${destination}&travelmode=driving`;

  window.open(url, "_blank");
}

/* ===============================
   VIEW STATES
================================ */
function showPickupState() {
  resetUI();
  showEl(btnGoPickup);
  showEl(btnGoogle);
  setNavText("Go to pickup");
}

function showWaitingState() {
  resetUI();
  showEl(btnStart);
  showEl(btnNoShow);

  if (waitInterval) {
    showEl(waitTimerEl);
    setNavText("Waiting for passenger");
  } else if (waitingForTripTime) {
    setNavText("Waiting until trip time");
  } else if (calledClient) {
    setNavText("Client contacted. Choose action");
  } else {
    setNavText("Waiting for passenger");
  }
}

function showCallClientState() {
  resetUI();
  showEl(btnCallClient);
  showEl(waitTimerEl);
  setNavText("Call client first");
}

function showNoShowState() {
  hideEl(btnStart);
  hideEl(btnNoShow);
  hideEl(btnCallClient);
  hideEl(waitTimerEl);
  showEl(noShowBox, "flex");
  setNavText("Enter no show reason");
}

function showDropoffState(canComplete) {
  resetUI();
  showEl(btnGoDropoff);
  showEl(btnGoogle);

  if (canComplete) {
    showEl(btnComplete);
    btnComplete.classList.add("enabled");
    setNavText("Press COMPLETE");
  } else {
    btnComplete.classList.remove("enabled");
    setNavText("Go to dropoff");
  }
}

/* ===============================
   FLOW
================================ */
async function autoArriveFlow() {
  if (autoArrivedDone || arrived || completed || noShowDone) return;

  autoArrivedDone = true;
  arrived = true;
  routeMode = "preview_dropoff";

  resetUI();
  showEl(btnStart);
  showEl(btnNoShow);

  if (Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
    drawRouteFlow(driverLat, driverLng);
    lastRouteRefresh = Date.now();
  }

  await updateTripStatus("Arrived");

  if (isTripTimeStarted()) {
    setNavText("Waiting for passenger");
    startTimer();
  } else {
    setNavText("Waiting until trip time");
    watchTripTimeThenStartTimer();
  }
}

/* ===============================
   BUTTONS
================================ */
btnGoogle.onclick = openGoogleMaps;

btnGoPickup.onclick = () => {
  setNavText("Go to pickup");
};

btnGoDropoff.onclick = () => {
  setNavText("Go to dropoff");
};

btnStart.onclick = async () => {
  if (completed || noShowDone) return;

  if (!calledClient && waitSeconds <= 0) {
    alert("Call client first");
    return;
  }

  started = true;
  calledClient = false;
  routeMode = "dropoff_live";

  resetNoShowBox();
  stopTimer();
  showDropoffState(false);

  if (Number.isFinite(driverLat) && Number.isFinite(driverLng) && hasDropoff) {
    drawRouteFlow(driverLat, driverLng);
    lastRouteRefresh = Date.now();
  }

  await updateTripStatus("InProgress");
};

btnCallClient.onclick = () => {
  if (!clientPhone) {
    alert("Client phone not found");
    return;
  }

  calledClient = true;
  window.location.href = `tel:${clientPhone}`;

  hideEl(btnCallClient);
  showEl(btnStart);
  showEl(btnNoShow);
  setNavText("Client contacted. Choose action");
};

btnNoShow.onclick = () => {
  if (completed || noShowDone) return;
  showNoShowState();
};

btnCloseNoShow.onclick = () => {
  hideEl(noShowBox);
  showEl(btnStart);
  showEl(btnNoShow);

  if (waitInterval) {
    showEl(waitTimerEl);
    setNavText("Waiting for passenger");
  } else if (waitSeconds <= 0 && !calledClient) {
    showCallClientState();
  } else if (waitingForTripTime) {
    setNavText("Waiting until trip time");
  } else {
    setNavText("Choose action");
  }
};

btnCompleteNoShow.onclick = async () => {
  const reason = (noShowNotes?.value || "").trim();

  if (!reason) {
    alert("Please enter reason");
    return;
  }

  noShowDone = true;

  await updateTripStatus("NoShow", {
    noShowReason: reason
  });

  finishUI();
  setNavText("No show completed");
  alert("No Show Completed");
  window.location.href = "/driver/trips.html";
};

btnComplete.onclick = async () => {
  if (!started) return;

  if (!btnComplete.classList.contains("enabled")) {
    alert("You must be near the dropoff location first");
    return;
  }

  completed = true;
  await updateTripStatus("Completed");
  finishUI();
  setNavText("Trip completed");
  alert("Trip Completed");
  window.location.href = "/driver/trips.html";
};

/* ===============================
   GPS WATCH
================================ */
function startGpsWatch() {
  if (!navigator.geolocation) {
    alert("GPS not supported");
    return;
  }

  navigator.geolocation.watchPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      driverLat = lat;
      driverLng = lng;

      if (!driverMarker) {
        driverMarker = L.marker([lat, lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup("You");
      } else {
        driverMarker.setLatLng([lat, lng]);
      }

      if (firstFix) {
        firstFix = false;

        if (hasPickup) {
          fitMapToPoints([
            { lat, lng },
            { lat: pickupLat, lng: pickupLng }
          ]);
        } else {
          map.setView([lat, lng], 15);
        }
      }

      await sendLocation(lat, lng);

      if (completed || noShowDone) return;

      const now = Date.now();
      const dPickup = hasPickup
        ? distanceMiles(lat, lng, pickupLat, pickupLng)
        : Infinity;
      const dDrop = hasDropoff
        ? distanceMiles(lat, lng, dropLat, dropLng)
        : Infinity;

      if (!arrived) {
        if (!routeControl || now - lastRouteRefresh > ROUTE_REFRESH_MS) {
          routeMode = "pickup";
          drawRouteFlow(lat, lng);
          lastRouteRefresh = now;
        }

        showPickupState();

        if (isNearPickup(dPickup)) {
          await autoArriveFlow();
        }
        return;
      }

      if (arrived && !started) {
        if (!routeControl || now - lastRouteRefresh > ROUTE_REFRESH_MS) {
          routeMode = "preview_dropoff";
          drawRouteFlow(lat, lng);
          lastRouteRefresh = now;
        }

        if (!noShowBox.style.display.includes("flex")) {
          if (waitInterval) {
            showWaitingState();
          } else if (waitSeconds <= 0 && !calledClient) {
            showCallClientState();
          } else {
            showWaitingState();
          }
        }
        return;
      }

      if (started) {
        if (!routeControl || now - lastRouteRefresh > ROUTE_REFRESH_MS) {
          routeMode = "dropoff_live";
          drawRouteFlow(lat, lng);
          lastRouteRefresh = now;
        }

        const canComplete = isNearDropoff(dDrop);
        showDropoffState(canComplete);
      }
    },
    err => {
      console.log("GPS error:", err);
      alert("Enable GPS");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

/* ===============================
   ICONS
================================ */
const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/741/741407.png",
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -16]
});

const pickupIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -28]
});

const dropoffIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1483/1483336.png",
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -28]
});

/* ===============================
   MAP INIT
================================ */
function initMap() {
  const defaultCenter = hasPickup
    ? [pickupLat, pickupLng]
    : [33.4484, -112.0740];

  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultCenter, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map);

  setTimeout(() => {
    try {
      map.invalidateSize();
    } catch (e) {}
  }, 500);

  if (hasPickup) {
    pickupMarker = L.marker([pickupLat, pickupLng], { icon: pickupIcon })
      .addTo(map)
      .bindPopup("Pickup");
  }

  if (hasDropoff) {
    dropoffMarker = L.marker([dropLat, dropLng], { icon: dropoffIcon })
      .addTo(map)
      .bindPopup("Dropoff");
  }

  resetUI();
  setNavText("Waiting for GPS...");
  startGpsWatch();
}

/* ===============================
   LOAD PAGE
================================ */
async function initPage() {
  tripDoc = await fetchTrip();
  if (!tripDoc) return;

  tripDateTime = buildTripDateTime(tripDoc);

  clientPhone =
    tripDoc.clientPhone ||
    tripDoc.entryPhone ||
    tripDoc.phone ||
    tripDoc.client_phone ||
    "";

  pickupLat = parseFloat(tripDoc.pickupLat);
  pickupLng = parseFloat(tripDoc.pickupLng);
  dropLat = parseFloat(tripDoc.dropoffLat);
  dropLng = parseFloat(tripDoc.dropoffLng);

  hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
  hasDropoff = Number.isFinite(dropLat) && Number.isFinite(dropLng);

  initMap();
}

/* ===============================
   BOTTOM NAV
================================ */
navHome.onclick = () => {
  window.location.href = "/driver/dashboard.html";
};

navTrips.onclick = () => {
  window.location.href = "/driver/trips.html";
};

navMap.onclick = () => {
  if (TRIP_ID) {
    window.location.href = `/driver/map.html?tripId=${TRIP_ID}`;
  } else {
    window.location.href = "/driver/trips.html";
  }
};

navChat.onclick = () => {
  alert("Chat coming soon");
};

navLogout.onclick = () => {
  localStorage.removeItem("loggedDriver");
  localStorage.removeItem("user");
  window.location.href = "/driver/login.html";
};

/* ===============================
   START
================================ */
setNavText("Loading trip...");
initPage();