const API_URL="/api/trips"

let hubTrips=[]

const container=document.getElementById("hubContainer")
const searchInput=document.getElementById("searchInput")
const addBtn=document.getElementById("addManualTripBtn")

/* LOAD */

async function loadHubTrips(){

try{

const res=await fetch(API_URL)
const data=await res.json()

hubTrips=Array.isArray(data)?data:[]

}catch{

hubTrips=[]

}

}

/* FORMAT DATE */

function formatDate(iso){

if(!iso)return "-"

const d=new Date(iso)

return d.toLocaleDateString()+" "+
d.toLocaleTimeString([],{
hour:"2-digit",
minute:"2-digit"
})

}

/* GET TRIP NUMBER */

function getTripNumber(t){

if(t.tripNumber)return t.tripNumber
if(t.id)return t.id
if(t.bookingNumber)return t.bookingNumber

return "-"

}

/* COLORS */

function rowColor(tr,t){

if(t.type==="Individual"){
tr.style.backgroundColor="#e8f4ff"
}

else if(t.type==="Company"){
tr.style.backgroundColor="#fff6d6"
}

else if(t.type==="Reserved"){
tr.style.backgroundColor="#ecfdf5"
}

}

/* NEXT RESERVED */

function nextReservedNumber(){

const key="lastReservedRE"

let last=parseInt(localStorage.getItem(key)||"1000",10)

last++

localStorage.setItem(key,last)

return "RE-"+last

}

/* ADD RESERVED */

async function addReservedTripInline(){

const newTrip={

tripNumber:nextReservedNumber(),

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

createdAt:new Date().toISOString(),
bookedAt:new Date().toISOString()

}

await fetch(API_URL,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(newTrip)
})

await loadHubTrips()
render()

}

if(addBtn){

addBtn.addEventListener("click",async function(){

const ok=confirm(
"Warning:\nOnly Admin or Dispatcher should create Reserved Trips.\nContinue?"
)

if(!ok)return

await addReservedTripInline()

})

}

/* EDIT */

function editTripConfirm(tripNumber){

const row=document.querySelector(`[data-trip="${tripNumber}"]`)

const inputs=row.querySelectorAll("input,textarea")

inputs.forEach(el=>{
if(el.disabled)el.disabled=false
})

}

/* SAVE */

async function saveTripConfirm(tripNumber){

const row=document.querySelector(`[data-trip="${tripNumber}"]`)

const inputs=row.querySelectorAll("input,textarea")

const updatedTrip={

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

await fetch(API_URL+"/"+tripNumber,{

method:"PUT",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(updatedTrip)

})

await loadHubTrips()
render()

}

/* DELETE */

async function deleteTripConfirm(tripNumber){

const ok=confirm("Delete this trip?")

if(!ok)return

await fetch(API_URL+"/"+tripNumber,{method:"DELETE"})

await loadHubTrips()
render()

}

/* RENDER */

function render(){

container.innerHTML=""

if(!hubTrips.length){

container.innerHTML="<p>No trips found</p>"
return

}

const table=document.createElement("table")

table.className="hub-table"

table.innerHTML=`

<thead>
<tr>

<th>#</th>
<th>Trip #</th>
<th>Type</th>

<th>Company</th>
<th>Entry Name</th>
<th>Entry Phone</th>

<th>Client</th>
<th>Client Phone</th>

<th>Pickup</th>
<th>Stops</th>
<th>Dropoff</th>

<th>Notes</th>

<th>Date</th>
<th>Time</th>

<th>Status</th>
<th>Booked At</th>

<th>Actions</th>

</tr>
</thead>

<tbody></tbody>
`

const tbody=table.querySelector("tbody")

hubTrips.forEach((t,i)=>{

const tr=document.createElement("tr")

rowColor(tr,t)

const tripNum=getTripNumber(t)

const stopsStr=Array.isArray(t.stops)?t.stops.join(" → "):""

tr.setAttribute("data-trip",tripNum)

tr.innerHTML=`

<td>${i+1}</td>

<td><input value="${tripNum}" disabled></td>

<td><input value="${t.type||""}" disabled></td>

<td><input value="${t.company||""}" disabled></td>

<td><input value="${t.entryName||""}" disabled></td>

<td><input value="${t.entryPhone||""}" disabled></td>

<td><input value="${t.clientName||""}" disabled></td>

<td><input value="${t.clientPhone||""}" disabled></td>

<td><input value="${t.pickup||""}" disabled></td>

<td><input value="${stopsStr}" disabled></td>

<td><input value="${t.dropoff||""}" disabled></td>

<td><textarea disabled>${t.notes||""}</textarea></td>

<td><input type="date" value="${t.tripDate||""}" disabled></td>

<td><input type="time" value="${t.tripTime||""}" disabled></td>

<td>${t.status||""}</td>

<td>${formatDate(t.bookedAt)}</td>

<td>

<button class="hub-btn edit-btn"
onclick="editTripConfirm('${tripNum}')">
Edit
</button>

<button class="hub-btn save-btn"
onclick="saveTripConfirm('${tripNum}')">
Save
</button>

<button class="hub-btn delete-btn"
onclick="deleteTripConfirm('${tripNum}')">
Delete
</button>

</td>

`

tbody.appendChild(tr)

})

container.appendChild(table)

}

/* SEARCH */

if(searchInput){

searchInput.addEventListener("input",function(){

const v=searchInput.value.toLowerCase()

const filtered=hubTrips.filter(t=>
JSON.stringify(t).toLowerCase().includes(v)
)

hubTrips=filtered

render()

})

}

/* AUTO REFRESH */

setInterval(async function(){

await loadHubTrips()
render()

},60000)

/* INIT */

(async function(){

await loadHubTrips()
render()

})()