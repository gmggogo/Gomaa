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

    trips = tripsRaw.map(t => ({
      ...t,
      _id: String(t._id || ""),
      selected: false,
      driverId: t.driverId ? String(t.driverId) : "",
      vehicle: t.vehicle || "",
      manual: !!t.driverId   // 🔥 FIX
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

  }catch(err){
    console.log("INIT ERROR:", err)
  }
}

/* ================= ACTIVE DRIVER FIX ================= */

function isDriverActiveOnDate(driverId, tripDate){
  const s = schedule[String(driverId)]

  if(!s) return true

  if(
    s.status === "OFF" ||
    s.enabled === false ||
    s.active === false
  ){
    return false
  }

  if(!tripDate) return true

  const days = s.days || {}
  if(!Object.keys(days).length) return true

  const key = normalizeDateKey(tripDate)

  // 🔥 FIX (كان السبب الرئيسي للمشكلة)
  return Object.keys(days).some(d =>
    d.includes(key) && days[d]
  )
}

/* ================= AUTO ASSIGN FIX ================= */

async function autoAssign(){
  if(!drivers.length) return

  sortTrips()

  const tempCount = {}
  drivers.forEach(d => tempCount[d._id] = 0)

  trips.forEach(t => {
    if(!t.manual){
      t.driverId = ""
      t.vehicle = ""
    }
  })

  for(const trip of trips){

    // 🔥 FIX (يحافظ على المانيوال)
    if(trip.driverId && trip.manual) continue

    let validDrivers = getValidDriversForTrip(trip)
    if(!validDrivers.length){
      validDrivers = drivers
    }

    let bestDriver = null
    let bestScore = Infinity

    for(const driver of validDrivers){

      const conflictPenalty = hasTimeConflict(driver._id, trip) ? 50000 : 0

      const startPoint = driver._geo
      const pickupPoint = trip._geo

      let distanceScore = 999999

      if(startPoint && pickupPoint){
        distanceScore = fastDistance(startPoint, pickupPoint)
      }

      const load = tempCount[driver._id] || 0

      const finalScore =
        (distanceScore * 1000) +
        (load * 500) +
        conflictPenalty

      if(finalScore < bestScore){
        bestScore = finalScore
        bestDriver = driver
      }
    }

    if(bestDriver){
      trip.driverId = String(bestDriver._id)
      trip.vehicle = getDriverCar(bestDriver._id)
      tempCount[bestDriver._id]++
    }
  }
}

/* ================= RENDER FIX ================= */

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
          <!-- 🔥 FIX: مفتوح دايمًا -->
          <select onchange="assignDriver(${i},this.value)">
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

/* ================= MANUAL FIX ================= */

function assignDriver(i, id){
  if(!trips[i]) return

  const d = drivers.find(x => String(x._id) === String(id))

  trips[i].driverId = id ? String(id) : ""
  trips[i].vehicle = d ? getDriverCar(d._id) : ""

  // 🔥 أهم حاجة
  trips[i].manual = !!id

  renderTrips()
  renderDrivers()
}