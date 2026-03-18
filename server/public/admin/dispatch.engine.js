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

this.trips = (data.trips || []).filter(t=>t.dispatchSelected && !t.disabled)
this.drivers = data.drivers || []
this.schedule = data.schedule || {}

this.initMap()
UI.render()

},

initMap(){

this.map = L.map('map').setView([33.4484,-112.0740],10)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
maxZoom:19
}).addTo(this.map)

},

toggleEdit(){

this.editMode = !this.editMode

document.getElementById("editBtn").innerText =
this.editMode ? "Save" : "Edit"

UI.render()

},

toggleAll(){

const all = this.trips.every(t=>this.selected[t._id])

this.trips.forEach(t=>{
this.selected[t._id]=!all
})

UI.render()

},

focusDriver(id){

const d = this.drivers.find(x=>x._id===id)
if(!d) return

this.markers.forEach(m=>this.map.removeLayer(m))
this.markers=[]

if(d.lat && d.lng){

const m = L.marker([d.lat,d.lng])
.addTo(this.map)
.bindPopup(d.name)
.openPopup()

this.markers.push(m)

}

},

async assignManual(id,driverId){

const d=this.drivers.find(x=>x._id===driverId)
const t=this.trips.find(x=>x._id===id)

if(!d||!t) return

const s=this.schedule[d._id]||{}

t.driverId=d._id
t.driverName=d.name
t.vehicle=s.vehicleNumber||""

await Store.assignDriver(id,driverId)

UI.render()

},

async sendSelected(){

const ids=Object.keys(this.selected).filter(i=>this.selected[i])
if(!ids.length) return alert("No trips")

await Store.sendTrips(ids)
alert("Sent")

}

}