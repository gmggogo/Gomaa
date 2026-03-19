/* ================= FULL SMART ENGINE ================= */

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

      console.log("Trips:", this.trips)
      console.log("Drivers:", this.drivers)

      this.sortTrips()

      await this.preload()

      // 🔥 توزيع تلقائي لكل الرحلات
      await this.autoAssign(false)

      UI.renderTrips(this.trips)
      UI.renderDrivers && UI.renderDrivers(this.drivers)

    }catch(err){
      console.error("ENGINE ERROR:", err)
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

      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`)
      const data = await res.json()

      if(!data.length) return null

      const loc = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      }

      this.geoCache[address] = loc
      return loc

    }catch(e){
      return null
    }

  },

  /* ================= DISTANCE ================= */
  async getDistance(a,b){

    try{

      const res = await fetch(`${this.OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`)
      const data = await res.json()

      if(!data.routes || !data.routes.length) return Infinity

      return data.routes[0].distance

    }catch(e){
      return Infinity
    }

  },

  /* ================= DRIVER START ================= */
  getDriverStart(driver){

    if(driver.lastDropoff) return driver.lastDropoff

    const s = this.schedule[driver._id]

    if(s && s.address && this.geoCache[s.address]){
      return this.geoCache[s.address]
    }

    if(driver.address && this.geoCache[driver.address]){
      return this.geoCache[driver.address]
    }

    return null
  },

  /* ================= AUTO ASSIGN ================= */
  async autoAssign(selectedOnly = false){

    console.log("AUTO ASSIGN START")

    this.drivers.forEach(d=>{
      d.assignedTrips = 0
      d.lastDropoff = null
    })

    for(const trip of this.trips){

      // ✅ الفرق بين auto و redispatch
      if(selectedOnly && trip.selected !== true) continue

      const pickup = this.geoCache[trip.pickup]

      if(!pickup){
        console.log("No pickup:", trip.pickup)
        continue
      }

      let bestDriver = null
      let bestDist = Infinity

      for(const driver of this.drivers){

        const start = this.getDriverStart(driver)

        if(!start){
          console.log("No start for driver:", driver.name)
          continue
        }

        const dist = await this.getDistance(start, pickup)

        if(dist < bestDist){
          bestDist = dist
          bestDriver = driver
        }

      }

      if(!bestDriver){
        console.log("No driver for trip")
        continue
      }

      // assign
      trip.driverId = bestDriver._id
      trip.vehicle = bestDriver.car || ""

      bestDriver.assignedTrips++
      bestDriver.lastDropoff = this.geoCache[trip.dropoff]

      console.log("Assigned:", bestDriver.name)

    }

    console.log("AUTO ASSIGN DONE")

  },

  /* ================= REDISTRIBUTE BUTTON ================= */
  async redistributeSelected(){

    await this.autoAssign(true)

    UI.renderTrips(this.trips)
    UI.renderDrivers && UI.renderDrivers(this.drivers)

  }

}

/* ================= START ================= */
window.Engine = Engine;

document.addEventListener("DOMContentLoaded", () => {
  Engine.load();
});