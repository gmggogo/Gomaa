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
    _id: String(d._id || ""),
    address: d.address || d.homeAddress || "Phoenix AZ"
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

}

/* ================= HELPERS ================= */

function getStops(t){
  if (Array.isArray(t.stops)) return t.stops.filter(Boolean)
  return []
}

function getDriverCar(id){
  const s = schedule[String(id)]
  if (!s) return ""
  return s.carNumber || s.vehicleNumber || s.car || ""
}

function getTripDateTimeValue(t){
  return new Date(`${t.tripDate} ${t.tripTime}`).getTime() || 0
}

function getDriverTripsCount(driverId){
  return trips.filter(t => String(t.driverId) === String(driverId)).length
}

function getLatestTripForDriver(driverId){
  const list = trips.filter(t => String(t.driverId) === String(driverId))
  if(!list.length) return null
  list.sort((a,b)=> getTripDateTimeValue(b) - getTripDateTimeValue(a))
  return list[0]
}

function sortTrips(){
  trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))
}

/* ================= DRIVER CHECK ================= */

function isDriverActiveOnDate(driverId, tripDate){

  const s = schedule[String(driverId)]

  if(!s) return true
  if(s.enabled === false) return false

  if(!tripDate) return true

  const days = s.days || {}

  if(!Object.keys(days).length){
    return true
  }

  return !!days[String(tripDate).trim()]
}

function getValidDriversForTrip(trip){

  const valid = drivers.filter(d =>
    isDriverActiveOnDate(d._id, trip.tripDate)
  )

  if(!valid.length){
    return drivers
  }

  return valid
}

/* ================= SMART AUTO ASSIGN ================= */

function autoAssign(){

  if(!drivers.length) return

  sortTrips()

  trips.forEach(trip => {

    if(trip.driverId) return

    let validDrivers = getValidDriversForTrip(trip)

    if(!validDrivers.length){
      validDrivers = drivers
    }

    let bestDriver = null
    let bestScore = Infinity

    validDrivers.forEach(driver => {

      // time conflict
      const driverTrips = trips.filter(t =>
        String(t.driverId) === String(driver._id)
      )

      let conflict = false

      driverTrips.forEach(t => {

        if(t.tripDate !== trip.tripDate) return

        const diff = Math.abs(
          new Date(`${t.tripDate} ${t.tripTime}`) -
          new Date(`${trip.tripDate} ${trip.tripTime}`)
        ) / 60000

        if(diff < 30){
          conflict = true
        }

      })

      if(conflict) return

      // start point
      let start = driver.address || "Phoenix AZ"

      const lastTrip = getLatestTripForDriver(driver._id)
      if(lastTrip && lastTrip.dropoff){
        start = lastTrip.dropoff
      }

      // score
      const count = getDriverTripsCount(driver._id)

      let score = count * 10

      if(trip.pickup && start){
        if(start.toLowerCase().includes(trip.pickup.toLowerCase())){
          score -= 20
        }
      }

      if(score < bestScore){
        bestScore = score
        bestDriver = driver
      }

    })

    if(!bestDriver && validDrivers.length){
      bestDriver = validDrivers[0]
    }

    if(bestDriver){
      trip.driverId = String(bestDriver._id)
      trip.vehicle = getDriverCar(bestDriver._id)
    }

  })

}

/* ================= UI FUNCTIONS ================= */

function renderTrips(){

  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = ""

  trips.forEach((t,i)=>{

    const validDrivers = getValidDriversForTrip(t)

    body.innerHTML += `
      <tr>
        <td>${t.tripNumber || i+1}</td>
        <td>${t.pickup || ""}</td>
        <td>${t.dropoff || ""}</td>

        <td>
          <select onchange="assignDriver(${i},this.value)">
            <option value="">--</option>
            ${validDrivers.map(d=>`
              <option value="${d._id}" ${t.driverId===d._id?"selected":""}>
                ${d.name}
              </option>
            `).join("")}
          </select>
        </td>

        <td id="car-${i}">
          ${t.vehicle || getDriverCar(t.driverId)}
        </td>

      </tr>
    `
  })

}

function renderDrivers(){
  // optional
}

function assignDriver(i,id){

  const d = drivers.find(x=>String(x._id)===String(id))

  trips[i].driverId = id
  trips[i].vehicle = d ? getDriverCar(d._id) : ""

  renderTrips()

}

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", init)