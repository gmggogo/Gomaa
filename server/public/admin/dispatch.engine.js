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
let selectedTripIndexPerDriver = {}

/* ================= INIT ================= */

async function init(){
  try{
    const data = await Store.load()

    const driversRaw = data.drivers || data.data?.drivers || []
    const tripsRaw = data.trips || data.data?.trips || []
    const scheduleRaw = data.schedule || data.data?.schedule || {}

    drivers = driversRaw.map(d => ({
      ...d,
      _id: String(d._id || d.id || ""),
      address:
        d.address ||
        d.homeAddress ||
        d.currentAddress ||
        d.locationAddress ||
        d.city ||
        ""
    }))

    trips = tripsRaw
      .filter(t =>
        t.dispatchSelected === true &&
        t.disabled !== true &&
        String(t.status || "").toLowerCase() !== "cancelled"
      )
      .map(t => ({
        ...t,
        _id: String(t._id || ""),
        selected: false,
        driverId: t.driverId ? String(t.driverId) : "",
        vehicle: t.vehicle || "",
        manual: t.manual === true
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
    }, 10000)

    console.log("drivers:", drivers)
    console.log("trips:", trips)
    console.log("schedule:", schedule)
  }catch(err){
    console.log("INIT ERROR:", err)
  }
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
    .replace(/'/g, "&#39;")
}

function normalizeText(s){
  return String(s || "").trim().toLowerCase()
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

function getTripDateTimeValue(t){
  const dateStr = String(t.tripDate || "").trim()
  const timeStr = String(t.tripTime || "").trim()

  if(!dateStr) return 0

  const direct = new Date(`${dateStr} ${timeStr}`)
  if(!isNaN(direct.getTime())) return direct.getTime()

  const directIso = new Date(`${dateStr}T${timeStr}`)
  if(!isNaN(directIso.getTime())) return directIso.getTime()

  const dateOnly = new Date(dateStr)
  if(!isNaN(dateOnly.getTime())) return dateOnly.getTime()

  return 0
}

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function normalizeDateKey(dateStr){
  if(!dateStr) return ""
  const d = new Date(dateStr)
  if(isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-CA")
}

/* ================= TIME / CURRENT ================= */

function getTripStatus(t){
  const ts = getTripDateTimeValue(t)
  if(!ts) return ""

  const diffMin = Math.round((Date.now() - ts) / 60000)

  if(diffMin >= 120){
    return "hide"
  }

  if(diffMin >= 0){
    return "expired"
  }

  if(diffMin >= -30){
    return "trip-urgent"
  }

  if(diffMin >= -90){
    return "trip-soon"
  }

  return ""
}

function getVisibleTrips(){
  return trips.filter(t => getTripStatus(t) !== "hide")
}

function getCurrentTrips(){
  return trips.filter(t => {
    const ts = getTripDateTimeValue(t)
    if(!ts) return false

    const diffMin = Math.round((Date.now() - ts) / 60000)
    return diffMin < 0
  })
}

/* ================= DRIVER ACTIVE CHECK ================= */

function isDriverActiveOnDate(driverId, tripDate){
  const s = schedule[String(driverId)]

  if(!s) return false
  if(s.enabled !== true) return false
  if(!tripDate) return false

  const days = s.days || {}
  const key = normalizeDateKey(tripDate)

  return !!days[key]
}

function getValidDriversForTrip(trip){
  let valid = drivers.filter(d => isDriverActiveOnDate(d._id, trip.tripDate))

  if(!valid.length){
    valid = drivers.filter(d => {
      const s = schedule[String(d._id)]
      return s ? s.enabled === true : false
    })
  }

  if(!valid.length){
    valid = drivers
  }

  return valid
}

function getActiveDriversForPanel(){
  const current = getCurrentTrips()

  return drivers.filter(d =>
    current.some(t => String(t.driverId || "") === String(d._id))
  )
}

/* ================= DRIVER TRIPS / STATUS ================= */

function getCurrentDriverTrips(driverId){
  return getCurrentTrips()
    .filter(t => String(t.driverId || "") === String(driverId))
    .sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function getDriverTripsAll(driverId){
  return trips
    .filter(t => String(t.driverId || "") === String(driverId))
    .sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function getDriverTripsCount(driverId){
  return getCurrentDriverTrips(driverId).length
}

function getLatestTripForDriver(driverId){
  const driverTrips = getCurrentDriverTrips(driverId)
  if(!driverTrips.length) return null
  return driverTrips[driverTrips.length - 1]
}

function getSelectedTripForDriver(driverId){
  const driverTrips = getCurrentDriverTrips(driverId)
  if(!driverTrips.length) return null

  let idx = Number(selectedTripIndexPerDriver[String(driverId)] || 0)
  if(Number.isNaN(idx) || idx < 0) idx = 0
  if(idx >= driverTrips.length) idx = 0

  selectedTripIndexPerDriver[String(driverId)] = idx
  return driverTrips[idx]
}

function getDriverStatus(driverId){
  return getDriverTripsCount(driverId) > 0 ? "Busy" : "Available"
}

/* ================= CONFLICT ================= */

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

/* ================= DRIVER START ================= */

function getDriverDayHomeAddress(driver){
  const sch = schedule[String(driver._id)] || {}
  return (
    sch.address ||
    driver.liveAddress ||
    driver.currentAddress ||
    driver.locationAddress ||
    driver.address ||
    ""
  )
}

function getPreviousAssignedTripForDriver(driverId, currentTrip){
  const currentTs = getTripDateTimeValue(currentTrip)

  const sameDriverTrips = trips
    .filter(t =>
      String(t.driverId || "") === String(driverId) &&
      String(t._id || "") !== String(currentTrip?._id || "")
    )
    .sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))

  let previousTrip = null

  for(const t of sameDriverTrips){
    const ts = getTripDateTimeValue(t)
    if(ts && currentTs && ts < currentTs){
      previousTrip = t
    }
  }

  return previousTrip
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
    console.log("GEOCODE ERROR:", e)
    return null
  }
}

async function prepareGeo(){
  for(const d of drivers){
    const homeAddress = getDriverDayHomeAddress(d)
    if(homeAddress && !d._geoHome){
      d._geoHome = await geocode(homeAddress)
    }
  }

  for(const t of trips){
    if(t.pickup && !t._geoPickup){
      t._geoPickup = await geocode(t.pickup)
    }

    if(t.dropoff && !t._geoDropoff){
      t._geoDropoff = await geocode(t.dropoff)
    }

    const stops = getStops(t)
    if(stops.length && !t._geoStops){
      t._geoStops = []
      for(const s of stops){
        const g = await geocode(s)
        if(g) t._geoStops.push(g)
      }
    }
  }
}

/* ================= DISTANCE ================= */

function fastDistance(a, b){
  if(!a || !b) return 999999
  const dx = a.lat - b.lat
  const dy = a.lng - b.lng
  return (dx * dx) + (dy * dy)
}

function getFallbackLocalScore(startAddress, pickupAddress){
  const start = normalizeText(startAddress)
  const pickup = normalizeText(pickupAddress)

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

  if(distanceScore === 999999){
    let common = 0
    const startWords = start.split(/\s+/).filter(Boolean)
    const pickupWords = pickup.split(/\s+/).filter(Boolean)

    for(const w of startWords){
      if(w.length > 2 && pickupWords.includes(w)) common++
    }

    if(common > 0){
      distanceScore = Math.max(2, 15 - common * 3)
    }
  }

  if(distanceScore === 999999){
    distanceScore = 100
  }

  return distanceScore
}

function estimateTravelMinutesByScore(score){
  if(score <= 0) return 0
  if(score === 1) return 8
  if(score <= 5) return 15
  if(score <= 15) return 22
  if(score <= 30) return 30
  return 45
}

/* ================= AUTO ASSIGN ================= */

async function autoAssign(){
  if(!drivers.length || !trips.length) return

  sortTrips()

  const load = {}
  drivers.forEach(d => load[d._id] = 0)

  trips.forEach(t => {
    if(t.manual === true && t.driverId){
      load[String(t.driverId)] = (load[String(t.driverId)] || 0) + 1
    }
  })

  trips.forEach(t => {
    if(t.manual !== true){
      t.driverId = ""
      t.vehicle = ""
    }
  })

  sortTrips()

  for(const trip of trips){

    if(trip.manual === true && trip.driverId) continue

    const validDrivers = getValidDriversForTrip(trip)
    if(!validDrivers.length) continue

    let bestDriver = null
    let bestScore = Infinity

    for(const driver of validDrivers){

      const firstRound = (load[driver._id] || 0) === 0

      let startAddress = ""
      let startPoint = null
      let distanceScore = 999999

      if(firstRound){
        // أول رحلة: من عنوان السواق فقط
        startAddress = getDriverDayHomeAddress(driver)
        startPoint = driver._geoHome || null

        if(startPoint && trip._geoPickup){
          distanceScore = fastDistance(startPoint, trip._geoPickup)
        }else{
          distanceScore = getFallbackLocalScore(startAddress, trip.pickup)
        }

        let firstRoundBoost = 0
        if(startPoint && trip._geoPickup && distanceScore < 0.0005){
          firstRoundBoost -= 1000
        }

        const firstRoundScore = (distanceScore * 100000) + firstRoundBoost

        if(firstRoundScore < bestScore){
          bestScore = firstRoundScore
          bestDriver = driver
        }

        continue
      }

      const previousTrip = getPreviousAssignedTripForDriver(driver._id, trip)

      if(previousTrip && previousTrip._geoDropoff){
        startAddress = previousTrip.dropoff || ""
        startPoint = previousTrip._geoDropoff
      }else{
        startAddress = getDriverDayHomeAddress(driver)
        startPoint = driver._geoHome || null
      }

      if(startPoint && trip._geoPickup){
        distanceScore = fastDistance(startPoint, trip._geoPickup)
      }else{
        distanceScore = getFallbackLocalScore(startAddress, trip.pickup)
      }

      const conflictPenalty = hasTimeConflict(driver._id, trip) ? 50000 : 0

      let timingPenalty = 0
      if(previousTrip){
        const prevTs = getTripDateTimeValue(previousTrip)
        const tripTs = getTripDateTimeValue(trip)
        const gapMin = Math.round((tripTs - prevTs) / 60000)

        const estTravelMin = estimateTravelMinutesByScore(
          startPoint && trip._geoPickup
            ? Math.min(distanceScore * 1000, 50)
            : distanceScore
        )

        const minNeeded = estTravelMin + 20

        if(gapMin < minNeeded){
          timingPenalty = 50000
        }
      }

      const loadPenalty = (load[driver._id] || 0) * 500

      const score =
        (distanceScore * 1000) +
        loadPenalty +
        conflictPenalty +
        timingPenalty

      if(score < bestScore){
        bestScore = score
        bestDriver = driver
      }
    }

    if(bestDriver){
      trip.driverId = String(bestDriver._id)
      trip.vehicle = getDriverCar(bestDriver._id)
      load[bestDriver._id] = (load[bestDriver._id] || 0) + 1

      if(selectedTripIndexPerDriver[String(bestDriver._id)] == null){
        selectedTripIndexPerDriver[String(bestDriver._id)] = 0
      }
    }
  }

  console.log("AUTO ASSIGN LOAD:", load)
}

/* ================= RENDER TRIPS ================= */

function renderTrips(){
  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((t, i) => {
    const status = getTripStatus(t)
    if(status === "hide") return

    const validDrivers = getValidDriversForTrip(t)
    const stops = getStops(t)

    body.innerHTML += `
      <tr class="trip-row ${status}">
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

/* ================= ROUTE FOR MAP ONLY ================= */

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
    console.log("ROUTE ERROR:", e)
    return null
  }
}

/* ================= DRIVER CLICK / TRIP SELECT ================= */

function changeDriverTrip(driverId, index){
  selectedTripIndexPerDriver[String(driverId)] = Number(index) || 0
  selectedDriverId = String(driverId)
  renderDrivers()
  focusDriver(driverId)
}

async function focusDriver(id){
  if(!map) return

  const trip = getSelectedTripForDriver(id)

  if(!trip){
    showToast("No current trip assigned to this driver")
    return
  }

  selectedDriverId = String(id)
  clearMap()

  const stops = getStops(trip)
  const points = []

  const pickup = trip._geoPickup || await geocode(trip.pickup)
  if(pickup) points.push({ ...pickup, label: "Pickup" })

  for(const s of stops){
    const g = await geocode(s)
    if(g) points.push({ ...g, label: "Stop" })
  }

  const dropoff = trip._geoDropoff || await geocode(trip.dropoff)
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
  renderDrivers()
}

/* ================= DRIVERS PANEL ================= */

function renderDrivers(){
  const panel = document.getElementById("driversPanel")
  if(!panel) return

  panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`

  const activeDrivers = getActiveDriversForPanel()

  activeDrivers.forEach((d, i) => {
    const car = getDriverCar(d._id)
    const tripsCount = getDriverTripsCount(d._id)
    const status = getDriverStatus(d._id)
    const statusClass = status === "Busy" ? "badge-busy" : "badge-available"
    const tripList = getCurrentDriverTrips(d._id)

    let selectedIdx = Number(selectedTripIndexPerDriver[String(d._id)] || 0)
    if(Number.isNaN(selectedIdx) || selectedIdx < 0) selectedIdx = 0
    if(selectedIdx >= tripList.length) selectedIdx = 0
    selectedTripIndexPerDriver[String(d._id)] = selectedIdx

    const selectedTrip = tripList[selectedIdx] || null

    panel.innerHTML += `
      <div class="driver ${selectedDriverId === d._id ? "active" : ""}" data-id="${escapeHtml(d._id)}">
        <div class="driver-bar">
          <div class="driver-name">${i + 1} - ${escapeHtml(d.name || "")}</div>

          <div class="driver-right">
            <div class="driver-info">
              <span>🚗 ${escapeHtml(car || "-")}</span>
              <span>📦 ${escapeHtml(selectedTrip ? (selectedTrip.tripNumber || "-") : "-")}</span>
            </div>

            <div class="driver-meta">
              <span class="badge ${statusClass}">${escapeHtml(status)}</span>
              <span class="badge badge-count">${tripsCount} Trip${tripsCount === 1 ? "" : "s"}</span>
              <span class="badge badge-trip">ETA Map</span>
            </div>

            <div class="driver-trip-picker" style="margin-top:6px;">
              <select onchange="changeDriverTrip('${escapeHtml(d._id)}', this.value)" onclick="event.stopPropagation()">
                ${tripList.map((t, idx) => `
                  <option value="${idx}" ${idx === selectedIdx ? "selected" : ""}>
                    Trip ${idx + 1}${t.tripNumber ? ` - ${escapeHtml(t.tripNumber)}` : ""}
                  </option>
                `).join("")}
              </select>
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
  getVisibleTrips().forEach(t => {
    t.selected = allSelected
  })
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
      showToast("Warning: driver has time conflict")
    }
  }

  const d = drivers.find(x => String(x._id) === String(id))

  trips[i].driverId = id ? String(id) : ""
  trips[i].vehicle = d ? getDriverCar(d._id) : ""
  trips[i].manual = !!id

  if(id && selectedTripIndexPerDriver[String(id)] == null){
    selectedTripIndexPerDriver[String(id)] = 0
  }

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
    t.manual = false
  })

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
      try{
        if(map) map.invalidateSize()
      }catch(e){}
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
window.changeDriverTrip = changeDriverTrip

window.Engine = {
  toggleSelect,
  toggleEdit,
  sendSelected,
  redistributeSelected: redistribute,
  redistribute,
  focusDriver
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)