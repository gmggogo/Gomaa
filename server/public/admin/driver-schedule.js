/* ================= DRIVER SCHEDULE - FINAL ================= */

/* ================= STYLE ================= */
(function () {
  const style = document.createElement("style");
  style.innerHTML = `
  .service-box{
    min-width:160px;
    padding:4px;
  }

  .day{
    padding:5px;
    border:1px solid #ccc;
    cursor:pointer;
    border-radius:4px;
    font-size:12px;
  }

  .day.active{
    background:#16a34a;
    color:#fff;
  }

  .btn{
    padding:5px 10px;
    border:none;
    border-radius:5px;
    cursor:pointer;
    margin:2px;
  }

  .edit{background:#2563eb;color:#fff;}
  .save{background:#16a34a;color:#fff;}
  .disable{background:#dc2626;color:#fff;}
  .enable{background:#16a34a;color:#fff;}
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
const DAYS = [
  ["sun","Sun"],
  ["mon","Mon"],
  ["tue","Tue"],
  ["wed","Wed"],
  ["thu","Thu"],
  ["fri","Fri"],
  ["sat","Sat"]
];

/* ================= LOAD ================= */
async function loadDrivers(){
  const res = await fetch(API_DRIVERS);
  const data = await res.json();
  drivers = Array.isArray(data) ? data : data.drivers || [];
}

/* ================= LOAD SERVICES ================= */
async function loadServices(){
  const res = await fetch(API_SERVICES);
  const data = await res.json();

  // 🔥 IMPORTANT FILTER RULE
  services = (Array.isArray(data) ? data : []).filter(s =>
    s.enabled === true ||
    s.companyEnabled === true
  );

  // ALL option
  services.unshift({
    serviceKey: "ALL",
    title: "ALL"
  });
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
        sun:false,
        mon:false,
        tue:false,
        wed:false,
        thu:false,
        fri:false,
        sat:false
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

  const today = DAYS[new Date().getDay()][0];
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
          <div class="day ${s.weekly[x[0]]?'active':''}"
          onclick="toggleDay('${id}','${x[0]}',this)">
            ${x[1]}
          </div>
        `).join("")}
      </td>

      <td>
        <select multiple class="service-box"
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
window.updateServices = updateServices;
window.toggleDriver = toggleDriver;
window.editDriver = editDriver;
window.saveDriver = saveDriver;