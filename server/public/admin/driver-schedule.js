/* ================= SECURITY (FIXED) ================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ================= API ================= */

const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";

/* ================= STATE ================= */

let drivers = [];
let schedule = {};
let services = [];

const tbody = document.getElementById("tbody");

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

  schedule =
    res.ok
      ? await res.json()
      : {};

  window.schedule = schedule;

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
    schedule[id] = {};
  }

  schedule[id].phone ??= "";
  schedule[id].address ??= "";
  schedule[id].vehicleNumber ??= "";
  schedule[id].enabled ??= true;
  schedule[id].edit ??= false;

  schedule[id].weekly ??= {
    sun:false,
    mon:false,
    tue:false,
    wed:false,
    thu:false,
    fri:false,
    sat:false
  };

  schedule[id].services ??= ["ALL"];

}

/* ================= ACTIONS ================= */

function editDriver(id){
  schedule[id].edit = true;
  render();
}

async function saveDriver(id){

  const s = schedule[id];

  s.edit = false;

  if(!Array.isArray(s.services)){
    s.services = ["ALL"];
  }

  await save();

  await loadSchedule();

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

  schedule[id].services = [value];

}

/* ================= STATUS ================= */

let SYSTEM_TIMEZONE = "America/Phoenix";

async function loadSystem(){

  try{

    const res =
      await fetch("/api/system-design");

    const data =
      await res.json();

    SYSTEM_TIMEZONE =
      data.timezone ||
      "America/Phoenix";

  }catch(err){

    SYSTEM_TIMEZONE =
      "America/Phoenix";

  }

}

function getTodayKey(){

  const day =
    new Intl.DateTimeFormat(
      "en-US",
      {
        weekday:"short",
        timeZone:SYSTEM_TIMEZONE
      }
    )
    .format(new Date())
    .toLowerCase();

  if(day.startsWith("sun")) return "sun";
  if(day.startsWith("mon")) return "mon";
  if(day.startsWith("tue")) return "tue";
  if(day.startsWith("wed")) return "wed";
  if(day.startsWith("thu")) return "thu";
  if(day.startsWith("fri")) return "fri";

  return "sat";

}

function isActive(id){

  const s = schedule[id];

  if(!s || !s.enabled)
    return false;

  const today =
    getTodayKey();

  return !!s.weekly?.[today];

}

/* ================= SERVICE NAME ================= */

function getServiceName(driverServices){

  const key =
    Array.isArray(driverServices)
      ? driverServices[0]
      : "ALL";

  const found =
    services.find(
      s => s.serviceKey === key
    );

  return found
    ? found.title
    : "ALL";

}

/* ================= RENDER ================= */

function render(){

  tbody.innerHTML = "";

  drivers.forEach((d,i)=>{

    const id = d._id || d.id;
    initDriver(id);

    const s = schedule[id];

    tbody.innerHTML += `
      <tr>

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
            ${getServiceName(s.services)}
          </span>

          ${
            s.edit ? `
              <select onchange="updateService('${id}',this.value)">
                ${services.map(sv=>`
                  <option value="${sv.serviceKey}"
                  ${(s.services||[]).includes(sv.serviceKey)
  ? 'selected'
  : ''}>
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

      </tr>
    `;

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

/* expose */
window.toggleDay = toggleDay;
window.updateService = updateService;
window.editDriver = editDriver;
window.saveDriver = saveDriver;
window.toggleDriver = toggleDriver;
window.schedule = schedule;