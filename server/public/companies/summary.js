// summary.js

let allTrips = [];
let currentTab = "TRIPS";
let currentService = "ALL";
let COMPANY_SERVICES = [];

const SERVICE_NAMES = {
  ST:"Standard",
  TX:"Taxi",
  WH:"Wheelchair",
  XL:"XL",
  LM:"Limo"
};

async function load(){
  try{
    await loadServices();

    const company = localStorage.getItem("name") || "";
    const res = await fetch(`/api/trips/summary?company=${encodeURIComponent(company)}`);
    allTrips = await res.json();

    buildFilters();
    fixTab();
    render();

  }catch(err){
    console.log(err);
  }
}

async function loadServices(){
  try{
    const token = localStorage.getItem("token") || "";
    const res = await fetch("/api/services",{
      headers:{ Authorization:"Bearer " + token }
    });

    const data = await res.json();

    COMPANY_SERVICES = Array.isArray(data)
      ? data.filter(s => s.enabled === true && s.companyEnabled === true)
      : [];

  }catch(err){
    COMPANY_SERVICES = [];
  }
}

function clean(v){
  return String(v || "").replace(/^-/,"").trim().toUpperCase();
}

function getTripLastCode(t){
  const parts = String(t.tripNumber || "").toUpperCase().split("-");
  return clean(parts[parts.length - 1]);
}

function isSharedTrip(t){
  return (
    t.isShared === true ||
    clean(t.tripType) === "SHARED" ||
    getTripLastCode(t) === "SH" ||
    (Array.isArray(t.passengers) && t.passengers.length > 0)
  );
}

/* الخدمة مش الشير */
function getTripServiceCode(t){
  return clean(
    t.serviceSuffix ||
    t.serviceCode ||
    t.serviceType ||
    (
      getTripLastCode(t) !== "SH"
      ? getTripLastCode(t)
      : ""
    )
  );
}

function getServiceName(code){
  const service = COMPANY_SERVICES.find(s=>{
    const c = clean(
      s.companySuffix ||
      s.serviceSuffix ||
      s.serviceCode ||
      s.code ||
      s.serviceKey
    );
    return c === code;
  });

  return service?.title || service?.name || SERVICE_NAMES[code] || code;
}

function getMoney(t){
  if(isSharedTrip(t)){
    if(Number(t.finalPrice || 0) > 0) return Number(t.finalPrice);
    if(Number(t.priceAmount || 0) > 0) return Number(t.priceAmount);

    return (t.passengers || []).reduce((sum,p)=>{
      if(p.status === "NoShow" || p.status === "Cancelled"){
        return sum + Number(p.price || 15);
      }
      return sum + Number(p.price || 0);
    },0);
  }

  if(t.status === "NoShow" || t.status === "Cancelled"){
    return Number(t.finalPrice || t.priceAmount || t.cancelFee || 15);
  }

  return Number(t.finalPrice || t.priceAmount || 0);
}

function getMiles(t){
  return Number(t.miles || 0);
}

function hasTrips(){
  return allTrips.some(t => !isSharedTrip(t));
}

function hasShared(){
  return allTrips.some(t => isSharedTrip(t));
}

function fixTab(){
  if(currentTab === "SHARED" && !hasShared()){
    currentTab = "TRIPS";
  }

  if(currentTab === "TRIPS" && !hasTrips() && hasShared()){
    currentTab = "SHARED";
  }
}

function buildTabs(){
  const wrap = document.getElementById("dynamicTabs");
  if(!wrap) return;

  wrap.innerHTML = "";

  if(hasTrips()){
    const count = getFilteredTrips().filter(t=>!isSharedTrip(t)).length;

    const btn = document.createElement("button");
    btn.className = currentTab === "TRIPS" ? "tab active" : "tab";
    btn.innerText = `Trips (${count})`;
    btn.onclick = ()=>{
      currentTab = "TRIPS";
      currentService = "ALL";
      render();
    };
    wrap.appendChild(btn);
  }

  if(hasShared()){
    const count = getFilteredTrips().filter(t=>isSharedTrip(t)).length;

    const btn = document.createElement("button");
    btn.className = currentTab === "SHARED" ? "tab active" : "tab";
    btn.innerText = `Shared (${count})`;
    btn.onclick = ()=>{
      currentTab = "SHARED";
      currentService = "ALL";
      render();
    };
    wrap.appendChild(btn);
  }
}

function buildFilters(){
  const year = document.getElementById("yearFilter");
  const month = document.getElementById("monthFilter");

  if(year.options.length) return;

  const years = new Set();

  allTrips.forEach(t=>{
    if(t.tripDate){
      years.add(t.tripDate.split("-")[0]);
    }
  });

  year.innerHTML = `<option value="">All Years</option>`;

  [...years].sort((a,b)=>b-a).forEach(y=>{
    year.innerHTML += `<option value="${y}">${y}</option>`;
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
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  const year = document.getElementById("yearFilter").value;
  const month = document.getElementById("monthFilter").value;

  return allTrips.filter(t=>{
    let txt = `
      ${t.tripNumber || ""}
      ${t.company || ""}
      ${t.entryName || ""}
      ${t.entryPhone || ""}
      ${t.clientName || ""}
      ${t.clientPhone || ""}
      ${t.serviceSuffix || ""}
      ${t.serviceType || ""}
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

    txt = txt.toLowerCase();

    if(q && !txt.includes(q)) return false;

    if(t.tripDate){
      const parts = t.tripDate.split("-");
      if(year && parts[0] !== year) return false;
      if(month && parts[1] !== month) return false;
    }

    return true;
  });
}

function getTabTrips(){
  let data = getFilteredTrips();

  if(currentTab === "TRIPS"){
    data = data.filter(t=>!isSharedTrip(t));
  }

  if(currentTab === "SHARED"){
    data = data.filter(t=>isSharedTrip(t));
  }

  return data;
}

function getTripsData(){
  let data = getTabTrips();

  if(currentService !== "ALL"){
    data = data.filter(t=>getTripServiceCode(t) === currentService);
  }

  return data;
}

/* الخانات الخضرا */
function buildStats(){
  const wrap = document.getElementById("dynamicStats");
  if(!wrap) return;

  wrap.innerHTML = "";

  const tabTrips = getTabTrips();
  const map = {};

  tabTrips.forEach(t=>{
    const code = getTripServiceCode(t);

    if(!code || code === "SH") return;

    if(!map[code]){
      map[code] = {
        trips:0,
        miles:0,
        money:0
      };
    }

    map[code].trips += 1;
    map[code].miles += getMiles(t);
    map[code].money += getMoney(t);
  });

  Object.keys(map).forEach(code=>{
    const card = document.createElement("div");

    card.className =
      currentService === code
      ? "stat active"
      : "stat";

    card.innerHTML = `
      <div class="stat-title">${getServiceName(code)}</div>
      <div class="stat-value">${map[code].trips}</div>
      <div class="stat-money">${map[code].miles.toFixed(1)} mi</div>
      <div class="stat-money">$${map[code].money.toFixed(2)}</div>
    `;

    card.onclick = ()=>{
      currentService = currentService === code ? "ALL" : code;
      render();
    };

    wrap.appendChild(card);
  });
}

function groupByDay(data){
  const groups = {};

  data.forEach(t=>{
    const d = t.tripDate || "Unknown";
    if(!groups[d]) groups[d] = [];
    groups[d].push(t);
  });

  return groups;
}

function statusHTML(status){
  let cls = "";

  if(status === "Completed") cls = "completed";
  else if(status === "Cancelled") cls = "cancelled";
  else if(status === "NoShow") cls = "noshow";

  return `<span class="status ${cls}">${status || "Scheduled"}</span>`;
}

function safe(v){
  return String(v ?? "-");
}

function render(){
  fixTab();
  buildTabs();
  buildStats();

  const wrap = document.getElementById("summaryContent");
  wrap.innerHTML = "";

  const trips = getTripsData();
  const groups = groupByDay(trips);

  Object.keys(groups)
    .sort((a,b)=>new Date(b) - new Date(a))
    .forEach(day=>{

      wrap.innerHTML += `
        <div class="day-title">${day}</div>
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

      const tbody = document.getElementById(`tbody-${day}`);

      groups[day].forEach(t=>{

        if(!isSharedTrip(t)){
          const money = getMoney(t);

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
              <td>${statusHTML(t.status)}</td>
              <td class="total">$${money.toFixed(2)}</td>
              <td class="total">$${money.toFixed(2)}</td>
            </tr>

            <tr class="trip-divider-line">
              <td colspan="16"></td>
            </tr>

            <tr class="trip-divider">
              <td colspan="16"></td>
            </tr>
          `;

          return;
        }

        const passengers = t.passengers || [];
        const total = getMoney(t);

        passengers.forEach((p,index)=>{
          const price =
            p.status === "NoShow" || p.status === "Cancelled"
            ? Number(p.price || 15)
            : Number(p.price || 0);

          tbody.innerHTML += `
            <tr class="${index !== passengers.length - 1 ? "shared-separator" : ""}">
              <td>${index === 0 ? safe(t.tripNumber) : ""}</td>
              <td>${index === 0 ? safe(t.company) : ""}</td>
              <td>${index === 0 ? safe(t.entryName) : ""}</td>
              <td>${index === 0 ? safe(t.entryPhone) : ""}</td>
              <td>${safe(p.clientName || p.name)}</td>
              <td>${safe(p.clientPhone || p.phone)}</td>
              <td>${safe(p.pickup)}</td>
              <td>${safe(p.dropoff)}</td>
              <td>${index === 0 ? safe(t.tripDate) : ""}</td>
              <td>${index === 0 ? safe(t.tripTime) : ""}</td>
              <td>${index === 0 ? safe(t.bookingDate) : ""}</td>
              <td>${index === 0 ? safe(t.bookingTime) : ""}</td>
              <td>${index === 0 ? safe(t.miles || 0) : ""}</td>
              <td>${statusHTML(p.status || t.status)}</td>
              <td class="total">$${price.toFixed(2)}</td>
              <td class="total">${index === 0 ? "$" + total.toFixed(2) : ""}</td>
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
      });
    });
}

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

setInterval(load,30000);

load();