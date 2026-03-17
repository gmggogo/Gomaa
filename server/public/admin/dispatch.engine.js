const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  liveDrivers: [],

  geoCache: {},
  routeCache: {},

  OSRM: "https://router.project-osrm.org/route/v1/driving",

  map: null,
  tripMarkers: [],
  driverMarkers: [],

  manualMode: false,
  selectAllMode: false,

  /* =========================
  LOAD
  ========================= */
  async load(){

    try{

      this.trips = await Store.getTrips() || []
      this.drivers = await Store.getDrivers() || []
      this.schedule = await Store.getSchedule() || {}
      this.liveDrivers = await Store.getLiveDrivers() || []

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers, this.schedule, this.liveDrivers)

      this.bindSelection()

      await this.renderMap()

      setTimeout(()=>{
        if(this.map) this.map.invalidateSize()
      }, 300)

    }catch(err){
      console.error("Dispatch Load Error", err)
    }

  },

  /* =========================
  SORT
  ========================= */
  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })

  },

  /* =========================
  DATE → DAY (FIX)
  ========================= */
  getDayFromDate(dateStr){

    const days = ["sun","mon","tue","wed","thu","fri","sat"]

    const d = new Date(dateStr)

    const az = new Date(
      d.toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    return days[az.getDay()]
  },

  /* =========================
  GET DRIVERS FOR TRIP
  ========================= */
  getDriversForTrip(trip){

    const day = this.getDayFromDate(trip.tripDate)

    return this.drivers.filter(d=>{

      const s = this.schedule[d._id]

      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false

      return !!s.days[day]

    })

  },

  /* =========================
  VEHICLE
  ========================= */
  getDriverVehicleById(driverId){

    const d = this.drivers.find(x=>String(x._id)===String(driverId))
    return d?.vehicleNumber || ""

  },

  /* =========================
  REDISTRIBUTE
  ========================= */
  async redistributeSelected(){

    const ids = this.getSelected()

    if(!ids.length){
      alert("Select trips first")
      return
    }

    const selectedTrips = this.trips
      .filter(t=>ids.includes(t._id))
      .sort((a,b)=>{
        const da = new Date(`${a.tripDate} ${a.tripTime}`)
        const db = new Date(`${b.tripDate} ${b.tripTime}`)
        return da - db
      })

    const driverState = {}

    for(const trip of selectedTrips){

      const drivers = this.getDriversForTrip(trip)

      if(!drivers.length){
        console.log("No drivers for:", trip.tripDate)
        continue
      }

      /* init state */
      drivers.forEach(d=>{
        if(!driverState[d._id]){
          driverState[d._id] = {
            tripCount: 0,
            lastDropoff: "",
            lastEnd: null
          }
        }
      })

      const driversWithoutTrips = drivers.filter(d=>driverState[d._id].tripCount === 0)
      const pool = driversWithoutTrips.length ? driversWithoutTrips : drivers

      let bestDriver = null
      let bestScore = Infinity

      for(const driver of pool){

        const score = await this.computeDriverScore(
          driver,
          trip,
          driverState[driver._id]
        )

        if(score < bestScore){
          bestScore = score
          bestDriver = driver
        }

      }

      if(!bestDriver) continue

      await Store.assignDriver(trip._id, bestDriver._id)

      driverState[bestDriver._id].tripCount++
      driverState[bestDriver._id].lastDropoff = trip.dropoff
      driverState[bestDriver._id].lastEnd = this.estimateTripEnd(trip.tripDate, trip.tripTime)

    }

    alert("Trips redistributed")

    await this.load()

  },

  /* =========================
  SCORE
  ========================= */
  async computeDriverScore(driver, trip, state){

    const scheduleRow = this.schedule[driver._id] || {}
    const liveDriver = this.liveDrivers.find(d=>String(d.driverId)===String(driver._id))

    let origin = ""

    if(state.lastDropoff){
      origin = state.lastDropoff
    }else if(liveDriver?.lat != null){
      origin = await this.reverseGeocode(liveDriver.lat, liveDriver.lng)
    }else{
      origin = scheduleRow.address || driver.address || ""
    }

    const route = await this.getRouteByAddress(origin, trip.pickup)

    let dist = route?.distanceKm || 999
    let dur = route?.durationMin || 999

    dur *= this.trafficFactor(trip.tripTime)

    let timePenalty = 0

    if(state.lastEnd){

      const tripStart = new Date(`${trip.tripDate} ${trip.tripTime}`)
      const gap = (tripStart - state.lastEnd) / 60000

      if(gap < dur){
        timePenalty = 9999
      }else{
        timePenalty = Math.max(0, 60 - gap) * 1.2
      }

    }

    const fairness = state.tripCount * 15

    return (dist*2) + (dur*3) + fairness + timePenalty

  },

  /* =========================
  TRAFFIC
  ========================= */
  trafficFactor(time){

    const h = Number(time?.split(":")[0] || 0)

    if(h>=6 && h<=9) return 1.35
    if(h>=15 && h<=18) return 1.3

    return 1
  },

  /* =========================
  END TIME
  ========================= */
  estimateTripEnd(date,time){

    const d = new Date(`${date} ${time}`)
    d.setMinutes(d.getMinutes()+35)
    return d
  },

  /* =========================
  GEOCODE
  ========================= */
  async geocode(address){

    if(!address) return null

    if(this.geoCache[address]) return this.geoCache[address]

    try{

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
      )

      const data = await res.json()

      if(!data.length) return null

      const p = {
        lat:Number(data[0].lat),
        lng:Number(data[0].lon)
      }

      this.geoCache[address]=p

      return p

    }catch(e){
      return null
    }

  },

  /* =========================
  ROUTE
  ========================= */
  async getRouteByAddress(from,to){

    const key = from+"__"+to

    if(this.routeCache[key]) return this.routeCache[key]

    const f = await this.geocode(from)
    const t = await this.geocode(to)

    if(!f || !t) return null

    try{

      const res = await fetch(
        `${this.OSRM}/${f.lng},${f.lat};${t.lng},${t.lat}?overview=false`
      )

      const data = await res.json()

      const r = {
        distanceKm:data.routes[0].distance/1000,
        durationMin:data.routes[0].duration/60
      }

      this.routeCache[key]=r

      return r

    }catch(e){
      return null
    }

  },

  /* =========================
  MAP
  ========================= */
  async renderMap(){

    const el = document.getElementById("dispatchMap")
    if(!el) return

    if(!this.map){

      this.map = L.map("dispatchMap").setView([33.45,-112.07],10)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
      .addTo(this.map)

    }

    this.tripMarkers.forEach(m=>this.map.removeLayer(m))
    this.driverMarkers.forEach(m=>this.map.removeLayer(m))

    this.tripMarkers=[]
    this.driverMarkers=[]

    for(const t of this.trips){

      const p = await this.geocode(t.pickup)

      if(p){

        const m = L.marker([p.lat,p.lng]).addTo(this.map)
        this.tripMarkers.push(m)

      }

    }

  }

}