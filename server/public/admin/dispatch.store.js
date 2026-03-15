/* ===============================
   API
================================ */

const API_TRIPS = "/api/trips"
const API_DISPATCH = "/api/dispatch"

/* ===============================
   STORE
================================ */

const Store = {

  /* ===============================
     GET TRIPS FOR DISPATCH
  ================================= */

  async getTrips(){

    try{

      const res = await fetch(API_TRIPS)

      if(!res.ok) throw new Error("Trips API error")

      const data = await res.json()

      /* اسحب فقط الرحلات المختارة للديسبتش */

      return (data || []).filter(t => t.inDispatch === true && !t.disabled)

    }catch(err){

      console.error("Load trips error",err)
      return []

    }

  },

  /* ===============================
     GET DRIVERS
  ================================= */

  async getDrivers(){

    try{

      const res = await fetch("/api/drivers")

      if(!res.ok) throw new Error("Drivers API error")

      return await res.json()

    }catch(err){

      console.error("Drivers load error",err)
      return []

    }

  },

  /* ===============================
     SEND TRIP
  ================================= */

  async sendTrip(id){

    try{

      const res = await fetch(API_DISPATCH + "/send/" + id,{

        method:"POST"

      })

      if(!res.ok)
      throw new Error("Send trip failed")

    }catch(err){

      console.error("Send trip error",err)

    }

  },

  /* ===============================
     ASSIGN DRIVER
  ================================= */

  async assignDriver(tripId,driverId){

    try{

      const res = await fetch(API_DISPATCH + "/assignDriver",{

        method:"POST",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify({

          tripId:tripId,
          driverId:driverId

        })

      })

      if(!res.ok)
      throw new Error("Driver assign failed")

    }catch(err){

      console.error("Assign driver error",err)

    }

  }

}