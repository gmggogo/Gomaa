const API="/api/trips";

let trips=[];

const container=document.getElementById("hubContainer");
const addBtn=document.getElementById("addManualTripBtn");
const searchInput=document.getElementById("searchInput");

/* LOAD */

async function loadTrips(){

const res=await fetch(API);

trips=await res.json();

render();

}

/* ADD RESERVED */

async function addReservedTripInline(){

await fetch(API,{
method:"POST",
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
type:"reserved",
status:"Booked"
})
});

loadTrips();

}

/* EDIT */

function editTrip(id){

const row=document.getElementById(id);

row.querySelectorAll("input,textarea").forEach(el=>{
el.disabled=false;
});

row.querySelector(".edit-btn").style.display="none";
row.querySelector(".save-btn").style.display="inline-block";

}

/* SAVE */

async function saveTrip(id){

const row=document.getElementById(id);

const inputs=row.querySelectorAll("input");

const data={
company:inputs[2].value,
entryName:inputs[3].value,
entryPhone:inputs[4].value,
clientName:inputs[5].value,
clientPhone:inputs[6].value,
pickup:inputs[7].value,
dropoff:inputs[8].value
};

await fetch(API+"/"+id,{
method:"PUT",
headers:{'Content-Type':'application/json'},
body:JSON.stringify(data)
});

loadTrips();

}

/* DELETE */

async function deleteTrip(id){

if(!confirm("Delete trip?")) return;

await fetch(API+"/"+id,{
method:"DELETE"
});

loadTrips();

}

/* RENDER */

function render(){

container.innerHTML="";

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
<th>Dropoff</th>
<th>Actions</th>
</tr>
</thead>

<tbody></tbody>

`;

const tbody=table.querySelector("tbody");

trips.forEach((t,i)=>{

const tr=document.createElement("tr");

tr.id=t._id;

tr.innerHTML=`

<td>${i+1}</td>

<td><input value="${t.tripNumber||""}" disabled></td>

<td><input value="${t.type||""}" disabled></td>

<td><input value="${t.company||""}" disabled></td>

<td><input value="${t.entryName||""}" disabled></td>

<td><input value="${t.entryPhone||""}" disabled></td>

<td><input value="${t.clientName||""}" disabled></td>

<td><input value="${t.clientPhone||""}" disabled></td>

<td><input value="${t.pickup||""}" disabled></td>

<td><input value="${t.dropoff||""}" disabled></td>

<td>

<button class="hub-btn edit-btn"
onclick="editTrip('${t._id}')">

Edit

</button>

<button class="hub-btn save-btn"
style="display:none"
onclick="saveTrip('${t._id}')">

Save

</button>

<button class="hub-btn delete-btn"
onclick="deleteTrip('${t._id}')">

Delete

</button>

</td>

`;

tbody.appendChild(tr);

});

container.appendChild(table);

}

/* SEARCH */

searchInput.addEventListener("input",()=>{

const v=searchInput.value.toLowerCase();

const filtered=trips.filter(t=>
JSON.stringify(t).toLowerCase().includes(v)
);

container.innerHTML="";

const old=trips;

trips=filtered;

render();

trips=old;

});

/* BUTTON */

addBtn.addEventListener("click",addReservedTripInline);

/* INIT */

loadTrips();