const Engine = {

  trips: [],
  drivers: [],
  schedule: {},
  liveDrivers: [],

  manualMode: false,
  selectAllMode: false,

  map: null,
  tripMarkers: [],
  driverMarkers: [],

  /* ================= LOAD ================= */
  async load(){

    try{

      this.trips = await Store.getTrips() || []
      this.drivers = await Store.getDrivers() || []
      this.schedule = await Store.getSchedule() || {}
      this.liveDrivers = await Store.getLiveDrivers() || []

      if(!Array.isArray(this.trips)) this.trips = []
      if(!Array.isArray(this.drivers)) this.drivers = []
      if(!Array.isArray(this.liveDrivers)) this.liveDrivers = []
      if(!this.schedule || typeof this.schedule !== "object") this.schedule = {}

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers, this.schedule, this.liveDrivers)

      this.bind()

      await this.renderMap()

    }catch(err){
      console.error("Load error", err)
    }

  },

  /* ================= SORT ================= */
  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate || ""} ${a.tripTime || ""}`)
      const db = new Date(`${b.tripDate || ""} ${b.tripTime || ""}`)

      if(isNaN(da) && isNaN(db)) return 0
      if(isNaN(da)) return 1
      if(isNaN(db)) return -1

      return da - db
    })

  },

  /* ================= DATE KEYS ================= */
  getTodayKey(){

    const d = new Date(
      new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" })
    )

    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,"0")
    const day = String(d.getDate()).padStart(2,"0")

    return `${y}-${m}-${day}`
  },

  getTripKey(dateStr){

    const d = new Date(dateStr)

    if(isNaN(d)) return ""

    const az = new Date(
      d.toLocaleString("en-US",{ timeZone:"America/Phoenix" })
    )

    const y = az.getFullYear()
    const m = String(az.getMonth()+1).padStart(2,"0")
    const day = String(az.getDate()).padStart(2,"0")

    return `${y}-${m}-${day}`
  },

  getDayShortFromDate(dateStr){

    const d = new Date(dateStr)
    if(isNaN(d)) return ""

    const az = new Date(
      d.toLocaleString("en-US",{ timeZone:"America/Phoenix" })
    )

    return ["sun","mon","tue","wed","thu","fri","sat"][az.getDay()]
  },

  /* ================= SCHEDULE HELPERS ================= */
  normalizeDays(daysObj){

    const out = {}

    if(!daysObj || typeof daysObj !== "object") return out

    Object.keys(daysObj).forEach(k=>{
      const key = String(k).trim()
      const val = daysObj[k]

      out[key] = val
      out[key.toLowerCase()] = val
      out[key.toLowerCase().slice(0,3)] = val
    })

    return out
  },

  isDriverEnabled(driverId){

    const s = this.schedule[driverId]
    if(!s) return false
    if(s.enabled === false) return false
    return true
  },

  isDriverWorkingForTrip(driverId, tripDate){

    const s = this.schedule[driverId]
    if(!s) return false
    if(s.enabled === false) return false
    if(!s.days) return false

    const tripKey = this.getTripKey(tripDate)
    const dayShort = this.getDayShortFromDate(tripDate)
    const days = this.normalizeDays(s.days)

    if(days[tripKey] === true) return true
    if(days[dayShort] === true) return true

    return false
  },

  /* ================= DRIVER FILTER ================= */
  getDriversForTrip(trip){

    if(!trip) return []

    return this.drivers.filter(d=>{
      return this.isDriverWorkingForTrip(d._id, trip.tripDate)
    })

  },

  /* ================= HELPERS ================= */
  getDriverById(id){
    return this.drivers.find(x=>String(x._id)===String(id)) || null
  },

  getDriverNameById(id){

    const d = this.getDriverById(id)
    return d ? (d.name || "-") : "-"

  },

  getDriverVehicleById(id){

    const d = this.getDriverById(id)
    return d ? (d.vehicleNumber || "-") : "-"

  },

  getDriverAddressById(id){

    const d = this.getDriverById(id)
    return d ? (d.address || "-") : "-"

  },

  getSelected(){

    return [...document.querySelectorAll(".tripSelect:checked")]
      .map(el=>el.value)

  },

  /* ================= UI BIND ================= */
  bind(){

    document.querySelectorAll(".tripSelect").forEach(box=>{

      box.addEventListener("change",()=>{

        const row = box.closest("tr")
        const btn = row?.querySelector(".btn-send")

        if(btn){
          btn.disabled = !box.checked
        }

        if(row){
          row.classList.toggle("row-selected", box.checked)
        }

      })

    })

    document.querySelectorAll(".driverEdit").forEach(select=>{

      select.addEventListener("change",()=>{

        const row = select.closest("tr")
        if(!row) return

        const carCell = row.querySelector(".carCell")
        const driverNameSpan = row.querySelector(".driverName")

        if(carCell){
          carCell.innerText = this.getDriverVehicleById(select.value) || "-"
        }

        if(driverNameSpan){
          driverNameSpan.innerText = this.getDriverNameById(select.value) || "-"
        }

      })

    })

  },

  /* ================= ACTIONS ================= */
  async sendSingle(id){

    try{
      await Store.sendTrips([id])
      alert("Trip sent")
      await this.load()
    }catch(err){
      console.error(err)
      alert("Send failed")
    }

  },

  async redistributeSelected(){

    try{

      const ids = this.getSelected()

      if(!ids.length){
        alert("Select trips first")
        return
      }

      const trips = this.trips.filter(t=>ids.includes(t._id))

      for(const trip of trips){

        const drivers = this.getDriversForTrip(trip)

        if(!drivers.length){
          console.log("No driver available for", trip.tripNumber || trip._id)
          continue
        }

        const currentLoads = drivers.map(d=>{
          const count = this.trips.filter(t=>String(t.driverId)===String(d._id)).length
          return { driver:d, count }
        })

        currentLoads.sort((a,b)=>a.count - b.count)

        const bestDriver = currentLoads[0]?.driver

        if(bestDriver){
          await Store.assignDriver(trip._id, bestDriver._id)
        }

      }

      alert("Assigned")
      await this.load()

    }catch(err){
      console.error(err)
      alert("Assign failed")
    }

  },

  async saveManualChanges(){

    try{

      const rows = [...document.querySelectorAll("#dispatchBody tr")]

      for(const row of rows){

        const tripId = row.dataset.id
        if(!tripId) continue

        const driverEdit = row.querySelector(".driverEdit")
        const noteEdit = row.querySelector(".noteEdit")

        if(driverEdit && driverEdit.value){
          await Store.assignDriver(tripId, driverEdit.value)
        }

        if(noteEdit && typeof Store.saveNote === "function"){
          await Store.saveNote(tripId, noteEdit.value || "")
        }

      }

      alert("Changes saved")
      await this.load()

    }catch(err){
      console.error(err)
      alert("Save failed")
    }

  },

  /* ================= MAP ================= */
  async renderMap(){

    const el = document.getElementById("dispatchMap")
    if(!el || typeof L === "undefined") return

    if(!this.map){

      this.map = L.map("dispatchMap").setView([33.4484,-112.0740], 10)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"&copy; OpenStreetMap contributors"
      }).addTo(this.map)

    }

    this.tripMarkers.forEach(m=>{
      try{ this.map.removeLayer(m) }catch{}
    })

    this.driverMarkers.forEach(m=>{
      try{ this.map.removeLayer(m) }catch{}
    })

    this.tripMarkers = []
    this.driverMarkers = []

    for(const t of this.trips){

      const point = await this.geocode(t.pickup)
      if(!point) continue

      const marker = L.marker([point.lat, point.lng])
        .addTo(this.map)
        .bindPopup(`
          <b>${t.tripNumber || "Trip"}</b><br>
          Client: ${t.clientName || "-"}<br>
          Driver: ${this.getDriverNameById(t.driverId)}<br>
          Car: ${this.getDriverVehicleById(t.driverId)}
        `)

      this.tripMarkers.push(marker)
    }

    for(const d of this.liveDrivers){

      if(d.lat == null || d.lng == null) continue

      const marker = L.circleMarker([d.lat, d.lng],{
        radius:8,
        color:"#16a34a",
        fillColor:"#16a34a",
        fillOpacity:0.9
      })
      .addTo(this.map)
      .bindPopup(`
        <b>${d.name || "Driver"}</b><br>
        Car: ${this.getDriverVehicleById(d.driverId)}
      `)

      this.driverMarkers.push(marker)
    }

  },

  geoCache: {},

  async geocode(address){

    if(!address) return null

    const key = String(address).trim().toLowerCase()
    if(this.geoCache[key]) return this.geoCache[key]

    try{

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      )

      const data = await res.json()

      if(!Array.isArray(data) || !data.length) return null

      const point = {
        lat: Number(data[0].lat),
        lng: Number(data[0].lon)
      }

      this.geoCache[key] = point
      return point

    }catch(err){
      console.error("Geocode error", err)
      return null
    }

  }

}

Engine.load()