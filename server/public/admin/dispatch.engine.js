/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}
let map = null
let markers = []
let geoCache = {}
let selectedDriverId = null
let selectedTripIndexPerDriver = {}

/* ================= INIT ================= */

async function init(){
  try{
    const data = await Store.load()

    drivers = (data.drivers || []).map(d => ({
      ...d,
      _id: String(d._id || d.id),
      address: d.address || d.homeAddress || ""
    }))

    trips = (data.trips || [])
      .filter(t =>
        t.dispatchSelected === true &&
        t.disabled !== true &&
        String(t.status || "").toLowerCase() !== "cancelled"
      )
      .map(t => ({
        ...t,
        _id: String(t._id),
        driverId: "",
        manual: false
      }))

    schedule = data.schedule || {}

    loadGeoCache()
    await prepareGeo()
    await autoAssign()

    renderTrips()
    renderDrivers()
    initMap()

  }catch(e){
    console.log("INIT ERROR:", e)
  }
}

/* ================= CACHE ================= */

function loadGeoCache(){
  try{
    geoCache = JSON.parse(localStorage.getItem("geo_cache") || "{}")
  }catch{
    geoCache = {}
  }
}

function saveGeoCache(){
  localStorage.setItem("geo_cache", JSON.stringify(geoCache))
}

/* ================= HELPERS ================= */

function getDriverAddress(d){
  const s = schedule[d._id] || {}
  return s.address || d.address || ""
}

function getTripTime(t){
  return new Date(`${t.tripDate} ${t.tripTime}`).getTime()
}

function sortTrips(){
  trips.sort((a,b)=>getTripTime(a)-getTripTime(b))
}

/* ================= ACTIVE ================= */

function isDriverActive(driverId, tripDate){
  const s = schedule[driverId]
  if(!s || s.enabled !== true) return false

  const key = new Date(tripDate).toLocaleDateString("en-CA")
  return !!(s.days && s.days[key])
}

/* ================= GEO ================= */

async function geocode(addr){
  if(!addr) return null

  const key = addr.toLowerCase().trim()
  if(geoCache[key]) return geoCache[key]

  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`)
    const data = await res.json()

    if(!data.length) return null

    const p = {lat:+data[0].lat, lng:+data[0].lon}
    geoCache[key] = p
    saveGeoCache()
    return p

  }catch{
    return null
  }
}

/* ================= PREP ================= */

async function prepareGeo(){
  for(const d of drivers){
    d._geoHome = await geocode(getDriverAddress(d))
  }

  for(const t of trips){
    t._geoPickup = await geocode(t.pickup)
    t._geoDropoff = await geocode(t.dropoff)
  }
}

/* ================= DIST ================= */

function dist(a,b){
  if(!a||!b) return 999999
  const dx=a.lat-b.lat
  const dy=a.lng-b.lng
  return dx*dx+dy*dy
}

/* ================= LAST ================= */

function getLastDropoff(driverId){
  const list = trips.filter(t=>t.driverId===driverId)
  if(!list.length) return null

  list.sort((a,b)=>getTripTime(b)-getTripTime(a))
  return list[0]._geoDropoff
}

/* ================= AUTO ASSIGN ================= */

async function autoAssign(){

  sortTrips()

  const load={}
  drivers.forEach(d=>load[d._id]=0)

  for(const trip of trips){

    let best=null
    let bestScore=Infinity

    const validDrivers = drivers.filter(d => isDriverActive(d._id, trip.tripDate))

    for(const d of validDrivers){

      const first = load[d._id]===0

      let start = first ? d._geoHome : getLastDropoff(d._id)

      let distance = dist(start, trip._geoPickup)

      let score

      if(first){
        // 🔥 أول رحلة = أقرب فقط
        score = distance * 100000
      }else{
        score = distance * 1000 + load[d._id]*500
      }

      if(score < bestScore){
        bestScore = score
        best = d
      }
    }

    if(best){
      trip.driverId = best._id
      load[best._id]++
    }
  }
}

/* ================= RENDER TRIPS ================= */

function renderTrips(){
  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML=""

  trips.forEach((t,i)=>{
    body.innerHTML+=`
    <tr>
      <td>${t.tripNumber||i+1}</td>
      <td>${t.clientName||""}</td>
      <td>${t.pickup}</td>
      <td>${t.dropoff}</td>
      <td>${t.tripDate}</td>
      <td>${t.tripTime}</td>
      <td>${getDriverName(t.driverId)}</td>
    </tr>`
  })
}

function getDriverName(id){
  const d=drivers.find(x=>x._id==id)
  return d?d.name:"-"
}

/* ================= DRIVER PANEL ================= */

function renderDrivers(){
  const panel = document.getElementById("driversPanel")
  if(!panel) return

  panel.innerHTML=""

  drivers.forEach(d=>{
    const list = trips.filter(t=>t.driverId===d._id)

    panel.innerHTML+=`
    <div class="driver" onclick="focusDriver('${d._id}')">
      <b>${d.name}</b> (${list.length})
      <select onchange="changeTrip('${d._id}',this.value)">
        ${list.map((t,i)=>`<option value="${i}">Trip ${i+1}</option>`).join("")}
      </select>
    </div>`
  })
}

/* ================= MAP ================= */

function initMap(){
  map = L.map("map").setView([33.4,-112],10)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map)
}

function clearMap(){
  markers.forEach(m=>{
    try{ map.removeLayer(m) }catch{}
  })
  markers=[]
}

async function focusDriver(id){

  const trip = getSelectedTrip(id)
  if(!trip) return

  clearMap()

  const coords = [
    `${trip._geoPickup.lng},${trip._geoPickup.lat}`,
    `${trip._geoDropoff.lng},${trip._geoDropoff.lat}`
  ].join(";")

  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
  const data = await res.json()

  if(!data.routes || !data.routes.length) return

  const route = data.routes[0]

  const line = L.polyline(
    route.geometry.coordinates.map(c=>[c[1],c[0]]),
    {color:"blue", weight:5}
  ).addTo(map)

  markers.push(line)

  map.fitBounds(line.getBounds())
}

/* ================= TRIP PICK ================= */

function changeTrip(driverId,index){
  selectedTripIndexPerDriver[driverId]=Number(index)
  focusDriver(driverId)
}

function getSelectedTrip(driverId){
  const list = trips.filter(t=>t.driverId===driverId)
  const idx = selectedTripIndexPerDriver[driverId] || 0
  return list[idx]
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded",init)