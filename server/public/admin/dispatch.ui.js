const UI = {

  render(){
    this.renderTrips()
    this.renderDrivers()
  },

  /* ================= TRIPS ================= */

  renderTrips(){

    const tbody = document.getElementById("tbody")
    if(!tbody) return

    tbody.innerHTML = ""

    if(!Engine.trips.length){
      tbody.innerHTML = `<tr><td colspan="12">No Trips</td></tr>`
      return
    }

    Engine.trips.forEach(t=>{

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

<td>${t.vehicle || "-"}</td>

<td>
<button onclick="Engine.sendOne('${t._id}')">Send</button>
<button onclick="Engine.disable('${t._id}')">Disable</button>
</td>

`

      tbody.appendChild(tr)

    })

  },

  /* ================= DRIVERS ================= */

  renderDrivers(){

    const panel = document.getElementById("driversPanel")
    if(!panel) return

    panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`

    Engine.drivers.forEach(d=>{

      const car = Engine.getDriverVehicle(d._id)
      const count = Engine.countDriverTrips(d._id)

      panel.innerHTML += `
        <div class="driver">
          <div class="driver-name">${d.name}</div>
          <div>🚗 ${car || "-"}</div>
          <div>📦 ${count} Trips</div>
        </div>
      `

    })

  }

}

/* ================= GLOBAL ================= */

window.UI = UI

/* ================= START ================= */

window.addEventListener("DOMContentLoaded", async ()=>{

  console.log("🔥 SYSTEM START")

  await Engine.load()

})