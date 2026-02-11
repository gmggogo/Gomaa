// ===============================
// ADMIN LIVE MAP (REAL SERVER)
// ===============================

const map = L.map("map", {
  zoomControl: true,
  attributionControl: false
}).setView([33.4484, -112.0740], 11); // Phoenix default

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

const searchInput = document.getElementById("searchDriver");

// تخزين الماركرات الحالية
const driverMarkers = new Map();

// ألوان مختلفة للعربيات
const carColors = [
  "#2563eb", "#dc2626", "#16a34a",
  "#f59e0b", "#7c3aed", "#0ea5e9"
];

// ===============================
// CREATE CUSTOM ICON
// ===============================
function createCarIcon(color) {
  return L.divIcon({
    html: `
      <div style="
        background:${color};
        width:30px;
        height:30px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:16px;
        border:2px solid white;">
        🚗
      </div>
    `,
    className: "",
    iconSize: [30,30],
    iconAnchor: [15,15]
  });
}

// ===============================
// LOAD LIVE DRIVERS FROM SERVER
// ===============================
async function loadLiveDrivers() {

  try {
    const res = await fetch("/api/admin/live-drivers");
    const drivers = await res.json();

    const bounds = [];

    // علشان نعرف مين لسه موجود
    const currentNames = drivers.map(d => d.name);

    // حذف اللي اختفى
    driverMarkers.forEach((value, key) => {
      if (!currentNames.includes(key)) {
        map.removeLayer(value.marker);
        map.removeLayer(value.label);
        driverMarkers.delete(key);
      }
    });

    drivers.forEach((driver, index) => {

      const lat = driver.lat;
      const lng = driver.lng;
      const name = driver.name;

      bounds.push([lat, lng]);

      // لو موجود قبل كده نحدث مكانه
      if (driverMarkers.has(name)) {
        const obj = driverMarkers.get(name);
        obj.marker.setLatLng([lat, lng]);
        obj.label.setLatLng([lat, lng]);
      } else {
        // ماركر جديد
        const color = carColors[index % carColors.length];

        const marker = L.marker([lat, lng], {
          icon: createCarIcon(color)
        }).addTo(map);

        const label = L.marker([lat, lng], {
          icon: L.divIcon({
            html: `<div class="driver-label">${name}</div>`,
            className: "",
            iconAnchor: [0, -20]
          })
        }).addTo(map);

        driverMarkers.set(name, { marker, label });
      }
    });

    // Zoom على كل السواقين
    if (bounds.length > 0) {
      const group = L.latLngBounds(bounds);
      map.fitBounds(group, { padding: [50, 50] });
    }

  } catch (err) {
    console.error("Live drivers error:", err);
  }
}

// ===============================
// SEARCH DRIVER
// ===============================
if (searchInput) {
  searchInput.addEventListener("input", () => {
    const value = searchInput.value.toLowerCase();

    driverMarkers.forEach((obj, name) => {
      const visible = name.toLowerCase().includes(value);
      obj.marker.getElement().style.display = visible ? "block" : "none";
      obj.label.getElement().style.display = visible ? "block" : "none";
    });
  });
}

// ===============================
// AUTO REFRESH
// ===============================
setInterval(loadLiveDrivers, 3000);
loadLiveDrivers();