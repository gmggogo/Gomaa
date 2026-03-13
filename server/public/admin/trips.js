const API="/api/trips"

const container=document.getElementById("tripsContainer")

let trips=[]

async function loadTrips(){

const res=await fetch(API)
const data=await res.json()

trips=data||[]

renderTrips()

}

function renderTrips(){

container.innerHTML=""

drawGroup("Trips",trips)

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
<th>Notes</th>
<th>Actions</th>

</tr>

`

list.forEach((t,i)=>{

const tr=document.createElement("tr")

tr.innerHTML=`

<td>
<input type="checkbox"
${t.inDispatch?"checked":""}>
</td>

<td>${i+1}</td>

<td>${t.tripNumber||""}</td>
<td>${t.type||""}</td>
<td>${t.company||""}</td>

<td>
<input disabled value="${t.clientName||""}">
</td>

<td>
<input disabled value="${t.clientPhone||""}">
</td>

<td>
<input disabled value="${t.pickup||""}">
</td>

<td>${(t.stops||[]).join(", ")}</td>

<td>
<input disabled value="${t.dropoff||""}">
</td>

<td>
<input disabled value="${t.tripDate||""}">
</td>

<td>
<input disabled value="${t.tripTime||""}">
</td>

<td>${t.status||"Confirmed"}</td>

<td>
<textarea class="notes" disabled>${t.notes||""}</textarea>
</td>

<td>

<button class="btn btn-edit">
Edit
</button>

<button class="btn btn-delete">
Delete
</button>

<button class="btn btn-disable">
${t.disabled?"Enable":"Disable"}
</button>

</td>

`

table.appendChild(tr)

})

wrapper.appendChild(table)
container.appendChild(wrapper)

}

loadTrips()