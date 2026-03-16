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

  manualMode: false,
  selectAllMode: false,

  async load(){

    try{

      this.trips = await Store.getTrips() || []
      this.drivers = await Store.getDrivers() || []
      this.schedule = await Store.getSchedule() || {}
      this.liveDrivers = await Store.getLiveDrivers() || []

      this.sortTrips()

      UI.renderTrips(this.trips)
      UI.renderDriversPanel(this.drivers, this.schedule, this.liveDrivers)

      this.bindSelection()

      await this.renderMap()

      setTimeout(()=>{
        if(this.map) this.map.invalidateSize()
      }, 300)

    }catch(err){

      console.error("Dispatch Load Error", err)

    }

  },

  sortTrips(){

    this.trips.sort((a,b)=>{
      const da = new Date(`${a.tripDate} ${a.tripTime}`)
      const db = new Date(`${b.tripDate} ${b.tripTime}`)
      return da - db
    })

  },

  getToday(){

    const days = ["sun","mon","tue","wed","thu","fri","sat"]

    const now = new Date(
      new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    return days[now.getDay()]
  },

  getDriverVehicleById(driverId){

    if(!driverId) return ""

    const driver = this.drivers.find(d=>String(d._id)===String(driverId))
    if(!driver) return ""

    return driver.vehicleNumber || ""
  },

  getActiveDrivers(){

    const today = this.getToday()

    return this.drivers.filter(d=>{
      const s = this.schedule[d._id]
      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false
      return !!s.days[today]
    })

  },

  bindSelection(){

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

  getSelected(){

    return [...document.querySelectorAll(".tripSelect:checked")]
      .map(el=>el.value)

  },

  toggleSelectAll(){

    this.selectAllMode = !this.selectAllMode

    document.querySelectorAll(".tripSelect").forEach(box=>{
      box.checked = this.selectAllMode

      const row = box.closest("tr")
      const btn = row.querySelector(".btn-send")

      if(btn){
        btn.disabled = !box.checked
      }

      row.classList.toggle("row-selected", box.checked)
    })

    const btn = document.getElementById("selectToggleBtn")
    if(btn){
      btn.innerText = this.selectAllMode ? "Remove All" : "Select All"
    }

  },

  toggleManualEdit(){

    this.manualMode = !this.manualMode

    document.querySelectorAll("tbody tr").forEach(row=>{

      const selected = row.querySelector(".tripSelect")?.checked
      if(!selected) return

      const driverName = row.querySelector(".driverName")
      const driverEdit = row.querySelector(".driverEdit")
      const noteName = row.querySelector(".noteName")
      const noteEdit = row.querySelector(".noteEdit")
      const carCell = row.querySelector(".carCell")

      if(driverName) driverName.style.display = this.manualMode ? "none":"inline"
      if(driverEdit) driverEdit.style.display = this.manualMode ? "block":"none"

      if(noteName) noteName.style.display = this.manualMode ? "none":"inline"
      if(noteEdit) noteEdit.style.display = this.manualMode ? "block":"none"

      if(driverEdit && this.manualMode){
        driverEdit.onchange = ()=>{
          carCell.innerText = this.getDriverVehicleById(driverEdit.value) || "-"
        }
      }

    })

  },

  async saveManualChanges(){

    const rows = [...document.querySelectorAll("tbody tr")]

    for(const row of rows){

      const chk = row.querySelector(".tripSelect")
      if(!chk?.checked) continue

      const tripId = row.dataset.id
      const driverEdit = row.querySelector(".driverEdit")
      const noteEdit = row.querySelector(".noteEdit")

      if(driverEdit && driverEdit.value){
        await Store.assignDriver(tripId, driverEdit.value)
      }

      if(noteEdit){
        await Store.saveNote(tripId, noteEdit.value || "")
      }

    }

    this.manualMode = false

    alert("Changes saved")

    await this.load()

  },

  async sendSelected(){

    const ids = this.getSelected()

    if(!ids.length){
      alert("Select trips first")
      return
    }

    await Store.sendTrips(ids)

    alert("Trips sent")

    await this.load()

  },

  async sendSingle(id, btn){

    const row = btn.closest("tr")
    const chk = row.querySelector(".tripSelect")

    if(!chk || !chk.checked){
      alert("Select the trip first")
      return
    }

    await Store.sendTrips([id])

    alert("Trip sent")

    await this.load()

  },

  async redistributeSelected(){

    const ids = this.getSelected()

    if(!ids.length){
      alert("Select trips first")
      return
    }

    const drivers = this.getActiveDrivers()

    if(!drivers.length){
      alert("No active drivers today")
      return
    }

    const selectedTrips = this.trips
      .filter(t=>ids.includes(t._id))
      .sort((a,b)=>{
        const da = new Date(`${a.tripDate} ${a.tripTime}`)
        const db = new Date(`${b.tripDate} ${b.tripTime}`)
        return da - db
      })

    const driverState = {}

    drivers.forEach(d=>{
      driverState[d._id] = {
        tripCount: 0,
        lastDropoff: "",
        lastEnd: null
      }
    })

    for(const trip of selectedTrips){

      const driversWithoutTrips = drivers.filter(d=>driverState[d._id].tripCount === 0)
      const pool = driversWithoutTrips.length ? driversWithoutTrips : drivers

      let bestDriver = null
      let bestScore = Infinity

      for(const driver of pool){

        const score = await this.computeDriverScore(driver, trip, driverState[driver._id])

        if(score < bestScore){
          bestScore = score
          bestDriver = driver
        }

      }

      if(!bestDriver) continue

      await Store.assignDriver(trip._id, bestDriver._id)

      driverState[bestDriver._id].tripCount += 1
      driverState[bestDriver._id].lastDropoff = trip.dropoff
      driverState[bestDriver._id].lastEnd = this.estimateTripEnd(trip.tripDate, trip.tripTime)

    }

    alert("Trips redistributed")

    await this.load()

  },

  async computeDriverScore(driver, trip, state){

    const scheduleRow = this.schedule[driver._id] || {}
    const liveDriver = this.liveDrivers.find(d=>String(d.driverId)===String(driver._id))

    let originAddress = ""

    if(state.lastDropoff){
      originAddress = state.lastDropoff
    }else if(liveDriver && liveDriver.lat != null && liveDriver.lng != null){
      const liveAddress = await this.reverseGeocode(liveDriver.lat, liveDriver.lng)
      originAddress = liveAddress || scheduleRow.address || driver.address || ""
    }else{
      originAddress = scheduleRow.address || driver.address || ""
    }

    const route = await this.getRouteByAddress(originAddress, trip.pickup)

    let distanceKm = route ? route.distanceKm : 999
    let durationMin = route ? route.durationMin : 999

    const traffic = this.trafficFactor(trip.tripTime)
    durationMin *= traffic

    let timePenalty = 0

    if(state.lastEnd){
      const tripStart = new Date(`${trip.tripDate} ${trip.tripTime}`)
      const gapMin = (tripStart - state.lastEnd) / 60000

      if(gapMin < durationMin){
        timePenalty = 9999
      }else{
        timePenalty = Math.max(0, 60 - gapMin) * 1.2
      }
    }

    const fairnessPenalty = state.tripCount * 15

    return (distanceKm * 2) + (durationMin * 3) + fairnessPenalty + timePenalty

  },

  trafficFactor(timeStr){

    if(!timeStr) return 1

    const h = Number(String(timeStr).split(":")[0])

    if(h >= 6 && h <= 9) return 1.35
    if(h >= 15 && h <= 18) return 1.3

    return 1
  },

  estimateTripEnd(dateStr, timeStr){

    const d = new Date(`${dateStr} ${timeStr}`)
    d.setMinutes(d.getMinutes() + 35)
    return d
  },

  async geocode(address){

    if(!address) return null

    const key = `geo:${address.trim().toLowerCase()}`

    if(this.geoCache[key]){
      return this.geoCache[key]
    }

    try{
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      const res = await fetch(url, {
        headers: {
          "Accept":"application/json"
        }
      })

      const data = await res.json()

      if(!data.length) return null

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

  },

  async reverseGeocode(lat, lng){

    if(lat == null || lng == null) return ""

    const key = `rev:${lat},${lng}`

    if(this.geoCache[key]){
      return this.geoCache[key]
    }

    try{
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      const res = await fetch(url, {
        headers: {
          "Accept":"application/json"
        }
      })

      const data = await res.json()
      const addr = data?.display_name || ""

      this.geoCache[key] = addr

      return addr

    }catch(err){
      console.error("Reverse geocode error", err)
      return ""
    }

  },

  async getRouteByAddress(fromAddress, toAddress){

    if(!fromAddress || !toAddress) return null

    const cacheKey = `route:${fromAddress}__${toAddress}`.toLowerCase()

    if(this.routeCache[cacheKey]){
      return this.routeCache[cacheKey]
    }

    const from = await this.geocode(fromAddress)
    const to = await this.geocode(toAddress)

    if(!from || !to) return null

    try{
      const url = `${this.OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
      const res = await fetch(url)
      const data = await res.json()

      if(!data.routes || !data.routes.length) return null

      const route = {
        distanceKm: Number(data.routes[0].distance || 0) / 1000,
        durationMin: Number(data.routes[0].duration || 0) / 60
      }

      this.routeCache[cacheKey] = route

      return route

    }catch(err){
      console.error("OSRM route error", err)
      return null
    }

  },

  async renderMap(){

    const mapEl = document.getElementById("dispatchMap")
    if(!mapEl) return

    if(!this.map){
      this.map = L.map("dispatchMap").setView([33.4484,-112.0740], 10)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"&copy; OpenStreetMap contributors"
      }).addTo(this.map)

      window.addEventListener("resize",()=>{
        if(this.map) this.map.invalidateSize()
      })
    }

    this.tripMarkers.forEach(m=>this.map.removeLayer(m))
    this.driverMarkers.forEach(m=>this.map.removeLayer(m))

    this.tripMarkers = []
    this.driverMarkers = []

    for(const trip of this.trips){

      const pickup = await this.geocode(trip.pickup)

      if(pickup){
        const marker = L.marker([pickup.lat, pickup.lng])
          .addTo(this.map)
          .bindPopup(`
            <strong>${trip.tripNumber || "Trip"}</strong><br>
            Client: ${trip.clientName || "-"}<br>
            Pickup: ${trip.pickup || "-"}<br>
            Time: ${trip.tripTime || "-"}
          `)

        this.tripMarkers.push(marker)
      }
    }

    for(const d of this.liveDrivers){

      if(d.lat == null || d.lng == null) continue

      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 8,
        color: "#16a34a",
        fillColor: "#16a34a",
        fillOpacity: 0.9
      })
      .addTo(this.map)
      .bindPopup(`
        <strong>${d.name || "Driver"}</strong><br>
        Live Driver
      `)

      this.driverMarkers.push(marker)
    }

  }

}