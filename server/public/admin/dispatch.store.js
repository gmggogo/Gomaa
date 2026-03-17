const Store = {

async getTrips(){
const r=await fetch("/api/dispatch")
return r.ok?await r.json():[]
},

async getDrivers(){
const r=await fetch("/api/drivers")
return r.ok?await r.json():[]
},

async getSchedule(){
const r=await fetch("/api/driver-schedule")
return r.ok?await r.json():{}
},

async getLiveDrivers(){
const r=await fetch("/api/admin/live-drivers")
return r.ok?await r.json():[]
},

async assignDriver(id,driverId){
await fetch(`/api/dispatch/${id}/driver`,{
method:"PATCH",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({driverId})
})
}

}