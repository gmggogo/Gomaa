const Store = {

API: "/api/dispatch",

async load(){

  const res = await fetch(this.API)

  if(!res.ok) throw "Dispatch Load Error"

  const data = await res.json()

  return {
    trips: data.trips || [],
    drivers: data.drivers || [],
    schedule: data.schedule || {}
  }

},

async assignDriver(tripId, driverId){

  return fetch(`/api/dispatch/${tripId}/driver`,{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ driverId })
  })

},

async sendTrips(ids){

  return fetch("/api/dispatch/send",{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ ids })
  })

},

async disableTrip(id){

  return fetch(`/api/trips/${id}`,{
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ disabled:true })
  })

}

}