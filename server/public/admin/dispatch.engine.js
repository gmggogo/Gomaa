const Engine = {

trips: [],
drivers: [],
schedule: {},

/* ===============================
LOAD DATA
================================ */

async load(){

try{

this.trips = await Store.getTrips()
this.drivers = await Store.getDrivers()
this.schedule = await Store.getSchedule()

UI.renderTrips(this.trips,this.drivers)

}catch(err){

console.error("Dispatch Load Error",err)

}

},

/* ===============================
GET TODAY (Arizona)
================================ */

getToday(){

const days=["sun","mon","tue","wed","thu","fri","sat"]

const now=new Date(
new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
)

return days[now.getDay()]

},

/* ===============================
FILTER AVAILABLE DRIVERS
================================ */

getAvailableDrivers(){

const day=this.getToday()

return this.drivers.filter(d=>{

const s=this.schedule[d._id]

if(!s) return false
if(!s.enabled) return false
if(!s.days) return false

return s.days[day]

})

},

/* ===============================
ROUND ROBIN DISTRIBUTION
================================ */

async distributeTrips(){

const drivers=this.getAvailableDrivers()

if(!drivers.length){

alert("No drivers available today")
return

}

let driverIndex=0

for(const trip of this.trips){

if(trip.driverId) continue
if(trip.disabled) continue

const driver=drivers[driverIndex]

await Store.assignDriver(trip._id,driver._id)

driverIndex++

if(driverIndex>=drivers.length){
driverIndex=0
}

}

alert("Trips Distributed")

await this.load()

},

/* ===============================
GET SELECTED TRIPS
================================ */

getSelected(){

return [...document.querySelectorAll(".tripSelect:checked")]
.map(c=>c.value)

},

/* ===============================
SEND SELECTED
================================ */

async sendSelected(){

const ids=this.getSelected()

if(!ids.length){
alert("Select trips first")
return
}

for(const id of ids){

await Store.sendTrip(id)

}

alert("Trips Sent")

await this.load()

},

/* ===============================
SEND SINGLE TRIP
================================ */

async sendSingle(id){

await Store.sendTrip(id)

alert("Trip Sent")

await this.load()

},

/* ===============================
SAVE DRIVER MANUAL
================================ */

async saveDrivers(){

const edits=document.querySelectorAll(".driverEdit")

for(const sel of edits){

const row=sel.closest("tr")

const tripId=row.dataset.id
const driverId=sel.value

if(!driverId) continue

await Store.assignDriver(tripId,driverId)

}

alert("Drivers Updated")

await this.load()

},

/* ===============================
REMOVE FROM DISPATCH
================================ */

async removeTrip(id){

await Store.removeTrip(id)

alert("Trip Removed")

await this.load()

}

}