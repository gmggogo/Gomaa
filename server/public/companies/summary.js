// summary.js

let allTrips = [];
let COMPANY_SERVICES = [];

let currentTab = "TRIPS";
let currentService = "ALL";

/* ================= LOAD ================= */

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

/* ================= SERVICES ================= */

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

/* ================= HELPERS ================= */

function normalize(v){

  return String(v ?? "")
    .trim();

}

function cleanCode(v){

  return normalize(v)
    .replace(/^-/,"")
    .toUpperCase();

}

function safe(v){

  return String(v ?? "-");

}

/* ================= SHARED ================= */

function isSharedTrip(t){

  return (
    t.isShared === true ||

    cleanCode(t.tripType)
      === "SHARED" ||

    String(
      t.tripNumber || ""
    )
    .toUpperCase()
    .includes("-SH") ||

    (
      Array.isArray(t.passengers) &&
      t.passengers.length > 0
    )
  );

}

/* ================= TRIP CODE ================= */

function getTripSuffix(trip){

  const parts =
    String(
      trip.tripNumber || ""
    )
    .split("-");

  return cleanCode(
    parts[
      parts.length - 1
    ]
  );

}

/* ================= TABS ================= */

function hasTrips(){

  return allTrips.some(
    t => !isSharedTrip(t)
  );

}

function hasShared(){

  return allTrips.some(
    t => isSharedTrip(t)
  );

}

function fixCurrentTab(){

  if(
    currentTab === "TRIPS" &&
    !hasTrips()
  ){
    currentTab = "SHARED";
  }

  if(
    currentTab === "SHARED" &&
    !hasShared()
  ){
    currentTab = "TRIPS";
  }

}

function buildTabs(){

  const wrap =
    document.getElementById(
      "dynamicTabs"
    );

  wrap.innerHTML = "";

  /* TRIPS */

  if(hasTrips()){

    const count =
      getFilteredTrips()
      .filter(
        t => !isSharedTrip(t)
      )
      .length;

    wrap.innerHTML += `
      <button
        class="tab ${
          currentTab === "TRIPS"
          ? "active"
          : ""
        }"
        onclick="
          currentTab='TRIPS';
          currentService='ALL';
          buildTabs();
          render();
        ">
        Trips (${count})
      </button>
    `;

  }

  /* SHARED */

  if(hasShared()){

    const count =
      getFilteredTrips()
      .filter(
        t => isSharedTrip(t)
      )
      .length;

    wrap.innerHTML += `
      <button
        class="tab ${
          currentTab === "SHARED"
          ? "active"
          : ""
        }"
        onclick="
          currentTab='SHARED';
          currentService='ALL';
          buildTabs();
          render();
        ">
        Shared (${count})
      </button>
    `;

  }

}

/* ================= FILTERS ================= */

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
    <option value="">
      All Months
    </option>

    <option value="01">
      January
    </option>

    <option value="02">
      February
    </option>

    <option value="03">
      March
    </option>

    <option value="04">
      April
    </option>

    <option value="05">
      May
    </option>

    <option value="06">
      June
    </option>

    <option value="07">
      July
    </option>

    <option value="08">
      August
    </option>

    <option value="09">
      September
    </option>

    <option value="10">
      October
    </option>

    <option value="11">
      November
    </option>

    <option value="12">
      December
    </option>
  `;

}

/* ================= FILTER ================= */

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
          ${p.name || ""}
          ${p.phone || ""}
        `;

      });

    }

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
        t.tripDate
          .split("-");

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

/* ================= TAB DATA ================= */

function getTripsData(){

  let data =
    getFilteredTrips();

  if(
    currentTab === "TRIPS"
  ){

    data =
      data.filter(
        t => !isSharedTrip(t)
      );

  }

  if(
    currentTab === "SHARED"
  ){

    data =
      data.filter(
        t => isSharedTrip(t)
      );

  }

  return data;

}

/* ================= MONEY ================= */

function getTripMoney(t){

  /* SHARED */

  if(isSharedTrip(t)){

    let total = 0;

    (t.passengers || [])
      .forEach(p=>{

        total += Number(
          p.price || 0
        );

      });

    return total;

  }

  /* NORMAL */

  return Number(
    t.finalPrice ||
    t.priceAmount ||
    0
  );

}

/* ================= VALID MILES ================= */

function getTripMiles(t){

  /* NO SHOW */

  if(
    t.status === "NoShow"
  ){
    return 0;
  }

  /* CANCELLED */

  if(
    t.status === "Cancelled"
  ){
    return 0;
  }

  return Number(
    t.miles || 0
  );

}

/* ================= STATUS ================= */

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

/* ================= STATS ================= */

function buildStats(){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  wrap.innerHTML = "";

  const tabTrips =
    getTripsData();

  /* ================= SERVICES ================= */

  COMPANY_SERVICES
    .forEach(service=>{

    const code =
      cleanCode(
        service.companySuffix ||
        service.serviceSuffix ||
        service.code ||
        service.serviceCode ||
        service.title
      );

    const serviceTrips =
      tabTrips.filter(t => {

        const suffix =
          getTripSuffix(t);

        return suffix === code;

      });

    const tripsCount =
      serviceTrips.length;

    const totalMiles =
      serviceTrips.reduce(
        (sum,t)=>
          sum +
          getTripMiles(t),
        0
      );

    const totalMoney =
      serviceTrips.reduce(
        (sum,t)=>
          sum +
          getTripMoney(t),
        0
      );

    wrap.innerHTML += `

      <div
        class="stat ${
          currentService === code
          ? "active"
          : ""
        }"

        onclick="
          currentService =
          currentService === '${code}'
          ? 'ALL'
          : '${code}';

          render();
        "

      >

        <div class="stat-title">
          ${
            service.title ||
            service.name ||
            code
          }
        </div>

        <div class="stat-grid">

          <div class="stat-box">

            <div class="stat-label">
              Trips
            </div>

            <div class="stat-number">
              ${tripsCount}
            </div>

          </div>

          <div class="stat-box">

            <div class="stat-label">
              Miles
            </div>

            <div class="stat-number">
              ${totalMiles.toFixed(1)}
            </div>

          </div>

          <div class="stat-box"
            style="
              grid-column:1/3;
            ">

            <div class="stat-label">
              Revenue
            </div>

            <div class="stat-number">
              $${totalMoney.toFixed(2)}
            </div>

          </div>

        </div>

      </div>

    `;

  });

  /* ================= TOTAL ================= */

  const totalTrips =
    tabTrips.length;

  const totalMiles =
    tabTrips.reduce(
      (sum,t)=>
        sum +
        getTripMiles(t),
      0
    );

  const totalMoney =
    tabTrips.reduce(
      (sum,t)=>
        sum +
        getTripMoney(t),
      0
    );

  wrap.innerHTML += `

    <div
      class="stat total-card">

      <div class="stat-title">
        Total Trips
      </div>

      <div class="stat-grid">

        <div class="stat-box">

          <div class="stat-label">
            Trips
          </div>

          <div class="stat-number">
            ${totalTrips}
          </div>

        </div>

        <div class="stat-box">

          <div class="stat-label">
            Miles
          </div>

          <div class="stat-number">
            ${totalMiles.toFixed(1)}
          </div>

        </div>

        <div class="stat-box"
          style="
            grid-column:1/3;
          ">

          <div class="stat-label">
            Revenue
          </div>

          <div class="stat-number">
            $${totalMoney.toFixed(2)}
          </div>

        </div>

      </div>

    </div>

  `;

}

/* ================= GROUP ================= */

function groupByDay(data){

  const groups = {};

  data.forEach(t=>{

    const d =
      t.tripDate ||
      "Unknown";

    if(!groups[d]){
      groups[d] = [];
    }

    groups[d].push(t);

  });

  return groups;

}

/* ================= RENDER ================= */

function render(){

  buildTabs();

  buildStats();

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  wrap.innerHTML = "";

  let trips =
    getTripsData();

  /* SERVICE FILTER */

  if(
    currentService !== "ALL"
  ){

    trips =
      trips.filter(t=>{

        const suffix =
          getTripSuffix(t);

        return (
          suffix ===
          currentService
        );

      });

  }

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

          <table
            class="summary-table">

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
                <th>Miles</th>
                <th>Status</th>
                <th>Price</th>

              </tr>

            </thead>

            <tbody
              id="tbody-${day}">
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

        /* ================= SHARED ================= */

        if(isSharedTrip(t)){

          const passengers =
            t.passengers || [];

          passengers.forEach((p,index)=>{

            tbody.innerHTML += `

              <tr>

                <td>
                  ${
                    index === 0
                    ? safe(
                        t.tripNumber
                      )
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? safe(
                        t.company
                      )
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? safe(
                        t.entryName
                      )
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? safe(
                        t.entryPhone
                      )
                    : ""
                  }
                </td>

                <td>
                  ${
                    safe(
                      p.clientName ||
                      p.name
                    )
                  }
                </td>

                <td>
                  ${
                    safe(
                      p.clientPhone ||
                      p.phone
                    )
                  }
                </td>

                <td>
                  ${safe(p.pickup)}
                </td>

                <td>
                  ${safe(p.dropoff)}
                </td>

                <td>
                  ${
                    index === 0
                    ? safe(
                        t.tripDate
                      )
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? safe(
                        t.tripTime
                      )
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? getTripMiles(t)
                    : ""
                  }
                </td>

                <td>
                  ${
                    statusHTML(
                      p.status ||
                      t.status
                    )
                  }
                </td>

                <td class="total">
                  $
                  ${
                    Number(
                      p.price || 0
                    ).toFixed(2)
                  }
                </td>

              </tr>

            `;

          });

        }

        /* ================= NORMAL ================= */

        else{

          tbody.innerHTML += `

            <tr>

              <td>
                ${safe(t.tripNumber)}
              </td>

              <td>
                ${safe(t.company)}
              </td>

              <td>
                ${safe(t.entryName)}
              </td>

              <td>
                ${safe(t.entryPhone)}
              </td>

              <td>
                ${safe(t.clientName)}
              </td>

              <td>
                ${safe(t.clientPhone)}
              </td>

              <td>
                ${safe(t.pickup)}
              </td>

              <td>
                ${safe(t.dropoff)}
              </td>

              <td>
                ${safe(t.tripDate)}
              </td>

              <td>
                ${safe(t.tripTime)}
              </td>

              <td>
                ${getTripMiles(t)}
              </td>

              <td>
                ${statusHTML(t.status)}
              </td>

              <td class="total">
                $
                ${getTripMoney(t)
                  .toFixed(2)}
              </td>

            </tr>

          `;

        }

        tbody.innerHTML += `
          <tr class="trip-divider">
            <td colspan="13"></td>
          </tr>
        `;

      });

    });

}

/* ================= EVENTS ================= */

document.addEventListener(
  "input",
  e=>{

  if(
    e.target.id ===
    "searchInput"
  ){

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

    render();

  }

});

/* ================= AUTO ================= */

setInterval(load,30000);

/* ================= INIT ================= */

load();