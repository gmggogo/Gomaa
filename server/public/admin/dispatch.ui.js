const UI = {

/* ================= INIT ================= */

init(){
  this.bindButtons()
},

/* ================= BUTTONS ================= */

bindButtons(){

  document.getElementById("selectBtn").onclick = () => Engine.toggleSelect()
  document.getElementById("editBtn").onclick = () => Engine.toggleEdit()
  document.getElementById("sendBtn").onclick = () => Engine.sendSelected()
  document.getElementById("redistributeBtn").onclick = () => Engine.redistribute()

  document.getElementById("tabTrips").onclick = () => {
    document.getElementById("tripsPage").classList.add("active")
    document.getElementById("driversPage").classList.remove("active")
    document.getElementById("tabTrips").classList.add("active")
    document.getElementById("tabDrivers").classList.remove("active")
  }

  document.getElementById("tabDrivers").onclick = () => {
    document.getElementById("tripsPage").classList.remove("active")
    document.getElementById("driversPage").classList.add("active")
    document.getElementById("tabTrips").classList.remove("active")
    document.getElementById("tabDrivers").classList.add("active")

    setTimeout(()=>{
      try{ Engine.map.invalidateSize() }catch(e){}
    },300)
  }

},

/* ================= RENDER ================= */

render(){
  this.renderTrips()
  this.renderDrivers()
},

/* ================= TRIPS ================= */

renderTrips(){

  const body = document.getElementById("tbody")
  body.innerHTML = ""

  if(!Engine.trips.length){
    body.innerHTML = `<tr><td colspan="12">No Trips</td></tr>`
    return
  }

  Engine.trips.forEach((t,i)=>{

    const stops = this.getStops(t)

    body.innerHTML += `
      <tr>

        <td>
          <button class="btn ${t.selected ? 'green':'blue'} select-btn"
          onclick="Engine.toggleTrip(${i})">
          ${t.selected ? '✔':'Select'}
          </button>
        </td>

        <td>${t.tripNumber || i+1}</td>
        <td>${t.clientName || "-"}</td>
        <td>${t.pickup || "-"}</td>

        <td class="stop-list">
          ${stops.length ? stops.join("<br>") : "-"}
        </td>

        <td>${t.dropoff || "-"}</td>
        <td>${t.tripDate || "-"}</td>
        <td>${t.tripTime || "-"}</td>

        <td>
          <select ${(Engine.editMode && t.selected)? "" : "disabled"}
          onchange="Engine.assignDriver(${i},this.value)">

            <option value="">--</option>

            ${
              Engine.getValidDriversForTrip(t).map(d=>`
                <option value="${d._id}" ${t.driverId===d._id?'selected':''}>
                  ${d.name}
                </option>
              `).join("")
            }

          </select>
        </td>

        <td>${t.vehicle || Engine.getDriverCar(t.driverId) || ""}</td>

        <td class="notes-cell">${t.notes || ""}</td>

        <td>
          <button class="btn green send-btn"
          onclick="Engine.sendOne(${i})">
          Send
          </button>
        </td>

      </tr>
    `
  })

},

/* ================= DRIVERS ================= */

renderDrivers(){

  const panel = document.getElementById("driversPanel")
  panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`

  Engine.drivers.forEach((d,i)=>{

    const car = Engine.getDriverCar(d._id)
    const tripsCount = Engine.getDriverTripsCount(d._id)
    const status = tripsCount > 0 ? "Busy":"Available"

    panel.innerHTML += `
      <div class="driver" onclick="Engine.focusDriver('${d._id}')">

        <div class="driver-bar">

          <div class="driver-name">
            ${i+1} - ${d.name}
          </div>

          <div class="driver-right">

            <div class="driver-info">
              <span>🚗 ${car || "-"}</span>
            </div>

            <div class="driver-meta">
              <span class="badge ${status==='Busy'?'badge-busy':'badge-available'}">
                ${status}
              </span>

              <span class="badge badge-count">
                ${tripsCount} Trips
              </span>

              <span class="badge badge-trip">
                ETA Map
              </span>

            </div>

          </div>

        </div>

      </div>
    `
  })

},

/* ================= HELPERS ================= */

getStops(t){

  if(Array.isArray(t.stops)) return t.stops
  if(Array.isArray(t.stopAddresses)) return t.stopAddresses
  if(Array.isArray(t.extraStops)) return t.extraStops
  return []

}

}

window.UI = UI