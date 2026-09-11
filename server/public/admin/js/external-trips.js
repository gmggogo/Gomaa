"use strict";

/*
DESTINATION PATH:
server/public/admin/js/external-summary.js

External Summary:
- Broker trips only.
- Price is the saved Broker Review Confirm price.
- Final status comes from Driver / Dispatch flow.
- Eye button shows broker-specific extra trip data.
*/

const API_URL =
  "/api/external-summary";

const role =
  String(
    localStorage.getItem("role") ||
    sessionStorage.getItem("role") ||
    ""
  ).toUpperCase();

const token =
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  sessionStorage.getItem("staffToken") ||
  "";

if(
  !token ||
  ![
    "SUPER_ADMIN",
    "ADMIN",
    "DISPATCHER"
  ].includes(role)
){
  window.location.href =
    "/login.html";
}

let allTrips = [];
let brokers = [];
let displayItems = [];
let activeService = "ALL";
let refreshTimer = null;

const searchInput =
  document.getElementById(
    "searchInput"
  );

const brokerFilter =
  document.getElementById(
    "brokerFilter"
  );

const serviceFilter =
  document.getElementById(
    "serviceFilter"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

const yearFilter =
  document.getElementById(
    "yearFilter"
  );

const monthFilter =
  document.getElementById(
    "monthFilter"
  );

const dayFilter =
  document.getElementById(
    "dayFilter"
  );

const summaryContent =
  document.getElementById(
    "summaryContent"
  );

const printBtn =
  document.getElementById(
    "printBtn"
  );

const csvBtn =
  document.getElementById(
    "csvBtn"
  );

const excelBtn =
  document.getElementById(
    "excelBtn"
  );

function safe(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function clean(value){
  return String(value ?? "").trim();
}

function num(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value){
  return "$" +
    num(value).toFixed(2);
}

function cellBox(items){

  const arr =
    Array.isArray(items)
      ? items
      : [items];

  return `
    <div class="cell-box">
      ${
        arr.map(
          value=>`
            <div class="cell-item">
              ${safe(value || "--")}
            </div>
          `
        ).join("")
      }
    </div>
  `;
}

function stopsDisplay(trip){

  const stops =
    Array.isArray(trip?.stops)
      ? trip.stops
      : [];

  if(!stops.length){
    return "--";
  }

  return stops
    .map(
      (stop,index)=>
        `${index + 1}. ${
          clean(
            stop?.address ||
            stop?.formattedAddress ||
            stop
          )
        }`
    )
    .filter(Boolean)
    .join("\n");
}

function stopItems(trip){
  const text =
    stopsDisplay(trip);

  return text === "--"
    ? ["--"]
    : text.split("\n");
}

function statusClass(status){

  if(status === "Completed"){
    return "completed";
  }

  if(status === "Cancelled"){
    return "cancelled";
  }

  if(status === "No Show"){
    return "noshow";
  }

  if(status === "Not Completed"){
    return "notcompleted";
  }

  if(status === "Mixed Closed"){
    return "mixed";
  }

  return "";
}

function statusHTML(status){
  const cls =
    statusClass(status);

  return `
    <span class="status-pill ${cls}">
      ${safe(status || "-")}
    </span>
  `;
}

function serviceNameByCode(code){

  const map = {
    ST:"Standard",
    WH:"Wheelchair",
    SH:"Shared",
    TX:"Taxi",
    LM:"Limousine",
    XL:"XL"
  };

  return (
    map[
      clean(code)
        .toUpperCase()
    ] ||
    clean(code) ||
    "Service"
  );
}

function serviceCodes(){

  return [
    ...new Set(
      allTrips
        .map(
          trip=>
            clean(
              trip.serviceCode
            ).toUpperCase()
        )
        .filter(Boolean)
    )
  ];
}

function hasShared(){
  return serviceCodes()
    .includes("SH");
}

function getTripNumber(t){
  return clean(t?.tripNumber) || "-";
}

function getAZNow(){
  return new Date(
    new Date()
      .toLocaleString(
        "en-US",
        {
          timeZone:
            "America/Phoenix"
        }
      )
  );
}

function dateKey(d){
  return `${
    d.getFullYear()
  }-${
    String(
      d.getMonth()+1
    ).padStart(2,"0")
  }-${
    String(
      d.getDate()
    ).padStart(2,"0")
  }`;
}

function monthKey(d){
  return dateKey(d)
    .slice(0,7);
}

function buildQuery(){

  const params =
    new URLSearchParams();

  if(
    brokerFilter?.value &&
    brokerFilter.value !== "ALL"
  ){
    params.set(
      "brokerCode",
      brokerFilter.value
    );
  }

  return params.toString()
    ? `?${params.toString()}`
    : "";
}

async function load(){

  const res =
    await fetch(
      `${API_URL}${buildQuery()}`,
      {
        cache:"no-store",
        headers:{
          Authorization:
            `Bearer ${token}`
        }
      }
    );

  const data =
    await res
      .json()
      .catch(()=>({}));

  if(!res.ok){
    throw new Error(
      data.message ||
      "Failed to load External Summary"
    );
  }

  allTrips =
    Array.isArray(data.items)
      ? data.items
      : [];

  brokers =
    Array.isArray(data.brokers)
      ? data.brokers
      : [];

  renderBrokerFilter();
  buildDateFilters();
  renderServiceFilter();
  applyFilters();
}

function renderBrokerFilter(){

  if(!brokerFilter){
    return;
  }

  const current =
    brokerFilter.value ||
    "ALL";

  brokerFilter.innerHTML =
    `<option value="ALL">All Brokers</option>` +
    brokers.map(
      broker=>`
        <option value="${safe(broker.code)}">
          ${safe(
            broker.name ||
            broker.code
          )}
        </option>
      `
    ).join("");

  brokerFilter.value =
    brokers.some(
      broker=>
        broker.code === current
    )
      ? current
      : "ALL";
}

function buildDateFilters(){

  if(
    !yearFilter ||
    !monthFilter ||
    !dayFilter
  ){
    return;
  }

  const oldYear =
    yearFilter.value || "";

  const oldMonth =
    monthFilter.value || "";

  const oldDay =
    dayFilter.value || "";

  const years =
    new Set();

  allTrips.forEach(
    trip=>{

      const year =
        clean(
          trip.tripDate
        ).split("-")[0];

      if(year){
        years.add(year);
      }
    }
  );

  yearFilter.innerHTML =
    `<option value="">All Years</option>`;

  [...years]
    .sort(
      (a,b)=>
        Number(b) -
        Number(a)
    )
    .forEach(
      year=>{

        yearFilter.innerHTML += `
          <option value="${safe(year)}">
            ${safe(year)}
          </option>
        `;
      }
    );

  monthFilter.innerHTML = `
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

  dayFilter.innerHTML =
    `<option value="">All Days</option>`;

  for(let i=1;i<=31;i++){
    const day =
      String(i)
        .padStart(2,"0");

    dayFilter.innerHTML += `
      <option value="${day}">
        ${day}
      </option>
    `;
  }

  yearFilter.value =
    oldYear;

  monthFilter.value =
    oldMonth;

  dayFilter.value =
    oldDay;
}

function renderServiceFilter(){

  if(!serviceFilter){
    return;
  }

  const codes =
    serviceCodes();

  serviceFilter.innerHTML =
    `<option value="ALL">All Services</option>`;

  codes.forEach(
    code=>{

      serviceFilter.innerHTML += `
        <option value="${safe(code)}">
          ${safe(serviceNameByCode(code))}
        </option>
      `;
    }
  );

  if(
    activeService !== "ALL" &&
    !codes.includes(activeService)
  ){
    activeService = "ALL";
  }

  serviceFilter.value =
    activeService;
}

function searchableText(trip){

  return [
    trip.tripNumber,
    trip.brokerName,
    trip.brokerCode,
    trip.brokerTripId,
    trip.serviceName,
    trip.serviceCode,
    trip.passenger,
    trip.phone,
    trip.email,
    trip.pickup,
    stopsDisplay(trip),
    trip.dropoff,
    trip.tripDate,
    trip.tripTime,
    trip.status,
    trip.driverName,
    trip.vehicleNumber,
    trip.notes,
    JSON.stringify(
      trip.passengers ||
      []
    ),
    JSON.stringify(
      trip.externalTrips ||
      []
    )
  ].join(" ")
    .toLowerCase();
}

function applyFilters(){

  let out =
    [...allTrips];

  if(
    activeService !== "ALL"
  ){
    out =
      out.filter(
        trip=>
          clean(
            trip.serviceCode
          ).toUpperCase() ===
          activeService
      );
  }

  const query =
    clean(
      searchInput?.value
    ).toLowerCase();

  if(query){
    out =
      out.filter(
        trip=>
          searchableText(trip)
            .includes(query)
      );
  }

  const status =
    statusFilter?.value ||
    "";

  if(status){
    out =
      out.filter(
        trip=>
          trip.status ===
          status
      );
  }

  const year =
    yearFilter?.value ||
    "";

  const month =
    monthFilter?.value ||
    "";

  const day =
    dayFilter?.value ||
    "";

  if(year){
    out =
      out.filter(
        trip=>
          clean(
            trip.tripDate
          ).split("-")[0] ===
          year
      );
  }

  if(month){
    out =
      out.filter(
        trip=>
          clean(
            trip.tripDate
          ).split("-")[1] ===
          month
      );
  }

  if(day){
    out =
      out.filter(
        trip=>
          clean(
            trip.tripDate
          ).split("-")[2] ===
          day
      );
  }

  displayItems =
    out.sort(
      (a,b)=>
        String(
          b.tripDate +
          " " +
          b.tripTime
        ).localeCompare(
          String(
            a.tripDate +
            " " +
            a.tripTime
          )
        )
    );

  render();
}

function createStats(){
  return {
    total:0,
    today:0,
    month:0,
    completed:0,
    cancelled:0,
    noshow:0,
    notCompleted:0,
    mixed:0,
    revenue:0,
    miles:0,
    shared:0,
    sharedPassengers:0,
    individual:0
  };
}

function countItem(stats,trip){

  stats.total++;

  const now =
    getAZNow();

  if(
    trip.tripDate ===
    dateKey(now)
  ){
    stats.today++;
  }

  if(
    clean(trip.tripDate)
      .slice(0,7) ===
    monthKey(now)
  ){
    stats.month++;
  }

  stats.revenue +=
    num(trip.total);

  stats.miles +=
    num(trip.miles);

  if(trip.status === "Completed"){
    stats.completed++;
  }else if(
    trip.status === "Cancelled"
  ){
    stats.cancelled++;
  }else if(
    trip.status === "No Show"
  ){
    stats.noshow++;
  }else if(
    trip.status === "Not Completed"
  ){
    stats.notCompleted++;
  }else if(
    trip.status === "Mixed Closed"
  ){
    stats.mixed++;
  }

  if(trip.isShared){
    stats.shared++;
    stats.sharedPassengers +=
      Number(
        trip.passengerCount ||
        0
      );
  }else{
    stats.individual++;
  }
}

function statsFor(
  list
){
  const stats =
    createStats();

  list.forEach(
    trip=>
      countItem(
        stats,
        trip
      )
  );

  return stats;
}

function renderStats(){

  const stats =
    statsFor(
      displayItems
    );

  const wrap =
    document.getElementById(
      "summaryStats"
    );

  if(!wrap){
    return;
  }

  wrap.classList.toggle(
    "no-shared",
    !hasShared()
  );

  const sharedCards =
    hasShared()
      ? `
          <div class="stat-card shared">
            <div class="stat-number">
              ${stats.shared}
            </div>
            <div class="stat-label">
              Shared Trips
            </div>
          </div>

          <div class="stat-card shared">
            <div class="stat-number">
              ${stats.sharedPassengers}
            </div>
            <div class="stat-label">
              Shared Passengers
            </div>
          </div>

          <div class="stat-card total">
            <div class="stat-number">
              ${stats.individual}
            </div>
            <div class="stat-label">
              Individual Trips
            </div>
          </div>
        `
      : "";

  wrap.innerHTML = `
    <div class="stat-card total">
      <div class="stat-number">
        ${stats.total}
      </div>
      <div class="stat-label">
        Total Closed
      </div>
    </div>

    <div class="stat-card completed">
      <div class="stat-number">
        ${stats.completed}
      </div>
      <div class="stat-label">
        Completed
      </div>
    </div>

    <div class="stat-card cancelled">
      <div class="stat-number">
        ${stats.cancelled}
      </div>
      <div class="stat-label">
        Cancelled
      </div>
    </div>

    <div class="stat-card noshow">
      <div class="stat-number">
        ${stats.noshow}
      </div>
      <div class="stat-label">
        No Show
      </div>
    </div>

    <div class="stat-card notcompleted">
      <div class="stat-number">
        ${stats.notCompleted}
      </div>
      <div class="stat-label">
        Not Completed
      </div>
    </div>

    <div class="stat-card money big-card">
      <div class="stat-number">
        ${money(stats.revenue)}
      </div>
      <div class="stat-label">
        Broker Revenue
      </div>
    </div>

    <div class="stat-card miles">
      <div class="stat-number">
        ${stats.miles.toFixed(1)}
      </div>
      <div class="stat-label">
        Total Miles
      </div>
    </div>

    ${sharedCards}
  `;
}

function statsForService(code){

  const list =
    code === "ALL"
      ? displayItems
      : displayItems.filter(
          trip=>
            clean(
              trip.serviceCode
            ).toUpperCase() ===
            code
        );

  return statsFor(list);
}

function updateServiceCardsLayout(){

  const wrap =
    document.getElementById(
      "serviceCards"
    );

  if(!wrap){
    return;
  }

  const count =
    wrap.querySelectorAll(
      ".service-card"
    ).length || 1;

  const cols =
    Math.min(
      count,
      6
    );

  wrap.style.setProperty(
    "--service-cols",
    cols
  );
}

function renderServiceCards(){

  const wrap =
    document.getElementById(
      "serviceCards"
    );

  if(!wrap){
    return;
  }

  const codes =
    serviceCodes();

  const cards = [
    {
      code:"ALL",
      title:"ALL"
    },
    ...codes.map(
      code=>({
        code,
        title:
          serviceNameByCode(
            code
          )
      })
    )
  ];

  wrap.innerHTML =
    cards.map(
      card=>{

        const stats =
          statsForService(
            card.code
          );

        const active =
          activeService ===
          card.code
            ? "active-card"
            : "";

        return `
          <div
            class="service-card ${active}"
            data-service="${safe(card.code)}"
          >
            <div class="service-card-title">
              ${safe(card.title)}
            </div>

            <div class="service-line">
              <span>Total</span>
              <span>${stats.total}</span>
            </div>

            <div class="service-line">
              <span>Revenue</span>
              <span>${money(stats.revenue)}</span>
            </div>

            <div class="service-line">
              <span>Miles</span>
              <span>${stats.miles.toFixed(1)}</span>
            </div>

            <div class="service-line">
              <span>Completed</span>
              <span>${stats.completed}</span>
            </div>

            <div class="service-line">
              <span>No Show</span>
              <span>${stats.noshow}</span>
            </div>

            <div class="service-line">
              <span>Cancelled</span>
              <span>${stats.cancelled}</span>
            </div>
          </div>
        `;
      }
    ).join("");

  wrap
    .querySelectorAll(
      ".service-card"
    )
    .forEach(
      card=>{

        card.onclick = ()=>{
          activeService =
            card.dataset.service ||
            "ALL";

          if(serviceFilter){
            serviceFilter.value =
              activeService;
          }

          applyFilters();
        };
      }
    );

  updateServiceCardsLayout();
}

function viewLine(
  label,
  value
){

  return `
    <div class="view-line">
      <div class="view-label">
        ${safe(label)}
      </div>
      <div class="view-value">
        ${safe(value || "--")}
      </div>
    </div>
  `;
}

function externalBreakdown(trip){

  const list =
    Array.isArray(
      trip.externalTrips
    )
      ? trip.externalTrips
      : [];

  if(!list.length){
    return "--";
  }

  return list.map(
    (ex,index)=>[
      `${index + 1}. ${ex.clientName || "-"}`,
      `Broker Trip: ${ex.externalTripId || "-"}`,
      `Member ID: ${ex.memberId || "-"}`,
      `Phone: ${ex.clientPhone || "-"}`,
      `Email: ${ex.clientEmail || "-"}`,
      `Appointment: ${ex.appointmentTime || "-"}`,
      `Return Time: ${ex.returnTime || "-"}`,
      `Pickup: ${ex.pickup || "-"}`,
      `Stops: ${
        Array.isArray(ex.stops) &&
        ex.stops.length
          ? ex.stops.join(" | ")
          : "-"
      }`,
      `Dropoff: ${ex.dropoff || "-"}`,
      `Service: ${
        ex.serviceName ||
        ex.serviceKey ||
        "-"
      }`,
      `Notes: ${ex.notes || "-"}`
    ].join("\n")
  ).join("\n\n");
}

function passengerBreakdown(trip){

  const list =
    Array.isArray(
      trip.passengers
    )
      ? trip.passengers
      : [];

  if(!list.length){
    return "--";
  }

  return list.map(
    (p,index)=>[
      `${index + 1}. ${p.name || "-"}`,
      `Phone: ${p.phone || "-"}`,
      `Email: ${p.email || "-"}`,
      `Pickup: ${p.pickup || "-"}`,
      `Dropoff: ${p.dropoff || "-"}`,
      `Status: ${p.status || "-"}`,
      `Fees: ${money(p.fee)}`,
      `Total: ${money(p.total)}`
    ].join("\n")
  ).join("\n\n");
}

function moneyBreakdown(trip){

  return [
    `Confirmed Trip Price: ${money(trip.finalPrice || trip.priceAmount)}`,
    `Price Per Passenger: ${money(trip.pricePerPassenger)}`,
    `Cancel Fee: ${money(trip.cancelFee)}`,
    `No Show Fee: ${money(trip.noShowFee)}`,
    `Applied Fee: ${money(trip.fee)}`,
    `Final Summary Total: ${money(trip.total)}`
  ].join("\n");
}

function openExternalSummaryView(id){

  const trip =
    displayItems.find(
      item=>
        String(item.id) ===
        String(id)
    );

  if(!trip){
    return;
  }

  closeExternalSummaryView();

  const overlay =
    document.createElement(
      "div"
    );

  overlay.id =
    "externalSummaryViewOverlay";

  overlay.className =
    "view-overlay";

  overlay.innerHTML = `
    <div class="view-box">

      <div class="view-head">
        <div>
          Broker Trip Details
        </div>

        <button
          class="view-close"
          type="button"
          onclick="closeExternalSummaryView()"
        >
          ×
        </button>
      </div>

      <div class="view-body">
        ${viewLine("Trip Number",trip.tripNumber)}
        ${viewLine("Broker",trip.brokerName)}
        ${viewLine("Broker Code",trip.brokerCode)}
        ${viewLine("Broker Trip ID",trip.brokerTripId)}
        ${viewLine("Service",trip.serviceName)}
        ${viewLine("Trip Type",trip.isShared ? "Shared" : "Individual")}
        ${viewLine("Shared Group",trip.groupId)}
        ${viewLine("Trip Date",trip.tripDate)}
        ${viewLine("Trip Time",trip.tripTime)}
        ${viewLine("Appointment",trip.appointmentTime)}
        ${viewLine("Return Time",trip.returnTime)}
        ${viewLine("Driver",trip.driverName)}
        ${viewLine("Vehicle",trip.vehicleNumber)}
        ${viewLine("Final Status",trip.status)}
        ${viewLine("Miles",num(trip.miles).toFixed(1))}
        ${viewLine("Pickup",trip.pickup)}
        ${viewLine("Stops",stopsDisplay(trip))}
        ${viewLine("Dropoff",trip.dropoff)}
        ${viewLine("Passenger Details",passengerBreakdown(trip))}
        ${viewLine("Broker Source Details",externalBreakdown(trip))}
        ${viewLine("Pricing Details",moneyBreakdown(trip))}
        ${viewLine("Ended At Stop",trip.endedAtStop ? "Yes" : "No")}
        ${viewLine("Stop End Address",trip.stopEndAddress)}
        ${viewLine("Stop End Miles",trip.stopEndMiles ? num(trip.stopEndMiles).toFixed(1) : "")}
        ${viewLine("Completion Type",trip.completionType)}
        ${viewLine("Notes",trip.notes)}
      </div>

    </div>
  `;

  overlay.addEventListener(
    "click",
    event=>{

      if(event.target === overlay){
        closeExternalSummaryView();
      }
    }
  );

  document.body
    .appendChild(
      overlay
    );
}

function closeExternalSummaryView(){
  document
    .getElementById(
      "externalSummaryViewOverlay"
    )
    ?.remove();
}

function rowClass(trip){

  let out =
    trip.isShared
      ? "shared-row "
      : "";

  const cls =
    statusClass(
      trip.status
    );

  if(cls === "completed"){
    out += "completed-row ";
  }

  if(cls === "cancelled"){
    out += "cancelled-row ";
  }

  if(cls === "noshow"){
    out += "noshow-row ";
  }

  if(cls === "notcompleted"){
    out += "notcompleted-row ";
  }

  return (
    out.trim() +
    " trip-divider"
  );
}

function groupByDate(items){

  const groups = {};

  items.forEach(
    trip=>{

      const key =
        trip.tripDate ||
        "Unknown";

      if(!groups[key]){
        groups[key] = [];
      }

      groups[key].push(trip);
    }
  );

  return groups;
}

let rowCounter = 1;

function render(){

  rowCounter = 1;

  renderStats();
  renderServiceCards();

  if(!summaryContent){
    return;
  }

  summaryContent.innerHTML = "";

  if(!displayItems.length){
    summaryContent.innerHTML =
      `<div class="empty-state">No Broker Summary Trips Found</div>`;
    return;
  }

  const groups =
    groupByDate(
      displayItems
    );

  const wrap =
    document.createElement(
      "div"
    );

  wrap.className =
    "table-wrap";

  const table =
    document.createElement(
      "table"
    );

  table.className =
    "summary-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-trip">Trip #</th>
        <th class="col-broker">Broker</th>
        <th class="col-broker-trip">Broker Trip #</th>
        <th class="col-service">Service</th>
        <th class="wide-passenger">Passenger</th>
        <th class="wide-address">Pickup</th>
        <th class="wide-stops">Stops</th>
        <th class="wide-address">Dropoff</th>
        <th class="col-date">Trip Date</th>
        <th class="col-time">Time</th>
        <th class="col-status">Trip Status</th>
        <th class="col-miles">Miles</th>
        <th class="wide-fees">Fees</th>
        <th class="col-money">Total</th>
        <th class="col-passengers">Count</th>
        <th class="col-eye">👁️</th>
      </tr>
    </thead>

    <tbody></tbody>
  `;

  const tbody =
    table.querySelector(
      "tbody"
    );

  Object.keys(groups)
    .sort(
      (a,b)=>
        new Date(b) -
        new Date(a)
    )
    .forEach(
      day=>{

        const dateRow =
          document.createElement(
            "tr"
          );

        dateRow.className =
          "date-row";

        dateRow.innerHTML = `
          <td colspan="17">
            Trip Date: ${safe(day)}
          </td>
        `;

        tbody.appendChild(
          dateRow
        );

        groups[day].forEach(
          trip=>{

            const tr =
              document.createElement(
                "tr"
              );

            tr.className =
              rowClass(trip);

            const passengerDisplay =
              trip.isShared
                ? (
                    trip.passengers ||
                    []
                  ).map(
                    p=>
                      p.name ||
                      "-"
                  )
                : (
                    trip.passenger ||
                    "--"
                  );

            tr.innerHTML = `
              <td class="col-num">
                ${rowCounter++}
              </td>

              <td class="col-trip">
                <span class="trip-number-badge">
                  ${safe(getTripNumber(trip))}
                </span>
              </td>

              <td class="col-broker">
                ${cellBox(trip.brokerName || trip.brokerCode)}
              </td>

              <td class="col-broker-trip">
                ${cellBox(
                  trip.isShared
                    ? (
                        trip.externalTrips ||
                        []
                      ).map(
                        ex=>
                          ex.externalTripId ||
                          "-"
                      )
                    : (
                        trip.brokerTripId ||
                        "-"
                      )
                )}
              </td>

              <td class="col-service">
                ${cellBox(trip.serviceName)}
              </td>

              <td class="wide-passenger">
                ${cellBox(passengerDisplay)}
              </td>

              <td class="wide-address">
                ${cellBox(
                  trip.isShared
                    ? (
                        trip.passengers ||
                        []
                      ).map(
                        p=>
                          p.pickup ||
                          "-"
                      )
                    : (
                        trip.pickup ||
                        "--"
                      )
                )}
              </td>

              <td class="wide-stops">
                ${cellBox(stopItems(trip))}
              </td>

              <td class="wide-address">
                ${cellBox(
                  trip.isShared
                    ? (
                        trip.passengers ||
                        []
                      ).map(
                        p=>
                          p.dropoff ||
                          "-"
                      )
                    : (
                        trip.dropoff ||
                        "--"
                      )
                )}
              </td>

              <td class="col-date">
                ${safe(trip.tripDate || "-")}
              </td>

              <td class="col-time">
                ${safe(trip.tripTime || "-")}
              </td>

              <td class="col-status">
                ${statusHTML(trip.status)}
              </td>

              <td class="col-miles">
                ${num(trip.miles).toFixed(1)}
              </td>

              <td class="wide-fees">
                ${cellBox(money(trip.fee))}
              </td>

              <td class="col-money">
                <b>${money(trip.total)}</b>
              </td>

              <td class="col-passengers">
                ${Number(trip.passengerCount || 1)}
              </td>

              <td class="col-eye">
                <button
                  class="eye-btn"
                  type="button"
                  title="View broker trip details"
                  onclick="openExternalSummaryView('${safe(trip.id)}')"
                >
                  👁️
                </button>
              </td>
            `;

            tbody.appendChild(
              tr
            );
          }
        );
      }
    );

  wrap.appendChild(table);
  summaryContent
    .appendChild(wrap);
}

function csvEscape(value){
  const text =
    String(value ?? "");

  return `"${text.replace(/"/g,'""')}"`;
}

function exportCSV(){

  const rows = [[
    "#",
    "Trip #",
    "Broker",
    "Broker Code",
    "Broker Trip #",
    "Service",
    "Passenger",
    "Pickup",
    "Stops",
    "Dropoff",
    "Trip Date",
    "Time",
    "Trip Status",
    "Miles",
    "Fees",
    "Total",
    "Count"
  ]];

  displayItems.forEach(
    (trip,index)=>{

      rows.push([
        index + 1,
        trip.tripNumber,
        trip.brokerName,
        trip.brokerCode,
        trip.brokerTripId,
        trip.serviceName,
        trip.passenger,
        trip.pickup,
        stopsDisplay(trip),
        trip.dropoff,
        trip.tripDate,
        trip.tripTime,
        trip.status,
        num(trip.miles).toFixed(1),
        num(trip.fee).toFixed(2),
        num(trip.total).toFixed(2),
        trip.passengerCount
      ]);
    }
  );

  const content =
    rows
      .map(
        row=>
          row.map(csvEscape)
            .join(",")
      )
      .join("\n");

  const blob =
    new Blob(
      [content],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;
  a.download =
    "broker-external-summary.csv";

  a.click();

  URL.revokeObjectURL(url);
}

function exportExcel(){

  const rows =
    displayItems.map(
      (trip,index)=>({
        "#":index + 1,
        "Trip #":trip.tripNumber,
        "Broker":trip.brokerName,
        "Broker Code":trip.brokerCode,
        "Broker Trip #":trip.brokerTripId,
        "Service":trip.serviceName,
        "Passenger":trip.passenger,
        "Pickup":trip.pickup,
        "Stops":stopsDisplay(trip),
        "Dropoff":trip.dropoff,
        "Trip Date":trip.tripDate,
        "Time":trip.tripTime,
        "Trip Status":trip.status,
        "Miles":num(trip.miles).toFixed(1),
        "Fees":num(trip.fee).toFixed(2),
        "Total":num(trip.total).toFixed(2),
        "Count":trip.passengerCount
      })
    );

  const table = `
    <table border="1">
      <tr>
        ${
          Object.keys(
            rows[0] || {
              "Trip #":""
            }
          ).map(
            key=>
              `<th>${safe(key)}</th>`
          ).join("")
        }
      </tr>

      ${
        rows.map(
          row=>`
            <tr>
              ${
                Object.values(row)
                  .map(
                    value=>
                      `<td>${safe(value)}</td>`
                  )
                  .join("")
              }
            </tr>
          `
        ).join("")
      }
    </table>
  `;

  const blob =
    new Blob(
      [table],
      {
        type:
          "application/vnd.ms-excel"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;
  a.download =
    "broker-external-summary.xls";

  a.click();

  URL.revokeObjectURL(url);
}

searchInput
  ?.addEventListener(
    "input",
    applyFilters
  );

brokerFilter
  ?.addEventListener(
    "change",
    ()=>{
      load()
        .catch(
          err=>
            alert(err.message)
        );
    }
  );

serviceFilter
  ?.addEventListener(
    "change",
    ()=>{
      activeService =
        serviceFilter.value ||
        "ALL";

      applyFilters();
    }
  );

statusFilter
  ?.addEventListener(
    "change",
    applyFilters
  );

yearFilter
  ?.addEventListener(
    "change",
    applyFilters
  );

monthFilter
  ?.addEventListener(
    "change",
    applyFilters
  );

dayFilter
  ?.addEventListener(
    "change",
    applyFilters
  );

printBtn
  ?.addEventListener(
    "click",
    ()=>window.print()
  );

csvBtn
  ?.addEventListener(
    "click",
    exportCSV
  );

excelBtn
  ?.addEventListener(
    "click",
    exportExcel
  );

Object.assign(
  window,
  {
    openExternalSummaryView,
    closeExternalSummaryView
  }
);

load()
  .catch(
    err=>{
      console.log(err);

      if(summaryContent){
        summaryContent.innerHTML =
          `<div class="empty-state">${safe(err.message || "Failed to load External Summary")}</div>`;
      }
    }
  );

refreshTimer =
  setInterval(
    ()=>{
      load().catch(()=>{});
    },
    15000
  );
