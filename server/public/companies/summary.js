// summary.js

let allTrips = [];

let currentTab = "ALL";

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
GET SERVICE CODE
========================= */

function getTripServiceCode(t){

  return String(

    t.serviceCode ||

    t.serviceSuffix ||

    t.serviceType ||

    ""

  )
  .toUpperCase()
  .trim();

}

/* =========================
BUILD TABS
========================= */

function buildTabs(){

  const tabs =
    document.getElementById(
      "dynamicTabs"
    );

  if(!tabs) return;

  tabs.innerHTML = "";

  /* =========================
  ALL TAB
  ========================= */

  const allBtn =
    document.createElement("button");

  allBtn.className =
    currentTab === "ALL"
    ? "tab active"
    : "tab";

  allBtn.innerText =
    `Trips (${allTrips.length})`;

  allBtn.onclick = ()=>{

    currentTab = "ALL";

    render();

  };

  tabs.appendChild(allBtn);

  /* =========================
  SERVICES
  ========================= */

  COMPANY_SERVICES.forEach(service=>{

    const code =
      String(
        service.code ||
        service.serviceCode ||
        service.serviceKey ||
        service.companySuffix ||
        ""
      )
      .toUpperCase();

    const count =
      allTrips.filter(t=>
        getTripServiceCode(t) === code
      ).length;

    const btn =
      document.createElement("button");

    btn.className =
      currentTab === code
      ? "tab active"
      : "tab";

    btn.innerText =
      `${service.title || service.name} (${count})`;

    btn.onclick = ()=>{

      currentTab = code;

      render();

    };

    tabs.appendChild(btn);

  });

}

/* =========================
BUILD STATS
========================= */

function buildStats(data){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  COMPANY_SERVICES.forEach(service=>{

    const code =
      String(
        service.code ||
        service.serviceCode ||
        service.serviceKey ||
        service.companySuffix ||
        ""
      )
      .toUpperCase();

    const trips =
      data.filter(t=>
        getTripServiceCode(t) === code
      );

    const total =
      trips.length;

    const card =
      document.createElement("div");

    card.className = "stat";

    card.innerHTML = `

      <div class="stat-title">
        ${service.title || service.name}
      </div>

      <div class="stat-value">
        ${total}
      </div>

    `;

    wrap.appendChild(card);

  });

  /* =========================
  COMPLETED
  ========================= */

  const completed =
    data.filter(t=>{

      if(t.isShared){

        return (
          t.passengers || []
        ).some(
          p => p.status === "Completed"
        );

      }

      return t.status === "Completed";

    }).length;

  /* =========================
  CANCELLED
  ========================= */

  const cancelled =
    data.filter(t=>{

      if(t.isShared){

        return (
          t.passengers || []
        ).some(
          p => p.status === "Cancelled"
        );

      }

      return t.status === "Cancelled";

    }).length;

  /* =========================
  NOSHOW
  ========================= */

  const noshow =
    data.filter(t=>{

      if(t.isShared){

        return (
          t.passengers || []
        ).some(
          p => p.status === "NoShow"
        );

      }

      return t.status === "NoShow";

    }).length;

  /* =========================
  REVENUE
  ========================= */

  let revenue = 0;

  data.forEach(t=>{

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

  /* =========================
  EXTRA CARDS
  ========================= */

  const extra = [

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
      value:noshow
    },

    {
      title:"Revenue",
      value:`$${revenue}`
    }

  ];

  extra.forEach(item=>{

    const card =
      document.createElement("div");

    card.className = "stat";

    card.innerHTML = `

      <div class="stat-title">
        ${item.title}
      </div>

      <div class="stat-value">
        ${item.value}
      </div>

    `;

    wrap.appendChild(card);

  });

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

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  wrap.innerHTML = "";

  const data =
    getFilteredTrips();

  buildStats(data);

  let trips = data;

  if(currentTab !== "ALL"){

    trips =
      data.filter(t =>

        getTripServiceCode(t)

        === currentTab

      );

  }

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