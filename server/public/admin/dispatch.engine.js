/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}
let map = null
let markers = []
let geoCache = {}
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
    _id: String(d._id || ""),
    address:
      d.address ||
      d.homeAddress ||
      d.currentAddress ||
      d.locationAddress ||
      d.city ||
      ""
  }))

  trips = tripsRaw.map(t => ({
    ...t,
    _id: String(t._id || ""),
    selected: false,
    driverId: t.driverId ? String(t.driverId) : ""
  }))

  schedule = scheduleRaw || {}

  loadGeoCache()
  await prepareGeo()
  await autoAssign()

  sortTrips()
  renderTrips()
  initMap()
  renderDrivers()
  bindTabs()

  setInterval(() => {
    renderTrips()
    renderDrivers()
  }, 60000)

  console.log("drivers:", drivers)
  console.log("trips:", trips)
  console.log("schedule:", schedule)
}

/* ================= CACHE ================= */

function loadGeoCache(){
  try{
    const saved = localStorage.getItem("dispatch_geo_cache")
    if(saved){
      geoCache = JSON.parse(saved) || {}
    }
  }catch(e){
    geoCache = {}
  }
}

function saveGeoCache(){
  try{
    localStorage.setItem("dispatch_geo_cache", JSON.stringify(geoCache))
  }catch(e){}
}

/* ================= HELPERS ================= */

function showToast(msg){
  const toast = document.getElementById("toast")
  if(!toast) return
  toast.textContent = msg
  toast.classList.add("show")
  clearTimeout(showToast._timer)
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 1800)
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
  const dateStr = String(t.tripDate || "").trim()
  const timeStr = String(t.tripTime || "").trim()

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

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function normalizeDateKey(dateStr){
  if(!dateStr) return ""

  const d = new Date(dateStr)
  if(isNaN(d.getTime())) return ""

  const m = d.getMonth() + 1
  const day = d.getDate()

  return `${m}/${day}`
}

/* ================= TIME STATUS ================= */

function getTripStatus(t){
  const ts = getTripDateTimeValue(t)
  if(!ts) return ""

  const diffMin = Math.round((Date.now() - ts) / 60000)

  // بعد ساعة تختفي
  if(diffMin >= 60){
    return "hide"
  }

  // أول ما يجي وقتها تبقى حمرا
  if(diffMin >= 0){
    return "expired"
  }

  // قبلها بساعة ونص
  if(diffMin >= -90){
    return "trip-soon"
  }

  // قبلها بنص ساعة
  if(diffMin >= -30){
    return "trip-urgent"
  }

  return ""
}

/* ================= ACTIVE DRIVER CHECK ================= */

function isDriverActiveOnDate(driverId, tripDate){
  const s = schedule[String(driverId)]

  if(!s) return true
  if(s.enabled === false) return false
  if(!tripDate) return true

  const days = s.days || {}

  if(!Object.keys(days).length){
    return true
  }

  const key = normalizeDateKey(tripDate)

  return !!days[key]
}

function getValidDriversForTrip(trip){
  const valid = drivers.filter(d => isDriverActiveOnDate(d._id, trip.tripDate))
  if(!valid.length) return drivers
  return valid
}

function getActiveDriversForPanel(){
  const tripDates = [...new Set(
    trips
      .map(t => String(t.tripDate || "").trim())
      .filter(Boolean)
  )]

  const active = drivers.filter(d => {
    return tripDates.some(date => isDriverActiveOnDate(d._id, date))
  })

  if(!active.length) return drivers
  return active
}

/* ================= SMART TIME CHECK ================= */

function hasTimeConflict(driverId, trip){
  const sameDayTrips = trips.filter(t =>
    String(t.driverId || "") === String(driverId) &&
    String(t._id || "") !== String(trip._id || "") &&
    String(t.tripDate || "") === String(trip.tripDate || "")
  )

  const tripTs = getTripDateTimeValue(trip)
  if(!tripTs) return false

  for(const t of sameDayTrips){
    const tTs = getTripDateTimeValue(t)
    if(!tTs) continue

    const diff = Math.abs(tTs - tripTs) / 60000

    if(diff < 30){
      return true
    }
  }

  return false
}

/* ================= SMART START ================= */

function getSmartStartAddress(driver){
  const sch = schedule[String(driver._id)] || {}

  if(driver.liveAddress) return driver.liveAddress
  if(driver.currentAddress) return driver.currentAddress
  if(driver.locationAddress) return driver.locationAddress

  const lastTrip = getLatestTripForDriver(driver._id)
  if(lastTrip && lastTrip.dropoff){
    return lastTrip.dropoff
  }

  if(sch.address) return sch.address

  return driver.address || ""
}

/* ================= GEO ================= */

async function geocode(addr){
  if(!addr) return null

  const key = String(addr).trim().toLowerCase()
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
    saveGeoCache()
    return point
  }catch(e){
    console.log("GEOCODE ERROR", e)
    return null
  }
}

async function prepareGeo(){
  // حضر جيو السواقين مرة واحدة
  for(const d of drivers){
    const startAddress = getSmartStartAddress(d)
    d._geo = await geocode(startAddress)
  }

  // حضر جيو التريبات مرة واحدة
  for(const t of trips){
    t._geo = await geocode(t.pickup)
  }
}

/* ================= FAST DISTANCE ================= */

function fastDistance(a, b){
  if(!a || !b) return 999999

  const dx = a.lat - b.lat
  const dy = a.lng - b.lng

  return (dx * dx) + (dy * dy)
}

function getFallbackLocalScore(startAddress, pickupAddress){
  const start = String(startAddress || "").toLowerCase()
  const pickup = String(pickupAddress || "").toLowerCase()

  let distanceScore = 999999

  const cities = ["chandler","tempe","mesa","gilbert","phoenix","scottsdale"]

  for(const city of cities){
    if(start.includes(city) && pickup.includes(city)){
      distanceScore = 1
      break
    }
  }

  if(start && pickup){
    if(start.includes(pickup) || pickup.includes(start)){
      distanceScore = 0
    }
  }

  return distanceScore
}

/* ================= SMART AUTO ASSIGN ================= */

async function autoAssign(){
  if(!drivers.length) return

  sortTrips()

  for(const trip of trips){
    if(trip.driverId) continue

    let validDrivers = getValidDriversForTrip(trip)
    if(!validDrivers.length){
      validDrivers = drivers
    }

    let bestDriver = null
    let bestScore = Infinity

    for(const driver of validDrivers){
      if(hasTimeConflict(driver._id, trip)) continue

      const startAddress = getSmartStartAddress(driver)
      const startPoint = driver._geo
      const pickupPoint = trip._geo

      let distanceScore = 999999

      if(startPoint && pickupPoint){
        distanceScore = fastDistance(startPoint, pickupPoint)
      }else{
        distanceScore = getFallbackLocalScore(startAddress, trip.pickup)
      }

      const tripCount = getDriverTripsCount(driver._id)

      // نفس الشارع ياخد boost
      let boost = 0
      const startText = String(startAddress || "").toLowerCase()
      const pickupText = String(trip.pickup || "").toLowerCase()

      if(startText && pickupText){
        if(startText.includes(pickupText) || pickupText.includes(startText)){
          boost -= 100
        }

        const importantWords = ["knox","main","broadway","university","apache","dobson","alma school"]
        for(const w of importantWords){
          if(startText.includes(w) && pickupText.includes(w)){
            boost -= 25
          }
        }
      }

      const finalScore =
        (distanceScore * 1000) +
        (tripCount * 10) +
        boost

      if(finalScore < bestScore){
        bestScore = finalScore
        bestDriver = driver
      }
    }

    if(!bestDriver && validDrivers.length){
      bestDriver = validDrivers[0]
    }

    if(bestDriver){
      trip.driverId = String(bestDriver._id)
      trip.vehicle = trip.vehicle || getDriverCar(bestDriver._id)
    }else{
      trip.driverId = ""
      trip.vehicle = ""
    }
  }
}

/* ================= RENDER TRIPS ================= */

function renderTrips(){
  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((t, i) => {
    const status = getTripStatus(t)
    if(status === "hide") return

    const stops = getStops(t)
    const validDrivers = getValidDriversForTrip(t)

    body.innerHTML += `
      <tr class="${status}">
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
  const mapEl = document.getElementById("map")
  if(!mapEl) return
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
  if(!map) return
  markers.forEach(m => {
    try{ map.removeLayer(m) }catch(e){}
  })
  markers = []
}

/* ================= SIMPLE ROUTE FOR MAP ONLY ================= */

async function getRoute(points){
  if(points.length < 2) return null

  try{
    const coords = points.map(p => `${p.lng},${p.lat}`).join(";")
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
    const data = await res.json()

    if(!data.routes || !data.routes.length) return null

    const r = data.routes[0]

    return {
      coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
      distance: (r.distance / 1609.34).toFixed(1),
      duration: Math.round(r.duration / 60)
    }
  }catch(e){
    console.log("ROUTE ERROR", e)
    return null
  }
}

/* ================= DRIVER CLICK ================= */

async function focusDriver(id){
  if(!map) return

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
  if(!panel) return

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
  const btn = document.getElementById("editBtn")
  if(btn){
    btn.innerText = editMode ? "Save" : "Edit Selected"
  }
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

    if(hasTimeConflict(id, trip)){
      showToast("Driver has time conflict")
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

async function redistribute(){
  const selected = trips.filter(t => t.selected)

  if(!selected.length){
    showToast("Select trips first")
    return
  }

  selected.forEach(t => {
    t.driverId = ""
    t.vehicle = ""
  })

  // حدث start geo بعد ما الرحلات اتغيرت
  await prepareGeo()
  await autoAssign()
  renderTrips()
  renderDrivers()
  showToast("Trips redistributed")
}

/* ================= TABS ================= */

function bindTabs(){
  const tabTrips = document.getElementById("tabTrips")
  const tabDrivers = document.getElementById("tabDrivers")
  const tripsPage = document.getElementById("tripsPage")
  const driversPage = document.getElementById("driversPage")

  if(!tabTrips || !tabDrivers || !tripsPage || !driversPage) return

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