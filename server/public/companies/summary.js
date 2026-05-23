// summary.js

let allTrips = [];
let COMPANY_SERVICES = [];
let currentTab = "TRIPS";

/* =========================
LOAD
========================= */

async function load(){

  try{

    const company =
      localStorage.getItem("name") || "";

    await loadServices();

    const res =
      await fetch(
        `/api/trips/summary?company=${encodeURIComponent(company)}`
      );

    allTrips =
      await res.json();

    buildFilters();
    buildTabs();
    buildServiceCards();
    buildTotalsCards();
    renderTable();

  }catch(err){

    console.log(err);

  }

}

/* =========================
SERVICES
========================= */

async function loadServices(){

  try{

    const token =
      localStorage.getItem("token") || "";

    const res =
      await fetch("/api/services",{
        headers:{
          Authorization:
          "Bearer " + token
        }
      });

    const data =
      await res.json();

    COMPANY_SERVICES =
      Array.isArray(data)
      ? data.filter(s =>
          s.enabled === true &&
          s.companyEnabled === true
        )
      : [];

  }catch(err){

    console.log(err);
    COMPANY_SERVICES = [];

  }

}

/* =========================
HELPERS
========================= */

function clean(v){

  return String(v || "")
    .trim()
    .toUpperCase();

}

function getTripCode(trip){

  const num =
    String(
      trip.tripNumber || ""
    );

  const parts =
    num.split("-");

  return clean(
    parts[parts.length - 1]
  );

}

function isSharedTrip(trip){

  return (
    getTripCode(trip) === "SH" ||
    trip.isShared === true
  );

}

function getFilteredTrips(){

  const q =
    document
      .getElementById("searchInput")
      .value
      .toLowerCase()
      .trim();

  const year =
    document
      .getElementById("yearFilter")
      .value;

  const month =
    document
      .getElementById("monthFilter")
      .value;

  return allTrips.filter(t=>{

    let txt = `
      ${t.tripNumber || ""}
      ${t.clientName || ""}
      ${t.clientPhone || ""}
      ${t.company || ""}
    `.toLowerCase();

    if(q && !txt.includes(q)){
      return false;
    }

    if(t.tripDate){

      const parts =
        t.tripDate.split("-");

      if(year && parts[0] !== year){
        return false;
      }

      if(month && parts[1] !== month){
        return false;
      }

    }

    if(currentTab === "TRIPS"){
      return !isSharedTrip(t);
    }

    return isSharedTrip(t);

  });

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

  if(year.options.length){
    return;
  }

  const years =
    new Set();

  allTrips.forEach(t=>{

    if(t.tripDate){

      years.add(
        t.tripDate.split("-")[0]
      );

    }

  });

  year.innerHTML =
    `<option value="">
      All Years
    </option>`;

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

}

/* =========================
TABS
========================= */

function buildTabs(){

  const wrap =
    document.getElementById(
      "dynamicTabs"
    );

  const tripsCount =
    allTrips.filter(t =>
      !isSharedTrip(t)
    ).length;

  const sharedCount =
    allTrips.filter(t =>
      isSharedTrip(t)
    ).length;

  wrap.innerHTML = `
    <button
    class="tab ${
      currentTab === "TRIPS"
      ? "active"
      : ""
    }"
    onclick="
      currentTab='TRIPS';
      buildTabs();
      buildServiceCards();
      buildTotalsCards();
      renderTable();
    ">
      Trips (${tripsCount})
    </button>

    <button
    class="tab ${
      currentTab === "SHARED"
      ? "active"
      : ""
    }"
    onclick="
      currentTab='SHARED';
      buildTabs();
      buildServiceCards();
      buildTotalsCards();
      renderTable();
    ">
      Shared (${sharedCount})
    </button>
  `;

}

/* =========================
SERVICE CARDS
========================= */

function buildServiceCards(){

  const wrap =
    document.getElementById(
      "servicesRow"
    );

  const trips =
    getFilteredTrips();

  wrap.innerHTML = "";

  COMPANY_SERVICES.forEach(service=>{

    const code =
      clean(
        service.companySuffix ||
        service.serviceSuffix ||
        service.code ||
        ""
      );

    const serviceTrips =
      trips.filter(t =>
        getTripCode(t) === code
      );

    let miles = 0;
    let revenue = 0;

    serviceTrips.forEach(t=>{

      if(
        t.status === "Completed"
      ){

        miles += Number(
          t.miles || 0
        );

        revenue += Number(
          t.finalPrice || 0
        );

      }

    });

    wrap.innerHTML += `
      <div class="service-card">

        <div class="card-title">
          ${service.title || code}
        </div>

        <div class="card-line">
          Trips ${serviceTrips.length}
        </div>

        <div class="card-line">
          Miles ${miles.toFixed(1)}
        </div>

        <div class="card-line">
          Revenue $${revenue.toFixed(2)}
        </div>

      </div>
    `;

  });

}

/* =========================
TOTALS
========================= */

function buildTotalsCards(){

  const wrap =
    document.getElementById(
      "totalsRow"
    );

  const trips =
    getFilteredTrips();

  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let revenue = 0;
  let miles = 0;

  trips.forEach(t=>{

    if(t.status === "Completed"){

      completed++;

      revenue += Number(
        t.finalPrice || 0
      );

      miles += Number(
        t.miles || 0
      );

    }

    if(t.status === "Cancelled"){
      cancelled++;
    }

    if(t.status === "NoShow"){
      noshow++;
    }

  });

  wrap.innerHTML = `

    <div class="total-card">
      <div class="card-title">
        Completed
      </div>
      <div class="big">
        ${completed}
      </div>
    </div>

    <div class="total-card">
      <div class="card-title">
        Cancelled
      </div>
      <div class="big">
        ${cancelled}
      </div>
    </div>

    <div class="total-card">
      <div class="card-title">
        No Show
      </div>
      <div class="big">
        ${noshow}
      </div>
    </div>

    <div class="total-card">
      <div class="card-title">
        Revenue
      </div>
      <div class="big">
        $${revenue.toFixed(2)}
      </div>
    </div>

    <div class="total-card">
      <div class="card-title">
        Miles
      </div>
      <div class="big">
        ${miles.toFixed(1)}
      </div>
    </div>

  `;

}

/* =========================
STATUS
========================= */

function statusHTML(status){

  let cls = "";

  if(status === "Completed"){
    cls = "completed";
  }

  if(status === "Cancelled"){
    cls = "cancelled";
  }

  if(status === "NoShow"){
    cls = "noshow";
  }

  return `
    <span class="status ${cls}">
      ${status || "-"}
    </span>
  `;

}

/* =========================
TABLE
========================= */

function renderTable(){

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  const trips =
    getFilteredTrips();

  const groups = {};

  trips.forEach(t=>{

    const d =
      t.tripDate || "Unknown";

    if(!groups[d]){
      groups[d] = [];
    }

    groups[d].push(t);

  });

  wrap.innerHTML = "";

  Object.keys(groups)
  .sort((a,b)=>
    new Date(b)-new Date(a)
  )
  .forEach(day=>{

    wrap.innerHTML += `
      <div class="day-title">
        ${day}
      </div>

      <div class="table-wrap">

        <table class="summary-table">

          <thead>

            <tr>

              <th>Trip#</th>
              <th>Passenger</th>
              <th>Phone</th>
              <th>Pickup</th>
              <th>Dropoff</th>
              <th>Date</th>
              <th>Time</th>
              <th>Miles</th>
              <th>Status</th>
              <th>Price</th>

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

    groups[day]
    .forEach(t=>{

      tbody.innerHTML += `
        <tr>

          <td>${t.tripNumber || "-"}</td>

          <td>${t.clientName || "-"}</td>

          <td>${t.clientPhone || "-"}</td>

          <td>${t.pickup || "-"}</td>

          <td>${t.dropoff || "-"}</td>

          <td>${t.tripDate || "-"}</td>

          <td>${t.tripTime || "-"}</td>

          <td>${t.miles || 0}</td>

          <td>
            ${statusHTML(t.status)}
          </td>

          <td>
            $${t.finalPrice || 0}
          </td>

        </tr>
      `;

    });

  });

}

/* =========================
EVENTS
========================= */

document.addEventListener(
  "input",
  ()=>{
    buildServiceCards();
    buildTotalsCards();
    renderTable();
  }
);

document.addEventListener(
  "change",
  ()=>{
    buildServiceCards();
    buildTotalsCards();
    renderTable();
  }
);

/* =========================
AUTO
========================= */

setInterval(load,30000);

/* =========================
INIT
========================= */

load();