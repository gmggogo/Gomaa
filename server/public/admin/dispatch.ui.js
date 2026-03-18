const UI = {

render(){
  this.renderTrips()
  this.renderDrivers()
},

renderTrips(){

  const body = document.getElementById("tbody")
  if(!body) return

  body.innerHTML = Engine.trips.map((t,i)=>{

    const selected = Engine.selected[t._id]

    return `
    <tr>

      <td>
        <input type="checkbox"
        ${selected?'checked':''}
        onchange="Engine.toggleSelect('${t._id}')">
      </td>

      <td>${i+1}</td>

      <td>${t.clientName || ""}</td>
      <td>${t.pickup || ""}</td>
      <td>${(t.stops || []).join(" , ")}</td>
      <td>${t.dropoff || ""}</td>
      <td>${t.tripDate || ""}</td>
      <td>${t.tripTime || ""}</td>

      <!-- DRIVER -->
      <td>
        <select
        ${!Engine.editMode?'disabled':''}
        onchange="Engine.assignManual('${t._id}',this.value)">

        <option value="">Driver</option>

        ${
          Engine.getAvailableDrivers(t).map(d=>
            `<option value="${d._id}" ${t.driverId===d._id?'selected':''}>
              ${d.name}
            </option>`
          ).join("")
        }

        </select>
      </td>

      <!-- CAR -->
      <td>${t.vehicle || ""}</td>

      <!-- NOTES -->
      <td>
        <input value="${t.notes || ""}"
        ${!Engine.editMode?'disabled':''}
        oninput="Engine.updateNote('${t._id}',this.value)">
      </td>

      <td>
        <button class="btn green"
        onclick="Engine.sendOne('${t._id}')">
        Send
        </button>
      </td>

    </tr>
    `

  }).join("")

},

renderDrivers(){

  const panel = document.getElementById("driversPanel")
  if(!panel) return

  panel.innerHTML = Engine.drivers.map((d,i)=>{

    const s = Engine.schedule[d._id] || {}

    if(!s.enabled) return ""

    return `
    <div class="driver">
      <span>${i+1} - ${d.name}</span>
      <span>🚗 ${s.vehicleNumber || ""}</span>
    </div>
    `

  }).join("")

}

}