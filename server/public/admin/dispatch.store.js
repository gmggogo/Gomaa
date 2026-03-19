const Store = {

  /* ================= LOAD ================= */

  async load(){

    try{

      const tripsRes = await fetch("/api/trips")
      const driversRes = await fetch("/api/users/driver")
      const scheduleRes = await fetch("/api/driver-schedule")

      const trips = await tripsRes.json()
      const drivers = await driversRes.json()
      const schedule = await scheduleRes.json()

      return {
        trips: trips || [],
        drivers: drivers || [],
        schedule: schedule || {}
      }

    }catch(e){
      console.error("Store Load Error", e)
      return { trips: [], drivers: [], schedule: {} }
    }

  },

  /* ================= ACTIONS ================= */

  async assignDriver(tripId, driverId){

    return fetch(`/api/trips/${tripId}/driver`,{
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

window.Store = Store