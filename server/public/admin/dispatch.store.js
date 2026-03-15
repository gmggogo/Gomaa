const Store={

/* ===============================
GET TRIPS
================================ */

async getTrips(){

const res = await fetch("/api/trips")

const data = await res.json()

/* نرجع الرحلات اللي متعلم عليها dispatch */

return data.filter(t => t.inDispatch === true)

},


/* ===============================
GET DRIVERS
================================ */

async getDrivers(){

const res = await fetch("/api/drivers")

return await res.json()

},


/* ===============================
SEND TRIP TO DISPATCH
================================ */

async sendTrip(id){

await fetch("/api/dispatch/send/"+id,{
method:"POST"
})

},


/* ===============================
ASSIGN DRIVER
================================ */

async assignDriver(tripId,driverId){

await fetch("/api/dispatch/assignDriver",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
tripId,
driverId
})

})

}

}