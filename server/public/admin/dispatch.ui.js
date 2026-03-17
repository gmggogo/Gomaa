const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

const UI = {

  renderTrips(trips){

    if(!tbody) return

    tbody.innerHTML = ""

    if(!trips || !trips.length){
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:30px">
            No Trips
          </td>
        </tr>
      `
      return
    }

    const drivers = Array.isArray(Engine.drivers) ? Engine.drivers : []

    trips.forEach(t=>{

      const tr = document.createElement("tr")
      tr.dataset.id = t._id || ""

      const selectedDriverId = t.driverId || ""

      let driverOptions = `<option value="">-- Select Driver --</option>`

      driverOptions += drivers.map(d=>`
        <option value="${d._id}" ${String(selectedDriverId) === String(d._id) ? "selected" : ""}>
          ${d.name || "-"}
        </option>
      `).join("")

      const carValue =
        (selectedDriverId && Engine.getDriverVehicleById(selectedDriverId)) ||
        t.vehicle ||
        "-"

      tr.innerHTML = `
        <td>
          <input
            type="checkbox"
            class="tripSelect dispatch-check"
            value="${t._id || ""}">
        </td>

        <td>${t.tripNumber || ""}</td>
        <td>${t.clientName || ""}</td>
        <td>${t.pickup || ""}</td>
        <td>${Array.isArray(t.stops) ? t.stops.join(" | ") : ""}</td>
        <td>${t.dropoff || ""}</td>
        <td>${t.tripDate || ""}</td>
        <td>${t.tripTime || ""}</td>

        <td>
          <span class="noteName">${t.notes || "-"}</span>
          <input
            type="text"
            class="noteEdit"
            value="${String(t.notes || "").replace(/"/g, "&quot;")}"
            style="display:none;">
        </td>

        <td class="driverCell">
          <span class="driverName">${t.driverName || "-"}</span>
          <select class="driverEdit" style="display:none;">
            ${driverOptions}
          </select>
        </td>

        <td class="carCell">${carValue}</td>

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

  },

  renderDriversPanel(drivers, schedule, liveDrivers){

    if(!driversPanel) return

    const allDrivers = Array.isArray(drivers) ? drivers : []
    const allLive = Array.isArray(liveDrivers) ? liveDrivers : []
    const allSchedule = schedule || {}

    const activeDrivers = allDrivers.filter(d=>{
      const s = allSchedule[d._id]
      return !!s && s.enabled !== false
    })

    if(!activeDrivers.length){
      driversPanel.innerHTML = `No drivers found`
      return
    }

    const liveMap = new Map()
    allLive.forEach(d=>{
      liveMap.set(String(d.driverId || ""), d)
    })

    driversPanel.innerHTML = activeDrivers.map(d=>{

      const s = allSchedule[d._id] || {}
      const live = liveMap.get(String(d._id))
      const tripsCount = (Engine.trips || []).filter(t=>String(t.driverId) === String(d._id)).length

      return `
        <div class="driver-card">
          <strong>${d.name || "-"}</strong>
          <div class="driver-meta">
            Car: ${d.vehicleNumber || "-"}<br>
            Address: ${s.address || d.address || "-"}<br>
            Trips: ${tripsCount}<br>
            <span class="${live ? "status-live" : "status-schedule"}">
              ${live ? "LIVE" : "READY"}
            </span>
          </div>
        </div>
      `
    }).join("")
  }

}