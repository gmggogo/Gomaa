const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  liveDrivers: [],

  geoCache: {},
  routeCache: {},

  OSRM: "https://router.project-osrm.org/route/v1/driving",

  /* ================= LOAD ================= */
  async load(){

    this.trips = await Store.getTrips() || []
    this.drivers = await Store.getDrivers() || []
    this.schedule = await Store.getSchedule() || {}
    this.liveDrivers = await Store.getLiveDrivers() || []

    this.sortTrips()

    UI.renderTrips(this.trips)
    UI.renderDriversPanel(this.drivers)

  },

  /* ================= SORT ================= */
  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })

  },

  /* ================= DATE KEY ================= */
  getDateKey(dateStr){

    const d = new Date(dateStr)

    const az = new Date(
      d.toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    const y = az.getFullYear()
    const m = String(az.getMonth()+1).padStart(2,"0")
    const day = String(az.getDate()).padStart(2,"0")

    return `${y}-${m}-${day}`
  },

  /* ================= DRIVERS FILTER ================= */
  getDriversForTrip(trip){

    const key = this.getDateKey(trip.tripDate)

    return this.drivers.filter(d=>{

      const s = this.schedule[d._id]

      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false

      return s.days[key] === true

    })

  },

  /* ================= REDISTRIBUTE ================= */
  async redistributeSelected(){

    const ids = UI.getSelected()

    if(!ids.length){
      alert("Select trips")
      return
    }

    const selectedTrips = this.trips.filter(t=>ids.includes(t._id))

    const driverState = {}

    for(const trip of selectedTrips){

      const drivers = this.getDriversForTrip(trip)

      if(!drivers.length){
        console.log("No drivers for", trip.tripDate)
        continue
      }

      drivers.forEach(d=>{
        if(!driverState[d._id]){
          driverState[d._id]={
            tripCount:0,
            lastEnd:null,
            lastDropoff:""
          }
        }
      })

      let bestDriver = null
      let bestScore = 999999

      for(const d of drivers){

        const score = await this.scoreDriver(
          d,
          trip,
          driverState[d._id]
        )

        if(score < bestScore){
          bestScore = score
          bestDriver = d
        }
      }

      if(!bestDriver) continue

      await Store.assignDriver(trip._id, bestDriver._id)

      driverState[bestDriver._id].tripCount++
      driverState[bestDriver._id].lastDropoff = trip.dropoff
      driverState[bestDriver._id].lastEnd = this.getEnd(trip)

    }

    alert("Done")
    this.load()

  },

  /* ================= SCORE ================= */
  async scoreDriver(driver, trip, state){

    const scheduleRow = this.schedule[driver._id] || {}

    const from = state.lastDropoff || scheduleRow.address || driver.address || ""

    const route = await this.getRoute(from, trip.pickup)

    let dist = route?.distanceKm || 999
    let dur = route?.durationMin || 999

    dur *= this.traffic(trip.tripTime)

    let timePenalty = 0

    if(state.lastEnd){

      const start = new Date(`${trip.tripDate} ${trip.tripTime}`)
      const gap = (start - state.lastEnd)/60000

      if(gap < dur){
        timePenalty = 9999
      }

    }

    const fairness = state.tripCount * 20

    return dist*2 + dur*3 + fairness + timePenalty

  },

  traffic(time){

    const h = Number(time?.split(":")[0]||0)

    if(h>=6 && h<=9) return 1.4
    if(h>=15 && h<=18) return 1.3

    return 1
  },

  getEnd(trip){

    const d = new Date(`${trip.tripDate} ${trip.tripTime}`)
    d.setMinutes(d.getMinutes()+35)
    return d
  },

  /* ================= ROUTE ================= */
  async getRoute(from,to){

    const key = from+"_"+to

    if(this.routeCache[key]) return this.routeCache[key]

    const f = await this.geo(from)
    const t = await this.geo(to)

    if(!f || !t) return null

    const res = await fetch(`${this.OSRM}/${f.lng},${f.lat};${t.lng},${t.lat}?overview=false`)
    const data = await res.json()

    const r = {
      distanceKm:data.routes[0].distance/1000,
      durationMin:data.routes[0].duration/60
    }

    this.routeCache[key]=r

    return r
  },

  async geo(addr){

    if(!addr) return null

    if(this.geoCache[addr]) return this.geoCache[addr]

    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`)
    const data = await res.json()

    if(!data.length) return null

    const p={lat:+data[0].lat,lng:+data[0].lon}

    this.geoCache[addr]=p

    return p
  }

}