const API_DRIVERS="/api/admin/users?role=driver"

const tbody=document.getElementById("tbody")

/* STORAGE */

const STORAGE_KEY="driverSchedule"
let schedule=JSON.parse(localStorage.getItem(STORAGE_KEY))||{}

/* ARIZONA DATE */

function azDate(d=new Date()){

return new Date(
d.toLocaleString("en-US",{timeZone:"America/Phoenix"})
)

}

/* BUILD WEEK */

function buildWeek(){

const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

const start=azDate()

const week=[]

for(let i=0;i<7;i++){

const d=new Date(start)
d.setDate(start.getDate()+i)

week.push({

label:days[d.getDay()],
key:d.toISOString().slice(0,10),
date:`${d.getMonth()+1}/${d.getDate()}`

})

}

document.getElementById("weekTitle").innerText=
`Week: ${week[0].date} → ${week[6].date} (Arizona)`

return week

}

const WEEK=buildWeek()

/* LOAD DRIVERS */

async function loadDrivers(){

const res=await fetch(API_DRIVERS)

if(!res.ok) throw new Error("drivers failed")

return await res.json()

}

/* SAVE */

function save(){

localStorage.setItem(STORAGE_KEY,JSON.stringify(schedule))

localStorage.setItem(
"driverScheduleForMap",
JSON.stringify(schedule)
)

}

/* RENDER */

async function render(){

tbody.innerHTML=""

let drivers=[]

try{

drivers=await loadDrivers()

}catch{

tbody.innerHTML="<tr><td colspan='7'>Failed to load drivers</td></tr>"
return

}

drivers.forEach((d,i)=>{

const id=d._id||d.id

if(!schedule[id]){

schedule[id]={
phone:"",
address:"",
days:{},
enabled:true,
edit:false
}

}

const s=schedule[id]

const todayKey=azDate().toISOString().slice(0,10)

const activeToday=s.enabled && !!s.days[todayKey]

const tr=document.createElement("tr")

if(!s.enabled) tr.classList.add("row-disabled")

tr.innerHTML=`

<td>${i+1}</td>

<td><strong>${d.name}</strong></td>

<td>
<input
value="${s.phone}"
${!s.edit?"disabled":""}
onchange="schedule['${id}'].phone=this.value">
</td>

<td>
<input
value="${s.address}"
${!s.edit?"disabled":""}
onchange="schedule['${id}'].address=this.value">
</td>

<td>

<div class="week-box">

${WEEK.map(w=>{

const checked=!!s.days[w.key]

return`

<div
class="day-box ${checked?"active":""}"
onclick="toggleDay('${id}','${w.key}')"
>

${w.label}<br>${w.date}

</div>

`

}).join("")}

</div>

</td>

<td style="font-weight:bold;color:${activeToday?"#16a34a":"#dc2626"}">

${activeToday?"ACTIVE":"NOT ACTIVE"}

</td>

<td>

${

s.edit

?

`<button class="action-btn save" onclick="saveDriver('${id}')">Save</button>`

:

`<button class="action-btn edit" onclick="editDriver('${id}')">Edit</button>`

}

<button
class="action-btn ${s.enabled?"disable":"enable"}"
onclick="toggleEnable('${id}')"
>

${s.enabled?"Disable":"Enable"}

</button>

</td>

`

tbody.appendChild(tr)

})

save()

}

/* ACTIONS */

function editDriver(id){

schedule[id].edit=true
render()

}

function saveDriver(id){

schedule[id].edit=false
save()
render()

}

function toggleEnable(id){

schedule[id].enabled=!schedule[id].enabled
save()
render()

}

function toggleDay(id,key){

if(!schedule[id].edit) return

schedule[id].days[key]=!schedule[id].days[key]

save()
render()

}

/* INIT */

render()