const UI = {

renderTrips(trips){

const tbody = document.getElementById("dispatchBody")
tbody.innerHTML = ""

trips.forEach(t=>{

const driverName = Engine.getDriverNameById(t.driverId)
const vehicle = Engine.getDriverVehicleById(t.driverId)

const tr = document.createElement("tr")

tr.innerHTML = `
<td><input type="checkbox"></td>

<td>${t.tripNumber || ""}</td>
<td>${t.clientName || ""}</td>
<td>${t.pickup || ""}</td>
<td>${Array.isArray(t.stops)?t.stops.join(" | "):""}</td>
<td>${t.dropoff || ""}</td>
<td>${t.tripDate || ""}</td>
<td>${t.tripTime || ""}</td>
<td>${t.notes || ""}</td>

<td>${driverName}</td>
<td>${vehicle}</td>

<td>
<select onchange="Store.assignDriver('${t._id}',this.value)">
<option>Assign</option>
${
Engine.getDriversForTrip(t).map(d=>`
<option value="${d._id}">${d.name}</option>
`).join("")
}
</select>
</td>
`

tbody.appendChild(tr)

})

},

renderDriversPanel(drivers,schedule){

const el = document.getElementById("driversPanel")

el.innerHTML = drivers.map(d=>`
<div style="margin-bottom:8px;">
<b>${d.name}</b><br>
Car: ${d.vehicleNumber || "-"}<br>
Address: ${(schedule[d._id]?.address)||d.address||"-"}
</div>
`).join("")

}

}