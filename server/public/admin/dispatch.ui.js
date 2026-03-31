<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dispatch</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>

<style>
body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#f1f5f9;
}

.page-body{
  padding:15px 20px;
  min-height:100vh;
}

.dispatch-tabs{
  display:flex;
  gap:8px;
  margin-bottom:8px;
}

.tab-btn{
  flex:1;
  padding:14px;
  border:none;
  background:#1e293b;
  color:#fff;
  font-weight:bold;
  cursor:pointer;
  border-radius:8px;
  transition:.2s;
}

.tab-btn.active{
  background:#2563eb;
}

.top-actions{
  margin:12px 0;
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}

.btn{
  padding:9px 13px;
  border:none;
  color:#fff;
  cursor:pointer;
  border-radius:7px;
  font-weight:bold;
  transition:.2s;
}

.btn:hover{
  transform:translateY(-1px);
}

.blue{background:#2563eb}
.orange{background:#f97316}
.green{background:#16a34a}
.purple{background:#7c3aed}
.gray{background:#475569}
.red{background:#dc2626}

.table-wrap{
  background:#fff;
  border-radius:10px;
  overflow:auto;
  box-shadow:0 4px 18px rgba(15,23,42,.08);
}

table{
  width:100%;
  min-width:1200px;
  border-collapse:collapse;
}

th{
  background:#1e293b;
  color:#fff;
  padding:10px 8px;
  font-size:12px;
  text-align:left;
  white-space:nowrap;
}

td{
  border:1px solid #e5e7eb;
  padding:8px 7px;
  font-size:12px;
  vertical-align:top;
}

tbody tr:hover{
  background:#f8fafc;
}

.tab-page{display:none}
.tab-page.active{display:block}

.drivers-layout{
  display:flex;
  gap:10px;
  height:80vh;
}

#map{
  width:70%;
  border-radius:10px;
  box-shadow:0 4px 18px rgba(15,23,42,.08);
  background:#e5e7f0;
}

#driversPanel{
  width:30%;
  background:#0f172a;
  color:#fff;
  border-radius:10px;
  overflow:auto;
  box-shadow:0 4px 18px rgba(15,23,42,.12);
}

.panel-header{
  padding:12px;
  font-weight:bold;
  background:#111827;
  border-bottom:1px solid #1f2937;
  position:sticky;
  top:0;
}

.driver{
  padding:12px;
  border-bottom:1px solid #1e293b;
  cursor:pointer;
  transition:.2s;
}

.driver:hover{
  background:#1e293b;
}

.driver.active{
  background:linear-gradient(90deg,#2563eb,#1d4ed8);
  color:#fff;
}

.driver.active .driver-name{
  color:#facc15;
}

.driver-bar{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:10px;
  font-size:13px;
}

.driver-name{font-weight:bold}

.driver-right{
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  gap:6px;
}

.driver-info{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  justify-content:flex-end;
  font-size:12px;
}

.driver-meta{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  justify-content:flex-end;
}

.badge{
  display:inline-flex;
  align-items:center;
  gap:4px;
  padding:3px 8px;
  border-radius:999px;
  font-size:11px;
  font-weight:700;
  white-space:nowrap;
}

.badge-available{background:#166534;color:#ecfdf5}
.badge-busy{background:#991b1b;color:#fef2f2}
.badge-trip{background:#1d4ed8;color:#eff6ff}
.badge-count{background:#334155;color:#e2e8f0}

.stop-list{
  line-height:1.45;
  min-width:140px;
}

.notes-cell{
  min-width:120px;
  white-space:pre-wrap;
}

.trip-urgent{
  background:#fff7ed !important;
}

.trip-soon{
  background:#fefce8 !important;
}

.expired{
  background:#f8fafc !important;
  opacity:.85;
}

.send-btn[disabled],
select:disabled{
  opacity:.6;
  cursor:not-allowed;
}

#toast{
  position:fixed;
  bottom:20px;
  right:20px;
  background:#111827;
  color:#fff;
  padding:10px 14px;
  border-radius:8px;
  box-shadow:0 8px 20px rgba(0,0,0,.18);
  display:none;
  z-index:9999;
}

#toast.show{
  display:block;
}

@media (max-width: 900px){
  .page-body{
    padding:10px;
  }

  .drivers-layout{
    flex-direction:column;
    height:auto;
  }

  #map{
    width:100%;
    height:320px;
  }

  #driversPanel{
    width:100%;
    height:420px;
  }

  .top-actions{
    gap:8px;
  }

  .btn{
    flex:1 1 calc(50% - 8px);
    text-align:center;
  }
}
</style>
</head>
<body>

<div class="page-body">

  <div class="dispatch-tabs">
    <button class="tab-btn active" id="tabTrips">Trips</button>
    <button class="tab-btn" id="tabDrivers">Drivers Map</button>
  </div>

  <div class="tab-page active" id="tripsPage">
    <div class="top-actions">
      <button class="btn blue" id="selectBtn" onclick="toggleSelect()">Select All</button>
      <button class="btn orange" id="editBtn" onclick="toggleEdit()">Edit Selected</button>
      <button class="btn green" onclick="sendSelected()">Send Selected</button>
      <button class="btn purple" onclick="redistribute()">Redistribute</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Select</th>
            <th>#</th>
            <th>Client</th>
            <th>Pickup</th>
            <th>Stops</th>
            <th>Dropoff</th>
            <th>Date</th>
            <th>Time</th>
            <th>Driver</th>
            <th>Car</th>
            <th>Notes</th>
            <th>Send</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>

  <div class="tab-page" id="driversPage">
    <div class="drivers-layout">
      <div id="map"></div>
      <div id="driversPanel">
        <div class="panel-header">Drivers Dispatch Panel</div>
      </div>
    </div>
  </div>

</div>

<div id="toast"></div>

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script>
/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}

let map = null
let markers = []
let routeLayer = null

let editMode = false
let allSelected = false
let selectedDriverId = null
let selectedTripIndexPerDriver = {}

/* ================= LOAD ================= */

async function loadData(){
  try{
    const res = await fetch("/api/dispatch")
    const data = await res.json()

    if(!res.ok){
      throw new Error(data?.message || "Dispatch load failed")
    }

    drivers = (data.drivers || []).map(d => ({
      ...d,
      _id: String(d._id || d.id || "")
    }))

    schedule = data.schedule || {}

    trips = (data.trips || []).map(t => ({
      ...t,
      _id: String(t._id || ""),
      driverId: String(t.driverId || ""),
      selected: false
    }))

    sortTrips()
    renderTrips()
    initMap()
    renderDrivers()
    bindTabs()
  }catch(err){
    console.log("LOAD ERROR:", err)
    showToast("Load error")
  }
}

/* ================= HELPERS ================= */

function showToast(msg){
  const toast = document.getElementById("toast")
  toast.textContent = msg
  toast.classList.add("show")
  clearTimeout(showToast._timer)
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show")
  }, 1800)
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;")
}

function getStops(t){
  if(Array.isArray(t.stops)) return t.stops.filter(Boolean)
  return []
}

function getDriverCar(id){
  const d = drivers.find(x => String(x._id) === String(id))
  if(d?.vehicleNumber) return d.vehicleNumber

  const s = schedule[String(id)]
  if(!s) return ""

  return s.vehicleNumber || s.carNumber || s.car || ""
}

function getTripDateTimeValue(t){
  const dateStr = String(t.tripDate || "").trim()
  const timeStr = String(t.tripTime || "").trim()

  if(!dateStr) return 0

  const iso = new Date(`${dateStr}T${timeStr || "00:00"}`)
  if(!isNaN(iso.getTime())) return iso.getTime()

  const basic = new Date(`${dateStr} ${timeStr}`)
  if(!isNaN(basic.getTime())) return basic.getTime()

  return 0
}

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function getCurrentArizonaNow(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  ).getTime()
}

function getTripStatus(t){
  const ts = getTripDateTimeValue(t)
  if(!ts) return ""

  const diffMin = Math.round((getCurrentArizonaNow() - ts) / 60000)

  if(diffMin >= 120) return "hide"
  if(diffMin >= 0) return "expired"
  if(diffMin >= -30) return "trip-urgent"
  if(diffMin >= -90) return "trip-soon"

  return ""
}

function getVisibleTrips(){
  return trips.filter(t => getTripStatus(t) !== "hide")
}

function syncSelectButtonText(){
  const visibleTrips = getVisibleTrips()
  const selectedCount = visibleTrips.filter(t => t.selected).length
  const btn = document.getElementById("selectBtn")

  if(!btn) return

  if(visibleTrips.length && selectedCount === visibleTrips.length){
    allSelected = true
    btn.innerText = "Remove All"
  }else{
    allSelected = false
    btn.innerText = "Select All"
  }
}

/* ================= RENDER TRIPS ================= */

function renderTrips(){
  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((trip, index) => {
    const statusClass = getTripStatus(trip)
    if(statusClass === "hide") return

    const stops = getStops(trip)
    const currentDriverId = String(trip.driverId || "")

    let driverOptions = `<option value="">Select</option>`
    drivers.forEach(d => {
      driverOptions += `
        <option value="${escapeHtml(d._id)}" ${currentDriverId === String(d._id) ? "selected" : ""}>
          ${escapeHtml(d.name || "")}
        </option>
      `
    })

    const row = document.createElement("tr")
    row.className = `trip-row ${statusClass}`

    row.innerHTML = `
      <td>
        <button class="btn ${trip.selected ? "green" : "blue"}" onclick="toggleTrip(${index})">
          ${trip.selected ? "✔" : "Select"}
        </button>
      </td>
      <td>${escapeHtml(trip.tripNumber || "")}</td>
      <td>${escapeHtml(trip.clientName || "")}</td>
      <td>${escapeHtml(trip.pickup || "")}</td>
      <td class="stop-list">${stops.length ? stops.map(s => escapeHtml(s)).join("<br>") : "-"}</td>
      <td>${escapeHtml(trip.dropoff || "")}</td>
      <td>${escapeHtml(trip.tripDate || "")}</td>
      <td>${escapeHtml(trip.tripTime || "")}</td>
      <td>
        <select id="driver-${trip._id}" ${(editMode && trip.selected) ? "" : "disabled"}>
          ${driverOptions}
        </select>
      </td>
      <td id="car-${trip._id}">${escapeHtml(trip.vehicle || getDriverCar(currentDriverId) || "")}</td>
      <td class="notes-cell">${escapeHtml(trip.notes || "")}</td>
      <td>
        <button class="btn green send-btn" onclick="sendOne('${trip._id}')">
          Send
        </button>
      </td>
    `

    body.appendChild(row)
  })

  syncSelectButtonText()
}

/* ================= DRIVER ASSIGN ================= */

async function saveDriverAssignment(tripId, driverId){
  const res = await fetch(`/api/dispatch/${tripId}/driver`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId })
  })

  const data = await res.json().catch(() => ({}))

  if(!res.ok){
    throw new Error(data?.message || "Driver assign failed")
  }

  return data
}

async function assignDriver(tripId){
  const trip = trips.find(t => String(t._id) === String(tripId))
  if(!trip) return false

  const select = document.getElementById(`driver-${tripId}`)
  if(!select){
    showToast("Driver select not found")
    return false
  }

  const driverId = String(select.value || "").trim()

  if(!driverId){
    showToast("Choose driver first")
    return false
  }

  try{
    const updated = await saveDriverAssignment(tripId, driverId)
    const d = drivers.find(x => String(x._id) === driverId)

    trip.driverId = String(updated.driverId || driverId)
    trip.driverName = updated.driverName || d?.name || ""
    trip.vehicle = updated.vehicle || getDriverCar(driverId)
    trip.driverAddress = updated.driverAddress || ""
    trip.status = updated.status || trip.status

    const carCell = document.getElementById(`car-${tripId}`)
    if(carCell){
      carCell.textContent = trip.vehicle || ""
    }

    renderDrivers()
    return true
  }catch(err){
    console.log("ASSIGN ERROR:", err)
    showToast(err.message || "Driver assign failed")
    return false
  }
}

/* ================= ACTIONS ================= */

function toggleTrip(i){
  if(!trips[i]) return
  trips[i].selected = !trips[i].selected
  renderTrips()
}

function toggleSelect(){
  allSelected = !allSelected
  getVisibleTrips().forEach(t => {
    t.selected = allSelected
  })
  renderTrips()
}

function toggleEdit(){
  editMode = !editMode
  const btn = document.getElementById("editBtn")
  if(btn){
    btn.innerText = editMode ? "Save" : "Edit Selected"
  }
  renderTrips()
}

async function sendOne(tripId){
  const trip = trips.find(t => String(t._id) === String(tripId))
  if(!trip) return

  const ok = await assignDriver(tripId)
  if(!ok) return

  try{
    const res = await fetch("/api/dispatch/send", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [tripId] })
    })

    const data = await res.json().catch(() => ({}))

    if(!res.ok){
      showToast(data?.message || "Send failed")
      return
    }

    trip.status = "Dispatched"
    trip.selected = false

    renderTrips()
    renderDrivers()
    showToast("Trip sent")
  }catch(err){
    console.log("SEND ONE ERROR:", err)
    showToast("Send failed")
  }
}

async function sendSelected(){
  const selected = trips.filter(t => t.selected)

  if(!selected.length){
    showToast("No trips selected")
    return
  }

  const ids = []

  for(const trip of selected){
    const ok = await assignDriver(trip._id)
    if(!ok) return
    ids.push(trip._id)
  }

  try{
    const res = await fetch("/api/dispatch/send", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    })

    const data = await res.json().catch(() => ({}))

    if(!res.ok){
      showToast(data?.message || "Send failed")
      return
    }

    selected.forEach(t => {
      t.selected = false
      t.status = "Dispatched"
    })

    renderTrips()
    renderDrivers()
    showToast(`${selected.length} trip(s) sent`)
  }catch(err){
    console.log("SEND SELECTED ERROR:", err)
    showToast("Send failed")
  }
}

async function redistribute(){
  showToast("Redistribute later")
}

/* ================= MAP / DRIVERS ================= */

function initMap(){
  if(map) return

  map = L.map("map").setView([33.4484, -112.0740], 10)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map)
}

function clearMap(){
  markers.forEach(m => {
    try{ map.removeLayer(m) }catch(e){}
  })
  markers = []

  if(routeLayer){
    try{ map.removeLayer(routeLayer) }catch(e){}
    routeLayer = null
  }
}

function getCurrentDriverTrips(driverId){
  return trips
    .filter(t => String(t.driverId || "") === String(driverId))
    .sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function getDriverTripsCount(driverId){
  return getCurrentDriverTrips(driverId).length
}

function getDriverStatus(driverId){
  return getDriverTripsCount(driverId) > 0 ? "Busy" : "Available"
}

function renderDrivers(){
  const panel = document.getElementById("driversPanel")
  if(!panel) return

  panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`

  drivers.forEach((d, i) => {
    const tripsCount = getDriverTripsCount(d._id)
    const status = getDriverStatus(d._id)
    const statusClass = status === "Busy" ? "badge-busy" : "badge-available"

    const div = document.createElement("div")
    div.className = `driver ${selectedDriverId === d._id ? "active" : ""}`
    div.dataset.id = d._id

    div.innerHTML = `
      <div class="driver-bar">
        <div class="driver-name">${i + 1} - ${escapeHtml(d.name || "")}</div>
        <div class="driver-right">
          <div class="driver-info">
            <span>🚗 ${escapeHtml(d.vehicleNumber || "")}</span>
            <span>📦 ${tripsCount} Trips</span>
          </div>
          <div class="driver-meta">
            <span class="badge ${statusClass}">${escapeHtml(status)}</span>
            <span class="badge badge-count">${tripsCount} Trips</span>
            <span class="badge badge-trip">ETA Map</span>
          </div>
        </div>
      </div>
    `

    div.addEventListener("click", () => {
      selectedDriverId = d._id
      renderDrivers()
      focusDriver(d._id)
    })

    panel.appendChild(div)
  })
}

function focusDriver(driverId){
  if(!map) return

  clearMap()

  const driver = drivers.find(d => String(d._id) === String(driverId))
  if(!driver) return

  const lat = Number(driver.lat)
  const lng = Number(driver.lng)

  if(Number.isFinite(lat) && Number.isFinite(lng)){
    const marker = L.marker([lat, lng]).addTo(map).bindPopup(driver.name || "Driver")
    markers.push(marker)
    map.setView([lat, lng], 11)
  }
}

/* ================= TABS ================= */

function bindTabs(){
  const tabTrips = document.getElementById("tabTrips")
  const tabDrivers = document.getElementById("tabDrivers")
  const tripsPage = document.getElementById("tripsPage")
  const driversPage = document.getElementById("driversPage")

  tabTrips.onclick = () => {
    tripsPage.classList.add("active")
    driversPage.classList.remove("active")
    tabTrips.classList.add("active")
    tabDrivers.classList.remove("active")
  }

  tabDrivers.onclick = () => {
    tripsPage.classList.remove("active")
    driversPage.classList.add("active")
    tabTrips.classList.remove("active")
    tabDrivers.classList.add("active")

    setTimeout(() => {
      if(map) map.invalidateSize()
    }, 250)
  }
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", loadData)
</script>

</body>
</html>