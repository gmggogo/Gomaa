const UI = {

showTab(tab){

document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"))
event.target.classList.add("active")

document.getElementById("tripsPage").classList.remove("active")
document.getElementById("driversPage").classList.remove("active")

if(tab==="trips"){
document.getElementById("tripsPage").classList.add("active")
}else{
document.getElementById("driversPage").classList.add("active")
Engine.renderMap()
}

},

render(){

this.renderTrips()
this.renderDrivers()

},

/* DRIVERS */
renderDrivers(){

const box=document.getElementById("driversList")

box.innerHTML = Engine.drivers.map((d,i)=>{

const s=Engine.schedule[d._id]||{}
if(!s.enabled) return ""

return `
<div class="driver-row"
onclick="Engine.focusDriver('${d._id}')">

<span>${i+1} - ${d.name}</span>

<span>🚗 ${s.vehicleNumber||"-"}</span>

</div>
`

}).join("")

},

/* TRIPS (نفس بتاعك بالظبط) */
renderTrips(){

// 👇 استخدم نفس كود trips اللي انت بعته (متغيرش فيه حاجة)

loadTrips() // reuse your original function

}

}