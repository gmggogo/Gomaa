/* =========================
SUMMARY FINAL ENGINE
========================= */

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

    allTrips =
      await res.json();

    buildFilters();

    render();

  }catch(err){

    console.log(err);

  }

}

/* =========================
HELPERS
========================= */

function getTripSuffix(trip){

  const parts =
    String(
      trip.tripNumber || ""
    )
    .split("-");

  return String(
    parts[parts.length - 1] || ""
  )
  .trim()
  .toUpperCase();

}

function isSharedTrip(trip){

  return (
    trip.isShared === true ||
    getTripSuffix(trip) === "SH"
  );

}

function isCompleted(status){

  return String(status || "")
    .toLowerCase() === "completed";

}

function isCancelled(status){

  return String(status || "")
    .toLowerCase() === "cancelled";

}

function isNoShow(status){

  return String(status || "")
    .toLowerCase() === "noshow";

}

function safe(v){

  return String(v ?? "-");

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

  btn.classList.add("active");

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

      if(t.passengers){

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

  if(isCompleted(status))
    cls = "completed";

  else if(isCancelled(status))
    cls = "cancelled";

  else if(isNoShow(status))
    cls = "noshow";

  return `
    <span class="status ${cls}">
      ${status || "-"}
    </span>
  `;

}

/* =========================
SERVICE STATS
========================= */

function getServiceCards(data){

  const services = [
    {
      title:"Standard",
      code:"ST"
    },
    {
      title:"XL",
      code:"XL"
    },
    {
      title:"Wheelchair",
      code:"WC"
    },
    {
      title:"Shared",
      code:"SH"
    },
    {
      title:"Taxi",
      code:"TX"
    },
    {
      title:"Limousine",
      code:"LM"
    }
  ];

  return services.map(service=>{

    const serviceTrips =
      data.filter(t =>
        getTripSuffix(t) === service.code
      );

    let trips = 0;
    let miles = 0;
    let revenue = 0;

    serviceTrips.forEach(t=>{

      if(isSharedTrip(t)){

        (t.passengers || [])
        .forEach(p=>{

          if(
            isCompleted(p.status)
          ){

            trips++;

            miles += Number(
              t.miles || 0
            );

            revenue += Number(
              p.price || 0
            );

          }

        });

      }else{

        if(
          isCompleted(t.status)
        ){

          trips++;

          miles += Number(
            t.miles || 0
          );

          revenue += Number(
            t.finalPrice || 0
          );

        }

      }

    });

    return {
      ...service,
      trips,
      miles,
      revenue
    };

  });

}

/* =========================
TOTAL STATS
========================= */

function getTotals(data){

  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let revenue = 0;
  let miles = 0;

  data.forEach(t=>{

    if(isSharedTrip(t)){

      (t.passengers || [])
      .forEach(p=>{

        if(isCompleted(p.status)){

          completed++;

          revenue += Number(
            p.price || 0
          );

          miles += Number(
            t.miles || 0
          );

        }

        if(isCancelled(p.status)){
          cancelled++;
        }

        if(isNoShow(p.status)){
          noshow++;
        }

      });

    }else{

      if(isCompleted(t.status)){

        completed++;

        revenue += Number(
          t.finalPrice || 0
        );

        miles += Number(
          t.miles || 0
        );

      }

      if(isCancelled(t.status)){
        cancelled++;
      }

      if(isNoShow(t.status)){
        noshow++;
      }

    }

  });

  return {
    completed,
    cancelled,
    noshow,
    revenue,
    miles
  };

}

/* =========================
RENDER STATS
========================= */

function renderStats(data){

  const servicesWrap =
    document.querySelector(
      ".services-stats"
    );

  const totalsWrap =
    document.querySelector(
      ".totals-stats"
    );

  if(!servicesWrap || !totalsWrap){
    return;
  }

  servicesWrap.innerHTML = "";
  totalsWrap.innerHTML = "";

  const services =
    getServiceCards(data);

  const totals =
    getTotals(data);

  /* GREEN */

  services.forEach(s=>{

    servicesWrap.innerHTML += `

      <div class="stat">

        <div class="stat-title">
          ${s.title}
        </div>

        <div class="stat-lines">

          Trips ${s.trips}<br>

          Miles ${s.miles.toFixed(1)}<br>

          Revenue $${s.revenue.toFixed(2)}

        </div>

      </div>

    `;

  });

  /* BLUE */

  const blue = [

    {
      title:"Completed",
      value:totals.completed
    },

    {
      title:"Cancelled",
      value:totals.cancelled
    },

    {
      title:"No Show",
      value:totals.noshow
    },

    {
      title:"Revenue",
      value:`$${totals.revenue.toFixed(2)}`
    },

    {
      title:"Miles",
      value:totals.miles.toFixed(1)
    }

  ];

  blue.forEach(item=>{

    totalsWrap.innerHTML += `

      <div class="stat">

        <div class="stat-title">
          ${item.title}
        </div>

        <div class="stat-value">
          ${item.value}
        </div>

      </div>

    `;

  });

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

  renderStats(data);

  const groups =
    groupByDay(data);

  Object.keys(groups)
  .sort((a,b)=>
    new Date(b) - new Date(a)
  )
  .forEach(day=>{

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

        <tbody id="tbody-${day}">
        </tbody>

      </table>

      </div>
    `;

    const tbody =
      document.getElementById(
        `tbody-${day}`
      );

    groups[day].forEach(t=>{

      /* INDIVIDUAL */

      if(!isSharedTrip(t)){

        tbody.innerHTML += `
        <tr>

          <td>${safe(t.tripNumber)}</td>
          <td>${safe(t.company)}</td>
          <td>${safe(t.entryName)}</td>
          <td>${safe(t.entryPhone)}</td>
          <td>${safe(t.clientName)}</td>
          <td>${safe(t.clientPhone)}</td>
          <td>${safe(t.pickup)}</td>
          <td>${safe(t.dropoff)}</td>
          <td>${safe(t.tripDate)}</td>
          <td>${safe(t.tripTime)}</td>
          <td>${safe(t.bookingDate)}</td>
          <td>${safe(t.bookingTime)}</td>
          <td>${safe(t.miles || 0)}</td>

          <td>
            ${statusHTML(t.status)}
          </td>

          <td class="total">
            $${Number(
              t.finalPrice || 0
            ).toFixed(2)}
          </td>

          <td class="total">
            $${Number(
              t.finalPrice || 0
            ).toFixed(2)}
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

      /* SHARED */

      else{

        const passengers =
          t.passengers || [];

        passengers.forEach((p,index)=>{

          tbody.innerHTML += `
          <tr class="${
            index !== passengers.length - 1
            ? "shared-separator"
            : ""
          }">

            <td>
              ${index === 0
                ? safe(t.tripNumber)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.company)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.entryName)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.entryPhone)
                : ""}
            </td>

            <td>
              ${safe(
                p.clientName
              )}
            </td>

            <td>
              ${safe(
                p.clientPhone
              )}
            </td>

            <td>
              ${safe(p.pickup)}
            </td>

            <td>
              ${safe(p.dropoff)}
            </td>

            <td>
              ${index === 0
                ? safe(t.tripDate)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.tripTime)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.bookingDate)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.bookingTime)
                : ""}
            </td>

            <td>
              ${index === 0
                ? safe(t.miles || 0)
                : ""}
            </td>

            <td>
              ${statusHTML(
                p.status || "Scheduled"
              )}
            </td>

            <td class="total">
              $${Number(
                p.price || 0
              ).toFixed(2)}
            </td>

            <td class="total">

              ${
                index === 0

                ? `$${(t.passengers || [])
                  .reduce((sum,p)=>
                    sum + Number(
                      p.price || 0
                    )
                  ,0)
                  .toFixed(2)}`

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