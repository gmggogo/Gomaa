const tbody = document.getElementById("dispatchBody")
const driversPanel = document.getElementById("driversPanel")

let editMode = false

const UI = {

  toggleEdit(){
    editMode = !editMode
    this.applyEditMode()
  },

  renderTrips(trips){

    if(!tbody) return

    tbody.innerHTML = ""

    if(!trips.length){
      tbody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align:center;padding:30px">
          No Trips
        </td>
      </tr>`
      return
    }

    trips.forEach(t=>{

      const tr = document.createElement("tr")
      tr.dataset.id = t._id

      const driverName = t.driverName || "-"
      const vehicle = t.vehicle || "-"

      tr.innerHTML = `

<td>
<input type="checkbox"
class="tripSelect"
onchange="UI.onSelect(this)"
value="${t._id}">
</td>

<td>${t.tripNumber||""}</td>
<td>${t.clientName||""}</td>
<td>${t.pickup||""}</td>
<td>${Array.isArray(t.stops)?t.stops.join(" | "):""}</td>
<td>${t.dropoff||""}</td>
<td>${t.tripDate||""}</td>
<td>${t.tripTime||""}</td>
<td>${t.notes||"-"}</td>

<td>

<span class="driverName">${driverName}</span>

<select class="driverSelect"
style="display:none"
onchange="UI.changeDriver('${t._id}', this)">

<option value="">-- Select --</option>

${Engine.drivers.map(d=>`
<option value="${d._id}">
${d.name}
</option>
`).join("")}

</select>

</td>

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

  onSelect(el){

    const row = el.closest("tr")

    el.checked
      ? row.classList.add("row-selected")
      : row.classList.remove("row-selected")

    this.applyEditMode()
  },

  applyEditMode(){

    document.querySelectorAll("#dispatchBody tr").forEach(row=>{

      const check = row.querySelector(".tripSelect")
      const name = row.querySelector(".driverName")
      const select = row.querySelector(".driverSelect")

      if(!check) return

      if(editMode && check.checked){
        name.style.display="none"
        select.style.display="block"
      }else{
        name.style.display="block"
        select.style.display="none"
      }

    })
  },

  async changeDriver(tripId, select){

    const driverId = select.value
    if(!driverId) return

    const driver = Engine.drivers.find(d=>String(d._id)===String(driverId))
    if(!driver) return

    // 🔥 هنا الحل
    const s = Engine.schedule[driverId] || {}

    const vehicle = s.vehicleNumber || driver.vehicleNumber || "-"

    const row = select.closest("tr")

    row.querySelector(".driverName").innerText = driver.name
    row.querySelector(".carCell").innerText = vehicle

    await Store.assignDriver(tripId, driverId)

  },

  renderDriversPanel(drivers, schedule){

    if(!driversPanel) return

    driversPanel.innerHTML = drivers.map(d=>{

      const s = schedule[d._id] || {}

      return `
      <div style="
        display:flex;
        justify-content:space-between;
        padding:6px;
        border-bottom:1px solid #eee;
      ">
        <strong>${d.name}</strong>
        <span>🚗 ${s.vehicleNumber || "-"}</span>
      </div>`
    }).join("")
  },

  getSelected(){
    return [...document.querySelectorAll(".tripSelect:checked")]
    .map(e=>e.value)
  }

}