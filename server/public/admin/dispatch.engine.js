/* ================= FINAL CLEAN ENGINE ================= */

const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  geoCache: {},

  OSRM: "https://router.project-osrm.org/route/v1/driving",

  /* ================= LOAD ================= */
  async load(){

    try{

      this.trips = await Store.getTrips() || []
      this.drivers = await Store.getDrivers() || []
      this.schedule = await Store.getSchedule() || {}

      console.log("Trips Loaded:", this.trips.length)
      console.log("Drivers Loaded:", this.drivers.length)

      this.sortTrips()

      await this.preload()

      // 🔥 auto assign لكل الرحلات
      await this.autoAssign(false)

      UI.renderTrips(this.trips)
      if(UI.renderDrivers) UI.renderDrivers(this.drivers)

    }catch(err){
      console.error("ENGINE LOAD ERROR:", err)
    }

  },

  /* ================= SORT ================= */
  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })

  },

  /* ================= PRELOAD GEO ================= */
  async preload(){

    const addresses = new Set()

    this.trips.forEach(t=>{
      if(t.pickup) addresses.add(t.pickup)
      if(t.dropoff) addresses.add(t.dropoff)
    })

    this.drivers.forEach(d=>{
      if(d.address) addresses.add(d.address)
      const s = this.schedule[d._id]
      if(s && s.address) addresses.add(s.address)
    })

    await Promise.all([...addresses].map(a=>this.geocode(a)))

  },

  /* ================= GEOCODE ================= */
  async geocode(address){

    if(!address) return null
    if(this.geoCache[address]) return this.geoCache[address]

    try{

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
      )

      const data = await res.json()

      if(!data.length){
        console.warn("Geocode failed:", address)
        return null
      }

      const loc = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      }

      this.geoCache[address] = loc
      return loc

    }catch(e){
      console.error("Geocode error:", address)
      return null
    }

  },

  /* ================= DISTANCE ================= */
  async getDistance(a,b){

    try{

      const res = await fetch(
        `${this.OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`
      )

      const data = await res.json()

      if(!data.routes || !data.routes.length){
        return Infinity
      }

      return data.routes[0].distance

    }catch(e){
      console.warn("Distance fail → fallback straight line")

      // 🔥 fallback (حساب مسافة تقريبي)
      const dx = a.lat - b.lat
      const dy = a.lng - b.lng
      return Math.sqrt(dx*dx + dy*dy) * 111000
    }

  },

  /* ================= DRIVER START ================= */
  getDriverStart(driver){

    // آخر drop
    if(driver.lastDropoff) return driver.lastDropoff

    // schedule
    const s = this.schedule[driver._id]
    if(s && s.address && this.geoCache[s.address]){
      return this.geoCache[s.address]
    }

    // address
    if(driver.address && this.geoCache[driver.address]){
      return this.geoCache[driver.address]
    }

    // 🔥 fallback (يخليه يشتغل حتى لو مفيش عنوان)
    return {
      lat: 0,
      lng: 0
    }

  },

  /* ================= AUTO ASSIGN ================= */
  async autoAssign(selectedOnly = false){

    console.log("AUTO ASSIGN START")

    this.drivers.forEach(d=>{
      d.assignedTrips = 0
      d.lastDropoff = null
    })

    for(const trip of this.trips){

      // ✅ فرق بين auto و redispatch
      if(selectedOnly && trip.selected !== true) continue

      const pickup = this.geoCache[trip.pickup]

      if(!pickup){
        console.warn("No pickup geo:", trip.pickup)
        continue
      }

      let bestDriver = null
      let bestDist = Infinity

      for(const driver of this.drivers){

        const start = this.getDriverStart(driver)

        const dist = await this.getDistance(start, pickup)

        if(dist < bestDist){
          bestDist = dist
          bestDriver = driver
        }

      }

      if(!bestDriver){
        console.warn("No driver found")
        continue
      }

      // assign
      trip.driverId = bestDriver._id

      // 🔥 vehicle fix
      trip.vehicle = bestDriver.vehicle || bestDriver.car || ""

      bestDriver.assignedTrips++
      bestDriver.lastDropoff = this.geoCache[trip.dropoff] || bestDriver.lastDropoff

      console.log("Assigned:", bestDriver.name || bestDriver._id)

    }

    console.log("AUTO ASSIGN DONE")

  },

  /* ================= REDISTRIBUTE ================= */
  async redistributeSelected(){

    console.log("REDISTRIBUTE START")

    await this.autoAssign(true)

    UI.renderTrips(this.trips)
    if(UI.renderDrivers) UI.renderDrivers(this.drivers)

    console.log("REDISTRIBUTE DONE")

  }

}

/* ================= START ================= */
window.Engine = Engine;

document.addEventListener("DOMContentLoaded", () => {
  Engine.load();
});