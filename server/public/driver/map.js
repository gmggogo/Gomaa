// =======================
// AUTH
// =======================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) {
  location.href = "../login.html";
}
const driver = JSON.parse(rawDriver);

// =======================
// MAP VARS
// =======================
let map;
let driverMarker;
let routeLine;
let watchId;

let pickup = null;
let dropoff = null;
let tripId = null;

let currentRoute = "pickup";

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
// GET ACTIVE TRIP
// =======================
async function loadActiveTrip() {
  try {
    const res = await fetch(`/api/driver/active-trip?driverId=${driver.id}`);
    if (!res.ok) throw new Error("No active trip");

    const trip = await res.json();

    if (!trip) {
      alert("No active trip assigned");
      return;
    }

    tripId = trip.id;
    pickup = trip.pickup;
    dropoff = trip.dropoff;

    initMap();
    startTracking();

  } catch (err) {
    alert("No active trip for this driver");
  }
}

// =======================
// MAP INIT
// =======================
function initMap() {
  map = L.map("map").setView([pickup.lat, pickup.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map);

  L.marker([pickup.lat, pickup.lng]).addTo(map).bindPopup("Pickup");
  L.marker([dropoff.lat, dropoff.lng]).addTo(map).bindPopup("Dropoff");
}

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
// DRAW ROUTE
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
// LIVE LOCATION
// =======================
function startTracking() {
  watchId = navigator.geolocation.watchPosition(pos => {

    const driverPos = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    };

    if (!driverMarker) {
      driverMarker = L.marker([driverPos.lat, driverPos.lng]).addTo(map);
    } else {
      driverMarker.setLatLng([driverPos.lat, driverPos.lng]);
    }

    // send to admin / dispatcher
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

    const target = currentRoute === "pickup" ? pickup : dropoff;
    const dist = distanceMiles(driverPos, target);

    // ================= UI LOGIC =================
    if (currentRoute === "pickup") {

      if (dist > 1) {
        goPickupBtn.classList.remove("hidden");
        arrivedBtn.classList.add("hidden");
      }

      if (dist <= 1) {
        goPickupBtn.classList.add("hidden");
        arrivedBtn.classList.remove("hidden");
      }
    }

    if (currentRoute === "dropoff") {
      if (dist <= 2) dropoffBtn.classList.remove("hidden");
      else dropoffBtn.classList.add("hidden");
    }

  }, err => {
    alert("Location permission required");
  }, { enableHighAccuracy: true });
}

// =======================
// BUTTONS
// =======================
goPickupBtn.onclick = async () => {
  currentRoute = "pickup";
  navigator.geolocation.getCurrentPosition(pos => {
    drawRoute(
      { lat: pos.coords.latitude, lng: pos.coords.longitude },
      pickup
    );
  });
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

  navigator.geolocation.getCurrentPosition(pos => {
    drawRoute(
      { lat: pos.coords.latitude, lng: pos.coords.longitude },
      dropoff
    );
  });
};

dropoffBtn.onclick = () => {
  alert("Trip Completed");
  dropoffBtn.classList.add("hidden");
};

openGoogleBtn.onclick = () => {
  const target = currentRoute === "pickup" ? pickup : dropoff;
  navigator.geolocation.getCurrentPosition(pos => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${pos.coords.latitude},${pos.coords.longitude}&destination=${target.lat},${target.lng}`;
    window.open(url, "_blank");
  });
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
    const m = Math.floor(time / 60);
    const s = time % 60;
    timerBox.innerText = `${m}:${s.toString().padStart(2, "0")}`;
    if (time <= 0) clearInterval(timer);
  }, 1000);
}

noShowBtn.onclick = () => {
  clearInterval(timer);
  const note = prompt("Enter No Show Note");
  if (note) alert("No Show Completed");
};

// =======================
// START
// =======================
loadActiveTrip();