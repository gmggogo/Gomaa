const UI = {

  renderTrips(trips){

    const tbody = document.getElementById("dispatchBody")
    if(!tbody) return

    tbody.innerHTML=""

    if(!trips.length){
      tbody.innerHTML=`<tr><td colspan="12">No Trips</td></tr>`
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
          <td>${t.tripNumber||""}</td>
          <td>${t.clientName||""}</td>
          <td>${t.pickup||""}</td>
          <td>${t.dropoff||""}</td>
          <td>${t.tripDate||""}</td>
          <td>${t.tripTime||""}</td>
          <td>${Engine.getDriverName(t.driverId)}</td>
          <td>${Engine.getVehicle(t.driverId)}</td>
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

  renderDriversPanel(drivers,schedule){

    const el = document.getElementById("driversPanel")
    if(!el) return

    const today = new Date()

    const active = drivers.filter(d=>Engine.isDriverWorking(d._id,today))

    if(!active.length){
      el.innerHTML="No active drivers today"
      return
    }

    el.innerHTML = active.map(d=>`
      <div>
        ${d.name} - ${d.vehicleNumber||"-"}
      </div>
    `).join("")

  }

}