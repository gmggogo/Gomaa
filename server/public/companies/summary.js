// =========================================
// SUMMARY.JS
// FINAL PROFESSIONAL VERSION
// =========================================

let allTrips = [];
let COMPANY_SERVICES = [];
let currentTab = "TRIPS";

/* =========================================
LOAD
========================================= */

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

    fixCurrentTab();

    buildTabs();

    render();

  }catch(err){

    console.log(err);

  }

}

/* =========================================
SERVICES
========================================= */

async function loadServices(){

  try{

    const token =
      localStorage.getItem("token") || "";

    const res =
      await fetch(
        "/api/services",
        {
          headers:{
            Authorization:
            "Bearer " + token
          }
        }
      );

    const data =
      await res.json();

    COMPANY_SERVICES =
      Array.isArray(data)
      ? data.filter(
          s =>
            s.enabled === true &&
            s.companyEnabled === true
        )
      : [];

  }catch(err){

    console.log(err);

    COMPANY_SERVICES = [];

  }

}

/* =========================================
HELPERS
========================================= */

function normalize(v){

  return String(v || "")
    .trim();

}

function cleanCode(v){

  return normalize(v)
    .replace(/^-/,"")
    .toUpperCase();

}

function getTripSuffix(trip){

  const direct =
    cleanCode(
      trip.serviceSuffix ||
      trip.serviceCode ||
      trip.serviceType
    );

  if(direct){
    return direct;
  }

  const parts =
    String(
      trip.tripNumber || ""
    ).split("-");

  if(parts.length > 1){

    return cleanCode(
      parts[
        parts.length - 1
      ]
    );

  }

  return "ST";

}

function isSharedTrip(trip){

  return (
    trip.isShared === true ||

    cleanCode(
      trip.tripType
    ) === "SHARED" ||

    getTripSuffix(trip) === "SH" ||

    (
      Array.isArray(
        trip.passengers
      ) &&
      trip.passengers.length > 0
    )
  );

}

function hasSharedTrips(){

  return allTrips.some(
    t => isSharedTrip(t)
  );

}

function hasNormalTrips(){

  return allTrips.some(
    t => !isSharedTrip(t)
  );

}

function fixCurrentTab(){

  if(
    currentTab === "SHARED" &&
    !hasSharedTrips()
  ){
    currentTab = "TRIPS";
  }

  if(
    currentTab === "TRIPS" &&
    !hasNormalTrips()
  ){
    currentTab = "SHARED";
  }

}

/* =========================================
FILTERS
========================================= */

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
        t.tripDate
          .split("-")[0]
      );

    }

  });

  year.innerHTML =
    `
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
    <option value="">
      All Months
    </option>

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

function getFilteredTrips(){

  const q =
    document
      .getElementById(
        "searchInput"
      )
      .value
      .toLowerCase()
      .trim();

  const year =
    document
      .getElementById(
        "yearFilter"
      )
      .value;

  const month =
    document
      .getElementById(
        "monthFilter"
      )
      .value;

  return allTrips.filter(t=>{

    let txt = `
      ${t.tripNumber || ""}
      ${t.company || ""}
      ${t.clientName || ""}
      ${t.clientPhone || ""}
    `;

    txt =
      txt.toLowerCase();

    if(
      q &&
      !txt.includes(q)
    ){
      return false;
    }

    if(t.tripDate){

      const parts =
        t.tripDate.split("-");

      if(
        year &&
        parts[0] !== year
      ){
        return false;
      }

      if(
        month &&
        parts[1] !== month
      ){
        return false;
      }

    }

    return true;

  });

}

/* =========================================
TABS
========================================= */

function buildTabs(){

  const wrap =
    document.getElementById(
      "dynamicTabs"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  const allData =
    getFilteredTrips();

  const tripsCount =
    allData.filter(
      t => !isSharedTrip(t)
    ).length;

  const sharedCount =
    allData.filter(
      t => isSharedTrip(t)
    ).length;

  if(hasNormalTrips()){

    wrap.innerHTML += `
      <button
        class="
          tab
          ${
            currentTab === "TRIPS"
            ? "active"
            : ""
          }
        "
        onclick="
          currentTab='TRIPS';
          buildTabs();
          render();
        "
      >
        Trips (${tripsCount})
      </button>
    `;

  }

  if(hasSharedTrips()){

    wrap.innerHTML += `
      <button
        class="
          tab
          ${
            currentTab === "SHARED"
            ? "active"
            : ""
          }
        "
        onclick="
          currentTab='SHARED';
          buildTabs();
          render();
        "
      >
        Shared (${sharedCount})
      </button>
    `;

  }

}

/* =========================================
TAB DATA
========================================= */

function getTripsByTab(){

  const data =
    getFilteredTrips();

  if(currentTab === "SHARED"){

    return data.filter(
      t => isSharedTrip(t)
    );

  }

  return data.filter(
    t => !isSharedTrip(t)
  );

}

/* =========================================
REVENUE
========================================= */

function isCompletedTrip(t){

  return (
    t.status === "Completed"
  );

}

function getTripRevenue(t){

  if(!isCompletedTrip(t)){
    return 0;
  }

  return Number(
    t.finalPrice ||
    t.priceAmount ||
    0
  );

}

function getTripMiles(t){

  if(!isCompletedTrip(t)){
    return 0;
  }

  return Number(
    t.miles || 0
  );

}

/* =========================================
STATS
========================================= */

function buildStats(){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  const allData =
    getFilteredTrips();

  /* =========================================
  GREEN SERVICE CARDS
  ========================================= */

  COMPANY_SERVICES.forEach(service=>{

    const suffix =
      cleanCode(
        service.companySuffix ||
        service.serviceCode ||
        service.code
      );

    if(!suffix){
      return;
    }

    let serviceTrips = [];

    if(suffix === "SH"){

      serviceTrips =
        allData.filter(
          t => isSharedTrip(t)
        );

    }else{

      serviceTrips =
        allData.filter(t => {

          if(isSharedTrip(t)){
            return false;
          }

          return (
            getTripSuffix(t) ===
            suffix
          );

        });

    }

    const completedTrips =
      serviceTrips.filter(
        t => isCompletedTrip(t)
      );

    const totalTrips =
      completedTrips.length;

    const totalMiles =
      completedTrips.reduce(
        (sum,t)=>
          sum +
          getTripMiles(t),
        0
      );

    const totalRevenue =
      completedTrips.reduce(
        (sum,t)=>
          sum +
          getTripRevenue(t),
        0
      );

    wrap.innerHTML += `

      <div class="stat">

        <div class="stat-title">
          ${
            service.title ||
            service.name ||
            suffix
          }
        </div>

        <div class="mini-grid">

          <div class="mini-box">

            <span>
              Trips
            </span>

            <strong>
              ${totalTrips}
            </strong>

          </div>

          <div class="mini-box">

            <span>
              Miles
            </span>

            <strong>
              ${totalMiles.toFixed(1)}
            </strong>

          </div>

        </div>

        <div class="revenue-box">

          <span>
            Revenue
          </span>

          <strong>
            $${totalRevenue.toFixed(2)}
          </strong>

        </div>

      </div>

    `;

  });

  /* =========================================
  FIXED BLUE CARDS
  ========================================= */

  const completed =
    allData.filter(
      t =>
        t.status ===
        "Completed"
    ).length;

  const cancelled =
    allData.filter(
      t =>
        t.status ===
        "Cancelled"
    ).length;

  const noShow =
    allData.filter(
      t =>
        t.status ===
        "NoShow"
    ).length;

  const revenue =
    allData.reduce(
      (sum,t)=>
        sum +
        getTripRevenue(t),
      0
    );

  const miles =
    allData.reduce(
      (sum,t)=>
        sum +
        getTripMiles(t),
      0
    );

  const fixedCards = [

    {
      title:"Completed",
      value:completed
    },

    {
      title:"Cancelled",
      value:cancelled
    },

    {
      title:"No Show",
      value:noShow
    },

    {
      title:"Revenue",
      value:
      "$" +
      revenue.toFixed(2)
    },

    {
      title:"Miles",
      value:
      miles.toFixed(1)
    }

  ];

  fixedCards.forEach(card=>{

    wrap.innerHTML += `

      <div class="
        stat
        total-card
      ">

        <div class="stat-title">
          ${card.title}
        </div>

        <div class="stat-value">
          ${card.value}
        </div>

      </div>

    `;

  });

}

/* =========================================
STATUS
========================================= */

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
      ${status || "Scheduled"}
    </span>
  `;

}

/* =========================================
GROUP
========================================= */

function groupByDay(data){

  const groups = {};

  data.forEach(t=>{

    const day =
      t.tripDate || "Unknown";

    if(!groups[day]){
      groups[day] = [];
    }

    groups[day].push(t);

  });

  return groups;

}

/* =========================================
RENDER
========================================= */

function render(){

  buildTabs();

  buildStats();

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  wrap.innerHTML = "";

  const trips =
    getTripsByTab();

  const groups =
    groupByDay(trips);

  Object.keys(groups)
    .sort(
      (a,b)=>
        new Date(b) -
        new Date(a)
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

            <td>
              ${t.tripNumber || "-"}
            </td>

            <td>
              ${t.clientName || "-"}
            </td>

            <td>
              ${t.clientPhone || "-"}
            </td>

            <td>
              ${t.pickup || "-"}
            </td>

            <td>
              ${t.dropoff || "-"}
            </td>

            <td>
              ${t.tripDate || "-"}
            </td>

            <td>
              ${t.tripTime || "-"}
            </td>

            <td>
              ${
                isCompletedTrip(t)
                ? (t.miles || 0)
                : 0
              }
            </td>

            <td>
              ${statusHTML(t.status)}
            </td>

            <td class="total">

              ${
                isCompletedTrip(t)
                ? "$" +
                  getTripRevenue(t)
                : "$0"
              }

            </td>

          </tr>

        `;

      });

    });

}

/* =========================================
EVENTS
========================================= */

document.addEventListener(
  "input",
  e=>{

  if(
    e.target.id ===
    "searchInput"
  ){

    buildTabs();

    render();

  }

});

document.addEventListener(
  "change",
  e=>{

  if(
    e.target.id ===
    "yearFilter" ||

    e.target.id ===
    "monthFilter"
  ){

    buildTabs();

    render();

  }

});

/* =========================================
AUTO
========================================= */

setInterval(
  load,
  30000
);

/* =========================================
INIT
========================================= */

load();