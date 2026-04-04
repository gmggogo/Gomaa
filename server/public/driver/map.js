/* =====================================================
   SUNBEAM DRIVER MAP – FINAL COMPLETE
===================================================== */

/* ===============================
   AUTH
================================ */
const rawDriver =
  localStorage.getItem("loggedDriver") ||
  localStorage.getItem("user");

if (!rawDriver) {
  location.href = "/driver/login.html";
}

let driver = {};
try {
  driver = JSON.parse(rawDriver);
} catch (err) {
  console.log("Driver session parse error:", err);
  location.href = "/driver/login.html";
}

const DRIVER_ID = String(driver._id || driver.id || "");
const DRIVER_NAME = driver.name || driver.username || "Driver";

/* ===============================
   MAP ELEMENT
================================ */
const mapEl = document.getElementById("map");
if (!mapEl) {
  throw new Error("Map element not found");
}

/* ===============================
   TRIP DATA FROM DATASET
================================ */
const TRIP_ID = String(mapEl.dataset.tripId || "");

const pickupLat = parseFloat(mapEl.dataset.pickupLat);
const pickupLng = parseFloat(mapEl.dataset.pickupLng);
const dropLat = parseFloat(mapEl.dataset.dropoffLat);
const dropLng = parseFloat(mapEl.dataset.dropoffLng);

const hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
const hasDropoff = Number.isFinite(dropLat) && Number.isFinite(dropLng);

/* ===============================
   MAP INIT
================================ */
const defaultLat = hasPickup ? pickupLat : 33.4484;
const defaultLng = hasPickup ? pickupLng : -112.0740;

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([defaultLat, defaultLng], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

setTimeout(() => {
  try { map.invalidateSize(); } catch (e) {}
}, 600);

/* ===============================
   ICONS
================================ */
const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/741/741407.png",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -14]
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
   MARKERS
================================ */
let driverMarker = null;
let pickupMarker = null;
let dropMarker = null;

if (hasPickup) {
  pickupMarker = L.marker([pickupLat, pickupLng], { icon: pickupIcon })
    .addTo(map)
    .bindPopup("Pickup");
}

if (hasDropoff) {
  dropMarker = L.marker([dropLat, dropLng], { icon: dropoffIcon })
    .addTo(map)
    .bindPopup("Dropoff");
}

/* ===============================
   ROUTE STATE
================================ */
let routeControl = null;
let routeMode = "pickup"; // pickup | dropoff
let lastRouteUpdate = 0;
const ROUTE_UPDATE_MS = 8000;
let firstGpsFix = true;

/* ===============================
   UI ELEMENTS
================================ */
const btnGoogle = document.getElementById("btnGoogle");
const btnGo = document.getElementById("btnGoPickup");
const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnDropoff = document.getElementById("btnDropoff");
const btnNoShow = document.getElementById("btnNoShow");

const timerEl = document.getElementById("waitTimer");
const noShowBox = document.getElementById("noShowBox");
const noShowNotes = document.getElementById("noShowNotes");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");
const navText = document.getElementById("navText");

/* ===============================
   FLOW STATE
================================ */
let arrived = false;
let started = false;
let completed = false;
let noShowDone = false;

/* ===============================
   GPS STATE
================================ */
let driverLat = null;
let driverLng = null;
window.driverLat = null;
window.driverLng = null;

/* ===============================
   HELPERS
================================ */
function showEl(el, display = "block") {
  if (el) el.style.display = display;
}

function hideEl(el) {
  if (el) el.style.display = "none";
}

function setNavText(text) {
  if (navText) navText.innerText = text;
}

function stopAllRideButtons() {
  hideEl(btnGo);
  hideEl(btnArrived);
  hideEl(btnStart);
  hideEl(btnDropoff);
  hideEl(btnNoShow);
}

function resetNoShowBox() {
  hideEl(noShowBox);
  if (noShowNotes) noShowNotes.value = "";
}

function resetAllUi() {
  stopAllRideButtons();
  resetNoShowBox();
  stopTimer();
  if (btnDropoff) btnDropoff.classList.remove("enabled");
}

function isNearTarget(distanceMilesValue, target = 0.1) {
  return Number.isFinite(distanceMilesValue) && distanceMilesValue <= target;
}

function fitMapToPoints(points) {
  const good = points.filter(
    p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  if (good.length < 2) return;

  const bounds = L.latLngBounds(good.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });
}

/* ===============================
   DISTANCE CALC (MILES)
================================ */
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ===============================
   ROUTE DRAW
================================ */
function clearRoute() {
  if (routeControl) {
    try { map.removeControl(routeControl); } catch (e) {}
    routeControl = null;
  }
}

function drawRoute(fromLat, fromLng, toLat, toLng) {
  if (
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLng) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLng)
  ) {
    return;
  }

  if (!L.Routing || !L.Routing.control) {
    console.log("Leaflet Routing Machine not loaded");
    return;
  }

  clearRoute();

  routeControl = L.Routing.control({
    waypoints: [
      L.latLng(fromLat, fromLng),
      L.latLng(toLat, toLng)
    ],
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: false,
    show: false,
    showAlternatives: false,
    createMarker: function () {
      return null;
    },
    lineOptions: {
      styles: [
        {
          color: routeMode === "pickup" ? "#2563eb" : "#16a34a",
          weight: 6,
          opacity: 0.9
        }
      ]
    }
  }).addTo(map);

  fitMapToPoints([
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng }
  ]);
}

function drawRouteFlow(lat, lng) {
  if (routeMode === "pickup" && hasPickup) {
    drawRoute(lat, lng, pickupLat, pickupLng);
    return;
  }

  if (routeMode === "dropoff" && hasDropoff) {
    drawRoute(lat, lng, dropLat, dropLng);
  }
}

/* ===============================
   SEND LOCATION TO SERVER
================================ */
async function sendLocation(lat, lng) {
  if (!DRIVER_ID) return;

  const payload = {
    driverId: DRIVER_ID,
    name: DRIVER_NAME,
    lat,
    lng,
    tripId: TRIP_ID,
    routeMode,
    time: Date.now()
  };

  try {
    await fetch("/api/driver/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.log("Location send error:", err);
  }
}

/* ===============================
   UPDATE STATUS TO SERVER
================================ */
async function updateTripStatus(status, extra = {}) {
  if (!TRIP_ID) return;

  try {
    await fetch(`/api/trips/${TRIP_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status,
        ...extra
      })
    });
  } catch (err) {
    console.log("Trip status update error:", err);
  }
}

/* ===============================
   WAIT TIMER (15 MIN)
================================ */
let waitInterval = null;
let waitSeconds = 900;

function stopTimer() {
  if (waitInterval) {
    clearInterval(waitInterval);
    waitInterval = null;
  }

  waitSeconds = 900;
  if (timerEl) {
    timerEl.innerText = "15:00";
    hideEl(timerEl);
  }
}

function startTimer() {
  if (!timerEl) return;

  stopTimer();
  waitSeconds = 900;
  timerEl.innerText = "15:00";
  showEl(timerEl);

  waitInterval = setInterval(() => {
    waitSeconds--;

    const minutes = Math.floor(waitSeconds / 60);
    const seconds = waitSeconds % 60;

    timerEl.innerText =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (waitSeconds <= 0) {
      stopTimer();
      hideEl(btnNoShow);
    }
  }, 1000);
}

/* ===============================
   GOOGLE MAPS
================================ */
function openGoogleMaps() {
  const lat = driverLat;
  const lng = driverLng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    window.open("https://maps.google.com", "_blank");
    return;
  }

  if (routeMode === "dropoff" && hasDropoff) {
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${dropLat},${dropLng}&travelmode=driving`,
      "_blank"
    );
    return;
  }

  if (hasPickup) {
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${pickupLat},${pickupLng}&travelmode=driving`,
      "_blank"
    );
    return;
  }

  window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
}

if (btnGoogle) {
  btnGoogle.onclick = openGoogleMaps;
}

/* ===============================
   BUTTON EVENTS
================================ */
if (btnGo) {
  btnGo.onclick = () => {
    hideEl(btnGo);
    showEl(btnArrived);
    setNavText("Go to pickup");
  };
}

if (btnArrived) {
  btnArrived.onclick = async () => {
    if (completed || noShowDone) return;

    arrived = true;
    routeMode = "pickup";

    hideEl(btnGo);
    hideEl(btnArrived);
    showEl(btnStart);
    showEl(btnNoShow);

    startTimer();
    setNavText("Waiting at pickup");

    await updateTripStatus("Arrived");
  };
}

if (btnStart) {
  btnStart.onclick = async () => {
    if (completed || noShowDone) return;

    started = true;
    routeMode = "dropoff";
    window.routeMode = routeMode;

    hideEl(btnStart);
    hideEl(btnNoShow);
    resetNoShowBox();
    stopTimer();

    showEl(btnDropoff);
    setNavText("Driving to dropoff");

    if (Number.isFinite(driverLat) && Number.isFinite(driverLng) && hasDropoff) {
      drawRouteFlow(driverLat, driverLng);
      lastRouteUpdate = Date.now();
    }

    await updateTripStatus("InProgress");
  };
}

if (btnDropoff) {
  btnDropoff.onclick = async () => {
    if (!btnDropoff.classList.contains("enabled")) {
      alert("You must be near the dropoff location first");
      return;
    }

    completed = true;
    await updateTripStatus("Completed");

    setNavText("Trip completed");
    resetAllUi();
    clearRoute();
    alert("Trip Completed");
  };
}

if (btnNoShow) {
  btnNoShow.onclick = () => {
    showEl(noShowBox, "flex");
  };
}

if (btnCompleteNoShow) {
  btnCompleteNoShow.onclick = async () => {
    const notes = noShowNotes ? noShowNotes.value.trim() : "";

    if (!notes) {
      alert("Please enter reason");
      return;
    }

    noShowDone = true;
    await updateTripStatus("NoShow", { noShowReason: notes });

    setNavText("No show completed");
    resetAllUi();
    clearRoute();
    alert("No Show Completed");
  };
}

/* ===============================
   INIT UI
================================ */
resetAllUi();
setNavText("Waiting for GPS...");
window.routeMode = routeMode;

/* ===============================
   GPS TRACKING
================================ */
if (!navigator.geolocation) {
  alert("GPS not supported on this device");
} else {
  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      driverLat = lat;
      driverLng = lng;
      window.driverLat = lat;
      window.driverLng = lng;
      window.currentPos = { lat, lng };

      if (!driverMarker) {
        driverMarker = L.marker([lat, lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup("You");
        window.driverMarker = driverMarker;
      } else {
        driverMarker.setLatLng([lat, lng]);
        window.driverMarker = driverMarker;
      }

      if (firstGpsFix) {
        firstGpsFix = false;
        if (routeMode === "pickup" && hasPickup) {
          fitMapToPoints([
            { lat, lng },
            { lat: pickupLat, lng: pickupLng }
          ]);
        } else if (routeMode === "dropoff" && hasDropoff) {
          fitMapToPoints([
            { lat, lng },
            { lat: dropLat, lng: dropLng }
          ]);
        } else {
          map.setView([lat, lng], 15);
        }
      }

      sendLocation(lat, lng);

      if (completed || noShowDone) return;

      const dPickup = hasPickup
        ? distanceMiles(lat, lng, pickupLat, pickupLng)
        : Infinity;

      const dDrop = hasDropoff
        ? distanceMiles(lat, lng, dropLat, dropLng)
        : Infinity;

      const now = Date.now();

      if (now - lastRouteUpdate > ROUTE_UPDATE_MS || !routeControl) {
        drawRouteFlow(lat, lng);
        lastRouteUpdate = now;
      }

      /* PICKUP PHASE */
      if (routeMode === "pickup" && !arrived) {
        hideEl(btnStart);
        hideEl(btnDropoff);
        hideEl(btnNoShow);
        resetNoShowBox();

        if (dPickup > 2) {
          hideEl(btnGo);
          hideEl(btnArrived);
          setNavText("Go to pickup");
        } else if (dPickup > 0.1) {
          showEl(btnGo);
          hideEl(btnArrived);
          setNavText("Go to pickup");
        } else {
          hideEl(btnGo);
          showEl(btnArrived);
          setNavText("Press ARRIVED");
        }
      }

      /* AFTER ARRIVED / BEFORE START */
      if (arrived && !started && !completed && !noShowDone) {
        hideEl(btnGo);
        hideEl(btnArrived);
        showEl(btnStart);
        if (waitInterval) showEl(btnNoShow);
        setNavText("Waiting at pickup");
      }

      /* DROPOFF PHASE */
      if (routeMode === "dropoff" && started && !completed && !noShowDone) {
        hideEl(btnGo);
        hideEl(btnArrived);
        hideEl(btnStart);
        hideEl(btnNoShow);
        resetNoShowBox();

        showEl(btnDropoff);

        if (isNearTarget(dDrop, 0.1)) {
          btnDropoff.classList.add("enabled");
          setNavText("Press DROP OFF");
        } else {
          btnDropoff.classList.remove("enabled");
          setNavText("Driving to dropoff");
        }
      }
    },
    (err) => {
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
   EXPOSE OPTIONAL
================================ */
window.openGoogleMaps = openGoogleMaps;
window.updateTripStatus = updateTripStatus;
window.startTimer = startTimer;
window.stopTimer = stopTimer;