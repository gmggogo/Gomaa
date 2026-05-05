let allTrips = [];
let currentTab = "individual";

/* ================= LOAD ================= */
async function loadTrips(){
  try{
    const res = await fetch("/api/trips/summary");
    allTrips = await res.json();

    render();

  }catch(err){
    console.log("Load error:", err);
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

  return allTrips.filter(t=>{

    const matchDate = !d || t.tripDate === d;

    const matchText =
      !s ||
      (t.tripNumber||"").toLowerCase().includes(s) ||
      (t.clientName||"").toLowerCase().includes(s) ||
      (t.clientPhone||"").toLowerCase().includes(s);

    return matchDate && matchText;
  });
}

/* ================= RENDER ================= */
function render(){

  const data = getFiltered();

  if(currentTab === "individual"){
    renderIndividual(data.filter(t=>!t.isShared));
  }else{
    renderShared(data.filter(t=>t.isShared));
  }
}

/* ================= INDIVIDUAL ================= */
function renderIndividual(data){

  document.getElementById("individualView").style.display = "block";
  document.getElementById("sharedView").style.display = "none";

  const body = document.getElementById("individualBody");
  body.innerHTML = "";

  let totalAll = 0;

  data.forEach(t=>{

    const total = getTripTotal(t);
    totalAll += total;

    body.innerHTML += `
      <tr>
        <td><span class="trip-badge">${t.tripNumber||"-"}</span></td>
        <td>${t.tripDate||"-"}</td>
        <td>${t.tripTime||"-"}</td>
        <td>${t.clientName||"-"}</td>
        <td>${t.clientPhone||"-"}</td>
        <td class="${getStatusClass(t.status)}">${t.status}</td>
        <td>$${total.toFixed(2)}</td>
      </tr>
    `;
  });

  updateTotal(totalAll);
}

/* ================= SHARED ================= */
function renderShared(data){

  document.getElementById("individualView").style.display = "none";
  document.getElementById("sharedView").style.display = "block";

  const container = document.getElementById("sharedView");
  container.innerHTML = "";

  let totalAll = 0;

  data.forEach(trip=>{

    const passengers = Array.isArray(trip.passengers) ? trip.passengers : [];

    let passengersHTML = "";
    let tripTotal = 0;

    passengers.forEach(p=>{

      const price = getPassengerPrice(p);
      tripTotal += price;

      passengersHTML += `
        <div class="passenger-row">
          <div class="passenger-name">${p.name || "-"}</div>
          <div>${p.phone || "-"}</div>
          <div class="${getStatusClass(p.status)}">${p.status}</div>
          <div>$${price.toFixed(2)}</div>
        </div>
      `;
    });

    totalAll += tripTotal;

    container.innerHTML += `
      <div class="shared-card">

        <div class="shared-card-header">
          <div>
            <div>Trip: ${trip.tripNumber}</div>
            <div class="shared-meta">${trip.tripDate} | ${trip.tripTime}</div>
          </div>
        </div>

        <div class="passenger-list">
          ${passengersHTML || `<div class="empty">No passengers</div>`}
        </div>

        <div class="shared-total">
          Total: $${tripTotal.toFixed(2)}
        </div>

      </div>
    `;
  });

  updateTotal(totalAll);
}

/* ================= STATUS ================= */
function getStatusClass(status){

  if(!status) return "";

  status = status.toLowerCase();

  if(status.includes("complete")) return "status-completed";
  if(status.includes("noshow")) return "status-noshow";
  if(status.includes("cancel")) return "status-cancelled";

  return "status-scheduled";
}

/* ================= PRICE ================= */
function getTripTotal(t){

  if(t.finalPrice) return Number(t.finalPrice);

  if(t.status === "NoShow") return 15;
  if(t.status === "Cancelled") return 15;

  return Number(t.priceAmount || 0);
}

function getPassengerPrice(p){

  if(p.status === "NoShow") return 15;
  if(p.status === "Cancelled") return 15;

  return Number(p.price || 0);
}

/* ================= TOTAL ================= */
function updateTotal(v){
  document.getElementById("totalBox").innerText = "Total: $" + v.toFixed(2);
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded",()=>{
  loadTrips();
});