// ===============================
// ADMIN AUTH
// ===============================
const rawAdmin = localStorage.getItem("loggedUser");
if (!rawAdmin) location.href = "/admin/login.html";

// ===============================
// MAP INIT
// ===============================
const map = L.map("map").setView([33.4484, -112.0740], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

const markers = {};

// ===============================
// GET ACTIVE DRIVERS FROM SCHEDULE
// ===============================
function getActiveDriversToday(){
  const schedule = JSON.parse(localStorage.getItem("driverSchedule") || "{}");
  const today = new Date().toLocaleDateString("en-US", { weekday: "short" });

  const active = [];

  Object.values(schedule).forEach(d => {
    if (d.days && d.days[today] === true) {
      active.push(d.name);
    }
  });

  return active;
}

// ===============================
// LOAD LIVE LOCATIONS
// ===============================
function renderDrivers(){
  const activeDrivers = getActiveDriversToday();
  const live = JSON.parse(localStorage.getItem("driversLive") || "{}");

  activeDrivers.forEach(name => {
    const d = live[name];
    if (!d) return; // مفيش لوكيشن = مفيش marker

    if (!markers[name]) {
      markers[name] = L.marker([d.lat, d.lng])
        .addTo(map)
        .bindPopup(`<b>${d.name}</b><br>${d.car}`);
    } else {
      markers[name].setLatLng([d.lat, d.lng]);
    }
  });

  // شيل أي سواق بطل شغل
  Object.keys(markers).forEach(name => {
    if (!activeDrivers.includes(name)) {
      map.removeLayer(markers[name]);
      delete markers[name];
    }
  });
}

// ===============================
// AUTO REFRESH
// ===============================
renderDrivers();
setInterval(renderDrivers, 3000);