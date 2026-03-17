const Store = {

  API_TRIPS: "/api/dispatch",
  API_DRIVERS: "/api/drivers",
  API_SCHEDULE: "/api/driver-schedule",
  API_LIVE: "/api/admin/live-drivers",

  /* ===============================
  GET TRIPS
  ============================== */
  async getTrips(){
    try{
      const res = await fetch(this.API_TRIPS)
      return await res.json()
    }catch(e){
      console.error("Trips error", e)
      return []
    }
  },

  /* ===============================
  GET DRIVERS
  ============================== */
  async getDrivers(){
    try{
      const res = await fetch(this.API_DRIVERS)
      return await res.json()
    }catch(e){
      console.error("Drivers error", e)
      return []
    }
  },

  /* ===============================
  GET SCHEDULE
  ============================== */
  async getSchedule(){
    try{
      const res = await fetch(this.API_SCHEDULE)
      return await res.json()
    }catch(e){
      console.error("Schedule error", e)
      return {}
    }
  },

  /* ===============================
  LIVE DRIVERS (FIXED)
  ============================== */
  async getLiveDrivers(){
    try{
      const res = await fetch(this.API_LIVE)
      return await res.json()
    }catch(e){
      console.error("Live drivers error", e)
      return []
    }
  },

  /* ===============================
  ASSIGN DRIVER
  ============================== */
  async assignDriver(tripId, driverId){

    await fetch(`/api/dispatch/${tripId}/driver`,{
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ driverId })
    })

  },

  /* ===============================
  SAVE NOTE
  ============================== */
  async saveNote(tripId, note){

    await fetch(`/api/dispatch/${tripId}/note`,{
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ note })
    })

  },

  /* ===============================
  SEND TRIPS
  ============================== */
  async sendTrips(ids){

    await fetch(`/api/dispatch/send`,{
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ ids })
    })

  }

}