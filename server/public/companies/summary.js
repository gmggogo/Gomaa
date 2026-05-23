// summary.js

let allTrips = [];

let currentTab = "TRIPS";

let currentService = "ALL";

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

    buildTabs();

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
    .toUpperCase()
    .split("-");

  return parts[
    parts.length - 1
  ] || "";

}

function isSharedTrip(trip){

  return (
    getTripSuffix(trip) === "SH"
  );

}

function getServiceTitle(code){

  switch(code){

    case "ST":
      return "Standard";

    case "TX":
      return "Taxi";

    case "WH":
      return "Wheelchair";

    case "XL":
      return "XL";

    case "LM":
      return "Limo";

    default:
      return code;

  }

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
    <option value="">
      All Months
    </option>

    <option value="01">
      January
    </option>

    <option value="02">
      February
    </option>

    <option value="03">
      March
    </option>

    <option value="04">
      April
    </option>

    <option value="05">
      May
    </option>

    <option value="06">
      June
    </option>

    <option value="07">
      July
    </option>

    <option value="08">
      August
    </option>

    <option value="09">
      September
    </option>

    <option value="10">
      October
    </option>

    <option value="11">
      November
    </option>

    <option value="12">
      December
    </option>
  `;

}

function getFilteredTrips(){

  const q =
    document
      .getElementById(
        "searchInput"
      )
      .value
      .toLowerCase()
      .trim();

  const year =
    document
      .getElementById(
        "yearFilter"
      )
      .value;

  const month =
    document
      .getElementById(
        "monthFilter"
      )
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

    if(
      q &&
      !txt.includes(q)
    ){
      return false;
    }

    if(t.tripDate){

      const parts =
        t.tripDate.split("-");

      if(
        year &&
        parts[0] !== year
      ){
        return false;
      }

      if(
        month &&
        parts[1] !== month
      ){
        return false;
      }

    }

    return true;

  });

}

/* =========================
TABS
========================= */

function buildTabs(){

  const wrap =
    document.getElementById(
      "dynamicTabs"
    );

  wrap.innerHTML = "";

  const hasTrips =
    allTrips.some(
      t => !isSharedTrip(t)
    );

  const hasShared =
    allTrips.some(
      t => isSharedTrip(t)
    );

  if(hasTrips){

    const btn =
      document.createElement(
        "button"
      );

    btn.className =
      currentTab === "TRIPS"
      ? "tab active"
      : "tab";

    btn.innerText =
      `Trips (${
        allTrips.filter(
          t => !isSharedTrip(t)
        ).length
      })`;

    btn.onclick = ()=>{

      currentTab =
        "TRIPS";

      currentService =
        "ALL";

      buildTabs();

      render();

    };

    wrap.appendChild(btn);

  }

  if(hasShared){

    const btn =
      document.createElement(
        "button"
      );

    btn.className =
      currentTab === "SHARED"
      ? "tab active"
      : "tab";

    btn.innerText =
      `Shared (${
        allTrips.filter(
          t => isSharedTrip(t)
        ).length
      })`;

    btn.onclick = ()=>{

      currentTab =
        "SHARED";

      currentService =
        "ALL";

      buildTabs();

      render();

    };

    wrap.appendChild(btn);

  }

}

/* =========================
DATA
========================= */

function getTripsData(){

  let trips =
    getFilteredTrips();

  /* =========================
  MAIN TAB
  ========================= */

  if(currentTab === "TRIPS"){

    trips =
      trips.filter(
        t => !isSharedTrip(t)
      );

  }

  if(currentTab === "SHARED"){

    trips =
      trips.filter(
        t => isSharedTrip(t)
      );

  }

  /* =========================
  SERVICE FILTER
  ========================= */

  if(
    currentService !== "ALL"
  ){

    trips =
      trips.filter(t=>

        getTripSuffix(t)

        === currentService

      );

  }

  return trips;

}

/* =========================
STATS
========================= */

function buildStats(){

  const wrap =
    document.getElementById(
      "dynamicStats"
    );

  wrap.innerHTML = "";

  const trips =
    getTripsData();

  const servicesMap =
    {};

  trips.forEach(t=>{

    const code =
      getTripSuffix(t);

    /* ignore SH */

    if(code === "SH"){
      return;
    }

    if(!servicesMap[code]){

      servicesMap[code] = {
        count:0,
        money:0
      };

    }

    servicesMap[code].count++;

    /* SHARED */

    if(isSharedTrip(t)){

      (t.passengers || [])
      .forEach(p=>{

        if(
          p.status === "NoShow" ||
          p.status === "Cancelled"
        ){

          servicesMap[code].money += 15;

        }else{

          servicesMap[code].money += Number(
            p.price || 0
          );

        }

      });

    }

    /* NORMAL */

    else{

      if(
        t.status === "NoShow" ||
        t.status === "Cancelled"
      ){

        servicesMap[code].money += 15;

      }else{

        servicesMap[code].money += Number(
          t.finalPrice ||
          t.priceAmount ||
          0
        );

      }

    }

  });

  Object.keys(servicesMap)
    .forEach(code=>{

      const card =
        document.createElement(
          "div"
        );

      card.className =
        currentService === code
        ? "stat active"
        : "stat";

      card.innerHTML = `

        <div class="stat-title">
          ${getServiceTitle(code)}
        </div>

        <div class="stat-value">
          ${servicesMap[code].count}
        </div>

        <div class="stat-money">
          $${servicesMap[code].money}
        </div>

      `;

      card.onclick = ()=>{

        if(
          currentService === code
        ){

          currentService =
            "ALL";

        }else{

          currentService =
            code;

        }

        render();

      };

      wrap.appendChild(card);

    });

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

/* =========================
RENDER
========================= */

function render(){

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

      new Date(b) -
      new Date(a)

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

        /* =========================
        NORMAL
        ========================= */

        if(!isSharedTrip(t)){

          const money =

            t.status === "NoShow" ||
            t.status === "Cancelled"

            ? 15

            : Number(
                t.finalPrice ||
                t.priceAmount ||
                0
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

              <td>${t.dropoff || "-"}</td>

              <td>${t.tripDate || "-"}</td>

              <td>${t.tripTime || "-"}</td>

              <td>${t.miles || 0}</td>

              <td>
                ${statusHTML(t.status)}
              </td>

              <td class="total">
                $${money}
              </td>

              <td class="total">
                $${money}
              </td>

            </tr>

            <tr class="trip-divider-line">
              <td colspan="14"></td>
            </tr>

            <tr class="trip-divider">
              <td colspan="14"></td>
            </tr>

          `;

        }

        /* =========================
        SHARED
        ========================= */

        else{

          const passengers =
            t.passengers || [];

          const total =
            passengers.reduce(
              (sum,p)=>{

                if(
                  p.status === "NoShow" ||
                  p.status === "Cancelled"
                ){
                  return sum + 15;
                }

                return sum + Number(
                  p.price || 0
                );

              },
              0
            );

          passengers.forEach((p,index)=>{

            const price =

              p.status === "NoShow" ||
              p.status === "Cancelled"

              ? 15

              : Number(
                  p.price || 0
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
                    ? t.tripNumber
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? t.company
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? t.entryName
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? t.entryPhone
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
                  ${p.dropoff || "-"}
                </td>

                <td>
                  ${
                    index === 0
                    ? t.tripDate
                    : ""
                  }
                </td>

                <td>
                  ${
                    index === 0
                    ? t.tripTime
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
                  $${price}
                </td>

                <td class="total">
                  ${
                    index === 0
                    ? "$" + total
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

        }

      });

    });

}

/* =========================
EVENTS
========================= */

document.addEventListener(
  "input",
  e=>{

    if(
      e.target.id ===
      "searchInput"
    ){
      render();
    }

});

document.addEventListener(
  "change",
  e=>{

    if(
      e.target.id === "yearFilter" ||
      e.target.id === "monthFilter"
    ){
      render();
    }

});

/* =========================
AUTO
========================= */

setInterval(load,30000);

/* =========================
INIT
========================= */

load();