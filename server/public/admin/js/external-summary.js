"use strict";

/*
DESTINATION PATH:
server/public/admin/js/external-summary.js

BROKER SUMMARY
- Same visible table structure style as Admin Summary.
- Broker-only.
- Shared rows show up to 10 passengers directly in the table.
- Eye modal contains EXTRA details only; it does not duplicate visible columns.
*/

(() => {

  const $ = id => document.getElementById(id);

  const state = {
    allItems:[],
    displayItems:[],
    brokers:[]
  };

  function token(){
    return (
      sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function headers(){
    return {
      Authorization:`Bearer ${token()}`
    };
  }

  function clean(v){
    return String(v ?? "").trim();
  }

  function safe(v){
    return clean(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function num(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function money(v){
    return "$" + num(v).toFixed(2);
  }

  function cellBox(items){
    const arr =
      (Array.isArray(items) ? items : [items])
        .slice(0,10);

    return `
      <div class="cell-box">
        ${arr.map(value=>`
          <div class="cell-item">
            ${safe(value || "--")}
          </div>
        `).join("")}
      </div>
    `;
  }

  function statusClass(status){
    const s = clean(status).toLowerCase();

    if(s === "completed") return "completed";
    if(s === "cancelled") return "cancelled";
    if(s === "no show") return "noshow";
    if(s === "not completed") return "notcompleted";
    if(s === "mixed closed") return "mixed";

    return "";
  }

  function statusHTML(status){
    return `
      <span class="status-pill ${statusClass(status)}">
        ${safe(status || "-")}
      </span>
    `;
  }

  function normalizeStop(stop){
    if(typeof stop === "string") return clean(stop);

    if(stop && typeof stop === "object"){
      return clean(
        stop.address ||
        stop.formattedAddress ||
        stop.formatted_address ||
        stop.description ||
        stop.label ||
        ""
      );
    }

    return "";
  }

  function stopItems(item){
    const stops =
      Array.isArray(item?.stops)
        ? item.stops.map(normalizeStop).filter(Boolean)
        : [];

    return stops.length
      ? stops.map((x,i)=>`${i+1}. ${x}`)
      : ["--"];
  }

  function visiblePassengers(item){
    const arr =
      Array.isArray(item?.passengers)
        ? item.passengers
        : [];

    if(arr.length){
      return arr.slice(0,10);
    }

    return [{
      name:item?.passenger || "-",
      phone:item?.phone || "-",
      pickup:item?.pickup || "-",
      dropoff:item?.dropoff || "-",
      status:item?.status || "-",
      fee:item?.fee || 0,
      total:item?.total || 0
    }];
  }

  function passengerNames(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${p.name || "-"}`);
  }

  function passengerPhones(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${p.phone || "-"}`);
  }

  function passengerPickups(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${p.pickup || item.pickup || "-"}`);
  }

  function passengerDropoffs(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${p.dropoff || item.dropoff || "-"}`);
  }

  function passengerStatuses(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${p.status || item.status || "-"}`);
  }

  function passengerFees(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${money(p.fee || 0)}`);
  }

  function passengerTotals(item){
    return visiblePassengers(item)
      .map((p,i)=>`${i+1}. ${money(p.total || 0)}`);
  }

  function brokerLabel(item){
    const name = clean(item?.brokerName);
    const code = clean(item?.brokerCode);

    return name || code || "-";
  }

  function ensureBrokerSummaryColumnLayout(){

    if(
      document.getElementById(
        "brokerSummaryColumnLayoutFix"
      )
    ){
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "brokerSummaryColumnLayoutFix";

    style.textContent = `
      /* Broker Summary column sizing only */
      .summary-table .col-trip{
        width:150px !important;
        min-width:150px !important;
      }

      .summary-table .col-trip .trip-number-badge{
        white-space:nowrap !important;
        word-break:normal !important;
        overflow-wrap:normal !important;
        display:inline-block !important;
      }

      .summary-table .col-broker{
        width:70px !important;
        min-width:70px !important;
      }

      .summary-table .col-time{
        width:58px !important;
        min-width:58px !important;
        max-width:58px !important;
        white-space:nowrap !important;
      }
    `;

    document.head.appendChild(
      style
    );
  }

  function buildQuery(){
    const p = new URLSearchParams();

    const from = $("fromDate")?.value || "";
    const to = $("toDate")?.value || "";
    const broker = $("brokerFilter")?.value || "";

    if(from) p.set("from",from);
    if(to) p.set("to",to);
    if(broker) p.set("brokerCode",broker);

    const raw = p.toString();
    return raw ? `?${raw}` : "";
  }

  function renderBrokerFilter(){
    const select = $("brokerFilter");
    if(!select) return;

    const current = select.value;

    select.innerHTML =
      `<option value="">All Brokers</option>` +
      state.brokers.map(b=>`
        <option value="${safe(b.code)}">
          ${safe(b.name || b.code)}
        </option>
      `).join("");

    if([...select.options].some(o=>o.value === current)){
      select.value = current;
    }
  }

  function filterItems(){
    let out = [...state.allItems];

    const service =
      clean($("serviceFilter")?.value).toUpperCase();

    const status =
      clean($("statusFilter")?.value);

    const q =
      clean($("searchInput")?.value).toLowerCase();

    if(service){
      out = out.filter(
        item=>clean(item.serviceCode).toUpperCase() === service
      );
    }

    if(status){
      out = out.filter(
        item=>clean(item.status) === status
      );
    }

    if(q){
      out = out.filter(item=>{
        const text = [
          item.tripNumber,
          item.brokerName,
          item.brokerCode,
          item.brokerTripId,
          item.serviceName,
          item.passenger,
          item.phone,
          item.pickup,
          item.dropoff,
          item.tripDate,
          item.tripTime,
          item.status,
          JSON.stringify(item.stops || []),
          JSON.stringify(item.passengers || [])
        ].join(" ").toLowerCase();

        return text.includes(q);
      });
    }

    state.displayItems = out;
  }

  function renderStats(){
    const items = state.displayItems;

    const completed =
      items.filter(x=>x.status === "Completed").length;

    const cancelled =
      items.filter(x=>x.status === "Cancelled").length;

    const noShow =
      items.filter(x=>x.status === "No Show").length;

    const notCompleted =
      items.filter(x=>x.status === "Not Completed").length;

    const revenue =
      items.reduce((sum,x)=>sum + num(x.total),0);

    const miles =
      items.reduce((sum,x)=>sum + num(x.miles),0);

    $("totalTrips").textContent = items.length;
    $("completedTrips").textContent = completed;
    $("cancelledTrips").textContent = cancelled;
    $("noShowTrips").textContent = noShow;
    $("notCompletedTrips").textContent = notCompleted;
    $("totalRevenue").textContent = money(revenue);
    $("totalMiles").textContent = miles.toFixed(1);
  }

  function rowClass(item){
    let cls =
      item.isShared === true
        ? "shared-row "
        : "";

    const status = statusClass(item.status);

    if(status === "completed") cls += "completed-row ";
    if(status === "cancelled") cls += "cancelled-row ";
    if(status === "noshow") cls += "noshow-row ";
    if(status === "notcompleted") cls += "notcompleted-row ";

    return cls.trim() + " trip-divider";
  }

  function groupByDate(items){
    const map = {};

    items.forEach(item=>{
      const key = item.tripDate || "Unknown";
      if(!map[key]) map[key] = [];
      map[key].push(item);
    });

    return map;
  }

  function render(){
    filterItems();
    renderStats();

    const host = $("summaryContent");
    if(!host) return;

    host.innerHTML = "";

    if(!state.displayItems.length){
      host.innerHTML =
        `<div class="empty-state">No Broker Summary Trips Found</div>`;
      return;
    }

    const groups =
      groupByDate(state.displayItems);

    const wrap =
      document.createElement("div");

    wrap.className =
      "table-wrap";

    const table =
      document.createElement("table");

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
          <th class="col-passenger">Passenger</th>
          <th class="col-phone">Phone</th>
          <th class="col-address">Pickup</th>
          <th class="col-stops">Stops</th>
          <th class="col-address">Dropoff</th>
          <th class="col-date">Trip Date</th>
          <th class="col-time">Time</th>
          <th class="col-status">Trip Status</th>
          <th class="col-miles">Miles</th>
          <th class="col-passenger-status">Passenger Status</th>
          <th class="col-fees">Fees</th>
          <th class="col-total">Total</th>
          <th class="col-trip-price">Trip Price</th>
          <th class="col-count">Count</th>
          <th class="col-eye">👁️</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody =
      table.querySelector("tbody");

    let counter = 1;

    Object.keys(groups)
      .sort((a,b)=>new Date(b)-new Date(a))
      .forEach(day=>{

        const dateRow =
          document.createElement("tr");

        dateRow.className =
          "date-row";

        dateRow.innerHTML =
          `<td colspan="20">Trip Date: ${safe(day)}</td>`;

        tbody.appendChild(dateRow);

        groups[day].forEach(item=>{

          const tr =
            document.createElement("tr");

          tr.className =
            rowClass(item);

          const shared =
            item.isShared === true;

          const pricingError =
            clean(item.pricingError);

          tr.innerHTML = `
            <td class="col-num">${counter++}</td>

            <td class="col-trip">
              <span class="trip-number-badge">${safe(item.tripNumber || "-")}</span>
            </td>

            <td class="col-broker">
              ${cellBox(brokerLabel(item))}
            </td>

            <td class="col-broker-trip">
              ${cellBox(
                shared
                  ? visiblePassengers(item).map((p,i)=>
                      `${i+1}. ${
                        item.externalTrips?.[i]?.externalTripId ||
                        item.externalTrips?.[i]?.ghExternalTripNumber ||
                        item.brokerTripId ||
                        "-"
                      }`
                    )
                  : (item.brokerTripId || "-")
              )}
            </td>

            <td class="col-service">
              ${cellBox(item.serviceName || item.serviceCode || "-")}
            </td>

            <td class="col-passenger">
              ${cellBox(passengerNames(item))}
            </td>

            <td class="col-phone">
              ${cellBox(passengerPhones(item))}
            </td>

            <td class="col-address">
              ${cellBox(passengerPickups(item))}
            </td>

            <td class="col-stops">
              ${cellBox(stopItems(item))}
            </td>

            <td class="col-address">
              ${cellBox(passengerDropoffs(item))}
            </td>

            <td class="col-date">
              ${safe(item.tripDate || "-")}
            </td>

            <td class="col-time">
              ${safe(item.tripTime || "-")}
            </td>

            <td class="col-status">
              ${statusHTML(item.status)}
            </td>

            <td class="col-miles">
              ${num(item.miles).toFixed(1)}
            </td>

            <td class="col-passenger-status">
              ${cellBox(passengerStatuses(item))}
            </td>

            <td class="col-fees">
              ${cellBox(passengerFees(item))}
            </td>

            <td class="col-total">
              ${
                shared
                  ? cellBox(passengerTotals(item))
                  : `<div class="cell-box trip-total-box">
                       <div class="cell-item">${safe(money(item.total))}</div>
                     </div>`
              }
            </td>

            <td class="col-trip-price">
              <div class="cell-box trip-total-box">
                <div class="cell-item">${safe(money(item.total))}</div>
              </div>
            </td>

            <td class="col-count">
              ${Math.min(10,Math.max(1,num(item.passengerCount)))}
            </td>

            <td class="col-eye">
              <button
                class="eye-btn"
                type="button"
                data-id="${safe(item.id)}"
                title="Extra Details">
                👁️
              </button>
            </td>
          `;

          tbody.appendChild(tr);
        });
      });

    wrap.appendChild(table);
    host.appendChild(wrap);
  }

  function viewLine(label,value){
    return `
      <div class="view-line">
        <div class="view-label">${safe(label)}</div>
        <div class="view-value">${safe(value || "--")}</div>
      </div>
    `;
  }

  function openExtraDetails(id){
    const item =
      state.allItems.find(
        x=>String(x.id) === String(id)
      );

    if(!item) return;

    closeExtraDetails();

    /*
      IMPORTANT:
      Do not duplicate visible table fields here.
      This modal contains extra operational/source details only.
    */
    const externalSource =
      Array.isArray(item.externalTrips)
        ? item.externalTrips
            .slice(0,10)
            .map((x,i)=>
              `${i+1}. ${x.ghExternalTripNumber || x.externalTripId || "-"} | Member ${x.memberId || "-"}`
            )
            .join("\n")
        : "--";

    const overlay =
      document.createElement("div");

    overlay.id =
      "brokerSummaryViewOverlay";

    overlay.className =
      "view-overlay";

    overlay.innerHTML = `
      <div class="view-box">
        <div class="view-head">
          <div>${safe(item.tripNumber || "Broker Trip")} — Extra Details</div>
          <button class="view-close" type="button" data-action="close-view">×</button>
        </div>

        <div class="view-body">
          ${viewLine("Appointment",item.appointmentTime)}
          ${viewLine("Return Time",item.returnTime)}
          ${viewLine("Driver",item.driverName)}
          ${viewLine("Vehicle",item.vehicleNumber)}
          ${viewLine("Price Per Passenger",money(item.pricePerPassenger))}
          ${viewLine("Cancel Fee",money(item.cancelFee))}
          ${viewLine("No Show Fee",money(item.noShowFee))}
          ${viewLine("Pricing Error",item.pricingError)}
          ${viewLine("External Source Trips",externalSource)}
          ${viewLine("Notes",item.notes)}
        </div>
      </div>
    `;

    overlay.addEventListener("click",event=>{
      if(
        event.target === overlay ||
        event.target.closest('[data-action="close-view"]')
      ){
        closeExtraDetails();
      }
    });

    document.body.appendChild(overlay);
  }

  function closeExtraDetails(){
    document
      .getElementById("brokerSummaryViewOverlay")
      ?.remove();
  }

  function exportRows(){
    const rows = [];

    state.displayItems.forEach(item=>{
      const passengers =
        visiblePassengers(item);

      passengers.forEach((p,index)=>{
        rows.push({
          tripNumber:index === 0 ? item.tripNumber : "",
          broker:index === 0 ? brokerLabel(item) : "",
          brokerTrip:
            item.externalTrips?.[index]?.externalTripId ||
            (index === 0 ? item.brokerTripId : ""),
          service:index === 0 ? item.serviceName || item.serviceCode : "",
          passenger:p.name || "",
          phone:p.phone || "",
          pickup:p.pickup || item.pickup || "",
          stops:index === 0 ? stopItems(item).join(" | ") : "",
          dropoff:p.dropoff || item.dropoff || "",
          date:index === 0 ? item.tripDate : "",
          time:index === 0 ? item.tripTime : "",
          tripStatus:index === 0 ? item.status : "",
          miles:index === 0 ? num(item.miles).toFixed(1) : "",
          passengerStatus:p.status || item.status || "",
          fee:money(p.fee || 0),
          total:
            item.isShared === true
              ? money(p.total || 0)
              : (index === 0 ? money(item.total) : ""),
          tripPrice:
            index === 0
              ? money(item.total)
              : "",
          count:index === 0 ? item.passengerCount : ""
        });
      });
    });

    return rows;
  }

  function downloadFile(name,content,type){
    const blob = new Blob([content],{type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCSV(){
    const rows = exportRows();

    const headers = [
      "Trip #","Broker","Broker Trip #","Service","Passenger","Phone",
      "Pickup","Stops","Dropoff","Trip Date","Time","Trip Status",
      "Miles","Passenger Status","Fees","Total","Trip Price","Count"
    ];

    const keys = [
      "tripNumber","broker","brokerTrip","service","passenger","phone",
      "pickup","stops","dropoff","date","time","tripStatus",
      "miles","passengerStatus","fee","total","tripPrice","count"
    ];

    const csv = [
      headers.join(","),
      ...rows.map(row=>
        keys.map(key=>
          `"${String(row[key] ?? "").replace(/"/g,'""')}"`
        ).join(",")
      )
    ].join("\n");

    downloadFile(
      "broker-summary.csv",
      csv,
      "text/csv;charset=utf-8;"
    );
  }

  function exportExcel(){
    const rows = exportRows();

    const keys = [
      "tripNumber","broker","brokerTrip","service","passenger","phone",
      "pickup","stops","dropoff","date","time","tripStatus",
      "miles","passengerStatus","fee","total","tripPrice","count"
    ];

    const headers = [
      "Trip #","Broker","Broker Trip #","Service","Passenger","Phone",
      "Pickup","Stops","Dropoff","Trip Date","Time","Trip Status",
      "Miles","Passenger Status","Fees","Total","Trip Price","Count"
    ];

    const html = `
      <html>
      <head><meta charset="UTF-8"></head>
      <body>
        <table border="1">
          <thead>
            <tr>${headers.map(x=>`<th>${safe(x)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map(row=>`
              <tr>
                ${keys.map(key=>`<td>${safe(row[key] ?? "")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

    downloadFile(
      "broker-summary.xls",
      html,
      "application/vnd.ms-excel"
    );
  }

  async function load(){
    const response =
      await fetch(
        `/api/external-summary${buildQuery()}`,
        {
          cache:"no-store",
          headers:headers()
        }
      );

    const data =
      await response.json().catch(()=>({}));

    if(!response.ok || data.success === false){
      throw new Error(
        data.message ||
        "Failed to load Broker Summary"
      );
    }

    state.allItems =
      Array.isArray(data.items)
        ? data.items
        : [];

    state.brokers =
      Array.isArray(data.brokers)
        ? data.brokers
        : [];

    renderBrokerFilter();
    render();
  }

  $("searchInput")?.addEventListener("input",render);
  $("serviceFilter")?.addEventListener("change",render);
  $("statusFilter")?.addEventListener("change",render);

  $("applyBtn")?.addEventListener("click",()=>{
    load().catch(err=>alert(err.message));
  });

  $("printBtn")?.addEventListener("click",()=>{
    window.print();
  });

  $("csvBtn")?.addEventListener("click",exportCSV);
  $("excelBtn")?.addEventListener("click",exportExcel);

  $("summaryContent")?.addEventListener("click",event=>{
    const btn =
      event.target.closest(".eye-btn");

    if(btn){
      openExtraDetails(
        btn.dataset.id
      );
    }
  });

  ensureBrokerSummaryColumnLayout();

  load().catch(err=>{
    console.error(err);
    alert(err.message);
  });

  setInterval(()=>{
    load().catch(console.error);
  },30000);

})();
