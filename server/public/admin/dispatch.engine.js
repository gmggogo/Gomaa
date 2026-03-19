/* ================= ENGINE ================= */

const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  selected: {},
  editMode: false,

  /* ================= LOAD ================= */

  async load(){

    try{

      console.log("🔥 ENGINE LOADING...")

      const data = await Store.load()

      this.trips = (data.trips || []).map(t => ({
        ...t,
        _id: String(t._id || ""),
        driverId: t.driverId ? String(t.driverId) : "",
        vehicle: t.vehicle || "",
        disabled: t.disabled === true
      }))

      this.drivers = (data.drivers || []).map(d => ({
        ...d,
        _id: String(d._id || "")
      }))

      this.schedule = data.schedule || {}

      this.selected = {}

      this.trips.forEach(t=>{
        this.selected[t._id] = false
      })

      this.sortTrips()

      this.autoAssign()

      UI.render()

      console.log("✅ ENGINE READY")

    }catch(e){
      console.error("❌ ENGINE ERROR:", e)
    }

  },

  /* ================= SORT ================= */

  sortTrips(){

    this.trips.sort((a,b)=>{
      return this.getDateValue(a) - this.getDateValue(b)
    })

  },

  getDateValue(t){

    const str = `${t.tripDate || ""} ${t.tripTime || ""}`
    const d = new Date(str)

    return isNaN(d.getTime()) ? 0 : d.getTime()

  },

  /* ================= DRIVER ================= */

  getDriver(id){
    return this.drivers.find(d=>String(d._id) === String(id))
  },

  getDriverSchedule(id){
    return this.schedule[String(id)] || {}
  },

  getDriverVehicle(id){

    const s = this.getDriverSchedule(id)
    const d = this.getDriver(id) || {}

    return s.vehicleNumber || d.vehicleNumber || ""

  },

  isDriverActive(id, trip){

    const s = this.getDriverSchedule(id)
    if(!s) return true
    if(s.enabled === false) return false

    if(!trip.tripDate) return true

    const day = new Date(trip.tripDate)
      .toLocaleDateString("en-US",{weekday:"short"})
      .toLowerCase()

    return s.days ? s.days[day] : true

  },

  getAvailableDrivers(trip){

    return this.drivers
      .filter(d=>this.isDriverActive(d._id,trip))
      .sort((a,b)=>{

        const aCount = this.countTrips(a._id)
        const bCount = this.countTrips(b._id)

        return aCount - bCount

      })

  },

  countTrips(driverId){

    return this.trips.filter(t=>
      String(t.driverId) === String(driverId)
    ).length

  },

  /* ================= AUTO ASSIGN ================= */

  autoAssign(){

    this.trips.forEach(t=>{

      if(t.driverId) return

      const drivers = this.getAvailableDrivers(t)

      if(!drivers.length) return

      const d = drivers[0]

      t.driverId = d._id
      t.vehicle = this.getDriverVehicle(d._id)

    })

  },

  /* ================= ACTIONS ================= */

  toggleSelect(id){

    this.selected[id] = !this.selected[id]
    UI.render()

  },

  toggleSelectAll(){

    const all = Object.values(this.selected).every(v=>v)

    this.trips.forEach(t=>{
      this.selected[t._id] = !all
    })

    UI.render()

  },

  toggleEdit(){

    this.editMode = !this.editMode
    UI.render()

  },

  async assignManual(tripId, driverId){

    const trip = this.trips.find(t=>t._id === tripId)
    if(!trip) return

    if(!driverId){
      trip.driverId = ""
      trip.vehicle = ""
      UI.render()
      return
    }

    if(!this.isDriverActive(driverId, trip)){
      alert("Driver not active")
      return
    }

    const d = this.getDriver(driverId)

    trip.driverId = driverId
    trip.vehicle = this.getDriverVehicle(driverId)

    await Store.assignDriver(tripId, driverId)

    UI.render()

  },

  async sendOne(id){

    await Store.sendTrips([id])
    console.log("Sent:", id)

  },

  async sendSelected(){

    const ids = this.trips
      .filter(t=>this.selected[t._id])
      .map(t=>t._id)

    if(!ids.length) return

    await Store.sendTrips(ids)

    console.log("Sent:", ids)

  },

  async disable(id){

    await Store.disableTrip(id)

    this.trips = this.trips.filter(t=>t._id !== id)

    delete this.selected[id]

    UI.render()

  },

  async redistributeSelected(){

    const selected = this.trips.filter(t=>this.selected[t._id])

    selected.forEach(t=>{

      const drivers = this.getAvailableDrivers(t)

      if(!drivers.length) return

      const d = drivers[0]

      t.driverId = d._id
      t.vehicle = this.getDriverVehicle(d._id)

    })

    UI.render()

  }

}

/* ================= GLOBAL ================= */

window.Engine = Engine

window.toggleSelect = ()=>Engine.toggleSelectAll()
window.toggleEdit = ()=>Engine.toggleEdit()
window.sendSelected = ()=>Engine.sendSelected()
window.redistribute = ()=>Engine.redistributeSelected()

/* ================= START ================= */

document.addEventListener("DOMContentLoaded",()=>{
  Engine.load()
})