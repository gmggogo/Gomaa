const API="/api/trips"

const body=document.getElementById("tripBody")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}

function renderTrips(){

body.innerHTML=""

trips.forEach((t,i)=>{

const tr=document.createElement("tr")

tr.innerHTML=`

<td>${i+1}</td>

<td>${t.tripNumber||""}</td>

<td>${t.type||""}</td>

<td>${t.company||""}</td>

<td>
<input class="entryName" disabled value="${t.entryName||""}">
</td>

<td>
<input class="entryPhone" disabled value="${t.entryPhone||""}">
</td>

<td>
<input class="client" disabled value="${t.client||""}">
</td>

<td>
<input class="clientPhone" disabled value="${t.clientPhone||""}">
</td>

<td>
<input class="pickup" disabled value="${t.pickup||""}">
</td>

<td>

<div class="stops">

${(t.stops||[]).map(s=>`

<div class="stop-row">
<input class="stop" disabled value="${s}">
</div>

`).join("")}

</div>

<button class="addStop" onclick="addStop(this)">
+ Stop
</button>

</td>

<td>
<input class="dropoff" disabled value="${t.dropoff||""}">
</td>

<td>
<textarea class="notes" disabled>${t.notes||""}</textarea>
</td>

<td>
<input class="date" disabled value="${t.date||""}">
</td>

<td>
<input class="time" disabled value="${t.time||""}">
</td>

<td>${t.status||""}</td>

<td class="actions">

<button class="btn edit"
onclick="editTrip('${t._id}',this)">
Edit
</button>

<button class="btn delete"
onclick="deleteTrip('${t._id}')">
Delete
</button>

</td>

`

body.appendChild(tr)

})

}

function addStop(btn){

const stopsDiv=btn.parentElement.querySelector(".stops")

const row=document.createElement("div")
row.className="stop-row"

row.innerHTML=`
<input class="stop">
`

stopsDiv.appendChild(row)

}

async function editTrip(id,btn){

const row=btn.closest("tr")

const inputs=row.querySelectorAll("input,textarea")

if(btn.innerText==="Edit"){

inputs.forEach(i=>i.disabled=false)

btn.innerText="Save"

return
}

const payload={

entryName:row.querySelector(".entryName").value,
entryPhone:row.querySelector(".entryPhone").value,

client:row.querySelector(".client").value,
clientPhone:row.querySelector(".clientPhone").value,

pickup:row.querySelector(".pickup").value,
dropoff:row.querySelector(".dropoff").value,

notes:row.querySelector(".notes").value,

date:row.querySelector(".date").value,
time:row.querySelector(".time").value,

stops:Array.from(row.querySelectorAll(".stop"))
.map(s=>s.value)
.filter(Boolean)

}

await fetch(API+"/"+id,{
method:"PUT",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify(payload)
})

inputs.forEach(i=>i.disabled=true)

btn.innerText="Edit"

loadTrips()

}

async function deleteTrip(id){

if(!confirm("Delete trip?")) return

await fetch(API+"/"+id,{
method:"DELETE"
})

loadTrips()

}

loadTrips()