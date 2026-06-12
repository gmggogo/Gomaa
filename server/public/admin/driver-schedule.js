const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";

let drivers = [];
let schedule = {};
let services = [];

const tbody = document.getElementById("tbody");

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
  min-width:1400px;
  border-collapse:collapse;
  background:#fff;
  box-shadow:0 5px 20px rgba(0,0,0,0.08);
  border-radius:12px;
  overflow:hidden;
}

th{
  background:#111827;
  color:#fff;
  padding:12px;
  font-size:13px;
}

td{
  padding:10px;
  border-bottom:1px solid #eee;
  text-align:center;
  vertical-align:middle;
  font-size:13px;
}

/* ===== INPUT ===== */
input{
  width:100%;
  padding:6px;
  border-radius:6px;
  border:1px solid #ddd;
}

/* ===== DAYS INLINE ===== */
.days-row{
  display:flex;
  gap:4px;
  justify-content:center;
  flex-wrap:nowrap;
}

.day{
  min-width:38px;
  padding:6px;
  border-radius:6px;
  border:1px solid #ccc;
  font-size:10px;
  cursor:pointer;
  user-select:none;
}

.day.active{
  background:#16a34a;
  color:#fff;
  border-color:#16a34a;
}

/* ===== SERVICE VIEW ===== */
.service-view{
  padding:6px 10px;
  background:#f3f4f6;
  border-radius:6px;
  display:inline-block;
}

/* ===== SELECT ===== */
select{
  width:100%;
  padding:6px;
  border-radius:6px;
  border:1px solid #ddd;
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

/* ================= INIT DRIVER ================= */
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

      service:"ALL"
    };
  }
}

/* ================= DAYS ================= */
function toggleDay(id,day,el){
  const s = schedule[id];
  if(!s.edit || !s.enabled) return;

  s.weekly[day] = !s.weekly[day];
  el.classList.toggle("active");
}

/* ================= SERVICE ================= */
function setService(id,value){
  schedule[id].service = value;
}

/* ================= EDIT ================= */
function editDriver(id){
  schedule[id].edit = true;
  render();
}

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

/* ================= GET SERVICE NAME ================= */
function getServiceName(key){
  const s = services.find(x=>x.serviceKey === key);
  return s ? s.title : "N/A";
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

      <td><b>${d.name || d.fullName || "-"}</b></td>

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
        <div class="days-row">
          ${DAYS.map(x=>`
            <span class="day ${s.weekly[x]?'active':''}"
            onclick="toggleDay('${id}','${x}',this)">
              ${x.toUpperCase()}
            </span>
          `).join("")}
        </div>
      </td>

      <td>
        ${
          s.edit
          ? `
            <select onchange="setService('${id}',this.value)">
              ${services.map(sv=>`
                <option value="${sv.serviceKey}"
                ${s.service === sv.serviceKey ? "selected":""}>
                  ${sv.title}
                </option>
              `).join("")}
            </select>
          `
          : `
            <span class="service-view">
              ${getServiceName(s.service)}
            </span>
          `
        }
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
window.setService = setService;
window.toggleDriver = toggleDriver;
window.editDriver = editDriver;
window.saveDriver = saveDriver;
window.schedule = schedule;