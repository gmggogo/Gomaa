const UI = {

renderTrips(trips){

const tbody=document.getElementById("dispatchTable")
tbody.innerHTML=""

trips.forEach(t=>{

const tr=document.createElement("tr")

tr.innerHTML=`
<td><input type="checkbox" value="${t._id}" class="tripSelect"></td>
<td>${t.tripNumber}</td>
<td>${t.clientName}</td>
<td>${t.pickup}</td>
<td>${t.dropoff}</td>
<td>${t.tripDate}</td>
<td>${t.tripTime}</td>
<td>${t.driverName||"-"}</td>
`

tbody.appendChild(tr)

})

},

renderDriversPanel(drivers){

const div=document.getElementById("driversPanel")
div.innerHTML=""

drivers.forEach(d=>{
const el=document.createElement("div")
el.innerText=`${d.name} - ${d.vehicleNumber}`
div.appendChild(el)
})

},

getSelected(){
return [...document.querySelectorAll(".tripSelect:checked")].map(e=>e.value)
}

}