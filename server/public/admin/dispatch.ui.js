const UI = {

  renderTrips(trips){

    const tbody = document.getElementById("dispatchBody")
    if(!tbody) return

    tbody.innerHTML = ""

    if(!trips.length){
      tbody.innerHTML = `<tr><td colspan="12">No Trips</td></tr>`
      return
    }

    trips.forEach(t=>{

      const drivers = Engine.getDriversForTrip(t)

      const options = drivers.map(d=>`
        <option value="${d._id}">
          ${d.name}
        </option>
      `).join("")

      tbody.innerHTML += `
        <tr>

          <td>${t.tripNumber || ""}</td>
          <td>${t.clientName || ""}</td>
          <td>${t.pickup || ""}</td>
          <td>${t.dropoff || ""}</td>
          <td>${t.tripDate || ""}</td>
          <td>${t.tripTime || ""}</td>

          <td>${Engine.getDriverNameById(t.driverId)}</td>
          <td>${Engine.getDriverVehicleById(t.driverId)}</td>

          <td>
            <select onchange="Store.assignDriver('${t._id}',this.value)">
              <option>Assign</option>
              ${options}
            </select>
          </td>

        </tr>
      `
    })

  },

  renderDriversPanel(drivers,schedule,liveDrivers){

    const el = document.getElementById("driversPanel")
    if(!el) return

    if(!drivers.length){
      el.innerHTML="No drivers"
      return
    }

    el.innerHTML = drivers.map(d=>`

      <div style="padding:10px;border-bottom:1px solid #eee">

        <strong>${d.name || "-"}</strong><br>

        Car: ${d.vehicleNumber || "-"}<br>

        Address: ${(schedule[d._id]?.address) || d.address || "-"}<br>

      </div>

    `).join("")

  }

}