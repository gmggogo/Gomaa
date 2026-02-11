<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Admin Live Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>

<style>
:root{
  --dark:#020617;
  --gold:#facc15;
}

html,body{
  margin:0;
  height:100%;
  background:var(--dark);
  font-family:Arial, sans-serif;
  color:#fff;
}

/* ===== HEADER ===== */
.header{
  height:56px;
  background:#000;
  display:flex;
  align-items:center;
  justify-content:center;
  position:relative;
  font-weight:bold;
  color:var(--gold);
}

.back-btn{
  position:absolute;
  left:10px;
  background:var(--gold);
  color:#000;
  border:none;
  border-radius:8px;
  padding:6px 10px;
  cursor:pointer;
  font-weight:bold;
}

/* ===== SEARCH ===== */
.search-box{
  position:absolute;
  top:66px;
  right:10px;
  z-index:1000;
}

.search-box input{
  padding:6px 10px;
  border-radius:8px;
  border:none;
  outline:none;
}

/* ===== MAP ===== */
#map{
  position:absolute;
  top:56px;
  bottom:0;
  left:0;
  right:0;
}
</style>
</head>

<body>

<div class="header">
  <button class="back-btn" onclick="location.href='dashboard.html'">Back</button>
  ADMIN LIVE MAP
</div>

<div class="search-box">
  <input id="searchDriver" placeholder="Search driver">
</div>

<div id="map"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script>
// ===============================
// MAP INIT
// ===============================
const map = L.map("map").setView([33.4484,-112.0740],11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19
}).addTo(map);

const markers = {};

// ===============================
// LOAD ACTIVE DRIVERS FROM SCHEDULE
// ===============================
function getActiveDriversToday(){
  const schedule = JSON.parse(localStorage.getItem("driverSchedule")||"{}");
  const today = new Date().toLocaleDateString("en-US",{weekday:"short"});
  const active = [];

  Object.values(schedule).forEach(d=>{
    if(d.days && d.days[today]){
      active.push(d.name);
    }
  });

  return active;
}

// ===============================
// LOAD DRIVER LOCATIONS
// ===============================
function loadDrivers(){
  const activeNames = getActiveDriversToday();

  Object.keys(localStorage).forEach(k=>{
    if(!k.startsWith("driverLiveLocation")) return;

    const d = JSON.parse(localStorage.getItem(k));

    if(!d.lat || !d.lng) return;
    if(!activeNames.includes(d.name)) return;

    if(!markers[d.id]){
      const icon = L.divIcon({
        html:`🚗<div style="font-size:11px">${d.name}</div>`,
        className:"",
        iconSize:[30,30]
      });

      markers[d.id] = L.marker([d.lat,d.lng],{icon}).addTo(map);
    }else{
      markers[d.id].setLatLng([d.lat,d.lng]);
    }
  });
}

// ===============================
// SEARCH
// ===============================
document.getElementById("searchDriver").addEventListener("input",e=>{
  const v = e.target.value.toLowerCase();
  Object.values(markers).forEach(m=>{
    const name = m.options.icon.options.html.toLowerCase();
    m.setOpacity(name.includes(v)?1:0.2);
  });
});

// ===============================
// AUTO REFRESH (Uber Style)
// ===============================
loadDrivers();
setInterval(loadDrivers,3000);
</script>

</body>
</html>