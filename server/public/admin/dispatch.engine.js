/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}
let map = null
let markers = []
let geoCache = {}
let routeCache = {}
let editMode = false
let allSelected = false
let selectedDriverId = null

/* ================= INIT ================= */

async function init(){
  const data = await Store.load()

  const driversRaw = data.drivers || data.data?.drivers || []
  const tripsRaw = data.trips || data.data?.trips || []
  const scheduleRaw = data.schedule || data.data?.schedule || {}

  drivers = driversRaw.map(d => ({
    ...d,
    _id: String(d._id || "")
  }))

  trips = tripsRaw.map(t => ({
    ...t,
    _id: String(t._id || ""),
    selected: false,
    driverId: t.driverId ? String(t.driverId) : ""
  }))

  schedule = scheduleRaw || {}

  autoAssign()
  sortTrips()
  renderTrips()
  initMap()
  renderDrivers()
  bindTabs()

  console.log("drivers:", drivers)
  console.log("trips:", trips)
  console.log("schedule:", schedule)
}

/* ================= HELPERS ================= */

function showToast(msg){
  const toast = document.getElementById("toast")
  toast.textContent = msg
  toast.classList.add("show")
  clearTimeout(showToast._timer)
  showToast._timer = setTimeout(()=>toast.classList.remove("show"), 1800)
}

function getStops(t){
  if (Array.isArray(t.stops)) return t.stops.filter(Boolean)
  if (Array.isArray(t.stopAddresses)) return t.stopAddresses.filter(Boolean)
  if (Array.isArray(t.extraStops)) return t.extraStops.filter(Boolean)
  if (typeof t.stop === "string" && t.stop.trim()) return [t.stop.trim()]
  return []
}

function getDriverCar(id){
  const s = schedule[String(id)]
  if (!s) return ""
  return s.carNumber || s.vehicleNumber || s.car || ""
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function syncSelectButtonText(){
  const selectedCount = trips.filter(t => t.selected).length
  const btn = document.getElementById("selectBtn")
  if(!btn) return

  if(trips.length && selectedCount === trips.length){
    allSelected = true
    btn.innerText = "Remove All"
  }else{
    allSelected = false
    btn.innerText = "Select All"
  }
}

function getTripDateTimeValue(t){
  const dateStr = (t.tripDate || "").trim()
  const timeStr = (t.tripTime || "").trim()

  if(!dateStr) return 0

  const direct = new Date(`${dateStr} ${timeStr}`)
  if(!isNaN(direct.getTime())) return direct.getTime()

  const dateOnly = new Date(dateStr)
  if(!isNaN(dateOnly.getTime())) return dateOnly.getTime()

  return 0
}

function getLatestTripForDriver(driverId){
  const driverTrips = trips.filter(t => String(t.driverId || "") === String(driverId))
  if(!driverTrips.length) return null
  driverTrips.sort((a,b)=> getTripDateTimeValue(b) - getTripDateTimeValue(a))
  return driverTrips[0]
}

function getDriverTripsCount(driverId){
  return trips.filter(t => String(t.driverId || "") === String(driverId)).length
}

function getDriverStatus(driverId){
  return getDriverTripsCount(driverId) > 0 ? "Busy" : "Available"
}

function getTripRowClass(t){
  const ts = getTripDateTimeValue(t)
  if(!ts) return ""

  const diffMin = Math.round((ts - Date.now()) / 60000)

  if(diffMin <= 30) return "trip-urgent"
  if(diffMin <= 90) return "trip-soon"
  return ""
}

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

/* ================= ACTIVE DRIVER CHECK ================= */

function isDriverActiveOnDate(driverId, tripDate){
  const s = schedule[String(driverId)]

  if(!s) return false
  if(s.enabled === false) return false
  if(!tripDate) return false

  const days = s.days || {}

  return !!days[String(tripDate).trim()]
}

function getValidDriversForTrip(trip){
  return drivers.filter(d => isDriverActiveOnDate(d._id, trip.tripDate))
}

function getActiveDriversForPanel(){
  const tripDates = [...new Set(
    trips
      .map(t => String(t.tripDate || "").trim())
      .filter(Boolean)
  )]

  return drivers.filter(d => {
    return tripDates.some(date => isDriverActiveOnDate(d._id, date))
  })
}

/* ================= AUTO ASSIGN ================= */

function autoAssign(){
  if(!drivers.length) return

  trips.forEach(t => {
    if(!t.driverId){
      const validDrivers = getValidDriversForTrip(t)

      if(!validDrivers.length){
        t.driverId = ""
        t.vehicle = ""
        return
      }

      validDrivers.sort((a,b)=>{
        const aCount = getDriverTripsCount(a._id)
        const bCount = getDriverTripsCount(b._id)
        if(aCount !== bCount) return aCount - bCount
        return String(a.name || "").localeCompare(String(b.name || ""))
      })

      const d = validDrivers[0]
      t.driverId = String(d._id || "")
      t.vehicle = t.vehicle || getDriverCar(d._id)
    }
  })
}

/* ================= RENDER TRIPS ================= */

function renderTrips(){
  const body = document.getElementById("tbody")
  body.innerHTML = ""

  trips.forEach((t, i) => {
    const stops = getStops(t)
    const rowClass = getTripRowClass(t)
    const validDrivers = getValidDriversForTrip(t)

    body.innerHTML += `
      <tr class="${rowClass}">
        <td>
          <button class="btn ${t.selected ? 'green' : 'blue'} select-btn" onclick="toggleTrip(${i})">
            ${t.selected ? '✔' : 'Select'}
          </button>
        </td>

        <td>${escapeHtml(t.tripNumber || i + 1)}</td>
        <td>${escapeHtml(t.clientName || "")}</td>
        <td>${escapeHtml(t.pickup || "")}</td>

        <td class="stop-list">
          ${stops.length ? stops.map(s => escapeHtml(s)).join("<br>") : "-"}
        </td>

        <td>${escapeHtml(t.dropoff || "")}</td>
        <td>${escapeHtml(t.tripDate || "")}</td>
        <td>${escapeHtml(t.tripTime || "")}</td>

        <td>
          <select ${(editMode && t.selected) ? "" : "disabled"} onchange="assignDriver(${i},this.value)">
            <option value="">--</option>
            ${validDrivers.map(d => `
              <option value="${escapeHtml(d._id)}" ${String(t.driverId || "") === String(d._id || "") ? "selected" : ""}>
                ${escapeHtml(d.name || "")}
              </option>
            `).join("")}
          </select>
        </td>

        <td id="car-${i}">${escapeHtml(t.vehicle || getDriverCar(t.driverId) || "")}</td>
        <td class="notes-cell">${escapeHtml(t.notes || "")}</td>

        <td>
          <button class="btn green send-btn" onclick="sendOne(${i})">Send</button>
        </td>
      </tr>
    `
  })

  syncSelectButtonText()
}

/* ================= MAP ================= */

function initMap(){
  if(map) return

  map = L.map("map").setView([33.4484, -112.0740], 10)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map)

  setTimeout(() => {
    try{ map.invalidateSize() }catch(e){}
  }, 300)
}

function clearMap(){
  markers.forEach(m => {
    try{ map.removeLayer(m) }catch(e){}
  })
  markers = []
}

/* ================= GEO ================= */

async function geocode(addr){
  if(!addr) return null

  const key = String(addr).trim()
  if(!key) return null

  if(geoCache[key]) return geoCache[key]

  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json&limit=1`)
    const data = await res.json()

    if(!Array.isArray(data) || !data.length) return null

    const point = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    }

    geoCache[key] = point
    return point
  }catch(e){
    console.log("GEOCODE ERROR", e)
    return null
  }
}

/* ================= ROUTE ================= */

async function getRoute(points){
  if(points.length < 2) return null

  const cacheKey = points.map(p => `${p.lat},${p.lng}`).join("|")
  if(routeCache[cacheKey]) return routeCache[cacheKey]

  try{
    const coords = points.map(p => `${p.lng},${p.lat}`).join(";")
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
    const data = await res.json()

    if(!data.routes || !data.routes.length) return null

    const r = data.routes[0]

    const route = {
      coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
      distance: (r.distance / 1609.34).toFixed(1),
      duration: Math.round(r.duration / 60)
    }

    routeCache[cacheKey] = route
    return route
  }catch(e){
    console.log("ROUTE ERROR", e)
    return null
  }
}

/* ================= DRIVER CLICK ================= */

async function focusDriver(id){
  const trip = getLatestTripForDriver(id)

  if(!trip){
    showToast("No trip assigned to this driver")
    return
  }

  clearMap()

  const stops = getStops(trip)
  const points = []

  const pickup = await geocode(trip.pickup)
  if(pickup) points.push({ ...pickup, label: "Pickup" })

  for(const s of stops){
    const g = await geocode(s)
    if(g) points.push({ ...g, label: "Stop" })
  }

  const dropoff = await geocode(trip.dropoff)
  if(dropoff) points.push({ ...dropoff, label: "Dropoff" })

  if(points.length < 2){
    showToast("Not enough route points")
    return
  }

  const route = await getRoute(points)
  if(!route){
    showToast("Route not available")
    return
  }

  points.forEach((p, idx) => {
    const label =
      idx === 0
        ? "Pickup"
        : idx === points.length - 1
          ? "Dropoff"
          : `Stop ${idx}`

    const marker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(label)
    markers.push(marker)
  })

  const line = L.polyline(route.coords, { color: "blue", weight: 5 }).addTo(map)
  markers.push(line)

  line.bindPopup(`
    <b>Distance:</b> ${escapeHtml(route.distance)} miles<br>
    <b>ETA:</b> ${escapeHtml(route.duration)} min<br>
    <b>Trip:</b> ${escapeHtml(trip.tripNumber || "-")}
  `).openPopup()

  map.fitBounds(line.getBounds(), { padding: [40, 40] })
}

/* ================= DRIVERS PANEL ================= */

function renderDrivers(){
  const panel = document.getElementById("driversPanel")
  panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`

  const activeDrivers = getActiveDriversForPanel()

  activeDrivers.forEach((d, i) => {
    const car = getDriverCar(d._id)
    const trip = getLatestTripForDriver(d._id)
    const tripsCount = getDriverTripsCount(d._id)
    const status = getDriverStatus(d._id)
    const statusClass = status === "Busy" ? "badge-busy" : "badge-available"

    panel.innerHTML += `
      <div class="driver ${selectedDriverId === d._id ? "active" : ""}" data-id="${escapeHtml(d._id)}">
        <div class="driver-bar">
          <div class="driver-name">${i + 1} - ${escapeHtml(d.name || "")}</div>

          <div class="driver-right">
            <div class="driver-info">
              <span>🚗 ${escapeHtml(car || "-")}</span>
              <span>📦 ${escapeHtml(trip ? (trip.tripNumber || "-") : "-")}</span>
            </div>

            <div class="driver-meta">
              <span class="badge ${statusClass}">${escapeHtml(status)}</span>
              <span class="badge badge-count">${tripsCount} Trip${tripsCount === 1 ? "" : "s"}</span>
              <span class="badge badge-trip">ETA Map</span>
            </div>
          </div>
        </div>
      </div>
    `
  })

  document.querySelectorAll(".driver").forEach(el => {
    el.addEventListener("click", async () => {
      selectedDriverId = el.dataset.id

      document.querySelectorAll(".driver").forEach(d => {
        d.classList.remove("active")
      })

      el.classList.add("active")
      await focusDriver(el.dataset.id)
    })
  })
}

/* ================= ACTIONS ================= */

function toggleTrip(i){
  if(!trips[i]) return
  trips[i].selected = !trips[i].selected
  renderTrips()
}

function toggleSelect(){
  allSelected = !allSelected
  trips.forEach(t => t.selected = allSelected)
  renderTrips()
  showToast(allSelected ? "All trips selected" : "Selection cleared")
}

function toggleEdit(){
  editMode = !editMode
  document.getElementById("editBtn").innerText = editMode ? "Save" : "Edit Selected"
  renderTrips()
  showToast(editMode ? "Edit mode enabled" : "Changes saved")
}

function assignDriver(i, id){
  if(!trips[i]) return

  const trip = trips[i]

  if(id){
    if(!isDriverActiveOnDate(id, trip.tripDate)){
      showToast("Driver not active on this date")
      renderTrips()
      return
    }
  }

  const d = drivers.find(x => String(x._id) === String(id))

  trips[i].driverId = id ? String(id) : ""
  trips[i].vehicle = d ? getDriverCar(d._id) : ""

  const carCell = document.getElementById(`car-${i}`)
  if(carCell){
    carCell.innerText = trips[i].vehicle || ""
  }

  renderTrips()
  renderDrivers()
  showToast("Driver updated")
}

function sendSelected(){
  const selected = trips.filter(t => t.selected)
  console.log("SEND SELECTED", selected)
  showToast(`${selected.length} selected trip(s) ready`)
}

function sendOne(i){
  if(!trips[i]) return
  console.log("SEND ONE", trips[i])
  showToast(`Trip ${trips[i].tripNumber || i + 1} ready`)
}

function redistribute(){
  const selected = trips.filter(t => t.selected)

  if(!selected.length){
    showToast("Select trips first")
    return
  }

  selected.forEach(t => {
    const validDrivers = getValidDriversForTrip(t)

    if(!validDrivers.length){
      t.driverId = ""
      t.vehicle = ""
      return
    }

    validDrivers.sort((a,b)=>{
      const aCount = getDriverTripsCount(a._id)
      const bCount = getDriverTripsCount(b._id)
      if(aCount !== bCount) return aCount - bCount
      return String(a.name || "").localeCompare(String(b.name || ""))
    })

    const d = validDrivers[0]
    t.driverId = String(d._id)
    t.vehicle = getDriverCar(d._id)
  })

  renderTrips()
  renderDrivers()
  showToast("Trips redistributed")
}

/* ================= TABS ================= */

function bindTabs(){
  const tripsBtn = document.getElementById("tabTrips")
  const driversBtn = document.getElementById("tabDrivers")
  const tripsPage = document.getElementById("tripsPage")
  const driversPage = document.getElementById("driversPage")

  if(!tripsBtn || !driversBtn || !tripsPage || !driversPage) return

  tripsBtn.onclick = () => {
    tripsPage.classList.add("active")
    driversPage.classList.remove("active")
    tripsBtn.classList.add("active")
    driversBtn.classList.remove("active")
  }

  driversBtn.onclick = () => {
    tripsPage.classList.remove("active")
    driversPage.classList.add("active")
    tripsBtn.classList.remove("active")
    driversBtn.classList.add("active")

    setTimeout(() => {
      try{ map.invalidateSize() }catch(e){}
    }, 300)
  }
}

/* ================= GLOBAL ================= */

window.toggleTrip = toggleTrip
window.toggleSelect = toggleSelect
window.toggleEdit = toggleEdit
window.assignDriver = assignDriver
window.sendSelected = sendSelected
window.sendOne = sendOne
window.redistribute = redistribute
window.focusDriver = focusDriver

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)