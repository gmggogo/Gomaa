// summary.js

let allTrips = [];
let currentTab = "individual";

/* LOAD */
async function load(){

  try{

    const company =
      localStorage.getItem("name") || "";

    const res =
      await fetch(
        `/api/trips/summary?company=${encodeURIComponent(company)}`
      );

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
    .querySelectorAll(".tab")
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

    txt = txt.toLowerCase();

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

/* GROUP */
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

/* STATUS */
function statusHTML(status){

  let cls = "";

  if(status === "Completed")
    cls = "completed";

  else if(status === "Cancelled")
    cls = "cancelled";

  else if(status === "NoShow")
    cls = "noshow";

  return `
    <span class="status ${cls}">
      ${status}
    </span>
  `;

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

    /* SHARED */
    if(t.isShared){

      shared++;

      const passengers =
        Array.isArray(t.passengers)
          ? t.passengers
          : [];

      passengers.forEach(p=>{

        const status =
          String(
            p.status || ""
          ).trim();

        if(status === "Completed"){
          completed++;
        }

        if(status === "Cancelled"){
          cancelled++;
        }

        if(status === "NoShow"){
          noshow++;
        }

        const price = Number(

          status === "Cancelled"
            ? (t.cancelFee ?? p.cancelFee ?? 15)

            : status === "NoShow"
            ? (t.cancelFee ?? p.cancelFee ?? 15)

            : (
                p.finalPrice ??
                p.priceAmount ??
                0
              )

        );

        revenue += price;

      });

    }

    /* INDIVIDUAL */
    else{

      individual++;

      const status =
        String(
          t.status || ""
        ).trim();

      if(status === "Completed"){
        completed++;
      }

      if(status === "Cancelled"){
        cancelled++;
      }

      if(status === "NoShow"){
        noshow++;
      }

      const price = Number(

        status === "Cancelled"
          ? (t.cancelFee ?? 15)

          : status === "NoShow"
          ? (t.cancelFee ?? 15)

          : (
              t.finalPrice ??
              t.priceAmount ??
              0
            )

      );

      revenue += price;

    }

  });

  document.getElementById(
    "individualTrips"
  ).innerText = individual;

  document.getElementById(
    "sharedTrips"
  ).innerText = shared;

  document.getElementById(
    "completedTrips"
  ).innerText = completed;

  document.getElementById(
    "cancelledTrips"
  ).innerText = cancelled;

  document.getElementById(
    "noShowTrips"
  ).innerText = noshow;

  document.getElementById(
    "totalRevenue"
  ).innerText =
    `$${revenue.toFixed(2)}`;

}

/* RENDER */
function render(){

  const wrap =
    document.getElementById(
      "summaryContent"
    );

  wrap.innerHTML = "";

  const data =
    getFilteredTrips();

  updateStats(data);

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

            <th>Trip#</th>
            <th>Company</th>
            <th>Entry</th>
            <th>Entry Phone</th>
            <th>Passenger</th>
            <th>Phone</th>
            <th>Pickup</th>
            <th>Stops</th>
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

    const tbody =
      document.getElementById(
        `tbody-${day}`
      );

    groups[day].forEach(t=>{

      /* INDIVIDUAL */
      if(!t.isShared){

        const price = Number(

          t.status === "Cancelled"
            ? (t.cancelFee ?? 15)

            : t.status === "NoShow"
            ? (t.cancelFee ?? 15)

            : (
                t.finalPrice ??
                t.priceAmount ??
                0
              )

        );

        tbody.innerHTML += `
        <tr>

          <td>${t.tripNumber || "-"}</td>
          <td>${t.company || "-"}</td>
          <td>${t.entryName || "-"}</td>
          <td>${t.entryPhone || "-"}</td>
          <td>${t.clientName || "-"}</td>
          <td>${t.clientPhone || "-"}</td>
          <td>${t.pickup || "-"}</td>

          <td>
          ${
            Array.isArray(t.stops) &&
            t.stops.length

              ? t.stops
                  .map(s=>String(s))
                  .join("<br>")

              : typeof t.stops === "string" &&
                t.stops.trim()

              ? t.stops

              : "-"
          }
          </td>

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
            $${price.toFixed(2)}
          </td>

          <td class="total">
            $${price.toFixed(2)}
          </td>

        </tr>

        <tr class="trip-divider-line">
          <td colspan="17"></td>
        </tr>

        <tr class="trip-divider">
          <td colspan="16"></td>
        </tr>
        `;

      }

      /* SHARED */
      else{

        const passengers =
          Array.isArray(t.passengers)
            ? t.passengers
            : [];

        passengers.forEach((p,index)=>{

          const passengerPrice = Number(

            p.status === "Cancelled"
              ? (
                  t.cancelFee ??
                  p.cancelFee ??
                  15
                )

              : p.status === "NoShow"
              ? (
                  t.cancelFee ??
                  p.cancelFee ??
                  15
                )

              : (
                  p.finalPrice ??
                  p.priceAmount ??
                  0
                )

          );

          tbody.innerHTML += `
          <tr class="${
            index !== passengers.length - 1
              ? "shared-separator"
              : ""
          }">

            <td>
              ${
                index === 0
                  ? t.tripNumber || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.company || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.entryName || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.entryPhone || "-"
                  : ""
              }
            </td>

            <td>
              ${p.clientName || "-"}
            </td>

            <td>
              ${p.clientPhone || "-"}
            </td>

            <td>
              ${p.pickup || "-"}
            </td>

            <td>

              ${
                passengers.length <= 1
                  ? "Direct"
                  : `${passengers.length - 1} Stops`
              }

            </td>

            <td>
              ${p.dropoff || "-"}
            </td>

            <td>
              ${
                index === 0
                  ? t.tripDate || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.tripTime || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.bookingDate || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.bookingTime || "-"
                  : ""
              }
            </td>

            <td>
              ${
                index === 0
                  ? t.miles || 0
                  : ""
              }
            </td>

            <td>
              ${
                statusHTML(
                  p.status || "Scheduled"
                )
              }
            </td>

            <td class="total">
              $${passengerPrice.toFixed(2)}
            </td>

            <td class="total">
              $${passengerPrice.toFixed(2)}
            </td>

          </tr>
          `;

        });

        tbody.innerHTML += `

        <tr class="trip-divider-line">
          <td colspan="17"></td>
        </tr>

        <tr class="trip-divider">
          <td colspan="16"></td>
        </tr>

        `;

      }

    });

  });

}

/* EVENTS */
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

/* AUTO */
setInterval(load,30000);

/* INIT */
load();