const Engine = {

trips:[],
drivers:[],
schedule:{},

selected:{},
editMode:false,

map:null,
markers:[],

async load(){

  const data = await Store.load()

  this.trips = data.trips || []
  this.drivers = data.drivers || []
  this.schedule = data.schedule || {}

  this.initMap()
  this.runAuto()

},

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

getAvailableDrivers(trip){

  const day = new Date(trip.tripDate).toLocaleDateString("en-CA")

  return this.drivers.filter(d=>{
    const s = this.schedule[d._id]
    return s && s.enabled && s.days[day]
  })

},

assign(trip, driver){

  const s = this.schedule[driver._id] || {}

  trip.driverId = driver._id
  trip.driverName = driver.name
  trip.vehicle = s.vehicleNumber || ""

},

runAuto(){

  this.trips.forEach(t=>{
    const list = this.getAvailableDrivers(t)
    if(list.length) this.assign(t,list[0])
  })

  this.renderMap()
  UI.render()

},

toggleSelect(id){
  this.selected[id]=!this.selected[id]
  UI.render()
},

toggleAll(){

  const all = this.trips.every(t=>this.selected[t._id])

  this.trips.forEach(t=>{
    this.selected[t._id]=!all
  })

  UI.render()
},

toggleEdit(){

  this.editMode = !this.editMode

  document.getElementById("editBtn").innerText =
  this.editMode ? "Save" : "Edit"

  UI.render()

},

async assignManual(id,driverId){

  const d = this.drivers.find(x=>x._id===driverId)
  const t = this.trips.find(x=>x._id===id)

  this.assign(t,d)

  await Store.assignDriver(id,driverId)

  UI.render()

},

async updateNotes(id,value){

  const t = this.trips.find(x=>x._id===id)
  if(t) t.notes=value

  await fetch(`/api/dispatch/${id}/notes`,{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ notes:value })
  })

},

async sendSelected(){

  const ids = Object.keys(this.selected).filter(i=>this.selected[i])
  if(!ids.length) return alert("No trips")

  await Store.sendTrips(ids)
  alert("Sent")

},

async sendOne(id){

  await Store.sendTrips([id])
  alert("Sent")

}

}