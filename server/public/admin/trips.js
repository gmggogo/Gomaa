const API="/api/trips"

const container=document.getElementById("tripsContainer")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}

/* dates */

function getDates(){

const now=new Date()

const today=new Date(now)
today.setHours(0,0,0,0)

const tomorrow=new Date(today)
tomorrow.setDate(today.getDate()+1)

return{today,tomorrow}

}

/* group */

function groupTrips(){

const {today,tomorrow}=getDates()

const groups={
today:[],
tomorrow:[]
}

trips.forEach(t=>{

const date=t.tripDate||t.date
if(!date) return

const d=new Date(date)
d.setHours(0,0,0,0)

if(d.getTime()===today.getTime())
groups.today.push(t)

if(d.getTime()===tomorrow.getTime())
groups.tomorrow.push(t)

})

return groups

}

/* row color */

function rowColor(type){

type=(type||"").toLowerCase()

if(type==="company") return "row-company"
if(type==="individual") return "row-individual"
if(type==="reserved") return "row-reserved"

return ""

}

/* render */

function renderTrips(){

container.innerHTML=""

const groups=groupTrips()
const {today,tomorrow}=getDates()

drawGroup(
"Today – "+today.toISOString().slice(0,10),
groups.today
)

drawGroup(
"Tomorrow – "+tomorrow.toISOString().slice(0,10),
groups.tomorrow
)

}

function drawGroup(title,list){

const header=document.createElement("div")
header.className="group-title"
header.innerText=title

container.appendChild(header)

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

if(!list.length){

const tr=document.createElement("tr")
tr.innerHTML=`<td colspan="14" style="text-align:center;padding:20px">No Trips</td>`
table.appendChild(tr)

}else{

list.forEach((t,i)=>{

const tr=document.createElement("tr")
tr.className=rowColor(t.type)

tr.innerHTML=`

<td>
<input class="dispatch-check" type="checkbox"
${t.inDispatch?"checked":""}
${t.disabled?"disabled":""}
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

}

wrapper.appendChild(table)
container.appendChild(wrapper)

}

/* stop */

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

/* edit */

function editTrip(id,btn){

const row=btn.closest("tr")
const fields=row.querySelectorAll(".edit-field")

if(btn.innerText==="Edit"){

fields.forEach(f=>f.disabled=false)

btn.innerText="Save"
return

}

fields.forEach(f=>f.disabled=true)

btn.innerText="Edit"

}

/* delete */

async function deleteTrip(id){

if(!confirm("Delete trip?")) return

await fetch(API+"/"+id,{method:"DELETE"})

loadTrips()

}

/* disable */

function toggleTrip(id,btn){

const row=btn.closest("tr")

const fields=row.querySelectorAll("input,button")

if(btn.innerText==="Disable"){

fields.forEach(f=>{
if(f!==btn) f.disabled=true
})

row.style.opacity="0.5"

btn.innerText="Enable"
btn.style.background="#16a34a"

fetch(API+"/"+id,{
method:"PUT",
headers:{ "Content-Type":"application/json"},
body:JSON.stringify({disabled:true})
})

}else{

fields.forEach(f=>f.disabled=false)

row.style.opacity="1"

btn.innerText="Disable"
btn.style.background="#64748b"

fetch(API+"/"+id,{
method:"PUT",
headers:{ "Content-Type":"application/json"},
body:JSON.stringify({disabled:false})
})

}

}

/* dispatch */

async function sendDispatch(id,val){

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({inDispatch:val})
})

}

loadTrips()