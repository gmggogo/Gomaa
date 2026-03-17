const UI = {

  renderTrips(trips){

    const tbody = document.getElementById("dispatchBody")
    if(!tbody) return

    tbody.innerHTML = ""

    trips.forEach(t=>{

      const driverName = Engine.getDriverNameById(t.driverId)
      const vehicle = Engine.getDriverVehicleById(t.driverId)

      const drivers = Engine.getDriversForTrip(t)

      const options = drivers.map(d=>`
        <option value="${d._id}">
          ${d.name}
        </option>
      `).join("")

      const tr = document.createElement("tr")

      tr.innerHTML = `
        <td>${t.tripNumber || ""}</td>
        <td>${t.clientName || ""}</td>
        <td>${t.pickup || ""}</td>
        <td>${t.stops || ""}</td>
        <td>${t.dropoff || ""}</td>
        <td>${t.tripDate || ""}</td>
        <td>${t.tripTime || ""}</td>
        <td>${t.notes || ""}</td>

        <td>${driverName}</td>
        <td>${vehicle}</td>

        <td>
          <select onchange="Store.assignDriver('${t._id}',this.value)">
            <option value="">Assign</option>
            ${options}
          </select>
        </td>
      `

      tbody.appendChild(tr)

    })

  },

  renderDriversPanel(drivers,schedule){

    const el = document.getElementById("driversPanel")
    if(!el) return

    el.innerHTML = drivers.map(d=>`

      <div class="driver-card">
        <strong>${d.name || "-"}</strong><br>
        Car: ${d.vehicleNumber || "-"}<br>
        Address: ${(schedule[d._id]?.address) || d.address || "-"}
      </div>

    `).join("")

  }

}