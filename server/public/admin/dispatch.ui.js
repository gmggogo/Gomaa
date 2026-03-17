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

    const drivers = Engine.drivers || []

    trips.forEach(t=>{

      const tr = document.createElement("tr")
      tr.dataset.id = t._id || ""

      let driverOptions = `<option value="">-- Select Driver --</option>`

      if(drivers.length){
        driverOptions += drivers.map(d=>`
          <option
            value="${d._id}"
            ${String(t.driverId)===String(d._id) ? "selected":""}>
            ${d.name}
          </option>
        `).join("")
      }

      let vehicle = "-"
      if(Engine.getDriverVehicleById){
        try{
          vehicle = Engine.getDriverVehicleById(t.driverId) || t.vehicle || "-"
        }catch{
          vehicle = t.vehicle || "-"
        }
      }else{
        vehicle = t.vehicle || "-"
      }

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
            ${driverOptions}
          </select>
        </td>

        <td class="carCell">${vehicle}</td>

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

    const today = Engine.getToday ? Engine.getToday() : ""

    const liveMap = new Map()
    ;(liveDrivers || []).forEach(d=>{
      liveMap.set(String(d.driverId || ""), d)
    })

    const activeDrivers = (drivers || []).filter(d=>{
      const s = (schedule || {})[d._id]
      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false
      return !!s.days[today]
    })

    if(!activeDrivers.length){
      driversPanel.innerHTML = `No active drivers today`
      return
    }

    driversPanel.innerHTML = activeDrivers.map(d=>{

      const s = (schedule || {})[d._id] || {}
      const live = liveMap.get(String(d._id))
      const tripsCount = (Engine.trips || []).filter(t=>String(t.driverId)===String(d._id)).length

      return `
        <div class="driver-card">
          <strong>${d.name || "-"}</strong>
          <div class="driver-meta">
            Car: ${d.vehicleNumber || "-"}<br>
            Address: ${s.address || d.address || "-"}<br>
            Trips: ${tripsCount}<br>
            <span class="${live ? "status-live":"status-schedule"}">
              ${live ? "LIVE":"SCHEDULE"}
            </span>
          </div>
        </div>
      `
    }).join("")
  }

}