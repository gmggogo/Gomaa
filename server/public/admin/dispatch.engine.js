const Engine={

trips:[],
drivers:[],

async load(){

this.trips=await Store.getTrips()
this.drivers=await Store.getDrivers()

UI.renderTrips(this.trips)

},

getSelected(){

return [...document.querySelectorAll(".tripSelect:checked")]
.map(c=>c.value)

},

async sendSelected(){

const ids=this.getSelected()

for(const id of ids){

await Store.sendTrip(id)

}

alert("Trips Sent")

this.load()

},

async sendSingle(id){

await Store.sendTrip(id)

alert("Trip Sent")

this.load()

},

async saveDrivers(){

const edits=document.querySelectorAll(".driverEdit")

for(const sel of edits){

const row=sel.closest("tr")

const tripId=row.dataset.id

await Store.assignDriver(tripId,sel.value)

}

alert("Drivers Updated")

this.load()

}

}