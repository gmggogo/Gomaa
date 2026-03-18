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

    this.trips = data.trips || []
    this.drivers = data.drivers || []
    this.schedule = data.schedule || {}

    // 🧠 مهم: نفضي السيلكت
    this.selected = {}

    this.sortTrips()

    UI.render()

  }catch(err){
    console.error("ENGINE LOAD ERROR", err)
  }

},

/* ================= SORT ================= */
sortTrips(){

  this.trips.sort((a,b)=>{
    return new Date(`${a.tripDate} ${a.tripTime}`) - new Date(`${b.tripDate} ${b.tripTime}`)
  })

},

/* ================= GET AVAILABLE DRIVERS ================= */
getAvailableDrivers(trip){

  if(!trip.tripDate) return []

  const dayKey = new Date(trip.tripDate)
    .toLocaleDateString("en-CA")

  return this.drivers.filter(d=>{

    const s = this.schedule[d._id]

    if(!s) return false
    if(!s.enabled) return false

    // 🔥 أهم حاجة
    return s.days && s.days[dayKey]

  })

},

/* ================= ASSIGN ================= */
assign(trip, driver){

  if(!trip || !driver) return

  const s = this.schedule[driver._id] || {}

  trip.driverId = driver._id
  trip.driverName = driver.name || ""
  trip.vehicle = s.vehicleNumber || driver.vehicleNumber || ""
  trip.driverAddress = s.address || driver.address || ""

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

/* ================= SEND ================= */
async sendSelected(){

  const ids = Object.keys(this.selected)
    .filter(id=>this.selected[id])

  if(!ids.length){
    alert("No trips selected")
    return
  }

  await Store.sendTrips(ids)

  alert("Sent Successfully")

  // 🔥 نعمل reload بعد الإرسال
  this.load()

},

/* ================= DISABLE ================= */
async disable(id){

  await Store.disableTrip(id)

  this.trips = this.trips.filter(t=>t._id !== id)

  UI.render()

},

/* ================= MANUAL ASSIGN ================= */
async assignManual(tripId, driverId){

  const trip = this.trips.find(t=>t._id === tripId)
  const driver = this.drivers.find(d=>d._id === driverId)

  if(!trip || !driver) return

  this.assign(trip, driver)

  await Store.assignDriver(tripId, driverId)

  UI.render()

}

}