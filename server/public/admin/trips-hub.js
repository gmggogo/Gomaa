/* ===============================
   API
================================ */
const LOAD_API_URL = "/api/trips/company";
const CREATE_API_URL = "/api/trips";

/* ===============================
   STATE
================================ */
let allHubTrips = [];
let hubTrips = [];
let currentSearch = "";

/* ===============================
   ELEMENTS
================================ */
const container = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn = document.getElementById("addManualTripBtn");

/* ===============================
   STYLE
================================ */
(function injectTinyStyle(){

const s = document.createElement("style");

s.innerHTML = `
.hub-table{width:100%;border-collapse:collapse;font-size:11px}

.hub-table th{
background:#0f172a;
color:#fff;
padding:6px;
position:sticky;
top:0;
z-index:2
}

.hub-table td{
border:1px solid #e5e7eb;
padding:3px;
vertical-align:middle
}

.hub-table input{
width:100%;
font-size:11px;
padding:2px 4px;
box-sizing:border-box
}

.hub-table textarea{
width:100%;
font-size:11px;
padding:2px 4px;
box-sizing:border-box;
resize:vertical;
min-height:28px
}

.hub-actions{
display:flex;
gap:6px;
justify-content:center;
align-items:center;
flex-wrap:wrap
}

.hub-btn{
border:none;
border-radius:6px;
padding:5px 8px;
font-size:11px;
cursor:pointer;
color:#fff;
opacity:.95
}

.hub-btn.edit{background:#2563eb}
.hub-btn.save{background:#16a34a}
.hub-btn.delete{background:#dc2626}
`;

document.head.appendChild(s);

})();

/* ===============================
   HELPERS
================================ */
function escapeHtml(value){

return String(value ?? "")
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;");

}

function formatDate(iso){

if(!iso) return "-";

const d=new Date(iso);

return d.toLocaleDateString()+" "+d.toLocaleTimeString([],{
hour:"2-digit",
minute:"2-digit"
});

}

function getTripNumber(t){

if(t && t.tripNumber) return String(t.tripNumber);
if(t && t.id) return String(t.id);
return "-";

}

/* ===============================
   COLORS POLICY
================================ */
function rowColor(tr,t){

if(!t) return;

if(t.tripDate && t.tripTime){

const tripDateTime=new Date(`${t.tripDate}T${t.tripTime}`);

if(new Date()>=tripDateTime){

tr.style.backgroundColor="#ffe5e5";
tr.style.borderLeft="4px solid #dc2626";
return;

}

}

if(t.type==="gh"){

tr.style.backgroundColor="#e8f4ff";

}
else if(t.type==="reserved"){

tr.style.backgroundColor="#ecfdf5";

}
else{

tr.style.backgroundColor="#fff6d6";

}

}

/* ===============================
   LOAD HUB TRIPS
================================ */
async function loadHubTrips(){

try{

const res=await fetch(LOAD_API_URL);
const data=await res.json();

allHubTrips=Array.isArray(data)?data:[];

applySearch();

}
catch(err){

console.error("Load trips error:",err);

}

}

/* ===============================
   SEARCH APPLY
================================ */
function applySearch(){

const baseTrips=[...allHubTrips];

if(!currentSearch){

hubTrips=baseTrips;
return;

}

const v=currentSearch.toLowerCase();

hubTrips=baseTrips.filter(t =>
JSON.stringify(t).toLowerCase().includes(v)
);

}

/* ===============================
   ADD RESERVED TRIP
================================ */
async function addReservedTripInline(){

const newTrip = {

type:"reserved",

company:"",

entryName:"",
entryPhone:"",

clientName:"",
clientPhone:"",

pickup:"Reserved Pickup",
stops:[],
dropoff:"Reserved Dropoff",

notes:"",

tripDate:"",
tripTime:"",

status:"Scheduled"

};

try{

const res=await fetch(CREATE_API_URL,{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify(newTrip)
});

if(!res.ok){

alert("Failed to add reserved trip");
return;

}

await loadHubTrips();
render();

}
catch(err){

console.error("Add reserved error:",err);

}

}

if(addBtn){

addBtn.addEventListener("click",function(e){
e.preventDefault();
addReservedTripInline();
});

}

/* ===============================
   DELETE
================================ */
async function deleteTripConfirm(id){

const ok=confirm("Delete this trip?");
if(!ok) return;

try{

const res=await fetch(`/api/trips/${id}`,{
method:"DELETE"
});

if(!res.ok){

alert("Delete failed");
return;

}

await loadHubTrips();
render();

}
catch(err){

console.error("Delete error:",err);

}

}

/* ===============================
   EDIT
================================ */
function editTripRow(btn){

const ok=confirm("Editing this trip. Continue?");
if(!ok) return;

const tr=btn.closest("tr");
const inputs=tr.querySelectorAll("input,textarea");

inputs.forEach((el,index)=>{

if(index===0 || index===1) return;

el.disabled=false;

});

tr.querySelector(".edit").style.display="none";
tr.querySelector(".save").style.display="inline-block";

}

/* ===============================
   SAVE
================================ */
async function saveTripRow(btn,id){

const tr=btn.closest("tr");

const inputs=tr.querySelectorAll("input,textarea");

const updatedTrip={

company:inputs[2].value,

entryName:inputs[3].value,
entryPhone:inputs[4].value,

clientName:inputs[5].value,
clientPhone:inputs[6].value,

pickup:inputs[7].value,

stops:inputs[8].value
? inputs[8].value.split("→").map(s=>s.trim()).filter(Boolean)
:[],

dropoff:inputs[9].value,

notes:inputs[10].value,

tripDate:inputs[11].value,
tripTime:inputs[12].value

};

try{

const res=await fetch(`/api/trips/${id}`,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify(updatedTrip)
});

if(!res.ok){

alert("Save failed");
return;

}

await loadHubTrips();
render();

}
catch(err){

console.error("Save error:",err);

}

}

window.deleteTripConfirm=deleteTripConfirm;
window.editTripRow=editTripRow;
window.saveTripRow=saveTripRow;

/* ===============================
   RENDER
================================ */
function render(){

applySearch();

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
<th>Booked</th>
<th>Actions</th>
</tr>
</thead>
<tbody></tbody>
`;

const tbody=table.querySelector("tbody");

hubTrips.forEach(function(t,i){

const tr=document.createElement("tr");

rowColor(tr,t);

const stopsStr=Array.isArray(t.stops)?t.stops.join(" → "):"";

tr.innerHTML=`
<td>${i+1}</td>

<td><input value="${escapeHtml(getTripNumber(t))}" disabled></td>
<td><input value="${escapeHtml(t.type||"")}" disabled></td>

<td><input value="${escapeHtml(t.company||"")}" disabled></td>

<td><input value="${escapeHtml(t.entryName||"")}" disabled></td>
<td><input value="${escapeHtml(t.entryPhone||"")}" disabled></td>

<td><input value="${escapeHtml(t.clientName||"")}" disabled></td>
<td><input value="${escapeHtml(t.clientPhone||"")}" disabled></td>

<td><input value="${escapeHtml(t.pickup||"")}" disabled></td>

<td><input value="${escapeHtml(stopsStr)}" disabled></td>

<td><input value="${escapeHtml(t.dropoff||"")}" disabled></td>

<td><textarea disabled>${escapeHtml(t.notes||"")}</textarea></td>

<td><input type="date" value="${escapeHtml(t.tripDate||"")}" disabled></td>
<td><input type="time" value="${escapeHtml(t.tripTime||"")}" disabled></td>

<td>${escapeHtml(t.status||"")}</td>

<td>${formatDate(t.createdAt)}</td>

<td>
<div class="hub-actions">

<button class="hub-btn edit"
onclick="editTripRow(this)">
Edit
</button>

<button class="hub-btn save"
style="display:none"
onclick="saveTripRow(this,'${t._id}')">
Save
</button>

<button class="hub-btn delete"
onclick="deleteTripConfirm('${t._id}')">
Delete
</button>

</div>
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

currentSearch=searchInput.value.trim();
render();

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
(async function(){

await loadHubTrips();
render();

})();