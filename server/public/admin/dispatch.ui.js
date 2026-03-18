const UI = {

render(){
this.renderDrivers()
this.renderTrips()
},

renderDrivers(){

const box=document.getElementById("driversList")

box.innerHTML = Engine.drivers.map((d,i)=>{

const s=Engine.schedule[d._id]||{}
if(!s.enabled) return ""

return `
<div class="driver-row"
onclick="Engine.focusDriver('${d._id}')">

<span>${i+1}</span>

<strong>${d.name}</strong>

<div>🚗 ${s.vehicleNumber||"-"}</div>

</div>
`

}).join("")

},

renderTrips(){

const box=document.getElementById("tripsContainer")

box.innerHTML=`

<table>

<tr>
<th>Select</th>
<th>#</th>
<th>Client</th>
<th>Pickup</th>
<th>Dropoff</th>
<th>Driver</th>
<th>Car</th>
<th>Notes</th>
</tr>

${
Engine.trips.map(t=>`

<tr>

<td>
<input type="checkbox"
${Engine.selected[t._id]?'checked':''}
onclick="Engine.selected['${t._id}']=!Engine.selected['${t._id}'];UI.render()">
</td>

<td>${t.tripNumber||""}</td>
<td>${t.clientName||""}</td>
<td>${t.pickup||""}</td>
<td>${t.dropoff||""}</td>

<td>
<select
${!Engine.editMode?'disabled':''}
onchange="Engine.assignManual('${t._id}',this.value)">

<option value="">Driver</option>

${
Engine.drivers.map(d=>`
<option value="${d._id}" ${t.driverId===d._id?'selected':''}>
${d.name}
</option>
`).join("")
}

</select>
</td>

<td>${t.vehicle||"-"}</td>

<td>
<input
value="${t.notes||""}"
${!Engine.editMode?'disabled':''}
>
</td>

</tr>

`).join("")
}

</table>
`

}

}