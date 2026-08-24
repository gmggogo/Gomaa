<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Trips</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<link rel="stylesheet" href="/admin/style.css">

<style>
/* =====================================================
   TRIPS PAGE UI
   Same Professional Layout As Trips Hub
===================================================== */

body{
  margin:0;
  font-family:Segoe UI,Arial,sans-serif;
  background:#f1f5f9;
  color:#0f172a;
}

#adminHeader{
  position:fixed;
  top:0;
  left:0;
  width:100%;
  z-index:1000;
}

/* PAGE TITLE — SAME STYLE AS TRIPS HUB / FINAL */

.page-head{
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:68px;
  margin:0 -20px 14px;
  padding:8px 20px;
  border:0;
  border-top:1px solid #ead58d;
  border-bottom:1px solid #ead58d;
  border-radius:0;
  background:linear-gradient(
    90deg,
    #fff8d9 0%,
    #f7e8b0 50%,
    #fff8d9 100%
  );
  box-shadow:none;
  text-align:center;
}

.page-title{
  margin:0;
  font-size:24px;
  line-height:1.05;
  font-weight:900;
  color:#111827;
}

.page-sub{
  margin-top:4px;
  font-size:11px;
  line-height:1.2;
  font-weight:700;
  color:#64748b;
}

/* PAGE */

.page-body{
  padding-top:165px;
  padding-left:20px;
  padding-right:20px;
  padding-bottom:30px;
}

/* TOP STICKY AREA */

.admin-trips-top{
  position:sticky;
  top:0;
  z-index:800;
  display:flex;
  flex-direction:column;
  gap:10px;
  margin-bottom:14px;
  padding:0 0 8px;
  background:#f1f5f9;
  border-bottom:1px solid #cbd5e1;
}

/* STATS */

.stats-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(145px,1fr));
  gap:12px;
}

.stat-card{
  position:relative;
  overflow:hidden;
  isolation:isolate;
  min-height:92px;
  border:1px solid rgba(255,255,255,.30);
  border-radius:15px;
  padding:12px 10px;
  text-align:center;
  box-shadow:
    0 9px 20px rgba(15,23,42,.17),
    inset 0 1px 0 rgba(255,255,255,.24);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
}

.stat-card::before{
  content:"";
  position:absolute;
  width:118px;
  height:118px;
  border-radius:50%;
  right:-35px;
  top:-42px;
  background:rgba(255,255,255,.13);
  z-index:-1;
}

.stat-card:nth-child(1){
  background:linear-gradient(135deg,#075fe8 0%,#13a4ff 100%);
}
.stat-card:nth-child(2){
  background:linear-gradient(135deg,#f472b6 0%,#ec4899 55%,#db2777 100%);
}
.stat-card:nth-child(3){
  background:linear-gradient(135deg,#0891b2 0%,#22d3ee 100%);
}
.stat-card:nth-child(4){
  background:linear-gradient(135deg,#6d28d9 0%,#8b5cf6 52%,#c026d3 100%);
}
.stat-card:nth-child(5){
  background:linear-gradient(135deg,#11983f 0%,#39c65d 100%);
}
.stat-card:nth-child(6){
  background:linear-gradient(135deg,#f27a00 0%,#ffad16 100%);
}

.stat-label{
  font-size:11px;
  font-weight:900;
  color:#fff;
  letter-spacing:.3px;
  text-transform:uppercase;
  text-align:center;
}

.stat-value{
  font-size:26px;
  line-height:1.05;
  font-weight:900;
  color:#fff;
  margin-top:5px;
  text-align:center;
}

/* SERVICE CARDS */

.service-strip{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
  gap:8px;
  overflow:visible;
  padding-bottom:0;
}

.service-card{
  position:relative;
  overflow:hidden;
  background:linear-gradient(135deg,#f8e7a2 0%,#e8c75d 52%,#f4dc86 100%);
  border:1px solid #d1a92e;
  border-radius:13px;
  padding:8px 7px;
  cursor:pointer;
  text-align:center;
  min-height:78px;
  box-shadow:0 7px 16px rgba(15,23,42,.12);
  transition:.15s ease;
  color:#111827;
}

.service-card:hover{
  transform:translateY(-1px);
  box-shadow:0 9px 18px rgba(15,23,42,.15);
}

.service-card.active{
  outline:none;
  background:linear-gradient(135deg,#f8e7a2 0%,#e8c75d 52%,#f4dc86 100%);
  border:3px solid #0f172a;
  color:#111827;
  box-shadow:
    0 0 0 3px rgba(255,255,255,.9),
    0 10px 24px rgba(15,23,42,.18);
}

.service-name{
  font-size:12px;
  line-height:1.1;
  font-weight:900;
  margin-bottom:4px;
  color:#111827;
}

.service-total{
  font-size:22px;
  line-height:1.05;
  font-weight:900;
  margin:4px 0;
  color:#111827;
}

.service-mini{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:4px;
  font-size:9px;
  font-weight:900;
  color:#111827;
}

.service-card.active .service-mini{
  color:#111827;
}

/* SELECTION BAR */

.selection-bar{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  align-items:center;
  margin:0;
}

.select-btn{
  border:none;
  border-radius:9px;
  padding:8px 13px;
  font-size:12px;
  font-weight:900;
  cursor:pointer;
  color:#fff;
  background:#0f172a;
  box-shadow:0 4px 10px rgba(15,23,42,.12);
}

.select-btn:hover{
  background:#2563eb;
}

.select-btn.active{
  background:#16a34a;
}

.select-btn.danger{
  background:#dc2626;
}

/* TABLE AREA */

.table-scroll{
  width:100%;
  max-width:100%;
  overflow-x:auto;
  overflow-y:visible;
  -webkit-overflow-scrolling:touch;
  margin-bottom:20px;
  border-radius:14px;
  background:#fff;
  box-shadow:0 8px 22px rgba(15,23,42,.08);
}

.trip-table{
  width:100%;
  min-width:1560px;
  table-layout:fixed;
  border-collapse:collapse;
  background:#fff;
  border-top:6px solid #000;
  font-size:11px;
}

.trip-table th,
.trip-table td{
  border:1px solid #dbe3ee;
  padding:5px;
  text-align:center;
  vertical-align:middle;
  line-height:1.25;
  box-sizing:border-box;
  position:relative;
  overflow:visible;
}

.trip-table th{
  background:#1f2937;
  color:#fff;
  font-weight:900;
  white-space:nowrap;
  font-size:11px;
  position:static;
  top:auto;
  z-index:auto;
}

.trip-table td{
  font-size:11px;
}

/* SMALL COLUMNS */

.col-num,
.num-col{
  width:30px;
}

.col-select,
.select-col{
  width:36px;
}

.col-trip,
.trip-col{
  width:76px;
}

.col-company,
.company-col{
  width:100px;
}

.col-date,
.date-col{
  width:82px;
}

.col-time,
.time-col{
  width:58px;
}

.col-status,
.status-col{
  width:76px;
}

.col-actions,
.actions-col{
  width:105px;
}

/* WIDE COLUMNS */

.col-client,
.client-col,
.wide-client{
  width:180px;
  text-align:left!important;
  white-space:normal;
  word-break:break-word;
}

.col-phone,
.phone-col,
.wide-phone{
  width:115px;
  text-align:left!important;
  white-space:normal;
  word-break:break-word;
}

.col-address,
.address-col,
.pickup-col,
.dropoff-col,
.wide-address{
  width:230px;
  text-align:left!important;
  white-space:normal;
  word-break:break-word;
  font-size:10.5px!important;
}

.col-stops,
.stops-col,
.wide-stops{
  width:120px;
  text-align:left!important;
  white-space:normal;
  word-break:break-word;
  font-size:10.5px!important;
}

.col-notes,
.notes-col,
.wide-notes{
  width:190px;
  text-align:left!important;
  white-space:normal;
  word-break:break-word;
}

/* INPUTS */

.trip-table input,
.trip-table textarea,
.trip-table select{
  width:100%;
  min-width:70px;
  border:1px solid #cbd5e1;
  padding:5px;
  font-size:10.5px;
  font-weight:700;
  box-sizing:border-box;
  border-radius:6px;
  font-family:inherit;
  background:#fff;
}

.trip-table textarea{
  min-height:45px;
  resize:vertical;
}

.trip-table input:disabled,
.trip-table textarea:disabled,
.trip-table select:disabled{
  background:#f8fafc;
  color:#111827;
  opacity:1;
}

/* DATE GROUP TITLE */

.group-title{
  margin:12px 0 0;
  padding:5px 8px;
  background:#bfdbfe;
  color:#1e3a8a;
  border-top:2px solid #60a5fa;
  border-bottom:2px solid #60a5fa;
  border-radius:8px 8px 0 0;
  font-size:13px;
  font-weight:900;
  text-align:center;
  letter-spacing:.3px;
}

/* ROW COLORS — LIGHT VERSIONS OF TOP SOURCE COLORS */

.row-company td,
.row-company{
  background:linear-gradient(90deg,#f4ecff 0%,#eadcff 100%)!important;
}

.row-individual td,
.row-individual{
  background:linear-gradient(90deg,#e8f4ff 0%,#d9ecff 100%)!important;
}

.row-reserved td,
.row-reserved{
  background:linear-gradient(90deg,#fff2df 0%,#ffe4bd 100%)!important;
}

.row-quote td,
.row-quote{
  background:linear-gradient(90deg,#e9f9ed 0%,#d8f5df 100%)!important;
}

.row-shared td,
.row-shared{
  box-shadow:inset 4px 0 0 rgba(124,58,237,.42);
}

.trip-table tbody tr td{
  border-bottom:3px solid #000;
}

/* CELL BOXES - FOR STOPS / NOTES / ADDRESSES IF JS USES THEM */

.cell-box{
  display:grid;
  border:1px solid #111;
  background:#fff;
  width:100%;
  box-sizing:border-box;
  border-radius:4px;
  overflow:hidden;
}

.cell-item{
  padding:4px 5px;
  min-height:22px;
  font-weight:700;
  white-space:normal;
  word-break:break-word;
  box-sizing:border-box;
  background:#fff;
  font-size:10.5px;
}

.cell-item + .cell-item{
  border-top:1px solid #111;
}

/* ACTIONS */

.actions{
  display:flex;
  gap:6px;
  justify-content:center;
  align-items:center;
  flex-wrap:wrap;
}

.btn{
  border:none;
  padding:5px 9px;
  border-radius:7px;
  cursor:pointer;
  font-size:11px;
  font-weight:900;
}

.btn-edit{
  background:#2563eb;
  color:#fff;
}

.btn-delete{
  background:#dc2626;
  color:#fff;
}

.btn-disable{
  background:#f59e0b;
  color:#fff;
}

.dispatch-check:checked{
  accent-color:#16a34a;
}

/* STOPS */

.add-stop{
  background:#facc15;
  border:none;
  padding:4px 7px;
  cursor:pointer;
  border-radius:6px;
  font-size:11px;
  font-weight:900;
  margin-top:4px;
}

.stop-row{
  display:flex;
  align-items:center;
  gap:5px;
  margin-bottom:3px;
}

.stop-remove{
  cursor:pointer;
  color:#dc2626;
  font-weight:900;
}

/* AUTOCOMPLETE */

.input-wrap{
  position:relative;
  width:100%;
}

.suggestions{
  position:absolute;
  top:100%;
  left:0;
  right:0;
  background:#fff;
  border:1px solid #cbd5e1;
  border-radius:10px;
  z-index:99999;
  max-height:220px;
  overflow:auto;
  box-shadow:0 12px 24px rgba(0,0,0,.15);
  margin-top:4px;
  text-align:left;
}

.option{
  padding:10px 12px;
  cursor:pointer;
  font-size:13px;
  line-height:1.35;
  border-bottom:1px solid #eef2f7;
  background:#fff;
  color:#111827;
}

.option:last-child{
  border-bottom:none;
}

.option:hover{
  background:#eff6ff;
}

.option.disabled{
  background:#f8fafc;
  color:#64748b;
  cursor:default;
}

/* EMPTY */

.no-data{
  background:#fff;
  padding:18px;
  border-radius:14px;
  box-shadow:0 6px 16px rgba(15,23,42,.08);
  color:#475569;
  font-weight:900;
}

/* RESPONSIVE */

@media(max-width:1200px){
  .page-body{
    padding-left:15px;
    padding-right:15px;
  }

  .trip-table{
    min-width:1560px;
  }

  .stats-grid{
    grid-template-columns:repeat(auto-fit,minmax(125px,1fr));
  }

  .service-strip{
    grid-template-columns:repeat(auto-fit,minmax(105px,1fr));
  }

  .service-card{
    min-height:72px;
    padding:7px 6px;
  }

  .stat-value{
    font-size:21px;
  }
}

@media(max-width:768px){
  .page-head{
    min-height:62px;
    margin:0 -10px 12px;
    padding:7px 12px;
  }

  .page-title{
    font-size:21px;
  }

  .page-sub{
    font-size:10px;
  }

  .page-body{
    padding-top:185px;
    padding-left:10px;
    padding-right:10px;
  }

  .admin-trips-top{
    top:0;
  }

  .trip-table{
    min-width:1560px;
  }

  .trip-table th,
  .trip-table td{
    font-size:10px;
    padding:4px;
  }

  .trip-table th{
    font-size:10px;
  }

  .cell-item{
    font-size:9.5px;
    padding:3px 4px;
  }

  .col-address,
  .address-col,
  .pickup-col,
  .dropoff-col,
  .wide-address,
  .col-stops,
  .stops-col,
  .wide-stops{
    font-size:9.5px!important;
  }

  .stats-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:6px;
  }

  .stat-card{
    padding:8px 6px;
    border-radius:12px;
  }

  .stat-label{
    font-size:10px;
  }

  .stat-value{
    font-size:20px;
  }

  .service-strip{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:6px;
  }

  .service-card{
    min-height:66px;
  }

  .select-btn{
    font-size:11px;
    padding:7px 10px;
  }
}
</style>
</head>

<body>

<div id="adminHeader"></div>

<div class="page-body">

  <div class="page-head">
    <div>
      <h1 class="page-title">Trips</h1>
      <div class="page-sub">Dispatch selection and trip management</div>
    </div>
  </div>

  <div class="admin-trips-top">

    <div id="statsCards" class="stats-grid"></div>

    <div id="serviceCards" class="service-strip"></div>

    <div class="selection-bar">
      <button id="selectAllBtn" class="select-btn" type="button" onclick="toggleSelectAll()">Select All</button>
      <button id="selectTodayBtn" class="select-btn" type="button" onclick="toggleSelectToday()">Select Today</button>
      <button id="selectTomorrowBtn" class="select-btn" type="button" onclick="toggleSelectTomorrow()">Select Tomorrow</button>
    </div>

  </div>

  <div id="tripsContainer"></div>

</div>

<script src="/admin/header.js"></script>
<script src="/admin/trips.js"></script>

</body>
</html>