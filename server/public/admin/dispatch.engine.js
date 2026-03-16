const Engine = {

trips: [],
drivers: [],
schedule: {},

/* ===============================
LOAD
================================ */

async load(){

try{

this.trips = await Store.getTrips()
this.drivers = await Store.getDrivers()
this.schedule = await Store.getSchedule()

this.sortTrips()

UI.renderTrips(this.trips)

}catch(err){

console.error("Dispatch Load Error",err)

}

},

/* ===============================
SORT TRIPS
================================ */

sortTrips(){

this.trips.sort((a,b)=>{

const da=new Date(`${a.tripDate} ${a.tripTime}`)
const db=new Date(`${b.tripDate} ${b.tripTime}`)

return da-db

})

},

/* ===============================
TODAY
================================ */

getToday(){

const days=["sun","mon","tue","wed","thu","fri","sat"]

const now=new Date(
new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
)

return days[now.getDay()]

},

/* ===============================
ACTIVE DRIVERS
================================ */

getActiveDrivers(){

const day=this.getToday()

return this.drivers.filter(d=>{

const s=this.schedule[d._id]

if(!s) return false
if(!s.enabled) return false

return s.days && s.days[day]

})

},

/* ===============================
DISTANCE SCORE
================================ */

addressScore(a,b){

if(!a || !b) return 10

a=a.toLowerCase()
b=b.toLowerCase()

let score=0

a.split(" ").forEach(w=>{
if(b.includes(w)) score++
})

return 10-score

},

/* ===============================
DRIVER TRIPS COUNT
================================ */

driverTrips(id){

return this.trips.filter(t=>t.driverId===id).length

},

/* ===============================
LAST TRIP
================================ */

lastTrip(driverId){

const list=this.trips
.filter(t=>t.driverId===driverId)

if(!list.length) return null

list.sort((a,b)=>{

const da=new Date(`${a.tripDate} ${a.tripTime}`)
const db=new Date(`${b.tripDate} ${b.tripTime}`)

return db-da

})

return list[0]

},

/* ===============================
FIRST ROUND
================================ */

firstRoundDriver(trip,drivers){

let best=null
let bestScore=999

drivers.forEach(d=>{

if(this.driverTrips(d._id)>0) return

const addr=this.schedule[d._id]?.address

const score=this.addressScore(addr,trip.pickup)

if(score<bestScore){

bestScore=score
best=d

}

})

return best

},

/* ===============================
SMART DRIVER
================================ */

smartDriver(trip,drivers){

let best=null
let bestScore=9999

drivers.forEach(d=>{

const last=this.lastTrip(d._id)

const from = last ? last.dropoff : this.schedule[d._id]?.address

const distance=this.addressScore(from,trip.pickup)

const trips=this.driverTrips(d._id)

const score = distance + trips*5

if(score<bestScore){

bestScore=score
best=d

}

})

return best

},

/* ===============================
REDISTRIBUTE
================================ */

async redistributeSelected(){

const ids=this.getSelected()

if(!ids.length){

alert("Select trips")
return

}

const drivers=this.getActiveDrivers()

const trips=this.trips.filter(t=>ids.includes(t._id))

for(const trip of trips){

if(trip.driverId) continue

let driver=this.firstRoundDriver(trip,drivers)

if(!driver){

driver=this.smartDriver(trip,drivers)

}

if(!driver) continue

await Store.assignDriver(trip._id,driver._id)

trip.driverId=driver._id

}

alert("Trips redistributed")

await this.load()

},

/* ===============================
GET SELECTED
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

for(const id of ids){

await Store.sendTrip(id)

}

alert("Trips Sent")

await this.load()

},

/* ===============================
SEND SINGLE
================================ */

async sendSingle(id){

await Store.sendTrip(id)

alert("Trip Sent")

await this.load()

}

}