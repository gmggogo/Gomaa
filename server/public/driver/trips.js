function getTripClass(t){

const now = new Date();
const tripTime = new Date(`${t.tripDate} ${t.tripTime}`);

const diff = (tripTime - now) / 60000;

if(t.status === "Completed") return "trip-completed";
if(diff < 0) return "trip-expired";
if(diff < 30) return "trip-urgent";

return "trip-upcoming";
}

function render(trips){

const container = document.getElementById("container");
container.innerHTML = "";

if(!trips.length){
container.innerHTML = "<p style='text-align:center'>No Trips</p>";
return;
}

trips.forEach(t=>{

const div = document.createElement("div");

div.className = `trip-card ${getTripClass(t)}`;

div.onclick = ()=> openTrip(t);

div.innerHTML = `

<div class="trip-top">
<div class="trip-number">#${t.tripNumber || ""}</div>
<div class="trip-time">${t.tripTime || ""}</div>
</div>

<div class="address-block">
<div class="label">Pickup</div>
<div class="address">${t.pickup || "-"}</div>
</div>

<div class="line"></div>

<div class="address-block">
<div class="label">Dropoff</div>
<div class="address">${t.dropoff || "-"}</div>
</div>

<div style="display:flex;justify-content:space-between;margin-top:10px;">
<div class="badge badge-${t.status}">${t.status || ""}</div>
<div style="font-size:12px;color:#6b7280;">
${t.tripDate || ""}
</div>
</div>

`;

container.appendChild(div);

});

}