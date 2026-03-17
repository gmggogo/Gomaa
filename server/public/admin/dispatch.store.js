const Store = {

  API_DISPATCH: "/api/dispatch",
  API_DRIVERS: "/api/drivers",
  API_SCHEDULE: "/api/driver-schedule",
  API_LIVE: "/api/admin/live-drivers",

  /* ================= GET TRIPS ================= */
  async getTrips(){

    try{

      const res = await fetch(this.API_DISPATCH)

      if(!res.ok){
        console.error("Trips API failed")
        return []
      }

      const data = await res.json()

      console.log("Trips Loaded:", data)

      // 💥 أهم سطر عشان أي فورمات
      return Array.isArray(data) ? data : data.trips || []

    }catch(err){
      console.error("Trips Error", err)
      return []
    }

  },

  /* ================= DRIVERS ================= */
  async getDrivers(){

    try{

      const res = await fetch(this.API_DRIVERS)

      if(!res.ok) return []

      const data = await res.json()

      console.log("Drivers Loaded:", data)

      return data || []

    }catch(err){
      console.error("Drivers Error", err)
      return []
    }

  },

  /* ================= SCHEDULE ================= */
  async getSchedule(){

    try{

      const res = await fetch(this.API_SCHEDULE)

      if(!res.ok) return {}

      const data = await res.json()

      console.log("Schedule Loaded:", data)

      return data || {}

    }catch(err){
      console.error("Schedule Error", err)
      return {}
    }

  },

  /* ================= LIVE ================= */
  async getLiveDrivers(){

    try{

      const res = await fetch(this.API_LIVE)

      if(!res.ok) return []

      const data = await res.json()

      console.log("Live Drivers:", data)

      return data || []

    }catch(err){
      console.error("Live Error", err)
      return []
    }

  },

  /* ================= ASSIGN ================= */
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
        throw new Error("Assign failed")
      }

      return await res.json()

    }catch(err){
      console.error("Assign Error", err)
      throw err
    }

  },

  /* ================= NOTE ================= */
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
        throw new Error("Save note failed")
      }

      return await res.json()

    }catch(err){
      console.error("Note Error", err)
      throw err
    }

  },

  /* ================= SEND ================= */
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
        throw new Error("Send failed")
      }

      return await res.json()

    }catch(err){
      console.error("Send Error", err)
      throw err
    }

  }

}