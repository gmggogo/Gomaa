let allTrips = [];
let mode = "individual";

/* LOAD DATA */
async function load(){
  const res = await fetch("/api/trips/summary");
  allTrips = await res.json();
  render();
}

/* TAB SWITCH */
function switchTab(m,btn){
  mode = m;

  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  btn.classList.add("active");

  render();
}

/* STATUS NORMALIZE */
function norm(s){
  if(!s) return "";
  s = s.toLowerCase();

  if(s.includes("cancel")) return "Cancelled";
  if(s.includes("no")) return "NoShow";
  if(s.includes("complete")) return "Completed";

  return "Scheduled";
}

/* PRICE */
function price(status){
  if(status==="Cancelled") return 15;
  if(status==="NoShow") return 15;
  return 0;
}

/* FILTER */
function applyFilter(){
  render();
}

/* RENDER */
function render(){

  const wrap = document.getElementById("content");
  wrap.innerHTML = "";

  let data = allTrips.filter(t=>{
    const status = norm(t.status);
    return status==="Completed" || status==="Cancelled" || status==="NoShow";
  });

  if(mode==="individual"){
    renderIndividual(data,wrap);
  }else{
    renderShared(data,wrap);
  }
}

/* =========================
   INDIVIDUAL
========================= */
function renderIndividual(data,wrap){

  data.forEach(t=>{

    const status = norm(t.status);
    const p = price(status);

    wrap.innerHTML += `
    <div class="trip-box">

      <div class="trip-header">
        <div>${t.tripNumber || "-"}</div>
        <div>${t.tripDate || ""} | ${Math.round(t.miles || 0)} mi</div>
      </div>

      <table>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Status</th>
          <th>Price</th>
        </tr>

        <tr class="${status.toLowerCase()}">
          <td>${t.clientName || "-"}</td>
          <td>${t.clientPhone || "-"}</td>
          <td>${status}</td>
          <td>$${p}</td>
        </tr>
      </table>

    </div>
    `;
  });

}

/* =========================
   SHARED
========================= */
function renderShared(data,wrap){

  // group by tripNumber
  const groups = {};

  data.forEach(t=>{
    if(!t.tripNumber) return;

    if(!groups[t.tripNumber]){
      groups[t.tripNumber] = [];
    }

    groups[t.tripNumber].push(t);
  });

  Object.keys(groups).forEach(key=>{

    const list = groups[key];
    let total = 0;

    let rows = "";

    list.forEach(p=>{

      const status = norm(p.status);
      const pr = price(status);

      total += pr;

      rows += `
      <tr class="${status.toLowerCase()}">
        <td>${p.clientName || "-"}</td>
        <td>${p.clientPhone || "-"}</td>
        <td>${status}</td>
        <td>$${pr}</td>
      </tr>
      `;
    });

    const t0 = list[0];

    wrap.innerHTML += `
    <div class="trip-box">

      <div class="trip-header">
        <div>${key}</div>
        <div>${t0.tripDate || ""} | ${Math.round(t0.miles || 0)} mi</div>
      </div>

      <table>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Status</th>
          <th>Price</th>
        </tr>

        ${rows}
      </table>

      <div class="total">
        TOTAL: $${total}
      </div>

    </div>
    `;
  });

}

/* INIT */
load();