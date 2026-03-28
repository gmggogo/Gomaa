/* ================= STATE ================= */

let trips = []
let drivers = []
let schedule = {}
let editMode = false
let allSelected = false

/* ================= INIT ================= */

async function init(){
  try{
    const data = await Store.load()

    drivers = (data.drivers || []).map(d => ({
      ...d,
      _id: String(d._id || d.id || ""),
      address: d.address || d.city || ""
    }))

    trips = (data.trips || []).map(t => ({
      ...t,
      _id: String(t._id || ""),
      selected: false,
      driverId: t.driverId ? String(t.driverId) : "",
      vehicle: t.vehicle || "",
      manual: !!t.driverId // 🔥 مهم جدا
    }))

    schedule = data.schedule || {}

    runEngine()

    setInterval(() => {
      runEngine()
      renderTrips()
      renderDrivers()
    }, 8000)

  }catch(err){
    console.log("INIT ERROR:", err)
  }
}

/* ================= TIME ================= */

function getTripTime(t){
  const d = new Date(`${t.tripDate} ${t.tripTime}`)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

/* ================= SCHEDULE ================= */

function isDriverActive(driverId, tripDate){
  const s = schedule[driverId]

  if(!s) return true
  if(s.enabled === false) return false

  if(!s.days || !Object.keys(s.days).length) return true

  const d = new Date(tripDate)
  const key = `${d.getMonth()+1}/${d.getDate()}`

  if(!(key in s.days)) return true

  return !!s.days[key]
}

/* ================= START POINT ================= */

function getDriverStart(driver){
  const lastTrip = getLatestTrip(driver._id)

  if(lastTrip && lastTrip.dropoff){
    return lastTrip.dropoff
  }

  const s = schedule[driver._id]
  return s?.address || driver.address || ""
}

/* ================= LAST TRIP ================= */

function getLatestTrip(driverId){
  const list = trips
    .filter(t => String(t.driverId) === String(driverId))
    .sort((a,b)=> getTripTime(b) - getTripTime(a))

  return list[0] || null
}

/* ================= DISTANCE ================= */

function smartDistance(a,b){
  const A = String(a||"").toLowerCase()
  const B = String(b||"").toLowerCase()

  if(!A || !B) return 50

  if(A.includes(B) || B.includes(A)) return 0

  const cities = ["chandler","mesa","tempe","phoenix","gilbert"]

  for(const c of cities){
    if(A.includes(c) && B.includes(c)) return 5
  }

  let score = 20

  A.split(" ").forEach(w=>{
    if(B.includes(w)) score -= 2
  })

  return score
}

/* ================= ETA ================= */

function estimateETA(start, pickup){
  return smartDistance(start,pickup) * 2
}

/* ================= TIME CHECK ================= */

function canMakeTrip(driver, trip){
  const last = getLatestTrip(driver._id)
  if(!last) return true

  const lastTime = getTripTime(last)
  const nextTime = getTripTime(trip)

  return (nextTime - lastTime) >= (20 * 60000)
}

/* ================= AUTO ASSIGN ================= */

function autoAssign(){

  const load = {}
  drivers.forEach(d => load[d._id] = 0)

  // 🔥 مهم: امسح بس الاوتوماتيك
  trips.forEach(t=>{
    if(!t.manual){
      t.driverId = ""
      t.vehicle = ""
    }
  })

  trips.sort((a,b)=> getTripTime(a) - getTripTime(b))

  for(const trip of trips){

    // 🔥 سيب المانول في حاله
    if(trip.manual && trip.driverId) continue

    let best = null
    let bestScore = Infinity

    for(const d of drivers){

      if(!isDriverActive(d._id, trip.tripDate)) continue

      const start = getDriverStart(d)

      const distance = smartDistance(start, trip.pickup)
      const eta = estimateETA(start, trip.pickup)
      const loadScore = load[d._id]

      let latePenalty = 0

      if(!canMakeTrip(d, trip)){
        latePenalty = 1000
      }

      const score =
        (distance * 5) +
        (eta * 10) +
        (loadScore * 20) +
        latePenalty

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

  console.log("ENGINE LOAD:", load)
}

/* ================= ENGINE RUN ================= */

function runEngine(){
  autoAssign()
  renderTrips()
  renderDrivers()
}

/* ================= DRIVER CAR ================= */

function getDriverCar(id){
  const s = schedule[id]
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
        <td>${t.tripDate || ""}</td>
        <td>${t.tripTime || ""}</td>

        <td>
          <select ${(editMode && t.selected) ? "" : "disabled"}
            onchange="assignDriver(${i},this.value)">
            <option value="">--</option>
            ${drivers.map(d=>`
              <option value="${d._id}" ${t.driverId===d._id?"selected":""}>
                ${d.name}
              </option>
            `).join("")}
          </select>
        </td>

        <td>${t.vehicle || ""}</td>

        <td>
          <button onclick="sendOne(${i})">Send</button>
        </td>
      </tr>
    `
  })
}

/* ================= DRIVERS ================= */

function renderDrivers(){
  const panel = document.getElementById("driversPanel")
  if(!panel) return

  panel.innerHTML = ""

  drivers.forEach(d=>{
    const count = trips.filter(t=>t.driverId===d._id).length

    panel.innerHTML += `
      <div>
        ${d.name} | 🚗 ${getDriverCar(d._id)} | 📦 ${count}
      </div>
    `
  })
}

/* ================= ACTIONS ================= */

function toggleTrip(i){
  trips[i].selected = !trips[i].selected
  renderTrips()
}

function assignDriver(i,id){
  const d = drivers.find(x=>x._id===id)

  trips[i].driverId = id
  trips[i].vehicle = d ? getDriverCar(d._id) : ""

  // 🔥 ده المهم
  trips[i].manual = !!id

  renderTrips()
  renderDrivers()
}

/* ================= SEND ================= */

function sendOne(i){
  console.log("SEND:", trips[i])
}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)