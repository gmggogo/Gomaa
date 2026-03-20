let trips = []
let drivers = []
let schedule = {}

let editMode = false
let allSelected = false

/* INIT */

async function init(){

const tripsRaw = await Store.getTrips()
const driversRaw = await Store.getDrivers()
const scheduleRaw = await Store.getSchedule()

drivers = driversRaw.map(d => ({...d,_id:String(d._id)}))

trips = tripsRaw.map(t => ({
...t,
_id:String(t._id),
selected:false,
driverId:t.driverId || ""
}))

schedule = scheduleRaw || {}

autoAssign()
renderTrips()
renderDrivers()
initMap()

}

/* AUTO ASSIGN */

function autoAssign(){

trips.forEach(t=>{

if(!t.driverId){

drivers.sort((a,b)=>{
const aCount = trips.filter(x=>x.driverId===a._id).length
const bCount = trips.filter(x=>x.driverId===b._id).length
return aCount - bCount
})

const d = drivers[0]

if(d){
t.driverId = d._id
t.vehicle = schedule[d._id]?.carNumber || ""
}

}

})

}

/* RENDER */

function renderTrips(){

const body = document.getElementById("tbody")
body.innerHTML=""

trips.forEach((t,i)=>{

body.innerHTML+=`
<tr>
<td><button class="btn ${t.selected?'green':'blue'}" onclick="toggleTrip(${i})">${t.selected?'✔':'Select'}</button></td>
<td>${t.tripNumber||i+1}</td>
<td>${t.clientName||""}</td>
<td>${t.pickup||""}</td>
<td>${(t.stops||[]).join("<br>")||"-"}</td>
<td>${t.dropoff||""}</td>
<td>${t.tripDate||""}</td>
<td>${t.tripTime||""}</td>

<td>
<select ${(editMode&&t.selected)?"":"disabled"} onchange="assignDriver(${i},this.value)">
<option value="">--</option>
${drivers.map(d=>`
<option value="${d._id}" ${t.driverId===d._id?"selected":""}>${d.name}</option>
`).join("")}
</select>
</td>

<td>${t.vehicle||""}</td>
<td>${t.notes||""}</td>

<td><button class="btn green" onclick="sendOne(${i})">Send</button></td>
</tr>
`

})

}

/* DRIVERS PANEL */

function renderDrivers(){

const panel=document.getElementById("driversPanel")
panel.innerHTML="Drivers Panel"

drivers.forEach(d=>{
panel.innerHTML+=`<div class="driver">${d.name}</div>`
})

}

/* ACTIONS */

function toggleTrip(i){
trips[i].selected=!trips[i].selected
renderTrips()
}

function toggleSelect(){
allSelected=!allSelected
trips.forEach(t=>t.selected=allSelected)
renderTrips()
}

function toggleEdit(){
editMode=!editMode
document.getElementById("editBtn").innerText=editMode?"Save":"Edit Selected"
renderTrips()
}

function assignDriver(i,id){

const d=drivers.find(x=>x._id===id)

trips[i].driverId=id
trips[i].vehicle=schedule[id]?.carNumber || ""

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

trips.forEach(t=>t.driverId="")

autoAssign()
renderTrips()
renderDrivers()

}

/* MAP */

function initMap(){
const map=L.map("map").setView([33.44,-112.07],10)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map)
}

/* GLOBAL */

window.toggleTrip=toggleTrip
window.toggleSelect=toggleSelect
window.toggleEdit=toggleEdit
window.assignDriver=assignDriver
window.sendSelected=sendSelected
window.sendOne=sendOne
window.redistribute=redistribute

init()