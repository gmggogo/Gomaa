let allTrips = [];

/* LOAD */
async function load(){

  try{

    const res = await fetch("/api/trips/summary");

    allTrips = await res.json();

    render();

  }catch(err){

    console.error(err);

  }

}

/* STATUS */
function normalizeStatus(status){

  if(!status) return "Completed";

  status = String(status).toLowerCase();

  if(status.includes("cancel"))
    return "Cancelled";

  if(status.includes("noshow"))
    return "NoShow";

  if(status.includes("no show"))
    return "NoShow";

  return "Completed";
}

/* PRICE */
function getPrice(status){

  if(status === "Cancelled") return 15;

  if(status === "NoShow") return 15;

  return 0;
}

/* SEARCH */
function getFilteredTrips(){

  const q = document
    .getElementById("searchInput")
    .value
    .toLowerCase()
    .trim();

  return allTrips.filter(t=>{

    const txt = `
      ${t.tripNumber || ""}
      ${t.companyName || ""}
      ${t.entryName || ""}
      ${t.entryPhone || ""}
      ${t.clientName || ""}
      ${t.clientPhone || ""}
    `.toLowerCase();

    return txt.includes(q);

  });

}

/* STATS */
function updateStats(data){

  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let revenue = 0;

  data.forEach(t=>{

    const s = normalizeStatus(t.status);

    if(s === "Completed") completed++;

    if(s === "Cancelled") cancelled++;

    if(s === "NoShow") noshow++;

    revenue += getPrice(s);

  });

  document.getElementById("totalTrips").innerText =
    data.length;

  document.getElementById("completedTrips").innerText =
    completed;

  document.getElementById("cancelledTrips").innerText =
    cancelled;

  document.getElementById("noShowTrips").innerText =
    noshow;

  document.getElementById("totalRevenue").innerText =
    `$${revenue}`;
}

/* GROUP BY DAY */
function groupByDay(data){

  const groups = {};

  data.forEach(t=>{

    const day = t.tripDate || "Unknown";

    if(!groups[day]){
      groups[day] = [];
    }

    groups[day].push(t);

  });

  return groups;
}

/* RENDER */
function render(){

  const wrap =
    document.getElementById("summaryContent");

  wrap.innerHTML = "";

  const data = getFilteredTrips();

  updateStats(data);

  const groups = groupByDay(data);

  Object.keys(groups).forEach(day=>{

    wrap.innerHTML += `
      <div class="day-title">
        ${day}
      </div>

      <div class="table-wrap">

      <table class="summary-table">

        <thead>
          <tr>

            <th>#</th>
            <th>Trip#</th>
            <th>Company</th>
            <th>Entry</th>
            <th>Entry Phone</th>
            <th>Passengers</th>
            <th>Phones</th>
            <th>Pickup</th>
            <th>Dropoff</th>
            <th>Trip Date</th>
            <th>Trip Time</th>
            <th>Book Date</th>
            <th>Book Time</th>
            <th>Miles</th>
            <th>Status</th>
            <th>Price</th>
            <th>Total</th>

          </tr>
        </thead>

        <tbody id="body-${day.replaceAll('/','')}"></tbody>

      </table>

      </div>
    `;

    renderRows(
      groups[day],
      document.getElementById(
        `body-${day.replaceAll('/','')}`
      )
    );

  });

}

/* ROWS */
function renderRows(data,tbody){

  const sharedMap = {};

  data.forEach(t=>{

    const tripNum = t.tripNumber || "";

    if(tripNum.toUpperCase().endsWith("-SH")){

      if(!sharedMap[tripNum]){
        sharedMap[tripNum] = [];
      }

      sharedMap[tripNum].push(t);

    }else{

      renderSingle(tbody,t);

    }

  });

  Object.keys(sharedMap)
    .forEach(key=>{

      renderShared(
        tbody,
        sharedMap[key]
      );

    });

}

/* SINGLE */
function renderSingle(tbody,t){

  const s = normalizeStatus(t.status);

  const p = getPrice(s);

  tbody.innerHTML += `
  <tr>

    <td>1</td>

    <td>${t.tripNumber || "-"}</td>

    <td>${t.companyName || "-"}</td>

    <td>${t.entryName || "-"}</td>

    <td>${t.entryPhone || "-"}</td>

    <td>${t.clientName || "-"}</td>

    <td>${t.clientPhone || "-"}</td>

    <td>${t.pickupAddress || "-"}</td>

    <td>${t.dropoffAddress || "-"}</td>

    <td>${t.tripDate || "-"}</td>

    <td>${t.tripTime || "-"}</td>

    <td>${t.createdDate || "-"}</td>

    <td>${t.createdTime || "-"}</td>

    <td>${Math.round(t.miles || 0)}</td>

    <td>
      <span class="status ${s.toLowerCase()}">
        ${s}
      </span>
    </td>

    <td>$${p}</td>

    <td class="total-cell">$${p}</td>

  </tr>
  `;
}

/* SHARED */
function renderShared(tbody,list){

  const first = list[0];

  let passengers = "";
  let phones = "";
  let pickups = "";
  let dropoffs = "";
  let statuses = "";
  let prices = "";

  let total = 0;

  list.forEach(p=>{

    const s = normalizeStatus(p.status);

    const pr = getPrice(s);

    total += pr;

    passengers += `
      <div>${p.clientName || "-"}</div>
    `;

    phones += `
      <div>${p.clientPhone || "-"}</div>
    `;

    pickups += `
      <div>${p.pickupAddress || "-"}</div>
    `;

    dropoffs += `
      <div>${p.dropoffAddress || "-"}</div>
    `;

    statuses += `
      <span class="status ${s.toLowerCase()}">
        ${s}
      </span>
    `;

    prices += `
      <div>$${pr}</div>
    `;

  });

  tbody.innerHTML += `
  <tr>

    <td>1</td>

    <td>${first.tripNumber || "-"}</td>

    <td>${first.companyName || "-"}</td>

    <td>${first.entryName || "-"}</td>

    <td>${first.entryPhone || "-"}</td>

    <td><div class="stack">${passengers}</div></td>

    <td><div class="stack">${phones}</div></td>

    <td><div class="stack">${pickups}</div></td>

    <td><div class="stack">${dropoffs}</div></td>

    <td>${first.tripDate || "-"}</td>

    <td>${first.tripTime || "-"}</td>

    <td>${first.createdDate || "-"}</td>

    <td>${first.createdTime || "-"}</td>

    <td>${Math.round(first.miles || 0)}</td>

    <td><div class="stack">${statuses}</div></td>

    <td><div class="stack">${prices}</div></td>

    <td class="total-cell">$${total}</td>

  </tr>
  `;
}

/* SEARCH */
document.addEventListener("input",e=>{

  if(e.target.id === "searchInput"){
    render();
  }

});

/* AUTO */
setInterval(load,30000);

/* INIT */
load();