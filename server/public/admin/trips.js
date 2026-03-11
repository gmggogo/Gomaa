const API="/api/trips"
const container=document.getElementById("tripsContainer")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

render()

}

function getDates(){

const now=new Date(
new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
)

const today=new Date(now)
today.setHours(0,0,0,0)

const tomorrow=new Date(today)
tomorrow.setDate(today.getDate()+1)

return{today,tomorrow}

}

function groupTrips(){

const {today,tomorrow}=getDates()

const groups={
today:[],
tomorrow:[]
}

trips.forEach(t=>{

if(!t.tripDate)return

const d=new Date(t.tripDate)
d.setHours(0,0,0,0)

if(d.getTime()===today.getTime())groups.today.push(t)

if(d.getTime()===tomorrow.getTime())groups.tomorrow.push(t)

})

return groups

}

function rowColor(type){

type=(type||"").toLowerCase()

if(type==="company")return"row-company"
if(type==="individual")return"row-individual"
if(type==="reserved")return"row-reserved"

return""

}

function render(){

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

if(!list.length)return

const h=document.createElement("div")
h.className="group-title"
h.innerText=title

container.appendChild(h)

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

list.forEach((t,i)=>{

const stops=(t.stops||[]).join(" → ")

const tr=document.createElement("tr")

tr.className=rowColor(t.type)

tr.innerHTML=`

<td>

<input type="checkbox"
${t.disabled?"disabled":""}
${t.inDispatch?"checked":""}
onchange="sendDispatch('${t._id}',this.checked)">

</td>

<td>${i+1}</td>

<td>${t.tripNumber||""}</td>

<td>${t.type||""}</td>

<td>${t.company||""}</td>

<td>${t.clientName||""}</td>

<td>${t.clientPhone||""}</td>

<td>${t.pickup||""}</td>

<td>${stops}</td>

<td>${t.dropoff||""}</td>

<td>${t.tripDate||""}</td>

<td>${t.tripTime||""}</td>

<td>Confirmed</td>

<td>

<div class="actions">

<button class="btn btn-edit"
onclick="editTrip('${t._id}')">
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

async function disableTrip(id){

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
disabled:true
})
})

loadTrips()

}

async function deleteTrip(id){

if(!confirm("Delete trip?"))return

await fetch(API+"/"+id,{
method:"DELETE"
})

loadTrips()

}

function editTrip(id){

location.href="edit-trip.html?id="+id

}

loadTrips()