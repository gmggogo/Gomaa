const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

let editMode = false

const UI = {

  /* ================= TOGGLE EDIT ================= */
  toggleEdit(){
    editMode = !editMode
    this.applyEditMode()
  },

  /* ================= RENDER TRIPS ================= */
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

      // 🔥 مهم: ناخد من التريب نفسه
      const driverName = t.driverName || "-"
      const vehicle = t.vehicle || "-"

      const availableDrivers = Engine.drivers || []

      tr.innerHTML = `

        <td>
          <input type="checkbox"
            class="tripSelect"
            onchange="UI.onSelect(this)"
            value="${t._id}">
        </td>

        <td>${t.tripNumber || ""}</td>
        <td>${t.clientName || ""}</td>
        <td>${t.pickup || ""}</td>
        <td>${Array.isArray(t.stops) ? t.stops.join(" | ") : ""}</td>
        <td>${t.dropoff || ""}</td>
        <td>${t.tripDate || ""}</td>
        <td>${t.tripTime || ""}</td>

        <td>${t.notes || "-"}</td>

        <!-- DRIVER -->
        <td>

          <span class="driverName">${driverName}</span>

          <select class="driverSelect"
            style="display:none"
            onchange="UI.changeDriver('${t._id}', this)">

            <option value="">-- Select --</option>

            ${availableDrivers.map(d=>`
              <option value="${d._id}">
                ${d.name}
              </option>
            `).join("")}

          </select>

        </td>

        <!-- VEHICLE -->
        <td class="carCell">${vehicle}</td>

        <td>
          <button onclick="Engine.sendSingle('${t._id}', this)">
            Send
          </button>
        </td>

      `

      tbody.appendChild(tr)
    })

    this.applyEditMode()
  },

  /* ================= SELECT ================= */
  onSelect(el){

    const row = el.closest("tr")

    if(el.checked){
      row.classList.add("row-selected")
    }else{
      row.classList.remove("row-selected")
    }

    this.applyEditMode()
  },

  /* ================= APPLY EDIT ================= */
  applyEditMode(){

    const rows = document.querySelectorAll("#dispatchBody tr")

    rows.forEach(row=>{

      const check = row.querySelector(".tripSelect")
      const name = row.querySelector(".driverName")
      const select = row.querySelector(".driverSelect")

      if(!check || !name || !select) return

      if(editMode && check.checked){

        name.style.display = "none"
        select.style.display = "block"

      }else{

        name.style.display = "block"
        select.style.display = "none"

      }

    })
  },

  /* ================= CHANGE DRIVER ================= */
  async changeDriver(tripId, select){

    const driverId = select.value

    if(!driverId) return

    // 🔥 نجيب الدريفر من اللي موجودين
    const driver = Engine.drivers.find(d=>String(d._id)===String(driverId))

    if(!driver) return

    // 🔥 نغير UI فورًا
    const row = select.closest("tr")

    row.querySelector(".driverName").innerText = driver.name
    row.querySelector(".carCell").innerText = driver.vehicleNumber || "-"

    // 🔥 نبعته للسيرفر
    await Store.assignDriver(tripId, driverId)

  },

  /* ================= DRIVERS PANEL ================= */
  renderDriversPanel(drivers, schedule){

    if(!driversPanel) return

    driversPanel.innerHTML = drivers.map(d=>{

      return `
        <div style="
          display:flex;
          justify-content:space-between;
          padding:6px;
          border-bottom:1px solid #eee;
        ">
          <strong>${d.name}</strong>
          <span>🚗 ${d.vehicleNumber || "-"}</span>
        </div>
      `

    }).join("")
  },

  /* ================= GET SELECTED ================= */
  getSelected(){
    return [...document.querySelectorAll(".tripSelect:checked")]
      .map(e=>e.value)
  }

}