// ==========================
// MAP INIT
// ==========================
const map = L.map("map").setView([33.4484, -112.0740], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ==========================
// FAKE DATA (replace later)
// ==========================
const drivers = [
  {
    id:1,
    name:"MIDO",
    lat:33.45,
    lng:-112.07,
    car:"🚗",
    color:"red",
    active:true
  },
  {
    id:2,
    name:"OMDA",
    lat:33.48,
    lng:-112.12,
    car:"🚙",
    color:"blue",
    active:true
  }
];

// ==========================
// MARKERS
// ==========================
const markers = [];

function renderDrivers(filter=""){
  markers.forEach(m=>map.removeLayer(m));
  markers.length = 0;

  drivers.forEach(d=>{
    if(!d.active) return;
    if(filter && !d.name.toLowerCase().includes(filter)) return;

    const icon = L.divIcon({
      html: `
        <div style="text-align:center">
          <div style="font-size:26px">${d.car}</div>
          <div style="font-size:11px;color:${d.color}">${d.name}</div>
        </div>
      `,
      className:"",
      iconSize:[40,40]
    });

    const marker = L.marker([d.lat,d.lng],{icon}).addTo(map);
    markers.push(marker);
  });
}

renderDrivers();

// ==========================
// SEARCH
// ==========================
document.getElementById("searchInput").addEventListener("input",e=>{
  renderDrivers(e.target.value.toLowerCase());
});

// ==========================
// BACK
// ==========================
function goBack(){
  location.href="/admin/dashboard.html";
}