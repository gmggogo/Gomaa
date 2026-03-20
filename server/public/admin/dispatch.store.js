/* ================= STORE ================= */

const Store = {
  API: "/api/dispatch",

  async load(){
    try{
      const res = await fetch(this.API)
      const data = await res.json()
      return data || {}
    }catch(e){
      console.log("API ERROR", e)
      return { trips: [], drivers: [], schedule: {} }
    }
  }
}

window.Store = Store