const Store = {

/* ===============================
GET DISPATCH TRIPS
================================ */

async getTrips(){

const res = await fetch("/api/dispatch")

if(!res.ok){
throw new Error("Dispatch trips error")
}

return await res.json()

},

/* ===============================
GET DRIVERS
================================ */

async getDrivers(){

const res = await fetch("/api/drivers")

if(!res.ok){
return []
}

return await res.json()

},

/* ===============================
GET DRIVER SCHEDULE
================================ */

async getSchedule(){

const res = await fetch("/api/driver-schedule")

if(!res.ok){
return {}
}

return await res.json()

},

/* ===============================
ASSIGN DRIVER
================================ */

async assignDriver(tripId,driverId){

await fetch("/api/dispatch/assignDriver",{

method:"POST",
headers:{ "Content-Type":"application/json" },

body: JSON.stringify({
tripId,
driverId
})

})

},

/* ===============================
SEND TRIP
================================ */

async sendTrip(id){

await fetch(`/api/dispatch/send/${id}`,{
method:"POST"
})

},

/* ===============================
REMOVE TRIP
================================ */

async removeTrip(id){

await fetch(`/api/dispatch/remove/${id}`,{
method:"POST"
})

}

}