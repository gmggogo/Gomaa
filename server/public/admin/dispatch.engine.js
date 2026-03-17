const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  liveDrivers: [],

  /* ================= LOAD ================= */
  async load(){

    try{

      this.trips = await Store.getTrips()
      this.drivers = await Store.getDrivers()
      this.schedule = await Store.getSchedule()
      this.liveDrivers = await Store.getLiveDrivers()

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers, this.schedule, this.liveDrivers)

      this.bind()

    }catch(err){
      console.error("Load error", err)
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

  /* ================= TODAY ================= */
  getTodayKey(){

    const d = new Date(
      new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,"0")
    const day = String(d.getDate()).padStart(2,"0")

    return `${y}-${m}-${day}`
  },

  getTripKey(dateStr){

    const d = new Date(dateStr)

    const az = new Date(
      d.toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    const y = az.getFullYear()
    const m = String(az.getMonth()+1).padStart(2,"0")
    const day = String(az.getDate()).padStart(2,"0")

    return `${y}-${m}-${day}`
  },

  /* ================= DRIVER FILTER ================= */
  getDriversForTrip(trip){

    const key = this.getTripKey(trip.tripDate)

    return this.drivers.filter(d=>{

      const s = this.schedule[d._id]

      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false

      return s.days[key] === true

    })

  },

  /* ================= HELPERS ================= */
  getDriverVehicleById(id){

    const d = this.drivers.find(x=>String(x._id)===String(id))
    return d ? d.vehicleNumber : ""
  },

  bind(){

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

  /* ================= ACTIONS ================= */

  async sendSingle(id){

    try{
      await Store.sendTrips([id])
      alert("Trip sent")
      this.load()
    }catch(err){
      alert("Send failed")
    }

  },

  async redistributeSelected(){

    const ids = UI.getSelected()

    if(!ids.length){
      alert("Select trips")
      return
    }

    const trips = this.trips.filter(t=>ids.includes(t._id))

    for(const trip of trips){

      const drivers = this.getDriversForTrip(trip)

      if(!drivers.length){
        console.log("No driver for", trip.tripDate)
        continue
      }

      const driver = drivers[0]

      await Store.assignDriver(trip._id, driver._id)

    }

    alert("Assigned")
    this.load()

  }

}

Engine.load()