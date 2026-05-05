/* =========================
   STATE
========================= */
let allTrips = [];
let currentTab = "individual";

/* =========================
   LOAD TRIPS
========================= */
async function loadTrips(){
  try{
    const res = await fetch("/api/trips");
    allTrips = await res.json();

    applySearch();

  }catch(err){
    console.log("Load trips error:", err);
  }
}

/* =========================
   SWITCH TAB
========================= */
function switchTab(tab, btn){

  currentTab = tab;

  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.remove("active");
  });

  if(btn) btn.classList.add("active");

  applySearch();
}

/* =========================
   CALCULATE (INDIVIDUAL)
========================= */
function calcTotal(t){

  if(t.status === "NoShow") return 15;

  if(t.status === "Cancelled"){
    return Number(t.finalPrice || 15);
  }

  if(t.status === "Completed"){
    return Number(t.priceAmount || 0);
  }

  return 0;
}

/* =========================
   CALCULATE (SHARED)
========================= */
function calcSharedTotal(trip){

  let total = 0;

  const passengers = Array.isArray(trip.passengers)
    ? trip.passengers
    : [];

  passengers.forEach(p => {

    if(p.status === "Completed"){
      total += Number(p.priceAmount || 0);
    }

    if(p.status === "NoShow"){
      total += 15;
    }

    if(p.status === "Cancelled"){
      total += Number(p.cancelFee || 15);
    }

  });

  return total;
}

/* =========================
   STATUS CLASS
========================= */
function getStatusClass(status){

  if(status === "Completed") return "status-completed";
  if(status === "NoShow") return "status-noshow";

  return "status-cancelled";
}

/* =========================
   RENDER TABLE
========================= */
function render(data){

  const body = document.getElementById("tableBody");

  if(!body) return;

  body.innerHTML = "";

  data.forEach(t => {

    // 🔥 TAB FILTER
    if(currentTab === "individual" && t.isShared) return;
    if(currentTab === "shared" && !t.isShared) return;

    const total = t.isShared
      ? calcSharedTotal(t)
      : calcTotal(t);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.tripDate || ""}</td>
      <td>${t.tripTime || ""}</td>
      <td>${t.clientName || t.company || "Shared Trip"}</td>
      <td>${t.clientPhone || ""}</td>
      <td>${t.tripType || ""}</td>
      <td class="${getStatusClass(t.status)}">${t.status}</td>
      <td>$${total}</td>
    `;

    body.appendChild(tr);

  });
}

/* =========================
   SEARCH / FILTER
========================= */
function applySearch(){

  const date = document.getElementById("searchDate")?.value || "";
  const text = document.getElementById("searchText")?.value.toLowerCase() || "";

  const filtered = allTrips.filter(t => {

    const matchDate =
      !date || t.tripDate === date;

    const matchText =
      !text ||
      (t.clientName || "").toLowerCase().includes(text) ||
      (t.company || "").toLowerCase().includes(text);

    return matchDate && matchText;

  });

  render(filtered);
}

/* =========================
   PRINT
========================= */
function printPage(){
  window.print();
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {

  // تحميل البيانات
  loadTrips();

});