const Store = {

async getTrips(){
try{
const res = await fetch("/api/trips")
return await res.json()
}catch(e){
console.log("Trips API Error", e)
return []
}
},

async getDrivers(){
try{
const res = await fetch("/api/users/driver")
return await res.json()
}catch(e){
console.log("Drivers API Error", e)
return []
}
},

async getSchedule(){
try{
const res = await fetch("/api/driver-schedule")
return await res.json()
}catch(e){
console.log("Schedule API Error", e)
return {}
}
}

}

window.Store = Store