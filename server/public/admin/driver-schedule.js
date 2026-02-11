/* =====================
   AUTH + ADMIN NAME
===================== */
const userRaw = localStorage.getItem("loggedUser");
if (!userRaw) location.href = "login.html";
const user = JSON.parse(userRaw);
document.getElementById("adminName").innerText = user.name;

/* =====================
   CONFIG
===================== */
const API = "/api/admin/users?role=driver";
const STORAGE_KEY = "driverSchedule";

/* =====================
   STATE
===================== */
let schedule = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
const tbody = document.getElementById("tbody");

/* =====================
   AZ DATE
===================== */
function azDate(d=new Date()){
  return new Date(d.toLocaleString("en-US",{timeZone:"America/Phoenix"}));
}

/* =====================
   BUILD WEEK (REAL DATES)
===================== */
function buildWeek(){
  const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const start=azDate();
  const week=[];
  for(let i=0;i<7;i++){
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    week.push({
      label:days[d.getDay()],
      key:d.toISOString().slice(0,10),
      date:`${d.getMonth()+1}/${d.getDate()}`
    });
  }
  document.getElementById("weekTitle").innerText=
    `Week: ${week[0].date} → ${week[6].date} (Arizona)`;
  return week;
}
const week=buildWeek();

/* =====================
   LOAD DRIVERS
===================== */
async function loadDrivers(){
  const res=await fetch(API);
  if(!res.ok) throw new Error("API failed");
  return await res.json();
}

/* =====================
   SAVE
===================== */
function save(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(schedule));
}

/* =====================
   RENDER
===================== */
async function render(){
  tbody.innerHTML="";
  let drivers=[];
  try{
    drivers=await loadDrivers();
  }catch{
    tbody.innerHTML=`<tr><td colspan="7">Failed to load drivers</td></tr>`;
    return;
  }

  const todayKey=azDate().toISOString().slice(0,10);

  drivers.forEach((d,i)=>{
    if(!schedule[d.id]){
      schedule[d.id]={ phone:"", address:"", days:{}, edit:false, enabled:true };
    }
    const s=schedule[d.id];

    const workingToday = s.days[todayKey] === true;
    const tr=document.createElement("tr");

    if(!s.enabled) tr.classList.add("disabled");

    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${d.name}</td>

      <td>
        <input value="${s.phone}" ${!s.edit||!s.enabled?"disabled":""}
          onchange="schedule[${d.id}].phone=this.value">
      </td>

      <td>
        <input value="${s.address}" ${!s.edit||!s.enabled?"disabled":""}
          onchange="schedule[${d.id}].address=this.value">
      </td>

      <td>
        <div class="week-box">
          ${week.map(w=>{
            const isOn=s.days[w.key];
            let cls="day-box";
            if(isOn) cls+=" day-on";
            if(w.key===todayKey) cls+=" day-today";
            return`
              <label class="${cls}">
                ${w.label} ${w.date}<br>
                <input type="checkbox"
                  ${isOn?"checked":""}
                  ${!s.edit||!s.enabled?"disabled":""}
                  onchange="schedule[${d.id}].days['${w.key}']=this.checked">
              </label>
            `;
          }).join("")}
        </div>
      </td>

      <td class="${workingToday?"status-active":"status-off"}">
        ${workingToday?"ACTIVE":"NOT ACTIVE"}
      </td>

      <td>
        ${
          s.edit && s.enabled
          ? `<button class="btn btn-save" onclick="saveRow(${d.id})">Save</button>`
          : `<button class="btn btn-edit" onclick="editRow(${d.id})" ${!s.enabled?"disabled":""}>Edit</button>`
        }
        ${
          s.enabled
          ? `<button class="btn btn-disable" onclick="toggleEnable(${d.id})">Disable</button>`
          : `<button class="btn btn-enable" onclick="toggleEnable(${d.id})">Enable</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
  save();
}

/* =====================
   ACTIONS
===================== */
function editRow(id){
  schedule[id].edit=true;
  render();
}

function saveRow(id){
  schedule[id].edit=false;
  save();
  render();
}

function toggleEnable(id){
  schedule[id].enabled=!schedule[id].enabled;
  save();
  render();
}

/* =====================
   LOGOUT
===================== */
function logout(){
  localStorage.removeItem("loggedUser");
  location.href="login.html";
}

/* =====================
   INIT
===================== */
render();