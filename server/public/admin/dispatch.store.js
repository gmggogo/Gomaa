const Store = {

/* ===============================
GET TRIPS
================================ */

async getTrips(){

try{

const res = await fetch("/api/trips")

if(!res.ok) return []

return await res.json()

}catch(e){

console.error("Trips Load Error",e)

return []

}

},

/* ===============================
GET DRIVERS
================================ */

async getDrivers(){

try{

const res = await fetch("/api/users")

if(!res.ok) return []

const users = await res.json()

/* فلترة السواقين فقط */

return users.filter(u=>u.role==="driver")

}catch(e){

console.error("Drivers Load Error",e)

return []

}

},

/* ===============================
GET SCHEDULE
================================ */

async getSchedule(){

try{

const res = await fetch("/api/driver-schedule")

if(!res.ok) return {}

return await res.json()

}catch(e){

console.error("Schedule Load Error",e)

return {}

}

},

/* ===============================
ASSIGN DRIVER
================================ */

async assignDriver(tripId,driverId){

try{

await fetch(`/api/trips/${tripId}/assign`,{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
driverId:driverId
})

})

}catch(e){

console.error("Assign Error",e)

}

}

}