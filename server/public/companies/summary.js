// summary.js

let allTrips = [];

let currentTab = "TRIPS";

let currentService = "ALL";

let COMPANY_SERVICES = [];

/* =========================
LOAD SERVICES
========================= */

async function loadServices(){

  try{

    const res =
      await fetch("/api/services");

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

    render();

  }catch(err){

    console.log(err);

  }

}

/* =========================
HELPERS
========================= */

function getServiceCode(t){

  return String(

    t.serviceSuffix ||

    t.serviceCode ||

    t.serviceType ||

    ""

  )
  .toUpperCase()
  .trim();

}

function isSharedTrip(t){

  return (

    t.isShared === true ||

    String(
      t.tripType || ""
    ).toUpperCase() === "SHARED"

  );

}

function getTripsData(){

  let trips =
    getFilteredTrips();

  /* =========================
  MAIN TAB
  ========================= */

  if(currentTab === "TRIPS"){

    trips =
      trips.filter(
        t => !isSharedTrip(t)
      );

  }

  if(currentTab === "SHARED"){

    trips =
      trips.filter(
        t => isSharedTrip(t)
      );

  }

  /* =========================
  SERVICE FILTER
  ========================= */

  if(currentService !== "ALL"){

    trips =
      trips.filter(t=>

        getServiceCode(t)

        === currentService

      );

  }

  return trips;

}

/* =========================
BUILD TABS
========================= */

function buildTabs(){

  const wrap =
    document.getElementById(
      "dynamicTabs"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  /* =========================
  NORMAL SERVICES
  ========================= */

  const normalServices =
    COMPANY_SERVICES.filter(s=>

      s.companyShared !== true &&

      s.shared !== true &&

      String(
        s.serviceType || ""
      ).toUpperCase() !== "SHARED"

    );

  /* =========================
  SHARED SERVICES
  ========================= */

  const sharedServices =
    COMPANY_SERVICES.filter(s=>

      s.companyShared === true ||

      s.shared === true ||

      String(
        s.serviceType || ""
      ).toUpperCase() === "SHARED"

    );

  /* =========================
  TRIPS TAB
  ========================= */

  if(normalServices.length){

    const count =
      allTrips.filter(t=>

        !isSharedTrip(t)

      ).length;

    const btn =
      document.createElement("button");

    btn.className =
      currentTab === "TRIPS"
      ? "tab active"
      : "tab";

    btn.innerText =
      `Trips (${count})`;

    btn.onclick = ()=>{

      currentTab = "TRIPS";

      currentService = "ALL";

      buildTabs();

      render();

    };

    wrap.appendChild(btn);

  }

  /* =========================
  SHARED TAB
  ========================= */

  if(sharedServices.length){

    const count =
      allTrips.filter(t=>

        isSharedTrip(t)

      ).length;

    const btn =
      document.createElement("button");

    btn.className =
      currentTab === "SHARED"
      ? "tab active"
      : "tab";

    btn.innerText =
      `Shared (${count})`;

    btn.onclick = ()=>{

      currentTab = "SHARED";

      currentService = "ALL";

      buildTabs();

      render();

    };

    wrap.appendChild(btn);

  }

}

/* =========================
BUILD STATS
========================= */

function buildStats(){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  const trips =
    getTripsData();

  const services =
    currentTab === "TRIPS"

    ? COMPANY_SERVICES.filter(s=>

        s.companyShared !== true &&

        s.shared !== true &&

        String(
          s.serviceType || ""
        ).toUpperCase() !== "SHARED"

      )

    : COMPANY_SERVICES.filter(s=>

        s.companyShared === true ||

        s.shared === true ||

        String(
          s.serviceType || ""
        ).toUpperCase() === "SHARED"

      );

  services.forEach(service=>{

    const code =
      String(

        service.companySuffix ||

        service.serviceCode ||

        service.serviceKey ||

        service.code ||

        ""

      )
      .toUpperCase();

    const serviceTrips =
      trips.filter(t=>

        getServiceCode(t)

        === code

      );

    let revenue = 0;

    serviceTrips.forEach(t=>{

      if(t.isShared){

        (t.passengers || [])
        .forEach(p=>{

          if(
            p.status === "Completed"
          ){

            revenue += Number(
              p.price || 0
            );

          }

          if(
            p.status === "Cancelled" ||
            p.status === "NoShow"
          ){

            revenue += 15;

          }

        });

      }else{

        if(
          t.status === "Completed"
        ){

          revenue += Number(
            t.finalPrice || 0
          );

        }

        if(
          t.status === "Cancelled" ||
          t.status === "NoShow"
        ){

          revenue += 15;

        }

      }

    });

    const card =
      document.createElement("div");

    card.className = "stat";

    if(currentService === code){

      card.style.outline =
        "3px solid #145cff";

    }

    card.innerHTML = `

      <div class="stat-title">
        ${service.title || service.name}
      </div>

      <div class="stat-value">
        ${serviceTrips.length}
      </div>

      <div class="stat-money">
        $${revenue}
      </div>

    `;

    card.onclick = ()=>{

      if(currentService === code){

        currentService = "ALL";

      }else{

        currentService = code;

      }

      render();

    };

    wrap.appendChild(card);

  });

}

/* =========================
FILTERS
========================= */

function buildFilters(){

  const year =
    document.getElementById("yearFilter");

  const month =
    document.getElementById("monthFilter");

  if(year.options.length) return;

  const years = new Set();

  allTrips.forEach(t=>{

    if(t.tripDate){

      years.add(
        t.tripDate.split("-")[0]
      );

    }

  });

  year.innerHTML =
    `<option value="">All Years</option>`;

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
FILTER
========================= */

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
      ${t.company || ""}
      ${t.entryName || ""}
      ${t.entryPhone || ""}
      ${t.clientName || ""}
      ${t.clientPhone || ""}
    `;

    if(t.passengers){

      t.passengers.forEach(p=>{

        txt += `
          ${p.clientName || ""}
          ${p.clientPhone || ""}
        `;

      });

    }

    txt = txt.toLowerCase();

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

    return true;

  });

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

  if(status === "Completed")
    cls = "completed";

  else if(status === "Cancelled")
    cls = "cancelled";

  else if(status === "NoShow")
    cls = "noshow";

  return `
    <span class="status ${cls}">
      ${status}
    </span>
  `;

}

/* =========================
RENDER
========================= */

function render(){

  buildStats();

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  wrap.innerHTML = "";

  const trips =
    getTripsData();

  const groups =
    groupByDay(trips);

  Object.keys(groups).forEach(day=>{

    wrap.innerHTML += `
      <div class="day-title">
        ${day}
      </div>
    `;

    wrap.innerHTML += `
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

        <tbody id="tbody-${day}"></tbody>

      </table>

      </div>
    `;

    const tbody =
      document.getElementById(
        `tbody-${day}`
      );

    groups[day].forEach(t=>{

      /* =========================
      INDIVIDUAL
      ========================= */

      if(!t.isShared){

        tbody.innerHTML += `
        <tr>

          <td>${t.tripNumber || "-"}</td>
          <td>${t.company || "-"}</td>
          <td>${t.entryName || "-"}</td>
          <td>${t.entryPhone || "-"}</td>
          <td>${t.clientName || "-"}</td>
          <td>${t.clientPhone || "-"}</td>
          <td>${t.pickup || "-"}</td>
          <td>${t.dropoff || "-"}</td>
          <td>${t.tripDate || "-"}</td>
          <td>${t.tripTime || "-"}</td>
          <td>${t.bookingDate || "-"}</td>
          <td>${t.bookingTime || "-"}</td>
          <td>${t.miles || 0}</td>

          <td>
            ${statusHTML(t.status)}
          </td>

          <td class="total">

            ${
              t.status === "NoShow" ||
              t.status === "Cancelled"

              ? "$15"

              : `$${t.finalPrice || 0}`
            }

          </td>

          <td class="total">

            ${
              t.status === "NoShow" ||
              t.status === "Cancelled"

              ? "$15"

              : `$${t.finalPrice || 0}`
            }

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
          t.passengers || [];

        passengers.forEach((p,index)=>{

          tbody.innerHTML += `
          <tr class="${
            index !== passengers.length - 1
            ? 'shared-separator'
            : ''
          }">

            <td>
              ${index === 0
                ? t.tripNumber || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.company || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.entryName || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.entryPhone || "-"
                : ""}
            </td>

            <td>${p.clientName || "-"}</td>

            <td>${p.clientPhone || "-"}</td>

            <td>${p.pickup || "-"}</td>

            <td>${p.dropoff || "-"}</td>

            <td>
              ${index === 0
                ? t.tripDate || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.tripTime || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.bookingDate || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.bookingTime || "-"
                : ""}
            </td>

            <td>
              ${index === 0
                ? t.miles || 0
                : ""}
            </td>

            <td>
              ${statusHTML(
                p.status || "Scheduled"
              )}
            </td>

            <td class="total">

              ${
                p.status === "NoShow" ||
                p.status === "Cancelled"

                ? "$15"

                : `$${p.price || 0}`
              }

            </td>

            <td class="total">

              ${index === 0

                ? `$${(t.passengers || [])
                    .reduce((sum,p)=>{

                      if(
                        p.status === "NoShow" ||
                        p.status === "Cancelled"
                      ){
                        return sum + 15;
                      }

                      return sum + Number(
                        p.price || 0
                      );

                    },0)}`

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
AUTO
========================= */

setInterval(load,30000);

/* =========================
INIT
========================= */

load();