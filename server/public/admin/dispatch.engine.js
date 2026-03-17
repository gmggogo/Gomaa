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

      if(!Array.isArray(this.trips)) this.trips = []
      if(!Array.isArray(this.drivers)) this.drivers = []
      if(!Array.isArray(this.liveDrivers)) this.liveDrivers = []

      // ✅ حذف الرحلات القديمة
      this.filterExpiredTrips()

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
  حذف الرحلات بعد ساعة
  ========================= */
  filterExpiredTrips(){

    const now = new Date(
      new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    this.trips = this.trips.filter(t=>{

      if(!t.tripDate || !t.tripTime) return true

      const tripTime = new Date(`${t.tripDate} ${t.tripTime}`)

      if(isNaN(tripTime)) return true

      const diff = (now - tripTime) / 60000

      return diff <= 60
    })

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
  DAY FROM DATE (FIX)
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
  DRIVERS FOR TRIP (FIX)
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
  DRIVER NAME
  ========================= */
  getDriverNameById(driverId){

    const d = this.drivers.find(x=>String(x._id)===String(driverId))
    return d?.name || "-"
  },

  /* =========================
  VEHICLE
  ========================= */
  getDriverVehicleById(driverId){

    const d = this.drivers.find(x=>String(x._id)===String(driverId))
    return d?.vehicleNumber || "-"
  },

  /* =========================
  SELECTION
  ========================= */
  bindSelection(){

    document.querySelectorAll(".tripSelect").forEach(box=>{

      box.addEventListener("change",()=>{

        const row = box.closest("tr")
        const btn = row.querySelector(".btn-send")

        if(btn){
          btn.disabled = !box.checked
        }

        row.classList.toggle("row-selected", box.checked)

      })

    })

  },

  getSelected(){

    return [...document.querySelectorAll(".tripSelect:checked")]
      .map(el=>el.value)

  },

  /* =========================
  REDISTRIBUTE (FIX)
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

  trafficFactor(time){

    const h = Number(time?.split(":")[0] || 0)

    if(h>=6 && h<=9) return 1.35
    if(h>=15 && h<=18) return 1.3

    return 1
  },

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

    const key = address.trim().toLowerCase()

    if(this.geoCache[key]) return this.geoCache[key]

    try{

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      )

      const data = await res.json()

      if(!data.length) return null

      const p = {
        lat:Number(data[0].lat),
        lng:Number(data[0].lon)
      }

      this.geoCache[key]=p

      return p

    }catch(e){
      return null
    }

  },

  async reverseGeocode(lat,lng){

    try{

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      )

      const data = await res.json()

      return data.display_name || ""

    }catch(e){
      return ""
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

      if(!data.routes?.length) return null

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

      if(!p) continue

      const m = L.marker([p.lat,p.lng])
        .addTo(this.map)
        .bindPopup(`
          <b>${t.tripNumber || "Trip"}</b><br>
          Driver: ${this.getDriverNameById(t.driver)}<br>
          Car: ${this.getDriverVehicleById(t.driver)}
        `)

      this.tripMarkers.push(m)

    }

    for(const d of this.liveDrivers){

      if(d.lat == null || d.lng == null) continue

      const m = L.circleMarker([d.lat,d.lng],{
        radius:8,
        color:"#16a34a",
        fillColor:"#16a34a",
        fillOpacity:0.9
      })
      .addTo(this.map)

      this.driverMarkers.push(m)

    }

  }

}