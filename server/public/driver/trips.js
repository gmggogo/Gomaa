console.log("driver trips loaded");

/* ================= AUTH ================= */

const user =
  JSON.parse(localStorage.getItem("loggedDriver")) ||
  JSON.parse(localStorage.getItem("user"));

if (!user) {
  alert("Login first");
  window.location.href = "../login.html";
}

const driverId = user._id || user.id;

/* ================= ELEMENT ================= */

const container = document.getElementById("container");

/* ================= TIME STATUS ================= */

function getStatus(trip){

  const now = new Date();
  const tripTime = new Date(`${trip.tripDate} ${trip.tripTime}`);

  const diff = (tripTime - now) / 60000;

  if(trip.status === "Completed") return "completed";

  if(diff <= 0) return "expired";
  if(diff <= 30) return "urgent";
  if(diff <= 90) return "soon";

  return "upcoming";
}

/* ================= LOAD ================= */

async function loadTrips(){

try{

const res = await fetch(`/api/driver/my-trips/${driverId}`);

if(!res.ok) throw new Error("server error");

const trips = await res.json();

render(trips);

}catch(err){
console.error(err);
alert("Error loading trips");
}

}

/* ================= RENDER ================= */

function render(trips){

container.innerHTML = "";

if(!trips.length){
container.innerHTML = `<div>No Trips</div>`;
return;
}

trips.forEach(t=>{

const status = getStatus(t);

const div = document.createElement("div");

div.className = `trip-card trip-${status}`;

div.onclick = () => openTrip(t);

div.innerHTML = `

<div class="row">
<div><b>#${t.tripNumber || ""}</b></div>
<div>${t.tripTime || ""}</div>
</div>

<div class="row">
<div class="label">Pickup</div>
<div>${t.pickup || ""}</div>
</div>

<div class="row">
<div class="label">Dropoff</div>
<div>${t.dropoff || ""}</div>
</div>

<div class="row">
<div class="label">Date</div>
<div>${t.tripDate || ""}</div>
</div>

<div class="btns">

<button class="btn nav-btn" onclick="navigate(event,'${t._id}')">
Navigate
</button>

<button class="btn complete-btn" onclick="completeTrip(event,'${t._id}')">
Done
</button>

</div>

`;

container.appendChild(div);

});

}

/* ================= OPEN MAP ================= */

function openTrip(trip){

if(trip.status === "Completed") return;

window.location.href = `map.html?tripId=${trip._id}`;

}

/* ================= NAVIGATE ================= */

function navigate(e,id){
e.stopPropagation();
window.location.href = `map.html?tripId=${id}`;
}

/* ================= COMPLETE ================= */

async function completeTrip(e,id){

e.stopPropagation();

if(!confirm("Complete trip?")) return;

await fetch(`/api/trips/${id}`,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({ status:"Completed" })
});

loadTrips();

}

/* ================= LOGOUT ================= */

function logout(){
localStorage.clear();
window.location.href = "../login.html";
}

/* ================= INIT ================= */

loadTrips();