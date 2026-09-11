"use strict";

/*
DESTINATION PATH:
server/public/admin/js/external-summary.js

BROKER-ONLY FINANCIAL SUMMARY
*/

(() => {

  const $ = id => document.getElementById(id);

  const state = {
    items:[],
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

  function esc(v){
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
        <option value="${esc(b.code)}">
          ${esc(b.name || b.code)}
        </option>
      `).join("");

    if([...select.options].some(o=>o.value === current)){
      select.value = current;
    }
  }

  function setStats(){
    const items = state.items;

    const completed =
      items.filter(x=>x.status === "Completed").length;

    const cancelled =
      items.filter(x=>x.status === "Cancelled").length;

    const noShow =
      items.filter(x=>x.status === "No Show").length;

    const notCompleted =
      items.filter(x=>x.status === "Not Completed").length;

    const revenue =
      items.reduce((s,x)=>s + num(x.total),0);

    const miles =
      items.reduce((s,x)=>s + num(x.miles),0);

    if($("totalTrips")) $("totalTrips").textContent = items.length;
    if($("completedTrips")) $("completedTrips").textContent = completed;
    if($("cancelledTrips")) $("cancelledTrips").textContent = cancelled;
    if($("noShowTrips")) $("noShowTrips").textContent = noShow;
    if($("notCompletedTrips")) $("notCompletedTrips").textContent = notCompleted;
    if($("totalRevenue")) $("totalRevenue").textContent = money(revenue);
    if($("totalMiles")) $("totalMiles").textContent = miles.toFixed(1);
  }

  function statusClass(status){
    return clean(status)
      .toLowerCase()
      .replace(/\s+/g,"-");
  }

  function render(){
    setStats();

    const body = $("summaryRows");
    if(!body) return;

    if(!state.items.length){
      body.innerHTML = `
        <tr>
          <td colspan="17" class="empty">
            No broker summary trips found.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = state.items.map((x,index)=>`
      <tr>
        <td>${index + 1}</td>
        <td><strong>${esc(x.tripNumber)}</strong></td>
        <td>${esc(x.brokerName || x.brokerCode)}</td>
        <td>${esc(x.brokerTripId || "-")}</td>
        <td>${esc(x.serviceName || x.serviceCode)}</td>
        <td>${esc(x.passenger || "-")}</td>
        <td>${esc(x.pickup || "-")}</td>
        <td>${esc(Array.isArray(x.stops) && x.stops.length ? x.stops.map((s,i)=>`${i+1}. ${typeof s === "string" ? s : (s?.address || "")}`).join(" | ") : "-")}</td>
        <td>${esc(x.dropoff || "-")}</td>
        <td>${esc(x.tripDate || "-")}</td>
        <td>${esc(x.tripTime || "-")}</td>
        <td><span class="status ${statusClass(x.status)}">${esc(x.status || "-")}</span></td>
        <td>${num(x.miles).toFixed(1)}</td>
        <td>${money(x.fee)}</td>
        <td><strong>${money(x.total)}</strong></td>
        <td>${num(x.passengerCount) || 1}</td>
        <td>
          <button class="eye-btn" data-id="${esc(x.id)}" type="button" title="View Details">👁️</button>
        </td>
      </tr>
    `).join("");
  }

  function detailLine(label,value){
    return `
      <div class="detail-line">
        <div class="detail-label">${esc(label)}</div>
        <div class="detail-value">${esc(value || "-")}</div>
      </div>
    `;
  }

  function openDetails(id){
    const item =
      state.items.find(x=>String(x.id) === String(id));

    if(!item) return;

    $("detailTitle").textContent =
      item.tripNumber || "Broker Trip";

    const passengerText =
      Array.isArray(item.passengers)
        ? item.passengers.map((p,i)=>
            `${i+1}. ${p.name || "-"} | ${p.status || "-"} | Fee ${money(p.fee)} | Total ${money(p.total)}`
          ).join("\n")
        : "-";

    const externalText =
      Array.isArray(item.externalTrips)
        ? item.externalTrips.map((x,i)=>
            `${i+1}. ${x.ghExternalTripNumber || x.externalTripId || "-"} | ${x.clientName || "-"}`
          ).join("\n")
        : "-";

    $("detailBody").innerHTML = [
      detailLine("Broker",`${item.brokerName || "-"} (${item.brokerCode || "-"})`),
      detailLine("Broker Trip #",item.brokerTripId),
      detailLine("Service",item.serviceName || item.serviceCode),
      detailLine("Status",item.status),
      detailLine("Miles",num(item.miles).toFixed(1)),
      detailLine("Fee",money(item.fee)),
      detailLine("Calculated Total",money(item.total)),
      detailLine("Locked Price",money(item.finalPrice || item.priceAmount)),
      detailLine("Cancel Fee",money(item.cancelFee)),
      detailLine("No Show Fee",money(item.noShowFee)),
      detailLine("Appointment",item.appointmentTime),
      detailLine("Return Time",item.returnTime),
      detailLine("Driver",item.driverName),
      detailLine("Vehicle",item.vehicleNumber),
      detailLine("Passengers",passengerText),
      detailLine("External Source Trips",externalText),
      detailLine("Notes",item.notes)
    ].join("");

    $("detailModal")?.classList.add("show");
  }

  function closeDetails(){
    $("detailModal")?.classList.remove("show");
  }

  async function load(){
    const res =
      await fetch(
        `/api/external-summary${buildQuery()}`,
        {headers:headers()}
      );

    const data =
      await res.json().catch(()=>({}));

    if(!res.ok || data.success === false){
      throw new Error(
        data.message ||
        "Failed to load External Summary"
      );
    }

    state.items =
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

  $("applyBtn")?.addEventListener("click",()=>{
    load().catch(err=>alert(err.message));
  });

  $("summaryRows")?.addEventListener("click",e=>{
    const btn = e.target.closest(".eye-btn");
    if(btn) openDetails(btn.dataset.id);
  });

  $("closeDetailBtn")?.addEventListener("click",closeDetails);

  $("detailModal")?.addEventListener("click",e=>{
    if(e.target.id === "detailModal"){
      closeDetails();
    }
  });

  load().catch(err=>{
    console.error(err);
    alert(err.message);
  });

})();
