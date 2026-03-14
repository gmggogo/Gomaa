const API="/api/dispatch"

const Store={

async getTrips(){

const res=await fetch(API)
return await res.json()

},

async getDrivers(){

const res=await fetch("/api/drivers")
return await res.json()

},

async sendTrip(id){

await fetch(API+"/send/"+id,{
method:"POST"
})

},

async assignDriver(tripId,driverId){

await fetch(API+"/assignDriver",{

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