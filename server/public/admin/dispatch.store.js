const Store = {

API: "/api/dispatch",

async load(){

  const res = await fetch(this.API)

  if(!res.ok){
    console.error("Dispatch API Error")
    return { trips:[], drivers:[], schedule:{} }
  }

  const data = await res.json()

  console.log("🔥 DISPATCH DATA:", data) // 👈 مهم جداً

  return {
    trips: Array.isArray(data.trips) ? data.trips : [],
    drivers: Array.isArray(data.drivers) ? data.drivers : [],
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