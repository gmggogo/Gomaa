const Store = {

async getTrips(){
const res = await fetch("/api/trips")
return await res.json()
},

async getDrivers(){
const res = await fetch("/api/users/driver")
return await res.json()
},

async getSchedule(){
const res = await fetch("/api/driver-schedule")
return await res.json()
}

}

window.Store = Store