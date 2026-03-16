const Store = {

  API_DISPATCH: "/api/dispatch",
  API_DRIVERS: "/api/drivers",
  API_SCHEDULE: "/api/driver-schedule",
  API_LIVE: "/api/admin/live-drivers",

  async getTrips(){
    const res = await fetch(this.API_DISPATCH)
    if(!res.ok) return []
    return await res.json()
  },

  async getDrivers(){
    const res = await fetch(this.API_DRIVERS)
    if(!res.ok) return []
    return await res.json()
  },

  async getSchedule(){
    const res = await fetch(this.API_SCHEDULE)
    if(!res.ok) return {}
    return await res.json()
  },

  async getLiveDrivers(){
    const res = await fetch(this.API_LIVE)
    if(!res.ok) return []
    return await res.json()
  },

  async assignDriver(tripId, driverId){
    const res = await fetch(`/api/dispatch/${tripId}/driver`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ driverId })
    })

    if(!res.ok){
      throw new Error("Driver assign failed")
    }

    return await res.json()
  },

  async saveNote(tripId, note){
    const res = await fetch(`/api/dispatch/${tripId}/note`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ note: note || "" })
    })

    if(!res.ok){
      throw new Error("Save note failed")
    }

    return await res.json()
  },

  async sendTrips(ids){
    const res = await fetch("/api/dispatch/send", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ids })
    })

    if(!res.ok){
      throw new Error("Send trips failed")
    }

    return await res.json()
  }

}