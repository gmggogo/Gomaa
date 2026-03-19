/* ================= FINAL PROFESSIONAL SMART ENGINE ================= */

const SmartEngine = {

  distanceCache: {},

  /* ================= PRELOAD ================= */
  async preload(){
    const addresses = new Set()

    trips.forEach(t=>{
      if(t.pickup) addresses.add(t.pickup)
      if(t.dropoff) addresses.add(t.dropoff)
      getStops(t).forEach(s=>addresses.add(s))
    })

    drivers.forEach(d=>{
      const s = schedule[d._id]
      if(s && s.address) addresses.add(s.address)
      if(d.address) addresses.add(d.address)
    })

    await Promise.all([...addresses].map(a=>geocode(a)))
  },

  /* ================= SAME DAY ================= */
  sameDay(driver, trip){
    if(!driver.workDate) return true
    return driver.workDate === trip.tripDate
  },

  /* ================= TIME CHECK ================= */
  canTake(driver, trip){

    if(!driver.lastTripEnd) return true

    const last = new Date(driver.lastTripEnd)
    const next = new Date(`${trip.tripDate} ${trip.tripTime}`)

    return (next - last) > (20 * 60 * 1000)
  },

  /* ================= START LOCATION ================= */
  getStart(driver){

    if(driver.liveLocation) return driver.liveLocation
    if(driver.lastDropoff) return driver.lastDropoff

    const s = schedule[driver._id]
    if(s && s.address && geoCache[s.address]){
      return geoCache[s.address]
    }

    if(driver.address && geoCache[driver.address]){
      return geoCache[driver.address]
    }

    return null
  },

  /* ================= DISTANCE ================= */
  async getDistance(a,b){

    const key = `${a.lat},${a.lng}_${b.lat},${b.lng}`
    if(this.distanceCache[key]) return this.distanceCache[key]

    try{
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}`)
      const data = await res.json()

      if(!data.routes || !data.routes.length) return Infinity

      const dist = data.routes[0].distance
      this.distanceCache[key] = dist

      return dist

    }catch(e){
      return Infinity
    }
  },

  /* ================= PICK DRIVER (PARALLEL) ================= */
  async pickDriver(trip){

    const pickup = geoCache[trip.pickup]
    if(!pickup) return null

    const promises = drivers.map(async driver => {

      if(!this.sameDay(driver, trip)) return null
      if(!this.canTake(driver, trip)) return null

      const start = this.getStart(driver)
      if(!start) return null

      const dist = await this.getDistance(start, pickup)

      return { driver, dist }
    })

    const results = (await Promise.all(promises)).filter(Boolean)

    if(!results.length) return null

    let best = null
    let bestScore = Infinity

    for(const r of results){

      const driver = r.driver
      const dist = r.dist

      // ⚖️ معادلة احترافية (مسافة + عدل ديناميكي)
      const score = dist + (driver.assignedTrips * dist * 0.3)

      if(score < bestScore){
        bestScore = score
        best = driver
      }
    }

    return best
  },

  /* ================= RUN ================= */
  async run(selectedOnly = true){

    showToast("Smart Dispatch Running...")

    // reset
    drivers.forEach(d=>{
      d.assignedTrips = 0
      d.lastTripEnd = null
      d.lastDropoff = null
    })

    // sort
    trips.sort((a,b)=> getTripDateTimeValue(a) - getTripDateTimeValue(b))

    await this.preload()

    for(const trip of trips){

      if(selectedOnly && !trip.selected) continue

      const driver = await this.pickDriver(trip)
      if(!driver) continue

      // assign
      trip.driverId = driver._id
      trip.vehicle = getDriverCar(driver._id)

      driver.assignedTrips++

      // ⏱ FIX TIME (مدة الرحلة)
      const start = new Date(`${trip.tripDate} ${trip.tripTime}`)
      const durationMin = 30 // مؤقت (نقدر نخليه من OSRM بعد كده)

      driver.lastTripEnd = new Date(start.getTime() + durationMin * 60000)

      // 📍 FIX DROPOFF
      driver.lastDropoff = geoCache[trip.dropoff] || driver.lastDropoff
    }

    renderTrips()
    renderDrivers()

    showToast("Smart Dispatch Done ✅")
  }
}