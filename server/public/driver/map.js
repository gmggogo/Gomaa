// =======================
// AUTH
// =======================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "../login.html";
const driver = JSON.parse(rawDriver);

// =======================
// SAMPLE TRIP
// =======================
const tripId = 1;
const pickup = { lat: 33.3528, lng: -111.7890 };
const dropoff = { lat: 33.3700, lng: -111.8200 };

// =======================
// MAP INIT (SAFE)
// =======================
const map = L.map("map").setView(pickup, 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ⚠️ مهم للموبايل
setTimeout(() => {
  map.invalidateSize();
}, 300);

let driverPos = null;
let driverMarker = L.marker(pickup).addTo(map);
let routeLine = null;
let currentRoute = "pickup";

// =======================
// UI
// =======================
const goPickupBtn = document.getElementById("goPickupBtn");
const arrivedBtn = document.getElementById("arrivedBtn");
const startTripBtn = document.getElementById("startTripBtn");
const noShowBtn = document.getElementById("noShowBtn");
const dropoffBtn = document.getElementById("dropoffBtn");
const openGoogleBtn = document.getElementById("openGoogleBtn");
const timerBox = document.getElementById("timer");

// =======================
// DISTANCE
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
// ROUTE
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
// LOCATION (MOBILE SAFE)
// =======================
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    pos => {
      driverPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      driverMarker.setLatLng(driverPos);

      const target = currentRoute === "pickup" ? pickup : dropoff;
      const dist = distanceMiles(driverPos, target);

      if (currentRoute === "pickup") {
        if (dist > 1) {
          goPickupBtn.classList.remove("hidden");
          arrivedBtn.classList.add("hidden");
        } else {
          goPickupBtn.classList.add("hidden");
          arrivedBtn.classList.remove("hidden");
        }
      }

      if (currentRoute === "dropoff") {
        dropoffBtn.classList.toggle("hidden", dist > 2);
      }
    },
    err => {
      console.warn("GPS ERROR", err);
      // fallback
      driverPos = pickup;
      driverMarker.setLatLng(pickup);
    },
    { enableHighAccuracy: true }
  );
} else {
  alert("Location not supported");
}

// =======================
// BUTTONS
// =======================
goPickupBtn.onclick = async () => {
  await drawRoute(driverPos || pickup, pickup);
};

openGoogleBtn.onclick = () => {
  const target = currentRoute === "pickup" ? pickup : dropoff;
  const url = `https://www.google.com/maps/dir/?api=1&origin=${driverPos.lat},${driverPos.lng}&destination=${target.lat},${target.lng}`;
  window.open(url, "_blank");
};

arrivedBtn.onclick = () => {
  arrivedBtn.classList.add("hidden");
  startTripBtn.classList.remove("hidden");
  noShowBtn.classList.remove("hidden");
  startTimer();
};

startTripBtn.onclick = () => {
  currentRoute = "dropoff";
  startTripBtn.classList.add("hidden");
  noShowBtn.classList.add("hidden");
  drawRoute(driverPos, dropoff);
};

dropoffBtn.onclick = () => {
  alert("Trip Completed");
};

// =======================
// TIMER
// =======================
let timer;
function startTimer() {
  let time = 20 * 60;
  timerBox.style.display = "block";

  timer = setInterval(() => {
    time--;
    timerBox.innerText =
      `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;

    if (time <= 0) clearInterval(timer);
  }, 1000);
}

noShowBtn.onclick = () => {
  clearInterval(timer);
  const note = prompt("Enter No Show Note:");
  if (note) alert("No Show Completed");
};