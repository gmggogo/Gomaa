const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

const UI = {

  renderDriversPanel(drivers,schedule,liveDrivers){

    if(!driversPanel) return

    const today = Engine.getToday()

    const liveMap = new Map()

    liveDrivers.forEach(d=>{
      liveMap.set(String(d.driverId || ""), d)
    })

    const activeDrivers = drivers.filter(d=>{

      const s = schedule[d._id]
      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false

      return !!s.days[today]

    })

    if(!activeDrivers.length){
      driversPanel.innerHTML = `<div>No active drivers today</div>`
      return
    }

    driversPanel.innerHTML = activeDrivers.map(d=>{

      const s = schedule[d._id] || {}
      const live = liveMap.get(String(d._id))
      const tripCount = Engine.trips.filter(t=>String(t.driverId)===String(d._id)).length

      return `
        <div class="driver-chip">
          <div>
            <strong>${d.name || "-"}</strong><br>
            Car: ${d.vehicleNumber || "-"}<br>
            Address: ${s.address || d.address || "-"}<br>
            Trips: ${tripCount}
          </div>

          <div class="driver-status ${live ? "status-active":"status-inactive"}">
            ${live ? "LIVE" : "SCHEDULE"}
          </div>

          <div>
            ${s.enabled ? "ACTIVE":"OFF"}
          </div>
        </div>
      `
    }).join("")

  },

  renderTrips(trips){

    if(!tbody) return

    tbody.innerHTML=""

    if(!trips.length){
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:30px">
            No Trips
          </td>
        </tr>
      `
      return
    }

    trips.forEach(t=>{

      const tr = document.createElement("tr")
      tr.dataset.id = t._id

      tr.innerHTML = `

        <td>
          <input
            type="checkbox"
            class="tripSelect dispatch-check"
            value="${t._id}">
        </td>

        <td>${t.tripNumber || ""}</td>

        <td>${t.clientName || ""}</td>

        <td>${t.pickup || ""}</td>

        <td>${(t.stops || []).join(" | ")}</td>

        <td>${t.dropoff || ""}</td>

        <td>${t.tripDate || ""}</td>

        <td>${t.tripTime || ""}</td>

        <td>
          <span class="noteName">${t.notes || "-"}</span>
          <input
            type="text"
            class="noteEdit"
            value="${(t.notes || "").replace(/"/g,"&quot;")}">
        </td>

        <td class="driverCell">
          <span class="driverName">${t.driverName || "-"}</span>

          <select class="driverEdit">
            <option value="">-- Select Driver --</option>
            ${Engine.drivers.map(d=>`
              <option
                value="${d._id}"
                ${String(t.driverId)===String(d._id) ? "selected":""}>
                ${d.name}
              </option>
            `).join("")}
          </select>
        </td>

        <td class="carCell">${Engine.getDriverVehicle(t.driverId) || t.vehicle || "-"}</td>

        <td>
          <button
            class="btn-send"
            disabled
            onclick="Engine.sendSingle('${t._id}', this)">
            Send
          </button>
        </td>
      `

      tbody.appendChild(tr)
    })

  }

}