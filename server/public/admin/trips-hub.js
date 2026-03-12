/* ===============================
   API
================================ */
const API_URL = "/api/trips";

/* ===============================
   STATE
================================ */
let hubTrips = [];
let filteredTrips = [];
let isAddingReservedTrip = false;

const container   = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn      = document.getElementById("addManualTripBtn");

/* ===============================
   HELPERS
================================ */
function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function formatDate(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  if(isNaN(d)) return "-";
  return d.toLocaleDateString()+" "+d.toLocaleTimeString([],{
    hour:"2-digit",
    minute:"2-digit"
  });
}

function normalizeStatus(s){
  return String(s||"").toLowerCase().trim();
}

function normalizeType(t){
  return String(t||"").toLowerCase().trim();
}

function getTripNumber(t){
  return t.tripNumber || t.bookingNumber || t.id || "-";
}

/* ===============================
   120 MIN RULE
================================ */

function minutesSinceBooked(t){
  const d = new Date(t.bookedAt || t.createdAt);
  if(isNaN(d)) return 9999;
  return (Date.now() - d.getTime()) / 60000;
}

function canEditTrip(t){
  return minutesSinceBooked(t) <= 120;
}

function canCancelTrip(t){
  if(normalizeStatus(t.status)!=="confirmed") return false;
  return minutesSinceBooked(t) <= 120;
}

/* ===============================
   LOAD TRIPS
================================ */

async function loadHubTrips(){
  try{
    const res = await fetch(API_URL);
    const data = await res.json();
    hubTrips = Array.isArray(data)?data:[];
    filteredTrips=[...hubTrips];
  }
  catch(e){
    console.error(e);
    hubTrips=[];
    filteredTrips=[];
  }
}

/* ===============================
   EDIT
================================ */

function editTripConfirm(id){

  const trip = hubTrips.find(t=>t._id===id);
  if(!trip) return;

  if(!canEditTrip(trip)){
    alert("Editing is allowed only within 120 minutes.");
    return;
  }

  const tr=document.getElementById("row-"+id);
  if(!tr) return;

  const fields=tr.querySelectorAll("input[data-edit='1'],textarea[data-edit='1'],select[data-edit='1']");
  fields.forEach(el=>el.disabled=false);

  tr.querySelector(".edit-btn").style.display="none";
  tr.querySelector(".save-btn").style.display="inline-block";
}

/* ===============================
   SAVE
================================ */

async function saveTripConfirm(id){

  const tr=document.getElementById("row-"+id);
  if(!tr) return;

  const updatedTrip={
    company: tr.querySelector(".company-input")?.value||"",
    entryName: tr.querySelector(".entryname-input")?.value||"",
    entryPhone: tr.querySelector(".entryphone-input")?.value||"",
    clientName: tr.querySelector(".clientname-input")?.value||"",
    clientPhone: tr.querySelector(".clientphone-input")?.value||"",
    pickup: tr.querySelector(".pickup-input")?.value||"",
    stops: tr.querySelector(".stops-input")?.value.split("→").map(s=>s.trim()).filter(Boolean),
    dropoff: tr.querySelector(".dropoff-input")?.value||"",
    notes: tr.querySelector(".notes-input")?.value||"",
    tripDate: tr.querySelector(".tripdate-input")?.value||"",
    tripTime: tr.querySelector(".triptime-input")?.value||"",
    status: tr.querySelector(".status-input")?.value||"Confirmed"
  };

  await fetch(API_URL+"/"+id,{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(updatedTrip)
  });

  await loadHubTrips();
  render();
}

/* ===============================
   DELETE
================================ */

async function deleteTripConfirm(id){

  const trip=hubTrips.find(t=>t._id===id);
  if(!trip) return;

  if(!canCancelTrip(trip)){
    alert("Cancel allowed only within 120 minutes.");
    return;
  }

  if(!confirm("Cancel this trip?")) return;

  await fetch(API_URL+"/"+id,{
    method:"DELETE"
  });

  await loadHubTrips();
  render();
}

/* ===============================
   GROUP
================================ */

function groupTripsByDate(trips){

  const groups={};

  trips.forEach(t=>{
    const d=new Date(t.bookedAt||t.createdAt);
    const key=isNaN(d)?"Unknown":d.toLocaleDateString();
    if(!groups[key]) groups[key]=[];
    groups[key].push(t);
  });

  return groups;
}

/* ===============================
   RENDER
================================ */

function render(){

  container.innerHTML="";

  if(!filteredTrips.length){
    container.innerHTML="<p>No trips</p>";
    return;
  }

  const groups=groupTripsByDate(filteredTrips);

  Object.keys(groups).forEach(dateKey=>{

    const title=document.createElement("div");
    title.className="group-title";
    title.textContent=dateKey;
    container.appendChild(title);

    const table=document.createElement("table");
    table.className="hub-table";

    table.innerHTML=`
    <thead>
      <tr>
      <th>#</th>
      <th>Trip</th>
      <th>Company</th>
      <th>Entry</th>
      <th>Client</th>
      <th>Pickup</th>
      <th>Stops</th>
      <th>Dropoff</th>
      <th>Date</th>
      <th>Time</th>
      <th>Status</th>
      <th>Booked</th>
      <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
    `;

    const tbody=table.querySelector("tbody");

    groups[dateKey].forEach((t,i)=>{

      const canEdit=canEditTrip(t);
      const canCancel=canCancelTrip(t);

      const tr=document.createElement("tr");
      tr.id="row-"+t._id;

      const stopsStr=Array.isArray(t.stops)?t.stops.join(" → "):"";

      tr.innerHTML=`

<td>${i+1}</td>

<td><input value="${safe(getTripNumber(t))}" disabled></td>

<td><input class="company-input" data-edit="1" value="${safe(t.company||"")}" disabled></td>

<td><input class="entryname-input" data-edit="1" value="${safe(t.entryName||"")}" disabled></td>

<td><input class="clientname-input" data-edit="1" value="${safe(t.clientName||"")}" disabled></td>

<td><input class="pickup-input" data-edit="1" value="${safe(t.pickup||"")}" disabled></td>

<td><input class="stops-input" data-edit="1" value="${safe(stopsStr)}" disabled></td>

<td><input class="dropoff-input" data-edit="1" value="${safe(t.dropoff||"")}" disabled></td>

<td><input class="tripdate-input" data-edit="1" type="date" value="${safe(t.tripDate||"")}" disabled></td>

<td><input class="triptime-input" data-edit="1" type="time" value="${safe(t.tripTime||"")}" disabled></td>

<td>${safe(t.status)}</td>

<td>${safe(formatDate(t.bookedAt||t.createdAt))}</td>

<td>
<div class="hub-actions">

${canEdit ? `<button class="hub-btn edit-btn edit" onclick="editTripConfirm('${t._id}')">Edit</button>` : ""}

<button class="hub-btn save-btn save" style="display:none" onclick="saveTripConfirm('${t._id}')">Save</button>

${canCancel ? `<button class="hub-btn delete-btn delete" onclick="deleteTripConfirm('${t._id}')">Cancel</button>` : ""}

</div>
</td>
`;

      tbody.appendChild(tr);

    });

    container.appendChild(table);

  });
}

/* ===============================
   SEARCH
================================ */

if(searchInput){

  searchInput.addEventListener("input",function(){

    const v=searchInput.value.toLowerCase().trim();

    if(!v){
      filteredTrips=[...hubTrips];
    }
    else{
      filteredTrips=hubTrips.filter(t=>JSON.stringify(t).toLowerCase().includes(v));
    }

    render();

  });

}

/* ===============================
   ADD
================================ */

if(addBtn){

  addBtn.onclick=async function(){

    const newTrip={
      type:"reserved",
      status:"Confirmed",
      createdAt:new Date().toISOString(),
      bookedAt:new Date().toISOString()
    };

    await fetch(API_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(newTrip)
    });

    await loadHubTrips();
    render();
  };

}

/* ===============================
   AUTO REFRESH
================================ */

setInterval(async()=>{
  await loadHubTrips();
  render();
},60000);

/* ===============================
   INIT
================================ */

(async()=>{
  await loadHubTrips();
  render();
})();