const API_DRIVERS="/api/users/driver"
const API_SCHEDULE="/api/driver-schedule"

let schedule={}

const tbody=document.getElementById("tbody")

function azDate(d=new Date()){
return new Date(d.toLocaleString("en-US",{timeZone:"America/Phoenix"}))
}

function buildWeek(){

const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

const start=azDate()

const week=[]

for(let i=0;i<7;i++){

const d=new Date(start)
d.setDate(start.getDate()+i)

const key=d.toLocaleDateString("en-CA",{timeZone:"America/Phoenix"})

week.push({
label:days[d.getDay()],
key:key,
date:`${d.getMonth()+1}/${d.getDate()}`
})

}

document.getElementById("weekTitle").innerText=
`Week ${week[0].date} → ${week[6].date} (Arizona)`

return week
}

const WEEK=buildWeek()

async function loadDrivers(){

const res=await fetch(API_DRIVERS)
return await res.json()

}

/* LOAD SCHEDULE FROM SERVER */

async function loadSchedule(){

const res=await fetch(API_SCHEDULE)

if(res.ok){
schedule=await res.json()
}else{
schedule={}
}

}

/* SAVE SCHEDULE TO SERVER */

async function save(){

await fetch(API_SCHEDULE,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(schedule)
})

}

async function render(){

tbody.innerHTML=""

const drivers=await loadDrivers()

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

const todayKey=new Date().toLocaleDateString("en-CA",{timeZone:"America/Phoenix"})

const activeToday=s.enabled && s.days[todayKey]

const tr=document.createElement("tr")

if(!s.enabled){
tr.style.opacity="0.35"
}

tr.innerHTML=`

<td>${i+1}</td>

<td><strong>${d.name||""}</strong></td>

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
class="day-square ${checked?'active':''}"
onclick="squareToggle(event,'${id}','${w.key}')"
>

<input
type="checkbox"
${checked?'checked':''}
${(!s.edit||!s.enabled)?'disabled':''}
style="margin-bottom:2px; transform:scale(.8)"
>

<div>${w.label}</div>
<div>${w.date}</div>

</div>

`

}).join("")}

</div>

</td>

<td style="font-weight:bold;color:${activeToday?'#16a34a':'#dc2626'}">

${activeToday?'ACTIVE':'NOT ACTIVE'}

</td>

<td>

${
s.edit
? `<button class="action-btn save" onclick="saveDriver('${id}')">Save</button>`
: `<button class="action-btn edit" onclick="editDriver('${id}')">Edit</button>`
}

<button
class="action-btn ${s.enabled?'disable':'enable'}"
onclick="toggleEnable('${id}')">

${s.enabled?'Disable':'Enable'}

</button>

</td>

`

tbody.appendChild(tr)

})

}

function editDriver(id){

schedule[id].edit=true
render()

}

async function saveDriver(id){

schedule[id].edit=false

await save()

render()

}

async function toggleEnable(id){

schedule[id].enabled=!schedule[id].enabled

await save()

render()

}

async function squareToggle(e,id,key){

const box=e.currentTarget
const chk=box.querySelector("input")

if(chk.disabled) return

chk.checked=!chk.checked

schedule[id].days[key]=chk.checked

box.classList.toggle("active",chk.checked)

await save()

}

/* INIT */

async function init(){

await loadSchedule()
render()

}

init()