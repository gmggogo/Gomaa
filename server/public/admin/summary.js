let trips = [];
let currentTab = "individual";

/* LOAD */
async function load(){
  const res = await fetch("/api/trips/summary");
  trips = await res.json();
  apply();
}

/* TAB */
function switchTab(type,btn){
  currentTab = type;

  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");

  apply();
}

/* PRICE */
function calc(t){

  if(t.status==="Completed"){
    return Number(t.finalPrice || t.priceAmount || 0);
  }

  if(t.status==="NoShow"){
    return 15;
  }

  if(t.status==="Cancelled"){
    return Number(t.finalPrice || 15);
  }

  return 0;
}

/* RENDER */
function render(data){

  const body = document.getElementById("body");
  body.innerHTML="";

  let totalMoney = 0;
  let completed=0,noshow=0,cancel=0;

  data.forEach(t=>{

    if(currentTab==="individual" && t.isShared) return;
    if(currentTab==="shared" && !t.isShared) return;

    const total = calc(t);
    totalMoney += total;

    if(t.status==="Completed") completed++;
    if(t.status==="NoShow") noshow++;
    if(t.status==="Cancelled") cancel++;

    const tr = document.createElement("tr");

    tr.innerHTML=`
      <td>${t.tripDate||""}</td>
      <td>${t.tripTime||""}</td>
      <td>${t.clientName||"Shared Trip"}</td>
      <td>${t.clientPhone||""}</td>
      <td class="${t.status.toLowerCase()}">${t.status}</td>
      <td>$${total}</td>
    `;

    body.appendChild(tr);
  });

  document.getElementById("totalTrips").innerText=data.length;
  document.getElementById("totalMoney").innerText="$"+totalMoney;
  document.getElementById("completedCount").innerText=completed;
  document.getElementById("noshowCount").innerText=noshow;
  document.getElementById("cancelCount").innerText=cancel;
}

/* SEARCH */
function apply(){

  const d = document.getElementById("date").value;
  const s = document.getElementById("search").value.toLowerCase();

  const filtered = trips.filter(t=>{

    const matchDate = !d || t.tripDate===d;

    const matchText =
      !s ||
      (t.clientName||"").toLowerCase().includes(s) ||
      (t.company||"").toLowerCase().includes(s);

    return matchDate && matchText;
  });

  render(filtered);
}

/* PRINT */
function printPage(){
  window.print();
}

load();