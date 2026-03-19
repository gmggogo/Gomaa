const Store = {

  API_TRIPS: "/api/trips",
  API_DRIVERS: "/api/users/driver",
  API_SCHEDULE: "/api/driver-schedule",

  /* ================= GET TRIPS ================= */

  async getTrips(){
    try{
      const res = await fetch(this.API_TRIPS)
      const data = await res.json()
      return data || []
    }catch(e){
      console.log("Trips Error", e)
      return []
    }
  },

  /* ================= GET DRIVERS ================= */

  async getDrivers(){
    try{
      const res = await fetch(this.API_DRIVERS)
      const data = await res.json()
      return data || []
    }catch(e){
      console.log("Drivers Error", e)
      return []
    }
  },

  /* ================= GET SCHEDULE ================= */

  async getSchedule(){
    try{
      const res = await fetch(this.API_SCHEDULE)
      const data = await res.json()
      return data || {}
    }catch(e){
      console.log("Schedule Error", e)
      return {}
    }
  }

}

window.Store = Store