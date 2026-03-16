const Store = {

API_TRIPS: "/api/trips",
API_DRIVERS: "/api/users/driver",
API_SCHEDULE: "/api/driver-schedule",

/* ===============================
GET TRIPS
================================ */

async getTrips(){

const res = await fetch(this.API_TRIPS)

if(!res.ok) return []

return await res.json()

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
driverId:driverId
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

},

/* ===============================
REMOVE TRIP
================================ */

async removeTrip(id){

await fetch(`/api/trips/${id}`,{
method:"DELETE"
})

}

}