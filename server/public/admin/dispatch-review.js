/* ==========================================================================
   DISPATCH REVIEW V4
   Admin / SuperAdmin / Dispatcher
   Final Confirmed Trips Only
   Passenger Status Column
   Shared Group Status Logic
   Dynamic Service Cards Same Row
   Print + CSV + Excel Export
   Mobile Horizontal Cards
   ========================================================================== */

const API_URL = "/api/dispatch-review";
const SERVICES_URL = "/api/services/admin";
const USERS_URL = "/api/users";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */

let allTrips = [];
let services = [];
let facilities = [];
let displayItems = [];

let activeService = "ALL";
let activeSource = "ALL";
let activeFacility = "ALL";

let refreshTimer = null;

const CLOSED_HOURS = 10;

/* ===============================
   ELEMENTS
================================ */

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const yearFilter = document.getElementById("yearFilter");
const monthFilter = document.getElementById("monthFilter");
const reviewContent = document.getElementById("reviewContent");

/* ===============================
   BUILD TOP FILTERS + BUTTONS + STYLE
================================ */

(function buildTopFilters(){

  const toolbar = document.querySelector(".toolbar");
  if(!toolbar) return;

  if(!document.getElementById("sourceFilter")){

    const source = document.createElement("select");
    source.id = "sourceFilter";
    source.className = "filter-select";
    source.innerHTML = `
      <option value="ALL">All Bookings</option>
      <option value="GQ">Individual</option>
      <option value="FACILITY">Facilities</option>
      <option value="RV">Reserved</option>
    `;

    toolbar.insertBefore(source, toolbar.firstChild);
  }

  if(!document.getElementById("facilityFilter")){

    const facility = document.createElement("select");
    facility.id = "facilityFilter";
    facility.className = "filter-select";
    facility.style.display = "none";
    facility.innerHTML = `
      <option value="ALL">All Facilities</option>
    `;

    toolbar.insertBefore(facility, toolbar.children[1] || null);
  }

  if(!document.getElementById("printBtn")){

    const printBtn = document.createElement("button");
    printBtn.id = "printBtn";
    printBtn.className = "review-action-btn";
    printBtn.type = "button";
    printBtn.textContent = "Print";
    toolbar.appendChild(printBtn);

  }

  if(!document.getElementById("csvBtn")){

    const csvBtn = document.createElement("button");
    csvBtn.id = "csvBtn";
    csvBtn.className = "review-action-btn export-btn";
    csvBtn.type = "button";
    csvBtn.textContent = "CSV";
    toolbar.appendChild(csvBtn);

  }

  if(!document.getElementById("excelBtn")){

    const excelBtn = document.createElement("button");
    excelBtn.id = "excelBtn";
    excelBtn.className = "review-action-btn export-btn";
    excelBtn.type = "button";
    excelBtn.textContent = "Excel";
    toolbar.appendChild(excelBtn);

  }

  if(!document.getElementById("dispatch-review-v4-style")){

    const style = document.createElement("style");
    style.id = "dispatch-review-v4-style";
    style.innerHTML = `

      /* ===============================
         PAGE POSITION
      =============================== */

      .page-body{
        padding-top:245px!important;
      }

      @media(max-width:768px){
        .page-body{
          padding-top:170px!important;
        }
      }

      /* ===============================
         ACTION BUTTONS
      =============================== */

      .review-action-btn{
        height:38px!important;
        border:none!important;
        border-radius:10px!important;
        padding:0 15px!important;
        background:#0f172a!important;
        color:#fff!important;
        font-size:12px!important;
        font-weight:900!important;
        cursor:pointer!important;
        box-shadow:0 6px 16px rgba(15,23,42,.16)!important;
      }

      .review-action-btn:hover{
        background:#1d4ed8!important;
      }

      .review-action-btn.export-btn{
        background:#166534!important;
      }

      .review-action-btn.export-btn:hover{
        background:#15803d!important;
      }

      /* ===============================
         STATS CARDS SMALLER
      =============================== */

      #reviewStats,
      .stats-grid{
        gap:8px!important;
      }

      .stat-card{
        min-height:58px!important;
        padding:8px 10px!important;
        border-radius:10px!important;
        box-shadow:0 6px 16px rgba(15,23,42,.07)!important;
      }

      .stat-number{
        font-size:17px!important;
        line-height:1.05!important;
        font-weight:900!important;
      }

      .stat-label{
        font-size:8px!important;
        line-height:1.1!important;
        font-weight:900!important;
        margin-top:4px!important;
      }

      .stat-card.facility{border-left:6px solid #1d4ed8!important;}
      .stat-card.reserved{border-left:6px solid #f59e0b!important;}
      .stat-card.shared{border-left:6px solid #7c3aed!important;}

      /* ===============================
         SERVICE CARDS SAME ROW DESKTOP
      =============================== */

      .service-cards{
        --service-cols:1;

        display:grid!important;
        grid-template-columns:repeat(var(--service-cols), minmax(0,1fr))!important;
        gap:9px!important;
        width:100%!important;
        margin-bottom:14px!important;
        align-items:stretch!important;
      }

      .service-card{
        width:100%!important;
        min-width:0!important;
        padding:8px 9px!important;
        border-radius:10px!important;
      }

      .service-card-title{
        font-size:12px!important;
        margin-bottom:5px!important;
      }

      .service-line{
        font-size:9.5px!important;
        padding:2px 0!important;
      }

      /* ===============================
         MOBILE HORIZONTAL SCROLL CARDS
      =============================== */

      @media(max-width:768px){

        .toolbar{
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          gap:6px!important;
        }

        .toolbar input{
          grid-column:1 / -1!important;
        }

        .toolbar input,
        .toolbar select,
        .review-action-btn{
          width:100%!important;
          min-width:0!important;
          height:34px!important;
          font-size:10px!important;
          padding:0 7px!important;
          border-radius:8px!important;
        }

        #reviewStats,
        .stats-grid{
          display:flex!important;
          flex-wrap:nowrap!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          gap:7px!important;
          padding-bottom:7px!important;
          -webkit-overflow-scrolling:touch!important;
          scroll-snap-type:x mandatory!important;
        }

        #reviewStats::-webkit-scrollbar,
        .stats-grid::-webkit-scrollbar,
        .service-cards::-webkit-scrollbar{
          height:5px!important;
        }

        #reviewStats::-webkit-scrollbar-thumb,
        .stats-grid::-webkit-scrollbar-thumb,
        .service-cards::-webkit-scrollbar-thumb{
          background:#94a3b8!important;
          border-radius:999px!important;
        }

        .stat-card{
          flex:0 0 118px!important;
          min-width:118px!important;
          max-width:118px!important;
          min-height:52px!important;
          padding:7px 8px!important;
          scroll-snap-align:start!important;
        }

        .stat-number{
          font-size:15px!important;
        }

        .stat-label{
          font-size:7px!important;
        }

        .service-cards{
          display:flex!important;
          grid-template-columns:none!important;
          flex-wrap:nowrap!important;
          overflow-x:auto!important;
          overflow-y:hidden!important;
          gap:7px!important;
          padding-bottom:7px!important;
          -webkit-overflow-scrolling:touch!important;
          scroll-snap-type:x mandatory!important;
        }

        .service-card{
          flex:0 0 175px!important;
          min-width:175px!important;
          max-width:175px!important;
          padding:7px!important;
          scroll-snap-align:start!important;
        }

        .service-card-title{
          font-size:11px!important;
        }

        .service-line{
          font-size:8.5px!important;
        }
      }

      /* ===============================
         TABLE CLEAN UI
      =============================== */

      .facility-name{color:#1d4ed8;font-size:13px;font-weight:700;}
      .row-facility td{background:#eaf4ff!important;}
      .row-reserved td{background:#fef3c7!important;}
      .row-getquote td{background:#dcfce7!important;}
      .shared-row td{background:#ede9fe!important;}

      .source-pill{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        padding:4px 6px!important;
        border-radius:999px!important;
        font-size:10px!important;
        font-weight:900!important;
        white-space:nowrap!important;
      }

      .source-pill.facility{
        background:#dbeafe!important;
        color:#1e3a8a!important;
        border:1px solid #93c5fd!important;
      }

      .source-pill.reserved{
        background:#fef3c7!important;
        color:#92400e!important;
        border:1px solid #fcd34d!important;
      }

      .source-pill.gq{
        background:#dcfce7!important;
        color:#14532d!important;
        border:1px solid #86efac!important;
      }

      .table-wrap{
        width:100%!important;
        max-width:100%!important;
        overflow-x:auto!important;
        overflow-y:visible!important;
        -webkit-overflow-scrolling:touch!important;
        margin-bottom:20px!important;
        border-radius:14px!important;
        background:#fff!important;
        box-shadow:0 8px 22px rgba(15,23,42,.08)!important;
      }

      .review-table{
        width:100%!important;
        min-width:1680px!important;
        table-layout:fixed!important;
        border-collapse:collapse!important;
        background:#fff!important;
        border-top:6px solid #000!important;
      }

      .review-table th,
      .review-table td{
        border:1px solid #dbe3ee!important;
        padding:5px!important;
        text-align:center!important;
        font-size:11px!important;
        vertical-align:middle!important;
        line-height:1.25!important;
        box-sizing:border-box!important;
      }

      .review-table th{
        background:#1f2937!important;
        color:#fff!important;
        font-weight:900!important;
        white-space:nowrap!important;
        font-size:11px!important;
      }

      .col-num{width:30px!important;}
      .col-trip{width:76px!important;}
      .col-company{width:105px!important;}
      .col-date{width:82px!important;}
      .col-time{width:58px!important;}
      .col-status{width:92px!important;}
      .col-eye{width:34px!important;}

      .wide-client{
        width:170px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .wide-phone{
        width:110px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .wide-address{
        width:220px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
        font-size:10.5px!important;
      }

      .wide-stops{
        width:120px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
        font-size:10.5px!important;
      }

      .wide-notes{
        width:210px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .wide-passenger-status{
        width:140px!important;
        text-align:left!important;
        white-space:normal!important;
        word-break:break-word!important;
      }

      .company-cell{
        width:105px!important;
        font-weight:800!important;
        word-break:break-word!important;
        text-align:left!important;
      }

      .date-row td{
        background:#bfdbfe!important;
        color:#1e3a8a!important;
        font-weight:900!important;
        text-align:center!important;
        padding:5px 6px!important;
        font-size:13px!important;
        line-height:1.15!important;
        border-top:2px solid #60a5fa!important;
        border-bottom:2px solid #60a5fa!important;
        letter-spacing:.3px!important;
      }

      .trip-divider td{
        border-bottom:3px solid #000!important;
      }

      .cell-box{
        display:grid!important;
        border:1px solid #111!important;
        background:#fff!important;
        width:100%!important;
        box-sizing:border-box!important;
        border-radius:4px!important;
        overflow:hidden!important;
      }

      .cell-item{
        padding:4px 5px!important;
        min-height:22px!important;
        font-weight:700!important;
        white-space:normal!important;
        word-break:break-word!important;
        box-sizing:border-box!important;
        background:#fff!important;
        font-size:10.5px!important;
      }

      .cell-item + .cell-item{
        border-top:1px solid #111!important;
      }

      .trip-number-badge{
        font-weight:900!important;
        color:#1d4ed8!important;
        white-space:normal!important;
        word-break:break-word!important;
        font-size:10px!important;
      }

      .status-pill{
        display:inline-flex!important;
        padding:4px 6px!important;
        border-radius:999px!important;
        font-size:10px!important;
        font-weight:900!important;
        background:#f1f5f9!important;
        color:#0f172a!important;
        border:1px solid #cbd5e1!important;
        white-space:nowrap!important;
      }

      .status-pill.completed{
        background:#bbf7d0!important;
        color:#14532d!important;
        border-color:#86efac!important;
      }

      .status-pill.cancelled{
        background:#fecaca!important;
        color:#7f1d1d!important;
        border-color:#fca5a5!important;
      }

      .status-pill.noshow{
        background:#fde68a!important;
        color:#78350f!important;
        border-color:#fcd34d!important;
      }

      .status-pill.notcompleted{
        background:#e5e7eb!important;
        color:#374151!important;
        border-color:#cbd5e1!important;
      }

      .status-pill.mixed{
        background:#ddd6fe!important;
        color:#4c1d95!important;
        border-color:#c4b5fd!important;
      }

      .completed-row td{
        box-shadow:inset 0 0 0 9999px rgba(22,163,74,.08)!important;
      }

      .cancelled-row td{
        box-shadow:inset 0 0 0 9999px rgba(220,38,38,.07)!important;
      }

      .noshow-row td{
        box-shadow:inset 0 0 0 9999px rgba(245,158,11,.08)!important;
      }

      .notcompleted-row td{
        box-shadow:inset 0 0 0 9999px rgba(100,116,139,.08)!important;
      }

      .eye-btn{
        border:none!important;
        background:transparent!important;
        color:#2563eb!important;
        width:30px!important;
        height:24px!important;
        cursor:pointer!important;
        font-size:18px!important;
        font-weight:900!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        line-height:1!important;
        padding:0!important;
      }

      .eye-btn:hover{
        color:#1d4ed8!important;
        background:#dbeafe!important;
        border-radius:6px!important;
      }

      .view-overlay{
        position:fixed!important;
        inset:0!important;
        background:rgba(15,23,42,.55)!important;
        z-index:99999!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        padding:15px!important;
      }

      .view-box{
        background:#fff!important;
        width:min(680px,96vw)!important;
        max-height:90vh!important;
        overflow:auto!important;
        border-radius:15px!important;
        box-shadow:0 20px 60px rgba(0,0,0,.28)!important;
      }

      .view-head{
        position:sticky!important;
        top:0!important;
        background:#2563eb!important;
        color:#fff!important;
        padding:12px 15px!important;
        display:flex!important;
        justify-content:space-between!important;
        align-items:center!important;
        font-weight:900!important;
        z-index:2!important;
      }

      .view-close{
        border:none!important;
        background:#fff!important;
        color:#0f172a!important;
        width:30px!important;
        height:30px!important;
        border-radius:50%!important;
        font-size:18px!important;
        font-weight:900!important;
        cursor:pointer!important;
      }

      .view-body{
        padding:14px!important;
        display:grid!important;
        gap:8px!important;
      }

      .view-line{
        display:grid!important;
        grid-template-columns:150px 1fr!important;
        border:1px solid #e2e8f0!important;
        border-radius:9px!important;
        overflow:hidden!important;
      }

      .view-label{
        background:#f1f5f9!important;
        padding:9px!important;
        font-weight:900!important;
        color:#334155!important;
      }

      .view-value{
        padding:9px!important;
        font-weight:800!important;
        color:#0f172a!important;
        word-break:break-word!important;
        white-space:pre-line!important;
      }

      @media(max-width:768px){
        .review-table{
          min-width:1680px!important;
        }

        .review-table th,
        .review-table td{
          font-size:10px!important;
          padding:4px!important;
        }

        .cell-item{
          font-size:9.5px!important;
          padding:3px 4px!important;
        }

        .view-line{
          grid-template-columns:1fr!important;
        }
      }

      /* ===============================
         PRINT
      =============================== */

      @media print{

        @page{
          size:landscape;
          margin:6mm;
        }

        body{
          background:#fff!important;
          color:#000!important;
        }

        #adminHeader,
        .toolbar,
        .service-cards,
        .page-subtitle,
        .eye-btn,
        .col-eye,
        th.col-eye,
        td.col-eye{
          display:none!important;
        }

        .page-body{
          padding:10px!important;
        }

        .page-title{
          font-size:20px!important;
          margin-bottom:8px!important;
        }

        #reviewStats,
        .stats-grid{
          display:grid!important;
          grid-template-columns:repeat(5,1fr)!important;
          gap:5px!important;
          margin-bottom:8px!important;
          overflow:visible!important;
        }

        .stat-card{
          box-shadow:none!important;
          border:1px solid #000!important;
          border-left:4px solid #000!important;
          border-radius:4px!important;
          min-height:auto!important;
          padding:5px!important;
          min-width:0!important;
          max-width:none!important;
        }

        .stat-number{
          font-size:12px!important;
          color:#000!important;
        }

        .stat-label{
          font-size:6px!important;
          color:#000!important;
        }

        .table-wrap{
          box-shadow:none!important;
          border-radius:0!important;
          overflow:visible!important;
        }

        .review-table{
          min-width:0!important;
          width:100%!important;
          table-layout:fixed!important;
          border-top:2px solid #000!important;
        }

        .review-table th,
        .review-table td{
          font-size:5.8px!important;
          padding:1.2px!important;
          color:#000!important;
          border:1px solid #000!important;
        }

        .review-table th{
          background:#ddd!important;
          color:#000!important;
        }

        .cell-box{
          border:1px solid #000!important;
          border-radius:0!important;
        }

        .cell-item{
          font-size:5.8px!important;
          padding:1.2px!important;
          color:#000!important;
        }

        .date-row td{
          background:#ddd!important;
          color:#000!important;
          border:1px solid #000!important;
        }

        .source-pill,
        .status-pill{
          border:1px solid #000!important;
          background:#fff!important;
          color:#000!important;
          font-size:5.5px!important;
          padding:1px!important;
        }

        /* Hide long columns on print:
           Pickup / Stops / Dropoff / Notes / Eye
           Table columns:
           1 #, 2 Trip, 3 Company, 4 Client, 5 Phone,
           6 Pickup, 7 Stops, 8 Dropoff, 9 Notes,
           10 Date, 11 Time, 12 Status, 13 Passenger Status, 14 Eye
        */
        .review-table th:nth-child(6),
        .review-table td:nth-child(6),
        .review-table th:nth-child(7),
        .review-table td:nth-child(7),
        .review-table th:nth-child(8),
        .review-table td:nth-child(8),
        .review-table th:nth-child(9),
        .review-table td:nth-child(9),
        .review-table th:nth-child(14),
        .review-table td:nth-child(14){
          display:none!important;
        }
      }
    `;

    document.head.appendChild(style);
  }

})();

const sourceFilter = document.getElementById("sourceFilter");
const facilityFilter = document.getElementById("facilityFilter");
const printBtn = document.getElementById("printBtn");
const csvBtn = document.getElementById("csvBtn");
const excelBtn = document.getElementById("excelBtn");

/* ===============================
   HELPERS
================================ */

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function normalizeText(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return String(v || "")
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .toLowerCase()
    .trim();
}

function compactStatus(v){
  return cleanStatus(v).replace(/\s+/g,"");
}

function cellBox(items){
  const arr = Array.isArray(items) ? items : [items];

  return `
    <div class="cell-box">
      ${arr.map(v=>`
        <div class="cell-item">${safe(v || "--")}</div>
      `).join("")}
    </div>
  `;
}

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
}

function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function monthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function parseTripDateTime(t){

  if(!t || !t.tripDate) return null;

  const date = String(t.tripDate || "").trim();
  let time = String(t.tripTime || "00:00").trim();

  if(!time) time = "00:00";

  let d = new Date(`${date}T${time}`);

  if(isNaN(d)) d = new Date(`${date} ${time}`);
  if(isNaN(d)) return null;

  return d;
}

function getTripNumber(t){
  return String(t?.tripNumber || t?.bookingNumber || t?.id || "-");
}

function getBookedDateObj(t){
  return new Date(
    t?.bookedAt ||
    t?.createdAt ||
    t?.updatedAt ||
    t?.tripDate ||
    Date.now()
  );
}

function formatDateObj(d){
  if(!d || isNaN(d)) return "-";
  return d.toLocaleDateString();
}

function formatTimeObj(d){
  if(!d || isNaN(d)) return "-";
  return d.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });
}

function getBookedDate(t){
  return formatDateObj(getBookedDateObj(t));
}

function getBookedTime(t){
  return formatTimeObj(getBookedDateObj(t));
}

function getTripDateKey(t){
  return t?.tripDate || "Unknown";
}

function getFacilityName(t){
  return normalizeText(
    t?.facilityName ||
    t?.organizationName ||
    t?.customerCompany ||
    t?.companyName ||
    t?.company ||
    ""
  );
}

function getCompanyDisplay(t){
  return getFacilityName(t) || "--";
}

function getNotes(t){
  return t?.notes ?? t?.tripNotes ?? t?.note ?? "";
}

function stopText(stop){
  if(!stop) return "";
  if(typeof stop === "string") return stop;
  return stop.address || stop.location || stop.name || "";
}

function getStops(t){
  if(Array.isArray(t?.stops)) return t.stops;
  if(Array.isArray(t?.stopAddresses)) return t.stopAddresses;
  return [];
}

function stopsDisplay(t){
  const arr = getStops(t).map(stopText).filter(Boolean);
  if(!arr.length) return "--";
  return arr.map((x,i)=>`${i+1}. ${x}`).join("\n");
}

/* ===============================
   FINAL CONFIRMATION GATE
================================ */

function hasFinalConfirmation(trip){

  if(!trip){
    return false;
  }

  if(
    trip.finalStatusConfirmed === true ||
    trip.finalStatusConfirmedAt ||
    trip.dispatchFinalConfirmed === true ||
    trip.dispatchFinalConfirmedAt ||
    trip.sharedFinalConfirmed === true ||
    trip.sharedFinalConfirmedAt ||
    trip.adminSummaryReady === true ||
    trip.summaryReady === true ||
    trip.billingReady === true
  ){
    return true;
  }

  const passengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  return passengers.some(p =>
    p.finalStatusConfirmed === true ||
    p.finalStatusConfirmedAt ||
    p.dispatchFinalConfirmed === true ||
    p.dispatchFinalConfirmedAt ||
    p.adminSummaryReady === true ||
    p.summaryReady === true ||
    p.billingReady === true
  );
}

function groupHasFinalConfirmation(group){

  const arr =
    Array.isArray(group)
      ? group
      : [];

  if(arr.some(t => hasFinalConfirmation(t))){
    return true;
  }

  const passengers = getRealPassengersFromGroup(arr);

  return passengers.some(p =>
    p.finalStatusConfirmed === true ||
    p.finalStatusConfirmedAt ||
    p.dispatchFinalConfirmed === true ||
    p.dispatchFinalConfirmedAt ||
    p.adminSummaryReady === true ||
    p.summaryReady === true ||
    p.billingReady === true
  );
}

/* ===============================
   STATUS ENGINE
================================ */

function isCompletedStatus(status){
  const s = cleanStatus(status);
  return s === "completed" || s === "complete";
}

function isCancelledStatus(status){
  return cleanStatus(status).includes("cancel");
}

function isNoShowStatus(status){
  const s = cleanStatus(status);
  return s.includes("no show") || s.includes("noshow");
}

function isScheduledStatus(status){
  return cleanStatus(status) === "scheduled";
}

function isConfirmedStatus(status){
  return cleanStatus(status) === "confirmed";
}

function isNotCompletedStatus(status,trip){

  const s = cleanStatus(status);
  const c = compactStatus(status);

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return true;
  }

  if(
    isCompletedStatus(status) ||
    isCancelledStatus(status) ||
    isNoShowStatus(status)
  ){
    return false;
  }

  if(!isScheduledStatus(status) && !isConfirmedStatus(status)){
    return false;
  }

  const dt = parseTripDateTime(trip);
  if(!dt) return false;

  return Date.now() - dt.getTime() >= CLOSED_HOURS * 60 * 60 * 1000;
}

function isClosedStatus(status,trip){
  return (
    isCompletedStatus(status) ||
    isCancelledStatus(status) ||
    isNoShowStatus(status) ||
    isNotCompletedStatus(status,trip)
  );
}

function displayStatus(status,trip){
  if(status === "Mixed Closed") return "Mixed Closed";
  if(isNotCompletedStatus(status,trip)) return "Not Completed";
  if(isCompletedStatus(status)) return "Completed";
  if(isCancelledStatus(status)) return "Cancelled";
  if(isNoShowStatus(status)) return "No Show";
  return status || "-";
}

function statusClass(status,trip){

  const label = displayStatus(status,trip);

  if(label === "Completed") return "completed";
  if(label === "Cancelled") return "cancelled";
  if(label === "No Show") return "noshow";
  if(label === "Not Completed") return "notcompleted";
  if(label === "Mixed Closed") return "mixed";

  return "";
}

function statusHTML(status,trip){
  const label = displayStatus(status,trip);
  const cls = statusClass(status,trip);
  return `<span class="status-pill ${cls}">${safe(label)}</span>`;
}

/* ===============================
   SERVICES ENGINE
================================ */

function extractServices(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data?.services)) return data.services;
  if(Array.isArray(data?.data)) return data.data;
  if(Array.isArray(data?.items)) return data.items;
  if(Array.isArray(data?.results)) return data.results;
  return [];
}

function serviceEnabled(s){
  if(!s) return false;
  return s.enabled === true || s.companyEnabled === true;
}

function normalizeKnownCode(code){

  const c = normalizeText(code).toUpperCase();

  if(c === "STANDARD" || c === "ST") return "ST";
  if(c === "WHEELCHAIR" || c === "WH") return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(c === "LIMOUSINE" || c === "LIMO" || c === "LIMOUSINE SERVICE" || c === "LM") return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";

  return c;
}

function getServiceCodeFromService(s){
  return normalizeKnownCode(
    s?.serviceKey ||
    s?.key ||
    s?.code ||
    s?.suffix ||
    s?.companySuffix ||
    s?.title ||
    s?.name ||
    ""
  );
}

function getServiceTitle(s){
  return (
    s?.title ||
    s?.name ||
    s?.serviceName ||
    s?.serviceKey ||
    getServiceCodeFromService(s) ||
    "Service"
  );
}

function getServiceCodeFromTrip(t){

  const direct = normalizeText(
    t?.serviceKey ||
    t?.serviceCode ||
    t?.serviceType ||
    t?.serviceSuffix ||
    t?.service ||
    t?.pricingSnapshot?.serviceKey ||
    t?.pricingSnapshot?.serviceCode ||
    t?.priceSnapshot?.serviceKey ||
    t?.priceSnapshot?.serviceCode ||
    ""
  ).toUpperCase();

  if(direct) return normalizeKnownCode(direct);

  const numText = normalizeText(t?.tripNumber).toUpperCase();

  if(numText.includes("-SH") || isSharedTrip(t)) return "SH";
  if(numText.includes("-XL")) return "XL";
  if(numText.includes("-WH")) return "WH";
  if(numText.includes("-TX")) return "TX";
  if(numText.includes("-LM")) return "LM";
  if(numText.includes("-ST")) return "ST";

  return "ST";
}

function getServiceTitleByTrip(t){
  const code = getServiceCodeFromTrip(t);
  const service = services.find(s => getServiceCodeFromService(s) === code);
  return service ? getServiceTitle(service) : code;
}

function tripMatchesService(t,code){
  if(code === "ALL") return true;
  return getServiceCodeFromTrip(t) === code;
}

/* ===============================
   SOURCE ENGINE
================================ */

function getSourceCode(t){

  const raw = [
    t?.source,
    t?.from,
    t?.bookingSource,
    t?.createdBy,
    t?.type,
    t?.tripType,
    t?.reservationStatus,
    t?.reservationType,
    t?.sourceType,
    t?.tripNumber,
    t?.isReserved ? "reserved" : "",
    t?.reserved ? "reserved" : "",
    t?.reservationId ? "reserved" : ""
  ].join(" ").toLowerCase();

  if(
    raw.includes("reserved") ||
    raw.includes("reservation") ||
    raw.includes("-rv") ||
    raw.includes(" rv") ||
    raw === "rv"
  ){
    return "RV";
  }

  if(
    raw.includes("quote") ||
    raw.includes("gq") ||
    raw.includes("website") ||
    raw.includes("public")
  ){
    return "GQ";
  }

  if(getFacilityName(t)){
    return "FACILITY";
  }

  if(
    raw.includes("company") ||
    raw.includes("facility") ||
    raw.includes("portal")
  ){
    return "FACILITY";
  }

  return "GQ";
}

function sourceHTML(t){

  const code = getSourceCode(t);

  if(code === "RV"){
    return `<span class="source-pill reserved">Reserved</span>`;
  }

  if(code === "FACILITY"){
    return `<span class="source-pill facility">Facility</span>`;
  }

  return `<span class="source-pill gq">Individual</span>`;
}

function sourceLabel(t){
  const code = getSourceCode(t);

  if(code === "RV") return "Reserved";
  if(code === "FACILITY") return "Facility";

  return "Individual / Get Quote";
}

/* ===============================
   PASSENGER ENGINE
================================ */

function getEmail(t,p){
  return (
    p?.clientEmail ||
    p?.passengerEmail ||
    p?.email ||
    t?.clientEmail ||
    t?.passengerEmail ||
    t?.email ||
    t?.entryEmail ||
    "-"
  );
}

function getPassengerName(p,t){
  return (
    p?.clientName ||
    p?.passengerName ||
    p?.name ||
    t?.clientName ||
    t?.name ||
    "-"
  );
}

function getPassengerPhone(p,t){
  return (
    p?.clientPhone ||
    p?.passengerPhone ||
    p?.phone ||
    t?.clientPhone ||
    t?.phone ||
    "-"
  );
}

function getPickup(t,p){
  return p?.pickup || p?.pickupAddress || t?.pickup || "-";
}

function getDropoff(t,p){
  return p?.dropoff || p?.dropoffAddress || t?.dropoff || "-";
}

/* ===============================
   SHARED ENGINE
================================ */

function isSharedTrip(t){
  return (
    t?.isShared === true ||
    String(t?.tripType || "").toUpperCase() === "SHARED" ||
    String(t?.type || "").toLowerCase() === "shared" ||
    normalizeText(t?.tripNumber).toUpperCase().includes("-SH") ||
    (Array.isArray(t?.passengers) && t.passengers.length > 0)
  );
}

function getSharedKey(t){
  return (
    normalizeText(t?.groupId) ||
    normalizeText(t?.sharedGroupId) ||
    normalizeText(t?.tripNumber) ||
    String(t?._id || t?.id)
  );
}

function getRealPassengersFromGroup(group){

  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    return first.passengers;
  }

  return group.map((t,i)=>({
    passengerId:"P" + (i + 1),
    name:t.name || t.clientName || "",
    phone:t.phone || t.clientPhone || "",
    email:t.email || t.clientEmail || "",
    clientName:t.clientName || t.name || "",
    clientPhone:t.clientPhone || t.phone || "",
    clientEmail:t.clientEmail || t.email || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled"
  }));
}

function getSharedGroups(list = allTrips){

  const map = {};

  list.filter(isSharedTrip).forEach(t=>{
    const key = getSharedKey(t);
    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map).map(group =>
    group.sort((a,b)=>
      Number(a.passengerIndex || 0) -
      Number(b.passengerIndex || 0)
    )
  );
}

function getClosedPassengers(group){
  const first = group[0] || {};
  return getRealPassengersFromGroup(group).filter(p =>
    isClosedStatus(p.status || first.status,first)
  );
}

function hasClosedPassenger(group){
  return getClosedPassengers(group).length > 0;
}

function getPassengerStatusLabel(p,trip){
  return displayStatus(p?.status || trip?.status,trip);
}

function getPassengerStatusLines(group){

  const first = group[0] || {};
  const passengers = getClosedPassengers(group);

  return passengers.map((p,i)=>{
    const name = getPassengerName(p,first);
    const st = getPassengerStatusLabel(p,first);
    return `${i+1}. ${name}: ${st}`;
  });
}

function getGroupStatus(group){

  const first = group[0] || {};
  const closed = getClosedPassengers(group);

  if(!closed.length){
    return first.status || "Scheduled";
  }

  const statuses =
    closed.map(p =>
      displayStatus(p.status || first.status,first)
    );

  /*
    Shared final rule:
    - Any Completed => Completed
    - All Cancelled => Cancelled
    - All No Show => No Show
    - All Not Completed => Not Completed
    - Any mixed non-completed => Mixed Closed
  */

  if(statuses.includes("Completed")){
    return "Completed";
  }

  if(statuses.every(s => s === "Cancelled")){
    return "Cancelled";
  }

  if(statuses.every(s => s === "No Show")){
    return "No Show";
  }

  if(statuses.every(s => s === "Not Completed")){
    return "Not Completed";
  }

  return "Mixed Closed";
}

/* ===============================
   FACILITY USERS ENGINE
================================ */

function extractUsers(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data?.users)) return data.users;
  if(Array.isArray(data?.data)) return data.data;
  if(Array.isArray(data?.items)) return data.items;
  if(Array.isArray(data?.results)) return data.results;
  return [];
}

function isFacilityUser(u){

  const r = cleanStatus(
    u?.role ||
    u?.type ||
    u?.accountType ||
    ""
  );

  return (
    r === "company" ||
    r === "facility" ||
    r === "organization" ||
    r.includes("company") ||
    r.includes("facility")
  );
}

function getFacilityNameFromUser(u){
  return normalizeText(
    u?.facilityName ||
    u?.organizationName ||
    u?.companyName ||
    u?.company ||
    u?.name ||
    u?.fullName ||
    ""
  );
}

async function loadFacilities(){

  try{

    const res = await fetch(USERS_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error("Failed users");

    const data = await res.json();
    const users = extractUsers(data);

    const names = users
      .filter(isFacilityUser)
      .map(getFacilityNameFromUser)
      .filter(Boolean);

    facilities =
      [...new Set(names)]
      .sort((a,b)=>a.localeCompare(b));

  }catch(err){

    facilities = [];

  }
}

function buildFacilityFallbackFromTrips(){

  const names =
    allTrips
      .filter(t => getSourceCode(t) === "FACILITY")
      .map(getFacilityName)
      .filter(Boolean);

  facilities =
    [...new Set([...facilities,...names])]
    .sort((a,b)=>a.localeCompare(b));
}

function renderFacilityFilter(){

  if(!facilityFilter) return;

  facilityFilter.innerHTML =
    `<option value="ALL">All Facilities</option>`;

  facilities.forEach(name=>{
    facilityFilter.innerHTML += `
      <option value="${safe(name)}">
        ${safe(name)}
      </option>
    `;
  });

  if(activeSource === "FACILITY"){
    facilityFilter.style.display = "inline-block";
  }else{
    facilityFilter.style.display = "none";
    activeFacility = "ALL";
    facilityFilter.value = "ALL";
  }

  if(activeFacility !== "ALL"){
    if(facilities.includes(activeFacility)){
      facilityFilter.value = activeFacility;
    }else{
      activeFacility = "ALL";
      facilityFilter.value = "ALL";
    }
  }
}

/* ===============================
   LOADERS
================================ */

async function loadServices(){

  try{

    const res = await fetch(SERVICES_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error("Failed services");

    const data = await res.json();

    services =
      extractServices(data)
      .filter(serviceEnabled);

    if(
      activeService !== "ALL" &&
      !services.some(s => getServiceCodeFromService(s) === activeService)
    ){
      activeService = "ALL";
    }

  }catch(err){

    console.log(err);
    services = [];
    activeService = "ALL";

  }
}

async function loadTrips(){

  try{

    const res = await fetch(API_URL,{
      headers: token ? {Authorization:"Bearer " + token} : {}
    });

    if(!res.ok) throw new Error("Failed trips");

    const data = await res.json();

    const list =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.trips)
          ? data.trips
          : Array.isArray(data?.data)
            ? data.data
            : [];

    allTrips =
      list.sort((a,b)=>getBookedDateObj(b)-getBookedDateObj(a));

    allTrips = allTrips.map(t=>{

      if(!t.company || t.company === "Sunbeam Transportation"){

        const facilityName =
          t.companyName ||
          t.facilityName ||
          t.organizationName ||
          t.customerCompany ||
          "";

        if(facilityName){
          t.company = facilityName;
        }
      }

      return t;
    });

  }catch(err){

    console.log(err);
    allTrips = [];

  }
}

/* ===============================
   FILTER ENGINE
================================ */

function isClosedTrip(t){

  if(!t) return false;

  if(isSharedTrip(t)){

    const group =
      getSharedGroups(allTrips)
        .find(g => getSharedKey(g[0]) === getSharedKey(t)) ||
      [t];

    if(!groupHasFinalConfirmation(group)){
      return false;
    }

    return hasClosedPassenger(group);
  }

  if(!hasFinalConfirmation(t)){
    return false;
  }

  return isClosedStatus(t.status,t);
}

function buildDisplayItems(trips){

  const activeCodes =
    services.map(s => getServiceCodeFromService(s));

  const items = [];
  const usedShared = new Set();

  trips.forEach(t=>{

    const tripCode = getServiceCodeFromTrip(t);

    if(activeCodes.length && !activeCodes.includes(tripCode)){
      return;
    }

    if(!isClosedTrip(t)) return;

    if(isSharedTrip(t)){

      const key = getSharedKey(t);
      if(usedShared.has(key)) return;

      usedShared.add(key);

      const group =
        getSharedGroups(trips)
          .find(g => getSharedKey(g[0]) === key) ||
        [t];

      if(!groupHasFinalConfirmation(group)) return;
      if(!hasClosedPassenger(group)) return;

      items.push({
        kind:"shared",
        key,
        date:parseTripDateTime(group[0]) || getBookedDateObj(group[0]),
        tripDate:getTripDateKey(group[0]),
        group
      });

      return;
    }

    items.push({
      kind:"trip",
      key:String(t._id || t.id || getTripNumber(t)),
      date:parseTripDateTime(t) || getBookedDateObj(t),
      tripDate:getTripDateKey(t),
      trip:t
    });
  });

  return items.sort((a,b)=>b.date-a.date);
}

function searchableText(item){

  const first =
    item.kind === "trip"
      ? item.trip
      : item.group[0];

  const passengers =
    item.kind === "shared"
      ? getRealPassengersFromGroup(item.group)
      : [];

  return [
    getTripNumber(first),
    getServiceTitleByTrip(first),
    getSourceCode(first),
    sourceLabel(first),
    getFacilityName(first),
    first.entryName,
    first.entryPhone,
    first.entryEmail,
    first.clientName,
    first.clientPhone,
    first.clientEmail,
    first.email,
    first.pickup,
    first.dropoff,
    first.tripDate,
    first.tripTime,
    first.status,
    JSON.stringify(passengers)
  ].join(" ").toLowerCase();
}

function filterItems(items,options = {}){

  let out = [...items];

  if(activeSource === "GQ"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === "GQ";
    });
  }

  if(activeSource === "FACILITY"){

    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === "FACILITY";
    });

    if(activeFacility !== "ALL"){
      out = out.filter(item=>{
        const t = item.kind === "trip" ? item.trip : item.group[0];
        return getFacilityName(t) === activeFacility;
      });
    }
  }

  if(activeSource === "RV"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return getSourceCode(t) === "RV";
    });
  }

  if(options.service !== false && activeService !== "ALL"){
    out = out.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,activeService);
    });
  }

  const q =
    searchInput
      ? searchInput.value.toLowerCase().trim()
      : "";

  if(q){
    out = out.filter(item => searchableText(item).includes(q));
  }

  const st = statusFilter ? statusFilter.value : "";

  if(st){
    out = out.filter(item=>{
      if(item.kind === "trip"){
        return displayStatus(item.trip.status,item.trip) === st;
      }

      return getGroupStatus(item.group) === st;
    });
  }

  const y = yearFilter?.value || "";
  const m = monthFilter?.value || "";

  if(y){
    out = out.filter(item =>
      String(item.tripDate || "").split("-")[0] === y
    );
  }

  if(m){
    out = out.filter(item =>
      String(item.tripDate || "").split("-")[1] === m
    );
  }

  return out;
}

function applyFilters(){
  const baseItems = buildDisplayItems(allTrips);
  displayItems = filterItems(baseItems);
  render();
}

function buildDateFilters(){

  if(!yearFilter || !monthFilter) return;

  const oldYear = yearFilter.value || "";
  const oldMonth = monthFilter.value || "";

  const years = new Set();

  allTrips.forEach(t=>{
    if(t.tripDate){
      const y = String(t.tripDate).split("-")[0];
      if(y) years.add(y);
    }
  });

  yearFilter.innerHTML =
    `<option value="">All Years</option>`;

  [...years]
    .sort((a,b)=>Number(b)-Number(a))
    .forEach(y=>{
      yearFilter.innerHTML += `
        <option value="${safe(y)}">
          ${safe(y)}
        </option>
      `;
    });

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

  yearFilter.value = oldYear;
  monthFilter.value = oldMonth;
}

/* ===============================
   STATS ENGINE
================================ */

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
    facility:0,
    gq:0,
    reserved:0,
    shared:0
  };
}

function countStatus(stats,status,trip){

  const label = displayStatus(status,trip);

  if(label === "Completed") stats.completed++;
  else if(label === "Cancelled") stats.cancelled++;
  else if(label === "No Show") stats.noshow++;
  else if(label === "Not Completed") stats.notCompleted++;
  else if(label === "Mixed Closed") stats.mixed++;
}

function countItem(stats,item){

  const first =
    item.kind === "trip"
      ? item.trip
      : item.group[0];

  const azNow = getAZNow();
  const today = dateKey(azNow);
  const month = monthKey(azNow);

  stats.total++;

  if(first.tripDate === today) stats.today++;
  if(String(first.tripDate || "").slice(0,7) === month) stats.month++;

  const src = getSourceCode(first);

  if(src === "RV"){
    stats.reserved++;
  }else if(src === "FACILITY"){
    stats.facility++;
  }else{
    stats.gq++;
  }

  if(item.kind === "shared"){

    stats.shared++;
    countStatus(stats,getGroupStatus(item.group),first);

    return;
  }

  countStatus(stats,first.status,first);
}

function countItemsByService(code){

  const baseItems =
    buildDisplayItems(allTrips);

  let selected =
    filterItems(baseItems,{service:false});

  if(code !== "ALL"){
    selected = selected.filter(item=>{
      const t = item.kind === "trip" ? item.trip : item.group[0];
      return tripMatchesService(t,code);
    });
  }

  const stats = createStats();

  selected.forEach(item=>countItem(stats,item));

  return stats;
}

function renderStats(){

  const stats = createStats();

  displayItems.forEach(item=>countItem(stats,item));

  const wrap = document.getElementById("reviewStats");
  if(!wrap) return;

  wrap.innerHTML = `
    <div class="stat-card total"><div class="stat-number">${stats.total}</div><div class="stat-label">Total Closed</div></div>
    <div class="stat-card today"><div class="stat-number">${stats.today}</div><div class="stat-label">Today</div></div>
    <div class="stat-card month"><div class="stat-number">${stats.month}</div><div class="stat-label">This Month</div></div>
    <div class="stat-card completed"><div class="stat-number">${stats.completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card cancelled"><div class="stat-number">${stats.cancelled}</div><div class="stat-label">Cancelled</div></div>
    <div class="stat-card noshow"><div class="stat-number">${stats.noshow}</div><div class="stat-label">No Show</div></div>
    <div class="stat-card notcompleted"><div class="stat-number">${stats.notCompleted}</div><div class="stat-label">Not Completed</div></div>
    <div class="stat-card facility"><div class="stat-number">${stats.facility}</div><div class="stat-label">Facilities</div></div>
    <div class="stat-card gq"><div class="stat-number">${stats.gq}</div><div class="stat-label">Individual</div></div>
    <div class="stat-card reserved"><div class="stat-number">${stats.reserved}</div><div class="stat-label">Reserved</div></div>
    <div class="stat-card shared"><div class="stat-number">${stats.shared}</div><div class="stat-label">Shared</div></div>
  `;
}

/* ===============================
   SERVICE CARDS ENGINE
================================ */

function updateServiceCardsLayout(){

  const wrap = document.getElementById("serviceCards");
  if(!wrap) return;

  const count = wrap.querySelectorAll(".service-card").length || 1;

  /*
    Desktop:
    كل الكروت في نفس الصف.
    لو زودت أو مسحت خدمة، العدد يتغير لوحده.
  */
  wrap.style.setProperty("--service-cols", count);
}

function renderServiceCards(){

  const wrap = document.getElementById("serviceCards");
  if(!wrap) return;

  const cards = [
    {code:"ALL",title:"ALL"},
    ...services.map(s=>({
      code:getServiceCodeFromService(s),
      title:getServiceTitle(s)
    }))
  ];

  wrap.innerHTML = cards.map(card=>{

    const c = countItemsByService(card.code);
    const active =
      activeService === card.code
        ? "active-card"
        : "";

    return `
      <div class="service-card ${active}" data-service="${safe(card.code)}">
        <div class="service-card-title">${safe(card.title)}</div>
        <div class="service-line"><span>Total Closed</span><span>${c.total}</span></div>
        <div class="service-line"><span>Individual</span><span>${c.gq}</span></div>
        <div class="service-line"><span>Facilities</span><span>${c.facility}</span></div>
        <div class="service-line"><span>Reserved</span><span>${c.reserved}</span></div>
        <div class="service-line"><span>Completed</span><span>${c.completed}</span></div>
        <div class="service-line"><span>Cancelled</span><span>${c.cancelled}</span></div>
        <div class="service-line"><span>No Show</span><span>${c.noshow}</span></div>
        <div class="service-line"><span>Mixed</span><span>${c.mixed}</span></div>
        <div class="service-line"><span>Not Completed</span><span>${c.notCompleted}</span></div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll(".service-card").forEach(card=>{
    card.onclick = ()=>{
      activeService = card.dataset.service || "ALL";
      applyFilters();
    };
  });

  updateServiceCardsLayout();
}

/* ===============================
   VIEW MODAL
================================ */

function viewLine(label,value){
  return `
    <div class="view-line">
      <div class="view-label">${safe(label)}</div>
      <div class="view-value">${safe(value || "--")}</div>
    </div>
  `;
}

function passengerDetailsText(item){

  if(item.kind !== "shared"){

    const t = item.trip;

    return [
      `Name: ${t.clientName || t.name || "-"}`,
      `Phone: ${t.clientPhone || t.phone || "-"}`,
      `Email: ${getEmail(t,null)}`,
      `Pickup: ${t.pickup || "-"}`,
      `Dropoff: ${t.dropoff || "-"}`,
      `Status: ${displayStatus(t.status,t)}`
    ].join("\n");
  }

  const first = item.group[0] || {};
  const passengers = getClosedPassengers(item.group);

  return passengers.map((p,i)=>[
    `${i+1}. ${getPassengerName(p,first)}`,
    `Phone: ${getPassengerPhone(p,first)}`,
    `Email: ${getEmail(first,p)}`,
    `Pickup: ${getPickup(first,p)}`,
    `Dropoff: ${getDropoff(first,p)}`,
    `Status: ${displayStatus(p.status || first.status,first)}`
  ].join("\n")).join("\n\n");
}

function openReviewView(key){

  const item = displayItems.find(x=>x.key === key);
  if(!item) return;

  const t = item.kind === "trip" ? item.trip : item.group[0];

  closeReviewView();

  const overlay = document.createElement("div");
  overlay.id = "reviewViewOverlay";
  overlay.className = "view-overlay";

  overlay.innerHTML = `
    <div class="view-box">
      <div class="view-head">
        <div>Review Details</div>
        <button class="view-close" type="button" onclick="closeReviewView()">×</button>
      </div>

      <div class="view-body">
        ${viewLine("Trip Number",getTripNumber(t))}
        ${viewLine("Source",sourceLabel(t))}
        ${viewLine("Service",getServiceTitleByTrip(t))}
        ${viewLine("Facility",getFacilityName(t))}
        ${viewLine("Entry Name",t.entryName || "")}
        ${viewLine("Entry Phone",t.entryPhone || "")}
        ${viewLine("Client Email",getEmail(t,null))}
        ${viewLine("Booked Date",getBookedDate(t))}
        ${viewLine("Booked Time",getBookedTime(t))}
        ${viewLine("Trip Date",t.tripDate || "")}
        ${viewLine("Trip Time",t.tripTime || "")}
        ${viewLine("Trip Status",item.kind === "shared" ? getGroupStatus(item.group) : displayStatus(t.status,t))}
        ${viewLine("Passenger Status",item.kind === "shared" ? getPassengerStatusLines(item.group).join("\n") : displayStatus(t.status,t))}
        ${viewLine("Passengers",passengerDetailsText(item))}
        ${viewLine("Stops",stopsDisplay(t))}
        ${viewLine("Notes",getNotes(t))}
      </div>
    </div>
  `;

  overlay.addEventListener("click",e=>{
    if(e.target === overlay) closeReviewView();
  });

  document.body.appendChild(overlay);
}

function closeReviewView(){
  document.getElementById("reviewViewOverlay")?.remove();
}

/* ===============================
   TABLE ENGINE
================================ */

function rowClass(status,trip,itemKind){

  const cls = statusClass(status,trip);
  const src = getSourceCode(trip);

  let out = "";

  if(itemKind === "shared") out += "shared-row ";

  if(src === "RV"){
    out += "row-reserved ";
  }else if(src === "FACILITY"){
    out += "row-facility ";
  }else{
    out += "row-getquote ";
  }

  if(cls === "completed") out += "completed-row ";
  if(cls === "cancelled") out += "cancelled-row ";
  if(cls === "noshow") out += "noshow-row ";
  if(cls === "notcompleted") out += "notcompleted-row ";

  return out.trim() + " trip-divider";
}

function groupByTripDate(items){

  const groups = {};

  items.forEach(item=>{
    const key = item.tripDate || "Unknown";
    if(!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  return groups;
}

let tripCounter = 1;

function render(){

  tripCounter = 1;

  renderStats();
  renderServiceCards();

  if(!reviewContent) return;

  reviewContent.innerHTML = "";

  if(!displayItems.length){
    reviewContent.innerHTML =
      `<div class="empty-state">No Review Trips Found</div>`;
    return;
  }

  const groups = groupByTripDate(displayItems);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "review-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-trip">Trip #</th>
        <th class="col-company">Company</th>
        <th class="wide-client">Client / Passengers</th>
        <th class="wide-phone">Phone</th>
        <th class="wide-address">Pickup</th>
        <th class="wide-stops">Stops</th>
        <th class="wide-address">Dropoff</th>
        <th class="wide-notes">Notes</th>
        <th class="col-date">Trip Date</th>
        <th class="col-time">Trip Time</th>
        <th class="wide-passenger-status">Passenger Status</th>
        <th class="col-status">Trip Status</th>
        <th class="col-eye">👁️</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  Object.keys(groups)
    .sort((a,b)=>new Date(b)-new Date(a))
    .forEach(day=>{

      const dateRow = document.createElement("tr");
      dateRow.className = "date-row";
      dateRow.innerHTML = `<td colspan="14">Trip Date: ${safe(day)}</td>`;
      tbody.appendChild(dateRow);

      groups[day].forEach(item=>{

        if(item.kind === "trip"){
          tbody.appendChild(renderTripRow(item));
        }else{
          tbody.appendChild(renderSharedRow(item));
        }

      });
    });

  wrap.appendChild(table);
  reviewContent.appendChild(wrap);
}

function renderTripRow(item){

  const t = item.trip;
  const tr = document.createElement("tr");

  tr.className = rowClass(t.status,t,"trip");

  tr.innerHTML = `
    <td class="col-num">${tripCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(t))}</span>
    </td>

    <td class="company-cell">
      ${cellBox(getCompanyDisplay(t))}
    </td>

    <td class="wide-client">
      ${cellBox(t.clientName || t.name || "--")}
    </td>

    <td class="wide-phone">
      ${cellBox(t.clientPhone || t.phone || "--")}
    </td>

    <td class="wide-address">
      ${cellBox(t.pickup || "--")}
    </td>

    <td class="wide-stops">
      ${cellBox(stopsDisplay(t))}
    </td>

    <td class="wide-address">
      ${cellBox(t.dropoff || "--")}
    </td>

    <td class="wide-notes">
      ${cellBox(getNotes(t) || "--")}
    </td>

    <td class="col-date">${safe(t.tripDate || "-")}</td>
    <td class="col-time">${safe(t.tripTime || "-")}</td>
   <td class="wide-passenger-status">
      ${cellBox(displayStatus(t.status,t))}
    </td>
    <td class="col-status">
      ${statusHTML(t.status,t)}
    </td>


    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openReviewView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

function renderSharedRow(item){

  const group = item.group;
  const first = group[0] || {};
  const passengers = getClosedPassengers(group);
  const groupStatus = getGroupStatus(group);

  const names = passengers.map((p,i)=>
    `${i+1}. ${getPassengerName(p,first) || "--"}`
  );

  const phones = passengers.map((p,i)=>
    `${i+1}. ${getPassengerPhone(p,first) || "--"}`
  );

  const pickups = passengers.map((p,i)=>
    `${i+1}. ${getPickup(first,p) || "--"}`
  );

  const dropoffs = passengers.map((p,i)=>
    `${i+1}. ${getDropoff(first,p) || "--"}`
  );

  const passengerStatuses = passengers.map((p,i)=>
    `${i+1}. ${displayStatus(p.status || first.status,first)}`
  );

  const tr = document.createElement("tr");

  tr.className = rowClass(groupStatus,first,"shared");

  tr.innerHTML = `
    <td class="col-num">${tripCounter++}</td>

    <td class="col-trip">
      <span class="trip-number-badge">${safe(getTripNumber(first))}</span>
    </td>

    <td class="company-cell">
      ${cellBox(getCompanyDisplay(first))}
    </td>

    <td class="wide-client">${cellBox(names)}</td>
    <td class="wide-phone">${cellBox(phones)}</td>
    <td class="wide-address">${cellBox(pickups)}</td>

    <td class="wide-stops">
      ${cellBox(stopsDisplay(first))}
    </td>

    <td class="wide-address">${cellBox(dropoffs)}</td>

    <td class="wide-notes">
      ${cellBox(getNotes(first) || "--")}
    </td>

    <td class="col-date">${safe(first.tripDate || "-")}</td>
    <td class="col-time">${safe(first.tripTime || "-")}</td>

  <td class="wide-passenger-status">
      ${cellBox(passengerStatuses)}
    </td>
    <td class="col-status">
      ${statusHTML(groupStatus,first)}
    </td>

  

    <td class="col-eye">
      <button class="eye-btn" type="button" title="View" onclick="openReviewView('${safe(item.key)}')">👁️</button>
    </td>
  `;

  return tr;
}

/* ===============================
   EXPORT ENGINE
================================ */

function getExportRows(){

  const rows = [];

  displayItems.forEach(item=>{

    const first =
      item.kind === "trip"
        ? item.trip
        : item.group[0];

    if(item.kind === "trip"){

      const t = item.trip;

      rows.push({
        tripNumber:getTripNumber(t),
        source:sourceLabel(t),
        facility:getFacilityName(t),
        service:getServiceTitleByTrip(t),
        passenger:t.clientName || t.name || "",
        phone:t.clientPhone || t.phone || "",
        pickup:t.pickup || "",
        stops:stopsDisplay(t) === "--" ? "" : stopsDisplay(t),
        dropoff:t.dropoff || "",
        notes:getNotes(t),
        tripDate:t.tripDate || "",
        tripTime:t.tripTime || "",
        tripStatus:displayStatus(t.status,t),
        passengerStatus:displayStatus(t.status,t),
        bookedDate:getBookedDate(t),
        bookedTime:getBookedTime(t)
      });

      return;
    }

    const passengers = getClosedPassengers(item.group);

    passengers.forEach((p,index)=>{

      rows.push({
        tripNumber:index === 0 ? getTripNumber(first) : "",
        source:index === 0 ? sourceLabel(first) : "",
        facility:index === 0 ? getFacilityName(first) : "",
        service:index === 0 ? getServiceTitleByTrip(first) : "",
        passenger:getPassengerName(p,first),
        phone:getPassengerPhone(p,first),
        pickup:getPickup(first,p),
        stops:index === 0 ? (stopsDisplay(first) === "--" ? "" : stopsDisplay(first)) : "",
        dropoff:getDropoff(first,p),
        notes:index === 0 ? getNotes(first) : "",
        tripDate:index === 0 ? first.tripDate || "" : "",
        tripTime:index === 0 ? first.tripTime || "" : "",
        tripStatus:index === 0 ? getGroupStatus(item.group) : "",
        passengerStatus:displayStatus(p.status || first.status,first),
        bookedDate:index === 0 ? getBookedDate(first) : "",
        bookedTime:index === 0 ? getBookedTime(first) : ""
      });

    });

  });

  return rows;
}

function downloadFile(filename,content,type){

  const blob =
    new Blob([content],{
      type
    });

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV(){

  const rows = getExportRows();

  const headers = [
    "Trip Number",
    "Source",
    "Facility",
    "Service",
    "Passenger",
    "Phone",
    "Pickup",
    "Stops",
    "Dropoff",
    "Notes",
    "Trip Date",
    "Trip Time",
    "Trip Status",
    "Passenger Status",
    "Booked Date",
    "Booked Time"
  ];

  const keys = [
    "tripNumber",
    "source",
    "facility",
    "service",
    "passenger",
    "phone",
    "pickup",
    "stops",
    "dropoff",
    "notes",
    "tripDate",
    "tripTime",
    "tripStatus",
    "passengerStatus",
    "bookedDate",
    "bookedTime"
  ];

  const csv = [
    headers.join(","),
    ...rows.map(row =>
      keys.map(k=>{
        const value =
          String(row[k] ?? "")
            .replace(/"/g,'""');

        return `"${value}"`;
      }).join(",")
    )
  ].join("\n");

  downloadFile(
    "dispatch-review.csv",
    csv,
    "text/csv;charset=utf-8;"
  );
}

function exportExcel(){

  const rows = getExportRows();

  const headers = [
    "Trip Number",
    "Source",
    "Facility",
    "Service",
    "Passenger",
    "Phone",
    "Pickup",
    "Stops",
    "Dropoff",
    "Notes",
    "Trip Date",
    "Trip Time",
    "Trip Status",
    "Passenger Status",
    "Booked Date",
    "Booked Time"
  ];

  const keys = [
    "tripNumber",
    "source",
    "facility",
    "service",
    "passenger",
    "phone",
    "pickup",
    "stops",
    "dropoff",
    "notes",
    "tripDate",
    "tripTime",
    "tripStatus",
    "passengerStatus",
    "bookedDate",
    "bookedTime"
  ];

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              ${headers.map(h=>`<th>${safe(h)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row=>`
              <tr>
                ${keys.map(k=>`<td>${safe(row[k] ?? "")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  downloadFile(
    "dispatch-review.xls",
    html,
    "application/vnd.ms-excel"
  );
}

/* ===============================
   EVENTS
================================ */

searchInput?.addEventListener("input",applyFilters);
statusFilter?.addEventListener("change",applyFilters);
yearFilter?.addEventListener("change",applyFilters);
monthFilter?.addEventListener("change",applyFilters);

sourceFilter?.addEventListener("change",()=>{
  activeSource = sourceFilter.value || "ALL";
  activeFacility = "ALL";
  renderFacilityFilter();
  applyFilters();
});

facilityFilter?.addEventListener("change",()=>{
  activeFacility = facilityFilter.value || "ALL";
  applyFilters();
});

printBtn?.addEventListener("click",()=>{
  window.print();
});

csvBtn?.addEventListener("click",exportCSV);
excelBtn?.addEventListener("click",exportExcel);

Object.assign(window,{
  openReviewView,
  closeReviewView,
  exportCSV,
  exportExcel
});

/* ===============================
   INIT
================================ */

async function refreshEverything(){

  await Promise.all([
    loadServices(),
    loadFacilities()
  ]);

  await loadTrips();

  buildFacilityFallbackFromTrips();
  buildDateFilters();
  renderFacilityFilter();

  applyFilters();
}

(async function init(){

  await refreshEverything();

  if(refreshTimer) clearInterval(refreshTimer);

  refreshTimer =
    setInterval(refreshEverything,30000);

})();