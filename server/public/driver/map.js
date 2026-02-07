console.log("✅ Driver Map Loaded");

/* ===============================
   AUTH
=============================== */
const driver = JSON.parse(localStorage.getItem("loggedDriver"));
if (!driver) {
  alert("Driver not logged in");
  location.href = "login.html";
}

/* ===============================
   MAP INIT
=============================== */
const map = L.map("map");
let driverMarker = null;
let firstFix = true;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

/* ===============================
   DRIVER ICON (مش حمار 🫡)
=============================== */
const driverIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/741/741407.png", // عربية
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -18]
});

/* ===============================
   START GPS (REAL TIME)
=============================== */
if (!navigator.geolocation) {
  alert("GPS not supported");
} else {
  navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (!driverMarker) {
        driverMarker = L.marker([lat, lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup("🚗 You");
      } else {
        driverMarker.setLatLng([lat, lng]);
      }

      if (firstFix) {
        map.setView([lat, lng], 17);
        firstFix = false;
      }

      // 🔁 save for admin / dispatch
      localStorage.setItem(
        "driverLocation_" + driver.id,
        JSON.stringify({
          id: driver.id,
          name: driver.name,
          lat,
          lng,
          time: Date.now()
        })
      );
    },
    err => {
      console.error(err);
      alert("GPS error – allow location");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}