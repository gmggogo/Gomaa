// summary.js
// COMPANY SUMMARY - FULL DYNAMIC VERSION

let allTrips = [];
let SERVICES = [];
let currentTab = "ALL";
let autoRefreshTimer = null;

/* =========================
LOAD
========================= */

async function load(){

  try{

    await loadServices();
    await loadTrips();

    buildFilters();
    buildTabs();
    render();

  }catch(err){

    console.log(err);

    const wrap =
      document.getElementById("summaryContent");

    if(wrap){
      wrap.innerHTML = `
        <div class="empty-state">
          Failed To Load Summary
        </div>
      `;
    }

  }

}

async function loadServices(){

  const token =
    localStorage.getItem("token") || "";

  const res =
    await fetch("/api/services?company=true",{
      headers:{
        Authorization:"Bearer " + token
      }
    });

  if(!res.ok){
    throw new Error("Failed loading services");
  }

  const data =
    await res.json();

  SERVICES =
    Array.isArray(data)
    ? data.filter(s =>
        s &&
        s.companyEnabled !== false &&
        s.enabled !== false
      )
    : [];

}

async function loadTrips(){

  const company =
    localStorage.getItem("name") || "";

  const token =
    localStorage.getItem("token") || "";

  const res =
    await fetch(
      `/api/trips/summary?company=${encodeURIComponent(company)}`,
      {
        headers:{
          Authorization:"Bearer " + token
        }
      }
    );

  if(!res.ok){
    throw new Error("Failed loading trips");
  }

  const data =
    await res.json();

  allTrips =
    Array.isArray(data)
    ? data
    : [];

}

/* =========================
HELPERS
========================= */

function safeText(v){
  return String(v ?? "")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function num(v){
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function money(v){
  return "$" + num(v).toFixed(2);
}

function getTripSuffix(trip){

  const parts =
    String(trip?.tripNumber || "")
    .split("-");

  return String(parts[parts.length - 1] || "")
    .trim()
    .toUpperCase();

}

function getServiceKey(service){

  return String(
    service.serviceKey ||
    service.key ||
    service.code ||
    service.title ||
    ""
  ).trim().toUpperCase();

}

function getServiceTitle(service){

  return (
    service.title ||
    service.name ||
    service.serviceName ||
    getServiceKey(service) ||
    "Service"
  );

}

function getServiceCode(service){

  const key =
    getServiceKey(service);

  if(key === "STANDARD") return "ST";
  if(key === "WHEELCHAIR") return "WH";
  if(key === "SHARED") return "SH";
  if(key === "LIMO" || key === "LIMOUSINE") return "LM";
  if(key === "TAXI") return "TX";
  if(key === "XL") return "XL";

  return String(
    service.suffix ||
    service.code ||
    key
  ).trim().toUpperCase();

}

function getTripServiceCode(trip){

  const direct =
    String(
      trip.serviceCode ||
      trip.serviceSuffix ||
      trip.serviceKey ||
      trip.service ||
      ""
    ).trim().toUpperCase();

  if(direct){
    if(direct === "STANDARD") return "ST";
    if(direct === "WHEELCHAIR") return "WH";
    if(direct === "SHARED") return "SH";
    if(direct === "LIMO" || direct === "LIMOUSINE") return "LM";
    if(direct === "TAXI") return "TX";
    if(direct === "XL") return "XL";
    return direct;
  }

  return getTripSuffix(trip);

}

function isSharedTrip(trip){

  return (
    trip?.isShared === true ||
    getTripSuffix(trip) === "SH" ||
    getTripServiceCode(trip) === "SH" ||
    Array.isArray(trip?.passengers)
  );

}

function normalizeStatus(status){

  return String(status || "")
    .trim()
    .toLowerCase();

}

function isCompleted(status){
  return normalizeStatus(status).includes("complete");
}

function isCancelled(status){
  return normalizeStatus(status).includes("cancel");
}

function isNoShow(status){
  return (
    normalizeStatus(status).includes("no show") ||
    normalizeStatus(status).includes("noshow")
  );
}

function isNotCompleted(trip){

  const status =
    String(trip.status || "")
    .toLowerCase();

  if(
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("show")
  ){
    return false;
  }

  if(!trip.tripDate){
    return false;
  }

  const tripDateTime =
    new Date(
      `${trip.tripDate} ${trip.tripTime || "00:00"}`
    );

  if(isNaN(tripDateTime.getTime())){
    return false;
  }

  const diffHours =
    (Date.now() - tripDateTime.getTime())
    / 1000 / 60 / 60;

  return diffHours >= 10;
}

function isScheduled(status){
  return normalizeStatus(status) === "scheduled";
}

function isConfirmed(status){
  return normalizeStatus(status) === "confirmed";
}

function getTripDateTime(t){

  if(!t || !t.tripDate){
    return null;
  }

  const date =
    String(t.tripDate || "").trim();

  let time =
    String(t.tripTime || "00:00").trim();

  if(!time){
    time = "00:00";
  }

  const d =
    new Date(`${date}T${time}`);

  if(isNaN(d.getTime())){
    return null;
  }

  return d;

}

function isNotCompletedTrip(t){

  if(!t){
    return false;
  }

  if(isSharedTrip(t)){

    const passengers =
      Array.isArray(t.passengers)
      ? t.passengers
      : [];

    return passengers.some(p =>
      isNotCompletedStatus(p.status,t)
    );

  }

  return isNotCompletedStatus(t.status,t);

}

function isNotCompletedStatus(status,trip){

  if(
    isCompleted(status) ||
    isCancelled(status) ||
    isNoShow(status)
  ){
    return false;
  }

  if(
    !isScheduled(status) &&
    !isConfirmed(status)
  ){
    return false;
  }

  const dt =
    getTripDateTime(trip);

  if(!dt){
    return false;
  }

  const diff =
    Date.now() - dt.getTime();

  return diff >= 10 * 60 * 60 * 1000;

}

function displayStatus(status,trip){

  if(isNotCompletedStatus(status,trip)){
    return "Not Completed";
  }

  return status || "-";

}

/* =========================
PRICE / MILES
========================= */
function getPassengerPrice(p){

  if(isCancelled(p.status)){

    return Number(
      p.cancelFee ??
      p.finalPrice ??
      p.priceAmount ??
      p.price ??
      0
    );

  }

  if(isNoShow(p.status)){

    return Number(
      p.noShowFee ??
      p.finalPrice ??
      p.priceAmount ??
      p.price ??
      0
    );

  }

  return Number(
    p.finalPrice ??
    p.priceAmount ??
    p.price ??
    0
  );

}

function getIndividualMiles(t){

  if(isCancelled(t?.status)){
    return 0;
  }

  if(isNotCompletedStatus(t?.status,t)){
    return 0;
  }

  return num(t?.miles);

}

function getSharedMiles(t){

  const passengers =
    Array.isArray(t?.passengers)
    ? t.passengers
    : [];

  const hasCompleted =
    passengers.some(p =>
      isCompleted(p.status)
    );

  if(!hasCompleted){
    return 0;
  }

  return num(t?.miles);

}

function getTripPrice(t){

  if(isNotCompletedStatus(t?.status,t)){
    return 0;
  }

  if(isCancelled(t?.status)){

    return num(
      t.cancelFee ??
      t.finalPrice ??
      t.priceAmount ??
      0
    );

  }

  if(isNoShow(t?.status)){

    return num(
      t.noShowFee ??
      t.finalPrice ??
      t.priceAmount ??
      0
    );

  }

  return num(
    t.finalPrice ??
    t.priceAmount ??
    0
  );

}

/* =========================
TABS
========================= */

function buildTabs(){

  const wrap =
    document.getElementById("serviceTabs");

  if(!wrap){
    return;
  }

  let html = `
    <button
      class="tab ${currentTab === "ALL" ? "active" : ""}"
      onclick="switchTab('ALL',this)">
      All
    </button>
  `;

  SERVICES.forEach(s=>{

    const code =
      getServiceCode(s);

    const title =
      getServiceTitle(s);

    html += `
      <button
        class="tab ${currentTab === code ? "active" : ""}"
        onclick="switchTab('${safeText(code)}',this)">
        ${safeText(title)}
      </button>
    `;

  });

  wrap.innerHTML = html;

}

function switchTab(tab,btn){

  currentTab =
    String(tab || "ALL").toUpperCase();

  document
    .querySelectorAll(".tab")
    .forEach(t =>
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
    document.getElementById("yearFilter");

  const month =
    document.getElementById("monthFilter");

  if(!year || !month){
    return;
  }

  const oldYear =
    year.value || "";

  const oldMonth =
    month.value || "";

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
    <option value="">All Years</option>
  `;

  [...years]
    .sort((a,b)=>Number(b)-Number(a))
    .forEach(y=>{

      year.innerHTML += `
        <option value="${safeText(y)}">
          ${safeText(y)}
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

  year.value = oldYear;
  month.value = oldMonth;

}

/* =========================
FILTER DATA
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
            ${p.passengerName || ""}
            ${p.passengerPhone || ""}
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
          String(t.tripDate).split("-");

        if(year && parts[0] !== year){
          return false;
        }

        if(month && parts[1] !== month){
          return false;
        }

      }

      return true;

    });

  if(currentTab !== "ALL"){

    data =
      data.filter(t =>
        getTripServiceCode(t) === currentTab
      );

  }

  return data;

}

/* =========================
STATS
========================= */

function buildServiceStats(data){

  return SERVICES.map(service=>{

    const code =
      getServiceCode(service);

    const serviceTrips =
      data.filter(t =>
        getTripServiceCode(t) === code
      );

    let trips = 0;
    let miles = 0;
    let revenue = 0;
    let passengers = 0;

    serviceTrips.forEach(t=>{

      trips++;

      if(isSharedTrip(t)){

        const list =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        passengers += list.length;

        revenue += list.reduce((sum,p)=>{
          return sum + getPassengerPrice(p);
        },0);

        miles += getSharedMiles(t);

      }else{

        revenue += getTripPrice(t);
        miles += getIndividualMiles(t);

      }

    });

    return {
      title:getServiceTitle(service),
      code,
      trips,
      miles,
      revenue,
      passengers
    };

  });

}

function updateStats(filteredData){

  let totalTrips = 0;
  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let notCompleted = 0;
  let totalRevenue = 0;
  let totalMiles = 0;
  let totalPassengers = 0;

  filteredData.forEach(t=>{

    totalTrips++;

    if(isSharedTrip(t)){

      const passengers =
        Array.isArray(t.passengers)
        ? t.passengers
        : [];

      totalPassengers += passengers.length;

      passengers.forEach(p=>{

        if(isCompleted(p.status)){
          completed++;
        }

        else if(isCancelled(p.status)){
          cancelled++;
        }

        else if(isNoShow(p.status)){
          noshow++;
        }

        else if(isNotCompletedStatus(p.status,t)){
          notCompleted++;
        }

        totalRevenue +=
          getPassengerPrice(p);

      });

      totalMiles +=
        getSharedMiles(t);

    }else{

      if(isCompleted(t.status)){
        completed++;
      }

      else if(isCancelled(t.status)){
        cancelled++;
      }

      else if(isNoShow(t.status)){
        noshow++;
      }

      else if(isNotCompletedStatus(t.status,t)){
        notCompleted++;
      }

      totalRevenue +=
        getTripPrice(t);

      totalMiles +=
        getIndividualMiles(t);

    }

  });

  const servicesWrap =
    document.getElementById("servicesStats");

  if(servicesWrap){

    const services =
      buildServiceStats(filteredData);

    servicesWrap.innerHTML =
      services.map(s=>`

        <div class="stat">

          <div class="stat-title">
            ${safeText(s.title)}
          </div>

          <div class="stat-lines">
            Trips:
            <span class="big">${s.trips}</span><br>

            Miles:
            <span class="big">${s.miles.toFixed(1)}</span><br>

            Revenue:
            <span class="big">${money(s.revenue)}</span>

            ${
              s.code === "SH"
              ? `<br>Passengers: <span class="big">${s.passengers}</span>`
              : ""
            }
          </div>

        </div>

      `).join("");

  }

  const totalsWrap =
    document.getElementById("totalsStats");

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
        <div class="stat-title">Not Completed</div>
        <div class="stat-value">${notCompleted}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Revenue</div>
        <div class="stat-value">${money(totalRevenue)}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Miles</div>
        <div class="stat-value">${totalMiles.toFixed(1)}</div>
      </div>

      <div class="stat">
        <div class="stat-title">Passengers</div>
        <div class="stat-value">${totalPassengers}</div>
      </div>

    `;

  }

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
STATUS HTML
========================= */

function statusHTML(status,trip){

  const label =
    displayStatus(status,trip);

  let cls = "";

  if(label === "Not Completed"){
    cls = "notcompleted";
  }

  else if(isCompleted(status)){
    cls = "completed";
  }

  else if(isCancelled(status)){
    cls = "cancelled";
  }

  else if(isNoShow(status)){
    cls = "noshow";
  }

  else if(isScheduled(status)){
    cls = "scheduled";
  }

  else if(isConfirmed(status)){
    cls = "confirmed";
  }

  return `
    <span class="status ${cls}">
      ${safeText(label)}
    </span>
  `;

}

/* =========================
RENDER
========================= */

function render(){

  const wrap =
    document.getElementById("summaryContent");

  if(!wrap){
    return;
  }

  const data =
    getFilteredTrips();

  updateStats(data);

  wrap.innerHTML = "";

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

          <tbody id="tbody-${safeText(day)}"></tbody>

        </table>

      </div>

    `;

    const tbody =
      document.getElementById(`tbody-${day}`);

    groups[day].forEach(t=>{

      if(!isSharedTrip(t)){

        const total =
          getTripPrice(t);

        const miles =
          getIndividualMiles(t);

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
            <td>${miles.toFixed(1)}</td>
            <td>${statusHTML(t.status,t)}</td>
            <td class="total">${money(total)}</td>
            <td class="total">${money(total)}</td>
          </tr>

          <tr class="trip-divider-line">
            <td colspan="16"></td>
          </tr>

          <tr class="trip-divider">
            <td colspan="16"></td>
          </tr>

        `;

      }else{

        const passengers =
          Array.isArray(t.passengers)
          ? t.passengers
          : [];

        const sharedTotal =
          passengers.reduce((sum,p)=>{
            return sum + getPassengerPrice(p);
          },0);

        const sharedMiles =
          getSharedMiles(t);

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

              <td>${safeText(p.clientName || p.passengerName || "-")}</td>
              <td>${safeText(p.clientPhone || p.passengerPhone || "-")}</td>
              <td>${safeText(p.pickup || "-")}</td>
              <td>${safeText(p.dropoff || "-")}</td>

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

              <td>${statusHTML(p.status || "Scheduled",t)}</td>

              <td class="total">${money(passengerPrice)}</td>

              <td class="total">
                ${
                  index === 0
                  ? money(sharedTotal)
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
AUTO REFRESH
========================= */

function startAutoRefresh(){

  if(autoRefreshTimer){
    clearInterval(autoRefreshTimer);
  }

  autoRefreshTimer =
    setInterval(async ()=>{

      const oldTab =
        currentTab;

      await loadTrips();

      currentTab =
        oldTab;

      buildFilters();
      buildTabs();
      render();

    },30000);

}

/* =========================
INIT
========================= */

load().then(()=>{
  startAutoRefresh();
});