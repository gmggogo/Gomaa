const Store = {

API_DISPATCH: "/api/dispatch",
API_LIVE: "/api/admin/live-drivers",

/* ================= LOAD ALL ================= */
async loadAll(){

  try{

    const res = await fetch(this.API_DISPATCH)

    if(!res.ok){
      console.error("Dispatch API failed")
      return { trips:[], drivers:[], schedule:{} }
    }

    const data = await res.json()

    console.log("Dispatch Loaded:", data)

    return {
      trips: data.trips || [],
      drivers: data.drivers || [],
      schedule: data.schedule || {}
    }

  }catch(err){
    console.error("Dispatch Error", err)
    return { trips:[], drivers:[], schedule:{} }
  }

},

/* ================= LIVE ================= */
async getLiveDrivers(){

  try{

    const res = await fetch(this.API_LIVE)

    if(!res.ok){
      console.error("Live API failed")
      return []
    }

    const data = await res.json()

    return Array.isArray(data) ? data : data.drivers || []

  }catch(err){
    console.error("Live Error", err)
    return []
  }

},

/* ================= ASSIGN ================= */
async assignDriver(tripId, driverId){

  const res = await fetch(`/api/dispatch/${tripId}/driver`,{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ driverId })
  })

  return await res.json()
},

/* ================= NOTE ================= */
async saveNote(tripId, note){

  const res = await fetch(`/api/dispatch/${tripId}/note`,{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ note })
  })

  return await res.json()
},

/* ================= SEND ================= */
async sendTrips(ids){

  const res = await fetch("/api/dispatch/send",{
    method:"PATCH",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ ids })
  })

  return await res.json()
}

}