console.log("driver trips PRO loaded");

/* =========================
   AUTH
========================= */
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
   FILTER (بعد 6 ساعات تختفي)
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
   STATUS NORMALIZE
========================= */
function getStatus(t){

const s = t.status || "Scheduled";

if(s === "NoShow") return "No Show";
if(s === "InProgress") return "On Trip";

return s;
}

/* =========================
   ACTIVE TRIP (🔥 المهم)
========================= */
function isActive(status){

return (
status === "On Trip" ||
status === "Arrived" ||
status === "InProgress"
);
}

/* =========================
   CLASS
========================= */
function getClass(status){

if(status === "Completed") return "trip-completed";
if(status === "Cancelled") return "trip-cancelled";
if(status === "No Show") return "trip-noshow";
if(isActive(status)) return "trip-active";

return "";
}

/* =========================
   MAP
========================= */
function navigate(address){
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

/* 1️⃣ فلترة */
let filtered = trips.filter(t => !isExpired(t));

if(!filtered.length){
container.innerHTML = "<h3>No Trips Today</h3>";
return;
}

/* 2️⃣ ترتيب احترافي */
filtered.sort((a,b)=>{

const statusA = getStatus(a);
const statusB = getStatus(b);

// active فوق
if(isActive(statusA) && !isActive(statusB)) return -1;
if(!isActive(statusA) && isActive(statusB)) return 1;

// بعد كده بالوقت
return new Date(`${a.tripDate} ${a.tripTime}`) -
       new Date(`${b.tripDate} ${b.tripTime}`);
});

/* 3️⃣ رسم */
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

<div class="trip-top">
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

/* =========================
   AUTO REFRESH
========================= */
loadTrips();
setInterval(loadTrips,5000);