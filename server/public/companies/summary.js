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
      await fetch("/api/services",{
        headers:{
          Authorization:"Bearer " + token
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

/* ================= HELPERS ================= */

function normalize(v){

  return String(v ?? "")
    .trim();

}

function clean(v){

  return normalize(v)
    .replace(/^-/,"")
    .toUpperCase();

}

function safe(v){

  return String(v ?? "-");

}

/* ================= SHARED ================= */

function isSharedService(service){

  return (

    service?.companyShared === true ||

    service?.shared === true ||

    clean(service?.serviceType) === "SHARED" ||

    clean(service?.type) === "SHARED" ||

    clean(service?.title) === "SHARED"

  );

}

function isSharedTrip(t){

  return (

    t.isShared === true ||

    clean(t.tripType) === "SHARED" ||

    String(t.tripNumber || "")
      .toUpperCase()
      .includes("-SH") ||

    (
      Array.isArray(t.passengers) &&
      t.passengers.length > 0
    )

  );

}

/* ================= SERVICE CODE ================= */

function getServiceCodeFromService(service){

  return clean(

    service.companySuffix ||

    service.serviceSuffix ||

    service.serviceCode ||

    service.code ||

    service.serviceKey ||

    ""

  );

}

function getTripSuffixFromNumber(t){

  const num =
    String(t.tripNumber || "")
      .toUpperCase();

  const parts =
    num.split("-");

  const last =
    parts[parts.length - 1] || "";

  if(/^\d+$/.test(last)){
    return "";
  }

  return clean(last);

}

function getTripServiceCode(t){

  const direct =
    clean(

      t.serviceSuffix ||

      t.serviceCode ||

      t.serviceKey ||

      t.serviceType ||

      t.vehicle ||

      t.vehicleType ||

      ""

    );

  if(direct){
    return direct;
  }

  return getTripSuffixFromNumber(t);

}

function getServiceByTrip(t){

  const tripCode =
    getTripServiceCode(t);

  return COMPANY_SERVICES.find(service=>{

    const serviceCode =
      getServiceCodeFromService(service);

    return serviceCode === tripCode;

  }) || null;

}

function tripMatchesService(t,service){

  const serviceCode =
    getServiceCodeFromService(service);

  const tripCode =
    getTripServiceCode(t);

  return serviceCode === tripCode;

}

/* ================= TABS ================= */

function hasTripsTab(){

  return COMPANY_SERVICES.some(
    s => !isSharedService(s)
  );

}

function hasSharedTab(){

  return COMPANY_SERVICES.some(
    s => isSharedService(s)
  );

}

function fixCurrentTab(){

  if(
    currentTab === "SHARED" &&
    !hasSharedTab()
  ){
    currentTab = "TRIPS";
  }

  if(
    currentTab === "TRIPS" &&
    !hasTripsTab()
  ){
    currentTab = "SHARED";
  }

}

function buildTabs(){

  const wrap =
    document.getElementById(
      "dynamicTabs"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  /* ================= TRIPS ================= */

  if(hasTripsTab()){

    const count =
      getFilteredTrips()
        .filter(t => !isSharedTrip(t))
        .length;

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

  /* ================= SHARED ================= */

  if(hasSharedTab()){

    const count =
      getFilteredTrips()
        .filter(t => isSharedTrip(t))
        .length;

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

/* ================= FILTERS ================= */

function buildFilters(){

  const year =
    document.getElementById("yearFilter");

  const month =
    document.getElementById("monthFilter");

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

/* ================= DATA ================= */

function getTabTrips(){

  let data =
    getFilteredTrips();

  if(currentTab === "TRIPS"){

    data =
      data.filter(t =>
        !isSharedTrip(t)
      );

  }

  if(currentTab === "SHARED"){

    data =
      data.filter(t =>
        isSharedTrip(t)
      );

  }

  return data;

}

function getTripsData(){

  let data =
    getTabTrips();

  if(currentService !== "ALL"){

    data =
      data.filter(t=>{

        const service =
          getServiceByTrip(t);

        if(!service){
          return false;
        }

        return (
          getServiceCodeFromService(service)
          === currentService
        );

      });

  }

  return data;

}

function getServicesForCurrentTab(){

  if(currentTab === "TRIPS"){

    return COMPANY_SERVICES.filter(
      s => !isSharedService(s)
    );

  }

  return COMPANY_SERVICES.filter(
    s => isSharedService(s)
  );

}

/* ================= MONEY ================= */

function getTripMoney(t){

  if(isSharedTrip(t)){

    if(Number(t.priceAmount || 0) > 0){
      return Number(t.priceAmount);
    }

    let total = 0;

    (t.passengers || [])
      .forEach(p=>{

        if(
          p.status === "Cancelled" ||
          p.status === "NoShow"
        ){
          total += Number(
            p.price || 15
          );
        }else{
          total += Number(
            p.price || 0
          );
        }

      });

    return total;

  }

  if(
    t.status === "Cancelled" ||
    t.status === "NoShow"
  ){

    return Number(
      t.cancelFee ||
      t.finalPrice ||
      t.priceAmount ||
      15
    );

  }

  return Number(
    t.finalPrice ||
    t.priceAmount ||
    0
  );

}

/* ================= STATS ================= */

function buildStats(){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  if(!wrap) return;

  wrap.innerHTML = "";

  const tabTrips =
    getTabTrips();

  const services =
    getServicesForCurrentTab();

  /* ================= DYNAMIC SERVICES ================= */

  services.forEach(service=>{

    const code =
      getServiceCodeFromService(
        service
      );

    if(
      !code ||
      code === "SH"
    ){
      return;
    }

    const serviceTrips =
      tabTrips.filter(t =>
        tripMatchesService(t,service)
      );

    const totalTrips =
      serviceTrips.length;

    const totalMiles =
      serviceTrips.reduce(
        (sum,t)=>
          sum + Number(t.miles || 0),
        0
      );

    const totalMoney =
      serviceTrips.reduce(
        (sum,t)=>
          sum + getTripMoney(t),
        0
      );

    const card =
      document.createElement("div");

    card.className =
      currentService === code
      ? "stat active"
      : "stat";

    card.innerHTML = `
      <div class="stat-title">
        ${service.title || code}
      </div>

      <div class="stat-value">
        ${totalTrips}
      </div>

      <div class="stat-sub">
        ${totalMiles.toFixed(1)} mi
      </div>

      <div class="stat-money">
        $${totalMoney.toFixed(2)}
      </div>
    `;

    card.onclick = ()=>{

      currentService =
        currentService === code
        ? "ALL"
        : code;

      render();

    };

    wrap.appendChild(card);

  });

  /* ================= TOTAL CARDS ================= */

  const totalTrips =
    tabTrips.length;

  const totalMiles =
    tabTrips.reduce(
      (sum,t)=>
        sum + Number(t.miles || 0),
      0
    );

  const totalMoney =
    tabTrips.reduce(
      (sum,t)=>
        sum + getTripMoney(t),
      0
    );

  const totalCard =
    document.createElement("div");

  totalCard.className =
    "stat total-card";

  totalCard.innerHTML = `
    <div class="stat-title">
      Total Trips
    </div>

    <div class="stat-value">
      ${totalTrips}
    </div>

    <div class="stat-sub">
      ${totalMiles.toFixed(1)} mi
    </div>

    <div class="stat-money">
      $${totalMoney.toFixed(2)}
    </div>
  `;

  wrap.appendChild(totalCard);

}

/* ================= GROUP ================= */

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

/* ================= RENDER ================= */

function render(){

  buildTabs();

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

  Object.keys(groups)
    .sort((a,b)=>
      new Date(b) - new Date(a)
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

        /* ================= INDIVIDUAL ================= */

        if(!isSharedTrip(t)){

          const money =
            getTripMoney(t);

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
              <td>${Number(t.miles || 0).toFixed(1)}</td>
              <td>${statusHTML(t.status)}</td>
              <td class="total">$${money.toFixed(2)}</td>
              <td class="total">$${money.toFixed(2)}</td>

            </tr>

            <tr class="trip-divider-line">
              <td colspan="14"></td>
            </tr>

            <tr class="trip-divider">
              <td colspan="14"></td>
            </tr>
          `;

          return;

        }

        /* ================= SHARED ================= */

        const passengers =
          t.passengers || [];

        const sharedTotal =
          getTripMoney(t);

        passengers.forEach((p,index)=>{

          const passengerPrice =
            (
              p.status === "Cancelled" ||
              p.status === "NoShow"
            )
            ? Number(p.price || 15)
            : Number(p.price || 0);

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
                  p.clientName ||
                  p.name
                )}
              </td>

              <td>
                ${safe(
                  p.clientPhone ||
                  p.phone
                )}
              </td>

              <td>${safe(p.pickup)}</td>

              <td>${safe(p.dropoff)}</td>

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
                  ? Number(t.miles || 0).toFixed(1)
                  : ""}
              </td>

              <td>
                ${statusHTML(
                  p.status || t.status
                )}
              </td>

              <td class="total">
                $${passengerPrice.toFixed(2)}
              </td>

              <td class="total">
                ${
                  index === 0
                  ? "$" + sharedTotal.toFixed(2)
                  : ""
                }
              </td>

            </tr>
          `;

        });

        tbody.innerHTML += `
          <tr class="trip-divider-line">
            <td colspan="14"></td>
          </tr>

          <tr class="trip-divider">
            <td colspan="14"></td>
          </tr>
        `;

      });

    });

}

/* ================= EVENTS ================= */

document.addEventListener("input",e=>{

  if(
    e.target.id === "searchInput"
  ){
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

/* ================= AUTO ================= */

setInterval(load,30000);

/* ================= INIT ================= */

load();