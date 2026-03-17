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

  sortTrips(){

    this.trips.sort((a,b)=>{
      return new Date(`${a.tripDate} ${a.tripTime}`) - new Date(`${b.tripDate} ${b.tripTime}`)
    })

  },

  getDay(date){

    const d = new Date(date)
    if(isNaN(d)) return ""

    return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()]
  },

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

  getDriverNameById(id){
    const d = this.drivers.find(x=>String(x._id)===String(id))
    return d?.name || "-"
  },

  getDriverVehicleById(id){
    const d = this.drivers.find(x=>String(x._id)===String(id))
    return d?.vehicleNumber || "-"
  },

  getDriverAddressById(id){
    const d = this.drivers.find(x=>String(x._id)===String(id))
    return d?.address || "-"
  },

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

  },

  async toCoords(val){

    if(!val) return null

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

  }

}