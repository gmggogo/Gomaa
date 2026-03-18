const Engine = {

trips: [],
drivers: [],
schedule: {},

selected: {},
editMode: false,

/* ================= LOAD ================= */

async load(){

  try{

    const data = await Store.load()

    // ✅ مهم: متفلترش هنا
    this.trips = data.trips || []

    this.drivers = data.drivers || []
    this.schedule = data.schedule || {}

    this.sortTrips()

    UI.render()

  }catch(err){
    console.error("Dispatch Load Error", err)
  }

},

/* ================= SORT ================= */

sortTrips(){

  this.trips.sort((a,b)=>{

    const da = new Date(`${a.tripDate} ${a.tripTime}`)
    const db = new Date(`${b.tripDate} ${b.tripTime}`)

    return da - db

  })

},

/* ================= DRIVERS ================= */

getAvailableDrivers(trip){

  const day = new Date(trip.tripDate).toLocaleDateString("en-CA")

  return this.drivers.filter(d=>{

    const s = this.schedule[d._id]

    return s && s.enabled && s.days && s.days[day]

  })

},

assign(trip, driver){

  const s = this.schedule[driver._id] || {}

  trip.driverId = driver._id
  trip.driverName = driver.name
  trip.vehicle = s.vehicleNumber || ""
  trip.driverAddress = s.address || ""

},

/* ================= AUTO ================= */

runAuto(){

  this.trips.forEach(trip=>{

    const available = this.getAvailableDrivers(trip)

    if(available.length){
      this.assign(trip, available[0])
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

  const allSelected = this.trips.every(t=>this.selected[t._id])

  this.trips.forEach(t=>{
    this.selected[t._id] = !allSelected
  })

  UI.render()

},

/* ================= EDIT ================= */

toggleEdit(){

  this.editMode = !this.editMode

  UI.render()

},

/* ================= SEND ================= */

async sendOne(id){

  try{

    await Store.sendTrips([id])

    alert("Trip Sent")

  }catch(err){
    console.error(err)
  }

},

async sendSelected(){

  const ids = Object.keys(this.selected)
    .filter(id => this.selected[id])

  if(!ids.length){
    return alert("No trips selected")
  }

  try{

    await Store.sendTrips(ids)

    alert("Trips Sent")

  }catch(err){
    console.error(err)
  }

},

/* ================= DISABLE ================= */

async disable(id){

  try{

    await Store.disableTrip(id)

    this.trips = this.trips.filter(t=>t._id !== id)

    delete this.selected[id]

    UI.render()

  }catch(err){
    console.error(err)
  }

},

/* ================= MANUAL ASSIGN ================= */

async assignManual(tripId, driverId){

  const driver = this.drivers.find(d=>d._id === driverId)

  if(!driver) return

  const trip = this.trips.find(t=>t._id === tripId)

  if(!trip) return

  this.assign(trip, driver)

  try{

    await Store.assignDriver(tripId, driverId)

  }catch(err){
    console.error(err)
  }

  UI.render()

},

/* ================= NOTES ================= */

updateNote(id, val){

  const trip = this.trips.find(t=>t._id === id)

  if(trip){
    trip.notes = val
  }

}

}