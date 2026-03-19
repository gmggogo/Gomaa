let trips = []
let drivers = []
let schedule = {}
let editMode = false
let allSelected = false

async function init(){

  const data = await Store.load()

  drivers = (data.drivers||[]).map(d=>({
    ...d,
    _id:String(d._id)
  }))

  trips = (data.trips||[]).map(t=>({
    ...t,
    _id:String(t._id),
    selected:false
  }))

  schedule = data.schedule || {}

  autoAssign()

  renderTrips()
  renderDrivers()
  initMap()
}

function autoAssign(){

  trips.forEach(t=>{

    if(t.driverId) return

    if(!drivers.length) return

    const d = drivers[0]

    t.driverId = d._id
    t.vehicle = d.vehicleNumber || ""
  })
}

function toggleTrip(i){
  trips[i].selected = !trips[i].selected
  renderTrips()
}

function toggleSelect(){
  allSelected = !allSelected
  trips.forEach(t=>t.selected = allSelected)
  renderTrips()
}

function toggleEdit(){
  editMode = !editMode
  renderTrips()
}

function assignDriver(i,id){

  const d = drivers.find(x=>x._id===id)

  trips[i].driverId = id
  trips[i].vehicle = d?.vehicleNumber || ""

  renderTrips()
  renderDrivers()
}

function sendSelected(){
  console.log(trips.filter(t=>t.selected))
}

function sendOne(i){
  console.log(trips[i])
}

function redistribute(){
  autoAssign()
  renderTrips()
}

function focusDriver(id){
  console.log("map focus", id)
}

window.toggleTrip = toggleTrip
window.toggleSelect = toggleSelect
window.toggleEdit = toggleEdit
window.assignDriver = assignDriver
window.sendSelected = sendSelected
window.sendOne = sendOne
window.redistribute = redistribute
window.focusDriver = focusDriver

init()