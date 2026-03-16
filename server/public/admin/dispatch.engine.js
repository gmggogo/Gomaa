const Engine = {

trips:[],
drivers:[],
schedule:{},
liveDrivers:[],

geoCache:{},
routeCache:{},

map:null,
tripMarkers:[],
driverMarkers:[],

OSRM:"https://router.project-osrm.org/route/v1/driving",

manualMode:false,
selectAll:false,

/* ===============================
LOAD
=============================== */

async load(){

try{

this.trips = await Store.getTrips() || []
this.drivers = await Store.getDrivers() || []
this.schedule = await Store.getSchedule() || {}
this.liveDrivers = await Store.getLiveDrivers() || []

this.sortTrips()

UI.renderTrips(this.trips)

UI.renderDriversPanel(
this.drivers,
this.schedule,
this.liveDrivers
)

this.bindSelection()

await this.initMap()

}catch(err){

console.error("Dispatch Load Error",err)

}

},

/* ===============================
SORT TRIPS
=============================== */

sortTrips(){

this.trips.sort((a,b)=>{

const da=new Date(`${a.tripDate} ${a.tripTime}`)
const db=new Date(`${b.tripDate} ${b.tripTime}`)

return da-db

})

},

/* ===============================
TODAY
=============================== */

getToday(){

const days=["sun","mon","tue","wed","thu","fri","sat"]

const now = new Date(
new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
)

return days[now.getDay()]

},

/* ===============================
ACTIVE DRIVERS
=============================== */

getActiveDrivers(){

const today=this.getToday()

return this.drivers.filter(d=>{

const s=this.schedule[d._id]

if(!s) return false
if(!s.enabled) return false
if(!s.days) return false

return s.days[today]

})

},

/* ===============================
SELECTION
=============================== */

bindSelection(){

document.querySelectorAll(".tripSelect").forEach(box=>{

box.addEventListener("change",()=>{

const row=box.closest("tr")
const btn=row.querySelector(".btn-send")

if(btn){

btn.disabled=!box.checked

}

})

})

},

getSelected(){

return [...document.querySelectorAll(".tripSelect:checked")]
.map(e=>e.value)

},

toggleSelectAll(){

this.selectAll=!this.selectAll

document.querySelectorAll(".tripSelect").forEach(b=>{

b.checked=this.selectAll

})

this.bindSelection()

},

/* ===============================
SEND TRIPS
=============================== */

async sendSelected(){

const ids=this.getSelected()

if(!ids.length){

alert("Select trips first")
return

}

await Store.sendTrips(ids)

await this.load()

},

async sendSingle(id){

await Store.sendTrips([id])

await this.load()

},

/* ===============================
MANUAL EDIT
=============================== */

toggleManualEdit(){

this.manualMode=!this.manualMode

document.querySelectorAll("tbody tr").forEach(row=>{

const selected=row.querySelector(".tripSelect")?.checked

if(!selected) return

const name=row.querySelector(".driverName")
const edit=row.querySelector(".driverEdit")

if(name) name.style.display=this.manualMode?"none":"inline"
if(edit) edit.style.display=this.manualMode?"block":"none"

})

},

async saveManualChanges(){

const rows=[...document.querySelectorAll("tbody tr")]

for(const row of rows){

const chk=row.querySelector(".tripSelect")

if(!chk?.checked) continue

const tripId=row.dataset.id

const driver=row.querySelector(".driverEdit")?.value
const note=row.querySelector(".noteEdit")?.value

if(driver){

await Store.assignDriver(tripId,driver)

}

if(note!==undefined){

await Store.saveNote(tripId,note)

}

}

this.manualMode=false

await this.load()

},

/* ===============================
AI DISPATCH
=============================== */

async aiDispatch(){

const ids=this.getSelected()

if(!ids.length){

alert("Select trips first")
return

}

const trips=this.trips
.filter(t=>ids.includes(t._id))
.sort((a,b)=>{

const da=new Date(`${a.tripDate} ${a.tripTime}`)
const db=new Date(`${b.tripDate} ${b.tripTime}`)

return da-db

})

const drivers=this.getActiveDrivers()

if(!drivers.length){

alert("No active drivers")
return

}

const driverState={}

for(const d of drivers){

driverState[d._id]={

location:
this.schedule[d._id]?.address
||d.address
||"",

tripCount:0

}

}

for(const trip of trips){

let bestDriver=null
let bestScore=999999

for(const d of drivers){

const state=driverState[d._id]

const route=await this.getRoute(
state.location,
trip.pickup
)

const distance=route?route.distance:999
const duration=route?route.duration:999

const fairness=state.tripCount*12

const score=distance+duration+fairness

if(score<bestScore){

bestScore=score
bestDriver=d

}

}

if(bestDriver){

await Store.assignDriver(trip._id,bestDriver._id)

driverState[bestDriver._id].location=trip.dropoff
driverState[bestDriver._id].tripCount++

}

}

await this.load()

},

/* ===============================
GEOCODE
=============================== */

async geocode(address){

if(!address) return null

if(this.geoCache[address]){

return this.geoCache[address]

}

try{

const url=
`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

const res=await fetch(url)

const data=await res.json()

if(!data.length) return null

const p={
lat:parseFloat(data[0].lat),
lng:parseFloat(data[0].lon)
}

this.geoCache[address]=p

return p

}catch{

return null

}

},

/* ===============================
ROUTE
=============================== */

async getRoute(from,to){

const key=from+"_"+to

if(this.routeCache[key]){

return this.routeCache[key]

}

const a=await this.geocode(from)
const b=await this.geocode(to)

if(!a||!b) return null

try{

const url=
`${this.OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`

const res=await fetch(url)

const data=await res.json()

if(!data.routes?.length) return null

const route={
distance:data.routes[0].distance/1000,
duration:data.routes[0].duration/60
}

this.routeCache[key]=route

return route

}catch{

return null

}

},

/* ===============================
MAP
=============================== */

async initMap(){

if(this.map) return

this.map=L.map("dispatchMap")
.setView([33.45,-112.07],10)

L.tileLayer(
"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
{
attribution:"OpenStreetMap"
}
).addTo(this.map)

await this.drawTrips()
await this.drawDrivers()

},

async drawTrips(){

for(const m of this.tripMarkers){

this.map.removeLayer(m)

}

this.tripMarkers=[]

for(const trip of this.trips){

const p=await this.geocode(trip.pickup)

if(!p) continue

const marker=L.marker([p.lat,p.lng])
.addTo(this.map)
.bindPopup(`Trip ${trip.tripNumber}`)

this.tripMarkers.push(marker)

}

},

async drawDrivers(){

for(const m of this.driverMarkers){

this.map.removeLayer(m)

}

this.driverMarkers=[]

for(const d of this.liveDrivers){

if(!d.lat||!d.lng) continue

const marker=L.circleMarker(
[d.lat,d.lng],
{
radius:8,
color:"green"
}
).addTo(this.map)

this.driverMarkers.push(marker)

}

}

}