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
      manual: !!t.driverId
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

function getTripDateTimeValue(t){
  const d = new Date(`${t.tripDate} ${t.tripTime}`)
  return isNaN(d) ? 0 : d.getTime()
}

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

function normalizeDateKey(dateStr){
  const d = new Date(dateStr)
  if(isNaN(d)) return ""
  return `${d.getMonth()+1}/${d.getDate()}`
}

/* ================= ACTIVE ================= */

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

  if(!Object.keys(days).length){
    return true
  }

  const key = normalizeDateKey(tripDate)

  return Object.keys(days).some(d =>
    d.includes(key) && days[d]
  )
}

/* ================= CONFLICT ================= */

function hasTimeConflict(driverId, trip){

  const tripTime = getTripDateTimeValue(trip)

  return trips.some(t => {

    if(t._id === trip._id) return false
    if(String(t.driverId) !== String(driverId)) return false
    if(t.tripDate !== trip.tripDate) return false

    const tTime = getTripDateTimeValue(t)

    return Math.abs(tTime - tripTime) < (30 * 60000)
  })
}

/* ================= GEO ================= */

async function geocode(addr){
  if(!addr) return null

  const key = addr.trim().toLowerCase()
  if(!key) return null

  if(geoCache[key]) return geoCache[key]

  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json&limit=1`)
    const data = await res.json()

    if(!data.length) return null

    const point = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    }

    geoCache[key] = point
    saveGeoCache()

    return point
  }catch(e){
    return null
  }
}

async function prepareGeo(){

  for(const d of drivers){
    if(!d._geo && d.address){
      d._geo = await geocode(d.address)
    }
  }

  for(const t of trips){
    if(!t._geo && t.pickup){
      t._geo = await geocode(t.pickup)
    }
  }
}

/* ================= DISTANCE ================= */

function fastDistance(a,b){
  if(!a || !b) return 999999
  const dx = a.lat - b.lat
  const dy = a.lng - b.lng
  return dx*dx + dy*dy
}

/* ================= AUTO ASSIGN ================= */

async function autoAssign(){

  const load = {}
  drivers.forEach(d => load[d._id] = 0)

  // reset auto only
  trips.forEach(t=>{
    if(!t.manual){
      t.driverId = ""
      t.vehicle = ""
    }
  })

  sortTrips()

  for(const trip of trips){

    if(trip.manual) continue

    let validDrivers = drivers.filter(d =>
      isDriverActiveOnDate(d._id, trip.tripDate)
    )

    if(!validDrivers.length){
      validDrivers = drivers
    }

    let best = null
    let bestScore = Infinity

    for(const d of validDrivers){

      if(!d._geo) continue

      const conflictPenalty = hasTimeConflict(d._id, trip) ? 99999 : 0

      const dist = fastDistance(d._geo, trip._geo)
      const loadScore = load[d._id] * 500

      const score = dist * 1000 + loadScore + conflictPenalty

      if(score < bestScore){
        bestScore = score
        best = d
      }
    }

    if(best){
      trip.driverId = best._id
      trip.vehicle = getDriverCar(best._id)
      load[best._id]++
    }
  }
}

/* ================= DRIVER CAR ================= */

function getDriverCar(id){
  const s = schedule[String(id)]
  return s?.carNumber || s?.vehicleNumber || ""
}

/* ================= RENDER ================= */

function renderTrips(){

  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((t,i)=>{

    body.innerHTML += `
      <tr>
        <td>
          <button onclick="toggleTrip(${i})">
            ${t.selected ? "✔" : "Select"}
          </button>
        </td>

        <td>${t.tripNumber || i+1}</td>
        <td>${t.clientName || ""}</td>
        <td>${t.pickup || ""}</td>
        <td>${t.dropoff || ""}</td>

        <td>
          <select onchange="assignDriver(${i},this.value)">
            <option value="">--</option>
            ${drivers.map(d=>`
              <option value="${d._id}" ${t.driverId==d._id?"selected":""}>
                ${d.name}
              </option>
            `).join("")}
          </select>
        </td>

        <td>${t.vehicle || ""}</td>
      </tr>
    `
  })
}

/* ================= DRIVERS ================= */

function renderDrivers(){
  console.log("drivers updated")
}

/* ================= ACTIONS ================= */

function toggleTrip(i){
  trips[i].selected = !trips[i].selected
  renderTrips()
}

function assignDriver(i,id){

  const t = trips[i]
  const d = drivers.find(x => String(x._id) === String(id))

  t.driverId = id
  t.vehicle = d ? getDriverCar(d._id) : ""

  // 🔥 مانيوال ثابت
  t.manual = true

  renderTrips()
}

async function redistribute(){

  trips.forEach(t=>{
    t.driverId = ""
    t.vehicle = ""
    t.manual = false
  })

  await autoAssign()
  renderTrips()
}

/* ================= MAP ================= */

function initMap(){}

/* ================= TABS ================= */

function bindTabs(){}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)