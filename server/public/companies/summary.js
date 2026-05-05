let tripsData = [];
let currentTab = "individual";

/* ================= LOAD ================= */
async function loadTrips(){
  try{
    const res = await fetch("/api/trips/summary");
    tripsData = await res.json();
    render();
  }catch(err){
    console.log("Load error", err);
  }
}

/* ================= TAB ================= */
function switchTab(type,btn){

  currentTab = type;

  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  btn.classList.add("active");

  render();
}

/* ================= FILTER ================= */
function apply(){
  render();
}

function getFiltered(){

  const d = document.getElementById("date").value;
  const s = document.getElementById("search").value.toLowerCase();

  return tripsData.filter(t=>{

    const matchDate = !d || t.tripDate === d;

    const matchText =
      !s ||
      (t.tripNumber||"").toLowerCase().includes(s) ||
      (t.clientName||"").toLowerCase().includes(s);

    return matchDate && matchText;
  });
}

/* ================= RENDER ================= */
function render(){

  const data = getFiltered();
  const body = document.getElementById("body");

  body.innerHTML = "";

  if(currentTab === "individual"){
    renderIndividual(data.filter(t=>!t.isShared));
  }else{
    renderShared(data.filter(t=>t.isShared));
  }
}

/* ================= INDIVIDUAL ================= */
function renderIndividual(data){

  const body = document.getElementById("body");

  data.forEach(t=>{

    body.innerHTML += `
    <tr>
      <td><span class="trip-badge">${t.tripNumber||"-"}</span></td>
      <td>${t.tripDate||"-"}</td>
      <td>${t.tripTime||"-"}</td>
      <td>${t.clientName||"-"}</td>
      <td>${t.clientPhone||"-"}</td>
      <td>
        <span class="status ${getStatusClass(t.status)}">
          ${t.status}
        </span>
      </td>
      <td>$${getTripTotal(t)}</td>
    </tr>
    `;
  });
}

/* ================= SHARED ================= */
function renderShared(data){

  const body = document.getElementById("body");

  data.forEach(t=>{

    const passengers = t.passengers || [];

    const names = passengers.map(p=>p.name).join("<br>");
    const phones = passengers.map(p=>p.phone).join("<br>");

    body.innerHTML += `
    <tr>
      <td><span class="trip-badge">${t.tripNumber}</span></td>
      <td>${t.tripDate}</td>
      <td>${t.tripTime}</td>
      <td>${names}</td>
      <td>${phones}</td>
      <td>
        <span class="status ${getStatusClass(t.status)}">
          ${t.status}
        </span>
      </td>
      <td>$${getTripTotal(t)}</td>
    </tr>
    `;
  });
}

/* ================= STATUS ================= */
function getStatusClass(status){

  if(!status) return "status-scheduled";

  const s = status.toLowerCase();

  if(s.includes("complete")) return "status-completed";
  if(s.includes("noshow")) return "status-noshow";
  if(s.includes("cancel")) return "status-cancelled";

  return "status-scheduled";
}

/* ================= PRICE ================= */
function getTripTotal(t){

  if(t.finalPrice) return Number(t.finalPrice);

  if(t.status === "NoShow") return 15;
  if(t.status === "Cancelled") return 15;

  return Number(t.priceAmount || 0);
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded",()=>{
  loadTrips();
});