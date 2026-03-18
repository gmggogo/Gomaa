const Engine = {

trips:[],
drivers:[],
schedule:{},

selected:{},
editMode:false,

async load(){

  const data = await Store.load()

  // ✅ هنا الفلترة الصح
  this.trips = (data.trips || []).filter(t=>t.selected)

  this.drivers = data.drivers
  this.schedule = data.schedule

  this.sortTrips()

  UI.render()

},

sortTrips(){

  this.trips.sort((a,b)=>{
    return new Date(`${a.tripDate} ${a.tripTime}`) - new Date(`${b.tripDate} ${b.tripTime}`)
  })

},

getAvailableDrivers(trip){

  const day = new Date(trip.tripDate).toLocaleDateString("en-CA")

  return this.drivers.filter(d=>{
    const s = this.schedule[d._id]
    return s && s.enabled && s.days?.[day]
  })

},

assign(trip, driver){

  const s = this.schedule[driver._id] || {}

  trip.driverId = driver._id
  trip.driverName = driver.name
  trip.vehicle = s.vehicleNumber || ""
},

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

async sendOne(id){

  await Store.sendTrips([id])
  alert("Sent 1 trip")

},

async sendSelected(){

  const ids = Object.keys(this.selected).filter(id=>this.selected[id])

  if(!ids.length) return alert("No trips")

  await Store.sendTrips(ids)

  alert("Sent")

},

async disable(id){

  await Store.disableTrip(id)
  this.trips = this.trips.filter(t=>t._id !== id)

  UI.render()

},

async assignManual(tripId, driverId){

  const driver = this.drivers.find(d=>d._id===driverId)

  if(!driver) return

  this.assign(
    this.trips.find(t=>t._id===tripId),
    driver
  )

  await Store.assignDriver(tripId, driverId)

  UI.render()

},

updateNote(id,val){

  const trip = this.trips.find(t=>t._id===id)
  if(trip) trip.notes = val

}

}