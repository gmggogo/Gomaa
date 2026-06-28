/* =========================================================
   FILE: public/admin/dispatch-add-trip.js
   Dispatch Add Trip / Dispatch Review UI Patch
   Scope:
   - Keeps existing trip logic untouched.
   - Fixes the details eye modal.
   - Shows only:
     Service, Data Entry, Entry Phone, Booked Date, Booked Time.
   - Forces the dispatch table to stay readable and full-width.
========================================================= */

(function(){

  "use strict";

  console.log("Dispatch UI patch loaded");

  /* =========================================================
     Basic helpers
  ========================================================= */

  function text(value){
    return String(value ?? "").trim();
  }

  function html(value){
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function first(){
    for(const value of arguments){
      const clean = text(value);
      if(clean) return clean;
    }
    return "";
  }

  function isRealDate(value){
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  }

  function formatDate(value){

    const raw = text(value);
    if(!raw) return "";

    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
      return raw;
    }

    if(!isRealDate(raw)){
      return raw.slice(0, 10);
    }

    const d = new Date(raw);

    return d.toLocaleDateString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

  }

  function formatTime(value){

    const raw = text(value);
    if(!raw) return "";

    if(/^\d{1,2}:\d{2}/.test(raw)){
      return raw.slice(0, 5);
    }

    if(!isRealDate(raw)){
      return raw;
    }

    const d = new Date(raw);

    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

  }

  function getTripId(trip){

    if(!trip) return "";

    return first(
      trip._id,
      trip.id,
      trip.tripId,
      trip.tripNumber,
      trip.groupId
    );

  }

  /* =========================================================
     Trip collection discovery
  ========================================================= */

  function collectTripsFromValue(value, output, seen){

    if(!value) return;

    if(Array.isArray(value)){
      value.forEach(item => collectTripsFromValue(item, output, seen));
      return;
    }

    if(typeof value !== "object") return;

    const id = getTripId(value);

    const looksLikeTrip =
      id ||
      value.tripDate ||
      value.tripTime ||
      value.pickup ||
      value.dropoff ||
      value.passengers ||
      value.serviceKey ||
      value.serviceType ||
      value.status;

    if(looksLikeTrip){
      const key = id || JSON.stringify(value).slice(0, 200);
      if(!seen.has(key)){
        seen.add(key);
        output.push(value);
      }
    }

    const nestedKeys = [
      "trips",
      "allTrips",
      "dispatchTrips",
      "reviewTrips",
      "todayTrips",
      "companyTrips",
      "reservedTrips",
      "data",
      "items",
      "rows",
      "results"
    ];

    nestedKeys.forEach(key => {
      if(value[key]){
        collectTripsFromValue(value[key], output, seen);
      }
    });

  }

  function getPageTrips(){

    const output = [];
    const seen = new Set();

    const directSources = [
      window.trips,
      window.allTrips,
      window.dispatchTrips,
      window.reviewTrips,
      window.todayTrips,
      window.companyTrips,
      window.reservedTrips,
      window.dispatchReviewTrips,
      window.dispatchAddTripTrips
    ];

    directSources.forEach(source => {
      collectTripsFromValue(source, output, seen);
    });

    const stateSources = [
      window.state,
      window.dispatchState,
      window.dispatchReviewState,
      window.appState,
      window.pageState
    ];

    stateSources.forEach(source => {
      collectTripsFromValue(source, output, seen);
    });

    return output;

  }

  function findTripById(id){

    const target = text(id);
    if(!target) return null;

    const trips = getPageTrips();

    return trips.find(trip => {
      return (
        text(trip._id) === target ||
        text(trip.id) === target ||
        text(trip.tripId) === target ||
        text(trip.tripNumber) === target ||
        text(trip.groupId) === target
      );
    }) || null;

  }

  function findTripFromRow(row){

    if(!row) return null;

    const id = first(
      row.dataset.tripId,
      row.dataset.id,
      row.dataset.tripNumber,
      row.getAttribute("data-trip-id"),
      row.getAttribute("data-id"),
      row.getAttribute("data-trip-number")
    );

    if(id){
      return findTripById(id);
    }

    return null;

  }

  /* =========================================================
     Details normalization
  ========================================================= */

  function normalizeDetails(trip){

    trip = trip || {};

    const service = first(
      trip.serviceName,
      trip.serviceType,
      trip.serviceKey,
      trip.serviceCode,
      trip.service,
      trip.companyServiceName,
      trip.pricingServiceName
    );

    const dataEntry = first(
      trip.entryName,
      trip.dataEntry,
      trip.dataEntryName,
      trip.createdBy,
      trip.createdByName,
      trip.dispatcherName,
      trip.adminName,
      trip.createdByUser
    );

    const entryPhone = first(
      trip.entryPhone,
      trip.dataEntryPhone,
      trip.entryMobile,
      trip.createdByPhone,
      trip.dispatcherPhone,
      trip.adminPhone,
      trip.entryUserPhone
    );

    const bookedDateRaw = first(
      trip.bookedDate,
      trip.booked_date,
      trip.bookingDate,
      trip.tripBookedDate
    );

    const bookedTimeRaw = first(
      trip.bookedTime,
      trip.booked_time,
      trip.bookingTime,
      trip.tripBookedTime
    );

    const bookedAt = first(
      trip.bookedAt,
      trip.createdAt,
      trip.created_at,
      trip.updatedAt
    );

    return {
      service: service || "-",
      dataEntry: dataEntry || "-",
      entryPhone: entryPhone || "-",
      bookedDate: bookedDateRaw ? formatDate(bookedDateRaw) : (bookedAt ? formatDate(bookedAt) : "-"),
      bookedTime: bookedTimeRaw ? formatTime(bookedTimeRaw) : (bookedAt ? formatTime(bookedAt) : "-")
    };

  }

  /* =========================================================
     Styles
  ========================================================= */

  function injectStyle(){

    if(document.getElementById("dispatchUiPatchStyle")) return;

    const style = document.createElement("style");
    style.id = "dispatchUiPatchStyle";

    style.textContent = `
      html,
      body{
        width:100%;
        max-width:100%;
        overflow-x:hidden;
      }

      .page-body,
      .dispatch-page,
      .main-content,
      .admin-page,
      .content,
      .admin-content,
      main{
        width:100% !important;
        max-width:100% !important;
      }

      .dispatch-review-wrap,
      .dispatch-table-wrap,
      .trips-table-wrap,
      .table-wrap,
      .review-table-wrap,
      .table-container,
      .dispatch-grid-wrap,
      .admin-table-wrap{
        width:100% !important;
        max-width:none !important;
        overflow-x:auto !important;
        overflow-y:visible !important;
        padding-bottom:10px !important;
      }

      #dispatchReviewTable,
      #dispatchTable,
      #tripsTable,
      .dispatch-review-table,
      .dispatch-table,
      .trips-table,
      .admin-table{
        width:100% !important;
        min-width:1350px !important;
        border-collapse:collapse !important;
        table-layout:auto !important;
        transform:none !important;
        zoom:1 !important;
      }

      #dispatchReviewTable th,
      #dispatchReviewTable td,
      #dispatchTable th,
      #dispatchTable td,
      #tripsTable th,
      #tripsTable td,
      .dispatch-review-table th,
      .dispatch-review-table td,
      .dispatch-table th,
      .dispatch-table td,
      .trips-table th,
      .trips-table td,
      .admin-table th,
      .admin-table td{
        font-size:13px !important;
        padding:8px 9px !important;
        white-space:nowrap !important;
        vertical-align:middle !important;
      }

      #dispatchReviewTable th,
      #dispatchTable th,
      #tripsTable th,
      .dispatch-review-table th,
      .dispatch-table th,
      .trips-table th,
      .admin-table th{
        background:#111827 !important;
        color:#ffffff !important;
        font-weight:700 !important;
        text-align:center !important;
      }

      .trip-address-box,
      .address-box,
      .pickup-box,
      .dropoff-box,
      .stop-box,
      .stops-box{
        min-width:230px !important;
        max-width:340px !important;
        white-space:normal !important;
        word-break:break-word !important;
        line-height:1.35 !important;
        font-size:12px !important;
      }

      #dispatchReviewTable input,
      #dispatchTable input,
      #tripsTable input,
      .dispatch-review-table input,
      .dispatch-table input,
      .trips-table input,
      .admin-table input{
        min-width:120px !important;
        height:26px !important;
        font-size:12px !important;
      }

      .action-buttons,
      .actions-cell,
      td.actions,
      td.action-cell{
        min-width:155px !important;
        display:flex !important;
        gap:5px !important;
        align-items:center !important;
        justify-content:center !important;
        flex-wrap:nowrap !important;
      }

      .action-buttons button,
      .actions-cell button,
      td.actions button,
      td.action-cell button,
      .btn-edit,
      .btn-delete,
      .btn-add-stop,
      .btn-eye,
      .eye-btn,
      .details-btn{
        font-size:11px !important;
        padding:5px 8px !important;
        border-radius:5px !important;
        white-space:nowrap !important;
      }

      .miles-cell,
      .price-cell,
      .minutes-cell{
        min-width:75px !important;
        text-align:center !important;
        font-weight:700 !important;
      }

      .status-cell{
        min-width:100px !important;
        text-align:center !important;
      }

      .date-separator,
      .day-separator{
        background:#bfdbfe !important;
        color:#0f172a !important;
        font-weight:800 !important;
        text-align:center !important;
        height:34px !important;
      }

      #tripDetailsModal{
        position:fixed;
        inset:0;
        background:rgba(15,23,42,.45);
        z-index:99999;
        display:none;
        align-items:center;
        justify-content:center;
        padding:15px;
      }

      #tripDetailsModal.show{
        display:flex !important;
      }

      #tripDetailsModal .trip-details-box{
        width:430px !important;
        max-width:92vw !important;
        background:#ffffff !important;
        border-radius:12px !important;
        box-shadow:0 20px 60px rgba(0,0,0,.30) !important;
        overflow:hidden !important;
      }

      #tripDetailsModal .trip-details-head{
        background:#0f172a !important;
        color:#ffffff !important;
        padding:12px 14px !important;
        display:flex !important;
        justify-content:space-between !important;
        align-items:center !important;
        font-weight:800 !important;
        font-size:14px !important;
      }

      #tripDetailsModal .trip-details-close{
        background:#0ea5e9 !important;
        color:#ffffff !important;
        border:0 !important;
        border-radius:6px !important;
        padding:5px 10px !important;
        cursor:pointer !important;
        font-weight:700 !important;
        font-size:12px !important;
      }

      #tripDetailsBody{
        padding:12px !important;
        display:flex !important;
        flex-direction:column !important;
        gap:7px !important;
      }

      #tripDetailsBody .details-row{
        display:grid !important;
        grid-template-columns:135px 1fr !important;
        gap:10px !important;
        padding:9px 10px !important;
        border:1px solid #e5e7eb !important;
        border-radius:8px !important;
        font-size:13px !important;
        background:#f8fafc !important;
      }

      #tripDetailsBody .details-row b{
        color:#0f172a !important;
      }

      #tripDetailsBody .details-row span{
        color:#334155 !important;
        word-break:break-word !important;
      }
    `;

    document.head.appendChild(style);

  }

  /* =========================================================
     Modal
  ========================================================= */

  function ensureModal(){

    let modal = document.getElementById("tripDetailsModal");

    if(modal){
      let body = document.getElementById("tripDetailsBody");

      if(!body){
        body = document.createElement("div");
        body.id = "tripDetailsBody";
        modal.appendChild(body);
      }

      return modal;
    }

    modal = document.createElement("div");
    modal.id = "tripDetailsModal";

    modal.innerHTML = `
      <div class="trip-details-box">
        <div class="trip-details-head">
          <span>Trip Details</span>
          <button type="button" class="trip-details-close">Close</button>
        </div>
        <div id="tripDetailsBody"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector(".trip-details-close");

    if(closeBtn){
      closeBtn.addEventListener("click", closeTripDetails);
    }

    modal.addEventListener("click", function(event){
      if(event.target === modal){
        closeTripDetails();
      }
    });

    return modal;

  }

  function openTripDetails(tripOrId){

    injectStyle();

    const modal = ensureModal();
    const body = document.getElementById("tripDetailsBody");

    if(!modal || !body) return;

    let trip = null;

    if(tripOrId && typeof tripOrId === "object"){
      trip = tripOrId;
    } else {
      trip = findTripById(tripOrId);
    }

    if(!trip && window.event){
      const row = window.event.target?.closest?.("tr");
      trip = findTripFromRow(row);
    }

    const details = normalizeDetails(trip || {});

    body.innerHTML = `
      <div class="details-row">
        <b>Service</b>
        <span>${html(details.service)}</span>
      </div>

      <div class="details-row">
        <b>Data Entry</b>
        <span>${html(details.dataEntry)}</span>
      </div>

      <div class="details-row">
        <b>Entry Phone</b>
        <span>${html(details.entryPhone)}</span>
      </div>

      <div class="details-row">
        <b>Booked Date</b>
        <span>${html(details.bookedDate)}</span>
      </div>

      <div class="details-row">
        <b>Booked Time</b>
        <span>${html(details.bookedTime)}</span>
      </div>
    `;

    modal.classList.add("show");

  }

  function closeTripDetails(){

    const modal = document.getElementById("tripDetailsModal");

    if(modal){
      modal.classList.remove("show");
    }

  }

  window.openTripDetails = openTripDetails;
  window.closeTripDetails = closeTripDetails;

  /* =========================================================
     Table layout fix
  ========================================================= */

  function fixTableLayout(){

    injectStyle();

    const selectors = [
      "#dispatchReviewTable",
      "#dispatchTable",
      "#tripsTable",
      ".dispatch-review-table",
      ".dispatch-table",
      ".trips-table",
      ".admin-table"
    ];

    const tables = document.querySelectorAll(selectors.join(","));

    tables.forEach(table => {

      table.style.width = "100%";
      table.style.minWidth = "1350px";
      table.style.tableLayout = "auto";
      table.style.transform = "none";
      table.style.zoom = "1";

      const parent = table.parentElement;

      if(parent){
        parent.style.width = "100%";
        parent.style.maxWidth = "none";
        parent.style.overflowX = "auto";
        parent.style.overflowY = "visible";
      }

    });

  }

  /* =========================================================
     Eye button patch
  ========================================================= */

  function buttonLooksLikeEye(button){

    if(!button) return false;

    const cls = button.className ? String(button.className).toLowerCase() : "";
    const title = text(button.getAttribute("title")).toLowerCase();
    const action = text(button.dataset.action).toLowerCase();
    const label = text(button.textContent).toLowerCase();

    return (
      cls.includes("eye") ||
      cls.includes("details") ||
      title.includes("details") ||
      title.includes("view") ||
      title.includes("eye") ||
      action === "details" ||
      action === "eye" ||
      label === "👁" ||
      label === "view" ||
      label === "details"
    );

  }

  function patchEyeButtons(){

    const buttons = document.querySelectorAll("button, a");

    buttons.forEach(button => {

      if(button.dataset.dispatchEyePatched === "1") return;
      if(!buttonLooksLikeEye(button)) return;

      button.dataset.dispatchEyePatched = "1";

      button.addEventListener("click", function(event){

        const row = button.closest("tr");

        const id = first(
          button.dataset.tripId,
          button.dataset.id,
          button.dataset.tripNumber,
          button.getAttribute("data-trip-id"),
          button.getAttribute("data-id"),
          button.getAttribute("data-trip-number"),
          row?.dataset?.tripId,
          row?.dataset?.id,
          row?.dataset?.tripNumber,
          row?.getAttribute("data-trip-id"),
          row?.getAttribute("data-id"),
          row?.getAttribute("data-trip-number")
        );

        const trip = id ? findTripById(id) : findTripFromRow(row);

        event.preventDefault();
        event.stopPropagation();

        openTripDetails(trip || id || {});

      }, true);

    });

  }

  /* =========================================================
     Optional row data tagging
  ========================================================= */

  function tagRowsFromVisibleCells(){

    const tables = document.querySelectorAll(
      "#dispatchReviewTable, #dispatchTable, #tripsTable, .dispatch-review-table, .dispatch-table, .trips-table, .admin-table"
    );

    tables.forEach(table => {

      const rows = table.querySelectorAll("tbody tr");

      rows.forEach(row => {

        if(row.dataset.dispatchTagged === "1") return;

        const textContent = text(row.textContent);
        const match = textContent.match(/\b(RV|SH|ST|WH|TX|XL|LM)-?\d{3,}\b/i);

        if(match && !row.dataset.tripNumber){
          row.dataset.tripNumber = match[0];
        }

        row.dataset.dispatchTagged = "1";

      });

    });

  }

  /* =========================================================
     Public refresh hook
  ========================================================= */

  function refreshDispatchUi(){

    injectStyle();
    ensureModal();
    fixTableLayout();
    tagRowsFromVisibleCells();
    patchEyeButtons();

  }

  window.refreshDispatchUi = refreshDispatchUi;

  /* =========================================================
     Observer
  ========================================================= */

  let observerStarted = false;

  function startObserver(){

    if(observerStarted) return;

    observerStarted = true;

    const observer = new MutationObserver(function(){
      refreshDispatchUi();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

  }

  /* =========================================================
     Init
  ========================================================= */

  function init(){

    refreshDispatchUi();
    startObserver();

    setTimeout(refreshDispatchUi, 300);
    setTimeout(refreshDispatchUi, 800);
    setTimeout(refreshDispatchUi, 1500);
    setTimeout(refreshDispatchUi, 2500);

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();