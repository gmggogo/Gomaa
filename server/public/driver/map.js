console.log("driver/map.js loaded");

/* ===============================
   AUTH
=============================== */
const driver = JSON.parse(localStorage.getItem("loggedDriver"));
if (!driver) {
  alert("Driver not logged in");
  window.location.href = "login.html";
}

/* ===============================
   LOAD TRIP
=============================== */
const trip = JSON.parse(localStorage.getItem("currentTrip"));
if (!trip) {
  alert("No active trip");
  window.location.href = "trips.html";
}

/* ===============================
   MAP INIT
=============================== */
let map = L.map("map").setView([33.4484, -112.0740], 12); // Phoenix default

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

/* ===============================
   ICONS
=============================== */
const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/194/194640.png",
  iconSize: [32, 32]
});

const pickupIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [28, 28]
});

const stopIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149059.png",
  iconSize: [24, 24]
});

const dropoffIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [28, 28]
});

/* ===============================
   MARKERS
=============================== */
let driverMarker = null;

/* ===============================
   GEOCODE (NOMINATIM)
=============================== */
async function geocode(address) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&q=" +
    encodeURIComponent(address);

  const res = await fetch(url);
  const data = await res.json();
  if (!data.length) return null;

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon)
  };
}

/* ===============================
   DRAW TRIP
=============================== */
async function drawTrip() {
  const points = [];

  // Pickup
  if (trip.pickup) {
    const p = await geocode(trip.pickup);
    if (p) {
      L.marker([p.lat, p.lng], { icon: pickupIcon })
        .addTo(map)
        .bindPopup("Pickup");
      points.push([p.lat, p.lng]);
    }
  }

  // Stops
  if (Array.isArray(trip.stops)) {
    for (let s of trip.stops) {
      const p = await geocode(s);
      if (p) {
        L.marker([p.lat, p.lng], { icon: stopIcon })
          .addTo(map)
          .bindPopup("Stop");
        points.push([p.lat, p.lng]);
      }
    }
  }

  // Dropoff
  if (trip.dropoff) {
    const p = await geocode(trip.dropoff);
    if (p) {
      L.marker([p.lat, p.lng], { icon: dropoffIcon })
        .addTo(map)
        .bindPopup("Dropoff");
      points.push([p.lat, p.lng]);
    }
  }

  if (points.length) {
    map.fitBounds(points);
    L.polyline(points, { color: "blue" }).addTo(map);
  }
}

/* ===============================
   DRIVER LIVE LOCATION
=============================== */
function startTracking() {
  if (!navigator.geolocation) {
    alert("GPS not supported");
    return;
  }

  setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!driverMarker) {
          driverMarker = L.marker([lat, lng], { icon: driverIcon })
            .addTo(map)
            .bindPopup("You");
        } else {
          driverMarker.setLatLng([lat, lng]);
        }

        // save location for admin / dispatch
        localStorage.setItem(
          "driverLocation_" + driver.id,
          JSON.stringify({
            driverId: driver.id,
            name: driver.name,
            lat,
            lng,
            updatedAt: Date.now()
          })
        );
      },
      err => console.error(err),
      { enableHighAccuracy: true }
    );
  }, 10000); // كل 10 ثواني
}

/* ===============================
   INIT
=============================== */
drawTrip();
startTracking();