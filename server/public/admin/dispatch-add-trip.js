/* =========================================================
   FILE: public/admin/dispatch-add-trip.js
   Dispatch Add Trip / Dispatch Review UI Patch
   Scope:
   - Keeps existing trip logic untouched.
   - Details menu shows only:
     Service, Data Entry, Entry Phone, Booked Date, Booked Time.
   - Removes old extra details rows even if the old modal already exists.
   - Forces the dispatch table to stay readable and full-width.
========================================================= */

(function(){

  "use strict";

  console.log("Dispatch Add Trip UI patch loaded");

  /* =========================================================
     Helpers
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

  function validDate(value){
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }

  function formatDate(value){

    const raw = text(value);
    if(!raw) return "";

    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
      return raw;
    }

    if(!validDate(raw)){
      return raw.slice(0, 10);
    }

    const date = new Date(raw);

    return date.toLocaleDateString([], {
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

    if(!validDate(raw)){
      return raw;
    }

    const date = new Date(raw);

    return date.toLocaleTimeString([], {
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
     Trip discovery
  ========================================================= */

  function collectTrips(value, output, seen){

    if(!value) return;

    if(Array.isArray(value)){
      value.forEach(item => collectTrips(item, output, seen));
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
      const key = id || JSON.stringify(value).slice(0, 250);
      if(!seen.has(key)){
        seen.add(key);
        output.push(value);
      }
    }

    [
      "trips",
      "allTrips",
      "dispatchTrips",
      "reviewTrips",
      "todayTrips",
      "companyTrips",
      "reservedTrips",
      "dispatchReviewTrips",
      "dispatchAddTripTrips",
      "data",
      "items",
      "rows",
      "results"
    ].forEach(key => {
      if(value[key]){
        collectTrips(value[key], output, seen);
      }
    });

  }

  function getAllTrips(){

    const output = [];
    const seen = new Set();

    [
      window.trips,
      window.allTrips,
      window.dispatchTrips,
      window.reviewTrips,
      window.todayTrips,
      window.companyTrips,
      window.reservedTrips,
      window.dispatchReviewTrips,
      window.dispatchAddTripTrips,
      window.state,
      window.dispatchState,
      window.dispatchReviewState,
      window.appState,
      window.pageState
    ].forEach(source => collectTrips(source, output, seen));

    return output;

  }

  function findTripById(id){

    const target = text(id);
    if(!target) return null;

    return getAllTrips().find(trip => {
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

    const visibleText = text(row.textContent);
    const tripNumberMatch = visibleText.match(/\b[A-Z]{1,4}-?\d{2,}(-[A-Z]{1,4})?\b/i);

    if(tripNumberMatch){
      return findTripById(tripNumberMatch[0]);
    }

    return null;

  }

  /* =========================================================
     Details values
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

  function detailsHtml(details){

    return `
      <div class="details-row" data-detail-key="service">
        <b>Service</b>
        <span>${html(details.service)}</span>
      </div>

      <div class="details-row" data-detail-key="dataEntry">
        <b>Data Entry</b>
        <span>${html(details.dataEntry)}</span>
      </div>

      <div class="details-row" data-detail-key="entryPhone">
        <b>Entry Phone</b>
        <span>${html(details.entryPhone)}</span>
      </div>

      <div class="details-row" data-detail-key="bookedDate">
        <b>Booked Date</b>
        <span>${html(details.bookedDate)}</span>
      </div>

      <div class="details-row" data-detail-key="bookedTime">
        <b>Booked Time</b>
        <span>${html(details.bookedTime)}</span>
      </div>
    `;

  }

  /* =========================================================
     Styles
  ========================================================= */

  function injectStyle(){

    let style = document.getElementById("dispatchUiPatchStyle");

    if(!style){
      style = document.createElement("style");
      style.id = "dispatchUiPatchStyle";
      document.head.appendChild(style);
    }

    style.textContent = `
      html,
      body{
        width:100%;
        max-width:100%;
        overflow-x:hidden !important;
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
        padding-left:10px !important;
        padding-right:10px !important;
        box-sizing:border-box !important;
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
        max-width:100% !important;
        overflow-x:auto !important;
        overflow-y:visible !important;
        padding-bottom:10px !important;
        box-sizing:border-box !important;
      }

      #dispatchReviewTable,
      #dispatchTable,
      #tripsTable,
      .dispatch-review-table,
      .dispatch-table,
      .trips-table,
      .admin-table{
        width:100% !important;
        min-width:1180px !important;
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
        font-size:12px !important;
        padding:7px 8px !important;
        white-space:nowrap !important;
        vertical-align:middle !important;
        box-sizing:border-box !important;
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
        min-width:210px !important;
        max-width:300px !important;
        white-space:normal !important;
        word-break:break-word !important;
        line-height:1.3 !important;
        font-size:11px !important;
      }

      #dispatchReviewTable input,
      #dispatchTable input,
      #tripsTable input,
      .dispatch-review-table input,
      .dispatch-table input,
      .trips-table input,
      .admin-table input{
        min-width:95px !important;
        max-width:170px !important;
        height:25px !important;
        font-size:11px !important;
        box-sizing:border-box !important;
      }

      .action-buttons,
      .actions-cell,
      td.actions,
      td.action-cell{
        min-width:145px !important;
        display:flex !important;
        gap:4px !important;
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
        font-size:10.5px !important;
        padding:5px 7px !important;
        border-radius:5px !important;
        white-space:nowrap !important;
      }

      .miles-cell,
      .price-cell,
      .minutes-cell{
        min-width:70px !important;
        text-align:center !important;
        font-weight:700 !important;
      }

      .status-cell{
        min-width:95px !important;
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
        position:fixed !important;
        inset:0 !important;
        background:rgba(15,23,42,.45) !important;
        z-index:99999 !important;
        display:none;
        align-items:center !important;
        justify-content:center !important;
        padding:15px !important;
      }

      #tripDetailsModal.show{
        display:flex !important;
      }

      #tripDetailsModal .trip-details-box,
      #tripDetailsModal .modal-box,
      #tripDetailsModal .details-box{
        width:430px !important;
        max-width:92vw !important;
        max-height:none !important;
        background:#ffffff !important;
        border-radius:12px !important;
        box-shadow:0 20px 60px rgba(0,0,0,.30) !important;
        overflow:hidden !important;
      }

      #tripDetailsModal .trip-details-head,
      #tripDetailsModal .modal-head,
      #tripDetailsModal .details-head{
        background:#0f172a !important;
        color:#ffffff !important;
        padding:12px 14px !important;
        display:flex !important;
        justify-content:space-between !important;
        align-items:center !important;
        font-weight:800 !important;
        font-size:14px !important;
      }

      #tripDetailsModal .trip-details-close,
      #tripDetailsModal .modal-close,
      #tripDetailsModal .details-close{
        background:#0ea5e9 !important;
        color:#ffffff !important;
        border:0 !important;
        border-radius:6px !important;
        padding:5px 10px !important;
        cursor:pointer !important;
        font-weight:700 !important;
        font-size:12px !important;
      }

      #tripDetailsBody,
      #tripDetailsModal .modal-body,
      #tripDetailsModal .details-body{
        padding:12px !important;
        display:flex !important;
        flex-direction:column !important;
        gap:7px !important;
        max-height:none !important;
        overflow:visible !important;
      }

      #tripDetailsBody .details-row,
      #tripDetailsModal .modal-body .details-row,
      #tripDetailsModal .details-body .details-row{
        display:grid !important;
        grid-template-columns:135px 1fr !important;
        gap:10px !important;
        padding:9px 10px !important;
        border:1px solid #e5e7eb !important;
        border-radius:8px !important;
        font-size:13px !important;
        background:#f8fafc !important;
      }

      #tripDetailsBody .details-row b,
      #tripDetailsModal .modal-body .details-row b,
      #tripDetailsModal .details-body .details-row b{
        color:#0f172a !important;
      }

      #tripDetailsBody .details-row span,
      #tripDetailsModal .modal-body .details-row span,
      #tripDetailsModal .details-body .details-row span{
        color:#334155 !important;
        word-break:break-word !important;
      }
    `;

  }

  /* =========================================================
     Modal
  ========================================================= */

  function ensureModal(){

    let modal = document.getElementById("tripDetailsModal");

    if(!modal){
      modal = document.createElement("div");
      modal.id = "tripDetailsModal";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="trip-details-box">
        <div class="trip-details-head">
          <span>Trip Details</span>
          <button type="button" class="trip-details-close">Close</button>
        </div>
        <div id="tripDetailsBody"></div>
      </div>
    `;

    const closeBtn = modal.querySelector(".trip-details-close");

    closeBtn.addEventListener("click", function(event){
      event.preventDefault();
      event.stopPropagation();
      closeTripDetails();
    });

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

    body.innerHTML = detailsHtml(details);

    modal.classList.add("show");

  }

  function closeTripDetails(){

    const modal = document.getElementById("tripDetailsModal");

    if(modal){
      modal.classList.remove("show");
    }

  }

  window.openTripDetails = openTripDetails;
  window.showTripDetails = openTripDetails;
  window.renderTripDetails = openTripDetails;
  window.viewTripDetails = openTripDetails;
  window.closeTripDetails = closeTripDetails;

  /* =========================================================
     Cleanup old details modal if old code runs
  ========================================================= */

  function cleanupExistingDetailsModal(){

    const modal = document.getElementById("tripDetailsModal");
    if(!modal) return;

    const body =
      document.getElementById("tripDetailsBody") ||
      modal.querySelector(".modal-body") ||
      modal.querySelector(".details-body");

    if(!body) return;

    const rows = Array.from(body.querySelectorAll(".details-row, .detail-row, tr, div"));

    const allowed = new Set([
      "service",
      "data entry",
      "entry name",
      "entry phone",
      "booked date",
      "booked time"
    ]);

    rows.forEach(row => {

      const labelNode =
        row.querySelector("b") ||
        row.querySelector("strong") ||
        row.querySelector("label") ||
        row.querySelector("th") ||
        row.firstElementChild;

      const label = text(labelNode ? labelNode.textContent : "").toLowerCase().replace(":", "");

      if(!label) return;

      if(!allowed.has(label)){
        row.remove();
      }

    });

  }

  /* =========================================================
     Table layout
  ========================================================= */

  function fixTableLayout(){

    injectStyle();

    const tables = document.querySelectorAll(
      "#dispatchReviewTable, #dispatchTable, #tripsTable, .dispatch-review-table, .dispatch-table, .trips-table, .admin-table"
    );

    tables.forEach(table => {

      table.style.width = "100%";
      table.style.minWidth = "1180px";
      table.style.tableLayout = "auto";
      table.style.transform = "none";
      table.style.zoom = "1";

      const parent = table.parentElement;

      if(parent){
        parent.style.width = "100%";
        parent.style.maxWidth = "100%";
        parent.style.overflowX = "auto";
        parent.style.overflowY = "visible";
        parent.style.boxSizing = "border-box";
      }

    });

  }

  /* =========================================================
     Eye button patch
  ========================================================= */

  function buttonLooksLikeDetails(button){

    if(!button) return false;

    const cls = String(button.className || "").toLowerCase();
    const title = text(button.getAttribute("title")).toLowerCase();
    const action = text(button.dataset.action).toLowerCase();
    const label = text(button.textContent).toLowerCase();
    const onclick = text(button.getAttribute("onclick")).toLowerCase();

    return (
      cls.includes("eye") ||
      cls.includes("detail") ||
      title.includes("detail") ||
      title.includes("view") ||
      title.includes("eye") ||
      action === "details" ||
      action === "detail" ||
      action === "eye" ||
      label === "👁" ||
      label === "view" ||
      label === "details" ||
      onclick.includes("detail")
    );

  }

  function patchEyeButtons(){

    const buttons = document.querySelectorAll("button, a");

    buttons.forEach(button => {

      if(!buttonLooksLikeDetails(button)) return;

      button.dataset.dispatchEyePatched = "1";

      button.onclick = null;

      button.addEventListener("click", function(event){

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

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

        openTripDetails(trip || id || {});

      }, true);

    });

  }

  /* =========================================================
     Row tagging
  ========================================================= */

  function tagRowsFromVisibleCells(){

    const tables = document.querySelectorAll(
      "#dispatchReviewTable, #dispatchTable, #tripsTable, .dispatch-review-table, .dispatch-table, .trips-table, .admin-table"
    );

    tables.forEach(table => {

      table.querySelectorAll("tbody tr").forEach(row => {

        if(row.dataset.dispatchTagged === "1") return;

        const value = text(row.textContent);
        const match = value.match(/\b(RV|SH|ST|WH|TX|XL|LM)-?\d{2,}(-[A-Z]{1,4})?\b/i);

        if(match && !row.dataset.tripNumber){
          row.dataset.tripNumber = match[0];
        }

        row.dataset.dispatchTagged = "1";

      });

    });

  }

  /* =========================================================
     Refresh
  ========================================================= */

  function refreshDispatchUi(){

    injectStyle();
    ensureModal();
    fixTableLayout();
    tagRowsFromVisibleCells();
    patchEyeButtons();
    cleanupExistingDetailsModal();

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
      window.requestAnimationFrame(refreshDispatchUi);
    });

    observer.observe(document.body, {
      childList:true,
      subtree:true
    });

  }

  /* =========================================================
     Init
  ========================================================= */

  function init(){

    refreshDispatchUi();
    startObserver();

    setTimeout(refreshDispatchUi, 200);
    setTimeout(refreshDispatchUi, 600);
    setTimeout(refreshDispatchUi, 1200);
    setTimeout(refreshDispatchUi, 2500);

  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();