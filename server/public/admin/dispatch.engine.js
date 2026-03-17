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

    try{

      // 🔥 تحميل كل حاجة مرة واحدة
      const data = await Store.loadAll()

      this.trips = data.trips || []
      this.drivers = data.drivers || []
      this.schedule = data.schedule || {}

      this.liveDrivers = await Store.getLiveDrivers()

      console.log("Trips:", this.trips)
      console.log("Drivers:", this.drivers)
      console.log("Schedule:", this.schedule)

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers, this.schedule)

    }catch(err){
      console.error("Engine Load Error", err)
    }

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
  getDriverById(id){
    return this.drivers.find(x=>String(x._id)===String(id))
  },

  getDriverVehicleById(id){

    const s = this.schedule[id] || {}
    const d = this.getDriverById(id)

    return s.vehicleNumber || d?.vehicleNumber || "-"
  },

  /* ================= FILTER ================= */
  getDriversForTrip(trip){

    const today = this.getTodayKey()

    return this.drivers.filter(d=>{
      const s = this.schedule[d._id]
      return s && s.enabled && s.days && s.days[today]
    })

  },

  /* ================= ASSIGN ================= */
  async assignDriver(tripId, driverId){

    const trip = this.trips.find(t=>String(t._id)===String(tripId))
    if(!trip) return

    const driver = this.getDriverById(driverId)
    if(!driver) return

    const s = this.schedule[driverId] || {}

    // 🔥 تحديث محلي
    trip.driverId = driverId
    trip.driverName = driver.name
    trip.vehicle = s.vehicleNumber || driver.vehicleNumber || "-"

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

    await this.reload()

  },

  async sendSingle(id){

    await Store.sendTrips([id])

    await this.reload()

  }

}