const Engine = {

trips:[],
drivers:[],
schedule:{},

geoCache:{},

/* =========================
LOAD
========================= */

async load(){

this.trips = await Store.getTrips() || []
this.drivers = await Store.getDrivers() || []
this.schedule = await Store.getSchedule() || {}

this.sortTrips()

await this.prepareCoordinates()

UI.renderTrips(this.trips)

DispatchMap.clear()

DispatchMap.renderDrivers(this.drivers)

DispatchMap.renderTrips(this.trips)

DispatchMap.fit()

},

/* =========================
SORT
========================= */

sortTrips(){

this.trips.sort((a,b)=>{

const da = new Date(`${a.tripDate}T${a.tripTime}`)
const db = new Date(`${b.tripDate}T${b.tripTime}`)

return da-db

})

},

/* =========================
GEOCODE
========================= */

async geocode(address){

if(!address) return null

if(this.geoCache[address]) return this.geoCache[address]

const url=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

const res=await fetch(url)

const data=await res.json()

if(!data.length) return null

const geo={

lat:parseFloat(data[0].lat),
lng:parseFloat(data[0].lon)

}

this.geoCache[address]=geo

return geo

},

/* =========================
PREPARE COORDINATES
========================= */

async prepareCoordinates(){

for(const trip of this.trips){

if(!trip.pickupLat){

const g=await this.geocode(trip.pickup)

if(g){

trip.pickupLat=g.lat
trip.pickupLng=g.lng

}

}

}

for(const d of this.drivers){

if(!d.address) continue

const g=await this.geocode(d.address)

if(g){

d.lat=g.lat
d.lng=g.lng

}

}

},

/* =========================
SAVE NOTES
========================= */

async saveNotes(tripId,notes){

await Store.updateTripNotes(tripId,notes)

},

/* =========================
AUTO DISPATCH
========================= */

async autoDispatch(){

for(const trip of this.trips){

if(trip.driverId) continue

const driver=this.drivers[0]

if(!driver) continue

await Store.assignDriver(trip._id,driver._id)

trip.driverName=driver.name
trip.vehicle=driver.vehicle

}

alert("Auto Dispatch Complete")

await this.load()

}

}