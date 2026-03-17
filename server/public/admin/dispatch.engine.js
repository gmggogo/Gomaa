const Engine = {

trips:[],
drivers:[],
schedule:{},
liveDrivers:[],

async load(){

this.trips = await Store.getTrips() || []
this.drivers = await Store.getDrivers() || []
this.schedule = await Store.getSchedule() || {}
this.liveDrivers = await Store.getLiveDrivers() || []

UI.renderTrips(this.trips)
UI.renderDriversPanel(this.drivers,this.schedule)

},

getDriverNameById(id){
const d = this.drivers.find(x=>String(x._id)===String(id))
return d?.name || "-"
},

getDriverVehicleById(id){
const d = this.drivers.find(x=>String(x._id)===String(id))
return d?.vehicleNumber || "-"
},

getDriversForTrip(){
return this.drivers
},

autoAssign(){
alert("Auto assign ready")
},

toggleManual(){},

save(){}

}