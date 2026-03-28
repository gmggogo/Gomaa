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

    drivers = (data.drivers || []).map(d => ({
      ...d,
      _id: String(d._id || d.id || ""),
      address: d.address || ""
    }))

    trips = (data.trips || [])
      .filter(t => t.dispatchSelected === true && t.disabled !== true)
      .map(t => ({
        ...t,
        _id: String(t._id || ""),
        selected: false,
        driverId: t.driverId ? String(t.driverId) : "",
        vehicle: t.vehicle || "",
        manual: !!t.driverId
      }))

    schedule = data.schedule || {}

    loadGeoCache()
    await prepareGeo()
    await autoAssign()

    sortTrips()
    renderTrips()
    initMap()
    renderDrivers()

    setInterval(() => {
      renderTrips()
      renderDrivers()
    }, 10000)

  }catch(err){
    console.log("INIT ERROR:", err)
  }
}

/* ================= CACHE ================= */

function loadGeoCache(){
  try{
    geoCache = JSON.parse(localStorage.getItem("geo_cache") || "{}")
  }catch(e){
    geoCache = {}
  }
}

function saveGeoCache(){
  localStorage.setItem("geo_cache", JSON.stringify(geoCache))
}

/* ================= TIME ================= */

function getTripDateTimeValue(t){
  return new Date(`${t.tripDate} ${t.tripTime}`).getTime() || 0
}

/* ================= CURRENT TRIPS ================= */

function getCurrentTrips(){
  return trips.filter(t => {
    const ts = getTripDateTimeValue(t)
    if(!ts) return false
    return (Date.now() - ts) < 0 // لسه مجتش
  })
}

/* ================= DRIVER ACTIVE ================= */

function isDriverActiveOnDate(driverId, tripDate){

  const s = schedule[String(driverId)]
  if(!s) return false
  if(s.enabled !== true) return false

  const key = normalizeDateKey(tripDate)
  return !!(s.days && s.days[key])
}

function normalizeDateKey(dateStr){
  const d = new Date(dateStr)
  return `${d.getMonth()+1}/${d.getDate()}`
}

/* ================= GEO ================= */

async function geocode(addr){

  if(!addr) return null

  const key = addr.toLowerCase()

  if(geoCache[key]) return geoCache[key]

  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`)
    const data = await res.json()

    if(!data.length) return null

    const p = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    }

    geoCache[key] = p
    saveGeoCache()

    return p

  }catch(e){
    return null
  }
}

/* ================= PREPARE ================= */

async function prepareGeo(){

  for(const d of drivers){

    const addr = schedule[d._id]?.address || d.address

    if(addr && !d._geoHome){
      d._geoHome = await geocode(addr)
    }
  }

  for(const t of trips){

    if(!t._geoPickup){
      t._geoPickup = await geocode(t.pickup)
    }

    if(t.dropoff && !t._geoDropoff){
      t._geoDropoff = await geocode(t.dropoff)
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

  const currentTrips = getCurrentTrips()

  if(!currentTrips.length) return

  const load = {}
  drivers.forEach(d => load[d._id] = 0)

  currentTrips.forEach(t => {
    if(t.manual && t.driverId){
      load[t.driverId]++
    }
  })

  for(const trip of currentTrips){

    if(trip.manual && trip.driverId) continue

    const validDrivers = drivers.filter(d =>
      isDriverActiveOnDate(d._id, trip.tripDate)
    )

    let best = null
    let bestScore = Infinity

    for(const d of validDrivers){

      let start = d._geoHome

      const prev = currentTrips
        .filter(x =>
          x.driverId === d._id &&
          getTripDateTimeValue(x) < getTripDateTimeValue(trip)
        )
        .sort((a,b)=> getTripDateTimeValue(b)-getTripDateTimeValue(a))[0]

      if(prev && prev._geoDropoff){
        start = prev._geoDropoff
      }

      const dist = fastDistance(start, trip._geoPickup)

      const score =
        (dist * 1000) +
        (load[d._id] * 500)

      if(score < bestScore){
        bestScore = score
        best = d
      }
    }

    if(best){
      trip.driverId = best._id
      trip.vehicle = schedule[best._id]?.vehicleNumber || ""
      load[best._id]++
    }
  }
}

/* ================= SORT ================= */

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a)-getTripDateTimeValue(b))
}

/* ================= RENDER ================= */

function renderTrips(){

  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  getCurrentTrips().forEach((t,i)=>{

    body.innerHTML += `
    <tr>
      <td>${t.tripNumber||i+1}</td>
      <td>${t.clientName||""}</td>
      <td>${t.pickup||""}</td>
      <td>${t.dropoff||""}</td>
      <td>${t.tripDate||""}</td>
      <td>${t.tripTime||""}</td>
      <td>${drivers.find(d=>d._id===t.driverId)?.name||"-"}</td>
      <td>${t.vehicle||""}</td>
    </tr>
    `
  })
}

/* ================= DRIVERS ================= */

function getDriverTripsCount(id){
  return getCurrentTrips().filter(t=>t.driverId===id).length
}

function getLatestTripForDriver(id){

  const list = getCurrentTrips().filter(t=>t.driverId===id)

  if(!list.length) return null

  return list.sort((a,b)=>getTripDateTimeValue(b)-getTripDateTimeValue(a))[0]
}

function renderDrivers(){

  const panel = document.getElementById("driversPanel")
  if(!panel) return

  panel.innerHTML=""

  drivers.forEach(d=>{

    const count = getDriverTripsCount(d._id)

    panel.innerHTML += `
    <div class="driver">
      ${d.name}
      <span>${count>0?'Busy':'Available'}</span>
    </div>
    `
  })
}

/* ================= MAP ================= */

function initMap(){
  if(map) return
  map = L.map("map").setView([33.44,-112.07],10)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map)
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)