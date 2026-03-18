const Store = {

API_TRIPS: "/api/trips",
API_DRIVERS: "/api/users/driver",

/* ================= GET TRIPS ================= */

async getTrips(){
try{
const res = await fetch(this.API_TRIPS)
return await res.json()
}catch(err){
console.error("Trips Error",err)
return []
}
},

/* ================= GET DRIVERS ================= */

async getDrivers(){
try{
const res = await fetch(this.API_DRIVERS)
return await res.json()
}catch(err){
console.error("Drivers Error",err)
return []
}
},

/* ================= UPDATE TRIP ================= */

async updateTrip(id,data){
try{
await fetch("/api/trips/"+id,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify(data)
})
}catch(err){
console.error("Update Error",err)
}
}

}