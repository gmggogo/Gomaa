const Engine = {

trips:[],
drivers:[],
schedule:{},

selected:{},
editMode:false,

/* ================= LOAD ================= */
async load(){

  const data = await Store.load()

  this.trips = data.trips || []
  this.drivers = data.drivers || []
  this.schedule = data.schedule || {}

  this.sortTrips()

  this.runAuto()

},

/* ================= SORT ================= */
sortTrips(){

  this.trips.sort((a,b)=>{
    const da = new Date(`${a.tripDate} ${a.tripTime}`)
    const db = new Date(`${b.tripDate} ${b.tripTime}`)
    return da - db
  })

},

/* ================= GET DAY ================= */
getTripDay(trip){
  return new Date(trip.tripDate).toLocaleDateString("en-CA")
},

/* ================= AVAILABLE DRIVERS ================= */
getAvailableDrivers(trip){

  const day = this.getTripDay(trip)

  return this.drivers.filter(d=>{
    const s = this.schedule[d._id]
    return s && s.enabled && s.days[day]
  })

},

/* ================= ASSIGN ================= */
assign(trip, driver){

  const s = this.schedule[driver._id] || {}

  trip.driverId = driver._id
  trip.driverName = driver.name || ""
  trip.vehicle = s.vehicleNumber || ""
  trip.driverAddress = s.address || ""

},

/* ================= AUTO DISTRIBUTE ================= */
runAuto(){

  const driverState = {}

  this.drivers.forEach(d=>{
    const s = this.schedule[d._id] || {}

    driverState[d._id] = {
      lastLocation: s.address || "",
      lastTime: null
    }
  })

  this.trips.forEach(trip=>{

    const available = this.getAvailableDrivers(trip)

    if(!available.length) return

    let bestDriver = null

    available.forEach(driver=>{

      const state = driverState[driver._id]

      if(!bestDriver){
        bestDriver = driver
        return
      }

      if(!state.lastTime){
        bestDriver = driver
        return
      }

      if(state.lastTime < driverState[bestDriver._id].lastTime){
        bestDriver = driver
      }

    })

    if(bestDriver){

      this.assign(trip, bestDriver)

      driverState[bestDriver._id].lastLocation = trip.dropoff
      driverState[bestDriver._id].lastTime = new Date(`${trip.tripDate} ${trip.tripTime}`)

    }

  })

  UI.render()

},

/* ================= SELECT ================= */
toggleSelect(id){
  this.selected[id] = !this.selected[id]
  UI.render()
},

toggleAll(){

  const all = this.trips.every(t=>this.selected[t._id])

  this.trips.forEach(t=>{
    this.selected[t._id] = !all
  })

  UI.render()
},

/* ================= MANUAL ASSIGN ================= */
async assignManual(tripId, driverId){

  const driver = this.drivers.find(d=>d._id === driverId)
  if(!driver) return

  const trip = this.trips.find(t=>t._id === tripId)

  this.assign(trip, driver)

  await Store.assignDriver(tripId, driverId)

  UI.render()

},

/* ================= SEND ================= */
async sendSelected(){

  const ids = Object.keys(this.selected).filter(id=>this.selected[id])

  if(!ids.length){
    alert("No trips selected")
    return
  }

  await Store.sendTrips(ids)

  alert("Trips Sent")

},

/* ================= SINGLE SEND ================= */
async sendOne(id){

  await Store.sendTrips([id])

  alert("Trip Sent")

},

/* ================= DISABLE ================= */
async disable(id){

  await Store.disableTrip(id)

  this.trips = this.trips.filter(t=>t._id !== id)

  UI.render()

}

}