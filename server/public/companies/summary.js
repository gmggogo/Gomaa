// summary.js

let allTrips = [];

let currentTab = "individual";

/* =========================
LOAD
========================= */

async function load(){

  try{

    const company =
      localStorage.getItem("name") || "";

    const res =
      await fetch(
        `/api/trips/summary?company=${encodeURIComponent(company)}`
      );

    if(!res.ok){
      throw new Error("Failed loading summary");
    }

    allTrips =
      await res.json();

    if(!Array.isArray(allTrips)){
      allTrips = [];
    }

    buildFilters();

    render();

  }catch(err){

    console.log(err);

    const wrap =
      document.getElementById(
        "summaryContent"
      );

    if(wrap){

      wrap.innerHTML = `
        <div class="empty-state">
          Failed To Load Trips
        </div>
      `;

    }

  }

}

/* =========================
HELPERS
========================= */

function isSharedTrip(trip){

  return trip?.isShared === true;

}

function getPrice(obj){

  return Number(
    obj?.finalPrice ||
    obj?.priceAmount ||
    obj?.price ||
    0
  );

}

function getPassengerPrice(p){

  if(
    p?.status === "Cancelled" ||
    p?.status === "NoShow"
  ){
    return 15;
  }

  return getPrice(p);

}

function getTripPrice(t){

  if(
    t?.status === "Cancelled" ||
    t?.status === "NoShow"
  ){
    return 15;
  }

  return getPrice(t);

}

function safeText(v){

  return String(v || "")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");

}

/* =========================
TAB
========================= */

function switchTab(tab,btn){

  currentTab = tab;

  document
    .querySelectorAll(".tab")
    .forEach(t=>
      t.classList.remove("active")
    );

  if(btn){
    btn.classList.add("active");
  }

  render();

}

/* =========================
FILTERS
========================= */

function buildFilters(){

  const year =
    document.getElementById(
      "yearFilter"
    );

  const month =
    document.getElementById(
      "monthFilter"
    );

  if(!year || !month){
    return;
  }

  if(year.dataset.loaded === "true"){
    return;
  }

  const years =
    new Set();

  allTrips.forEach(t=>{

    if(t.tripDate){

      const y =
        String(t.tripDate)
        .split("-")[0];

      if(y){
        years.add(y);
      }

    }

  });

  year.innerHTML = `
    <option value="">
      All Years
    </option>
  `;

  [...years]
  .sort((a,b)=>b-a)
  .forEach(y=>{

    year.innerHTML += `
      <option value="${y}">
        ${y}
      </option>
    `;

  });

  month.innerHTML = `
    <option value="">All Months</option>
    <option value="01">January</option>
    <option value="02">February</option>
    <option value="03">March</option>
    <option value="04">April</option>
    <option value="05">May</option>
    <option value="06">June</option>
    <option value="07">July</option>
    <option value="08">August</option>
    <option value="09">September</option>
    <option value="10">October</option>
    <option value="11">November</option>
    <option value="12">December</option>
  `;

  year.dataset.loaded = "true";

}

/* =========================
FILTER
========================= */

function getFilteredTrips(){

  const q =
    document
      .getElementById("searchInput")
      ?.value
      ?.toLowerCase()
      ?.trim() || "";

  const year =
    document
      .getElementById("yearFilter")
      ?.value || "";

  const month =
    document
      .getElementById("monthFilter")
      ?.value || "";

  let data =
    allTrips.filter(t=>{

      let txt = `
        ${t.tripNumber || ""}
        ${t.company || ""}
        ${t.entryName || ""}
        ${t.entryPhone || ""}
        ${t.clientName || ""}
        ${t.clientPhone || ""}
      `;

      if(Array.isArray(t.passengers)){

        t.passengers.forEach(p=>{

          txt += `
            ${p.clientName || ""}
            ${p.clientPhone || ""}
          `;

        });

      }

      txt =
        txt.toLowerCase();

      if(q && !txt.includes(q)){
        return false;
      }

      if(t.tripDate){

        const parts =
          String(t.tripDate)
          .split("-");

        if(year && parts[0] !== year){
          return false;
        }

        if(month && parts[1] !== month){
          return false;
        }

      }

      return true;

    });

  if(currentTab === "individual"){

    data =
      data.filter(t =>
        !isSharedTrip(t)
      );

  }else{

    data =
      data.filter(t =>
        isSharedTrip(t)
      );

  }

  return data;

}

/* =========================
GROUP
========================= */

function groupByDay(data){

  const groups = {};

  data.forEach(t=>{

    const d =
      t.tripDate || "Unknown";

    if(!groups[d]){
      groups[d] = [];
    }

    groups[d].push(t);

  });

  return groups;

}

/* =========================
STATUS
========================= */

function statusHTML(status){

  let cls = "";

  if(status === "Completed"){
    cls = "completed";
  }

  else if(status === "Cancelled"){
    cls = "cancelled";
  }

  else if(status === "NoShow"){
    cls = "noshow";
  }

  return `
    <span class="status ${cls}">
      ${safeText(status || "-")}
    </span>
  `;

}

/* =========================
STATS
========================= */

function updateStats(data){

  let totalTrips = 0;

  let individual = 0;

  let shared = 0;

  let completed = 0;

  let cancelled = 0;

  let noshow = 0;

  let revenue = 0;

  let miles = 0;

  data.forEach(t=>{

    /* =========================
    SHARED
    ========================= */

    if(isSharedTrip(t)){

      shared++;

      (t.passengers || [])
      .forEach(p=>{

        totalTrips++;

        if(p.status === "Completed"){
          completed++;
        }

        if(p.status === "Cancelled"){
          cancelled++;
        }

        if(p.status === "NoShow"){
          noshow++;
        }

        revenue += getPassengerPrice(p);

        miles += Number(
          t.miles || 0
        );

      });

    }

    /* =========================
    INDIVIDUAL
    ========================= */

    else{

      totalTrips++;

      individual++;

      if(t.status === "Completed"){
        completed++;
      }

      if(t.status === "Cancelled"){
        cancelled++;
      }

      if(t.status === "NoShow"){
        noshow++;
      }

      revenue += getTripPrice(t);

      miles += Number(
        t.miles || 0
      );

    }

  });

  /* =========================
  GREEN CARDS
  ========================= */

  const servicesWrap =
    document.querySelector(
      ".services-stats"
    );

  if(servicesWrap){

    servicesWrap.innerHTML = `

      <div class="stat">

        <div class="stat-title">
          Individual Trips
        </div>

        <div class="stat-lines">
          Trips ${individual}<br>
          Revenue $${revenue.toFixed(2)}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          Shared Trips
        </div>

        <div class="stat-lines">
          Groups ${shared}<br>
          Passengers ${totalTrips}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          Completed
        </div>

        <div class="stat-lines">
          Trips ${completed}<br>
          Miles ${miles.toFixed(1)}
        </div>

      </div>

    `;

  }

  /* =========================
  BLUE CARDS
  ========================= */

  const totalsWrap =
    document.querySelector(
      ".totals-stats"
    );

  if(totalsWrap){

    totalsWrap.innerHTML = `

      <div class="stat">

        <div class="stat-title">
          Total Trips
        </div>

        <div class="stat-value">
          ${totalTrips}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          Completed
        </div>

        <div class="stat-value">
          ${completed}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          Cancelled
        </div>

        <div class="stat-value">
          ${cancelled}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          No Show
        </div>

        <div class="stat-value">
          ${noshow}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          Revenue
        </div>

        <div class="stat-value">
          $${revenue.toFixed(2)}
        </div>

      </div>

    `;

  }

}

/* =========================
RENDER
========================= */

function render(){

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  if(!wrap){
    return;
  }

  wrap.innerHTML = "";

  const data =
    getFilteredTrips();

  updateStats(data);

  const groups =
    groupByDay(data);

  const sortedDays =
    Object.keys(groups)
    .sort((a,b)=>
      new Date(b) - new Date(a)
    );

  if(!sortedDays.length){

    wrap.innerHTML = `
      <div class="empty-state">
        No Trips Found
      </div>
    `;

    return;

  }

  sortedDays.forEach(day=>{

    wrap.innerHTML += `

      <div class="day-title">
        ${safeText(day)}
      </div>

      <div class="table-wrap">

      <table class="summary-table">

        <thead>

          <tr>

            <th>Trip#</th>
            <th>Company</th>
            <th>Entry</th>
            <th>Entry Phone</th>
            <th>Passenger</th>
            <th>Phone</th>
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

        <tbody id="tbody-${day}">
        </tbody>

      </table>

      </div>

    `;

    const tbody =
      document.getElementById(
        `tbody-${day}`
      );

    if(!tbody){
      return;
    }

    groups[day].forEach(t=>{

      /* =========================
      INDIVIDUAL
      ========================= */

      if(!isSharedTrip(t)){

        const total =
          getTripPrice(t);

        tbody.innerHTML += `

        <tr>

          <td>${safeText(t.tripNumber || "-")}</td>
          <td>${safeText(t.company || "-")}</td>
          <td>${safeText(t.entryName || "-")}</td>
          <td>${safeText(t.entryPhone || "-")}</td>
          <td>${safeText(t.clientName || "-")}</td>
          <td>${safeText(t.clientPhone || "-")}</td>
          <td>${safeText(t.pickup || "-")}</td>
          <td>${safeText(t.dropoff || "-")}</td>
          <td>${safeText(t.tripDate || "-")}</td>
          <td>${safeText(t.tripTime || "-")}</td>
          <td>${safeText(t.bookingDate || "-")}</td>
          <td>${safeText(t.bookingTime || "-")}</td>
          <td>${Number(t.miles || 0).toFixed(1)}</td>

          <td>
            ${statusHTML(t.status)}
          </td>

          <td class="total">
            $${total.toFixed(2)}
          </td>

          <td class="total">
            $${total.toFixed(2)}
          </td>

        </tr>

        <tr class="trip-divider-line">
          <td colspan="16"></td>
        </tr>

        <tr class="trip-divider">
          <td colspan="16"></td>
        </tr>

        `;

      }

      /* =========================
      SHARED
      ========================= */

      else{

        const passengers =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        const sharedTotal =
          passengers.reduce((sum,p)=>{

            return (
              sum +
              getPassengerPrice(p)
            );

          },0);

        passengers.forEach((p,index)=>{

          const passengerPrice =
            getPassengerPrice(p);

          tbody.innerHTML += `

          <tr class="${
            index !== passengers.length - 1
            ? "shared-separator"
            : ""
          }">

            <td>
              ${
                index === 0
                ? safeText(t.tripNumber || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.company || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.entryName || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.entryPhone || "-")
                : ""
              }
            </td>

            <td>
              ${safeText(p.clientName || "-")}
            </td>

            <td>
              ${safeText(p.clientPhone || "-")}
            </td>

            <td>
              ${safeText(p.pickup || "-")}
            </td>

            <td>
              ${safeText(p.dropoff || "-")}
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.tripDate || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.tripTime || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.bookingDate || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? safeText(t.bookingTime || "-")
                : ""
              }
            </td>

            <td>
              ${
                index === 0
                ? Number(t.miles || 0).toFixed(1)
                : ""
              }
            </td>

            <td>
              ${statusHTML(
                p.status || "Scheduled"
              )}
            </td>

            <td class="total">
              $${passengerPrice.toFixed(2)}
            </td>

            <td class="total">
              ${
                index === 0
                ? `$${sharedTotal.toFixed(2)}`
                : ""
              }
            </td>

          </tr>

          `;

        });

        tbody.innerHTML += `

        <tr class="trip-divider-line">
          <td colspan="16"></td>
        </tr>

        <tr class="trip-divider">
          <td colspan="16"></td>
        </tr>

        `;

      }

    });

  });

}

/* =========================
EVENTS
========================= */

document.addEventListener("input",e=>{

  if(e.target.id === "searchInput"){
    render();
  }

});

document.addEventListener("change",e=>{

  if(
    e.target.id === "yearFilter" ||
    e.target.id === "monthFilter"
  ){
    render();
  }

});

/* =========================
AUTO RELOAD
========================= */

setInterval(load,30000);

/* =========================
INIT
========================= */

load();