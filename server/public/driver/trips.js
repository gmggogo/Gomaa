console.log("driver trips loaded");

/* =========================
   AUTH
========================= */

const user =
  JSON.parse(localStorage.getItem("loggedDriver")) ||
  JSON.parse(localStorage.getItem("user"));

if (!user) {
  alert("Login first");
  window.location.href = "../login.html";
}

const driverId = user._id || user.id;

/* =========================
   ELEMENTS
========================= */

const tbody = document.getElementById("tbody");

/* =========================
   LOAD TRIPS FROM SERVER
========================= */

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

/* =========================
   RENDER
========================= */

function render(trips){

tbody.innerHTML = "";

if(!trips.length){
tbody.innerHTML = `<tr><td colspan="9">No Trips</td></tr>`;
return;
}

trips.forEach(t=>{

const tr = document.createElement("tr");

tr.className = "trip-row";

if(t.status === "Completed"){
tr.classList.add("completed");
}

tr.onclick = () => openTrip(t);

tr.innerHTML = `
<td>${t.tripNumber || ""}</td>
<td>${t.pickup || ""}</td>
<td>${(t.stops || []).join(" → ")}</td>
<td>${t.dropoff || ""}</td>
<td>${t.tripDate || ""}</td>
<td>${t.tripTime || ""}</td>
<td>${t.vehicle || ""}</td>
<td>${t.notes || ""}</td>
<td>${t.status || ""}</td>
`;

tbody.appendChild(tr);

});

}

/* =========================
   OPEN TRIP
========================= */

function openTrip(trip){

if(trip.status === "Completed") return;

window.location.href =
`map.html?tripId=${trip._id}`;

}

/* =========================
   LOGOUT
========================= */

function logout(){
localStorage.clear();
window.location.href = "../login.html";
}

/* =========================
   INIT
========================= */

loadTrips();