const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

// 🔥 حالة التعديل
let editMode = false

const UI = {

  /* =======================
  TOGGLE EDIT
  ======================= */
  toggleEdit(){
    editMode = !editMode
    this.applyEditMode()
  },

  /* =======================
  RENDER TRIPS
  ======================= */
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

      const driverName = Engine.getDriverNameById(t.driverId)
      const vehicle = Engine.getDriverVehicleById(t.driverId)

      const availableDrivers = Engine.getDriversForTrip(t)

      tr.innerHTML = `

        <td>
          <input type="checkbox"
            class="tripSelect dispatch-check"
            onchange="UI.onSelectRow(this)"
            value="${t._id}">
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
        </td>

        <!-- 🔥 DRIVER -->
        <td class="driverCell">

          <span class="driverName">${driverName}</span>

          <select class="driverEdit"
            style="display:none"
            onchange="Engine.assignDriver('${t._id}', this.value)">

            <option value="">-- Select Driver --</option>

            ${availableDrivers.map(d=>`
              <option value="${d._id}"
                ${String(t.driverId)===String(d._id) ? "selected":""}>
                ${d.name}
              </option>
            `).join("")}

          </select>

        </td>

        <!-- 🔥 VEHICLE -->
        <td class="carCell">
          ${vehicle}
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

    Engine.bind()

    this.applyEditMode()
  },

  /* =======================
  APPLY EDIT MODE
  ======================= */
  applyEditMode(){

    const rows = document.querySelectorAll("#dispatchBody tr")

    rows.forEach(row=>{

      const check = row.querySelector(".tripSelect")
      const select = row.querySelector(".driverEdit")
      const name = row.querySelector(".driverName")

      if(!check || !select || !name) return

      if(editMode && check.checked){

        select.style.display = "block"
        name.style.display = "none"

      }else{

        select.style.display = "none"
        name.style.display = "block"

      }

    })
  },

  /* =======================
  CHECKBOX SELECT
  ======================= */
  onSelectRow(el){

    const row = el.closest("tr")

    if(el.checked){
      row.classList.add("row-selected")
    }else{
      row.classList.remove("row-selected")
    }

    this.applyEditMode()
  },

  /* =======================
  DRIVERS PANEL
  ======================= */
  renderDriversPanel(drivers, schedule, liveDrivers){

    if(!driversPanel) return

    const today = Engine.getTodayKey()

    const activeDrivers = drivers.filter(d=>{
      const s = schedule[d._id]
      return s && s.enabled && s.days && s.days[today]
    })

    if(!activeDrivers.length){
      driversPanel.innerHTML = "No active drivers"
      return
    }

    driversPanel.innerHTML = activeDrivers.map(d=>{

      return `
        <div class="driver-card" style="
          display:flex;
          justify-content:space-between;
          padding:8px;
          border-bottom:1px solid #eee;
        ">

          <strong>${d.name || "-"}</strong>

          <span>🚗 ${Engine.getDriverVehicleById(d._id)}</span>

        </div>
      `

    }).join("")
  },

  /* =======================
  GET SELECTED
  ======================= */
  getSelected(){
    return [...document.querySelectorAll(".tripSelect:checked")]
      .map(e=>e.value)
  }

}