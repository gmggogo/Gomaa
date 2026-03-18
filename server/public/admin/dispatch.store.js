const Store = {

API: "/api/dispatch",

/* ===============================
LOAD ALL DATA
================================ */

async load(){

  const res = await fetch(this.API)

  if(!res.ok){
    console.error("Dispatch API Error")
    return { trips:[], drivers:[], schedule:{} }
  }

  const data = await res.json()

  return {
    trips: data.trips || [],
    drivers: data.drivers || [],
    schedule: data.schedule || {}
  }

},

/* ===============================
ASSIGN DRIVER
================================ */

async assignDriver(tripId, driverId){

  return fetch(`/api/dispatch/${tripId}/driver`,{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ driverId })
  })

},

/* ===============================
SEND TRIPS
================================ */

async sendTrips(ids){

  return fetch("/api/dispatch/send",{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ ids })
  })

},

/* ===============================
DISABLE TRIP
================================ */

async disableTrip(id){

  return fetch(`/api/trips/${id}`,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ disabled:true })
  })

}

}