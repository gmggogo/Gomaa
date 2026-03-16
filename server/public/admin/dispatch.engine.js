const Engine = {

trips:[],
drivers:[],
schedule:{},

geoCache:{},
routeCache:{},

OSRM:"https://router.project-osrm.org/route/v1/driving",

/* ===============================
LOAD
================================ */

async load(){

try{

this.trips = await Store.getTrips() || []
this.drivers = await Store.getDrivers() || []
this.schedule = await Store.getSchedule() || {}

this.sortTrips()

await this.prepareCoordinates()

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

const da = new Date(`${a.tripDate}T${a.tripTime}`)
const db = new Date(`${b.tripDate}T${b.tripTime}`)

return da-db

})

},

/* ===============================
GEOCODE
================================ */

async geocode(address){

if(!address) return null

if(this.geoCache[address]) return this.geoCache[address]

try{

const url=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

const res=await fetch(url,{
headers:{'User-Agent':'sunbeam'}
})

const data=await res.json()

if(!data.length) return null

const geo={
lat:parseFloat(data[0].lat),
lng:parseFloat(data[0].lon)
}

this.geoCache[address]=geo

return geo

}catch(e){

console.error("Geocode error",e)
return null

}

},

/* ===============================
PREPARE COORDINATES
================================ */

async prepareCoordinates(){

for(const trip of this.trips){

if(!trip.pickupLat){

const g=await this.geocode(trip.pickup)

if(g){

trip.pickupLat=g.lat
trip.pickupLng=g.lng

}

}

if(!trip.dropoffLat){

const g=await this.geocode(trip.dropoff)

if(g){

trip.dropoffLat=g.lat
trip.dropoffLng=g.lng

}

}

}

for(const d of this.drivers){

if(!d.lat && d.address){

const g=await this.geocode(d.address)

if(g){

d.lat=g.lat
d.lng=g.lng

}

}

}

},

/* ===============================
TIME
================================ */

tripStart(trip){

return new Date(`${trip.tripDate}T${trip.tripTime}`)

},

tripEnd(trip){

const start=this.tripStart(trip)

const mins = trip.durationMinutes || 30

return new Date(start.getTime()+mins*60000)

},

/* ===============================
LAST TRIP
================================ */

getLastTrip(driverId,trip){

const start=this.tripStart(trip)

const list=this.trips
.filter(t=>t.driverId===driverId)
.filter(t=>this.tripStart(t)<start)
.sort((a,b)=>this.tripStart(b)-this.tripStart(a))

return list.length ? list[0] : null

},

/* ===============================
DRIVER AVAILABLE
================================ */

driverAvailable(driver,trip){

const last=this.getLastTrip(driver._id,trip)

if(!last) return true

const end=this.tripEnd(last)
const start=this.tripStart(trip)

const gap=(start-end)/60000

return gap>10

},

/* ===============================
ROUTE
================================ */

async route(fromLat,fromLng,toLat,toLng){

const key=`${fromLat},${fromLng}_${toLat},${toLng}`

if(this.routeCache[key]) return this.routeCache[key]

try{

const url=`${this.OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`

const res=await fetch(url)

const data=await res.json()

if(!data.routes.length) return null

const r=data.routes[0]

this.routeCache[key]=r

return r

}catch(e){

console.error("Route error",e)

return null

}

},

/* ===============================
CHAIN SCORE
================================ */

async chainScore(driver,trip){

let fromLat=driver.lat
let fromLng=driver.lng

const last=this.getLastTrip(driver._id,trip)

if(last){

fromLat=last.dropoffLat
fromLng=last.dropoffLng

}

const route=await this.route(
fromLat,
fromLng,
trip.pickupLat,
trip.pickupLng
)

if(!route) return 999999

let score=route.duration

/* fairness */

const tripsToday=this.trips
.filter(t=>t.driverId===driver._id)
.filter(t=>t.tripDate===trip.tripDate)
.length

score += tripsToday*600

/* chain bonus */

if(last){

const end=this.tripEnd(last)
const start=this.tripStart(trip)

const gap=(start-end)/60000

if(gap<45){
score -= 400
}

}

/* distance bonus */

const distKm=route.distance/1000

if(distKm<2){
score -= 200
}

return score

},

/* ===============================
ACTIVE DRIVERS
================================ */

getActiveDrivers(trip){

const days=["sun","mon","tue","wed","thu","fri","sat"]

const d=new Date(`${trip.tripDate}T${trip.tripTime}`)

const day=days[d.getDay()]

return this.drivers.filter(driver=>{

const s=this.schedule[driver._id]

if(!s) return false
if(!s.enabled) return false

return s.days && s.days[day]

})

},

/* ===============================
BEST DRIVER
================================ */

async bestDriver(trip){

const drivers=this.getActiveDrivers(trip)

let best=null
let bestScore=999999

for(const d of drivers){

if(!this.driverAvailable(d,trip)) continue

const score=await this.chainScore(d,trip)

if(score<bestScore){

bestScore=score
best=d

}

}

return best

},

/* ===============================
AUTO DISPATCH
================================ */

async autoDispatch(){

const trips=this.trips
.filter(t=>!t.driverId)
.sort((a,b)=>this.tripStart(a)-this.tripStart(b))

for(const trip of trips){

const driver=await this.bestDriver(trip)

if(!driver) continue

await Store.assignDriver(trip._id,driver._id)

trip.driverId=driver._id
trip.driverName=driver.name || ""
trip.vehicle=driver.vehicleNumber || ""

}

alert("Auto Dispatch Complete")

await this.load()

},

/* ===============================
DISTRIBUTE SELECTED
================================ */

async distributeSelected(){

const ids=[...document.querySelectorAll(".tripSelect:checked")]
.map(e=>e.value)

const trips=this.trips
.filter(t=>ids.includes(t._id))
.sort((a,b)=>this.tripStart(a)-this.tripStart(b))

for(const trip of trips){

if(trip.driverId) continue

const driver=await this.bestDriver(trip)

if(!driver) continue

await Store.assignDriver(trip._id,driver._id)

trip.driverId=driver._id
trip.driverName=driver.name || ""
trip.vehicle=driver.vehicleNumber || ""

}

alert("Trips Distributed")

await this.load()

}

}