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

/* FILTERS */
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

/* STATUS */
function statusHTML(status){

  return `
    <span class="status ${status.toLowerCase()}">
      ${status}
    </span>
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

/* STATS */
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

      <div class="table-wrap">

      <table class="summary-table">

        <thead>

          <tr>

            <th>#</th>
            <th>Trip#</th>
            <th>Company</th>
            <th>Entry</th>
            <th>Entry Phone</th>

            ${
              currentTab === "individual"
              ? `
                <th>Client</th>
                <th>Phone</th>
              `
              : `
                <th>Passengers</th>
                <th>Phones</th>
              `
            }

            <th>Pickup</th>
            <th>Dropoff</th>

            <th>Trip Date</th>
            <th>Trip Time</th>

            <th>Book Date</th>
            <th>Book Time</th>

            <th>Miles</th>

            <th>Status</th>

            ${
              currentTab === "shared"
              ? `<th>Prices</th>`
              : ``
            }

            <th>Total</th>

          </tr>

        </thead>

        <tbody id="body-${day.replaceAll('/','')}"></tbody>

      </table>

      </div>
    `;

    const tbody =
      document.getElementById(
        `body-${day.replaceAll('/','')}`
      );

    groups[day].forEach((t,i)=>{

      /* INDIVIDUAL */
      if(!t.isShared){

        tbody.innerHTML += `
        <tr>

          <td>${i+1}</td>

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
            $${t.totalPrice || 0}
          </td>

        </tr>
        `;

      }

      /* SHARED */
      else{

        let passengers = "";
        let phones = "";
        let pickups = "";
        let dropoffs = "";
        let statuses = "";
        let prices = "";

        (t.passengers || [])
          .forEach(p=>{

            passengers += `
              <div>${p.clientName || "-"}</div>
            `;

            phones += `
              <div>${p.clientPhone || "-"}</div>
            `;

            pickups += `
              <div>${p.pickup || "-"}</div>
            `;

            dropoffs += `
              <div>${p.dropoff || "-"}</div>
            `;

            statuses += `
              <div>
                ${statusHTML(p.status)}
              </div>
            `;

            prices += `
              <div>$${p.price || 0}</div>
            `;

          });

        tbody.innerHTML += `
        <tr>

          <td>${i+1}</td>

          <td>${t.tripNumber || "-"}</td>

          <td>${t.company || "-"}</td>

          <td>${t.entryName || "-"}</td>

          <td>${t.entryPhone || "-"}</td>

          <td><div class="stack">${passengers}</div></td>

          <td><div class="stack">${phones}</div></td>

          <td><div class="stack">${pickups}</div></td>

          <td><div class="stack">${dropoffs}</div></td>

          <td>${t.tripDate || "-"}</td>

          <td>${t.tripTime || "-"}</td>

          <td>${t.bookingDate || "-"}</td>

          <td>${t.bookingTime || "-"}</td>

          <td>${t.miles || 0}</td>

          <td><div class="stack">${statuses}</div></td>

          <td><div class="stack">${prices}</div></td>

          <td class="total">
            $${t.totalPrice || 0}
          </td>

        </tr>
        `;

      }

    });

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