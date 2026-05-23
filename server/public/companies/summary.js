// =========================================
// FILE: summary.js
// FINAL FIXED VERSION
// =========================================

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

function getSharedKey(trip){

  return String(
    trip.groupId ||
    trip.tripNumber ||
    trip._id ||
    ""
  );

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

  return (
    String(status || "")
    .toLowerCase()
    .includes("noshow")
  );

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
      t.priceAmount ||
      0
    );

  }

  if(isNoShow(t.status)){

    return Number(
      t.noShowFee ||
      t.noShowCharge ||
      t.noShowAmount ||
      t.priceAmount ||
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
      p.priceAmount ||
      0
    );

  }

  if(isNoShow(p.status)){

    return Number(
      p.noShowFee ||
      p.noShowCharge ||
      p.noShowAmount ||
      p.priceAmount ||
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

  if(
    isCancelled(status) ||
    isNoShow(status)
  ){
    return 0;
  }

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
SERVICES
========================= */

function getServiceCards(data){

  const services = [

    { title:"Standard", code:"ST" },
    { title:"XL", code:"XL" },
    { title:"Wheelchair", code:"WH" },
    { title:"Shared", code:"SH" },
    { title:"Taxi", code:"TX" },
    { title:"Limousine", code:"LM" }

  ];

  return services.map(service=>{

    const processedShared =
      new Set();

    let trips = 0;
    let miles = 0;
    let revenue = 0;

    data.forEach(t=>{

      if(
        getTripSuffix(t)
        !== service.code
      ){
        return;
      }

      /* SHARED */

      if(isSharedTrip(t)){

        const key =
          getSharedKey(t);

        if(
          processedShared.has(key)
        ){
          return;
        }

        processedShared.add(key);

        trips += 1;

        const passengers =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        passengers.forEach(p=>{

          revenue +=
            getPassengerPrice(p);

        });

        const hasCompleted =
          passengers.some(p=>
            isCompleted(p.status)
          );

        if(hasCompleted){

          miles += Number(
            t.miles || 0
          );

        }

      }

      /* INDIVIDUAL */

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

  const processedShared =
    new Set();

  let totalTrips = 0;
  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let totalRevenue = 0;
  let totalMiles = 0;

  globalData.forEach(t=>{

    /* SHARED */

    if(isSharedTrip(t)){

      const key =
        getSharedKey(t);

      if(
        processedShared.has(key)
      ){
        return;
      }

      processedShared.add(key);

      totalTrips += 1;

      const passengers =
        Array.isArray(t.passengers)
        ? t.passengers
        : [];

      let hasCompleted = false;

      passengers.forEach(p=>{

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

    /* INDIVIDUAL */

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

  const servicesWrap =
    document.querySelector(
      ".services-stats"
    );

  if(servicesWrap){

    const services =
      getServiceCards(filteredData);

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

  const totalsWrap =
    document.querySelector(
      ".totals-stats"
    );

  if(totalsWrap){

    totalsWrap.innerHTML = `

      <div class="stat">
        <div class="stat-title">Total Trips</div>
        <div class="stat-value">${totalTrips}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Completed</div>
        <div class="stat-value">${completed}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Cancelled</div>
        <div class="stat-value">${cancelled}</div>
      </div>

      <div class="stat">
        <div class="stat-title">No Show</div>
        <div class="stat-value">${noshow}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Total Revenue</div>
        <div class="stat-value">
          $${totalRevenue.toFixed(2)}
        </div>
      </div>

      <div class="stat">
        <div class="stat-title">Miles</div>
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
            <th>Passenger</th>
            <th>Status</th>
            <th>Miles</th>
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

    const processedShared =
      new Set();

    groups[day].forEach(t=>{

      /* SHARED */

      if(isSharedTrip(t)){

        const key =
          getSharedKey(t);

        if(
          processedShared.has(key)
        ){
          return;
        }

        processedShared.add(key);

        const passengers =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        const total =
          passengers.reduce((sum,p)=>{

            return (
              sum +
              getPassengerPrice(p)
            );

          },0);

        passengers.forEach((p,index)=>{

          tbody.innerHTML += `

            <tr>

              <td>
                ${
                  index === 0
                  ? safeText(t.tripNumber)
                  : ""
                }
              </td>

              <td>
                ${
                  index === 0
                  ? safeText(t.company)
                  : ""
                }
              </td>

              <td>
                ${safeText(
                  p.clientName
                )}
              </td>

              <td>
                ${statusHTML(
                  p.status
                )}
              </td>

              <td>
                ${
                  index === 0
                  ? Number(
                      t.miles || 0
                    ).toFixed(1)
                  : ""
                }
              </td>

              <td class="total">
                ${
                  index === 0
                  ? `$${total.toFixed(2)}`
                  : `$${getPassengerPrice(p).toFixed(2)}`
                }
              </td>

            </tr>

          `;

        });

      }

      /* INDIVIDUAL */

      else{

        const total =
          getTripPrice(t);

        tbody.innerHTML += `

          <tr>

            <td>
              ${safeText(
                t.tripNumber
              )}
            </td>

            <td>
              ${safeText(
                t.company
              )}
            </td>

            <td>
              ${safeText(
                t.clientName
              )}
            </td>

            <td>
              ${statusHTML(
                t.status
              )}
            </td>

            <td>
              ${getMiles(
                t.status,
                t.miles
              ).toFixed(1)}
            </td>

            <td class="total">
              $${total.toFixed(2)}
            </td>

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