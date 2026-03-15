const API="/api/trips"

const container=document.getElementById("tripsContainer")

let trips=[]

/* ===============================
   ARIZONA TIME
================================ */

function getArizonaTime(){

return new Date(
new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
)

}

function formatArizonaDate(dateObj){

return dateObj.toLocaleDateString("en-CA",{timeZone:"America/Phoenix"})

}

/* ===============================
   LOAD TRIPS
================================ */

async function loadTrips(){

try{

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}catch(err){

console.error("Trips Load Error",err)

}

}

/* ===============================
   GET TODAY / TOMORROW
================================ */

function getDates(){

const now=getArizonaTime()

const today=new Date(now)
today.setHours(0,0,0,0)

const tomorrow=new Date(today)
tomorrow.setDate(today.getDate()+1)

return{today,tomorrow}

}

/* ===============================
   GROUP TRIPS
================================ */

function groupTrips(){

const {today,tomorrow}=getDates()

const groups={
today:[],
tomorrow:[]
}

trips.forEach(t=>{

const date=t.tripDate || t.date
if(!date) return

const parts=date.split("-")

const d=new Date(
Number(parts[0]),
Number(parts[1])-1,
Number(parts[2])
)

d.setHours(0,0,0,0)

if(d.getTime()===today.getTime())
groups.today.push(t)

else if(d.getTime()===tomorrow.getTime())
groups.tomorrow.push(t)

})

return groups

}

/* ===============================
   ROW COLORS
================================ */

function rowColor(type){

type=(type||"").toLowerCase()

if(type==="company") return "row-company"
if(type==="individual") return "row-individual"
if(type==="reserved") return "row-reserved"

return ""

}

/* ===============================
   RENDER TRIPS
================================ */

function renderTrips(){

if(!container) return

container.innerHTML=""

const groups=groupTrips()
const {today,tomorrow}=getDates()

drawGroup("Today – "+formatArizonaDate(today),groups.today)
drawGroup("Tomorrow – "+formatArizonaDate(tomorrow),groups.tomorrow)

}

/* ===============================
   DRAW TABLE
================================ */

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
<th>Entry Name</th>
<th>Entry Phone</th>
<th>Client</th>
<th>Client Phone</th>
<th>Pickup</th>
<th>Stops</th>
<th>Dropoff</th>
<th>Date</th>
<th>Time</th>
<th>Notes</th>
<th>Status</th>
<th>Actions</th>

</tr>

`

if(!list.length){

const row=document.createElement("tr")
row.innerHTML=\`<td colspan="17" style="text-align:center;padding:20px">No Trips</td>\`
table.appendChild(row)

}else{

list.forEach((t,i)=>{

const tr=document.createElement("tr")
tr.className=rowColor(t.type)

tr.innerHTML=\`

<td>
<input class="dispatch-check" type="checkbox"
\${t.inDispatch?"checked":""}
onchange="sendDispatch('\${t._id}',this.checked)">
</td>

<td>\${i+1}</td>

<td>\${t.tripNumber||""}</td>
<td>\${t.type||""}</td>
<td>\${t.company||""}</td>

<td><input class="edit-field entryName" disabled value="\${t.entryName||""}"></td>
<td><input class="edit-field entryPhone" disabled value="\${t.entryPhone||""}"></td>

<td><input class="edit-field clientName" disabled value="\${t.clientName||""}"></td>
<td><input class="edit-field clientPhone" disabled value="\${t.clientPhone||""}"></td>

<td><input class="edit-field pickup" disabled value="\${t.pickup||""}"></td>

<td>

<div class="stops">

\${(t.stops||[]).map(s=>\`
<div class="stop-row">
<input class="stop edit-field" disabled value="\${s}">
<span class="stop-remove" onclick="removeStop(this)">✖</span>
</div>
\`).join("")}

</div>

<button class="add-stop" onclick="addStop(this)">+ Stop</button>

</td>

<td><input class="edit-field dropoff" disabled value="\${t.dropoff||""}"></td>

<td><input class="edit-field tripDate" disabled value="\${t.tripDate||""}"></td>

<td><input class="edit-field tripTime" disabled value="\${t.tripTime||""}"></td>

<td><input class="edit-field notes" disabled value="\${t.notes||""}"></td>

<td>\${t.status||"Confirmed"}</td>

<td class="actions">

<button class="btn btn-edit"
onclick="editTrip('\${t._id}',this)">
Edit
</button>

<button class="btn btn-disable"
onclick="toggleTrip('\${t._id}',this)">
Disable
</button>

<button class="btn btn-delete"
onclick="deleteTrip('\${t._id}')">
Delete
</button>

</td>

\`

table.appendChild(tr)

})

}

wrapper.appendChild(table)
container.appendChild(wrapper)

}

/* ===============================
   STOPS
================================ */

function addStop(btn){

const stopsDiv=btn.parentElement.querySelector(".stops")

const count=stopsDiv.querySelectorAll(".stop-row").length

if(count>=5){
alert("Maximum 5 stops")
return
}

const row=document.createElement("div")
row.className="stop-row"

row.innerHTML=\`
<input class="stop edit-field" disabled placeholder="Stop address">
<span class="stop-remove" onclick="removeStop(this)">✖</span>
\`

stopsDiv.appendChild(row)

}

function removeStop(el){
el.closest(".stop-row").remove()
}

/* ===============================
   EDIT TRIP
================================ */

async function editTrip(id,btn){

const row=btn.closest("tr")
const fields=row.querySelectorAll(".edit-field")

if(btn.innerText==="Edit"){

fields.forEach(f=>f.disabled=false)

btn.innerText="Save"
return

}

const payload={

entryName:row.querySelector(".entryName")?.value||"",
entryPhone:row.querySelector(".entryPhone")?.value||"",
clientName:row.querySelector(".clientName")?.value||"",
clientPhone:row.querySelector(".clientPhone")?.value||"",
pickup:row.querySelector(".pickup")?.value||"",
dropoff:row.querySelector(".dropoff")?.value||"",
tripDate:row.querySelector(".tripDate")?.value||"",
tripTime:row.querySelector(".tripTime")?.value||"",
notes:row.querySelector(".notes")?.value||"",

stops:Array.from(row.querySelectorAll(".stop"))
.map(s=>s.value.trim())
.filter(Boolean)

}

await fetch(API+"/"+id,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify(payload)
})

fields.forEach(f=>f.disabled=true)

btn.innerText="Edit"

loadTrips()

}

/* ===============================
   DELETE
================================ */

async function deleteTrip(id){

if(!confirm("Delete trip?")) return

await fetch(API+"/"+id,{method:"DELETE"})

loadTrips()

}

/* ===============================
   DISABLE
================================ */

async function toggleTrip(id,btn){

const row=btn.closest("tr")

if(btn.innerText==="Disable"){

row.style.opacity="0.5"
btn.innerText="Enable"

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
disabled:true,
inDispatch:false
})
})

}else{

row.style.opacity="1"
btn.innerText="Disable"

await fetch(API+"/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
disabled:false
})
})

}

}

/* ===============================
   DISPATCH
================================ */

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

/* refresh table */

loadTrips()

}

/* ===============================
   START
================================ */

loadTrips()