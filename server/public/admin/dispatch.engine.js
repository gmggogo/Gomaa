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

      // reset selected
      this.selected = {}
      this.trips.forEach(t=>{
        this.selected[t._id] = false
      })

      this.sortTrips()

      this.autoAssign()

      UI.render()

    }catch(err){
      console.error("ENGINE LOAD ERROR:", err)
    }
  },

  /* ================= SORT ================= */

  sortTrips(){
    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })
  },

  /* ================= HELPERS ================= */

  getDriverSchedule(id){
    return this.schedule[String(id)] || {}
  },

  getDriverVehicle(id){
    const s = this.getDriverSchedule(id)
    const d = this.drivers.find(x=>String(x._id)===String(id)) || {}

    return s.vehicleNumber || d.vehicleNumber || ""
  },

  isDriverActive(id, trip){

    const d = this.drivers.find(x=>String(x._id)===String(id))
    if(!d) return false
    if(d.active === false) return false

    const s = this.getDriverSchedule(id)

    // لو مفيش schedule → اعتبره شغال
    if(!s || !s.days) return true

    const date = new Date(trip.tripDate)
    if(isNaN(date)) return true

    const day = date.toLocaleDateString("en-US",{weekday:"short"}).toLowerCase()

    return s.days[day] === true || s.days[day] === 1
  },

  getAvailableDrivers(trip){

    let list = this.drivers.filter(d=>this.isDriverActive(d._id, trip))

    // fallback لو مفيش
    if(!list.length){
      list = this.drivers
    }

    return list.sort((a,b)=>{
      return this.countTrips(a._id) - this.countTrips(b._id)
    })
  },

  countTrips(driverId){
    return this.trips.filter(t=>String(t.driverId)===String(driverId)).length
  },

  /* ================= AUTO ASSIGN ================= */

  autoAssign(){

    this.trips.forEach(t=>{

      if(t.disabled) return

      // لو already assigned سيبه
      if(t.driverId && this.isDriverActive(t.driverId, t)){
        t.vehicle = this.getDriverVehicle(t.driverId)
        return
      }

      const drivers = this.getAvailableDrivers(t)

      if(!drivers.length){
        t.driverId = ""
        t.vehicle = ""
        return
      }

      const d = drivers[0]

      t.driverId = String(d._id)
      t.vehicle = this.getDriverVehicle(d._id)

    })
  },

  /* ================= SELECT ================= */

  toggleSelect(id){
    this.selected[id] = !this.selected[id]
    UI.render()
  },

  toggleSelectAll(){

    const all = this.trips.length
    const selected = this.getSelected().length

    const value = selected !== all

    this.trips.forEach(t=>{
      this.selected[t._id] = value
    })

    UI.render()
  },

  getSelected(){
    return this.trips.filter(t=>this.selected[t._id])
  },

  /* ================= EDIT ================= */

  toggleEdit(){
    this.editMode = !this.editMode
    UI.render()
  },

  /* ================= MANUAL ASSIGN ================= */

  async assignManual(tripId, driverId){

    const trip = this.trips.find(t=>t._id===tripId)
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

    trip.driverId = driverId
    trip.vehicle = this.getDriverVehicle(driverId)

    try{
      await Store.assignDriver(tripId, driverId)
    }catch(e){
      console.log("SAVE ERROR", e)
    }

    UI.render()
  },

  /* ================= SEND ================= */

  async sendOne(id){
    try{
      await Store.sendTrips([id])
      console.log("sent", id)
    }catch(e){
      console.log(e)
    }
  },

  async sendSelected(){

    const ids = this.getSelected().map(t=>t._id)

    if(!ids.length){
      alert("Select trips first")
      return
    }

    try{
      await Store.sendTrips(ids)
      console.log("sent", ids)
    }catch(e){
      console.log(e)
    }
  },

  /* ================= DISABLE ================= */

  async disable(id){

    try{
      await Store.disableTrip(id)

      this.trips = this.trips.filter(t=>t._id !== id)
      delete this.selected[id]

      UI.render()

    }catch(e){
      console.log(e)
    }
  },

  /* ================= REDISTRIBUTE ================= */

  async redistributeSelected(){

    const selected = this.getSelected()

    if(!selected.length) return

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

document.addEventListener("DOMContentLoaded", ()=>{
  Engine.load()
})