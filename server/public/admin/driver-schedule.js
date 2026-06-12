/* ================= SECURITY ================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ================= API ================= */

const API_DRIVERS  = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";
const API_SYSTEM   = "/api/system-design";

/* ================= STATE ================= */

let drivers = [];
let schedule = {};
let services = [];
let SYSTEM_TIMEZONE = "America/Phoenix";

const tbody = document.getElementById("tbody");

const DAYS_DEFAULT = {
  sun:false,
  mon:false,
  tue:false,
  wed:false,
  thu:false,
  fri:false,
  sat:false
};

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];

/* ================= HELPERS ================= */

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function normalizeRow(row){

  row = row || {};

  return {
    phone: row.phone || "",
    address: row.address || "",
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    vehicleNumber: row.vehicleNumber || "",
    enabled: row.enabled !== false,
    edit: row.edit === true,

days:{
  ...DAYS_DEFAULT,
  ...(row.days || {})
},

    services:
      Array.isArray(row.services) && row.services.length
      ? row.services
      : ["ALL"]
  };

}

function getMainService(row){

  if(
    row &&
    Array.isArray(row.services) &&
    row.services.length
  ){
    return row.services[0];
  }

  return "ALL";

}

function getServiceName(driverServices){

  const key =
    Array.isArray(driverServices) && driverServices.length
      ? driverServices[0]
      : "ALL";

  const found =
    services.find(s => s.serviceKey === key);

  return found ? found.title : key;

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

/* ================= LOAD ================= */

async function loadSystem(){

  try{

    const res = await fetch(API_SYSTEM);
    const data = await res.json();

    SYSTEM_TIMEZONE =
      data.timezone ||
      "America/Phoenix";

  }catch(err){

    SYSTEM_TIMEZONE = "America/Phoenix";

  }

}

async function loadDrivers(){

  const res = await fetch(API_DRIVERS);
  const data = await res.json();

  drivers =
    Array.isArray(data)
    ? data
    : data.drivers || [];

}

async function loadServices(){

  const res = await fetch(API_SERVICES);
  const data = await res.json();

  const list =
    Array.isArray(data)
    ? data
    : [];

  services =
    list
      .filter(s =>
        s.enabled === true ||
        s.companyEnabled === true
      )
      .map(s=>({
        serviceKey:String(s.serviceKey || "").toUpperCase(),
        title:s.title || s.name || s.serviceKey || ""
      }))
      .filter(s=>s.serviceKey);

  services.unshift({
    serviceKey:"ALL",
    title:"ALL"
  });

}

async function loadSchedule(){

  const res = await fetch(API_SCHEDULE);
  const data = res.ok ? await res.json() : {};

  schedule = {};

  Object.keys(data || {}).forEach(id=>{
    schedule[id] = normalizeRow(data[id]);
  });

  window.schedule = schedule;

}

/* ================= SAVE ================= */

async function save(){

  const clean = {};

  for(const id in schedule){

    const row = normalizeRow(schedule[id]);

    clean[id] = {
      phone:row.phone,
      address:row.address,
      lat:row.lat,
      lng:row.lng,
      vehicleNumber:row.vehicleNumber,
      enabled:row.enabled === true,
    days:{
  ...DAYS_DEFAULT,
  ...(row.days || {})
},
      services:
        Array.isArray(row.services) && row.services.length
        ? row.services
        : ["ALL"]
    };

  }

  const res = await fetch(API_SCHEDULE,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify(clean)
  });

  const data = await res.json();

  if(!res.ok || data.success === false){
    alert("Save failed");
    throw new Error("Driver schedule save failed");
  }

  return data;

}

/* ================= INIT DRIVER ================= */

function initDriver(id){

  if(!schedule[id]){
    schedule[id] = normalizeRow({});
  }else{
    schedule[id] = normalizeRow(schedule[id]);
  }

}

/* ================= ACTIONS ================= */

function editDriver(id){

  initDriver(id);
  schedule[id].edit = true;
  render();

}

async function saveDriver(id){

  initDriver(id);

  schedule[id].edit = false;

  await save();

  await loadSchedule();

  render();

}

async function toggleDriver(id){

  initDriver(id);

  schedule[id].enabled =
    schedule[id].enabled !== true;

  await save();

  await loadSchedule();

  render();

}

function toggleDay(id,day){

  initDriver(id);

  const s = schedule[id];

  if(!s.edit || !s.enabled) return;

s.days[day] = !s.days[day];
  render();

}

function updateService(id,value){

  initDriver(id);

  schedule[id].services = [
    String(value || "ALL").toUpperCase()
  ];

}

/* ================= STATUS ================= */

function isActive(id){

  const s = schedule[id];

  if(!s || !s.enabled)
    return false;

  const today = getTodayKey();

return !!s.days?.[today];
}

/* ================= RENDER ================= */

function render(){

  tbody.innerHTML = "";

  drivers.forEach((d,i)=>{

    const id = String(d._id || d.id || "");
    if(!id) return;

    initDriver(id);

    const s = schedule[id];

    const selectedService =
      getMainService(s);

    tbody.innerHTML += `
      <tr>

        <td>${i+1}</td>

        <td class="driver-name">
          ${esc(d.name || d.fullName || "-")}
        </td>

        <td>
          <input
            value="${esc(s.vehicleNumber)}"
            ${!s.edit ? "disabled" : ""}
            oninput="schedule['${id}'].vehicleNumber=this.value">
        </td>

        <td>
          <input
            value="${esc(s.phone)}"
            ${!s.edit ? "disabled" : ""}
            oninput="schedule['${id}'].phone=this.value">
        </td>

        <td>
          <input
            value="${esc(s.address)}"
            ${!s.edit ? "disabled" : ""}
            oninput="schedule['${id}'].address=this.value">
        </td>

        <td>
          <div class="week">
            ${DAYS.map(day=>`
              <div
class="day ${s.days[day] ? "active" : ""}"               
 onclick="toggleDay('${id}','${day}')">
                ${day.toUpperCase()}
              </div>
            `).join("")}
          </div>
        </td>

        <td>
          <span class="service-badge active">
            ${esc(getServiceName(s.services))}
          </span>

          ${
            s.edit
            ? `
              <select onchange="updateService('${id}',this.value)">
                ${services.map(sv=>`
                  <option
                    value="${esc(sv.serviceKey)}"
                    ${sv.serviceKey === selectedService ? "selected" : ""}>
                    ${esc(sv.title)}
                  </option>
                `).join("")}
              </select>
            `
            : ""
          }
        </td>

        <td>
          <span class="status ${isActive(id) ? "on" : "off"}">
            ${isActive(id) ? "ACTIVE" : "OFF"}
          </span>
        </td>

        <td>
          ${
            s.edit
            ? `<button class="btn save" onclick="saveDriver('${id}')">Save</button>`
            : `<button class="btn edit" onclick="editDriver('${id}')">Edit</button>`
          }

          <button
            class="btn ${s.enabled ? "disable" : "enable"}"
            onclick="toggleDriver('${id}')">
            ${s.enabled ? "Disable" : "Enable"}
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

/* ================= GLOBAL ================= */

window.toggleDay = toggleDay;
window.updateService = updateService;
window.editDriver = editDriver;
window.saveDriver = saveDriver;
window.toggleDriver = toggleDriver;
window.schedule = schedule;