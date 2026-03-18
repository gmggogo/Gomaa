const UI = {

render(){

  this.renderDrivers()
  this.renderTrips()

},

/* ================= DRIVERS ================= */
renderDrivers(){

  const box = document.getElementById("driversBox")
  if(!box) return

  box.innerHTML = ""

  Engine.drivers.forEach(d=>{

    const s = Engine.schedule[d._id]

    if(!s || !s.enabled) return

    box.innerHTML += `
      <div class="driver-card">
        <strong>${d.name}</strong>
        <div>${s.vehicleNumber || ""}</div>
      </div>
    `

  })

},

/* ================= TRIPS ================= */
renderTrips(){

  const box = document.getElementById("tripsBox")
  if(!box) return

  if(!Engine.trips.length){
    box.innerHTML = `<div style="padding:10px">No Trips</div>`
    return
  }

  box.innerHTML = Engine.trips.map(t=>{

    const selected = Engine.selected[t._id]

    return `
    <div class="trip-row">

      <input type="checkbox"
      ${selected?'checked':''}
      onclick="Engine.toggleSelect('${t._id}')">

      <div>${t.tripTime || ""}</div>
      <div>${t.clientName || ""}</div>
      <div>${t.pickup || ""}</div>

      <select
      ${!Engine.editMode?'disabled':''}
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

      <div>${t.vehicle || ""}</div>

      <button onclick="Engine.disable('${t._id}')">Disable</button>

    </div>
    `

  }).join("")

}

}