/* ================= STYLE ================= */
(function(){
  const style = document.createElement("style");

  style.innerHTML = `

body{
  font-family:Arial;
  background:#f5f6fa;
}

/* ===== TABLE ===== */
table{
  width:100%;
  border-collapse:collapse;
  background:#fff;
  box-shadow:0 5px 15px rgba(0,0,0,0.05);
  border-radius:10px;
  overflow:hidden;
}

th{
  background:#111827;
  color:#fff;
  padding:10px;
  font-size:13px;
}

td{
  padding:10px;
  border-bottom:1px solid #eee;
  text-align:center;
  vertical-align:middle;
}

/* ===== DRIVER ===== */
td:nth-child(2){
  background:#e0f2fe;
  font-weight:600;
}

/* ===== INPUT ===== */
input{
  width:100%;
  padding:6px;
  border-radius:6px;
  border:1px solid #ddd;
}

/* ===== DAYS ROW ===== */
.day{
  display:inline-block;
  min-width:40px;
  padding:6px;
  border-radius:6px;
  border:1px solid #ccc;
  font-size:10px;
  cursor:pointer;
  margin:2px;
}

.day.active{
  background:#16a34a;
  color:#fff;
  border-color:#16a34a;
}

/* ===== SERVICE CHIPS ===== */
.service-chip{
  display:inline-block;
  padding:5px 8px;
  margin:2px;
  font-size:11px;
  border-radius:6px;
  border:1px solid #ccc;
  cursor:pointer;
  user-select:none;
}

.service-chip.active{
  background:#16a34a;
  color:#fff;
  border-color:#16a34a;
}

/* ===== STATUS ===== */
.status{
  padding:5px 10px;
  border-radius:20px;
  font-size:11px;
  font-weight:700;
}

.status.on{
  background:#16a34a;
  color:#fff;
}

.status.off{
  background:#dc2626;
  color:#fff;
}

/* ===== BUTTONS ===== */
.btn{
  padding:6px 10px;
  border:none;
  border-radius:6px;
  cursor:pointer;
  font-size:11px;
  margin:2px;
}

.edit{background:#2563eb;color:#fff;}
.save{background:#16a34a;color:#fff;}
.disable{background:#dc2626;color:#fff;}
.enable{background:#f59e0b;color:#fff;}

`;

  document.head.appendChild(style);
})();

/* ================= API ================= */
const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";

/* ================= STATE ================= */
let drivers = [];
let schedule = {};
let services = [];

const tbody = document.getElementById("tbody");

/* ================= DAYS ================= */
const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];

/* ================= LOAD ================= */
async function loadDrivers(){
  const res = await fetch(API_DRIVERS);
  const data = await res.json();
  drivers = Array.isArray(data) ? data : data.drivers || [];
}

async function loadServices(){
  const res = await fetch(API_SERVICES);
  const data = await res.json();

  services = (Array.isArray(data) ? data : []).filter(s =>
    s.enabled === true || s.companyEnabled === true
  );

  services.unshift({ serviceKey:"ALL", title:"ALL" });
}

async function loadSchedule(){
  const res = await fetch(API_SCHEDULE);
  schedule = res.ok ? await res.json() : {};
}

/* ================= SAVE ================= */
async function save(){
  await fetch(API_SCHEDULE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(schedule)
  });
}

/* ================= INIT ================= */
function initDriver(id){
  if(!schedule[id]){
    schedule[id] = {
      phone:"",
      address:"",
      vehicleNumber:"",
      enabled:true,
      edit:false,
      weekly:{
        sun:false,mon:false,tue:false,
        wed:false,thu:false,fri:false,sat:false
      },
      services:["ALL"]
    };
  }
}

/* ================= TOGGLE DAY ================= */
function toggleDay(id,day,el){
  const s = schedule[id];
  if(!s.edit || !s.enabled) return;

  s.weekly[day] = !s.weekly[day];
  el.classList.toggle("active");
}

/* ================= SERVICES ================= */
function toggleService(id,key){
  const s = schedule[id];

  if(key === "ALL"){
    s.services = ["ALL"];
  } else {
    s.services = [key];
  }

  render();
}

/* ================= EDIT ================= */
function editDriver(id){
  schedule[id].edit = true;
  render();
}

/* ================= SAVE ================= */
function saveDriver(id){
  schedule[id].edit = false;
  save();
  render();
}

/* ================= ENABLE ================= */
function toggleDriver(id){
  schedule[id].enabled = !schedule[id].enabled;
  save();
  render();
}

/* ================= STATUS ================= */
function isActive(id){
  const s = schedule[id];
  if(!s || !s.enabled) return false;

  const today = DAYS[new Date().getDay()];
  return !!s.weekly?.[today];
}

/* ================= RENDER ================= */
function render(){

  tbody.innerHTML = "";

  drivers.forEach((d,i)=>{

    const id = d._id || d.id;

    initDriver(id);

    const s = schedule[id];

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i+1}</td>

      <td>${d.name || d.fullName || "-"}</td>

      <td>
        <input value="${s.vehicleNumber}"
        ${!s.edit ? "disabled":""}
        oninput="schedule['${id}'].vehicleNumber=this.value">
      </td>

      <td>
        <input value="${s.phone}"
        ${!s.edit ? "disabled":""}
        oninput="schedule['${id}'].phone=this.value">
      </td>

      <td>
        <input value="${s.address}"
        ${!s.edit ? "disabled":""}
        oninput="schedule['${id}'].address=this.value">
      </td>

      <td>
        ${DAYS.map(x=>`
          <span class="day ${s.weekly[x]?'active':''}"
          onclick="toggleDay('${id}','${x}',this)">
            ${x.toUpperCase()}
          </span>
        `).join("")}
      </td>

      <td>
        <div>
          ${services.map(sv=>`
            <span class="service-chip ${(s.services||[]).includes(sv.serviceKey)?'active':''}"
            onclick="toggleService('${id}','${sv.serviceKey}')">
              ${sv.title}
            </span>
          `).join("")}
        </div>
      </td>

      <td>
        <span class="status ${isActive(id)?'on':'off'}">
          ${isActive(id)?"ACTIVE":"OFF"}
        </span>
      </td>

      <td>
        ${
          s.edit
          ? `<button class="btn save" onclick="saveDriver('${id}')">Save</button>`
          : `<button class="btn edit" onclick="editDriver('${id}')">Edit</button>`
        }

        <button class="btn ${s.enabled?'disable':'enable'}"
        onclick="toggleDriver('${id}')">
          ${s.enabled?'Disable':'Enable'}
        </button>
      </td>
    `;

    tbody.appendChild(tr);

  });

}

/* ================= INIT ================= */
async function init(){
  await loadDrivers();
  await loadServices();
  await loadSchedule();
  render();
}

init();

/* ================= GLOBAL ================= */
window.toggleDay = toggleDay;
window.toggleService = toggleService;
window.toggleDriver = toggleDriver;
window.editDriver = editDriver;
window.saveDriver = saveDriver;
window.schedule = schedule;