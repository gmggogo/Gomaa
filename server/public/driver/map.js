// AUTH
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) location.href = "/driver/login.html";
const driver = JSON.parse(rawDriver);

// MAP INIT
const map = L.map("map").setView([33.4484, -112.0740], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

let marker;

// LIVE LOCATION
navigator.geolocation.watchPosition(
  pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    if (!marker) {
      marker = L.marker([lat, lng]).addTo(map);
      map.setView([lat, lng], 15);
    } else {
      marker.setLatLng([lat, lng]);
    }

    // SEND LOCATION TO SERVER (ADMIN / DISPATCH)
    fetch("/api/driver/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverId: driver.id,
        lat,
        lng
      })
    });
  },
  err => {
    alert("Location permission required");
  },
  {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  }
);

// GOOGLE MAPS
function openGoogle() {
  if (!marker) return;
  const p = marker.getLatLng();
  window.open(
    `https://www.google.com/maps?q=${p.lat},${p.lng}`,
    "_blank"
  );
}