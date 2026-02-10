// =======================
// AUTH
// =======================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "../login.html";
const driver = JSON.parse(rawDriver);

// =======================
// TRIP DATA (SAMPLE)
// =======================
const tripId = 1;

const pickup = { lat: 33.3528, lng: -111.7890 };
const dropoff = { lat: 33.3700, lng: -111.8200 };

// =======================
// MAP INIT
// =======================
const map = L.map("map").setView(pickup, 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

let driverPos = null;
let driverMarker = L.marker(pickup).addTo(map);
let routeLine = null;

let stage = "TO_PICKUP"; 
// TO_PICKUP | ARRIVED | ON_TRIP | COMPLETED

// =======================
// UI ELEMENTS
// =======================
const goPickupBtn = document.getElementById("goPickupBtn");
const arrivedBtn = document.getElementById("arrivedBtn");
const startTripBtn = document.getElementById("startTripBtn");
const noShowBtn = document.getElementById("noShowBtn");
const dropoffBtn = document.getElementById("dropoffBtn");
const openGoogleBtn = document.getElementById("openGoogleBtn");
const timerBox = document.getElementById("timer");

// =======================
// DISTANCE (Miles)
// =======================
function distanceMiles(a, b) {
  const R = 3958.8;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

// =======================
// ROUTE DRAW
// =======================
async function drawRoute(from, to) {
  if (routeLine) map.removeLayer(routeLine);

  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();

  routeLine = L.geoJSON(data.routes[0].geometry, {
    style: { color: "#2563eb", weight: 5 }
  }).addTo(map);

  map.fitBounds(routeLine.getBounds());
}

// =======================
// UI RESET
// =======================
function hideAllButtons() {
  goPickupBtn.classList.add("hidden");
  arrivedBtn.classList.add("hidden");
  startTripBtn.classList.add("hidden");
  noShowBtn.classList.add("hidden");
  dropoffBtn.classList.add("hidden");
}

// =======================
// LIVE LOCATION
// =======================
navigator.geolocation.watchPosition(pos => {
  driverPos = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude
  };

  driverMarker.setLatLng(driverPos);

  // 🔴 SEND LOCATION TO SERVER
  fetch("/api/driver/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverId: driver.id,
      tripId,
      lat: driverPos.lat,
      lng: driverPos.lng
    })
  });

  hideAllButtons();

  // =======================
  // LOGIC
  // =======================
  if (stage === "TO_PICKUP") {
    const dist = distanceMiles(driverPos, pickup);

    if (dist > 1) {
      goPickupBtn.classList.remove("hidden");
    } else {
      arrivedBtn.classList.remove("hidden");
    }
  }

  if (stage === "ON_TRIP") {
    const dist = distanceMiles(driverPos, dropoff);
    if (dist <= 2) {
      dropoffBtn.classList.remove("hidden");
    }
  }
});

// =======================
// BUTTON ACTIONS
// =======================
goPickupBtn.onclick = async () => {
  if (!driverPos) return;
  await drawRoute(driverPos, pickup);
};

openGoogleBtn.onclick = () => {
  if (!driverPos) return;
  const target = stage === "ON_TRIP" ? dropoff : pickup;
  const url = `https://www.google.com/maps/dir/?api=1&origin=${driverPos.lat},${driverPos.lng}&destination=${target.lat},${target.lng}&travelmode=driving`;
  window.open(url, "_blank");
};

arrivedBtn.onclick = () => {
  stage = "ARRIVED";
  arrivedBtn.classList.add("hidden");
  startTripBtn.classList.remove("hidden");
  noShowBtn.classList.remove("hidden");
  startTimer();
};

startTripBtn.onclick = async () => {
  stage = "ON_TRIP";
  clearInterval(timer);
  timerBox.style.display = "none";
  startTripBtn.classList.add("hidden");
  noShowBtn.classList.add("hidden");
  await drawRoute(driverPos, dropoff);
};

dropoffBtn.onclick = () => {
  stage = "COMPLETED";
  alert("Trip Completed");
  dropoffBtn.classList.add("hidden");
};

// =======================
// TIMER (20 MIN)
// =======================
let timer;
function startTimer() {
  let time = 20 * 60;
  timerBox.style.display = "block";

  timer = setInterval(() => {
    time--;
    const m = Math.floor(time / 60);
    const s = time % 60;
    timerBox.innerText = `${m}:${s.toString().padStart(2, "0")}`;

    if (time <= 0) clearInterval(timer);
  }, 1000);
}

noShowBtn.onclick = () => {
  clearInterval(timer);
  const note = prompt("Enter No Show Note:");
  if (note !== null) {
    alert("No Show Completed");
    stage = "COMPLETED";
  }
};