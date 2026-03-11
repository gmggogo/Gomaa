/* =================================
   SUNBEAM TRIPS PAGE
================================= */

const API_URL = "/api/trips";

const container = document.getElementById("tripsContainer");
const searchBox = document.getElementById("searchBox");

/* =================================
   LOAD TRIPS FROM SERVER
================================= */

async function loadTrips(){

  try{

    const res = await fetch(API_URL);

    const data = await res.json();

    return data || [];

  }catch(err){

    console.error("Load trips error",err);

    return [];

  }

}

/* =================================
   UPDATE TRIP
================================= */

async function updateTrip(num,patch){

  await fetch(`${API_URL}/${num}`,{

    method:"PATCH",

    headers:{
      "Content-Type":"application/json"
    },

    body:JSON.stringify(patch)

  });

}

/* =================================
   DATE FILTER
================================= */

function isTodayOrTomorrow(tripDate){

  if(!tripDate) return false;

  const [y,m,d] = tripDate.split("-").map(Number);

  const trip = new Date(y,m-1,d);

  trip.setHours(0,0,0,0);

  const nowAZ = new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );

  nowAZ.setHours(0,0,0,0);

  const tomorrowAZ = new Date(nowAZ);

  tomorrowAZ.setDate(nowAZ.getDate()+1);

  return (
    trip.getTime() === nowAZ.getTime() ||
    trip.getTime() === tomorrowAZ.getTime()
  );

}

/* =================================
   STATUS COLOR
================================= */

function statusClass(s){

  return {

    "Booked":"status-booked",
    "Scheduled":"status-scheduled",
    "On Board":"status-onboard",
    "Arrived":"status-arrived",
    "Completed":"status-complete",
    "Cancelled":"status-cancelled",
    "No Show":"status-noshow"

  }[s] || "";

}

/* =================================
   RENDER PAGE
================================= */

async function render(){

  container.innerHTML = "";

  const trips = await loadTrips();

  const q = searchBox ? searchBox.value.trim().toLowerCase() : "";

  const filtered = trips.filter(t=>{

    if(!isTodayOrTomorrow(t.tripDate)) return false;

    if(!q) return true;

    return(

      (t.tripNumber||"").toLowerCase().includes(q) ||
      (t.company||"").toLowerCase().includes(q) ||
      (t.clientName||"").toLowerCase().includes(q) ||
      (t.clientPhone||"").includes(q) ||
      (t.pickup||"").toLowerCase().includes(q) ||
      (t.dropoff||"").toLowerCase().includes(q)

    );

  });

  const groups = {};

  filtered.forEach(t=>{

    if(!groups[t.tripDate]) groups[t.tripDate]=[];

    groups[t.tripDate].push(t);

  });

  Object.keys(groups).sort().forEach(date=>{

    const title = document.createElement("h3");

    title.innerText = date;

    container.appendChild(title);

    const table = document.createElement("table");

    table.className = "hub-table";

    table.innerHTML = `

      <tr>

        <th>Send Dispatch</th>
        <th>#</th>
        <th>Trip</th>
        <th>Company</th>

        <th>Entered By</th>
        <th>Entered Phone</th>

        <th>Client</th>
        <th>Phone</th>

        <th>Pickup</th>
        <th>Stops</th>
        <th>Dropoff</th>

        <th>Date</th>
        <th>Time</th>

        <th>Status</th>

        <th>Actions</th>

      </tr>

    `;

    groups[date].forEach((t,i)=>{

      const row = document.createElement("tr");

      if(t.disabled){

        row.style.background="#7f1d1d";
        row.style.color="white";
        row.style.pointerEvents="none";

      }

      row.innerHTML = `

        <td>

          <input
            type="checkbox"
            ${t.inDispatch?"checked":""}
            ${t.disabled?"disabled":""}
            onchange="toggleDispatch('${t.tripNumber}',this.checked)">

        </td>

        <td>${i+1}</td>

        <td>${t.tripNumber||""}</td>

        <td>${t.company||""}</td>

        <td>

          <input class="edit" disabled value="${t.enteredBy||""}">

        </td>

        <td>

          <input class="edit" disabled value="${t.enteredPhone||""}">

        </td>

        <td>

          <input class="edit" disabled value="${t.clientName||""}">

        </td>

        <td>

          <input class="edit" disabled value="${t.clientPhone||""}">

        </td>

        <td>

          <input class="edit" disabled value="${t.pickup||""}">

        </td>

        <td>

          <input class="edit" disabled value="${(t.stops||[]).join(" | ")}">

        </td>

        <td>

          <input class="edit" disabled value="${t.dropoff||""}">

        </td>

        <td>

          <input type="date" class="edit" disabled value="${t.tripDate||""}">

        </td>

        <td>

          <input type="time" class="edit" disabled value="${t.tripTime||""}">

        </td>

        <td class="${statusClass(t.status)}">

          <select
            onchange="changeStatus('${t.tripNumber}',this.value)"
            ${t.disabled?"disabled":""}
          >

          ${["Booked","Scheduled","On Board","Arrived","Completed","No Show","Cancelled"]
          .map(s=>`<option ${s===t.status?"selected":""}>${s}</option>`).join("")}

          </select>

        </td>

        <td>

          <button class="btn edit" onclick="editTrip('${t.tripNumber}',this)">
          Edit
          </button>

          <button class="btn disable" onclick="toggleDisable('${t.tripNumber}')">
          ${t.disabled?"Enable":"Disable"}
          </button>

        </td>

      `;

      table.appendChild(row);

    });

    container.appendChild(table);

  });

}

/* =================================
   ACTIONS
================================= */

async function toggleDispatch(num,val){

  await updateTrip(num,{
    inDispatch:val
  });

  render();

}

async function toggleDisable(num){

  const ok = confirm("Disable this trip?");

  if(!ok) return;

  await updateTrip(num,{
    disabled:true,
    inDispatch:false
  });

  render();

}

async function changeStatus(num,val){

  await updateTrip(num,{
    status:val
  });

  render();

}

function editTrip(num,btn){

  const row = btn.closest("tr");

  const inputs = row.querySelectorAll("input.edit");

  if(btn.innerText==="Edit"){

    inputs.forEach(i=>i.disabled=false);

    btn.innerText="Save";

    return;

  }

  const patch = {

    enteredBy:inputs[0].value,
    enteredPhone:inputs[1].value,

    clientName:inputs[2].value,
    clientPhone:inputs[3].value,

    pickup:inputs[4].value,
    stops:inputs[5].value.split("|").map(s=>s.trim()).filter(Boolean),

    dropoff:inputs[6].value,

    tripDate:inputs[7].value,
    tripTime:inputs[8].value,

    status:"Scheduled"

  };

  updateTrip(num,patch).then(render);

}

/* =================================
   SEARCH
================================= */

if(searchBox){

  searchBox.addEventListener("input",render);

}

/* =================================
   AUTO REFRESH
================================= */

setInterval(render,15000);

/* =================================
   INIT
================================= */

render();