/* ================= DRIVER SCHEDULE - FINAL STABLE ================= */

const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";

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

/* ================= SERVICES (FIXED RULE) ================= */

async function loadServices(){
  const res = await fetch(API_SERVICES);
  const data = await res.json();

  // 🔥 RULE: يظهر لو فردي OR شركة
  services = (Array.isArray(data) ? data : []).filter(s =>
    s.enabled === true || s.companyEnabled === true
  );

  services.unshift({
    serviceKey: "ALL",
    title: "ALL"
  });
}

/* ================= SCHEDULE ================= */

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
  const s = schedule[id];
  if(!s.edit || !s.enabled) return;

  s.weekly[day] = !s.weekly[day];
  el.classList.toggle("active");
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
          <span style="margin:2px;padding:4px;border:1px solid #ccc;cursor:pointer;border-radius:4px"
          class="${s.weekly[x]?'active':''}"
          onclick="toggleDay('${id}','${x}',this)">
            ${x.toUpperCase()}
          </span>
        `).join("")}
      </td>

      <td>
        <select multiple
          ${!s.edit ? "disabled":""}
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
        ${isActive(id) ? "ACTIVE" : "OFF"}
      </td>

      <td>
        ${
          s.edit
          ? `<button onclick="saveDriver('${id}')">Save</button>`
          : `<button onclick="editDriver('${id}')">Edit</button>`
        }

        <button
          onclick="toggleDriver('${id}')"
          style="margin-left:5px;background:${s.enabled?'red':'green'};color:#fff;padding:5px 10px;border:none;border-radius:5px">
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
window.updateServices = updateServices;
window.toggleDriver = toggleDriver;
window.editDriver = editDriver;
window.saveDriver = saveDriver;