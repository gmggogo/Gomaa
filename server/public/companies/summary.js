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
    trip?.isShared === true ||
    getTripSuffix(trip) === "SH"
  );

}

function safeText(v){

  return String(v || "")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");

}

function isCompleted(status){

  return String(status || "")
    .toLowerCase()
    .includes("complete");

}

function isCancelled(status){

  return String(status || "")
    .toLowerCase()
    .includes("cancel");

}

function isNoShow(status){

  return String(status || "")
    .toLowerCase()
    .includes("no");

}

/* =========================
PRICE ENGINE
========================= */

function getTripPrice(t){

  if(isCancelled(t.status)){

    return Number(
      t.cancelFee ||
      t.cancelCharge ||
      t.cancelAmount ||
      0
    );

  }

  if(isNoShow(t.status)){

    return Number(
      t.noShowFee ||
      t.noShowCharge ||
      t.noShowAmount ||
      0
    );

  }

  return Number(
    t.finalPrice ||
    t.priceAmount ||
    t.price ||
    0
  );

}

function getPassengerPrice(p){

  if(isCancelled(p.status)){

    return Number(
      p.cancelFee ||
      p.cancelCharge ||
      p.cancelAmount ||
      0
    );

  }

  if(isNoShow(p.status)){

    return Number(
      p.noShowFee ||
      p.noShowCharge ||
      p.noShowAmount ||
      0
    );

  }

  return Number(
    p.finalPrice ||
    p.priceAmount ||
    p.price ||
    0
  );

}

function getMiles(status,miles){

  // ❌ Cancelled only = no miles
  if(isCancelled(status)){
    return 0;
  }

  // ✅ NoShow still counts miles
  return Number(miles || 0);

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

  if(isCompleted(status)){
    cls = "completed";
  }

  else if(isCancelled(status)){
    cls = "cancelled";
  }

  else if(isNoShow(status)){
    cls = "noshow";
  }

  return `
    <span class="status ${cls}">
      ${safeText(status || "-")}
    </span>
  `;

}

/* =========================
GREEN SERVICES
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
      code:"WH"
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

      /* =========================
         SHARED
      ========================= */

      if(isSharedTrip(t)){

        trips += 1;

        revenue +=
          (t.passengers || [])
          .reduce((sum,p)=>{

            return (
              sum +
              getPassengerPrice(p)
            );

          },0);

        const hasCompleted =
          (t.passengers || [])
          .some(p =>
            isCompleted(p.status)
          );

        if(hasCompleted){

          miles += Number(
            t.miles || 0
          );

        }

      }

      /* =========================
         INDIVIDUAL
      ========================= */

      else{

        trips += 1;

        revenue +=
          getTripPrice(t);

        miles +=
          getMiles(
            t.status,
            t.miles
          );

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

function updateStats(filteredData){

  const globalData =
    allTrips;

  let totalTrips = 0;

  let completed = 0;

  let cancelled = 0;

  let noshow = 0;

  let totalRevenue = 0;

  let totalMiles = 0;

  globalData.forEach(t=>{

    /* =========================
       SHARED
    ========================= */

    if(isSharedTrip(t)){

      totalTrips += 1;

      let hasCompleted =
        false;

      (t.passengers || [])
      .forEach(p=>{

        if(isCompleted(p.status)){

          completed++;
          hasCompleted = true;

        }

        if(isCancelled(p.status)){

          cancelled++;

        }

        if(isNoShow(p.status)){

          noshow++;

        }

        totalRevenue +=
          getPassengerPrice(p);

      });

      if(hasCompleted){

        totalMiles += Number(
          t.miles || 0
        );

      }

    }

    /* =========================
       INDIVIDUAL
    ========================= */

    else{

      totalTrips += 1;

      if(isCompleted(t.status)){

        completed++;

      }

      if(isCancelled(t.status)){

        cancelled++;

      }

      if(isNoShow(t.status)){

        noshow++;

      }

      totalRevenue +=
        getTripPrice(t);

      totalMiles +=
        getMiles(
          t.status,
          t.miles
        );

    }

  });

  /* =========================
     GREEN SERVICE CARDS
  ========================= */

  const servicesWrap =
    document.querySelector(
      ".services-stats"
    );

  if(servicesWrap){

    const services =
      getServiceCards(allTrips);

    servicesWrap.innerHTML = "";

    services.forEach(s=>{

      servicesWrap.innerHTML += `

        <div class="stat">

          <div class="stat-title">
            ${s.title}
          </div>

          <div class="stat-lines">

            Trips ${s.trips}<br>

            Miles ${s.miles.toFixed(1)}<br>

            Total Revenue
            $${s.revenue.toFixed(2)}

          </div>

        </div>

      `;

    });

  }

  /* =========================
     BLUE TOTAL CARDS
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
          Total Revenue
        </div>

        <div class="stat-value">
          $${totalRevenue.toFixed(2)}
        </div>

      </div>

      <div class="stat">

        <div class="stat-title">
          Miles
        </div>

        <div class="stat-value">
          ${totalMiles.toFixed(1)}
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

    groups[day].forEach(t=>{

      /* =========================
         INDIVIDUAL
      ========================= */

      if(!isSharedTrip(t)){

        const total =
          getTripPrice(t);

        const miles =
          getMiles(
            t.status,
            t.miles
          );

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

          <td>
            ${miles.toFixed(1)}
          </td>

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

        const hasCompleted =
          passengers.some(p =>
            isCompleted(p.status)
          );

        const sharedMiles =
          hasCompleted
          ? Number(t.miles || 0)
          : 0;

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
                ? sharedMiles.toFixed(1)
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