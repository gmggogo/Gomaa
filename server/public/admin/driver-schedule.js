/* ================= DRIVER SCHEDULE - PRO CLEAN ================= */

const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";

let drivers = [];
let schedule = {};
let services = [];

const tbody = document.getElementById("tbody");

/* ================= LOAD DATA ================= */

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

/* ================= ACTIONS ================= */

function editDriver(id){
  schedule[id].edit = true;
  render();
}

async function saveDriver(id){
  schedule[id].edit = false;
  await save();
  render();
}

function toggleDriver(id){
  schedule[id].enabled = !schedule[id].enabled;
  save();
  render();
}

function toggleDay(id,day){
  const s = schedule[id];
  if(!s.edit || !s.enabled) return;

  s.weekly[day] = !s.weekly[day];
  render();
}

function updateService(id,value){
  schedule[id].service = value;
}

/* ================= STATUS ================= */

function isActive(id){
  const s = schedule[id];
  if(!s?.enabled) return false;

  const today = ["sun","mon","tue","wed","thu","fri","sat"][new Date().getDay()];
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

      <td class="driver-name">${d.name || "-"}</td>

      <td>
        <input value="${s.vehicleNumber}"
        ${!s.edit?"disabled":""}
        oninput="schedule['${id}'].vehicleNumber=this.value">
      </td>

      <td>
        <input value="${s.phone}"
        ${!s.edit?"disabled":""}
        oninput="schedule['${id}'].phone=this.value">
      </td>

      <td>
        <input value="${s.address}"
        ${!s.edit?"disabled":""}
        oninput="schedule['${id}'].address=this.value">
      </td>

      <td>
        <div class="week">
          ${["sun","mon","tue","wed","thu","fri","sat"].map(day=>`
            <div class="day ${s.weekly[day]?'active':''}"
            onclick="toggleDay('${id}','${day}')">
              ${day.toUpperCase()}
            </div>
          `).join("")}
        </div>
      </td>

      <td>
        <span class="service-badge active">
          ${getServiceName(s.service)}
        </span>
        ${
          s.edit ? `
          <select onchange="updateService('${id}',this.value)">
            ${services.map(sv=>`
              <option value="${sv.serviceKey}"
              ${sv.serviceKey===s.service?'selected':''}>
                ${sv.title}
              </option>
            `).join("")}
          </select>
          ` : ""
        }
      </td>

      <td>
        <span class="status ${isActive(id)?'on':'off'}">
          ${isActive(id)?'ACTIVE':'OFF'}
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

/* ================= SERVICE NAME ================= */

function getServiceName(key){
  const found = services.find(s=>s.serviceKey===key);
  return found ? found.title : "ALL";
}

/* ================= INIT ================= */

async function init(){
  await loadDrivers();
  await loadServices();
  await loadSchedule();
  render();
}

init();

/* expose */
window.schedule = schedule;
window.toggleDay = toggleDay;
window.updateService = updateService;
window.editDriver = editDriver;
window.saveDriver = saveDriver;
window.toggleDriver = toggleDriver;