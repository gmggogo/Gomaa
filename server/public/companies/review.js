<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Company Trips Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>

body{
font-family:Segoe UI,Arial;
background:#f4f7fb;
margin:0;
padding:20px;
}

.search-box{
margin-bottom:15px;
}

.search-box input{
padding:8px 10px;
width:280px;
border:1px solid #cbd5e1;
border-radius:6px;
}

.review-table{
width:100%;
border-collapse:collapse;
background:white;
}

.review-table th,
.review-table td{
border:1px solid #dbe2ea;
padding:7px;
text-align:center;
font-size:14px;
}

.review-table th{
background:#0f172a;
color:white;
}

.review-table input{
width:100%;
padding:6px;
border:1px solid #cbd5e1;
border-radius:6px;
}

.actions{
display:flex;
justify-content:center;
gap:6px;
}

.btn{
border:none;
border-radius:6px;
padding:6px 10px;
font-weight:600;
cursor:pointer;
}

.btn.edit{background:#2563eb;color:white}
.btn.delete{background:#111827;color:white}
.btn.confirm{background:#16a34a;color:white}
.btn.cancel{background:#dc2626;color:white}

/* COLORS */

.row-scheduled{background:white}
.row-confirmed{background:#86efac}
.row-cancelled{background:#fecaca}

.row-yellow{background:#fde047}
.row-red-light{background:#fecaca}
.row-red-mid{background:#f87171}
.row-red-dark{background:#7f1d1d;color:white}

/* BLINK */

@keyframes blink{
0%{opacity:1}
50%{opacity:.9}
100%{opacity:1}
}

.confirm-blink{
animation:blink 2.6s infinite;
}

</style>
</head>

<body>

<div class="search-box">
<input id="searchInput" placeholder="Search name or phone">
</div>

<div id="tripsContainer"></div>

<script>

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name");

if(!token || role!=="company"){
location.href="company-login.html";
}

const container = document.getElementById("tripsContainer");
const searchInput = document.getElementById("searchInput");

let trips = [];
let filteredTrips = [];

function getAZNow(){
return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
}

function tripMinutes(t){
const dt = new Date(t.tripDate+"T"+t.tripTime);
return (dt-getAZNow())/60000;
}

function escape(v){
return String(v||"").replace(/</g,"&lt;");
}

/* FETCH */

async function loadTrips(){

const res = await fetch("/api/trips/company/"+companyName,{
headers:{Authorization:"Bearer "+token}
});

trips = await res.json();
filteredTrips = trips;
render();

}

/* SEARCH */

searchInput.oninput = ()=>{
const q = searchInput.value.toLowerCase();

filteredTrips = trips.filter(t=>
(t.clientName||"").toLowerCase().includes(q) ||
(t.clientPhone||"").includes(q)
);

render();
};

/* RENDER */

function render(){

let html = `<table class="review-table">
<tr>
<th>#</th>
<th>Trip#</th>
<th>Client</th>
<th>Phone</th>
<th>Pickup</th>
<th>Drop</th>
<th>Date</th>
<th>Time</th>
<th>Status</th>
<th>Actions</th>
</tr>`;

filteredTrips.forEach((t,i)=>{

const mins = tripMinutes(t);

let rowClass="row-scheduled";

if(t.status==="Cancelled") rowClass="row-cancelled";
else if(t.status==="Confirmed") rowClass="row-confirmed";

if(mins<=180 && mins>120) rowClass="row-yellow";
if(mins<=120 && mins>60) rowClass="row-red-light";
if(mins<=60 && mins>30) rowClass="row-red-mid";
if(mins<=30) rowClass="row-red-dark";

let blink="";
if(t.status==="Confirmed" && mins<=30) blink="confirm-blink";

html+=`<tr class="${rowClass} ${blink}" data-id="${t._id}">
<td>${i+1}</td>
<td>${escape(t.tripNumber)}</td>
<td>${escape(t.clientName)}</td>
<td>${escape(t.clientPhone)}</td>
<td>${escape(t.pickup)}</td>
<td>${escape(t.dropoff)}</td>
<td>${escape(t.tripDate)}</td>
<td>${escape(t.tripTime)}</td>
<td>${escape(t.status)}</td>
<td>${buttons(t,mins)}</td>
</tr>`;

});

html+="</table>";

container.innerHTML=html;

}

/* BUTTON POLICY */

function buttons(t,mins){

if(t.status==="Cancelled") return "";

if(mins>120){

return `<div class="actions">
<button class="btn edit" onclick="editTrip('${t._id}')">Edit</button>
<button class="btn delete" onclick="deleteTrip('${t._id}')">Delete</button>
<button class="btn confirm" onclick="confirmTrip('${t._id}')">Confirm</button>
</div>`;

}

if(mins<=120 && t.status==="Scheduled"){

return `<div class="actions">
<button class="btn confirm" onclick="confirmTrip('${t._id}')">Confirm</button>
<button class="btn cancel" onclick="cancelTrip('${t._id}')">Cancel</button>
</div>`;

}

if(mins<=120 && t.status==="Confirmed"){

return `<div class="actions">
<button class="btn cancel" onclick="cancelTrip('${t._id}')">Cancel</button>
</div>`;

}

return "";

}

/* ACTIONS */

async function confirmTrip(id){

await fetch("/api/trips/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+token
},
body:JSON.stringify({status:"Confirmed"})
});

loadTrips();
}

async function cancelTrip(id){

if(!confirm("Cancel this trip?")) return;

await fetch("/api/trips/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+token
},
body:JSON.stringify({status:"Cancelled"})
});

loadTrips();
}

async function deleteTrip(id){

if(!confirm("Delete this trip?")) return;

await fetch("/api/trips/"+id,{
method:"DELETE",
headers:{Authorization:"Bearer "+token}
});

loadTrips();
}

async function editTrip(id){

const trip = trips.find(t=>t._id===id);

const newTime = prompt("New Time (HH:MM)",trip.tripTime);
if(!newTime) return;

const mins = (new Date(trip.tripDate+"T"+newTime)-getAZNow())/60000;

if(mins<=120){
if(!confirm("WARNING: Trip is within 120 minutes. It cannot be edited or deleted. Continue?")) return;
}

await fetch("/api/trips/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer "+token
},
body:JSON.stringify({tripTime:newTime,status:"Scheduled"})
});

loadTrips();

}

loadTrips();

setInterval(loadTrips,30000);

</script>

</body>
</html>