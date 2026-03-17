const API_DRIVERS="/api/drivers"
const API_SCHEDULE="/api/driver-schedule"

let schedule={}
let drivers=[]

const tbody=document.getElementById("tbody")

/* ================= AZ DATE ================= */
function azDate(d=new Date()){
  return new Date(d.toLocaleString("en-US",{timeZone:"America/Phoenix"}))
}

/* ================= WEEK ================= */
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

/* ================= LOAD ================= */
async function loadDrivers(){
  const res=await fetch(API_DRIVERS)
  const data=await res.json()

  // 🔥 نحمي نفسنا من أي فورمات
  drivers = Array.isArray(data) ? data : data.drivers || []
}

async function loadSchedule(){
  const res=await fetch(API_SCHEDULE)
  schedule=res.ok?await res.json():{}
}

/* ================= SAVE ================= */
async function save(){
  await fetch(API_SCHEDULE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(schedule)
  })
}

/* ================= HELPERS ================= */
function getDriverName(d){
  return d.name || d.fullName || d.username || "-"
}

function getVehicle(d){
  return d.vehicleNumber || d.car || d.vehicle || d.carNumber || "-"
}

/* ================= RENDER ================= */
function render(){

  tbody.innerHTML=""

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

    const todayKey=azDate().toLocaleDateString("en-CA")
    const activeToday=s.enabled && s.days[todayKey]

    const tr=document.createElement("tr")

    if(!s.enabled){
      tr.style.opacity="0.4"
    }

    tr.innerHTML=`

<td>${i+1}</td>

<td><strong>${getDriverName(d)}</strong></td>

<td>
<input
value="${getVehicle(d)}"
disabled
>
</td>

<td>
<input
value="${s.phone||""}"
${!s.edit?"disabled":""}
oninput="schedule['${id}'].phone=this.value">
</td>

<td>
<input
value="${s.address||""}"
${!s.edit?"disabled":""}
oninput="schedule['${id}'].address=this.value">
</td>

<td>

<div class="week-box">

${WEEK.map(w=>{

const checked=!!s.days[w.key]

return`

<div class="day-square ${checked?'active':''}"
onclick="squareToggle('${id}','${w.key}',this)">

<input type="checkbox"
${checked?'checked':''}
${(!s.edit||!s.enabled)?'disabled':''}
style="display:none">

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
? `<button class="btn-save" onclick="saveDriver('${id}')">Save</button>`
: `<button class="btn-edit" onclick="editDriver('${id}')">Edit</button>`
}

<button class="btn-toggle" onclick="toggleEnable('${id}')">
${s.enabled?'Disable':'Enable'}
</button>

</td>

`

    tbody.appendChild(tr)

  })

}

/* ================= ACTIONS ================= */
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

async function squareToggle(id,key,el){

  const s=schedule[id]
  if(!s.edit || !s.enabled) return

  s.days[key]=!s.days[key]

  el.classList.toggle("active", s.days[key])

  await save()
}

/* ================= INIT ================= */
async function init(){
  await loadDrivers()
  await loadSchedule()
  render()
}

init()