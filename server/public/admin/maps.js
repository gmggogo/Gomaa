let map;
let marker = null;

/* =========================
   HELPERS
========================= */
function loadDrivers() {
  return JSON.parse(localStorage.getItem("drivers")) || [];
}

function loadDriverSchedule() {
  return JSON.parse(localStorage.getItem("driverSchedule")) || [];
}

function loadLocations() {
  return JSON.parse(localStorage.getItem("driverLocations")) || {};
}

function saveLocations(data) {
  localStorage.setItem("driverLocations", JSON.stringify(data));
}

/* =========================
   CHECK ACTIVE DRIVER (TODAY AZ)
========================= */
function isDriverActive(driverName) {
  const schedule = loadDriverSchedule();

  const todayAZ = new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" })
  );

  const dayIndex = todayAZ.getDay(); // 0 Sun → 6 Sat

  const record = schedule.find(d => d.name === driverName);
  if (!record) return false;

  return record.days && record.days.includes(dayIndex);
}

/* =========================
   INIT MAP
========================= */
function initMap() {
  map = L.map("map").setView([33.4484, -112.0740], 10); // Phoenix

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  map.on("click", e => {
    if (!marker) {
      marker = L.marker(e.latlng).addTo(map);
    } else {
      marker.setLatLng(e.latlng);
    }
  });

  loadActiveDrivers();
}

/* =========================
   LOAD ACTIVE DRIVERS ONLY
========================= */
function loadActiveDrivers() {
  const drivers = loadDrivers();
  const select = document.getElementById("driverSelect");

  drivers.forEach(d => {
    if (isDriverActive(d.name)) {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = d.name;
      select.appendChild(opt);
    }
  });

  select.addEventListener("change", () => {
    const locations = loadLocations();
    const loc = locations[select.value];

    if (loc) {
      if (!marker) {
        marker = L.marker(loc).addTo(map);
      } else {
        marker.setLatLng(loc);
      }
      map.setView(loc, 12);
    }
  });
}

/* =========================
   SAVE LOCATION
========================= */
function saveLocation() {
  const driver = document.getElementById("driverSelect").value;
  if (!driver) return alert("Select driver");

  if (!marker) return alert("Select location on map");

  const locations = loadLocations();
  locations[driver] = marker.getLatLng();

  saveLocations(locations);
  alert("Location saved");
}

/* =========================
   INIT
========================= */
initMap();