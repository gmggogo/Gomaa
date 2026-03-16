const Store = {

API_TRIPS: "/api/trips",
API_DRIVERS: "/api/users/driver",
API_SCHEDULE: "/api/driver-schedule",

/* ===============================
GET SELECTED TRIPS
================================ */

async getTrips(){

const res = await fetch(this.API_TRIPS)

if(!res.ok) return []

const trips = await res.json()

/* فقط الرحلات المختارة */

return trips.filter(t => t.selected === true)

},

/* ===============================
GET DRIVERS
================================ */

async getDrivers(){

const res = await fetch(this.API_DRIVERS)

if(!res.ok) return []

return await res.json()

},

/* ===============================
GET DRIVER SCHEDULE
================================ */

async getSchedule(){

const res = await fetch(this.API_SCHEDULE)

if(!res.ok) return {}

return await res.json()

},

/* ===============================
ASSIGN DRIVER
================================ */

async assignDriver(tripId,driverId){

await fetch(`/api/trips/${tripId}/assign`,{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
driverId
})

})

},

/* ===============================
SEND TRIP
================================ */

async sendTrip(id){

await fetch(`/api/trips/${id}/send`,{
method:"POST"
})

}

}