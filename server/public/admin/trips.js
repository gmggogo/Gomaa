const API="/api/trips"

const container=document.getElementById("tripsContainer")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}

function getDates(){

const now=new Date()

const today=new Date(now)
today.setHours(0,0,0,0)

const tomorrow=new Date(today)
tomorrow.setDate(today.getDate()+1)

return{today,tomorrow}

}

function groupTrips(){

const {today,tomorrow}=getDates()

const groups={today:[],tomorrow:[]}

const now=new Date()

trips.forEach(t=>{

if(!t.tripDate) return

const tripTime=new Date(t.tripDate+" "+t.tripTime)

if(tripTime < now) return

const d=new Date(t.tripDate)
d.setHours(0,0,0,0)

if(d.getTime()===today.getTime())
groups.today.push(t)

if(d.getTime()===tomorrow.getTime())
groups.tomorrow.push(t)

})

return groups

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

const groups=groupTrips()

const {today,tomorrow}=getDates()

drawGroup(
"Today – "+today.toDateString(),
groups.today
)

drawGroup(
"Tomorrow – "+tomorrow.toDateString(),
groups.tomorrow
)

}

function drawGroup(title,list){

if(!list.length) return

const header=document.createElement("div")
header.className="group-title"
header.innerText=title

container.appendChild(header)

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
<th>Client Phone</th>
<th>Pickup</th>
<th>Stops</th>
<th>Dropoff</th>
<th>Date</th>
<th>Time</th>
<th>Status</th>
<th>Actions</th>

</tr>

`

list.forEach((t,i)=>{

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

<div class="actions">

<button class="btn btn-edit"
onclick="editTrip('${t._id}',this)">
Edit
</button>

<button class="btn btn-delete"
onclick="deleteTrip('${t._id}')">
Delete
</button>

<button class="btn btn-disable"
onclick="disableTrip('${t._id}')">
Disable
</button>

</div>

</td>

`

table.appendChild(tr)

})

container.appendChild(table)

}

function addStop(btn){

const stopsDiv=btn.parentElement.querySelector(".stops")

const count=stopsDiv.querySelectorAll("input").length

if(count>=5) return

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

if(!confirm("Delete trip?")) return

await fetch(API+"/"+id,{method:"DELETE"})
loadTrips()

}

async function disableTrip(id){

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({disabled:true})
})

loadTrips()

}

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