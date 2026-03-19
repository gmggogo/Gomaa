const Engine = {

/* ================= STATE ================= */

trips: [],
drivers: [],
schedule: {},

map: null,
markers: [],

editMode: false,
allSelected: false,

geoCache: {},
routeCache: {},

/* ================= INIT ================= */

async load(){

  try{

    const data = await Store.load()

    this.trips = (data.trips || []).map(t=>({
      ...t,
      _id: String(t._id || ""),
      selected: false,
      driverId: t.driverId ? String(t.driverId) : ""
    }))

    this.drivers = (data.drivers || []).map(d=>({
      ...d,
      _id: String(d._id || "")
    }))

    this.schedule = data.schedule || {}

    this.autoAssign()
    this.sortTrips()

    UI.init()
    UI.render()

    this.initMap()

    console.log("Engine Loaded")

  }catch(err){
    console.error("ENGINE LOAD ERROR", err)
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

/* ================= DRIVER LOGIC ================= */

isDriverActiveOnDate(driverId, tripDate){

  const s = this.schedule[String(driverId)]

  // لو مفيش schedule → شغال
  if(!s) return true

  if(s.enabled === false) return false

  if(!tripDate) return true

  const d = new Date(tripDate)
  if(isNaN(d.getTime())) return true

  const day = d.toLocaleDateString("en-US",{weekday:"short"}).toLowerCase()

  const days = s.days || {}

  // fallback
  if(!Object.keys(days).length) return true

  return days[day] !== false
},

getValidDriversForTrip(trip){
  return this.drivers.filter(d=>this.isDriverActiveOnDate(d._id, trip.tripDate))
},

getDriverCar(id){
  const s = this.schedule[String(id)]
  if(!s) return ""
  return s.carNumber || s.vehicleNumber || s.car || ""
},

getDriverTripsCount(id){
  return this.trips.filter(t=>String(t.driverId)===String(id)).length
},

getLatestTripForDriver(id){
  const list = this.trips.filter(t=>String(t.driverId)===String(id))
  if(!list.length) return null

  list.sort((a,b)=>{
    return new Date(b.tripDate+" "+b.tripTime) - new Date(a.tripDate+" "+a.tripTime)
  })

  return list[0]
},

/* ================= AUTO ASSIGN ================= */

autoAssign(){

  this.trips.forEach(t=>{

    if(!t.driverId){

      const valid = this.getValidDriversForTrip(t)

      if(!valid.length){
        t.driverId = ""
        t.vehicle = ""
        return
      }

      valid.sort((a,b)=>{
        return this.getDriverTripsCount(a._id) - this.getDriverTripsCount(b._id)
      })

      const d = valid[0]

      t.driverId = d._id
      t.vehicle = this.getDriverCar(d._id)

    }

  })

},

/* ================= ACTIONS ================= */

toggleTrip(i){
  if(!this.trips[i]) return
  this.trips[i].selected = !this.trips[i].selected
  UI.renderTrips()
},

toggleSelect(){
  this.allSelected = !this.allSelected
  this.trips.forEach(t=>t.selected = this.allSelected)
  UI.renderTrips()
},

toggleEdit(){
  this.editMode = !this.editMode

  const btn = document.getElementById("editBtn")
  if(btn) btn.innerText = this.editMode ? "Save" : "Edit Selected"

  UI.renderTrips()
},

assignDriver(i,id){

  if(!this.trips[i]) return

  const d = this.drivers.find(x=>String(x._id)===String(id))

  this.trips[i].driverId = id ? String(id) : ""
  this.trips[i].vehicle = d ? this.getDriverCar(d._id) : ""

  UI.render()
},

async sendSelected(){

  const selected = this.trips.filter(t=>t.selected)

  if(!selected.length) return

  const ids = selected.map(t=>t._id)

  await Store.sendTrips(ids)

  console.log("SENT:", ids)
},

async sendOne(i){

  const t = this.trips[i]
  if(!t) return

  await Store.sendTrips([t._id])

  console.log("SEND ONE:", t._id)
},

async disableOne(i){

  const t = this.trips[i]
  if(!t) return

  await Store.disableTrip(t._id)

  this.trips.splice(i,1)

  UI.render()
},

redistribute(){

  const selected = this.trips.filter(t=>t.selected)

  if(!selected.length) return

  selected.forEach(t=>{

    const valid = this.getValidDriversForTrip(t)

    if(!valid.length){
      t.driverId = ""
      t.vehicle = ""
      return
    }

    valid.sort((a,b)=>{
      return this.getDriverTripsCount(a._id) - this.getDriverTripsCount(b._id)
    })

    const d = valid[0]

    t.driverId = d._id
    t.vehicle = this.getDriverCar(d._id)

  })

  UI.render()
},

/* ================= MAP ================= */

initMap(){

  if(this.map) return

  this.map = L.map("map").setView([33.4484,-112.0740],10)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(this.map)

},

clearMap(){
  this.markers.forEach(m=>{
    try{ this.map.removeLayer(m) }catch(e){}
  })
  this.markers=[]
},

/* ================= GEO ================= */

async geocode(addr){

  if(!addr) return null

  if(this.geoCache[addr]) return this.geoCache[addr]

  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`)
    const data = await res.json()

    if(!data.length) return null

    const point = {
      lat:parseFloat(data[0].lat),
      lng:parseFloat(data[0].lon)
    }

    this.geoCache[addr] = point
    return point

  }catch(err){
    console.log("GEOCODE ERROR", err)
    return null
  }

},

/* ================= ROUTE ================= */

async getRoute(points){

  if(points.length < 2) return null

  try{

    const coords = points.map(p=>`${p.lng},${p.lat}`).join(";")

    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
    const data = await res.json()

    if(!data.routes || !data.routes.length) return null

    const r = data.routes[0]

    return {
      coords: r.geometry.coordinates.map(c=>[c[1],c[0]]),
      distance:(r.distance/1609.34).toFixed(1),
      duration:Math.round(r.duration/60)
    }

  }catch(err){
    console.log("ROUTE ERROR", err)
    return null
  }

},

/* ================= DRIVER MAP ================= */

async focusDriver(id){

  const trip = this.getLatestTripForDriver(id)
  if(!trip) return

  this.clearMap()

  const points = []

  const p1 = await this.geocode(trip.pickup)
  const p2 = await this.geocode(trip.dropoff)

  if(p1) points.push(p1)
  if(p2) points.push(p2)

  if(points.length < 2) return

  const route = await this.getRoute(points)
  if(!route) return

  const line = L.polyline(route.coords,{color:"blue"}).addTo(this.map)

  this.map.fitBounds(line.getBounds())

}

}

/* ================= GLOBAL ================= */

window.Engine = Engine

document.addEventListener("DOMContentLoaded", ()=>{
  Engine.load()
})