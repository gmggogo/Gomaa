/* ================= DRIVER SCHEDULE - CLEAN BUILD ================= */

/* ================= STYLE ================= */
(function () {
  const style = document.createElement("style");
  style.innerHTML = `
  .suggestions{
    position:absolute;
    background:#fff;
    border:1px solid #ccc;
    width:100%;
    z-index:1000;
    max-height:150px;
    overflow:auto;
    border-radius:6px;
    box-shadow:0 4px 10px rgba(0,0,0,0.1);
  }

  .suggestion-item{
    padding:8px;
    cursor:pointer;
    font-size:13px;
  }

  .suggestion-item:hover{
    background:#f1f5f9;
  }

  .btn{
    padding:5px 10px;
    border:none;
    border-radius:6px;
    cursor:pointer;
    font-size:12px;
    margin:2px;
  }

  .edit{background:#2563eb;color:#fff;}
  .save{background:#16a34a;color:#fff;}
  .disable{background:#dc2626;color:#fff;}
  .enable{background:#16a34a;color:#fff;}

  .active-day{
    background:#16a34a;
    color:#fff;
  }

  .service-box{
    min-width:160px;
  }
  `;
  document.head.appendChild(style);
})();

/* ================= API ================= */
const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";
const API_SYSTEM = "/api/system-design";

/* ================= STATE ================= */
let drivers = [];
let schedule = {};
let services = [];
let SYSTEM_TIMEZONE = "America/Phoenix";

const tbody = document.getElementById("tbody");

/* ================= WEEK DAYS ================= */
const DAYS = [
  ["sun","Sun"],
  ["mon","Mon"],
  ["tue","Tue"],
  ["wed","Wed"],
  ["thu","Thu"],
  ["fri","Fri"],
  ["sat","Sat"]
];

/* ================= SYSTEM TIME ================= */
function systemDate() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: SYSTEM_TIMEZONE
    })
  );
}

function todayKey(){
  return DAYS[systemDate().getDay()][0];
}

/* ================= LOAD SYSTEM ================= */
async function loadSystem(){
  try{
    const res = await fetch(API_SYSTEM);
    const data = await res.json();
    SYSTEM_TIMEZONE = data.timezone || "America/Phoenix";
  }catch(e){}
}

/* ================= LOAD SERVICES ================= */
async function loadServices(){
  try{
    const res = await fetch(API_SERVICES);
    const data = await res.json();

    services = [
      { serviceKey:"ALL", title:"ALL" },
      ...data.map(s=>({
        serviceKey:s.serviceKey,
        title:s.title
      }))
    ];
  }catch(e){
    services = [{ serviceKey:"ALL", title:"ALL" }];
  }
}

/* ================= LOAD DRIVERS ================= */
async function loadDrivers(){
  const res = await fetch(API_DRIVERS);
  const data = await res.json();
  drivers = Array.isArray(data) ? data : data.drivers || [];
}

/* ================= LOAD SCHEDULE ================= */
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

      weekly:{
        sun:false,mon:false,tue:false,
        wed:false,thu:false,fri:false,sat:false
      },

      services:["ALL"],

      edit:false
    };
  }
}

/* ================= TOGGLE DAY ================= */
function toggleDay(id,day,el){
  const d = schedule[id];
  if(!d.edit || !d.enabled) return;

  d.weekly[day] = !d.weekly[day];
  el.classList.toggle("active-day");
}

/* ================= SERVICES ================= */
function updateServices(id,select){
  schedule[id].services =
    Array.from(select.selectedOptions).map(x=>x.value);
}

/* ================= ENABLE / DISABLE ================= */
function toggleDriver(id){
  schedule[id].enabled = !schedule[id].enabled;
  render();
  save();
}

/* ================= EDIT ================= */
function editDriver(id){
  schedule[id].edit = true;
  render();
}

/* ================= SAVE DRIVER ================= */
function saveDriver(id){
  schedule[id].edit = false;
  save();
  render();
}

/* ================= STATUS ================= */
function isActive(id){
  const s = schedule[id];
  if(!s || !s.enabled) return false;
  return !!s.weekly?.[todayKey()];
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
        <div style="display:flex;gap:5px">
        ${DAYS.map(x=>`
          <div
            onclick="toggleDay('${id}','${x[0]}',this)"
            class="${s.weekly[x[0]]?'active-day':''}"
            style="padding:4px;border:1px solid #ccc;cursor:pointer">
            ${x[1]}
          </div>
        `).join("")}
        </div>
      </td>

      <td>
        <select multiple class="service-box"
          ${!s.edit?"disabled":""}
          onchange="updateServices('${id}',this)">
          ${services.map(sv=>`
            <option value="${sv.serviceKey}"
            ${(s.services||[]).includes(sv.serviceKey)?"selected":""}>
              ${sv.title}
            </option>
          `).join("")}
        </select>
      </td>

      <td style="color:${isActive(id)?'green':'red'}">
        ${isActive(id)?"ACTIVE":"OFF"}
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
  await loadSystem();
  await loadDrivers();
  await loadServices();
  await loadSchedule();
  render();
}

init();

/* ================= GLOBAL ================= */
window.schedule = schedule;
window.toggleDay = toggleDay;
window.updateServices = updateServices;
window.toggleDriver = toggleDriver;
window.editDriver = editDriver;
window.saveDriver = saveDriver;