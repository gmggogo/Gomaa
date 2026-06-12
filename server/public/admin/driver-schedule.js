/* ================= API ================= */

const API_DRIVERS = "/api/drivers";
const API_SCHEDULE = "/api/driver-schedule";
const API_SERVICES = "/api/services/admin";

/* ================= STATE ================= */

let drivers = [];
let schedule = {};
let services = [];

const tbody = document.getElementById("tbody");

/* ================= WEEK ================= */

const WEEK = ["sun","mon","tue","wed","thu","fri","sat"];

/* ================= LOAD ================= */

async function init(){

  drivers = await (await fetch(API_DRIVERS)).json();
  schedule = await (await fetch(API_SCHEDULE)).json();
  services = await (await fetch(API_SERVICES)).json();

  render();
}

/* ================= STATUS ================= */

function isActive(id){

  const s = schedule[id];
  if(!s) return false;

  if(!s.enabled) return false;

  const today = WEEK[new Date().getDay()];

  return s.weekly?.[today] === true;
}

/* ================= EDIT ================= */

function edit(id){
  schedule[id].edit = true;
  render();
}

async function save(id){
  schedule[id].edit = false;

  await fetch(API_SCHEDULE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(schedule)
  });

  render();
}

/* ================= WEEK TOGGLE ================= */

function toggleDay(id,day){

  if(!schedule[id].edit) return;

  schedule[id].weekly[day] = !schedule[id].weekly[day];

  render();
}

/* ================= SERVICES ================= */

function setService(id,value){

  const s = schedule[id];

  if(value === "ALL"){
    s.services = ["ALL"];
  }else{

    s.services = (s.services || []).filter(x=>x!=="ALL");

    if(!s.services.includes(value)){
      s.services.push(value);
    }

  }

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
        vehicleNumber:"",
        enabled:true,
        weekly:{
          sun:false,mon:false,tue:false,wed:false,thu:false,fri:false,sat:false
        },
        services:["ALL"],
        edit:false
      };

    }

    const s = schedule[id];

    tbody.innerHTML += `
<tr>

<td>${i+1}</td>

<td class="driver">${d.name || "-"}</td>

<td class="car">
  ${
    s.edit
    ? `<input value="${s.vehicleNumber||""}" oninput="schedule['${id}'].vehicleNumber=this.value">`
    : (s.vehicleNumber || "-")
  }
</td>

<td>
  <input ${!s.edit?"disabled":""}
  value="${s.phone||""}"
  oninput="schedule['${id}'].phone=this.value">
</td>

<td>
  <input ${!s.edit?"disabled":""}
  value="${s.address||""}"
  oninput="schedule['${id}'].address=this.value">
</td>

<td>
  <div class="week">
    ${WEEK.map(day=>`
      <div class="day ${s.weekly[day]?'active':''}"
      onclick="toggleDay('${id}','${day}')">
        ${day}
      </div>
    `).join("")}
  </div>
</td>

<td>
  ${
    s.edit
    ? `
      <select onchange="setService('${id}',this.value)">
        <option value="ALL">ALL</option>
        ${services.map(x=>`
          <option value="${x.key || x.name}">
            ${x.name || x.key}
          </option>
        `).join("")}
      </select>
    `
    : `
      ${(s.services||["ALL"]).map(x=>`
        <span class="service-tag ${x==='ALL'?'all':''}">
          ${x}
        </span>
      `).join("")}
    `
  }
</td>

<td class="${isActive(id)?'status-active':'status-off'}">
  ${isActive(id)?"ACTIVE":"OFF"}
</td>

<td>

  ${
    s.edit
    ? `<button class="btn save" onclick="save('${id}')">Save</button>`
    : `<button class="btn edit" onclick="edit('${id}')">Edit</button>`
  }

</td>

</tr>
`;

  });

}

/* ================= START ================= */

init();