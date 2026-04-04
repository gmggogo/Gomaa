/* =====================================================
   SUNBEAM DRIVER MAP – COMPLETE
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
  console.log("Driver parse error:", err);
  location.href = "/driver/login.html";
}

const DRIVER_ID = String(driver._id || driver.id || "");
const DRIVER_NAME = driver.name || driver.username || "Driver";

/* ===============================
   DOM
================================ */
const mapEl = document.getElementById("map");
if (!mapEl) throw new Error("Map element not found");

const driverNameEl = document.getElementById("driverName");
const datetimeEl = document.getElementById("datetime");
const navTextEl = document.getElementById("navText");

const etaBox = document.getElementById("etaBox");
const etaTimeEl = document.getElementById("etaTime");
const etaDistanceEl = document.getElementById("etaDistance");

const btnGoogle = document.getElementById("btnGoogle");
const btnGoPickup = document.getElementById("btnGoPickup");
const btnArrived = document.getElementById("btnArrived");
const btnStart = document.getElementById("btnStart");
const btnComplete = document.getElementById("btnComplete");
const btnNoShow = document.getElementById("btnNoShow");

const waitTimerEl = document.getElementById("waitTimer");
const noShowBox = document.getElementById("noShowBox");
const noShowNotes = document.getElementById("noShowNotes");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");

const navHome = document.getElementById("navHome");
const navTrips = document.getElementById("navTrips");
const navMap = document.getElementById("navMap");
const navChat = document.getElementById("navChat");
const navLogout = document.getElementById("navLogout");

/* ===============================
   PAGE DATA
================================ */
const TRIP_ID = String(mapEl.dataset.tripId || "");
const tripTimeStr = String(mapEl.dataset.tripTime || "");

const pickupLat = parseFloat(mapEl.dataset.pickupLat);
const pickupLng = parseFloat(mapEl.dataset.pickupLng);
const dropLat = parseFloat(mapEl.dataset.dropoffLat);
const dropLng = parseFloat(mapEl.dataset.dropoffLng);

const hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
const hasDropoff = Number.isFinite(dropLat) && Number.isFinite(dropLng);

/* ===============================
   UI INIT
================================ */
if (driverNameEl) {
  driverNameEl.innerText = DRIVER_NAME;
}

function updateTime() {
  if (!datetimeEl) return;
  datetimeEl.innerText = new Date().toLocaleString("en-US", {
    timeZone: "America/Phoenix"
  });
}
updateTime();
setInterval(updateTime, 1000);

function setNavText(text) {
  if (navTextEl) navTextEl.innerText = text;
}

function showEl(el, display = "block") {
  if (el) el.style.display = display;
}

function hideEl(el) {
  if (el) el.style.display = "none";
}

function showETA(timeMin, distanceMi) {
  if (!etaBox) return;
  etaTimeEl.innerText = `${timeMin} min`;
  etaDistanceEl.innerText = `${distanceMi} mi`;
  etaBox.style.display = "flex";
}

function hideETA() {
  if (etaBox) etaBox.style.display = "none";
}

function resetNoShowBox() {
  hideEl(noShowBox);
  if (noShowNotes) noShowNotes.value = "";
}

function resetMainButtons() {
  hideEl(btnGoPickup);
  hideEl(btnArrived);
  hideEl(btnStart);
  hideEl(btnComplete);
  hideEl(btnNoShow);
  hideEl(btnGoogle);
  resetNoShowBox();
}

function fullUiResetForFinish() {
  resetMainButtons();
  stopTimer();
  clearRoute();
}

setNavText("Waiting for GPS...");

/* ===============================
   TIME LOGIC
================================ */
function getTripDateTime() {
  if (!tripTimeStr) return null;
  const d = new Date(tripTimeStr);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isTripTimeStarted() {
  const tripDate = getTripDateTime();
  if (!tripDate) return true;
  return new Date() >= tripDate;
}

/* ===============================
   MAP INIT
================================ */
const defaultCenter = hasPickup ? [pickupLat, pickupLng] : [33.4484, -112.0740];

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView(defaultCenter, 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

setTimeout(() => {
  try { map.invalidateSize(); } catch (e) {}
}, 500);

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
   MARKERS
================================ */
let driverMarker = null;
let pickupMarker = null;
let dropoffMarker = null;

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

/* ===============================
   STATE
================================ */
let driverLat = null;
let driverLng = null;
let firstFix = true;

let routeControl = null;
let routeMode = "pickup"; // pickup | dropoff
let lastRouteRefresh = 0;
const ROUTE_REFRESH_MS = 2000;

let arrived = false;
let started = false;
let completed = false;
let noShowDone = false;

/* ===============================
   TIMER
================================ */
let waitInterval = null;
let waitSeconds = 900;

function stopTimer() {
  if (waitInterval) {
    clearInterval(waitInterval);
    waitInterval = null;
  }
  waitSeconds = 900;
  if (waitTimerEl) {
    waitTimerEl.innerText = "15:00";
    hideEl(waitTimerEl);
  }
}

function startTimer() {
  if (!waitTimerEl) return;

  stopTimer();
  waitSeconds = 900;
  waitTimerEl.innerText = "15:00";
  showEl(waitTimerEl);

  waitInterval = setInterval(() => {
    waitSeconds--;

    const m = Math.floor(waitSeconds / 60);
    const s = waitSeconds % 60;

    waitTimerEl.innerText =
      `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    if (waitSeconds <= 0) {
      stopTimer();
      hideEl(btnNoShow);
    }
  }, 1000);
}

/* ===============================
   HELPERS
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

function isNearTarget(distance, target = 0.1) {
  return Number.isFinite(distance) && distance <= target;
}

function fitMapToPoints(points) {
  const good = points.filter(
    p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  if (good.length < 2) return;

  const bounds = L.latLngBounds(good.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [34, 34] });
}

/* ===============================
   ROUTE
================================ */
function clearRoute() {
  if (routeControl) {
    try { map.removeControl(routeControl); } catch (e) {}
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

function drawRoute(fromLat, fromLng, toLat, toLng) {
  if (
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
      lineOptions: {
        styles: [
          {
            color: routeMode === "pickup" ? "#2563eb" : "#16a34a",
            weight: 6,
            opacity: 0.95
          }
        ]
      }
    })
    .on("routesfound", updateRouteEtaFromEvent)
    .addTo(map);
  } else {
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
  if (routeMode === "pickup" && hasPickup) {
    drawRoute(lat, lng, pickupLat, pickupLng);
    return;
  }

  if (routeMode === "dropoff" && hasDropoff) {
    drawRoute(lat, lng, dropLat, dropLng);
  }
}

/* ===============================
   API
================================ */
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
    console.log("updateTripStatus error:", err);
  }
}

/* ===============================
   GOOGLE MAPS
================================ */
function openGoogleMaps() {
  const lat = driverLat;
  const lng = driverLng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert("Waiting for GPS...");
    return;
  }

  let destination = "";

  if (routeMode === "dropoff" && hasDropoff) {
    destination = `${dropLat},${dropLng}`;
  } else if (hasPickup) {
    destination = `${pickupLat},${pickupLng}`;
  } else {
    alert("Trip destination not found");
    return;
  }

  const url =
    `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destination}&travelmode=driving`;

  window.open(url, "_blank");
}

/* ===============================
   BUTTONS FLOW
================================ */
btnGoogle.onclick = openGoogleMaps;

btnGoPickup.onclick = () => {
  hideEl(btnGoPickup);
  showEl(btnArrived);
  setNavText("Go to pickup");
};

btnArrived.onclick = async () => {
  if (completed || noShowDone) return;

  if (!isTripTimeStarted()) {
    alert("You cannot start waiting before trip time");
    return;
  }

  arrived = true;

  hideEl(btnGoPickup);
  hideEl(btnArrived);

  showEl(btnStart);
  showEl(btnNoShow);

  startTimer();
  setNavText("Waiting for passenger");

  await updateTripStatus("Arrived");
};

btnNoShow.onclick = () => {
  if (completed || noShowDone) return;
  showEl(noShowBox, "flex");
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

  fullUiResetForFinish();
  setNavText("No show completed");
  hideETA();
  alert("No Show Completed");
};

btnStart.onclick = async () => {
  if (completed || noShowDone) return;

  started = true;
  routeMode = "dropoff";

  hideEl(btnStart);
  hideEl(btnNoShow);
  resetNoShowBox();
  stopTimer();

  showEl(btnGoogle);
  setNavText("Go to dropoff");

  if (Number.isFinite(driverLat) && Number.isFinite(driverLng) && hasDropoff) {
    drawRouteFlow(driverLat, driverLng);
    lastRouteRefresh = Date.now();
  }

  await updateTripStatus("InProgress");
};

btnComplete.onclick = async () => {
  if (!btnComplete.classList.contains("enabled")) {
    alert("You must be near the dropoff location first");
    return;
  }

  completed = true;

  await updateTripStatus("Completed");

  fullUiResetForFinish();
  setNavText("Trip completed");
  hideETA();
  alert("Trip Completed");
};

/* ===============================
   GPS WATCH
================================ */
if (!navigator.geolocation) {
  alert("GPS not supported");
} else {
  navigator.geolocation.watchPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      driverLat = lat;
      driverLng = lng;
      window.driverLat = lat;
      window.driverLng = lng;

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
      if (!routeControl || now - lastRouteRefresh > ROUTE_REFRESH_MS) {
        drawRouteFlow(lat, lng);
        lastRouteRefresh = now;
      }

      const dPickup = hasPickup
        ? distanceMiles(lat, lng, pickupLat, pickupLng)
        : Infinity;

      const dDrop = hasDropoff
        ? distanceMiles(lat, lng, dropLat, dropLng)
        : Infinity;

      /* قبل الوصول للبيك أب */
      if (!arrived && routeMode === "pickup") {
        hideEl(btnStart);
        hideEl(btnNoShow);
        hideEl(btnGoogle);
        hideEl(btnComplete);
        resetNoShowBox();

        if (dPickup > 2) {
          hideEl(btnGoPickup);
          hideEl(btnArrived);
          setNavText("Go to pickup");
        } else if (dPickup > 0.1) {
          showEl(btnGoPickup);
          hideEl(btnArrived);
          setNavText("Go to pickup");
        } else {
          hideEl(btnGoPickup);
          showEl(btnArrived);
          setNavText("Press ARRIVED");
        }
      }

      /* بعد ARRIVED وقبل START */
      if (arrived && !started && !completed && !noShowDone) {
        hideEl(btnGoPickup);
        hideEl(btnArrived);
        hideEl(btnGoogle);
        hideEl(btnComplete);

        showEl(btnStart);
        if (waitInterval) showEl(btnNoShow);

        setNavText("Waiting for passenger");
      }

      /* بعد START */
      if (started && routeMode === "dropoff" && !completed && !noShowDone) {
        hideEl(btnGoPickup);
        hideEl(btnArrived);
        hideEl(btnStart);
        hideEl(btnNoShow);
        resetNoShowBox();

        showEl(btnGoogle);

        if (isNearTarget(dDrop, 0.1)) {
          showEl(btnComplete);
          btnComplete.classList.add("enabled");
          setNavText("Press COMPLETE");
        } else {
          hideEl(btnComplete);
          btnComplete.classList.remove("enabled");
          setNavText("Go to dropoff");
        }
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
   BOTTOM NAV
================================ */
navHome.onclick = () => {
  window.location.href = "/driver/dashboard.html";
};

navTrips.onclick = () => {
  window.location.href = "/driver/trips.html";
};

navMap.onclick = () => {
  window.location.href = "/driver/map.html";
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
   EXPOSE
================================ */
window.openGoogleMaps = openGoogleMaps;
window.updateTripStatus = updateTripStatus;