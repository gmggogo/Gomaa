let map = null
let markers = []

function initMap(){
  if(map) return

  map = L.map("map").setView([33.4484, -112.0740], 10)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map)

  setTimeout(()=>map.invalidateSize(),300)
}

function renderTrips(){

  const body = document.getElementById("tbody")
  body.innerHTML = ""

  trips.forEach((t,i)=>{

    const stops = (t.stops||[]).join("<br>")

    body.innerHTML += `
<tr>

<td>
<button onclick="toggleTrip(${i})">
${t.selected ? "✔" : "Select"}
</button>
</td>

<td>${t.tripNumber||i+1}</td>
<td>${t.clientName||""}</td>
<td>${t.pickup||""}</td>
<td>${stops||"-"}</td>
<td>${t.dropoff||""}</td>
<td>${t.tripDate||""}</td>
<td>${t.tripTime||""}</td>

<td>
<select ${(editMode && t.selected)?"":"disabled"}
onchange="assignDriver(${i},this.value)">

<option value="">--</option>

${
drivers.map(d=>`
<option value="${d._id}" ${t.driverId===d._id?"selected":""}>
${d.name}
</option>`).join("")
}

</select>
</td>

<td id="car-${i}">${t.vehicle||""}</td>

<td>${t.notes||""}</td>

<td>
<button onclick="sendOne(${i})">Send</button>
</td>

</tr>
`
  })
}

function renderDrivers(){

  const panel = document.getElementById("driversPanel")

  panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`

  drivers.forEach((d,i)=>{

    panel.innerHTML += `
<div class="driver" onclick="focusDriver('${d._id}')">
${i+1} - ${d.name}
</div>
`
  })
}

window.renderTrips = renderTrips
window.renderDrivers = renderDrivers
window.initMap = initMap