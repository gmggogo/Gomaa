console.log("✅ Admin map.js loaded");

/* ===============================
   INIT MAP
=============================== */
const map = L.map("map").setView([33.4484, -112.0740], 11); // Phoenix

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

/* ===============================
   DRIVER ICON
=============================== */
const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/194/194640.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

/* ===============================
   MARKERS STORAGE
=============================== */
const markers = {};

/* ===============================
   LOAD DRIVERS LOCATIONS
=============================== */
function loadDrivers() {
  Object.keys(localStorage).forEach(key => {
    if (!key.startsWith("driverLocation_")) return;

    const data = JSON.parse(localStorage.getItem(key));
    if (!data || !data.lat || !data.lng) return;

    if (!markers[data.driverId]) {
      markers[data.driverId] = L.marker(
        [data.lat, data.lng],
        { icon: driverIcon }
      )
        .addTo(map)
        .bindPopup(
          `<b>${data.name}</b><br>
           ${new Date(data.updatedAt).toLocaleTimeString()}`
        );
    } else {
      markers[data.driverId].setLatLng([data.lat, data.lng]);
    }
  });
}

/* ===============================
   AUTO REFRESH
=============================== */
loadDrivers();
setInterval(loadDrivers, 5000);