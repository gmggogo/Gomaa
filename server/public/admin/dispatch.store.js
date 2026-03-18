const Store = {

API: "/api/dispatch",

async load(){

  const res = await fetch(this.API)
  if(!res.ok) throw "load error"

  return await res.json()

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

}

}