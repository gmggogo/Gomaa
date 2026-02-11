// ===============================
// AUTH CHECK (DRIVER)
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "/driver/login.html";

let driver = {};
try {
  driver = JSON.parse(rawDriver);
} catch {
  location.href = "/driver/login.html";
}

const DRIVER_NAME = driver.name || driver.username || "Driver";

// ===============================
// MAP INIT (UBER STYLE)
// ===============================
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false
}).setView([0, 0], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ===============================
// DRIVER MARKER
// ===============================
let driverMarker = null;
let firstFix = true;

// ===============================
// SAVE LIVE LOCATION (ADMIN SOURCE)
// ===============================
function saveLiveLocation(lat, lng){
  let liveDrivers = {};

  try {
    liveDrivers = JSON.parse(
      localStorage.getItem("driversLive") || "{}"
    );
  } catch {
    liveDrivers = {};
  }

  liveDrivers[DRIVER_NAME] = {
    name: DRIVER_NAME,
    lat: lat,
    lng: lng,
    updated: Date.now()
  };

  localStorage.setItem(
    "driversLive",
    JSON.stringify(liveDrivers)
  );
}

// ===============================
// GPS TRACKING (REAL)
// ===============================
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Marker create / update
      if (!driverMarker) {
        driverMarker = L.marker([lat, lng]).addTo(map);
      } else {
        driverMarker.setLatLng([lat, lng]);
      }

      // First fix فقط (زي Uber)
      if (firstFix) {
        map.setView([lat, lng], 16);
        firstFix = false;
      }

      // 🔗 الربط مع Admin Map
      saveLiveLocation(lat, lng);
    },
    err => {
      console.error("GPS error:", err);
      alert("Please enable location services");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
} else {
  alert("Geolocation not supported");
}