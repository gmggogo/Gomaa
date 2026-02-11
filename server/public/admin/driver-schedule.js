/* ================= AUTH ================= */
const raw = localStorage.getItem("loggedUser");
if(!raw) location.href="login.html";
const admin = JSON.parse(raw);
document.getElementById("adminName").innerText = admin.name;

/* ================= CLOCK ================= */
function clock(){
  document.getElementById("clock").innerText =
    new Date().toLocaleDateString()+" | "+new Date().toLocaleTimeString();
}
setInterval(clock,1000); clock();

/* ================= STORAGE ================= */
const DRIVERS_KEY = "drivers";
const SCHEDULE_KEY = "driverSchedule";

const drivers = JSON.parse(localStorage.getItem(DRIVERS_KEY)) || [];
let schedule = JSON.parse(localStorage.getItem(SCHEDULE_KEY)) || {};
const tbody = document.getElementById("tbody");

/* ================= WEEK ================= */
function buildWeek(){
  const start = new Date();
  const days = [];
  const labels=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for(let i=0;i<7;i++){
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    days.push({
      key:d.toISOString().slice(0,10),
      label:`${labels[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`
    });
  }
  document.getElementById("weekTitle").innerText =
    `Week: ${days[0].label.split(" ")[1]} → ${days[6].label.split(" ")[1]} (Arizona)`;
  return days;
}
const week = buildWeek();

/* ================= SAVE ================= */
function save(){
  localStorage.setItem(SCHEDULE_KEY,JSON.stringify(schedule));
}

/* ================= RENDER ================= */
function render(){
  tbody.innerHTML="";

  drivers.forEach((d,i)=>{
    if(!schedule[d.id]){
      schedule[d.id]={
        phone:d.username||"",
        address:"",
        days:{},
        edit:false,
        enabled:true
      };
    }
    const s=schedule[d.id];
    const tr=document.createElement("tr");
    if(!s.enabled) tr.classList.add("row-disabled");

    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${d.name}</td>

      <td>
        <input value="${s.phone}"
        ${!s.edit?"disabled":""}
        onchange="schedule['${d.id}'].phone=this.value">
      </td>

      <td>
        <input value="${s.address}"
        ${!s.edit?"disabled":""}
        onchange="schedule['${d.id}'].address=this.value">
      </td>

      <td>
        <div class="week-box">
          ${week.map(w=>{
            const checked=s.days[w.key];
            return `
              <label class="day-box ${checked?"active":""}">
                ${w.label}<br>
                <input type="checkbox"
                  ${checked?"checked":""}
                  ${!s.edit?"disabled":""}
                  onchange="
                    schedule['${d.id}'].days['${w.key}']=this.checked;
                    render();
                  ">
              </label>`;
          }).join("")}
        </div>
      </td>

      <td>${isActiveToday(s)?"ACTIVE":"NOT ACTIVE"}</td>

      <td>
        ${
          s.edit
          ? `<button class="action-btn save" onclick="saveRow('${d.id}')">Save</button>`
          : `<button class="action-btn edit" onclick="editRow('${d.id}')">Edit</button>`
        }
        ${
          s.enabled
          ? `<button class="action-btn disable" onclick="toggle('${d.id}')">Disable</button>`
          : `<button class="action-btn enable" onclick="toggle('${d.id}')">Enable</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  save();
}

/* ================= LOGIC ================= */
function isActiveToday(s){
  const today=new Date().toISOString().slice(0,10);
  return s.enabled && s.days[today];
}

function editRow(id){
  schedule[id].edit=true;
  render();
}

function saveRow(id){
  schedule[id].edit=false;
  save();
  render();
}

function toggle(id){
  schedule[id].enabled=!schedule[id].enabled;
  save();
  render();
}

/* ================= LOGOUT ================= */
function logout(){
  localStorage.removeItem("loggedUser");
  location.href="login.html";
}

render();