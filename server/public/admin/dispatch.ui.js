const UI = {

/* ================= MAIN ================= */
render(){
  this.renderDrivers()
  this.renderTrips()
},

/* ================= DRIVERS ================= */
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

/* ================= TRIPS TABLE ================= */
renderTrips(){

  const tbody = document.getElementById("tbody")
  tbody.innerHTML = ""

  if(!Engine.trips.length){
    tbody.innerHTML = `<tr><td colspan="11">No Trips</td></tr>`
    return
  }

  Engine.trips.forEach((t,i)=>{

    const selected = Engine.selected[t._id]

    const tr = document.createElement("tr")

    tr.innerHTML = `

<td>
<input type="checkbox"
${selected?'checked':''}
onclick="Engine.toggleSelect('${t._id}')">
</td>

<td>${t.tripNumber || "-"}</td>

<td>${t.clientName || "-"}</td>

<td>${t.pickup || "-"}</td>

<td>${(t.stops||[]).join(" , ")}</td>

<td>${t.dropoff || "-"}</td>

<td>${t.tripDate || "-"}</td>

<td>${t.tripTime || "-"}</td>

<td>

<select
${!Engine.editMode?'disabled':''}
onchange="Engine.assignManual('${t._id}',this.value)">

<option value="">Select</option>

${
Engine.getAvailableDrivers(t).map(d=>`
<option value="${d._id}" ${t.driverId===d._id?'selected':''}>
${d.name}
</option>
`).join("")
}

</select>

</td>

<td id="car-${t._id}">${t.vehicle || "-"}</td>

<td>

<button onclick="Engine.sendOne('${t._id}')">Send</button>

<button onclick="Engine.disable('${t._id}')">Disable</button>

</td>

`

    tbody.appendChild(tr)

  })

}

}