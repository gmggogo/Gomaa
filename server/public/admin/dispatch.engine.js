/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}

let geoCache = {}
let editMode = false
let allSelected = false

/* ================= INIT ================= */

async function init(){
  const data = await Store.load()

  drivers = (data.drivers || []).map(d => ({
    ...d,
    _id: String(d._id),
    address: d.address || "Phoenix AZ"
  }))

  trips = (data.trips || []).map(t => ({
    ...t,
    _id: String(t._id),
    selected:false,
    driverId: t.driverId ? String(t.driverId) : ""
  }))

  schedule = data.schedule || {}

  await prepareGeo()
  autoAssign()

  sortTrips()
  renderTrips()

  // تحديث كل دقيقة
  setInterval(renderTrips,60000)
}

/* ================= GEO ================= */

async function geocode(addr){
  if(!addr) return null

  if(geoCache[addr]) return geoCache[addr]

  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`)
    const data = await res.json()

    if(!data.length) return null

    const p = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    }

    geoCache[addr] = p
    return p

  }catch{
    return null
  }
}

/* ================= PREPARE GEO ================= */

async function prepareGeo(){

  for(const d of drivers){
    d._geo = await geocode(d.address)
  }

  for(const t of trips){
    t._geo = await geocode(t.pickup)
  }
}

/* ================= FAST DISTANCE ================= */

function fastDistance(a,b){
  if(!a || !b) return 9999

  const dx = a.lat - b.lat
  const dy = a.lng - b.lng

  return dx*dx + dy*dy
}

/* ================= TIME ================= */

function getTripTime(t){
  return new Date(`${t.tripDate} ${t.tripTime}`).getTime()
}

/* ================= STATUS ================= */

function getTripStatus(t){

  const ts = getTripTime(t)
  if(!ts) return ""

  const diffMin = (Date.now() - ts)/60000

  if(diffMin >= 60){
    return "hide"
  }

  if(diffMin >= 0){
    return "expired"
  }

  return ""
}

/* ================= AUTO ASSIGN ================= */

function autoAssign(){

  for(const trip of trips){

    if(trip.driverId) continue

    let best = null
    let bestScore = Infinity

    for(const driver of drivers){

      const dist = fastDistance(driver._geo, trip._geo)

      const score = dist

      if(score < bestScore){
        bestScore = score
        best = driver
      }
    }

    if(best){
      trip.driverId = best._id
    }
  }
}

/* ================= SORT ================= */

function sortTrips(){
  trips.sort((a,b)=> getTripTime(a)-getTripTime(b))
}

/* ================= RENDER ================= */

function renderTrips(){

  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((t,i)=>{

    const status = getTripStatus(t)

    // اخفاء بعد ساعة
    if(status === "hide") return

    body.innerHTML += `
    <tr class="${status}">
      <td>${i+1}</td>
      <td>${t.clientName || ""}</td>
      <td>${t.pickup || ""}</td>
      <td>${t.dropoff || ""}</td>
      <td>${t.tripDate || ""}</td>
      <td>${t.tripTime || ""}</td>
      <td>${getDriverName(t.driverId)}</td>
    </tr>
    `
  })
}

/* ================= DRIVER NAME ================= */

function getDriverName(id){
  const d = drivers.find(x=>x._id===id)
  return d ? d.name : "-"
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)