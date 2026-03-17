const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

let editMode = false

const UI = {

  /* ================= TOGGLE EDIT ================= */
  toggleEdit(){
    editMode = !editMode
    this.renderTrips(Engine.trips)
  },

  /* ================= RENDER TRIPS ================= */
  renderTrips(trips){

    if(!trips || !trips.length){
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="padding:20px">
            No Trips
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = trips.map(t=>{

      const driverName = t.driverName || "-"
      const vehicle = t.vehicle || "-"

      return `
        <tr class="${t.selected?'row-selected':''}">

          <!-- SELECT -->
          <td>
            <input type="checkbox"
              ${t.selected?'checked':''}
              onchange="UI.selectTrip('${t._id}', this.checked)">
          </td>

          <td>${t.tripNumber || "-"}</td>
          <td>${t.clientName || "-"}</td>
          <td>${t.pickup || "-"}</td>
          <td>${t.dropoff || "-"}</td>
          <td>${t.tripDate || "-"}</td>
          <td>${t.tripTime || "-"}</td>

          <!-- DRIVER -->
          <td>

            ${
              editMode && t.selected
              ? `
                <select onchange="UI.changeDriver('${t._id}', this.value)">
                  <option value="">-- Select Driver --</option>

                  ${Engine.drivers.map(d=>`
                    <option value="${d._id}">
                      ${d.name}
                    </option>
                  `).join("")}

                </select>
              `
              : `<strong>${driverName}</strong>`
            }

          </td>

          <!-- VEHICLE -->
          <td>
            <span style="color:#16a34a;font-weight:bold">
              🚗 ${vehicle}
            </span>
          </td>

          <!-- ACTION -->
          <td>

            <button onclick="UI.disable('${t._id}')"
              style="
                background:#dc2626;
                color:#fff;
                border:none;
                padding:4px 10px;
                border-radius:5px;
                cursor:pointer;
              ">
              Disable
            </button>

          </td>

        </tr>
      `

    }).join("")
  },

  /* ================= DRIVERS PANEL ================= */
  renderDriversPanel(drivers){

    driversPanel.innerHTML = drivers.map(d=>{

      const vehicle = Engine.getDriverVehicleById(d._id)

      return `
        <div style="
          display:flex;
          justify-content:space-between;
          padding:6px;
          border-bottom:1px solid #eee;
        ">
          <strong>${d.name}</strong>
          <span style="color:#2563eb">🚗 ${vehicle}</span>
        </div>
      `

    }).join("")
  },

  /* ================= SELECT ================= */
  selectTrip(id, val){

    const t = Engine.trips.find(x=>x._id==id)
    if(!t) return

    t.selected = val

    this.renderTrips(Engine.trips)
  },

  /* ================= CHANGE DRIVER ================= */
  changeDriver(tripId, driverId){
    Engine.assignDriver(tripId, driverId)
  },

  /* ================= DISABLE ================= */
  async disable(tripId){

    await Store.disableTrip(tripId)

    Engine.trips = Engine.trips.filter(t=>t._id !== tripId)

    this.renderTrips(Engine.trips)

  },

  /* ================= GET SELECTED ================= */
  getSelected(){
    return Engine.trips.filter(t=>t.selected).map(t=>t._id)
  }

}