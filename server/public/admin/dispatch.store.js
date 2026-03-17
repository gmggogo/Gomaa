const Store = {

  API_DISPATCH: "/api/dispatch",
  API_DRIVERS: "/api/drivers",
  API_SCHEDULE: "/api/driver-schedule",
  API_LIVE: "/api/admin/live-drivers",

  async getTrips(){
    try{
      const res = await fetch(this.API_DISPATCH)
      if(!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }catch{
      return []
    }
  },

  async getDrivers(){
    try{
      const res = await fetch(this.API_DRIVERS)
      if(!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }catch{
      return []
    }
  },

  async getSchedule(){
    try{
      const res = await fetch(this.API_SCHEDULE)
      if(!res.ok) return {}
      return await res.json()
    }catch{
      return {}
    }
  },

  async getLiveDrivers(){
    try{
      const res = await fetch(this.API_LIVE)
      if(!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }catch{
      return []
    }
  },

  async assignDriver(tripId, driverId){
    return fetch(`/api/dispatch/${tripId}/driver`, {
      method:"PATCH",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ driverId })
    })
  }

}