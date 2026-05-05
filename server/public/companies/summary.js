let trips = [];
let currentTab = "individual";

/* LOAD */
async function load(){
  const res = await fetch("/api/trips/summary");
  trips = await res.json();
  apply();
}

/* SWITCH TAB */
function switchTab(type,btn){
  currentTab = type;

  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");

  apply();
}

/* PRICE */
function getPrice(t){

  if(t.status==="Completed"){
    return t.finalPrice || t.priceAmount || 0;
  }

  if(t.status==="NoShow") return 15;
  if(t.status==="Cancelled") return 15;

  return 0;
}

/* 🔥 أهم جزء (حل مشكلة الشير) */
function buildRows(data){

  const rows = [];

  data.forEach(trip=>{

    // 🔵 INDIVIDUAL
    if(!trip.isShared){
      if(currentTab==="individual"){
        rows.push({
          date: trip.tripDate,
          time: trip.tripTime,
          name: trip.clientName,
          phone: trip.clientPhone,
          status: trip.status,
          total: getPrice(trip)
        });
      }
    }

    // 🔴 SHARED
    if(trip.isShared && currentTab==="shared"){

      const passengers = trip.passengers || [];

      passengers.forEach(p=>{

        rows.push({
          date: trip.tripDate,
          time: trip.tripTime,
          name: p.name,
          phone: p.phone,
          status: p.status,
          total: p.status==="NoShow" ? 15 : getPrice(trip)
        });

      });

    }

  });

  return rows;
}

/* RENDER */
function render(data){

  const body = document.getElementById("body");
  body.innerHTML="";

  const rows = buildRows(data);

  rows.forEach(r=>{

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.date||""}</td>
      <td>${r.time||""}</td>
      <td>${r.name||""}</td>
      <td>${r.phone||""}</td>
      <td class="${(r.status||"").toLowerCase()}">${r.status}</td>
      <td>$${r.total}</td>
    `;

    body.appendChild(tr);
  });

}

/* FILTER */
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

load();