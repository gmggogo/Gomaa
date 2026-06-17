console.log("driver/location.js loaded");

const driver = JSON.parse(localStorage.getItem("loggedUser"));

if (!driver || driver.role !== "driver") return;

/* ===============================
   CONFIG
=============================== */

const API_URL = "/api/driver/location";
const INTERVAL_MS = 15000;

/* ===============================
   STATE
=============================== */

let lastSentTime = 0;
let lastLat = null;
let lastLng = null;

/* ===============================
   HELPERS
=============================== */

function shouldSend(lat, lng) {
  const now = Date.now();

  if (!lastSentTime) return true;

  // time check (15s)
  if (now - lastSentTime >= INTERVAL_MS) return true;

  // distance check (small movement filter)
  if (lastLat !== null && lastLng !== null) {
    const moved =
      Math.abs(lat - lastLat) +
      Math.abs(lng - lastLng);

    if (moved > 0.0005) return true;
  }

  return false;
}

/* ===============================
   SEND LOCATION
=============================== */

async function sendLocation(lat, lng) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tripId: driver.id, // replace later with real tripId
        lat,
        lng
      })
    });

    lastSentTime = Date.now();
    lastLat = lat;
    lastLng = lng;

  } catch (err) {
    console.warn("Location send error");
  }
}

/* ===============================
   GPS UPDATE
=============================== */

function updateLiveLocation() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (shouldSend(lat, lng)) {
        sendLocation(lat, lng);
      }
    },
    err => console.warn("GPS error"),
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 2000
    }
  );
}

/* ===============================
   START
=============================== */

// first call immediately
updateLiveLocation();

// repeat every 15s
setInterval(updateLiveLocation, INTERVAL_MS);