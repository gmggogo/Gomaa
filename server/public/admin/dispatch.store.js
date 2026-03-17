const Store = {

  API_ALL: "/api/dispatch",
  API_ASSIGN: "/api/dispatch",
  API_SEND: "/api/dispatch/send",

  /* ================= LOAD ALL ================= */
  async loadAll(){

    try{

      const res = await fetch(this.API_ALL)

      if(!res.ok){
        console.error("API Failed")
        return { trips:[], drivers:[], schedule:{} }
      }

      const data = await res.json()

      return {
        trips: data.trips || [],
        drivers: data.drivers || [],
        schedule: data.schedule || {}
      }

    }catch(err){
      console.error("LoadAll Error", err)
      return { trips:[], drivers:[], schedule:{} }
    }

  },

  /* ================= ASSIGN DRIVER ================= */
  async assignDriver(tripId, driverId){

    try{

      const res = await fetch(`${this.API_ASSIGN}/${tripId}/driver`,{
        method:"PATCH",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ driverId })
      })

      return await res.json()

    }catch(err){
      console.error("Assign Error", err)
    }

  },

  /* ================= DISABLE ================= */
  async disableTrip(tripId){

    try{

      const res = await fetch(`${this.API_ASSIGN}/${tripId}/disable`,{
        method:"PATCH"
      })

      return await res.json()

    }catch(err){
      console.error("Disable Error", err)
    }

  },

  /* ================= SEND ================= */
  async sendTrips(ids){

    try{

      const res = await fetch(this.API_SEND,{
        method:"PATCH",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ ids })
      })

      return await res.json()

    }catch(err){
      console.error("Send Error", err)
    }

  }

}