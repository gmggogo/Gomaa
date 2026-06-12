/* =====================================================
   DRIVER SCHEDULE - CLEAN V2 (PRODUCTION READY)
===================================================== */

/* ================= STYLE ================= */

(function(){

  const style = document.createElement("style");

  style.innerHTML = `

  .suggestions{
    position:absolute;
    background:#fff;
    border:1px solid #ddd;
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

  .week-box{
    display:flex;
    gap:6px;
  }

  .day-square{
    padding:6px;
    border:1px solid #ddd;
    border-radius:6px;
    cursor:pointer;
    font-size:11px;
    text-align:center;
    min-width:44px;
    user-select:none;
  }

  .day-square.active{
    background:#16a34a;
    color:#fff;
  }

  .service-tag{
    display:inline-block;
    padding:3px 6px;
    border-radius:6px;
    font-size:11px;
    background:#e5e7eb;
    margin:2px;
  }

  .service-tag.all{
    background:#16a34a;
    color:#fff;
  }

  .action-btn{
    padding:6px 10px;
    margin:2px;
    border:none;
    border-radius:6px;
    cursor:pointer;
    font-size:12px;
  }

  .edit{background:#2563eb;color:#fff;}
  .save{background:#16a34a;color:#fff;}
  .disable{background:#dc2626;color:#fff;}
  .enable{background:#f59e0b;color:#fff;}

  `;

  document.head.appendChild(style);

})();

/* ================= API ================= */

const API_DRIVERS  = "/api/drivers";
const API_SCHEDULE  = "/api/driver-schedule";
const API_SERVICES  = "/api/services/admin";
const API_SYSTEM    = "/api/system-design";

/* ================= STATE ================= */

let drivers = [];
let schedule = {};
let services = [];
let system = {};

const tbody = document.getElementById("tbody");

/* ================= WEEK ================= */

const WEEK = [
  {key:"sun",label:"Sun"},
  {key:"mon",label:"Mon"},
  {key:"tue",label:"Tue"},
  {key:"wed",label:"Wed"},
  {key:"thu",label:"Thu"},
  {key:"fri",label:"Fri"},
  {key:"sat",label:"Sat"}
];

/* ================= SYSTEM TIME ================= */

function getTodayKey(){

  const tz = system.timezone || "America/Phoenix";

  const date = new Date(
    new Date().toLocaleString("en-US",{timeZone:tz})
  );

  const map = ["sun","mon","tue","wed","thu","fri","sat"];

  return map[date.getDay()];
}

/* ================= LOAD ================= */

async function loadDrivers(){
  const r = await fetch(API_DRIVERS);
  const d = await r.json();
  drivers = Array.isArray(d) ? d : (d.drivers || []);
}

async function loadSchedule(){
  const r = await fetch(API_SCHEDULE);
  schedule = await r.json() || {};
}

async function loadServices(){
  const r = await fetch(API_SERVICES);
  const d = await r.json();
  services = d.services || [];
}

async function loadSystem(){
  const r = await fetch(API_SYSTEM);
  system = await r.json() || {};
}

/* ================= SAVE ================= */

async function save(){
  await fetch(API_SCHEDULE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(schedule)
  });
}

/* ================= DRIVER STATUS ================= */

function isActive(id){

  const s = schedule[id];
  if(!s) return false;

  if(!s.enabled) return false;

  const today = getTodayKey();

  return s.weekly?.[today] === true;
}

/* ================= SERVICES ================= */

function renderServices(s){

  if(!s.services || s.services.includes("ALL")){
    return `<span class="service-tag all">ALL</span>`;
  }

  return s.services.map(x=>`
    <span class="service-tag">${x}</span>
  `).join("");
}

function toggleService(id,value){

  const s = schedule[id];
  if(!s.edit) return;

  if(value === "ALL"){
    s.services = ["ALL"];
  }else{

    if(!Array.isArray(s.services)) s.services = [];

    s.services = s.services.filter(x => x !== "ALL");

    if(!s.services.includes(value)){
      s.services.push(value);
    }

  }

  render();
}

/* ================= WEEK TOGGLE ================= */

function toggleWeek(id,key){

  const s = schedule[id];
  if(!s.edit) return;

  s.weekly[key] = !s.weekly[key];

  render();
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

async function toggleEnable(id){
  schedule[id].enabled = !schedule[id].enabled;
  await save();
  render();
}

/* ================= RENDER ================= */

function render(){

  tbody.innerHTML = "";

  drivers.forEach((d,i)=>{

    const id = d._id || d.id;

    if(!schedule[id]){

      schedule[id] = {
        phone:"",
        address:"",
        lat:null,
        lng:null,
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

    const s = schedule[id];

    const tr = document.createElement("tr");

    tr.style.opacity = s.enabled ? "1" : "0.4";

    tr.innerHTML = `

    <td>${i+1}</td>

    <td style="background:#eff6ff;font-weight:600;color:#1e3a8a;">
      ${d.name || d.fullName || "-"}
    </td>

    <td style="background:#fef3c7;font-weight:600;color:#92400e;">
      ${s.vehicleNumber || ""}
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
      <div class="week-box">
        ${WEEK.map(w=>`
          <div class="day-square ${s.weekly[w.key]?'active':''}"
          onclick="toggleWeek('${id}','${w.key}')">
            ${w.label}
          </div>
        `).join("")}
      </div>
    </td>

    <td>
      ${renderServices(s)}
    </td>

    <td style="color:${isActive(id)?'#16a34a':'#dc2626'};font-weight:700;">
      ${isActive(id) ? "ACTIVE" : "OFF"}
    </td>

    <td>

      ${
        s.edit
        ? `<button class="action-btn save" onclick="saveDriver('${id}')">Save</button>`
        : `<button class="action-btn edit" onclick="editDriver('${id}')">Edit</button>`
      }

      <button class="action-btn ${s.enabled?'disable':'enable'}"
      onclick="toggleEnable('${id}')">
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
  await loadSchedule();
  await loadServices();
  await loadSystem();

  render();
}

init();