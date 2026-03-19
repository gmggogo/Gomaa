<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dispatch UI Preview</title>

<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>

<style>
/* ===== PAGE STYLING ===== */
body { margin:0; font-family:sans-serif; background:#f1f5f9; }

.page-body{ padding:15px 20px; min-height:100vh; }

.dispatch-tabs{ display:flex; gap:8px; margin-bottom:8px; }
.tab-btn{
  flex:1; padding:14px; border:none; background:#1e293b; color:#fff; font-weight:bold;
  cursor:pointer; border-radius:8px; transition:.2s;
}
.tab-btn.active{ background:#2563eb; }

.top-actions{ margin:12px 0; display:flex; gap:10px; flex-wrap:wrap; }
.btn{ padding:9px 13px; border:none; color:#fff; cursor:pointer; border-radius:7px; font-weight:bold; transition:.2s; }
.btn:hover{ transform:translateY(-1px); }
.blue{background:#2563eb} .orange{background:#f97316} .green{background:#16a34a} .purple{background:#7c3aed} .gray{background:#475569} .red{background:#dc2626}

.table-wrap{ background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 18px rgba(15,23,42,.08); }
table{ width:100%; border-collapse:collapse; }
th{ background:#1e293b; color:#fff; padding:10px 8px; font-size:12px; text-align:left; }
td{ border:1px solid #e5e7eb; padding:8px 7px; font-size:12px; vertical-align:top; }
tbody tr:hover{ background:#f8fafc; }

.tab-page{display:none} .tab-page.active{display:block;}

.drivers-layout{ display:flex; gap:10px; height:80vh; }
#map{ width:70%; border-radius:10px; box-shadow:0 4px 18px rgba(15,23,42,.08); background:#e5e7f0; }
#driversPanel{ width:30%; background:#0f172a; color:#fff; border-radius:10px; overflow:auto; box-shadow:0 4px 18px rgba(15,23,42,.12); }

.panel-header{ padding:12px; font-weight:bold; background:#111827; border-bottom:1px solid #1f2937; position:sticky; top:0; }
.driver{ padding:12px; border-bottom:1px solid #1e293b; cursor:pointer; transition:.2s; }
.driver:hover{ background:#1e293b; }
.driver.active{ background:linear-gradient(90deg,#2563eb,#1d4ed8); color:#fff; }
.driver.active .driver-name{ color:#facc15; }
.driver-bar{ display:flex; justify-content:space-between; align-items:flex-start; gap:10px; font-size:13px; }
.driver-name{ font-weight:bold; }
.driver-right{ display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.driver-info{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; font-size:12px; }
.driver-meta{ display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.badge{ display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
.badge-available{ background:#166534; color:#ecfdf5; }
.badge-busy{ background:#991b1b; color:#fef2f2; }
.badge-trip{ background:#1d4ed8; color:#eff6ff; }
.badge-count{ background:#334155; color:#e2e8f0; }

.stop-list{ line-height:1.45; }
.notes-cell{ min-width:120px; white-space:pre-wrap; }

#toast{ display:none; }
</style>
</head>

<body>

<div class="page-body">

  <!-- TABS -->
  <div class="dispatch-tabs">
    <button class="tab-btn active">Trips</button>
    <button class="tab-btn">Drivers Map</button>
  </div>

  <!-- TRIPS -->
  <div class="tab-page active">
    <div class="top-actions">
      <button class="btn blue">Select All</button>
      <button class="btn orange">Edit Selected</button>
      <button class="btn green">Send Selected</button>
      <button class="btn purple">Redistribute</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Select</th><th>#</th><th>Client</th><th>Pickup</th><th>Stops</th>
            <th>Dropoff</th><th>Date</th><th>Time</th><th>Driver</th><th>Car</th>
            <th>Notes</th><th>Send</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><button class="btn blue">Select</button></td>
            <td>001</td><td>John Doe</td><td>Location A</td><td>Stop1, Stop2</td>
            <td>Location B</td><td>2026-03-19</td><td>21:00</td><td>Driver1</td>
            <td>Car123</td><td>Notes here</td><td><button class="btn green">Send</button></td>
          </tr>
          <tr>
            <td><button class="btn blue">Select</button></td>
            <td>002</td><td>Jane Smith</td><td>Location C</td><td>-</td>
            <td>Location D</td><td>2026-03-19</td><td>22:00</td><td>Driver2</td>
            <td>Car456</td><td>Urgent trip</td><td><button class="btn green">Send</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- DRIVERS -->
  <div class="tab-page">
    <div class="drivers-layout">
      <div id="map">Map Placeholder</div>
      <div id="driversPanel">
        <div class="panel-header">Drivers Dispatch Panel</div>
        <div class="driver active">
          <div class="driver-bar">
            <div class="driver-name">1 - John Doe</div>
            <div class="driver-right">
              <div class="driver-info"><span>🚗 Car123</span><span>📦 2 Trips</span></div>
              <div class="driver-meta">
                <span class="badge badge-available">Available</span>
                <span class="badge badge-count">2 Trips</span>
                <span class="badge badge-trip">ETA Map</span>
              </div>
            </div>
          </div>
        </div>
        <div class="driver">
          <div class="driver-bar">
            <div class="driver-name">2 - Jane Smith</div>
            <div class="driver-right">
              <div class="driver-info"><span>🚗 Car456</span><span>📦 1 Trip</span></div>
              <div class="driver-meta">
                <span class="badge badge-busy">Busy</span>
                <span class="badge badge-count">1 Trip</span>
                <span class="badge badge-trip">ETA Map</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

</div>

</body>
</html>