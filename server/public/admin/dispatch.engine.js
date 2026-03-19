const Engine = {
  trips: [],
  drivers: [],
  schedule: {},
  editMode: false,
  selectedDriverId: null,
  allSelected: false,
  map: null,
  markers: [],
  geoCache: {},
  routeCache: {},

  async init(){
    const res = await fetch("/api/dispatch")
    const data = await res.json()

    this.drivers = (data.drivers || []).map(d => ({ ...d, _id: String(d._id) }))
    this.trips = (data.trips || []).map(t => ({
      ...t,
      _id: String(t._id),
      selected: false,
      driverId: t.driverId ? String(t.driverId) : ""
    }))
    this.schedule = data.schedule || {}

    this.autoAssign()
    this.sortTrips()
    this.renderTrips()
    this.initMap()
    this.renderDrivers()
  },

  toggleTrip(i){ this.trips[i].selected = !this.trips[i].selected; this.renderTrips() },
  toggleSelect(){ this.allSelected = !this.allSelected; this.trips.forEach(t=>t.selected=this.allSelected); this.renderTrips() },
  toggleEdit(){ this.editMode = !this.editMode; this.renderTrips() },
  sendSelected(){ console.log("SEND SELECTED", this.trips.filter(t=>t.selected)) },
  sendOne(i){ console.log("SEND ONE", this.trips[i]) },
  redistribute(){ /* نفس وظيفة إعادة التوزيع */ },

  autoAssign(){ /* نفس وظيفة autoAssign */ },
  getDriverCar(id){ /* استرجاع رقم السيارة */ },
  getValidDriversForTrip(trip){ /* تصفية السواقين */ },
  renderTrips(){ /* رندر جدول الرحلات */ },
  renderDrivers(){ /* رندر لوحة السواقين */ },
  initMap(){ /* تهيئة الخريطة */ }
}

window.Engine = Engine