const Engine = {

trips: [],
drivers: [],
schedule: {},

editMode: false,

/* ===============================
INIT
================================ */

async init(){

  try{

    const data = await Store.load()

    this.trips = (data.trips || []).map(t=>({
      ...t,
      selected:false
    }))

    this.drivers = data.drivers || []
    this.schedule = data.schedule || {}

    this.sortTrips()

    this.syncToUI()

  }catch(err){

    console.error("Engine Init Error:", err)

  }

},

/* ===============================
SYNC TO UI
================================ */

syncToUI(){

  // 🔥 أهم ربط بين Engine و HTML
  window.trips = this.trips
  window.drivers = this.drivers

  renderTrips()

},

/* ===============================
SORT
================================ */

sortTrips(){

  this.trips.sort((a,b)=>{
    return new Date(`${a.tripDate} ${a.tripTime}`) -
           new Date(`${b.tripDate} ${b.tripTime}`)
  })

},

/* ===============================
CHANGE DRIVER
================================ */

changeDriver(index, driverId){

  const driver = this.drivers.find(d=>d._id == driverId)
  if(!driver) return

  this.trips[index].driverId = driver._id
  this.trips[index].driverName = driver.name

  // 🔥 العربية تتغير فورًا
  this.trips[index].vehicle =
    driver.vehicleNumber ||
    driver.vehicle ||
    driver.car ||
    ""

  this.syncToUI()

},

/* ===============================
SELECT
================================ */

selectAll(){

  this.trips.forEach(t=>t.selected = true)
  this.syncToUI()

},

/* ===============================
SEND
================================ */

async sendSelected(){

  const ids = this.trips
    .filter(t=>t.selected)
    .map(t=>t._id)

  if(!ids.length){
    alert("No trips selected")
    return
  }

  await Store.sendTrips(ids)

  alert("Trips sent")

},

/* ===============================
REDISTRIBUTE
================================ */

redistributeSelected(){

  const selected = this.trips.filter(t=>t.selected)

  selected.forEach((t,i)=>{

    const driver = this.drivers[i % this.drivers.length]

    if(driver){
      t.driverId = driver._id
      t.driverName = driver.name

      t.vehicle =
        driver.vehicleNumber ||
        driver.vehicle ||
        driver.car ||
        ""
    }

  })

  this.syncToUI()

}

}