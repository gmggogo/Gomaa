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
    String(trip.tripNumber || "")
      .includes("-SH")
  );

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

function getPrice(obj){

  return Number(
    obj?.finalPrice ||
    obj?.priceAmount ||
    obj?.price ||
    0
  );

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
      data.filter(t => {

        if(service.code === "SH"){
          return isSharedTrip(t);
        }

        return (
          getTripSuffix(t) === service.code
        );

      });

    let trips = 0;
    let miles = 0;
    let revenue = 0;

    serviceTrips.forEach(t=>{

      if(isSharedTrip(t)){

        (t.passengers || [])
        .forEach(p=>{

          if(
            isCompleted(p.status) ||
            isCancelled(p.status) ||
            isNoShow(p.status)
          ){

            trips++;

            miles += Number(
              t.miles || 0
            );

            revenue += getPrice(p);

          }

        });

      }else{

        if(
          isCompleted(t.status) ||
          isCancelled(t.status) ||
          isNoShow(t.status)
        ){

          trips++;

          miles += Number(
            t.miles || 0
          );

          revenue += getPrice(t);

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
  let totalTrips = 0;

  data.forEach(t=>{

    if(isSharedTrip(t)){

      (t.passengers || [])
      .forEach(p=>{

        totalTrips++;

        if(isCompleted(p.status)){
          completed++;
        }

        if(isCancelled(p.status)){
          cancelled++;
        }

        if(isNoShow(p.status)){
          noshow++;
        }

        revenue += getPrice(p);

        miles += Number(
          t.miles || 0
        );

      });

    }else{

      totalTrips++;

      if(isCompleted(t.status)){
        completed++;
      }

      if(isCancelled(t.status)){
        cancelled++;
      }

      if(isNoShow(t.status)){
        noshow++;
      }

      revenue += getPrice(t);

      miles += Number(
        t.miles || 0
      );

    }

  });

  return {
    totalTrips,
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

  const wrap =
    document.querySelector(".stats");

  if(!wrap) return;

  const services =
    getServiceCards(data);

  const totals =
    getTotals(data);

  wrap.innerHTML = "";

  /* =========================
  GREEN
  ========================= */

  services.forEach(s=>{

    wrap.innerHTML += `
      <div class="stat">

        <div class="stat-title">
          ${s.title}
        </div>

        <div style="
          font-size:11px;
          margin-top:6px;
          line-height:1.5;
          font-weight:800;
        ">

          Trips ${s.trips}<br>

          Miles ${s.miles.toFixed(1)}<br>

          Revenue $${s.revenue.toFixed(2)}

        </div>

      </div>
    `;

  });

  /* =========================
  BLUE
  ========================= */

  const blue = [

    {
      title:"Total Trips",
      value:totals.totalTrips
    },

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

    wrap.innerHTML += `
      <div
        class="stat"
        style="
          background:#145cff;
        ">

        <div class="stat-title"
        style="
          color:#dbeafe;
        ">
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

  if(!wrap) return;

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
AUTO REFRESH
========================= */

setInterval(load,30000);

/* =========================
START
========================= */

window.addEventListener(
  "DOMContentLoaded",
  load
);