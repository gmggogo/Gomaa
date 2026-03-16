const tbody = document.getElementById("dispatchBody")

const UI = {

renderTrips(trips){

tbody.innerHTML=""

if(!trips.length){

tbody.innerHTML=`
<tr>
<td colspan="12">No Trips</td>
</tr>
`

return
}

trips.forEach(t=>{

const tr=document.createElement("tr")

tr.dataset.id=t._id

tr.innerHTML=`

<td>
<input
type="checkbox"
class="tripSelect"
value="${t._id}">
</td>

<td>${t.tripNumber || ""}</td>

<td>${t.clientName || ""}</td>

<td>${t.pickup || ""}</td>

<td>${(t.stops || []).join(" | ")}</td>

<td>${t.dropoff || ""}</td>

<td>${t.tripDate || ""}</td>

<td>${t.tripTime || ""}</td>

<td>

<select class="driverEdit">

<option value="">--</option>

${Engine.drivers.map(d=>{

const selected = t.driverId===d._id ? "selected" : ""

return `<option value="${d._id}" ${selected}>
${d.name}
</option>`

}).join("")}

</select>

</td>

<td>${t.vehicle || ""}</td>

<td>

<button
class="btn btn-send"
onclick="Engine.sendSingle('${t._id}')">

Send

</button>

</td>

`

tbody.appendChild(tr)

})

}

}