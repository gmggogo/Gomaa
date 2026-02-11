/* =========================
   MAP INIT
========================= */
const map = L.map("map").setView([33.3062, -111.8413], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

/* =========================
   DRIVERS STORE
========================= */
// driverId => { marker, data }
const drivers = {};

/* =========================
   ICON FACTORY
========================= */
function driverIcon(color, label) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        background:${color};
        color:#000;
        padding:4px 6px;
        border-radius:6px;
        font-size:12px;
        font-weight:bold;
        border:2px solid #000;
        white-space:nowrap;
      ">
        ${label}
      </div>
    `
  });
}

/* =========================
   UPDATE / ADD DRIVER
========================= */
function updateDriver(driver) {
  const { id, name, lat, lng, status } = driver;

  let color = "#9ca3af"; // gray
  if (status === "available") color = "#22c55e";
  if (status === "ontrip") color = "#facc15";
  if (status === "problem") color = "#ef4444";

  if (!drivers[id]) {
    const marker = L.marker([lat, lng], {
      icon: driverIcon(color, name)
    }).addTo(map);

    marker.bindPopup(`
      <b>${name}</b><br>
      ID: ${id}<br>
      Status: ${status}
    `);

    drivers[id] = { marker, data: driver };
  } else {
    drivers[id].marker.setLatLng([lat, lng]);
    drivers[id].marker.setIcon(driverIcon(color, name));
    drivers[id].data = driver;
  }
}

/* =========================
   SEARCH / FOCUS
========================= */
function focusDriver() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  if (!q) return;

  for (const id in drivers) {
    const d = drivers[id].data;
    if (
      d.name.toLowerCase().includes(q) ||
      id.toLowerCase() === q
    ) {
      map.setView(drivers[id].marker.getLatLng(), 15);
      drivers[id].marker.openPopup();
      break;
    }
  }
}

/* =========================
   DEMO LIVE DATA (TEMP)
   هتشيل ده لما نربط بالسواقين
========================= */
setInterval(() => {
  const demoDrivers = [
    {
      id: "D1",
      name: "Ahmed",
      lat: 33.3062 + Math.random() * 0.01,
      lng: -111.8413 + Math.random() * 0.01,
      status: "available"
    },
    {
      id: "D2",
      name: "Mohamed",
      lat: 33.31 + Math.random() * 0.01,
      lng: -111.85 + Math.random() * 0.01,
      status: "ontrip"
    }
  ];

  demoDrivers.forEach(updateDriver);
}, 3000);