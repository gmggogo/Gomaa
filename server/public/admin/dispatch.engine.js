const Engine = {

  trips: [],
  drivers: [],
  schedule: {},

  /* ================= LOAD ================= */
  async load(){

    try{

      const data = await Store.loadAll()

      // 🔥 نجيب بس الرحلات اللي عليها Dispatch = true
      this.trips = (data.trips || []).filter(t => t.dispatch === true)

      this.drivers = data.drivers || []
      this.schedule = data.schedule || {}

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers, this.schedule)

    }catch(err){
      console.error("Load Error", err)
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

  /* ================= DRIVER ================= */
  getDriverById(id){
    return this.drivers.find(d=>String(d._id)===String(id))
  },

  getDriverVehicleById(id){

    const s = this.schedule[id] || {}
    const d = this.getDriverById(id)

    return s.vehicleNumber || d?.vehicleNumber || "-"
  },

  /* ================= ASSIGN ================= */
  async assignDriver(tripId, driverId){

    const trip = this.trips.find(t=>String(t._id)===String(tripId))
    if(!trip) return

    const driver = this.getDriverById(driverId)
    if(!driver) return

    const s = this.schedule[driverId] || {}

    // 🔥 تحديث UI
    trip.driverId = driverId
    trip.driverName = driver.name
    trip.vehicle = s.vehicleNumber || driver.vehicleNumber || "-"

    await Store.assignDriver(tripId, driverId)

    UI.renderTrips(this.trips)

  },

  /* ================= DISABLE (REMOVE FROM DISPATCH) ================= */
  async disableTrip(tripId){

    try{

      // 🔥 نغير الحالة في السيرفر
      await fetch(`/api/dispatch/${tripId}/disable`,{
        method:"PATCH"
      })

      // 🔥 نشيله من الصفحة فورًا
      this.trips = this.trips.filter(t=>String(t._id)!==String(tripId))

      UI.renderTrips(this.trips)

    }catch(err){
      console.error("Disable Error", err)
    }

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

  }

}