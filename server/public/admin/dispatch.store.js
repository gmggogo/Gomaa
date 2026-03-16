const Store = {

/* =========================
GET TRIPS
========================= */

async getTrips(){

try{

const res = await fetch("/api/trips")

if(!res.ok) throw new Error("Trips API Error")

return await res.json()

}catch(err){

console.error("Trips Load Error",err)

return []

}

},

/* =========================
GET USERS → FILTER DRIVERS
========================= */

async getDrivers(){

try{

const res = await fetch("/api/users")

if(!res.ok) return []

const users = await res.json()

return users.filter(u => u.role === "driver")

}catch(err){

console.error("Drivers Load Error",err)

return []

}

},

/* =========================
GET SCHEDULE
========================= */

async getSchedule(){

try{

const res = await fetch("/api/driver-schedule")

if(!res.ok) return {}

return await res.json()

}catch(err){

console.error("Schedule Error",err)

return {}

}

},

/* =========================
ASSIGN DRIVER
========================= */

async assignDriver(tripId,driverId){

await fetch(`/api/trips/${tripId}/assign`,{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({driverId})

})

},

/* =========================
SAVE NOTES
========================= */

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