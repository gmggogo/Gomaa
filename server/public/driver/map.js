// =======================
// AUTH
// =======================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "../login.html";
const driver = JSON.parse(rawDriver);

// =======================
// MAP SETUP
// =======================
let map, driverMarker, routeLine = null;
let driverPos = null;

// =======================
// UI
// =======================
const goPickupBtn  = document.getElementById("goPickupBtn");
const arrivedBtn   = document.getElementById("arrivedBtn");
const startTripBtn = document.getElementById("startTripBtn");
const noShowBtn    = document.getElementById("noShowBtn");
const dropoffBtn   = document.getElementById("dropoffBtn");
const openGoogleBtn= document.getElementById("openGoogleBtn");
const timerBox     = document.getElementById("timer");

// =======================
// TRIP STATE
// =======================
let activeTrip = null;
let currentStage = "idle"; // idle | toPickup | waiting | toDropoff

// =======================
// INIT MAP (دايمًا)
// =======================
function initMap(lat, lng) {
  map = L.map("map").setView([lat, lng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map);

  driverMarker = L.marker([lat, lng]).addTo(map);
}

// =======================
// GPS TRACKING (دايمًا)
// =======================
navigator.geolocation.watchPosition(
  pos => {
    driverPos = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    };

    if (!map) initMap(driverPos.lat, driverPos.lng);

    driverMarker.setLatLng(driverPos);

    // ابعت موقع السواق
    fetch("/api/driver/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverId: driver.id,
        lat: driverPos.lat,
        lng: driverPos.lng
      })
    });

    if (activeTrip) handleTripLogic();
  },
  err => alert("Please enable GPS"),
  { enableHighAccuracy: true }
);

// =======================
// CHECK ACTIVE TRIP
// =======================
setInterval(loadActiveTrip, 5000);

async function loadActiveTrip() {
  const res = await fetch(`/api/driver/active-trip/${driver.id}`);
  const data = await res.json();

  if (!data || !data.id) {
    activeTrip = null;
    currentStage = "idle";
    hideAllButtons();
    clearRoute();
    return;
  }

  activeTrip = data;
  if (currentStage === "idle") currentStage = "toPickup";
}

// =======================
// DISTANCE
// =======================
function miles(a, b) {
  const R = 3958.8;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;

  const x =
    Math.sin(dLat/2)**2 +
    Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

// =======================
// ROUTE
// =======================
async function drawRoute(from, to) {
  if (routeLine) map.removeLayer(routeLine);

  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const r = await fetch(url);
  const d = await r.json();

  routeLine = L.geoJSON(d.routes[0].geometry, {
    style: { color: "#2563eb", weight: 5 }
  }).addTo(map);

  map.fitBounds(routeLine.getBounds());
}

function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
}

// =======================
// TRIP LOGIC (Uber Style)
// =======================
function handleTripLogic() {
  const pickup = activeTrip.pickup;
  const dropoff = activeTrip.dropoff;

  hideAllButtons();

  if (currentStage === "toPickup") {
    const d = miles(driverPos, pickup);

    if (d > 1) {
      goPickupBtn.classList.remove("hidden");
    } else {
      arrivedBtn.classList.remove("hidden");
    }
  }

  if (currentStage === "waiting") {
    startTripBtn.classList.remove("hidden");
    noShowBtn.classList.remove("hidden");
  }

  if (currentStage === "toDropoff") {
    const d = miles(driverPos, dropoff);
    if (d <= 2) dropoffBtn.classList.remove("hidden");
  }
}

// =======================
// BUTTONS
// =======================
goPickupBtn.onclick = async () => {
  currentStage = "toPickup";
  await drawRoute(driverPos, activeTrip.pickup);
};

arrivedBtn.onclick = () => {
  currentStage = "waiting";
  startTimer();
};

startTripBtn.onclick = async () => {
  currentStage = "toDropoff";
  stopTimer();
  await drawRoute(driverPos, activeTrip.dropoff);
};

dropoffBtn.onclick = () => {
  alert("Trip Completed");
  activeTrip = null;
  currentStage = "idle";
  hideAllButtons();
  clearRoute();
};

noShowBtn.onclick = () => {
  stopTimer();
  const note = prompt("Enter No Show Note");
  if (note !== null) alert("No Show Completed");
};

openGoogleBtn.onclick = () => {
  if (!driverPos) return;
  const target = activeTrip
    ? (currentStage === "toDropoff" ? activeTrip.dropoff : activeTrip.pickup)
    : driverPos;

  const url = `https://www.google.com/maps/dir/?api=1&origin=${driverPos.lat},${driverPos.lng}&destination=${target.lat},${target.lng}&travelmode=driving`;
  window.open(url, "_blank");
};

// =======================
// TIMER
// =======================
let timer;
function startTimer() {
  let t = 20 * 60;
  timerBox.style.display = "block";

  timer = setInterval(() => {
    t--;
    timerBox.innerText =
      `${Math.floor(t/60)}:${(t%60).toString().padStart(2,"0")}`;
    if (t <= 0) clearInterval(timer);
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
  timerBox.style.display = "none";
}

// =======================
function hideAllButtons() {
  goPickupBtn.classList.add("hidden");
  arrivedBtn.classList.add("hidden");
  startTripBtn.classList.add("hidden");
  noShowBtn.classList.add("hidden");
  dropoffBtn.classList.add("hidden");
}