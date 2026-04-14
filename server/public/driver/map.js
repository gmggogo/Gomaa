/* =====================================================
   SUNBEAM DRIVER MAP – FINAL PROFESSIONAL
===================================================== */

console.log("Sunbeam driver map final loaded");

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
const btnCallClient = document.getElementById("btnCallClient");

const waitTimerEl = document.getElementById("waitTimer");
const noShowBox = document.getElementById("noShowBox");
const noShowNotes = document.getElementById("noShowNotes");
const btnCompleteNoShow = document.getElementById("btnCompleteNoShow");

const clientDecisionBox = document.getElementById("clientDecisionBox");
const btnDismissCall = document.getElementById("btnDismissCall");

const navHome = document.getElementById("navHome");
const navTrips = document.getElementById("navTrips");
const navMap = document.getElementById("navMap");
const navChat = document.getElementById("navChat");
const navLogout = document.getElementById("navLogout");

/* ===============================
   PAGE DATA
================================ */
const urlParams = new URLSearchParams(window.location.search);
const TRIP_ID = String(urlParams.get("tripId") || "");

let tripDoc = null;
let tripTimeStr = "";
let clientPhone = "";

let pickupLat = null;
let pickupLng = null;
let dropLat = null;
let dropLng = null;

let hasPickup = false;
let hasDropoff = false;

/* ===============================
   UI HELPERS
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

function resetCallBox() {
  hideEl(clientDecisionBox);
}

function hideActionButtons() {
  hideEl(btnGoPickup);
  hideEl(btnArrived);
  hideEl(btnStart);
  hideEl(btnComplete);
  hideEl(btnNoShow);
  hideEl(btnCallClient);
}

function finishUi() {
  hideActionButtons();
  resetNoShowBox();
  resetCallBox();
  stopTimer();
  clearRoute();
  hideETA();
}

setNavText("Loading trip...");

/* ===============================
   TIME LOGIC
================================ */
function getTripDateTime() {
  if (!tripDoc) return null;

  if (tripDoc.tripDate && tripDoc.tripTime) {
    const d = new Date(`${tripDoc.tripDate}T${tripDoc.tripTime}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (tripTimeStr) {
    const d = new Date(tripTimeStr);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function isTripTimeStarted() {
  const tripDate = getTripDateTime();
  if (!tripDate) return true;
  return new Date() >= tripDate;
}

/* ===============================
   MAP / STATE
================================ */
let map = null;
let driverMarker = null;
let pickupMarker = null;
let dropoffMarker = null;

let driverLat = null;
let driverLng = null;
let firstFix = true;

let routeControl = null;
let routeMode = "pickup"; // pickup | dropoff
let lastRouteRefresh = 0;
const ROUTE_REFRESH_MS = 4000;

let arrived = false;
let started = false;
let completed = false;
let noShowDone = false;
let calledClient = false;
let autoArrivedDone = false;

/* ===============================
   TIMER
================================ */
let waitInterval = null;
let waitSeconds = 900;
let tripTimeWatcher = null;

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
  if (!waitTimerEl || waitInterval) return;

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
      clearInterval(waitInterval);
      waitInterval = null;
      waitTimerEl.innerText = "TIME UP";

      hideEl(btnStart);
      hideEl(btnNoShow);
      showEl(btnCallClient);
      setNavText("Call client now");
    }
  }, 1000);
}

function watchTripTimeThenStartTimer() {
  if (tripTimeWatcher) clearInterval(tripTimeWatcher);

  tripTimeWatcher = setInterval(() => {
    if (completed || noShowDone || started) {
      clearInterval(tripTimeWatcher);
      tripTimeWatcher = null;
      return;
    }

    if (arrived && isTripTimeStarted() && !waitInterval) {
      clearInterval(tripTimeWatcher);
      tripTimeWatcher = null;
      setNavText("Waiting for passenger");
      startTimer();
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
  if (!map) return;

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
  if (routeControl && map) {
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

  const routeColor = routeMode === "pickup" ? "#2563eb" : "#16a34a";

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
            color: "#ffffff",
            weight: 10,
            opacity: 0.35
          },
          {
            color: routeColor,
            weight: 6,
            opacity: 0.98
          }
        ]
      }
    })
    .on("routesfound", updateRouteEtaFromEvent)
    .addTo(map);
  } else {
    routeControl.options.lineOptions.styles = [
      {
        color: "#ffffff",
        weight: 10,
        opacity: 0.35
      },
      {
        color: routeColor,
        weight: 6,
        opacity: 0.98
      }
    ];

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

async function fetchTrip() {
  if (!TRIP_ID) {
    alert("No trip found");
    window.location.href = "/driver/trips.html";
    return null;
  }

  try {
    const res = await fetch(`/api/trips/${TRIP_ID}`);
    if (!res.ok) throw new Error("Trip not found");

    const t = await res.json();
    return t;
  } catch (err) {
    console.log("fetchTrip error:", err);
    alert("Error loading trip");
    window.location.href = "/driver/trips.html";
    return null;
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
   FLOW LOGIC
================================ */
function autoArriveFlow() {
  if (autoArrivedDone || arrived || completed || noShowDone) return;

  autoArrivedDone = true;
  arrived = true;

  hideEl(btnGoogle);
  hideEl(btnGoPickup);
  hideEl(btnArrived);

  showEl(btnStart);
  showEl(btnNoShow);

  setNavText(isTripTimeStarted() ? "Waiting for passenger" : "Waiting until trip time");

  updateTripStatus("Arrived");

  if (isTripTimeStarted()) {
    startTimer();
  } else {
    watchTripTimeThenStartTimer();
  }
}

function showNoShowForm() {
  hideEl(btnStart);
  hideEl(btnNoShow);
  hideEl(btnCallClient);
  showEl(noShowBox, "flex");
  showEl(btnComplete);
  setNavText("Enter no show reason");
}

function afterClientCalled() {
  hideEl(btnCallClient);
  showEl(clientDecisionBox, "flex");
  showEl(btnStart);
  showEl(btnNoShow);
  setNavText("Client contacted. Choose action");
}

/* ===============================
   BUTTON FLOW
================================ */
btnGoogle.onclick = openGoogleMaps;

btnGoPickup.onclick = () => {
  hideEl(btnGoPickup);
  showEl(btnArrived);
  setNavText("Go to pickup");
};

btnArrived.onclick = async () => {
  if (completed || noShowDone) return;

  arrived = true;

  hideEl(btnGoogle);
  hideEl(btnGoPickup);
  hideEl(btnArrived);

  showEl(btnStart);
  showEl(btnNoShow);

  if (isTripTimeStarted()) {
    startTimer();
    setNavText("Waiting for passenger");
  } else {
    setNavText("Waiting until trip time");
    watchTripTimeThenStartTimer();
  }

  await updateTripStatus("Arrived");
};

btnNoShow.onclick = () => {
  if (completed || noShowDone) return;
  showNoShowForm();
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

  finishUi();
  setNavText("No show completed");
  alert("No Show Completed");
  window.location.href = "/driver/trips.html";
};

btnStart.onclick = async () => {
  if (completed || noShowDone) return;

  started = true;
  routeMode = "dropoff";

  hideEl(btnStart);
  hideEl(btnNoShow);
  hideEl(btnCallClient);
  hideEl(clientDecisionBox);
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

btnCallClient.onclick = () => {
  if (!clientPhone) {
    alert("Client phone not found");
    return;
  }

  calledClient = true;
  window.location.href = `tel:${clientPhone}`;
  afterClientCalled();
};

btnDismissCall.onclick = () => {
  hideEl(clientDecisionBox);
  showEl(btnStart);
  showEl(btnNoShow);
  setNavText("Choose action");
};

btnComplete.onclick = async () => {
  if (started) {
    if (!btnComplete.classList.contains("enabled")) {
      alert("You must be near the dropoff location first");
      return;
    }

    completed = true;
    await updateTripStatus("Completed");
    finishUi();
    setNavText("Trip completed");
    alert("Trip Completed");
    window.location.href = "/driver/trips.html";
    return;
  }

  const reason = (noShowNotes?.value || "").trim();
  if (!reason) {
    alert("Please enter reason");
    return;
  }

  noShowDone = true;

  await updateTripStatus("NoShow", {
    noShowReason: reason
  });

  finishUi();
  setNavText("No show completed");
  alert("No Show Completed");
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
        } else if (map) {
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

      if (!arrived && routeMode === "pickup") {
        hideEl(btnStart);
        hideEl(btnNoShow);
        hideEl(btnComplete);
        hideEl(btnCallClient);
        resetCallBox();
        resetNoShowBox();

        showEl(btnGoogle);

        if (dPickup > 1) {
          showEl(btnGoPickup);
          hideEl(btnArrived);
          setNavText("Go to pickup");
        } else {
          hideEl(btnGoPickup);
          showEl(btnArrived);
          setNavText("Near pickup");
          autoArriveFlow();
        }
      }

      if (arrived && !started && !completed && !noShowDone) {
        hideEl(btnGoPickup);
        hideEl(btnArrived);
        hideEl(btnGoogle);
        hideEl(btnComplete);

        if (!calledClient && !noShowBox.style.display.includes("flex")) {
          showEl(btnStart);
          showEl(btnNoShow);
        }

        if (waitInterval) {
          setNavText("Waiting for passenger");
        }
      }

      if (started && routeMode === "dropoff" && !completed && !noShowDone) {
        hideEl(btnGoPickup);
        hideEl(btnArrived);
        hideEl(btnStart);
        hideEl(btnNoShow);
        hideEl(btnCallClient);
        resetCallBox();
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
   INIT MAP
================================ */
function initMap() {
  const defaultCenter = hasPickup ? [pickupLat, pickupLng] : [33.4484, -112.0740];

  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView(defaultCenter, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map);

  setTimeout(() => {
    try { map.invalidateSize(); } catch (e) {}
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

  setNavText("Waiting for GPS...");
  startGpsWatch();
}

/* ===============================
   LOAD EVERYTHING
================================ */
async function initPage() {
  tripDoc = await fetchTrip();
  if (!tripDoc) return;

  tripTimeStr = tripDoc.tripTime || "";
  clientPhone = tripDoc.clientPhone || "";

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
initPage();