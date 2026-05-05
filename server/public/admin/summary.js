// =========================
// 🔥 LOAD HEADER + SIDEBAR
// =========================
async function loadSidebar(){
  const res = await fetch("/admin/sidebar.html");
  const html = await res.text();
  document.getElementById("sidebarContainer").innerHTML = html;
}
loadSidebar();


// =========================
// 🔥 GLOBAL
// =========================
let trips = [];
let filteredTrips = [];


// =========================
// 🔥 LOAD FROM SERVER
// =========================
async function loadTrips(){
  try{
    const res = await fetch("/api/trips");
    const data = await res.json();

    trips = data.filter(t =>
      t.status === "Completed" ||
      t.status === "NoShow" ||
      t.status === "Cancelled"
    );

    filteredTrips = [...trips];

    renderTable(filteredTrips);
    updateTotal();

  }catch(err){
    console.log("Load error:", err);
  }
}

loadTrips();


// =========================
// 🔥 COST FUNCTIONS
// =========================
function stopsCost(stops){
  return (stops || 0) * 5;
}

function delayCost(minutes){
  if(!minutes) return 0;
  if(minutes <= 15) return 0;
  return minutes - 15;
}

function totalCost(trip){

  if(trip.status === "Cancelled"){
    return trip.finalPrice || 0;
  }

  if(trip.status === "NoShow"){
    return 15;
  }

  if(trip.status === "Completed"){
    return trip.finalPrice || trip.priceAmount || 0;
  }

  return 0;
}


// =========================
// 🔥 RENDER TABLE
// =========================
function renderTable(data){
  const body = document.getElementById("tableBody");
  body.innerHTML = "";

  data.forEach(trip => {

    const tr = document.createElement("tr");

    const statusClass =
      trip.status === "Completed"
        ? "status-completed"
        : trip.status === "NoShow"
        ? "status-noshow"
        : "status-cancel";

    tr.innerHTML = `
      <td>${trip.tripDate || ""}</td>
      <td>${trip.tripTime || ""}</td>
      <td>${trip.clientName || trip.company || ""}</td>
      <td>${trip.clientPhone || ""}</td>
      <td>${trip.tripType || trip.type || ""}</td>
      <td>${trip.miles || 0}</td>
      <td>$${stopsCost(trip.stops?.length)}</td>
      <td>$${delayCost(trip.delayMinutes)}</td>
      <td class="${statusClass}">${trip.status}</td>
      <td>$${totalCost(trip)}</td>
    `;

    body.appendChild(tr);
  });
}


// =========================
// 🔥 SEARCH / FILTER
// =========================
function applySearch(){

  const date = document.getElementById("searchDate").value;
  const text = document.getElementById("searchText").value.toLowerCase();
  const type = document.getElementById("searchType").value;

  filteredTrips = trips.filter(t => {

    const matchDate = !date || t.tripDate === date;

    const matchText =
      !text ||
      (t.clientName || "").toLowerCase().includes(text) ||
      (t.company || "").toLowerCase().includes(text);

    const matchType =
      !type ||
      t.tripType === type ||
      t.type === type;

    return matchDate && matchText && matchType;
  });

  renderTable(filteredTrips);
  updateTotal();
}


// =========================
// 🔥 TOTAL CALC
// =========================
function updateTotal(){

  let total = 0;

  filteredTrips.forEach(t => {
    total += totalCost(t);
  });

  const el = document.getElementById("totalBox");
  if(el){
    el.innerText = "Total: $" + total.toFixed(2);
  }
}


// =========================
// 🔥 PRINT FUNCTION
// =========================
function printSummary(){

  const original = document.body.innerHTML;

  const content = document.querySelector(".content").innerHTML;

  document.body.innerHTML = `
    <div style="padding:20px">
      <h2>Sunbeam Transportation - Trips Summary</h2>
      ${content}
    </div>
  `;

  window.print();

  document.body.innerHTML = original;
  location.reload();
}