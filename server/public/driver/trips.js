console.log("driver trips loaded");

/* AUTH */
const user =
JSON.parse(localStorage.getItem("loggedDriver")) ||
JSON.parse(localStorage.getItem("user"));

if(!user){
alert("Login first");
window.location.href = "../login.html";
}

const driverId = user._id || user.id;
const container = document.getElementById("container");

/* TIME */
function getTripClass(t){

if(t.status === "Completed") return "trip-completed";

const now = new Date();
const trip = new Date(`${t.tripDate} ${t.tripTime}`);
const diff = (trip - now) / 60000;

if(diff < 0) return "trip-expired";
if(diff < 30) return "trip-urgent";

return "";
}

/* NAVIGATE */
function navigate(address){
if(!address) return;

const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
window.open(url, "_blank");
}

/* LOAD */
async function loadTrips(){

try{

const res = await fetch(`/api/driver/my-trips/${driverId}`);

if(!res.ok) throw new Error("error");

const trips = await res.json();

render(trips);

}catch(err){
console.error(err);
container.innerHTML = "Error loading trips";
}

}

/* RENDER */
function render(trips){

container.innerHTML = "";

if(!trips.length){
container.innerHTML = "<h3>No Trips</h3>";
return;
}

trips.forEach(t=>{

const div = document.createElement("div");

div.className = `trip-card ${getTripClass(t)}`;

div.onclick = (e)=>{
if(e.target.classList.contains("no-click")) return;
openTrip(t);
};

div.innerHTML = `

<div class="trip-top">
<div class="trip-number">#${t.tripNumber || ""}</div>
<div class="trip-time">${t.tripTime || ""}</div>
</div>

<div class="section">
<div class="label">CLIENT</div>
<div class="value">${t.clientName || "-"}</div>
</div>

<div class="section">
<div class="label">PHONE</div>
<a class="phone no-click" href="tel:${t.clientPhone || ""}">
📞 ${t.clientPhone || "-"}
</a>
</div>

<div class="row">
<div class="section">
<div class="label">DATE</div>
<div class="value">${t.tripDate || "-"}</div>
</div>

<div class="section">
<div class="label">TIME</div>
<div class="value">${t.tripTime || "-"}</div>
</div>
</div>

<div class="section">
<div class="label">PICKUP</div>
<div class="address no-click" onclick="navigate('${t.pickup}')">
📍 ${t.pickup || "-"}
</div>
</div>

<div class="section">
<div class="label">STOPS</div>
<div class="value">${(t.stops || []).join(" → ") || "-"}</div>
</div>

<div class="section">
<div class="label">DROPOFF</div>
<div class="address no-click" onclick="navigate('${t.dropoff}')">
🏁 ${t.dropoff || "-"}
</div>
</div>

<div class="section">
<div class="label">NOTES</div>
<div class="notes">${t.notes || "No notes"}</div>
</div>

<div class="section">
<span class="badge badge-${t.status}">
${t.status || ""}
</span>
</div>

`;

container.appendChild(div);

});

}

/* OPEN */
function openTrip(trip){

if(trip.status === "Completed") return;

window.location.href = `map.html?tripId=${trip._id}`;

}

/* LOGOUT */
function logout(){
localStorage.clear();
window.location.href = "../login.html";
}

/* START */
loadTrips();
setInterval(loadTrips,5000);