const API="/api/trips"

let trips=[]
let filtered=[]

const container=document.getElementById("hubContainer")
const searchInput=document.getElementById("searchInput")
const addBtn=document.getElementById("addManualTripBtn")

/* LOAD */

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=Array.isArray(data)?data:[]
filtered=[...trips]

render()

}

/* ADD RESERVED */

async function addReservedTripInline(){

const ok=confirm("Create Reserved Trip?")
if(!ok)return

const trip={

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

createdAt:new Date().toISOString()

}

await fetch(API,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(trip)
})

await loadTrips()

}

addBtn.onclick=addReservedTripInline

/* COLORS */

function rowColor(tr,t){

if(t.type==="Individual")
tr.style.background="#e8f4ff"

else if(t.type==="Company")
tr.style.background="#fff6d6"

else if(t.type==="Reserved")
tr.style.background="#ecfdf5"

}

/* EDIT */

function editTripRow(btn){

const tr=btn.closest("tr")
const inputs=tr.querySelectorAll("input,textarea")

inputs.forEach((el,i)=>{
if(i<2)return
el.disabled=false
})

tr.querySelector(".edit-btn").style.display="none"
tr.querySelector(".save-btn").style.display="inline-block"

}

/* SAVE */

async function saveTripRow(btn,id){

const tr=btn.closest("tr")
const inputs=tr.querySelectorAll("input,textarea")

const trip={

company:inputs[3].value,
entryName:inputs[4].value,
entryPhone:inputs[5].value,

clientName:inputs[6].value,
clientPhone:inputs[7].value,

pickup:inputs[8].value,

stops:inputs[9].value
?inputs[9].value.split("→").map(s=>s.trim())
:[],

dropoff:inputs[10].value,

notes:inputs[11].value,

tripDate:inputs[12].value,
tripTime:inputs[13].value

}

await fetch(API+"/"+id,{
method:"PUT",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(trip)
})

await loadTrips()

}

/* DELETE */

async function deleteTripConfirm(id){

const ok=confirm("Delete this trip?")
if(!ok)return

await fetch(API+"/"+id,{method:"DELETE"})

await loadTrips()

}

/* RENDER */

function render(){

container.innerHTML=""

const table=document.createElement("table")
table.className="hub-table"

table.innerHTML=`

<thead>
<tr>

<th>#</th>
<th>Trip#</th>
<th>Type</th>

<th>Company</th>
<th>Entry</th>
<th>Phone</th>

<th>Client</th>
<th>Client Phone</th>

<th>Pickup</th>
<th>Stops</th>
<th>Dropoff</th>

<th>Notes</th>

<th>Date</th>
<th>Time</th>

<th>Status</th>

<th>Actions</th>

</tr>
</thead>

<tbody></tbody>
`

const tbody=table.querySelector("tbody")

filtered.forEach((t,i)=>{

const tr=document.createElement("tr")

rowColor(tr,t)

const stops=Array.isArray(t.stops)?t.stops.join(" → "):""

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

<td><input value="${stops}" disabled></td>

<td><input value="${t.dropoff||""}" disabled></td>

<td><textarea disabled>${t.notes||""}</textarea></td>

<td><input type="date" value="${t.tripDate||""}" disabled></td>
<td><input type="time" value="${t.tripTime||""}" disabled></td>

<td>${t.status||""}</td>

<td>

<button class="edit-btn"
onclick="editTripRow(this)">
Edit
</button>

<button class="save-btn"
style="display:none"
onclick="saveTripRow(this,'${t._id}')">
Save
</button>

<button class="delete-btn"
onclick="deleteTripConfirm('${t._id}')">
Delete
</button>

</td>

`

tbody.appendChild(tr)

})

container.appendChild(table)

}

/* SEARCH */

searchInput.addEventListener("input",function(){

const v=searchInput.value.toLowerCase()

filtered=trips.filter(t=>
JSON.stringify(t).toLowerCase().includes(v)
)

render()

})

/* AUTO REFRESH */

setInterval(loadTrips,60000)

/* INIT */

loadTrips()