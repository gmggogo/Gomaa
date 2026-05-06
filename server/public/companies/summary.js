let allTrips = [];

/* LOAD */
async function load(){

  try{

    const res =
      await fetch("/api/trips/summary");

    allTrips = await res.json();

    render();

  }catch(err){

    console.log(err);

  }

}

/* SEARCH */
function getFilteredTrips(){

  const q =
    document
      .getElementById("searchInput")
      .value
      .toLowerCase()
      .trim();

  return allTrips.filter(t=>{

    let txt = `
      ${t.tripNumber || ""}
      ${t.company || ""}
      ${t.entryName || ""}
      ${t.entryPhone || ""}
    `;

    if(t.isShared){

      (t.passengers || []).forEach(p=>{

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

    return txt
      .toLowerCase()
      .includes(q);

  });

}

/* STATS */
function updateStats(data){

  let completed = 0;
  let cancelled = 0;
  let noshow = 0;
  let revenue = 0;

  data.forEach(t=>{

    if(t.isShared){

      (t.passengers || []).forEach(p=>{

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

  document.getElementById("totalTrips").innerText =
    data.length;

  document.getElementById("completedTrips").innerText =
    completed;

  document.getElementById("cancelledTrips").innerText =
    cancelled;

  document.getElementById("noShowTrips").innerText =
    noshow;

  document.getElementById("totalRevenue").innerText =
    `$${revenue}`;

}

/* GROUP DAY */
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

/* STATUS HTML */
function statusHTML(status){

  return `
    <span class="status ${status.toLowerCase()}">
      ${status}
    </span>
  `;

}

/* RENDER */
function render(){

  const data =
    getFilteredTrips();

  updateStats(data);

  renderIndividual(data);

  renderShared(data);

}

/* INDIVIDUAL */
function renderIndividual(data){

  const wrap =
    document.getElementById(
      "individualContent"
    );

  wrap.innerHTML = "";

  const trips =
    data.filter(t=>!t.isShared);

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
            <th>Client</th>
            <th>Client Phone</th>
            <th>Pickup</th>
            <th>Dropoff</th>
            <th>Trip Date</th>
            <th>Trip Time</th>
            <th>Book Date</th>
            <th>Book Time</th>
            <th>Miles</th>
            <th>Status</th>
            <th>Total</th>

          </tr>
        </thead>

        <tbody id="ind-${day.replaceAll('/','')}"></tbody>

      </table>

      </div>
    `;

    const tbody =
      document.getElementById(
        `ind-${day.replaceAll('/','')}`
      );

    groups[day].forEach((t,i)=>{

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

    });

  });

}

/* SHARED */
function renderShared(data){

  const wrap =
    document.getElementById(
      "sharedContent"
    );

  wrap.innerHTML = "";

  const trips =
    data.filter(t=>t.isShared);

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
            <th>Passengers</th>
            <th>Phones</th>
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

        <tbody id="sh-${day.replaceAll('/','')}"></tbody>

      </table>

      </div>
    `;

    const tbody =
      document.getElementById(
        `sh-${day.replaceAll('/','')}`
      );

    groups[day].forEach((t,i)=>{

      let passengers = "";
      let phones = "";
      let pickups = "";
      let dropoffs = "";
      let statuses = "";
      let prices = "";

      (t.passengers || [])
        .forEach(p=>{

          passengers += `
            <div>${p.clientName}</div>
          `;

          phones += `
            <div>${p.clientPhone}</div>
          `;

          pickups += `
            <div>${p.pickup}</div>
          `;

          dropoffs += `
            <div>${p.dropoff}</div>
          `;

          statuses += `
            ${statusHTML(p.status)}
          `;

          prices += `
            <div>$${p.price}</div>
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

    });

  });

}

/* SEARCH */
document.addEventListener("input",e=>{

  if(
    e.target.id === "searchInput"
  ){
    render();
  }

});

/* AUTO */
setInterval(load,30000);

/* INIT */
load();