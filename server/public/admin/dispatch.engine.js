const Engine = {

  trips: [],
  drivers: [],
  schedule: {},

  geoCache: {},
  routeCache: {},

  /* ===============================
     LOAD DATA
  ============================== */

  async load(){

    try{

      this.trips = await Store.getTrips() || []
      this.drivers = await Store.getDrivers() || []
      this.schedule = await Store.getSchedule() || {}

      this.normalize()

      await this.autoAssign()

      this.sortTrips()

      UI.renderTrips(this.trips)

    }catch(err){
      console.error("Engine Load Error", err)
    }

  },

  /* ===============================
     NORMALIZE
  ============================== */

  normalize(){

    this.drivers = this.drivers.map(d => ({
      ...d,
      _id: String(d._id || ""),
      address:
        d.address ||
        d.homeAddress ||
        d.currentAddress ||
        "Phoenix AZ"
    }))

    this.trips = this.trips.map(t => ({
      ...t,
      _id: String(t._id || ""),
      driverId: t.driverId ? String(t.driverId) : ""
    }))

  },

  /* ===============================
     SORT
  ============================== */

  sortTrips(){

    this.trips.sort((a,b)=>{
      return new Date(`${a.tripDate} ${a.tripTime}`) -
             new Date(`${b.tripDate} ${b.tripTime}`)
    })

  },

  /* ===============================
     DRIVER ACTIVE (FIXED)
  ============================== */

  isDriverActive(driverId, tripDate){

    const s = this.schedule[String(driverId)]

    // 🔥 fallback مهم
    if(!s) return true
    if(s.enabled === false) return false

    if(!tripDate) return true

    const days = s.days || {}

    if(!Object.keys(days).length){
      return true
    }

    return !!days[String(tripDate).trim()]

  },

  /* ===============================
     GET VALID DRIVERS
  ============================== */

  getValidDrivers(trip){

    const valid = this.drivers.filter(d =>
      this.isDriverActive(d._id, trip.tripDate)
    )

    // 🔥 fallback
    if(!valid.length){
      return this.drivers
    }

    return valid

  },

  /* ===============================
     TIME CONFLICT (خفيف)
  ============================== */

  hasConflict(driverId, trip){

    const list = this.trips.filter(t =>
      String(t.driverId) === String(driverId)
    )

    for(const t of list){

      if(t.tripDate !== trip.tripDate) continue

      const diff = Math.abs(
        new Date(`${t.tripDate} ${t.tripTime}`) -
        new Date(`${trip.tripDate} ${trip.tripTime}`)
      ) / 60000

      if(diff < 30){
        return true
      }
    }

    return false

  },

  /* ===============================
     GEO
  ============================== */

  async geocode(addr){

    if(!addr) return null

    if(this.geoCache[addr]) return this.geoCache[addr]

    try{

      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`)
      const data = await res.json()

      if(!data.length) return null

      const point = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      }

      this.geoCache[addr] = point

      return point

    }catch{
      return null
    }

  },

  /* ===============================
     ROUTE
  ============================== */

  async getRoute(points){

    const key = points.map(p => `${p.lat},${p.lng}`).join("|")

    if(this.routeCache[key]) return this.routeCache[key]

    try{

      const coords = points.map(p => `${p.lng},${p.lat}`).join(";")

      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`)
      const data = await res.json()

      if(!data.routes.length) return null

      const r = data.routes[0]

      const route = {
        distance: r.distance / 1609.34,
        duration: r.duration / 60
      }

      this.routeCache[key] = route

      return route

    }catch{
      return null
    }

  },

  /* ===============================
     SMART AUTO ASSIGN 🔥
  ============================== */

  async autoAssign(){

    for(const trip of this.trips){

      if(trip.driverId) continue

      const validDrivers = this.getValidDrivers(trip)

      let bestDriver = null
      let bestScore = Infinity

      for(const driver of validDrivers){

        // time
        if(this.hasConflict(driver._id, trip)) continue

        // start location
        let start = driver.address

        const lastTrip = this.getLastTrip(driver._id)

        if(lastTrip && lastTrip.dropoff){
          start = lastTrip.dropoff
        }

        // geo
        let distance = 9999
        let duration = 9999

        try{

          const g1 = await this.geocode(start)
          const g2 = await this.geocode(trip.pickup)

          if(g1 && g2){

            const route = await this.getRoute([g1, g2])

            if(route){
              distance = route.distance
              duration = route.duration
            }

          }

        }catch{}

        const count = this.getTripsCount(driver._id)

        const score =
          (distance * 1.5) +
          (duration * 1.2) +
          (count * 2)

        if(score < bestScore){
          bestScore = score
          bestDriver = driver
        }

      }

      // fallback
      if(!bestDriver && validDrivers.length){
        bestDriver = validDrivers[0]
      }

      if(bestDriver){
        trip.driverId = bestDriver._id
        trip.vehicle = this.getCar(bestDriver._id)
      }

    }

  },

  /* ===============================
     HELPERS (ENGINE)
  ============================== */

  getTripsCount(id){
    return this.trips.filter(t => String(t.driverId) === String(id)).length
  },

  getLastTrip(id){
    const list = this.trips.filter(t => String(t.driverId) === String(id))
    if(!list.length) return null
    list.sort((a,b)=> new Date(`${b.tripDate} ${b.tripTime}`) - new Date(`${a.tripDate} ${a.tripTime}`))
    return list[0]
  },

  getCar(id){
    const s = this.schedule[String(id)]
    if(!s) return ""
    return s.carNumber || s.vehicleNumber || ""
  }

}