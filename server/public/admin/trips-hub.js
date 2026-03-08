/* ===============================
   API
================================ */
const API_URL = "/api/trips";

/* ===============================
   STATE
================================ */
let allHubTrips = [];
let hubTrips = [];

/* ===============================
   ELEMENTS
================================ */
const container   = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");

/* ===============================
   LOAD TRIPS
================================ */
async function loadHubTrips(){

  try{

    const res = await fetch(API_URL);
    const data = await res.json();

    allHubTrips = Array.isArray(data) ? data : [];
    hubTrips = [...allHubTrips];

  }
  catch(err){

    console.error("Load trips error:",err);

    allHubTrips = [];
    hubTrips = [];

  }

}

/* ===============================
   DATE FORMAT
================================ */
function formatDate(iso){

  if(!iso) return "-";

  const d = new Date(iso);

  if(isNaN(d)) return "-";

  return d.toLocaleDateString()+" "+d.toLocaleTimeString([],{

    hour:"2-digit",
    minute:"2-digit"

  });

}

/* ===============================
   GET TRIP NUMBER
================================ */
function getTripNumber(t){

  if(t.tripNumber) return String(t.tripNumber);

  if(t.id) return String(t.id);

  return "-";

}

/* ===============================
   CHECK PASSED
================================ */
function isTripPassed(t){

  if(!t.tripDate || !t.tripTime) return false;

  const tripDateTime = new Date(`${t.tripDate}T${t.tripTime}`);

  if(isNaN(tripDateTime)) return false;

  return new Date() >= tripDateTime;

}

/* ===============================
   REMOVE AFTER 24H
================================ */
function shouldRemoveTrip(t){

  if(!t.tripDate || !t.tripTime) return false;

  const tripDateTime = new Date(`${t.tripDate}T${t.tripTime}`);

  if(isNaN(tripDateTime)) return false;

  const diffHours = (new Date() - tripDateTime) / (1000 * 60 * 60);

  return diffHours >= 24;

}

/* ===============================
   ROW COLORS
================================ */
function rowColor(tr,t){

  if(isTripPassed(t)){

    tr.style.background="#ffe5e5";
    tr.style.borderLeft="4px solid #dc2626";
    return;

  }

  if(t.type==="Individual"){

    tr.style.background="#e8f4ff";

  }
  else if(t.type==="Company"){

    tr.style.background="#fff6d6";

  }
  else if(t.type==="Reserved"){

    tr.style.background="#ecfdf5";

  }

}

/* ===============================
   ADD RESERVED TRIP
================================ */
async function addReservedTripInline(){

  const newTrip={

    type:"Reserved",

    company:"",
    entryName:"",
    entryPhone:"",

    clientName:"",
    clientPhone:"",

    pickup:"",
    stops:[],

    dropoff:"",
    notes:"",

    tripDate:"",
    tripTime:"",

    status:"Booked",

    createdAt:new Date().toISOString(),
    bookedAt:new Date().toISOString()

  };

  await fetch(API_URL,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify(newTrip)
  });

  await loadHubTrips();
  render();

}

window.addReservedTripInline = addReservedTripInline;

/* ===============================
   DELETE
================================ */
async function deleteTripConfirm(id){

  const ok = confirm("Delete this trip?");

  if(!ok) return;

  const res = await fetch(`/api/trips/${id}`,{

    method:"DELETE"

  });

  if(!res.ok){

    alert("Delete failed");
    return;

  }

  await loadHubTrips();
  render();

}

window.deleteTripConfirm = deleteTripConfirm;

/* ===============================
   EDIT
================================ */
function editTripRow(btn){

  const tr = btn.closest("tr");

  const inputs = tr.querySelectorAll("input,textarea");

  inputs.forEach((el,i)=>{

    if(i<=1) return;

    el.disabled=false;

  });

  tr.querySelector(".edit-btn").style.display="none";
  tr.querySelector(".save-btn").style.display="inline-block";

}

window.editTripRow = editTripRow;

/* ===============================
   SAVE
================================ */
async function saveTripRow(btn,id){

  const tr = btn.closest("tr");

  const inputs = tr.querySelectorAll("input,textarea");

  const updatedTrip = {

    company:inputs[3].value,
    entryName:inputs[4].value,
    entryPhone:inputs[5].value,

    clientName:inputs[6].value,
    clientPhone:inputs[7].value,

    pickup:inputs[8].value,

    stops:inputs[9].value
      ? inputs[9].value.split("→").map(s=>s.trim()).filter(Boolean)
      : [],

    dropoff:inputs[10].value,

    notes:inputs[11].value,

    tripDate:inputs[12].value,
    tripTime:inputs[13].value

  };

  const res = await fetch(`/api/trips/${id}`,{

    method:"PUT",

    headers:{ "Content-Type":"application/json" },

    body:JSON.stringify(updatedTrip)

  });

  if(!res.ok){

    alert("Save failed");
    return;

  }

  await loadHubTrips();
  render();

}

window.saveTripRow = saveTripRow;

/* ===============================
   RENDER
================================ */
function render(){

  hubTrips = hubTrips.filter(t => !shouldRemoveTrip(t));

  container.innerHTML="";

  if(!hubTrips.length){

    container.innerHTML="<p>No trips found</p>";
    return;

  }

  const table=document.createElement("table");

  table.className="hub-table";

  table.innerHTML=`

<thead>

<tr>

<th>#</th>
<th>Trip #</th>
<th>Type</th>

<th>Company</th>

<th>Entry Name</th>
<th>Entry Phone</th>

<th>Client</th>
<th>Client Phone</th>

<th>Pickup</th>

<th>Stops</th>

<th>Dropoff</th>

<th>Notes</th>

<th>Date</th>
<th>Time</th>

<th>Status</th>

<th>Booked At</th>

<th>Actions</th>

</tr>

</thead>

<tbody></tbody>

`;

  const tbody=table.querySelector("tbody");

  hubTrips.forEach(function(t,i){

    const tr=document.createElement("tr");

    rowColor(tr,t);

    const stopsStr = Array.isArray(t.stops)
      ? t.stops.join(" → ")
      : "";

    tr.innerHTML=`

<td>${i+1}</td>

<td><input value="${getTripNumber(t)}" disabled></td>

<td><input value="${t.type||"-"}" disabled></td>

<td><input value="${t.company||""}" disabled></td>

<td><input value="${t.entryName||""}" disabled></td>

<td><input value="${t.entryPhone||""}" disabled></td>

<td><input value="${t.clientName||""}" disabled></td>

<td><input value="${t.clientPhone||""}" disabled></td>

<td><input value="${t.pickup||""}" disabled></td>

<td><input value="${stopsStr}" disabled></td>

<td><input value="${t.dropoff||""}" disabled></td>

<td><textarea disabled>${t.notes||""}</textarea></td>

<td><input type="date" value="${t.tripDate||""}" disabled></td>

<td><input type="time" value="${t.tripTime||""}" disabled></td>

<td>${t.status||"Booked"}</td>

<td>${formatDate(t.bookedAt||t.createdAt)}</td>

<td>

<button class="hub-btn edit-btn"
onclick="editTripRow(this)">
Edit
</button>

<button class="hub-btn save-btn"
style="display:none"
onclick="saveTripRow(this,'${t._id}')">
Save
</button>

<button class="hub-btn delete-btn"
onclick="deleteTripConfirm('${t._id}')">
Delete
</button>

</td>

`;

    tbody.appendChild(tr);

  });

  container.appendChild(table);

}

/* ===============================
   SEARCH
================================ */
if(searchInput){

  searchInput.addEventListener("input",function(){

    const v = searchInput.value.toLowerCase();

    hubTrips = allHubTrips.filter(t =>

      JSON.stringify(t).toLowerCase().includes(v)

    );

    render();

  });

}

/* ===============================
   AUTO REFRESH
================================ */
setInterval(async function(){

  await loadHubTrips();

  render();

},60000);

/* ===============================
   INIT
================================ */
(async function(){

  await loadHubTrips();

  render();

})();