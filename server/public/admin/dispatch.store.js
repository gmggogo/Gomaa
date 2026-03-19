const Store = {

/* ================= API ================= */

API: "/api/dispatch",

/* ================= LOAD ================= */

async load(){

  try{

    const res = await fetch(this.API)

    if(!res.ok){
      console.error("API ERROR STATUS:", res.status)
      return { trips:[], drivers:[], schedule:{} }
    }

    const data = await res.json()

    // دعم أكتر من شكل response
    return {
      trips: data.trips || data.data?.trips || [],
      drivers: data.drivers || data.data?.drivers || [],
      schedule: data.schedule || data.data?.schedule || {}
    }

  }catch(err){

    console.error("STORE LOAD ERROR:", err)

    return {
      trips:[],
      drivers:[],
      schedule:{}
    }

  }

},

/* ================= SEND ================= */

async sendTrips(ids){

  try{

    const res = await fetch("/api/dispatch/send",{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({ ids })
    })

    return await res.json()

  }catch(err){

    console.error("SEND ERROR:", err)
    return null

  }

},

/* ================= UPDATE TRIP ================= */

async updateTrip(id, data){

  try{

    const res = await fetch(`/api/trips/${id}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify(data)
    })

    return await res.json()

  }catch(err){

    console.error("UPDATE ERROR:", err)
    return null

  }

},

/* ================= DISABLE ================= */

async disableTrip(id){

  try{

    const res = await fetch(`/api/trips/${id}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({ disabled:true })
    })

    return await res.json()

  }catch(err){

    console.error("DISABLE ERROR:", err)
    return null

  }

}

}

/* ================= GLOBAL ================= */

window.Store = Store