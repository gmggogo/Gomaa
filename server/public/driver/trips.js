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

/* =========================
   FILTER (🔥 حذف بعد 6 ساعات)
========================= */

function isExpired(t){

const now = new Date(
  new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
);

const tripTime = new Date(`${t.tripDate}T${t.tripTime}`);

if(!tripTime || isNaN(tripTime)) return false;

const diff = (now - tripTime)/(1000*60*60);

return diff >= 6;
}

/* =========================
   STATUS (من السيرفر فقط)
========================= */

function getStatus(t){
return t.status || "Scheduled";
}

/* =========================
   CLASS
========================= */

function getClass(status){

if(status === "Completed") return "trip-completed";
if(status === "Cancelled") return "trip-cancelled";
if(status === "No Show") return "trip-noshow";

return "";
}

/* =========================
   MAP
========================= */

function navigate(address){
if(!address) return;

window.open(
`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
"_blank"
);
}

/* =========================
   LOAD
========================= */

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

/* =========================
   RENDER
========================= */

function render(trips){

container.innerHTML = "";

/* 🔥 فلترة الرحلات القديمة */
const filtered = trips.filter(t => !isExpired(t));

if(!filtered.length){
container.innerHTML = "<h3>No Trips Today</h3>";
return;
}

filtered.forEach(t=>{

const status = getStatus(t);
const cls = getClass(status);

const div = document.createElement("div");
div.className = `trip-card ${cls}`;

div.onclick = ()=>{
if(status === "Completed" || status === "Cancelled") return;
window.location.href = `map.html?tripId=${t._id}`;
};

div.innerHTML = `

<div style="display:flex;justify-content:space-between;">
<div><b>#${t.tripNumber || ""}</b></div>
<div>${t.tripTime || ""}</div>
</div>

<div>
<div class="label">CLIENT</div>
<div class="value">${t.clientName || "-"}</div>
</div>

<div>
<a class="phone" href="tel:${t.clientPhone || ""}">
📞 ${t.clientPhone || "-"}
</a>
</div>

<div>
<div class="label">PICKUP</div>
<div class="address" onclick="navigate('${t.pickup}')">
${t.pickup || "-"}
</div>
</div>

<div>
<div class="label">DROPOFF</div>
<div class="address" onclick="navigate('${t.dropoff}')">
${t.dropoff || "-"}
</div>
</div>

<div class="notes">${t.notes || ""}</div>

<div class="badge badge-${status.replace(" ","")}">
${status}
</div>

`;

container.appendChild(div);

});

}

/* START */
loadTrips();
setInterval(loadTrips,5000);