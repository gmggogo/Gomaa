const Engine = {

  trips: [],
  drivers: [],
  schedule: {},

  geoCache: {},

  /* ================= LOAD ================= */

  async load(){

    this.trips = await Store.getTrips()
    this.drivers = await Store.getDrivers()
    this.schedule = await Store.getSchedule()

    this.prepareTrips()
  },

  /* ================= PREP ================= */

  prepareTrips(){

    this.trips.forEach(t=>{
      t.selected = false
      t.driverId = t.driverId || ""
    })

    this.sortTrips()
  },

  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })

  },

  /* ================= DRIVER CHECK ================= */

  isDriverActiveOnDate(driverId, date){

    const s = this.schedule[driverId]

    if(!s || s.enabled === false) return false

    return !!s.days?.[date]
  },

  getValidDriversForTrip(trip){

    return this.drivers.filter(d =>
      this.isDriverActiveOnDate(d._id, trip.tripDate)
    )

  },

  /* ================= GEO ================= */

  async geocode(address){

    if(!address) return null

    if(this.geoCache[address]) return this.geoCache[address]

    try{

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

      const res = await fetch(url)
      const data = await res.json()

      if(!data.length) return null

      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      }

      this.geoCache[address] = result

      return result

    }catch(e){
      return null
    }

  },

  getDistance(a,b){

    if(!a || !b) return 999999

    const R = 6371

    const dLat = (b.lat-a.lat) * Math.PI/180
    const dLon = (b.lng-a.lng) * Math.PI/180

    const x = Math.sin(dLat/2)**2 +
      Math.cos(a.lat*Math.PI/180) *
      Math.cos(b.lat*Math.PI/180) *
      Math.sin(dLon/2)**2

    const d = 2 * R * Math.atan2(Math.sqrt(x),Math.sqrt(1-x))

    return d // km
  },

  /* ================= SMART ASSIGN ================= */

  async autoAssign(){

    for(const trip of this.trips){

      if(trip.driverId) continue

      const drivers = this.getValidDriversForTrip(trip)

      if(!drivers.length) continue

      const tripLoc = await this.geocode(trip.pickup)

      let bestDriver = null
      let bestScore = 999999

      for(const d of drivers){

        let startPoint = null

        // لو عنده رحلة قبلها
        const lastTrip = this.getLastTripForDriver(d._id)

        if(lastTrip){
          startPoint = await this.geocode(lastTrip.dropoff)
        }else{
          // اول يوم → عنوانه
          startPoint = await this.geocode(d.address || d.homeAddress)
        }

        const dist = this.getDistance(startPoint, tripLoc)

        // عدالة توزيع
        const load = this.getDriverTripsCount(d._id) * 2

        const score = dist + load

        if(score < bestScore){
          bestScore = score
          bestDriver = d
        }

      }

      if(bestDriver){
        trip.driverId = bestDriver._id
      }

    }

  },

  /* ================= HELPERS ================= */

  getDriverTripsCount(id){
    return this.trips.filter(t=>t.driverId===id).length
  },

  getLastTripForDriver(id){

    const list = this.trips
      .filter(t=>t.driverId===id)
      .sort((a,b)=>{
        const da = new Date(`${a.tripDate} ${a.tripTime}`)
        const db = new Date(`${b.tripDate} ${b.tripTime}`)
        return db - da
      })

    return list[0]
  },

  getDriverCar(id){
    const d = this.drivers.find(x=>x._id===id)
    return d?.car || ""
  },

  getActiveDriversForPanel(){
    return this.drivers.filter(d => d.active !== false)
  },

  getLatestTripForDriver(id){

    const list = this.trips
      .filter(t=>t.driverId===id)
      .sort((a,b)=>{
        const da = new Date(`${a.tripDate} ${a.tripTime}`)
        const db = new Date(`${b.tripDate} ${b.tripTime}`)
        return db - da
      })

    return list[0]
  },

  getDriverStatus(id){
    const count = this.getDriverTripsCount(id)
    return count > 0 ? "Busy":"Available"
  },

  getTripDateTimeValue(t){
    return new Date(`${t.tripDate} ${t.tripTime}`).getTime()
  },

  redistributeSelected(list){

    list.forEach(t=>{
      t.driverId = ""
    })

    return this.autoAssign()
  }

}

window.Engine = Engine