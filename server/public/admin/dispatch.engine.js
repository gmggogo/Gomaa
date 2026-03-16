const Engine={

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

this.trips=await Store.getTrips()||[]

this.drivers=await Store.getDrivers()||[]

this.schedule=await Store.getSchedule()||{}

this.sortTrips()

await this.prepareCoordinates()

UI.renderTrips(this.trips)

},

/* ===============================
SORT
================================ */

sortTrips(){

this.trips.sort((a,b)=>{

const da=new Date(`${a.tripDate}T${a.tripTime}`)
const db=new Date(`${b.tripDate}T${b.tripTime}`)

return da-db

})

},

/* ===============================
GEOCODE
================================ */

async geocode(address){

if(!address) return null

if(this.geoCache[address])
return this.geoCache[address]

const url=
`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

const res=await fetch(url,{headers:{'User-Agent':'sunbeam'}})

const data=await res.json()

if(!data.length) return null

const geo={
lat:parseFloat(data[0].lat),
lng:parseFloat(data[0].lon)
}

this.geoCache[address]=geo

return geo

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

const s=this.schedule[d._id]

if(s){

d.vehicleNumber=s.vehicleNumber
d.address=s.address

}

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

const mins=trip.durationMinutes||30

return new Date(start.getTime()+mins*60000)

},

/* ===============================
ACTIVE DRIVERS
================================ */

getActiveDrivers(trip){

return this.drivers.filter(d=>{

const s=this.schedule[d._id]

if(!s) return false

if(!s.enabled) return false

return true

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

if(!d.lat) continue

const route=await this.route(
d.lat,d.lng,
trip.pickupLat,trip.pickupLng
)

if(!route) continue

const score=route.duration

if(score<bestScore){

bestScore=score
best=d

}

}

return best

},

/* ===============================
ROUTE
================================ */

async route(fromLat,fromLng,toLat,toLng){

const key=`${fromLat}_${fromLng}_${toLat}_${toLng}`

if(this.routeCache[key])
return this.routeCache[key]

const url=
`${this.OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`

const res=await fetch(url)

const data=await res.json()

if(!data.routes.length) return null

const r=data.routes[0]

this.routeCache[key]=r

return r

},

/* ===============================
SAVE NOTES
================================ */

async saveNotes(tripId,notes){

const trip=this.trips.find(t=>t._id===tripId)

if(!trip) return

trip.notes=notes

await Store.updateTripNotes(tripId,notes)

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
trip.driverName=driver.name
trip.vehicle=driver.vehicleNumber

}

alert("Auto Dispatch Complete")

await this.load()

}

}