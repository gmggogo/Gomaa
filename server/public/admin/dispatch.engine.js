const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  liveDrivers: [],

  geoCache: {},
  routeCache: {},

  OSRM: "https://router.project-osrm.org/route/v1/driving",

  map:null,
  tripMarkers:[],
  driverMarkers:[],

  /* =========================
     LOAD
  ========================= */
  async load(){

    try{

      this.trips = await Store.getTrips() || []
      this.drivers = await Store.getDrivers() || []
      this.schedule = await Store.getSchedule() || {}
      this.liveDrivers = await Store.getLiveDrivers() || []

      this.trips = Array.isArray(this.trips)?this.trips:[]
      this.drivers = Array.isArray(this.drivers)?this.drivers:[]
      this.liveDrivers = Array.isArray(this.liveDrivers)?this.liveDrivers:[]

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers,this.schedule,this.liveDrivers)

      await this.renderMap()

    }catch(e){
      console.error("LOAD ERROR",e)
    }

  },

  /* =========================
     SORT
  ========================= */
  sortTrips(){

    this.trips.sort((a,b)=>{
      return new Date(`${a.tripDate} ${a.tripTime}`) - new Date(`${b.tripDate} ${b.tripTime}`)
    })

  },

  /* =========================
     DAY FIX
  ========================= */
  getDay(date){

    const d = new Date(date)
    if(isNaN(d)) return ""

    return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()]
  },

  /* =========================
     DRIVER AVAILABILITY
  ========================= */
  isDriverWorking(driverId, date){

    const s = this.schedule?.[driverId]
    if(!s || !s.enabled || !s.days) return false

    const day = this.getDay(date)

    const days = {}

    Object.keys(s.days).forEach(k=>{
      days[k.toLowerCase().slice(0,3)] = s.days[k]
    })

    return !!days[day]
  },

  getDriversForTrip(trip){
    return this.drivers.filter(d=>this.isDriverWorking(d._id, trip.tripDate))
  },

  /* =========================
     DRIVER INFO
  ========================= */
  getDriverNameById(id){
    return this.drivers.find(d=>String(d._id)===String(id))?.name || "-"
  },

  getDriverVehicleById(id){
    return this.drivers.find(d=>String(d._id)===String(id))?.vehicleNumber || "-"
  },

  /* =========================
     SMART AUTO ASSIGN
  ========================= */
  async autoAssignSmart(){

    const trips = [...this.trips]

    const driverState = {}

    for(const trip of trips){

      const drivers = this.getDriversForTrip(trip)

      if(!drivers.length){
        console.log("No drivers for:",trip.tripNumber)
        continue
      }

      let bestDriver = null
      let bestScore = Infinity

      for(const d of drivers){

        if(!driverState[d._id]){
          driverState[d._id] = {
            trips:0,
            lastEnd:null,
            lastLocation:d.address || ""
          }
        }

        let origin = driverState[d._id].lastLocation

        // live location
        const live = this.liveDrivers.find(x=>String(x.driverId)===String(d._id))
        if(live?.lat != null){
          origin = `${live.lat},${live.lng}`
        }

        const route = await this.getRoute(origin, trip.pickup)

        let dist = route?.distanceKm || 999
        let dur = route?.durationMin || 999

        dur *= this.trafficFactor(trip.tripTime)

        let score = (dist*2) + (dur*3)

        // load
        score += driverState[d._id].trips * 15

        // overlap
        if(driverState[d._id].lastEnd){

          const start = new Date(`${trip.tripDate} ${trip.tripTime}`)
          const gap = (start - driverState[d._id].lastEnd)/60000

          if(gap < dur){
            score += 9999
          }

        }

        if(score < bestScore){
          bestScore = score
          bestDriver = d
        }

      }

      if(!bestDriver) continue

      await Store.assignDriver(trip._id, bestDriver._id)

      driverState[bestDriver._id].trips++
      driverState[bestDriver._id].lastLocation = trip.dropoff

      const end = new Date(`${trip.tripDate} ${trip.tripTime}`)
      end.setMinutes(end.getMinutes()+40)

      driverState[bestDriver._id].lastEnd = end

    }

    alert("🔥 Smart Assign Done")

    await this.load()
  },

  /* =========================
     TRAFFIC
  ========================= */
  trafficFactor(time){

    const h = Number(time?.split(":")[0]||0)

    if(h>=6 && h<=9) return 1.3
    if(h>=15 && h<=18) return 1.3

    return 1
  },

  /* =========================
     ROUTE
  ========================= */
  async getRoute(from,to){

    const key = from+"__"+to
    if(this.routeCache[key]) return this.routeCache[key]

    const f = await this.toCoords(from)
    const t = await this.toCoords(to)

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

    }catch{
      return null
    }

  },

  async toCoords(val){

    if(!val) return null

    // لو lat,lng
    if(String(val).includes(",")){
      const [lat,lng] = val.split(",").map(Number)
      return {lat,lng}
    }

    if(this.geoCache[val]) return this.geoCache[val]

    try{
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}`
      )
      const d = await res.json()

      if(!d.length) return null

      const p = {lat:+d[0].lat,lng:+d[0].lon}
      this.geoCache[val]=p
      return p

    }catch{
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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(this.map)
    }

    this.tripMarkers.forEach(m=>this.map.removeLayer(m))
    this.driverMarkers.forEach(m=>this.map.removeLayer(m))

    this.tripMarkers=[]
    this.driverMarkers=[]

    for(const t of this.trips){

      const p = await this.toCoords(t.pickup)
      if(!p) continue

      const m = L.marker([p.lat,p.lng])
        .addTo(this.map)
        .bindPopup(`
          <b>${t.tripNumber || "Trip"}</b><br>
          Driver: ${this.getDriverNameById(t.driverId)}<br>
          Car: ${this.getDriverVehicleById(t.driverId)}
        `)

      this.tripMarkers.push(m)

    }

    for(const d of this.liveDrivers){

      if(d.lat==null) continue

      const m = L.circleMarker([d.lat,d.lng],{
        radius:8,
        color:"#16a34a",
        fillColor:"#16a34a",
        fillOpacity:0.9
      }).addTo(this.map)

      this.driverMarkers.push(m)
    }

  }

}