/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}

let map = null
let markers = []
let routeLayer = null

let geoCache = {}
let editMode = false
let allSelected = false
let selectedDriverId = null
let selectedTripIndexPerDriver = {}
let tabsBound = false
let refreshTimer = null

/* ================= INIT ================= */

async function init(){
  try{
    const data = await Store.load()

    const driversRaw = data.drivers || data.data?.drivers || []
    const tripsRaw = data.trips || data.data?.trips || []
    const scheduleRaw = data.schedule || data.data?.schedule || {}

    schedule = scheduleRaw || {}

    drivers = (driversRaw || [])
      .map(d => {
        const id = String(d._id || d.id || "")
        const sch = schedule[id] || {}

        return {
          ...d,
          _id: id,
          address:
            sch.address ||
            d.address ||
            d.homeAddress ||
            d.currentAddress ||
            d.locationAddress ||
            d.city ||
            "",
          vehicleNumber:
            sch.vehicleNumber ||
            sch.carNumber ||
            d.vehicleNumber ||
            d.carNumber ||
            "",
          phone:
            sch.phone ||
            d.phone ||
            "",
          lat:
            sch.lat != null && sch.lat !== ""
              ? Number(sch.lat)
              : (d.lat != null && d.lat !== "" ? Number(d.lat) : null),
          lng:
            sch.lng != null && sch.lng !== ""
              ? Number(sch.lng)
              : (d.lng != null && d.lng !== "" ? Number(d.lng) : null)
        }
      })
      .filter(d => {
        const sch = schedule[String(d._id)] || null
        if(!sch) return true
        return sch.enabled === true
      })

    /* ✅ dispatch يسحب بس اللي متعلم عليه في Trips */
    trips = (tripsRaw || [])
      .filter(t =>
        t.dispatchSelected === true &&
        t.disabled !== true &&
        String(t.status || "").toLowerCase() !== "cancelled"
      )
      .map(t => ({
        ...t,
        _id: String(t._id || ""),
        selected: false,                  // select جوه dispatch للإرسال
        driverId: t.driverId ? String(t.driverId) : "",
        driverName: t.driverName || "",
        vehicle: t.vehicle || "",
        driverAddress: t.driverAddress || "",
        manual: !!t.driverId || t.manual === true,
        autoAssigned: false               // عشان نعرف هل نحتاج نحفظ قبل الإرسال
      }))

    /* ✅ منع التكرار */
    const seen = new Set()
    trips = trips.filter(t => {
      if(!t._id) return false
      if(seen.has(t._id)) return false
      seen.add(t._id)
      return true
    })

    loadGeoCache()
    await prepareGeo()
    await autoAssign()

    sortTrips()
    renderTrips()
    initMap()
    renderDrivers()
    bindTabs()

    if(refreshTimer) clearInterval(refreshTimer)
    refreshTimer = setInterval(() => {
      renderTrips()
      renderDrivers()
    }, 10000)

    console.log("drivers:", drivers)
    console.log("trips:", trips)
    console.log("schedule:", schedule)
  }catch(err){
    console.log("INIT ERROR:", err)
    showToast("Init error")
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

function getStops(t){
  if(Array.isArray(t.stops)) return t.stops.filter(Boolean)
  if(Array.isArray(t.stopAddresses)) return t.stopAddresses.filter(Boolean)
  if(Array.isArray(t.extraStops)) return t.extraStops.filter(Boolean)
  if(typeof t.stop === "string" && t.stop.trim()) return [t.stop.trim()]
  return []
}

function getDriverCar(id){
  const d = drivers.find(x => String(x._id) === String(id))
  if(d && d.vehicleNumber) return d.vehicleNumber

  const s = schedule[String(id)]
  if(!s) return ""

  return s.carNumber || s.vehicleNumber || s.car || ""
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

function getCurrentArizonaNow(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  ).getTime()
}

/* ================= TIME / CURRENT ================= */

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

/* ✅ للماب والـ panel: أي رحلة متعينة */
function getCurrentTrips(){
  return trips.filter(t => String(t.driverId || "").trim())
}

/* ================= DRIVER ACTIVE CHECK ================= */

function isDriverActiveOnDate(driverId, tripDate){
  const s = schedule[String(driverId)]

  if(!s) return true
  if(s.enabled !== true) return false
  if(!tripDate) return true

  const days = s.days || {}
  const dateObj = new Date(tripDate)

  const key1 = normalizeDateKey(tripDate)
  const key2 = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : ""
  const key3 = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString("en-US") : ""
  const key4 = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString("en-US", { weekday: "short" })
    : ""
  const key5 = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString("en-US", { weekday: "long" })
    : ""

  if(!Object.keys(days).length) return true

  return !!(days[key1] || days[key2] || days[key3] || days[key4] || days[key5])
}

function getValidDriversForTrip(trip){
  let valid = drivers.filter(d => isDriverActiveOnDate(d._id, trip.tripDate))

  if(!valid.length){
    valid = drivers.filter(d => {
      const s = schedule[String(d._id)]
      return s ? s.enabled === true : true
    })
  }

  if(!valid.length){
    valid = drivers
  }

  return valid
}

function getActiveDriversForPanel(){
  return drivers
}

/* ================= DRIVER TRIPS / STATUS ================= */

function getCurrentDriverTrips(driverId){
  return trips
    .filter(t => String(t.driverId || "") === String(driverId))
    .sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function getDriverTripsCount(driverId){
  return getCurrentDriverTrips(driverId).length
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

function getDriverHomePoint(driver){
  const sch = schedule[String(driver._id)] || {}

  const lat =
    sch.lat != null && sch.lat !== ""
      ? Number(sch.lat)
      : (driver.lat != null && driver.lat !== "" ? Number(driver.lat) : null)

  const lng =
    sch.lng != null && sch.lng !== ""
      ? Number(sch.lng)
      : (driver.lng != null && driver.lng !== "" ? Number(driver.lng) : null)

  if(Number.isFinite(lat) && Number.isFinite(lng)){
    return { lat, lng }
  }

  return null
}

/* ================= GEO ================= */

async function geocode(addr){
  if(!addr) return null

  const key = normalizeText(addr)
  if(!key) return null

  if(geoCache[key]) return geoCache[key]

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`,
      {
        headers: {
          "Accept": "application/json"
        }
      }
    )

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
    const directPoint = getDriverHomePoint(d)

    if(directPoint){
      d._geoHome = directPoint
    }else{
      const homeAddress = getDriverDayHomeAddress(d)
      if(homeAddress && !d._geoHome){
        d._geoHome = await geocode(homeAddress)
      }
    }
  }

  for(const t of trips){
    if(t.pickupLat != null && t.pickupLng != null){
      t._geoPickup = {
        lat: Number(t.pickupLat),
        lng: Number(t.pickupLng)
      }
    }else if(t.pickup && !t._geoPickup){
      t._geoPickup = await geocode(t.pickup)
    }

    if(t.dropoffLat != null && t.dropoffLng != null){
      t._geoDropoff = {
        lat: Number(t.dropoffLat),
        lng: Number(t.dropoffLng)
      }
    }else if(t.dropoff && !t._geoDropoff){
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
  return Math.sqrt((dx * dx) + (dy * dy))
}

function getFallbackLocalScore(startAddress, pickupAddress){
  const start = normalizeText(startAddress)
  const pickup = normalizeText(pickupAddress)

  let distanceScore = 999999

  const cities = [
    "queen creek",
    "chandler",
    "tempe",
    "mesa",
    "gilbert",
    "phoenix",
    "scottsdale"
  ]

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

/* ================= SAVE ASSIGNMENT ================= */

async function saveDriverAssignment(trip, driverId){
  try{
    const res = await fetch(`/api/dispatch/${trip._id}/driver`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId })
    })

    const updated = await res.json().catch(() => ({}))

    if(!res.ok){
      console.log("Driver save failed:", updated)
      return false
    }

    const d = drivers.find(x => String(x._id) === String(driverId))

    trip.driverId = updated.driverId ? String(updated.driverId) : String(driverId)
    trip.driverName = updated.driverName || d?.name || ""
    trip.vehicle = updated.vehicle || (d ? getDriverCar(d._id) : "")
    trip.driverAddress = updated.driverAddress || (d ? getDriverDayHomeAddress(d) : "")
    return true
  }catch(e){
    console.log("saveDriverAssignment ERROR:", e)
    return false
  }
}

/* ================= AUTO ASSIGN ================= */

async function autoAssign(){
  if(!drivers.length || !trips.length) return

  sortTrips()

  /* ✅ كل سواق ياخد رحلة واحدة فقط */
  const usedDrivers = new Set()

  /* اليدوي أو الموجود أصلاً يتحسب */
  for(const trip of trips){
    if(trip.driverId){
      usedDrivers.add(String(trip.driverId))
      trip.manual = true
    }
  }

  for(const trip of trips){
    if(trip.driverId) continue

    let pickupPoint = trip._geoPickup

    if(!pickupPoint && trip.pickup){
      pickupPoint = await geocode(trip.pickup)
      trip._geoPickup = pickupPoint
    }

    const validDrivers = getValidDriversForTrip(trip)
    if(!validDrivers.length) continue

    let bestDriver = null
    let bestScore = Infinity

    for(const driver of validDrivers){
      if(usedDrivers.has(String(driver._id))) continue

      let distance = 999999

      if(driver._geoHome && pickupPoint){
        distance = fastDistance(driver._geoHome, pickupPoint)
      }else{
        distance = getFallbackLocalScore(
          getDriverDayHomeAddress(driver),
          trip.pickup
        )
      }

      if(distance < bestScore){
        bestScore = distance
        bestDriver = driver
      }
    }

    if(bestDriver){
      const id = String(bestDriver._id)

      trip.driverId = id
      trip.driverName = bestDriver.name || ""
      trip.vehicle = getDriverCar(id)
      trip.driverAddress = getDriverDayHomeAddress(bestDriver)

      /* ✅ مهم: عشان send ما يفشلش */
      trip.manual = false
      trip.autoAssigned = true

      usedDrivers.add(id)

      if(selectedTripIndexPerDriver[id] == null){
        selectedTripIndexPerDriver[id] = 0
      }
    }
  }
}

/* ================= RENDER TRIPS ================= */

function renderTrips(){
  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((t, i) => {
    const statusClass = getTripStatus(t)
    if(statusClass === "hide") return

    const validDrivers = getValidDriversForTrip(t)
    const stops = getStops(t)
    const sentClass = String(t.status || "") === "Dispatched" ? "sent-row" : ""

    body.innerHTML += `
      <tr class="trip-row ${statusClass} ${sentClass}">
        <td>
          <button class="btn ${t.selected ? "green" : "blue"} select-btn" onclick="toggleTrip(${i})">
            ${t.selected ? "✔" : "Select"}
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
          <button class="btn green send-btn" onclick="sendOne(${i})" ${t.selected ? "" : "disabled"}>
            Send
          </button>
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
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
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

  if(routeLayer){
    try{ map.removeLayer(routeLayer) }catch(e){}
    routeLayer = null
  }
}

/* ================= ROUTE ================= */

async function getRoute(points){
  if(points.length < 2) return null

  try{
    const coords = points.map(p => `${p.lng},${p.lat}`).join(";")

    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    )

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
    showToast("No trip assigned to this driver")
    return
  }

  selectedDriverId = String(id)
  clearMap()

  const stops = getStops(trip)
  const points = []

  let pickup = trip._geoPickup
  if(!pickup && trip.pickup){
    pickup = await geocode(trip.pickup)
    trip._geoPickup = pickup
  }
  if(pickup) points.push({ ...pickup, label: "Pickup" })

  for(const s of stops){
    const g = await geocode(s)
    if(g) points.push({ ...g, label: "Stop" })
  }

  let dropoff = trip._geoDropoff
  if(!dropoff && trip.dropoff){
    dropoff = await geocode(trip.dropoff)
    trip._geoDropoff = dropoff
  }
  if(dropoff) points.push({ ...dropoff, label: "Dropoff" })

  if(points.length < 2){
    showToast("Route not available")
    return
  }

  const route = await getRoute(points)
  if(!route){
    showToast("Route not available")
    return
  }

  points.forEach((p, idx) => {
    const marker = L.marker([p.lat, p.lng]).bindPopup(
      idx === 0 ? "Pickup" : (idx === points.length - 1 ? "Dropoff" : `Stop ${idx}`)
    )
    marker.addTo(map)
    markers.push(marker)
  })

  routeLayer = L.polyline(route.coords, {
    color: "#2563eb",
    weight: 5
  }).addTo(map)

  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] })

  showToast(`Distance ${route.distance} mi • ETA ${route.duration} min`)
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

async function assignDriver(i, id){
  if(!trips[i]) return

  const trip = trips[i]

  if(id){
    if(!isDriverActiveOnDate(id, trip.tripDate)){
      showToast("Driver not active on this date")
      renderTrips()
      return
    }
  }

  try{
    if(id){
      const ok = await saveDriverAssignment(trip, id)
      if(!ok){
        showToast("Driver save failed")
        renderTrips()
        return
      }

      trip.manual = true
      trip.autoAssigned = false
    }else{
      trip.driverId = ""
      trip.driverName = ""
      trip.vehicle = ""
      trip.driverAddress = ""
      trip.manual = false
      trip.autoAssigned = false
    }

    if(id && selectedTripIndexPerDriver[String(id)] == null){
      selectedTripIndexPerDriver[String(id)] = 0
    }

    renderTrips()
    renderDrivers()
    showToast("Driver updated")
  }catch(e){
    console.log(e)
    showToast("Error saving driver")
  }
}

async function sendSelected(){
  const selected = trips.filter(t => t.selected === true)

  if(!selected.length){
    showToast("Select trips first")
    return
  }

  for(const trip of selected){
    if(!String(trip.driverId || "").trim()){
      showToast(`Trip ${trip.tripNumber || ""} has no driver assigned`)
      return
    }

    /* ✅ الأوتو أسّاين يتحفظ الأول */
    if(trip.autoAssigned === true){
      const ok = await saveDriverAssignment(trip, trip.driverId)
      if(!ok){
        showToast(`Driver save failed for trip ${trip.tripNumber || ""}`)
        return
      }
      trip.autoAssigned = false
    }
  }

  const idsToSend = selected
    .filter(t => t.selected && t.driverId)
    .map(t => t._id)

  if(!idsToSend.length){
    showToast("No valid trips to send")
    return
  }

  try{
    const res = await fetch("/api/dispatch/send", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: idsToSend })
    })

    const data = await res.json().catch(() => ({}))

    if(!res.ok){
      showToast(data?.message || "Send failed")
      return
    }

    selected.forEach(t => {
      t.status = "Dispatched"
      t.selected = false
    })

    renderTrips()
    renderDrivers()
    showToast(`${selected.length} trip(s) sent`)
  }catch(e){
    console.log("SEND SELECTED ERROR:", e)
    showToast("Send failed")
  }
}

async function sendOne(i){
  if(!trips[i]) return

  const trip = trips[i]

  /* ✅ لازم تكون متعلم عليها جوه dispatch */
  if(!trip.selected){
    showToast("Select trip first")
    return
  }

  if(!String(trip.driverId || "").trim()){
    showToast(`Trip ${trip.tripNumber || ""} has no driver assigned`)
    return
  }

  /* ✅ الأوتو أسّاين يتحفظ الأول */
  if(trip.autoAssigned === true){
    const ok = await saveDriverAssignment(trip, trip.driverId)
    if(!ok){
      showToast("Driver save failed")
      return
    }
    trip.autoAssigned = false
  }

  try{
    const res = await fetch("/api/dispatch/send", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [trip._id] })
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
    showToast(`Trip ${trip.tripNumber || i + 1} sent`)
  }catch(e){
    console.log("SEND ONE ERROR:", e)
    showToast("Send failed")
  }
}

async function redistribute(){
  const selected = trips.filter(t => t.selected === true)

  if(!selected.length){
    showToast("Select trips first")
    return
  }

  selected.forEach(t => {
    t.driverId = ""
    t.driverName = ""
    t.vehicle = ""
    t.driverAddress = ""
    t.manual = false
    t.autoAssigned = false
  })

  await prepareGeo()
  await autoAssign()
  sortTrips()
  renderTrips()
  renderDrivers()
  showToast("Trips redistributed")
}

/* ================= TABS ================= */

function bindTabs(){
  if(tabsBound) return
  tabsBound = true

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