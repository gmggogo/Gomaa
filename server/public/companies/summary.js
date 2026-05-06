// summary.js

let allTrips = [];
let mode = "individual";

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

/* TAB */

function switchTab(m,btn){

  mode = m;

  document
    .querySelectorAll(".tab")
    .forEach(t=>t.classList.remove("active"));

  btn.classList.add("active");

  render();
}

/* NORMALIZE */

function norm(status){

  if(!status) return "";

  status = status.toLowerCase();

  if(status.includes("cancel"))
    return "Cancelled";

  if(status.includes("noshow"))
    return "NoShow";

  if(status.includes("no show"))
    return "NoShow";

  if(status.includes("complete"))
    return "Completed";

  return "Scheduled";
}

/* PRICE */

function price(status){

  if(status === "Cancelled") return 15;

  if(status === "NoShow") return 15;

  return 0;
}

/* STATS */

function updateStats(data){

  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let total = 0;

  data.forEach(t=>{

    const s = norm(t.status);

    if(s === "Completed") completed++;
    if(s === "Cancelled") cancelled++;
    if(s === "NoShow") noshow++;

    total += price(s);

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
    `$${total}`;
}

/* FILTER */

function getFiltered(){

  return allTrips.filter(t=>{

    const s = norm(t.status);

    return (
      s === "Completed" ||
      s === "Cancelled" ||
      s === "NoShow"
    );

  });

}

/* RENDER */

function render(){

  const wrap = document.getElementById("content");

  wrap.innerHTML = "";

  const data = getFiltered();

  updateStats(data);

  if(mode === "individual"){
    renderIndividual(data,wrap);
  }else{
    renderShared(data,wrap);
  }

}

/* =========================
   INDIVIDUAL
========================= */

function renderIndividual(data,wrap){

  const trips = data.filter(t=>{

    const n = (t.tripNumber || "").toUpperCase();

    return !n.endsWith("-SH");

  });

  if(!trips.length){

    wrap.innerHTML = `
    <div class="empty-box">
      No Individual Trips
    </div>
    `;

    return;
  }

  trips.forEach(t=>{

    const s = norm(t.status);

    const pr = price(s);

    let cardClass = "";
    let badgeClass = "";

    if(s === "Completed"){
      cardClass = "completed-card";
      badgeClass = "completed-badge";
    }

    if(s === "Cancelled"){
      cardClass = "cancelled-card";
      badgeClass = "cancelled-badge";
    }

    if(s === "NoShow"){
      cardClass = "noshow-card";
      badgeClass = "noshow-badge";
    }

    wrap.innerHTML += `
    <div class="trip-box">

      <div class="trip-header">

        <div class="trip-number">
          ${t.tripNumber || "-"}
        </div>

        <div class="trip-info">
          ${t.tripDate || ""}
          ${t.tripTime ? `| ${t.tripTime}` : ""}
          | ${Math.round(t.miles || 0)} mi
        </div>

      </div>

      <div class="passengers">

        <div class="passenger-card ${cardClass}">

          <div class="passenger-top">

            <div class="passenger-name">
              ${t.clientName || "-"}
            </div>

            <div class="status-badge ${badgeClass}">
              ${s}
            </div>

          </div>

          <div class="passenger-grid">

            <div class="info-box">
              <div class="info-label">Phone</div>
              <div class="info-value">
                ${t.clientPhone || "-"}
              </div>
            </div>

            <div class="info-box">
              <div class="info-label">Price</div>
              <div class="info-value">
                $${pr}
              </div>
            </div>

          </div>

        </div>

      </div>

      <div class="trip-total">

        <div>TOTAL</div>

        <div>$${pr}</div>

      </div>

    </div>
    `;
  });
}

/* =========================
   SHARED
========================= */

function renderShared(data,wrap){

  const trips = data.filter(t=>{

    const n = (t.tripNumber || "").toUpperCase();

    return n.endsWith("-SH");

  });

  if(!trips.length){

    wrap.innerHTML = `
    <div class="empty-box">
      No Shared Trips
    </div>
    `;

    return;
  }

  /* GROUP */

  const groups = {};

  trips.forEach(t=>{

    if(!groups[t.tripNumber]){
      groups[t.tripNumber] = [];
    }

    groups[t.tripNumber].push(t);

  });

  Object.keys(groups).forEach(key=>{

    const list = groups[key];

    let total = 0;

    let html = "";

    list.forEach(p=>{

      const s = norm(p.status);

      const pr = price(s);

      total += pr;

      let cardClass = "";
      let badgeClass = "";

      if(s === "Completed"){
        cardClass = "completed-card";
        badgeClass = "completed-badge";
      }

      if(s === "Cancelled"){
        cardClass = "cancelled-card";
        badgeClass = "cancelled-badge";
      }

      if(s === "NoShow"){
        cardClass = "noshow-card";
        badgeClass = "noshow-badge";
      }

      html += `
      <div class="passenger-card ${cardClass}">

        <div class="passenger-top">

          <div class="passenger-name">
            ${p.clientName || "-"}
          </div>

          <div class="status-badge ${badgeClass}">
            ${s}
          </div>

        </div>

        <div class="passenger-grid">

          <div class="info-box">
            <div class="info-label">Phone</div>
            <div class="info-value">
              ${p.clientPhone || "-"}
            </div>
          </div>

          <div class="info-box">
            <div class="info-label">Price</div>
            <div class="info-value">
              $${pr}
            </div>
          </div>

        </div>

      </div>
      `;
    });

    const first = list[0];

    wrap.innerHTML += `
    <div class="trip-box">

      <div class="trip-header">

        <div class="trip-number">
          ${key}
        </div>

        <div class="trip-info">

          ${first.tripDate || ""}
          ${first.tripTime ? `| ${first.tripTime}` : ""}
          | ${Math.round(first.miles || 0)} mi
          | ${list.length} Passengers

        </div>

      </div>

      <div class="passengers">

        ${html}

      </div>

      <div class="trip-total">

        <div>TOTAL TRIP</div>

        <div>$${total}</div>

      </div>

    </div>
    `;
  });
}

/* AUTO REFRESH */

setInterval(load,30000);

/* INIT */

load();