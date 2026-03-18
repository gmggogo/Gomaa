const Engine = {

trips:[],
drivers:[],
schedule:{},

selected:{},
editMode:false,

map:null,
markers:[],

/* ================= LOAD ================= */
async load(){

  const data = await Store.load()

  this.trips = data.trips || []
  this.drivers = data.drivers || []
  this.schedule = data.schedule || {}

  this.sortTrips()

  this.initMap()

  this.runAuto()

},

/* ================= MAP ================= */
initMap(){

  this.map = L.map('map').setView([33.4484,-112.0740],10)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19
  }).addTo(this.map)

},

renderMap(){

  this.markers.forEach(m=>this.map.removeLayer(m))
  this.markers=[]

  this.drivers.forEach(d=>{

    if(!d.lat || !d.lng) return

    const m = L.marker([d.lat,d.lng])
      .addTo(this.map)
      .bindPopup(d.name)

    this.markers.push(m)

  })

},

/* ================= SORT ================= */
sortTrips(){

  this.trips.sort((a,b)=>{
    return new Date(`${a.tripDate} ${a.tripTime}`) - new Date(`${b.tripDate} ${b.tripTime}`)
  })

},

/* ================= AVAILABLE ================= */
getAvailableDrivers(trip){

  const day = new Date(trip.tripDate).toLocaleDateString("en-CA")

  return this.drivers.filter(d=>{
    const s = this.schedule[d._id]
    return s && s.enabled && s.days[day]
  })

},

/* ================= ASSIGN ================= */
assign(trip, driver){

  const s = this.schedule[driver._id] || {}

  trip.driverId = driver._id
  trip.driverName = driver.name
  trip.vehicle = s.vehicleNumber || ""
},

/* ================= AUTO ================= */
runAuto(){

  this.trips.forEach(t=>{

    const list = this.getAvailableDrivers(t)
    if(list.length) this.assign(t, list[0])

  })

  this.renderMap()
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

/* ================= MANUAL ================= */
async assignManual(tripId, driverId){

  const driver = this.drivers.find(d=>d._id===driverId)
  const trip = this.trips.find(t=>t._id===tripId)

  this.assign(trip, driver)

  await Store.assignDriver(tripId, driverId)

  UI.render()

},

/* ================= SEND ================= */
async sendSelected(){

  const ids = Object.keys(this.selected).filter(id=>this.selected[id])
  if(!ids.length) return alert("No trips")

  await Store.sendTrips(ids)

  alert("Sent")

},

async sendOne(id){

  await Store.sendTrips([id])
  alert("Sent")

}

}