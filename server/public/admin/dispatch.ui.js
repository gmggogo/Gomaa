const UI = {

renderTrips(trips, drivers, editMode){

const body = document.getElementById("tbody")
body.innerHTML = ""

trips.forEach((t,i)=>{

body.innerHTML += `
<tr>

<td>
<input type="checkbox"
${t.selected?"checked":""}
onchange="Engine.toggleSelect(${i},this.checked)">
</td>

<td>${i+1}</td>

<td>${t.clientName||""}</td>
<td>${t.pickup||""}</td>
<td>${(t.stops||[]).join(" , ")}</td>
<td>${t.dropoff||""}</td>
<td>${t.tripDate||""}</td>
<td>${t.tripTime||""}</td>

<td>
<select ${editMode?"":"disabled"}
onchange="Engine.trips[${i}].driverId=this.value">

<option value="">--</option>

${drivers.map(d=>`
<option value="${d._id}"
${t.driverId==d._id?"selected":""}>
${d.name}
</option>
`).join("")}

</select>
</td>

<td>${t.vehicle||"-"}</td>

<td>
<input value="${t.notes||""}"
${editMode?"":"disabled"}
oninput="Engine.trips[${i}].notes=this.value">
</td>

<td>
<button class="btn green"
onclick="Engine.trips[${i}].selected=true;Engine.sendSelected()">
Send
</button>
</td>

</tr>
`

})

}

}