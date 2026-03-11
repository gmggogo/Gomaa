const API="/api/trips"

const container=document.getElementById("tripsContainer")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}

function rowColor(type){

type=(type||"").toLowerCase()

if(type==="company") return "row-company"
if(type==="individual") return "row-individual"
if(type==="reserved") return "row-reserved"

return ""

}

function renderTrips(){

container.innerHTML=""

const wrapper=document.createElement("div")
wrapper.className="table-scroll"

const table=document.createElement("table")
table.className="trip-table"

table.innerHTML=`

<tr>

<th>Dispatch</th>
<th>#</th>
<th>Trip</th>
<th>Type</th>
<th>Company</th>
<th>Client</th>
<th>Phone</th>
<th>Pickup</th>
<th>Stops</th>
<th>Dropoff</th>
<th>Date</th>
<th>Time</th>
<th>Status</th>
<th>Actions</th>

</tr>

`

trips.forEach((t,i)=>{

const tr=document.createElement("tr")
tr.className=rowColor(t.type)

tr.innerHTML=`

<td>
<input class="dispatch-check" type="checkbox"
${t.inDispatch?"checked":""}
onchange="sendDispatch('${t._id}',this.checked)">
</td>

<td>${i+1}</td>

<td>${t.tripNumber||""}</td>

<td>${t.type||""}</td>

<td>${t.company||""}</td>

<td>
<input class="edit-field" disabled value="${t.clientName||""}">
</td>

<td>
<input class="edit-field" disabled value="${t.clientPhone||""}">
</td>

<td>
<input class="edit-field" disabled value="${t.pickup||""}">
</td>

<td>

<div class="stops">

${(t.stops||[]).map(s=>`
<input class="stop edit-field" disabled value="${s}">
`).join("")}

</div>

<button class="add-stop" onclick="addStop(this)">+ Stop</button>

</td>

<td>
<input class="edit-field" disabled value="${t.dropoff||""}">
</td>

<td>
<input class="edit-field" disabled value="${t.tripDate||""}">
</td>

<td>
<input class="edit-field" disabled value="${t.tripTime||""}">
</td>

<td>Confirmed</td>

<td>

<button class="btn btn-edit"
onclick="editTrip('${t._id}',this)">
Edit
</button>

<button class="btn btn-delete"
onclick="deleteTrip('${t._id}')">
Delete
</button>

<button class="btn btn-disable"
onclick="toggleTrip('${t._id}',this)">
${t.disabled ? "Enable" : "Disable"}
</button>

</td>

`

table.appendChild(tr)

})

wrapper.appendChild(table)

container.appendChild(wrapper)

}

function addStop(btn){

const stopsDiv=btn.parentElement.querySelector(".stops")
const count=stopsDiv.querySelectorAll("input").length

if(count>=5){
alert("Maximum 5 stops")
return
}

const input=document.createElement("input")
input.className="stop edit-field"
input.placeholder="Stop address"

stopsDiv.appendChild(input)

}

function editTrip(id,btn){

const row=btn.closest("tr")
const fields=row.querySelectorAll(".edit-field")

if(btn.innerText==="Edit"){

fields.forEach(f=>f.disabled=false)

btn.innerText="Save"

return

}

const stopFields=row.querySelectorAll(".stop")

const stops=[]

stopFields.forEach(s=>{
if(s.value.trim()!="") stops.push(s.value)
})

const data={

clientName:fields[0].value,
clientPhone:fields[1].value,
pickup:fields[2].value,
stops:stops,
dropoff:fields[fields.length-3].value,
tripDate:fields[fields.length-2].value,
tripTime:fields[fields.length-1].value

}

saveTrip(id,data)

fields.forEach(f=>f.disabled=true)

btn.innerText="Edit"

}

async function saveTrip(id,data){

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(data)
})

loadTrips()

}

async function deleteTrip(id){

if(!confirm("Delete this trip?")) return

await fetch(API+"/"+id,{method:"DELETE"})

loadTrips()

}

function toggleTrip(id,btn){

const row=btn.closest("tr")

const fields=row.querySelectorAll("input")

fields.forEach(f=>{
if(!f.classList.contains("dispatch-check")){
f.disabled=true
}
})

if(btn.innerText==="Disable"){

btn.innerText="Enable"
btn.style.background="#16a34a"

fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({disabled:true})
})

}else{

btn.innerText="Disable"
btn.style.background="#64748b"

fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({disabled:false})
})

}

}

async function sendDispatch(id,val){

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
inDispatch:val
})
})

}

loadTrips()