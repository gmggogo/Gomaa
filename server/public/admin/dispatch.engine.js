const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  liveDrivers: [],

  map:null,
  tripMarkers:[],
  driverMarkers:[],

  async load(){

    this.trips = await Store.getTrips()
    this.drivers = await Store.getDrivers()
    this.schedule = await Store.getSchedule()
    this.liveDrivers = await Store.getLiveDrivers()

    this.trips = Array.isArray(this.trips)?this.trips:[]
    this.drivers = Array.isArray(this.drivers)?this.drivers:[]
    this.liveDrivers = Array.isArray(this.liveDrivers)?this.liveDrivers:[]

    this.filterExpiredTrips()
    this.sortTrips()

    UI.renderTrips(this.trips)
    UI.renderDriversPanel(this.drivers,this.schedule,this.liveDrivers)

    await this.renderMap()
  },

  /* ---------- TIME ---------- */

  filterExpiredTrips(){

    const now = new Date()

    this.trips = this.trips.filter(t=>{
      const d = new Date(`${t.tripDate} ${t.tripTime}`)
      if(isNaN(d)) return true
      return ((now-d)/60000) <= 60
    })

  },

  sortTrips(){
    this.trips.sort((a,b)=>{
      return new Date(`${a.tripDate} ${a.tripTime}`) - new Date(`${b.tripDate} ${b.tripTime}`)
    })
  },

  /* ---------- DAY ---------- */

  getDay(dateStr){

    const days=["sun","mon","tue","wed","thu","fri","sat"]

    const d = new Date(dateStr)
    if(isNaN(d)) return ""

    return days[d.getDay()]
  },

  /* ---------- DRIVER FILTER ---------- */

  isDriverWorking(driverId, date){

    const s = this.schedule?.[driverId]
    if(!s || !s.enabled || !s.days) return false

    const day = this.getDay(date)

    return Object.keys(s.days).some(k=>{
      return k.toLowerCase().slice(0,3) === day
        && s.days[k]
    })

  },

  getDriversForTrip(trip){
    return this.drivers.filter(d=>this.isDriverWorking(d._id, trip.tripDate))
  },

  /* ---------- DRIVER DATA ---------- */

  getDriverName(id){
    return this.drivers.find(d=>String(d._id)===String(id))?.name || "-"
  },

  getVehicle(id){
    return this.drivers.find(d=>String(d._id)===String(id))?.vehicleNumber || "-"
  },

  /* ---------- MAP ---------- */

  async renderMap(){

    if(!document.getElementById("dispatchMap")) return

    if(!this.map){
      this.map = L.map("dispatchMap").setView([33.45,-112.07],10)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(this.map)
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
          ${t.tripNumber}<br>
          ${this.getDriverName(t.driverId)}
        `)

      this.tripMarkers.push(m)
    }

  },

  async geocode(address){

    try{
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
      const d = await res.json()
      if(!d.length) return null
      return {lat:+d[0].lat,lng:+d[0].lon}
    }catch{
      return null
    }

  }

}