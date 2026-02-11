// ===============================
// MAP INIT
// ===============================
const map = L.map("map").setView([33.4484, -112.0740], 11); // Phoenix default

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ===============================
// HELPERS
// ===============================
function todayKey(){
  return new Date().toLocaleDateString("en-US", { weekday:"short" });
}

// ===============================
// LOAD ACTIVE DRIVERS FROM SCHEDULE
// ===============================
function getActiveDrivers(){
  const schedule = JSON.parse(localStorage.getItem("driverSchedule") || "{}");
  const today = todayKey(); // Mon, Tue...

  return Object.values(schedule).filter(d =>
    d.days && d.days[today] === true
  );
}

// ===============================
// LOAD LIVE LOCATIONS
// ===============================
function getLiveLocations(){
  return JSON.parse(localStorage.getItem("driversLive") || "[]");
}

// ===============================
// DRAW DRIVERS
// ===============================
function renderDrivers(){
  const activeDrivers = getActiveDrivers();
  const locations = getLiveLocations();

  activeDrivers.forEach(driver=>{
    const loc = locations.find(l => l.id === driver.id);
    if(!loc) return;

    const icon = L.divIcon({
      html: `<div style="background:#2563eb;color:#fff;
                    padding:6px 10px;border-radius:10px;
                    font-size:12px;font-weight:bold">
               🚗 ${driver.name}
             </div>`
    });

    L.marker([loc.lat, loc.lng], { icon }).addTo(map);
  });
}

// ===============================
// SEARCH UI
// ===============================
const searchInput = document.getElementById("searchDriver");
searchInput.addEventListener("input", ()=>{
  map.eachLayer(l=>{
    if(l instanceof L.Marker) map.removeLayer(l);
  });

  const q = searchInput.value.toLowerCase();
  const active = getActiveDrivers().filter(d =>
    d.name.toLowerCase().includes(q)
  );

  const locations = getLiveLocations();
  active.forEach(d=>{
    const loc = locations.find(l=>l.id===d.id);
    if(!loc) return;

    L.marker([loc.lat, loc.lng]).addTo(map);
  });
});

// ===============================
// INIT
// ===============================
renderDrivers();