const UI = {

render(){
  this.renderDrivers()
  this.renderTrips()
},

/* DRIVERS */
renderDrivers(){

  const box = document.getElementById("driversBox")

  box.innerHTML = Engine.drivers.map(d=>{

    const s = Engine.schedule[d._id] || {}
    if(!s.enabled) return ""

    return `
    <div class="driver-card">
      <strong>${d.name}</strong>
      <div>${s.vehicleNumber || "-"}</div>
    </div>
    `
  }).join("")
},

/* TABLE */
renderTrips(){

  const tbody = document.getElementById("tbody")
  tbody.innerHTML=""

  Engine.trips.forEach(t=>{

    const selected = Engine.selected[t._id]

    const tr = document.createElement("tr")

    tr.innerHTML = `

<td>
<input type="checkbox"
${selected?'checked':''}
onclick="Engine.toggleSelect('${t._id}')">
</td>

<td>${t.tripNumber}</td>
<td>${t.clientName}</td>
<td>${t.pickup}</td>
<td>${(t.stops||[]).join(",")}</td>
<td>${t.dropoff}</td>
<td>${t.tripDate}</td>
<td>${t.tripTime}</td>

<td>
<select
${!(Engine.editMode && Engine.selected[t._id]) ? 'disabled' : ''}
onchange="Engine.assignManual('${t._id}',this.value)">

<option value="">Driver</option>

${
Engine.getAvailableDrivers(t).map(d=>`
<option value="${d._id}" ${t.driverId===d._id?'selected':''}>
${d.name}
</option>
`).join("")
}

</select>
</td>

<td>${t.vehicle || "-"}</td>

<td>
<button onclick="Engine.sendOne('${t._id}')">Send</button>
</td>

`

    tbody.appendChild(tr)

  })

}

}