const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

const UI = {

  renderTrips(trips){

    if(!tbody){
      console.error("dispatchBody not found")
      return
    }

    tbody.innerHTML = ""

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
          <input type="checkbox"
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
          <input class="noteEdit"
            value="${(t.notes || "").replace(/"/g,"&quot;")}">
        </td>

        <td class="driverCell">

          <span class="driverName">${t.driverName || "-"}</span>

          <select class="driverEdit">
            <option value="">-- Select Driver --</option>

            ${(Engine.drivers || []).map(d=>`
              <option value="${d._id}"
                ${String(t.driverId)===String(d._id) ? "selected":""}>
                ${d.name}
              </option>
            `).join("")}

          </select>

        </td>

        <td class="carCell">
          ${Engine.getDriverVehicleById(t.driverId) || t.vehicle || "-"}
        </td>

        <td>
          <button class="btn-send" disabled
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

    const today = Engine.getTodayKey()

    const liveMap = new Map()
    liveDrivers.forEach(d=>{
      liveMap.set(String(d.driverId || ""), d)
    })

    const activeDrivers = drivers.filter(d=>{
      const s = schedule[d._id]
      if(!s) return false
      if(!s.enabled) return false
      if(!s.days) return false
      return s.days[today] === true
    })

    if(!activeDrivers.length){
      driversPanel.innerHTML = `No active drivers today`
      return
    }

    driversPanel.innerHTML = activeDrivers.map(d=>{

      const s = schedule[d._id] || {}
      const live = liveMap.get(String(d._id))

      const tripsCount = Engine.trips
        .filter(t=>String(t.driverId)===String(d._id)).length

      return `
        <div class="driver-card">
          <strong>${d.name || "-"}</strong>
          <div>
            Car: ${d.vehicleNumber || "-"}<br>
            Address: ${s.address || d.address || "-"}<br>
            Trips: ${tripsCount}<br>

            <span style="color:${live ? "#16a34a":"#999"}">
              ${live ? "LIVE":"SCHEDULE"}
            </span>

          </div>
        </div>
      `
    }).join("")
  },

  getSelected(){
    return [...document.querySelectorAll(".tripSelect:checked")]
      .map(e=>e.value)
  }

}