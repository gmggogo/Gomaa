const tbody=document.getElementById("dispatchBody")

const UI={

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

<td>${(t.stops||[]).join(" | ")}</td>

<td>${t.dropoff || ""}</td>

<td>${t.tripDate || ""}</td>

<td>${t.tripTime || ""}</td>

<td class="driverCell">
${t.driverName || ""}
</td>

<td class="carCell">
${t.vehicle || ""}
</td>

<td>

<input
value="${t.notes || ""}"
placeholder="Notes"
onchange="Engine.saveNotes('${t._id}',this.value)"
style="width:120px">

</td>

<td>

<button
class="btn-send"
onclick="Engine.sendSingle('${t._id}')">

Send

</button>

</td>

`

tbody.appendChild(tr)

})

}

}