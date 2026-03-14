/* =====================================================
   SUNBEAM DRIVER MAP – FULL UBER STYLE
===================================================== */

/* ===============================
   AUTH CHECK
================================ */
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) {
  location.href = "/driver/login.html";
}

let driver = {};
try {
  driver = JSON.parse(rawDriver);
} catch {
  location.href = "/driver/login.html";
}

const DRIVER_ID = driver.id || "";
const DRIVER_NAME = driver.name || driver.username || "Driver";

/* ===============================
   MAP INIT
================================ */
const mapEl = document.getElementById("map");

if (!mapEl) {
  throw new Error("Map element not found");
}

const pickupLat = parseFloat(mapEl.dataset.pickupLat);
const pickupLng = parseFloat(mapEl.dataset.pickupLng);
const dropLat = parseFloat(mapEl.dataset.dropoffLat);
const dropLng = parseFloat(mapEl.dataset.dropoffLng);

const hasPickup =
  !Number.isNaN(pickupLat) &&
  !Number.isNaN(pickupLng);

const hasDropoff =
  !Number.isNaN(dropLat) &&
  !Number.isNaN(dropLng);

const defaultLat = hasPickup ? pickupLat : 33.4484;
const defaultLng = hasPickup ? pickupLng : -112.0740;

const map = L.map("map").setView([defaultLat, defaultLng], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

/* ===============================
   MARKERS
================================ */
let driverMarker = null;
let pickupMarker = null;
let dropMarker = null;

if (hasPickup) {
  pickupMarker = L.marker([pickupLat, pickupLng]).addTo(map);
}

if (hasDropoff) {
  dropMarker = L.marker([dropLat, dropLng]).addTo(map);
}

/* ===============================
   ROUTE CONTROL
================================ */
let routeControl = null;
let routeMode = "pickup"; // pickup | dropoff

function clearRoute() {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
}

function drawRoute(fromLat, fromLng, toLat, toLng) {
  if (
    Number.isNaN(fromLat) ||
    Number.isNaN(fromLng) ||
    Number.isNaN(toLat) ||
    Number.isNaN(toLng)
  ) {
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
    fitSelectedRoutes: true,
    show: false,
    createMarker: function () {
      return null;
    },
    lineOptions: {
      styles: [
        {
          color: "#2563eb",
          weight: 6,
          opacity: 0.9
        }
      ]
    }
  }).addTo(map);
}

/* ===============================
   BUTTONS
================================ */
const btnGo = document.getElementById("btnGoPickup");
const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnNoShow = document.getElementById("btnNoShow");
const btnDropoff = document.getElementById("btnDropoff");

const noShowBox = document.getElementById("noShowBox");
const timerEl = document.getElementById("waitTimer");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");
const noShowNotes = document.getElementById("noShowNotes");

/* ===============================
   HELPERS
================================ */
function showEl(el, display = "block") {
  if (el) el.style.display = display;
}

function hideEl(el) {
  if (el) el.style.display = "none";
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
   SEND LOCATION
================================ */
async function sendLocation(lat, lng) {
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
        lng
      })
    });
  } catch (e) {
    console.log("Location send error:", e);
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
}

function startTimer() {
  if (!timerEl) return;

  stopTimer();
  waitSeconds = 900;

  timerEl.innerText = "15:00";
  showEl(timerEl);

  waitInterval = setInterval(() => {
    waitSeconds--;

    const m = Math.floor(waitSeconds / 60);
    const s = waitSeconds % 60;

    timerEl.innerText =
      `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    if (waitSeconds <= 0) {
      stopTimer();
      hideEl(btnNoShow);
    }
  }, 1000);
}

/* ===============================
   RESET BUTTONS
================================ */
function resetButtons() {
  hideEl(btnGo);
  hideEl(btnArrived);
  hideEl(btnStart);
  hideEl(btnNoShow);
  hideEl(btnDropoff);
  hideEl(noShowBox);
  hideEl(timerEl);
  stopTimer();
}

/* ===============================
   BUTTON EVENTS
================================ */
if (btnGo) {
  btnGo.onclick = () => {
    hideEl(btnGo);
    showEl(btnArrived);
  };
}

if (btnArrived) {
  btnArrived.onclick = () => {
    hideEl(btnArrived);
    showEl(btnStart);
    showEl(btnNoShow);
    startTimer();
  };
}

if (btnStart) {
  btnStart.onclick = () => {
    hideEl(btnStart);
    hideEl(btnNoShow);
    hideEl(noShowBox);
    hideEl(timerEl);
    stopTimer();

    showEl(btnDropoff);

    routeMode = "dropoff";
  };
}

if (btnDropoff) {
  btnDropoff.onclick = () => {
    alert("Trip Completed");
    resetButtons();
    clearRoute();
  };
}

if (btnNoShow) {
  btnNoShow.onclick = () => {
    showEl(noShowBox, "flex");
  };
}

if (btnCompleteNoShow) {
  btnCompleteNoShow.onclick = () => {
    const notes = noShowNotes ? noShowNotes.value.trim() : "";

    if (!notes) {
      alert("Enter reason");
      return;
    }

    alert("No Show Completed");

    if (noShowNotes) {
      noShowNotes.value = "";
    }

    hideEl(noShowBox);
    resetButtons();
    clearRoute();
  };
}

/* ===============================
   INIT UI
================================ */
resetButtons();

/* ===============================
   GPS TRACKING
================================ */
let lastRouteUpdate = 0;
const ROUTE_UPDATE_MS = 8000;

navigator.geolocation.watchPosition(
  (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    /* DRIVER MARKER */
    if (!driverMarker) {
      driverMarker = L.marker([lat, lng]).addTo(map);
    } else {
      driverMarker.setLatLng([lat, lng]);
    }

    /* SAVE FOR OTHER PAGES / BUTTONS */
    window.driverLat = lat;
    window.driverLng = lng;
    window.currentPos = { lat, lng };

    /* KEEP MAP CENTERED */
    map.setView([lat, lng], 15);

    /* SEND LOCATION TO SERVER */
    sendLocation(lat, lng);

    /* DISTANCES */
    const dPickup = hasPickup
      ? distanceMiles(lat, lng, pickupLat, pickupLng)
      : Infinity;

    const dDrop = hasDropoff
      ? distanceMiles(lat, lng, dropLat, dropLng)
      : Infinity;

    /* DRAW ROUTE – NOT EVERY SECOND */
    const now = Date.now();

    if (routeMode === "pickup" && hasPickup && (now - lastRouteUpdate > ROUTE_UPDATE_MS || !routeControl)) {
      drawRoute(lat, lng, pickupLat, pickupLng);
      lastRouteUpdate = now;
    }

    if (routeMode === "dropoff" && hasDropoff && (now - lastRouteUpdate > ROUTE_UPDATE_MS || !routeControl)) {
      drawRoute(lat, lng, dropLat, dropLng);
      lastRouteUpdate = now;
    }

    /* POLICY */
    if (routeMode === "pickup") {
      if (dPickup > 2) {
        hideEl(btnGo);
        hideEl(btnArrived);
      }

      if (dPickup <= 2 && dPickup > 0.1) {
        showEl(btnGo);
        hideEl(btnArrived);
      }

      if (dPickup <= 0.1) {
        hideEl(btnGo);
        showEl(btnArrived);
      }
    }

    if (routeMode === "dropoff") {
      if (dDrop <= 0.1 && btnDropoff) {
        btnDropoff.classList.add("enabled");
      } else if (btnDropoff) {
        btnDropoff.classList.remove("enabled");
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