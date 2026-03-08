/* ===============================
   API
================================ */

const API_URL="/api/trips";

let hubTrips=[];
let isAddingTrip=false;

const container=document.getElementById("hubContainer");
const searchInput=document.getElementById("searchInput");
const addBtn=document.getElementById("addManualTripBtn");


/* ===============================
   LOAD TRIPS
================================ */

async function loadHubTrips(){

try{

const res=await fetch(API_URL);
const data=await res.json();

hubTrips=Array.isArray(data)?data:[];

}catch{

hubTrips=[];

}

}


/* ===============================
   RESERVED NUMBER
================================ */

function nextReservedNumber(){

const key="lastReservedRE";

let last=parseInt(localStorage.getItem(key)||"1000");

last++;

localStorage.setItem(key,last);

return "RE-"+last;

}


/* ===============================
   ADD RESERVED
================================ */

async function addReservedTripInline(){

if(isAddingTrip) return;

isAddingTrip=true;

const newTrip={

tripNumber:nextReservedNumber(),

type:"Reserved",

company:"",
entryName:"",
entryPhone:"",

clientName:"",
clientPhone:"",

pickup:"",
stops:[],

dropoff:"",
notes:"",

tripDate:"",
tripTime:"",

status:"Booked",

bookedAt:new Date().toISOString()

};


await fetch(API_URL,{

method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(newTrip)

});

await loadHubTrips();

render();

isAddingTrip=false;

}


/* ===============================
   DELETE
================================ */

async function deleteTripConfirm(tripNumber){

const ok=confirm("Delete this trip?");

if(!ok) return;

hubTrips=hubTrips.filter(t=>String(t.tripNumber)!==String(tripNumber));

await fetch(API_URL,{

method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(hubTrips)

});

await loadHubTrips();

render();

}


/* ===============================
   EDIT
================================ */

function editTripConfirm(tripNumber){

const row=document.getElementById("row-"+tripNumber);

const inputs=row.querySelectorAll("input,textarea");

inputs.forEach(i=>i.disabled=false);

row.querySelector(".edit-btn").style.display="none";

row.querySelector(".save-btn").style.display="inline-block";

}


/* ===============================
   SAVE
================================ */

async function saveTrip(tripNumber){

const row=document.getElementById("row-"+tripNumber);

const inputs=row.querySelectorAll("input,textarea");

const trip=hubTrips.find(t=>String(t.tripNumber)===String(tripNumber));

if(!trip) return;

trip.company=inputs[3].value;
trip.entryName=inputs[4].value;
trip.entryPhone=inputs[5].value;

trip.clientName=inputs[6].value;
trip.clientPhone=inputs[7].value;

trip.pickup=inputs[8].value;

trip.stops=inputs[9].value.split("→").map(s=>s.trim());

trip.dropoff=inputs[10].value;

trip.notes=inputs[11].value;

trip.tripDate=inputs[12].value;
trip.tripTime=inputs[13].value;


await fetch(API_URL,{

method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(hubTrips)

});

await loadHubTrips();

render();

}


/* ===============================
   DATE FORMAT
================================ */

function formatDate(iso){

if(!iso) return "-";

const d=new Date(iso);

if(isNaN(d)) return "-";

return d.toLocaleDateString()+" "+d.toLocaleTimeString([],{
hour:"2-digit",
minute:"2-digit"
});

}


/* ===============================
   TRIP PASSED
================================ */

function isTripPassed(t){

if(!t.tripDate||!t.tripTime) return false;

const tripDateTime=new Date(`${t.tripDate}T${t.tripTime}`);

return new Date()>=tripDateTime;

}


/* ===============================
   REMOVE AFTER 24H
================================ */

function shouldRemoveTrip(t){

if(!t.tripDate||!t.tripTime) return false;

const tripDateTime=new Date(`${t.tripDate}T${t.tripTime}`);

const diffHours=(new Date()-tripDateTime)/(1000*60*60);

return diffHours>=24;

}


/* ===============================
   ROW COLOR
================================ */

function rowColor(tr,t){

if(isTripPassed(t)){

tr.style.background="#ffe5e5";
tr.style.borderLeft="4px solid #dc2626";

return;

}

if(t.type==="Individual"){

tr.style.background="#e8f4ff";

}

else if(t.type==="Company"){

tr.style.background="#fff6d6";

}

else if(t.type==="Reserved"){

tr.style.background="#ecfdf5";

}

}


/* ===============================
   RENDER
================================ */

function render(){

hubTrips=hubTrips.filter(t=>!shouldRemoveTrip(t));

container.innerHTML="";

if(!hubTrips.length){

container.innerHTML="<p>No trips found</p>";

return;

}

const table=document.createElement("table");

table.className="hub-table";

table.innerHTML=`

<thead>

<tr>

<th>#</th>
<th>Trip #</th>
<th>Type</th>
<th>Company</th>
<th>Entry Name</th>
<th>Entry Phone</th>
<th>Client</th>
<th>Client Phone</th>
<th>Pickup</th>
<th>Stops</th>
<th>Dropoff</th>
<th>Notes</th>
<th>Date</th>
<th>Time</th>
<th>Status</th>
<th>Booked At</th>
<th>Actions</th>

</tr>

</thead>

<tbody></tbody>

`;

const tbody=table.querySelector("tbody");

hubTrips.forEach((t,i)=>{

const tr=document.createElement("tr");

tr.id="row-"+t.tripNumber;

rowColor(tr,t);

const stopsStr=Array.isArray(t.stops)?t.stops.join(" → "):"";

tr.innerHTML=`

<td>${i+1}</td>

<td><input value="${t.tripNumber}" disabled></td>

<td><input value="${t.type||"-"}" disabled></td>

<td><input value="${t.company||""}" disabled></td>

<td><input value="${t.entryName||""}" disabled></td>

<td><input value="${t.entryPhone||""}" disabled></td>

<td><input value="${t.clientName||""}" disabled></td>

<td><input value="${t.clientPhone||""}" disabled></td>

<td><input value="${t.pickup||""}" disabled></td>

<td><input value="${stopsStr}" disabled></td>

<td><input value="${t.dropoff||""}" disabled></td>

<td><textarea disabled>${t.notes||""}</textarea></td>

<td><input type="date" value="${t.tripDate||""}" disabled></td>

<td><input type="time" value="${t.tripTime||""}" disabled></td>

<td>${t.status||"Booked"}</td>

<td>${formatDate(t.bookedAt)}</td>

<td>

<button class="hub-btn edit-btn"
onclick="editTripConfirm('${t.tripNumber}')">Edit</button>

<button class="hub-btn save-btn"
style="display:none;background:#16a34a"
onclick="saveTrip('${t.tripNumber}')">Save</button>

<button class="hub-btn delete-btn"
onclick="deleteTripConfirm('${t.tripNumber}')">Delete</button>

</td>

`;

tbody.appendChild(tr);

});

container.appendChild(table);

}


/* ===============================
   SEARCH
================================ */

if(searchInput){

searchInput.addEventListener("input",function(){

const v=searchInput.value.toLowerCase();

const filtered=hubTrips.filter(t=>
JSON.stringify(t).toLowerCase().includes(v)
);

container.innerHTML="";

const oldTrips=hubTrips;

hubTrips=filtered;

render();

hubTrips=oldTrips;

});

}


/* ===============================
   AUTO REFRESH
================================ */

setInterval(async function(){

await loadHubTrips();

render();

},60000);


/* ===============================
   INIT
================================ */

if(addBtn){

addBtn.addEventListener("click",addReservedTripInline);

}

(async function(){

await loadHubTrips();

render();

})();