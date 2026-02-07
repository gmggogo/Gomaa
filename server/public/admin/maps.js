console.log("✅ Admin Map Loaded");

let map;
const markers = {}; // driverId => marker

/* ===============================
   INIT MAP
=============================== */
function initMap() {
  map = L.map("map").setView([33.4484, -112.0740], 11); // Phoenix

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(map);

  loadDriverLocations();
  setInterval(loadDriverLocations, 5000); // تحديث كل 5 ثواني
}

/* ===============================
   DRIVER ICON
=============================== */
const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/741/741407.png",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

/* ===============================
   LOAD ALL DRIVER LOCATIONS
=============================== */
function loadDriverLocations() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (!key.startsWith("driverLocation_")) continue;

    const data = JSON.parse(localStorage.getItem(key));
    if (!data || !data.lat || !data.lng) continue;

    const id = data.id;
    const latlng = [data.lat, data.lng];

    if (!markers[id]) {
      markers[id] = L.marker(latlng, { icon: driverIcon })
        .addTo(map)
        .bindPopup(
          `<b>${data.name}</b><br>
           Lat: ${data.lat.toFixed(5)}<br>
           Lng: ${data.lng.toFixed(5)}`
        );
    } else {
      markers[id].setLatLng(latlng);
    }
  }
}

/* ===============================
   INIT
=============================== */
initMap();