const tbody = document.getElementById("dispatchBody")

const UI = {

renderTrips(trips){

tbody.innerHTML=""

if(!trips.length){

tbody.innerHTML = `
<tr>
<td colspan="11">No Trips</td>
</tr>
`

return
}

trips.forEach(t=>{

const tr = document.createElement("tr")

tr.dataset.id = t._id

tr.innerHTML = `

<td>
<input type="checkbox"
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

<td class="driverCell">${t.driverName || ""}</td>

<td class="carCell">${t.vehicle || ""}</td>

<td>
<button onclick="Engine.sendSingle('${t._id}')">
Send
</button>
</td>

`

tbody.appendChild(tr)

})

}

}