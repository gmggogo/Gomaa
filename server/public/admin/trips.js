const API="/api/trips"

const container=document.getElementById("tripsContainer")

let trips=[]

/* ============================
   ARIZONA TIME
============================ */

function getArizonaTime(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  )
}

function formatArizonaDate(dateObj){
  return dateObj.toLocaleDateString("en-CA",{
    timeZone:"America/Phoenix"
  })
}

/* ============================
   LOAD TRIPS
============================ */

async function loadTrips(){

  const res=await fetch(API)
  const data=await res.json()

  trips=data||[]

  renderTrips()

}

/* ============================
   DATES
============================ */

function getDates(){

  const now=getArizonaTime()

  const today=new Date(now)
  today.setHours(0,0,0,0)

  const tomorrow=new Date(today)
  tomorrow.setDate(today.getDate()+1)

  return{today,tomorrow}

}

/* ============================
   GROUP
============================ */

function groupTrips(){

  const {today,tomorrow}=getDates()

  const groups={
    today:[],
    tomorrow:[]
  }

  trips.forEach(t=>{

    const date=t.tripDate||t.date
    if(!date) return

    const d=new Date(
      new Date(date).toLocaleString("en-US",{timeZone:"America/Phoenix"})
    )

    d.setHours(0,0,0,0)

    if(d.getTime()===today.getTime()) groups.today.push(t)
    else if(d.getTime()===tomorrow.getTime()) groups.tomorrow.push(t)

  })

  return groups

}

/* ============================
   ROW COLOR
============================ */

function rowColor(type){

  type=(type||"").toLowerCase()

  if(type==="company") return "row-company"
  if(type==="individual") return "row-individual"
  if(type==="reserved") return "row-reserved"

  return ""

}

/* ============================
   RENDER
============================ */

function renderTrips(){

  container.innerHTML=""

  const groups=groupTrips()
  const {today,tomorrow}=getDates()

  drawGroup(
    "Today – "+formatArizonaDate(today),
    groups.today
  )

  drawGroup(
    "Tomorrow – "+formatArizonaDate(tomorrow),
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
<th>Notes</th>
<th>Actions</th>

</tr>

`

  if(!list.length){

    const row=document.createElement("tr")

    row.innerHTML=`<td colspan="15" style="text-align:center;padding:20px">No Trips</td>`

    table.appendChild(row)

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
<input class="edit-field clientName" disabled value="${t.clientName||""}">
</td>

<td>
<input class="edit-field clientPhone" disabled value="${t.clientPhone||""}">
</td>

<td>
<input class="edit-field pickup" disabled value="${t.pickup||""}">
</td>

<td>

<div class="stops">

${(t.stops||[]).map(s=>`
<div class="stop-row">
<input class="stop edit-field" disabled value="${s}">
<span class="stop-remove" onclick="removeStop(this)">✖</span>
</div>
`).join("")}

</div>

<button class="add-stop" onclick="addStop(this)">+ Stop</button>

</td>

<td>
<input class="edit-field dropoff" disabled value="${t.dropoff||""}">
</td>

<td>
<input class="edit-field tripDate" disabled value="${t.tripDate||""}">
</td>

<td>
<input class="edit-field tripTime" disabled value="${t.tripTime||""}">
</td>

<td>${t.status||"Confirmed"}</td>

<td>
<textarea class="edit-field notes" disabled>${t.notes||""}</textarea>
</td>

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

loadTrips()