const Store={

/* ===============================
GET TRIPS
================================ */

async getTrips(){

const res=await fetch("/api/trips")

if(!res.ok) return []

return await res.json()

},

/* ===============================
GET DRIVERS
================================ */

async getDrivers(){

const res=await fetch("/api/users/driver")

if(!res.ok) return []

return await res.json()

},

/* ===============================
GET SCHEDULE
================================ */

async getSchedule(){

const res=await fetch("/api/driver-schedule")

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

body:JSON.stringify({driverId})

})

},

/* ===============================
SAVE NOTES
================================ */

async updateTripNotes(tripId,notes){

await fetch(`/api/trips/${tripId}/notes`,{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({notes})

})

}

}