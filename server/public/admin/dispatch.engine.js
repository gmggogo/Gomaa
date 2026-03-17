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

    this.trips = await Store.getTrips()
    this.drivers = await Store.getDrivers()
    this.schedule = await Store.getSchedule()
    this.liveDrivers = await Store.getLiveDrivers()

    this.sortTrips()

    UI.renderTrips(this.trips)
    UI.renderDriversPanel(this.drivers, this.schedule, this.liveDrivers)

  },

  async reload(){
    await this.load()
  },

  /* ================= SORT ================= */
  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })

  },

  /* ================= TIME ================= */
  toDate(trip){
    return new Date(`${trip.tripDate} ${trip.tripTime}`)
  },

  getTodayKey(){
    const d = new Date(
      new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )
    return d.toLocaleDateString("en-CA")
  },

  /* ================= DRIVER ================= */
  getDriverNameById(id){
    const d = this.drivers.find(x=>String(x._id)===String(id))
    return d ? d.name : "-"
  },

  getDriverVehicleById(id){
    const d = this.drivers.find(x=>String(x._id)===String(id))
    return d ? (d.vehicleNumber || "-") : "-"
  },

  /* ================= FILTER ================= */
  getDriversForTrip(trip){

    const today = this.getTodayKey()

    return this.drivers.filter(d=>{
      const s = this.schedule[d._id]
      return s && s.enabled && s.days && s.days[today]
    })

  },

  /* ================= GEOCODE ================= */
  async geocode(address){

    if(!address) return null
    if(this.geoCache[address]) return this.geoCache[address]

    try{

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
      const res = await fetch(url)
      const data = await res.json()

      if(!data.length) return null

      const loc = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      }

      this.geoCache[address] = loc
      return loc

    }catch{
      return null
    }

  },

  /* ================= ROUTE ================= */
  async getRoute(a, b){

    const key = a + "|" + b
    if(this.routeCache[key]) return this.routeCache[key]

    const A = await this.geocode(a)
    const B = await this.geocode(b)

    if(!A || !B){
      return {distance:999, duration:999}
    }

    try{

      const url = `${this.OSRM}/${A.lon},${A.lat};${B.lon},${B.lat}?overview=false`
      const res = await fetch(url)
      const data = await res.json()

      if(!data.routes || !data.routes.length){
        return {distance:999, duration:999}
      }

      const route = {
        distance: data.routes[0].distance / 1000,
        duration: data.routes[0].duration / 60
      }

      this.routeCache[key] = route

      return route

    }catch{
      return {distance:999, duration:999}
    }

  },

  /* ================= DRIVER SCHEDULE ================= */
  getDriverTrips(driverId){

    return this.trips
      .filter(t=>String(t.driverId)===String(driverId))
      .sort((a,b)=> this.toDate(a) - this.toDate(b))

  },

  /* ================= CONFLICT ================= */
  hasConflict(driverId, trip, duration){

    const trips = this.getDriverTrips(driverId)

    const newStart = this.toDate(trip)
    const newEnd = new Date(newStart.getTime() + duration*60000)

    for(const t of trips){

      const start = this.toDate(t)
      const end = new Date(start.getTime() + 60*60000) // افتراض ساعة

      if(newStart < end && newEnd > start){
        return true
      }

    }

    return false

  },

  /* ================= SMART ASSIGN ================= */
  async smartAssign(trip){

    const drivers = this.getDriversForTrip(trip)

    if(!drivers.length) return null

    let best = null
    let bestScore = Infinity

    for(const d of drivers){

      const route = await this.getRoute(trip.pickup, d.address)

      const tripsCount = this.getDriverTrips(d._id).length

      const conflict = this.hasConflict(d._id, trip, route.duration)

      if(conflict) continue

      const score =
        route.distance +
        (tripsCount * 2) +
        (route.duration * 0.5)

      if(score < bestScore){
        bestScore = score
        best = d
      }

    }

    return best

  },

  /* ================= SMART DISTRIBUTE ================= */
  async smartDistribute(){

    for(const trip of this.trips){

      if(trip.driverId) continue

      const best = await this.smartAssign(trip)

      if(best){
        trip.driverId = best._id
      }

    }

    UI.renderTrips(this.trips)

  },

  /* ================= ASSIGN ================= */
  async assignDriver(tripId, driverId){

    const trip = this.trips.find(t=>String(t._id)===String(tripId))
    if(!trip) return

    trip.driverId = driverId

    await Store.assignDriver(tripId, driverId)

    UI.renderTrips(this.trips)

  },

  /* ================= SEND ================= */
  async sendSelected(){

    const ids = UI.getSelected()

    if(!ids.length){
      alert("Select trips first")
      return
    }

    await Store.sendTrips(ids)

    alert("Sent")

  },

  /* ================= BIND ================= */
  bind(){

    document.querySelectorAll(".driverEdit").forEach(sel=>{

      sel.addEventListener("change", (e)=>{

        const row = e.target.closest("tr")
        const id = row.dataset.id

        this.assignDriver(id, e.target.value)

      })

    })

  }

}