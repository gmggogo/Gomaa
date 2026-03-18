const Engine = {

trips: [],
drivers: [],
editMode: false,

/* ================= LOAD ================= */

async load(){

this.trips = await Store.getTrips()
this.drivers = await Store.getDrivers()

// 🔥 أهم فلترة
this.trips = this.trips.filter(t => t.dispatchSelected === true)

UI.renderTrips(this.trips, this.drivers, this.editMode)

},

/* ================= SELECT ================= */

toggleSelect(i,val){
this.trips[i].selected = val
},

selectAll(){
this.trips.forEach(t=>t.selected=true)
UI.renderTrips(this.trips, this.drivers, this.editMode)
},

getSelected(){
return this.trips.filter(t=>t.selected)
},

/* ================= EDIT ================= */

toggleEdit(){

this.editMode = !this.editMode

UI.renderTrips(this.trips, this.drivers, this.editMode)

},

/* ================= REDISTRIBUTE ================= */

redistribute(){

const selected = this.getSelected()

if(selected.length === 0){
alert("No trips selected")
return
}

if(this.drivers.length === 0){
alert("No drivers")
return
}

// توزيع بسيط (Round Robin)
let i = 0

selected.forEach(trip=>{

trip.driverId = this.drivers[i]._id

i++
if(i >= this.drivers.length){
i = 0
}

})

UI.renderTrips(this.trips, this.drivers, this.editMode)

alert("Distributed ✅")

},

/* ================= SEND ================= */

async sendSelected(){

const selected = this.getSelected()

if(selected.length === 0){
alert("No trips selected")
return
}

for(const trip of selected){

await Store.updateTrip(trip._id,{
driverId: trip.driverId,
status:"assigned"
})

}

alert("Trips Sent ✅")

}

}