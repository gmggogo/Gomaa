const API_DRIVERS="/api/drivers"
const API_SCHEDULE="/api/driver-schedule"

let schedule={}
let drivers=[]

const tbody=document.getElementById("tbody")

/* ================= GEO ================= */
async function geocode(address){

  try{

    const url=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

    const res=await fetch(url,{
      headers:{ "User-Agent":"sunbeam-app" }
    })

    const data=await res.json()

    if(!data.length) return null

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    }

  }catch(err){
    console.log("GEOCODE ERROR",err)
    return null
  }

}

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

  document.getElementById("weekTitle").innerText =
  `Week ${week[0].date} → ${week[6].date}`

  return week
}

const WEEK=buildWeek()

/* ================= LOAD ================= */
async function loadDrivers(){
  const res=await fetch(API_DRIVERS)
  const data=await res.json()
  drivers = Array.isArray(data)?data:data.drivers||[]
}

async function loadSchedule(){
  const res=await fetch(API_SCHEDULE)
  schedule = res.ok ? await res.json() : {}
}

/* ================= SAVE ================= */
async function save(){

  const clean={}

  for(const id in schedule){

    clean[id]={
      phone:schedule[id].phone||"",
      address:schedule[id].address||"",
      lat:schedule[id].lat||"",
      lng:schedule[id].lng||"",
      vehicleNumber:schedule[id].vehicleNumber||"",
      enabled:schedule[id].enabled===true,
      days:schedule[id].days||{}
    }

  }

  await fetch(API_SCHEDULE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(clean)
  })

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
        lat:"",
        lng:"",
        vehicleNumber:"",
        days:{},
        enabled:true,
        edit:false
      }
    }

    const s=schedule[id]

    const tr=document.createElement("tr")

    tr.innerHTML=`

<td>${i+1}</td>

<td><strong>${d.name||d.fullName||"-"}</strong></td>

<td>
<input value="${s.vehicleNumber||""}"
${!s.edit?"disabled":""}
oninput="schedule['${id}'].vehicleNumber=this.value">
</td>

<td>
<input value="${s.phone||""}"
${!s.edit?"disabled":""}
oninput="schedule['${id}'].phone=this.value">
</td>

<td>
<input value="${s.address||""}"
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
<div>${w.label}</div>
<div>${w.date}</div>
</div>`
}).join("")}
</div>
</td>

<td style="font-weight:bold;color:${s.enabled?'#16a34a':'#dc2626'}">
${s.enabled?'ACTIVE':'OFF'}
</td>

<td>

${
s.edit
? `<button class="action-btn save" onclick="saveDriver('${id}')">Save</button>`
: `<button class="action-btn edit" onclick="editDriver('${id}')">Edit</button>`
}

<button class="action-btn ${s.enabled?'disable':'enable'}"
onclick="toggleEnable('${id}')">
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

  const s=schedule[id]

  // 🔥 تحويل العنوان لاحداثيات
  if(s.address){

    const geo=await geocode(s.address)

    if(geo){
      s.lat=geo.lat
      s.lng=geo.lng
    }else{
      alert("Address not valid ❌")
      return
    }

  }

  s.edit=false

  await save()
  render()

}

async function toggleEnable(id){
  schedule[id].enabled=!schedule[id].enabled
  await save()
  render()
}

function squareToggle(id,key,el){

  const s=schedule[id]

  if(!s.edit) return

  s.days[key]=!s.days[key]
  el.classList.toggle("active")

}

/* ================= INIT ================= */
async function init(){
  await loadDrivers()
  await loadSchedule()
  render()
}

init()