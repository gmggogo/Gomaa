const Store = {

  API_DISPATCH: "/api/dispatch",
  API_DRIVERS: "/api/drivers",
  API_SCHEDULE: "/api/driver-schedule",
  API_LIVE: "/api/admin/live-drivers",

  /* ===============================
     GET TRIPS
  ================================= */

  async getTrips(){
    try{
      const res = await fetch(this.API_DISPATCH)

      if(!res.ok){
        console.error("Trips API failed:", res.status)
        return []
      }

      const data = await res.json()

      return Array.isArray(data) ? data : []

    }catch(err){
      console.error("Trips Error:", err)
      return []
    }
  },

  /* ===============================
     GET DRIVERS
  ================================= */

  async getDrivers(){
    try{
      const res = await fetch(this.API_DRIVERS)

      if(!res.ok){
        console.error("Drivers API failed:", res.status)
        return []
      }

      const data = await res.json()

      return Array.isArray(data) ? data : []

    }catch(err){
      console.error("Drivers Error:", err)
      return []
    }
  },

  /* ===============================
     GET SCHEDULE
  ================================= */

  async getSchedule(){
    try{
      const res = await fetch(this.API_SCHEDULE)

      if(!res.ok){
        console.error("Schedule API failed:", res.status)
        return {}
      }

      const data = await res.json()

      return data || {}

    }catch(err){
      console.error("Schedule Error:", err)
      return {}
    }
  },

  /* ===============================
     GET LIVE DRIVERS
  ================================= */

  async getLiveDrivers(){
    try{
      const res = await fetch(this.API_LIVE)

      if(!res.ok){
        console.error("Live Drivers API failed:", res.status)
        return []
      }

      const data = await res.json()

      return Array.isArray(data) ? data : []

    }catch(err){
      console.error("Live Drivers Error:", err)
      return []
    }
  },

  /* ===============================
     ASSIGN DRIVER
  ================================= */

  async assignDriver(tripId, driverId){

    try{

      const res = await fetch(`/api/dispatch/${tripId}/driver`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ driverId })
      })

      if(!res.ok){
        console.error("Assign driver failed:", res.status)
        return null
      }

      return await res.json()

    }catch(err){
      console.error("Assign Driver Error:", err)
      return null
    }

  },

  /* ===============================
     SAVE NOTE
  ================================= */

  async saveNote(tripId, note){

    try{

      const res = await fetch(`/api/dispatch/${tripId}/note`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ note: note || "" })
      })

      if(!res.ok){
        console.error("Save note failed:", res.status)
        return null
      }

      return await res.json()

    }catch(err){
      console.error("Save Note Error:", err)
      return null
    }

  },

  /* ===============================
     SEND TRIPS
  ================================= */

  async sendTrips(ids){

    try{

      const res = await fetch("/api/dispatch/send", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids })
      })

      if(!res.ok){
        console.error("Send trips failed:", res.status)
        return null
      }

      return await res.json()

    }catch(err){
      console.error("Send Trips Error:", err)
      return null
    }

  }

}