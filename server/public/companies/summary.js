let allTrips = [];
let currentTab = "individual";

/* LOAD */
async function load(){

  try{

    const res =
      await fetch("/api/trips/summary");

    allTrips = await res.json();

    buildFilters();

    render();

  }catch(err){

    console.log(err);

  }

}

/* TAB */
function switchTab(tab,btn){

  currentTab = tab;

  document
    .querySelectorAll(".summary-tab")
    .forEach(t=>t.classList.remove("active"));

  btn.classList.add("active");

  render();

}

/* BUILD FILTERS */
function buildFilters(){

  const yearSelect =
    document.getElementById("yearFilter");

  const monthSelect =
    document.getElementById("monthFilter");

  if(yearSelect.options.length) return;

  const years = new Set();

  allTrips.forEach(t=>{

    if(t.tripDate){

      years.add(
        t.tripDate.split("-")[0]
      );

    }

  });

  yearSelect.innerHTML =
    `<option value="">All Years</option>`;

  [...years]
    .sort((a,b)=>b-a)
    .forEach(y=>{

      yearSelect.innerHTML += `
        <option value="${y}">
          ${y}
        </option>
      `;

    });

  monthSelect.innerHTML = `
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

/* FILTER */
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

    /* SEARCH */
    let txt = `
      ${t.tripNumber || ""}
      ${t.company || ""}
      ${t.entryName || ""}
      ${t.entryPhone || ""}
    `;

    if(t.isShared){

      (t.passengers || [])
        .forEach(p=>{

          txt += `
            ${p.clientName || ""}
            ${p.clientPhone || ""}
          `;

        });

    }else{

      txt += `
        ${t.clientName || ""}
        ${t.clientPhone || ""}
      `;

    }

    txt = txt.toLowerCase();

    if(q && !txt.includes(q)){
      return false;
    }

    /* DATE */
    if(t.tripDate){

      const parts =
        t.tripDate.split("-");

      const y = parts[0];
      const m = parts[1];

      if(year && y !== year){
        return false;
      }

      if(month && m !== month){
        return false;
      }

    }

    return true;

  });

}

/* GROUP */
function groupByDay(data){

  const groups = {};

  data.forEach(t=>{

    const day = t.tripDate || "Unknown";

    if(!groups[day]){
      groups[day] = [];
    }

    groups[day].push(t);

  });

  return groups;

}

/* UPDATE STATS */
function updateStats(data){

  let individual = 0;
  let shared = 0;

  let completed = 0;
  let cancelled = 0;
  let noshow = 0;

  let revenue = 0;

  data.forEach(t=>{

    if(t.isShared){

      shared++;

      (t.passengers || [])
        .forEach(p=>{

          if(p.status === "Completed")
            completed++;

          if(p.status === "Cancelled"){
            cancelled++;
            revenue += 15;
          }

          if(p.status === "NoShow"){
            noshow++;
            revenue += 15;
          }

        });

    }else{

      individual++;

      if(t.status === "Completed")
        completed++;

      if(t.status === "Cancelled"){
        cancelled++;
        revenue += 15;
      }

      if(t.status === "NoShow"){
        noshow++;
        revenue += 15;
      }

    }

  });

  document.getElementById("individualTrips").innerText =
    individual;

  document.getElementById("sharedTrips").innerText =
    shared;

  document.getElementById("completedTrips").innerText =
    completed;

  document.getElementById("cancelledTrips").innerText =
    cancelled;

  document.getElementById("noShowTrips").innerText =
    noshow;

  document.getElementById("totalRevenue").innerText =
    `$${revenue}`;

}

/* RENDER */
function render(){

  const data =
    getFilteredTrips();

  updateStats(data);

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  wrap.innerHTML = "";

  const trips =
    currentTab === "individual"
      ? data.filter(t=>!t.isShared)
      : data.filter(t=>t.isShared);

  const groups =
    groupByDay(trips);

  Object.keys(groups).forEach(day=>{

    wrap.innerHTML += `
      <div class="day-title">
        ${day}
      </div>
    `;

    tripsRender(
      groups[day],
      wrap
    );

  });

}

/* RENDER TRIPS */
function tripsRender(list,wrap){

  list.forEach(t=>{

    /* INDIVIDUAL */
    if(!t.isShared){

      wrap.innerHTML += `
      <div class="trip-card">

        <div class="trip-header">

          <div class="trip-number">
            ${t.tripNumber}
          </div>

          <div class="trip-info">
            ${t.tripDate} |
            ${t.tripTime} |
            ${t.miles || 0} mi
          </div>

        </div>

        <div class="trip-body">

          <div class="trip-grid">

            <div class="box">
              <div class="box-title">Company</div>
              <div class="box-value">${t.company || "-"}</div>
            </div>

            <div class="box">
              <div class="box-title">Entry</div>
              <div class="box-value">
                ${t.entryName || "-"}<br>
                ${t.entryPhone || ""}
              </div>
            </div>

            <div class="box">
              <div class="box-title">Booking</div>
              <div class="box-value">
                ${t.bookingDate || "-"}<br>
                ${t.bookingTime || ""}
              </div>
            </div>

          </div>

          <div class="passenger-grid">

            <div class="passenger-card ${t.status.toLowerCase()}">

              <div class="passenger-name">
                ${t.clientName || "-"}
              </div>

              <div class="passenger-row">
                <span class="passenger-label">Phone:</span>
                ${t.clientPhone || "-"}
              </div>

              <div class="passenger-row">
                <span class="passenger-label">Pickup:</span>
                ${t.pickup || "-"}
              </div>

              <div class="passenger-row">
                <span class="passenger-label">Dropoff:</span>
                ${t.dropoff || "-"}
              </div>

              <div class="passenger-row">
                <span class="passenger-label">Status:</span>
                ${t.status}
              </div>

              <div class="passenger-row">
                <span class="passenger-label">Total:</span>
                $${t.totalPrice || 0}
              </div>

            </div>

          </div>

        </div>

      </div>
      `;

    }

    /* SHARED */
    else{

      let passengers = "";

      (t.passengers || [])
        .forEach(p=>{

          passengers += `
          <div class="passenger-card ${p.status.toLowerCase()}">

            <div class="passenger-name">
              ${p.clientName || "-"}
            </div>

            <div class="passenger-row">
              <span class="passenger-label">Phone:</span>
              ${p.clientPhone || "-"}
            </div>

            <div class="passenger-row">
              <span class="passenger-label">Pickup:</span>
              ${p.pickup || "-"}
            </div>

            <div class="passenger-row">
              <span class="passenger-label">Dropoff:</span>
              ${p.dropoff || "-"}
            </div>

            <div class="passenger-row">
              <span class="passenger-label">Status:</span>
              ${p.status}
            </div>

            <div class="passenger-row">
              <span class="passenger-label">Price:</span>
              $${p.price || 0}
            </div>

          </div>
          `;

        });

      wrap.innerHTML += `
      <div class="trip-card">

        <div class="trip-header">

          <div class="trip-number">
            ${t.tripNumber}
          </div>

          <div class="trip-info">
            ${t.tripDate} |
            ${t.tripTime} |
            ${t.miles || 0} mi |
            ${t.totalPassengers} Passengers
          </div>

        </div>

        <div class="trip-body">

          <div class="trip-grid">

            <div class="box">
              <div class="box-title">Company</div>
              <div class="box-value">${t.company || "-"}</div>
            </div>

            <div class="box">
              <div class="box-title">Entry</div>
              <div class="box-value">
                ${t.entryName || "-"}<br>
                ${t.entryPhone || ""}
              </div>
            </div>

            <div class="box">
              <div class="box-title">Booking</div>
              <div class="box-value">
                ${t.bookingDate || "-"}<br>
                ${t.bookingTime || ""}
              </div>
            </div>

          </div>

          <div class="passenger-grid">
            ${passengers}
          </div>

        </div>

        <div class="trip-footer">

          <div>Total Trip:</div>

          <div class="total">
            $${t.totalPrice || 0}
          </div>

        </div>

      </div>
      `;

    }

  });

}

/* EVENTS */
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

/* AUTO */
setInterval(load,30000);

/* INIT */
load();