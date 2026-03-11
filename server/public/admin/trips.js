const API="/api/trips"
const container=document.getElementById("tripsContainer")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}

/* اليوم وبكرة */

function getDates(){

const now=new Date()

const today=new Date(now)
today.setHours(0,0,0,0)

const tomorrow=new Date(today)
tomorrow.setDate(today.getDate()+1)

return{today,tomorrow}

}

/* تجميع الرحلات */

function groupTrips(){

const {today,tomorrow}=getDates()

const groups={
today:[],
tomorrow:[]
}

trips.forEach(t=>{

if(!t.date) return

const d=new Date(t.date)
d.setHours(0,0,0,0)

if(d.getTime()===today.getTime())
groups.today.push(t)

if(d.getTime()===tomorrow.getTime())
groups.tomorrow.push(t)

})

return groups

}

/* لون الصف */

function rowColor(type){

type=(type||"").toLowerCase()

if(type==="company") return "row-company"
if(type==="individual") return "row-individual"
if(type==="reserved") return "row-reserved"

return ""

}

/* رسم الصفحة */

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
<input class="dispatch-check"
type="checkbox"
${t.dispatch?"checked":""}
onchange="sendDispatch('${t._id}',this.checked)">
</td>

<td>${i+1}</td>

<td>${t.tripNumber||""}</td>
<td>${t.type||""}</td>
<td>${t.company||""}</td>

<td>
<input class="edit-field" value="${t.client||""}">
</td>

<td>
<input class="edit-field" value="${t.clientPhone||""}">
</td>

<td>
<input class="edit-field" value="${t.pickup||""}">
</td>

<td>

<div class="stops">

${(t.stops||[]).map(s=>`
<input class="stop edit-field" value="${s}">
`).join("")}

</div>

<button class="add-stop" onclick="addStop(this)">+ Stop</button>

</td>

<td>
<input class="edit-field" value="${t.dropoff||""}">
</td>

<td>
<input class="edit-field" value="${t.date||""}">
</td>

<td>
<input class="edit-field" value="${t.time||""}">
</td>

<td>${t.status||"Confirmed"}</td>

<td>

<button class="btn btn-edit"
onclick="editTrip(this)">
Edit
</button>

<button class="btn btn-delete"
onclick="deleteTrip('${t._id}')">
Delete
</button>

<button class="btn btn-disable"
onclick="toggleTrip(this)">
Disable
</button>

</td>
`

table.appendChild(tr)

})

wrapper.appendChild(table)
container.appendChild(wrapper)

}

/* Disable */

function toggleTrip(btn){

const row=btn.closest("tr")

const elements=row.querySelectorAll("input,button")

if(btn.innerText==="Disable"){

elements.forEach(el=>{
if(el!==btn) el.disabled=true
})

row.style.opacity="0.5"

btn.innerText="Enable"
btn.style.background="#16a34a"

}else{

elements.forEach(el=>el.disabled=false)

row.style.opacity="1"

btn.innerText="Disable"
btn.style.background="#64748b"
}

}

loadTrips()