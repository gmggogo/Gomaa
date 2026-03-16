const body = document.getElementById("dispatchBody")

const UI = {

renderTrips(trips){

body.innerHTML=""

if(!trips.length){

body.innerHTML=`
<tr>
<td colspan="12" style="padding:40px;text-align:center">
No Trips Found
</td>
</tr>
`

return

}

trips.forEach(trip=>{

const tr=document.createElement("tr")

tr.innerHTML=`

<td>

<input
type="checkbox"
class="tripSelect"
value="${trip._id}">

</td>

<td>${trip.tripNumber || ""}</td>

<td>${trip.clientName || ""}</td>

<td>${trip.pickup || ""}</td>

<td>${(trip.stops || []).join(" | ")}</td>

<td>${trip.dropoff || ""}</td>

<td>${trip.tripDate || ""}</td>

<td>${trip.tripTime || ""}</td>

<td>${trip.driverName || ""}</td>

<td>${trip.vehicle || ""}</td>

<td>

<input
style="width:120px"
value="${trip.notes || ""}">

</td>

<td>

<button
class="btn-send"
onclick="Engine.distributeSelected()">

Send

</button>

</td>

`

body.appendChild(tr)

})

}

}