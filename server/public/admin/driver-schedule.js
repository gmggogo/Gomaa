/* =====================================================
   DRIVER SCHEDULE - CLEAN BUILD (NO PATCHING)
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
    border-color:#16a34a;
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

const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";
const API_SYSTEM = "/api/system-design";

/* ================= STATE ================= */

let drivers = [];
let schedule = {};
let services = [];
let systemDesign = {};

const tbody = document.getElementById("tbody");

/* ================= WEEK (FIXED LOGIC) ================= */

const WEEK = [
  { key:"sun", label:"Sun" },
  { key:"mon", label:"Mon" },
  { key:"tue", label:"Tue" },
  { key:"wed", label:"Wed" },
  { key:"thu", label:"Thu" },
  { key:"fri", label:"Fri" },
  { key:"sat", label:"Sat" }
];

/* ================= SYSTEM TIME ================= */

function getSystemDate(){
  const tz = systemDesign.timezone || "America/Phoenix";
  return new Date(new Date().toLocaleString("en-US",{timeZone:tz}));
}

/* ================= LOAD ================= */

async function loadDrivers(){
  const res = await fetch(API_DRIVERS);
  const data = await res.json();
  drivers = Array.isArray(data) ? data : (data.drivers || []);
}

async function loadSchedule(){
  const res = await fetch(API_SCHEDULE);
  schedule = res.ok ? await res.json() : {};
}

async function loadServices(){
  const res = await fetch(API_SERVICES);
  const data = await res.json();
  services = data.services || data || [];
}

async function loadSystem(){
  const res = await fetch(API_SYSTEM);
  systemDesign = res.ok ? await res.json() : {};
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

  if(s.enabled !== true) return false;

  const dayIndex = getSystemDate().getDay();
  const map = ["sun","mon","tue","wed","thu","fri","sat"];

  const today = map[dayIndex];

  return s.weekly?.[today] === true;
}

/* ================= ADDRESS SEARCH ================= */

let t = null;

async function searchAddress(input){

  const q = input.value.trim();
  const box = input.parentElement.querySelector(".suggestions");

  if(t) clearTimeout(t);

  if(q.length < 3){
    box.innerHTML = "";
    return;
  }

  t = setTimeout(async ()=>{

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
    );

    const data = await res.json();

    box.innerHTML = "";

    data.forEach(p=>{

      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.innerText = p.display_name;

      div.onclick = ()=>{

        const id = input.dataset.id;

        schedule[id].address = p.display_name;
        schedule[id].lat = parseFloat(p.lat);
        schedule[id].lng = parseFloat(p.lon);

        input.value = p.display_name;
        box.innerHTML = "";
      };

      box.appendChild(div);
    });

  },300);
}

/* ================= TOGGLE WEEK ================= */

function toggleWeek(id,key){

  if(!schedule[id].edit) return;

  schedule[id].weekly[key] = !schedule[id].weekly[key];
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

/* ================= INIT DATA ================= */

async function init(){

  await loadDrivers();
  await loadSchedule();
  await loadServices();
  await loadSystem();

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

    <td style="position:relative;">
      <input value="${s.address}"
      data-id="${id}"
      ${!s.edit ? "disabled":""}
      oninput="searchAddress(this)">
      <div class="suggestions"></div>
    </td>

    <td>
      <div class="week-box">
        ${WEEK.map(w=>`
          <div class="day-square ${s.weekly[w.key]?'active':''}"
          onclick="toggleWeek('${id}','${w.key}')">
            <div>${w.label}</div>
          </div>
        `).join("")}
      </div>
    </td>

    <td style="font-weight:bold;color:${isActive(id)?'#16a34a':'#dc2626'}">
      ${isActive(id) ? "ACTIVE" : "OFF"}
    </td>

    <td>

      ${s.edit
        ? `<button class="action-btn save" onclick="saveDriver('${id}')">Save</button>`
        : `<button class="action-btn edit" onclick="editDriver('${id}')">Edit</button>`
      }

      <button class="action-btn ${s.enabled?'disable':'enable'}"
      onclick="toggleEnable('${id}')">
        ${s.enabled ? "Disable" : "Enable"}
      </button>

    </td>
    `;

    tbody.appendChild(tr);

  });

}

/* ================= START ================= */

init();