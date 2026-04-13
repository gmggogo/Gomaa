console.log("driver trips FINAL");

/* AUTH */
const user =
JSON.parse(localStorage.getItem("loggedDriver")) ||
JSON.parse(localStorage.getItem("user"));

if(!user){
  location.href = "../login.html";
}

const driverId = user._id || user.id;
const container = document.getElementById("container");

/* ================= FILTER 6 HOURS ================= */
function isExpired(t){

const now = new Date(
  new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
);

const tripTime = new Date(`${t.tripDate}T${t.tripTime}`);

if(!tripTime || isNaN(tripTime)) return false;

const diff = (now - tripTime)/(1000*60*60);

return diff >= 6;
}

/* ================= STATUS ================= */
function getStatus(t){

const s = t.status || "Scheduled";

if(s === "NoShow") return "NoShow";
if(s === "InProgress") return "OnTrip";

return s;
}

/* ================= ACTIVE ================= */
function isActive(status){
return (
status === "OnTrip" ||
status === "Arrived"
);
}

/* ================= CLASS ================= */
function getClass(status){

if(status === "Completed") return "trip-completed";
if(status === "Cancelled") return "trip-cancelled";
if(status === "NoShow") return "trip-noshow";
if(isActive(status)) return "trip-active";

return "";
}

/* ================= MAP ================= */
function navigate(address){
window.open(
`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
"_blank"
);
}

/* ================= LOAD ================= */
async function loadTrips(){

try{

const res = await fetch(`/api/driver/my-trips/${driverId}`);
const trips = await res.json();

render(trips);

}catch(err){
container.innerHTML = "<div class='empty'>Error loading</div>";
}

}

/* ================= RENDER ================= */
function render(trips){

container.innerHTML = "";

let filtered = trips.filter(t => !isExpired(t));

if(!filtered.length){
container.innerHTML = "<div class='empty'>No Trips Today</div>";
return;
}

/* ترتيب */
filtered.sort((a,b)=>{

const sA = getStatus(a);
const sB = getStatus(b);

if(isActive(sA) && !isActive(sB)) return -1;
if(!isActive(sA) && isActive(sB)) return 1;

return new Date(`${a.tripDate} ${a.tripTime}`) -
       new Date(`${b.tripDate} ${b.tripTime}`);
});

/* رسم */
filtered.forEach(t=>{

const status = getStatus(t);
const cls = getClass(status);

const div = document.createElement("div");
div.className = `trip-card ${cls}`;

div.innerHTML = `

<div class="trip-top">
  <div>#${t.tripNumber || ""}</div>
  <div>${t.tripTime || ""}</div>
</div>

<div class="label">CLIENT</div>
<div class="value">${t.clientName || "-"}</div>

<a class="phone" href="tel:${t.clientPhone || ""}">
📞 ${t.clientPhone || "-"}
</a>

<div class="label">PICKUP</div>
<div class="address" onclick="navigate('${t.pickup}')">
${t.pickup || "-"}
</div>

<div class="label">STOPS</div>
<div class="value">
${(t.stops || []).join(" → ") || "-"}
</div>

<div class="label">DROPOFF</div>
<div class="address" onclick="navigate('${t.dropoff}')">
${t.dropoff || "-"}
</div>

<div class="notes">
${t.notes || "No notes"}
</div>

<div class="badge badge-${status}">
${status}
</div>

<button class="btn" onclick="openTrip('${t._id}')">
OPEN TRIP
</button>

`;

container.appendChild(div);

});

}

/* ================= OPEN MAP ================= */
function openTrip(id){
location.href = `map.html?tripId=${id}`;
}

/* ================= AUTO ================= */
loadTrips();
setInterval(loadTrips,5000);