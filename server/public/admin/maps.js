// ===============================
// BACK
// ===============================
function goBack(){
  location.href = "/admin/dashboard.html";
}

// ===============================
// MAP INIT
// ===============================
const map = L.map("map").setView([33.4484, -112.074], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom:19
}).addTo(map);

// ===============================
// DATA
// ===============================
const today = new Date().toISOString().slice(0,10);

const activeByDate = JSON.parse(
  localStorage.getItem("activeDriversByDate") || "{}"
);

const activeDriverIds = activeByDate[today] || [];

const driversOnline = JSON.parse(
  localStorage.getItem("driversOnline") || "[]"
);

// فلترة السواقين اللي شغالين النهارده
let activeDrivers = driversOnline.filter(d =>
  activeDriverIds.includes(d.id)
);

// ===============================
// UI
// ===============================
const driversList = document.getElementById("driversList");
const searchInput = document.getElementById("searchDriver");

let markers = [];

// ===============================
// ICONS
// ===============================
const colors = ["red","blue","green","orange","purple","yellow"];

function carIcon(color, name){
  return L.divIcon({
    className:"",
    html:`
      <div style="text-align:center">
        <div style="font-size:11px;color:white;margin-bottom:2px">
          ${name}
        </div>
        <div style="
          width:28px;
          height:28px;
          background:${color};
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:16px;
        ">🚗</div>
      </div>
    `,
    iconSize:[40,50],
    iconAnchor:[20,40]
  });
}

// ===============================
// RENDER
// ===============================
function render(list){
  markers.forEach(m=>map.removeLayer(m));
  markers = [];
  driversList.innerHTML = "";

  list.forEach((d,i)=>{
    const color = colors[i % colors.length];

    const marker = L.marker([d.lat, d.lng], {
      icon: carIcon(color, d.name)
    }).addTo(map);

    markers.push(marker);

    const card = document.createElement("div");
    card.className = "driver-card";
    card.innerText = d.name;
    card.onclick = ()=>{
      map.setView([d.lat, d.lng], 15);
    };

    driversList.appendChild(card);
  });
}

// ===============================
// SEARCH
// ===============================
searchInput.oninput = ()=>{
  const q = searchInput.value.toLowerCase();
  const filtered = activeDrivers.filter(d =>
    d.name.toLowerCase().includes(q)
  );
  render(filtered);
};

// ===============================
render(activeDrivers);