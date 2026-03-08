/* ===============================
   API
================================ */
const API_URL = "/api/trips";

/* ===============================
   LOAD HUB TRIPS (ONLINE)
================================ */
let allHubTrips = [];
let hubTrips = [];

async function loadHubTrips(){
  try{
    const res = await fetch(API_URL);
    const data = await res.json();
    allHubTrips = Array.isArray(data) ? data : [];
    hubTrips = [...allHubTrips];
  }catch{
    allHubTrips = [];
    hubTrips = [];
  }
}

const container   = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn      = document.getElementById("addManualTripBtn");

if (!container) console.error("Missing #hubContainer in HTML");

/* ===============================
   SMALL STYLE
================================ */
(function injectTinyStyle(){
  const s = document.createElement("style");
  s.innerHTML = `
    .hub-table{width:100%;border-collapse:collapse;font-size:11px}
    .hub-table th{background:#0f172a;color:#fff;padding:6px;position:sticky;top:0}
    .hub-table td{border:1px solid #e5e7eb;padding:3px;vertical-align:middle}
    .hub-table input,.hub-table select{
      width:100%;font-size:11px;padding:2px 4px;box-sizing:border-box
    }
    .hub-table textarea{
      width:100%;font-size:11px;padding:2px 4px;box-sizing:border-box;
      resize:vertical;
    }
    .hub-actions{display:flex;gap:6px;justify-content:center;align-items:center}
    .hub-btn{
      border:none;border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;
      color:#fff;opacity:.95;font-weight:bold
    }
    .hub-btn:active{transform:scale(.97)}
    .hub-btn.edit{background:#2563eb}
    .hub-btn.save{background:#16a34a}
    .hub-btn.delete{background:#ef4444}
  `;
  document.head.appendChild(s);
})();

/* ===============================
   FORMAT DATE
================================ */
function formatDate(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* ===============================
   GET TRIP NUMBER
================================ */
function getTripNumber(t){
  if (t && t.tripNumber) return String(t.tripNumber);
  if (t && t.id) return String(t.id);
  if (t && t.bookingNumber) return String(t.bookingNumber);
  return "-";
}

/* ===============================
   CHECK PASSED
================================ */
function isTripPassed(t){
  if(!t || !t.tripDate || !t.tripTime) return false;
  const tripDateTime = new Date(`${t.tripDate}T${t.tripTime}`);
  if(isNaN(tripDateTime)) return false;
  return new Date() >= tripDateTime;
}

/* ===============================
   REMOVE AFTER 24H
================================ */
function shouldRemoveTrip(t){
  if(!t || !t.tripDate || !t.tripTime) return false;
  const tripDateTime = new Date(`${t.tripDate}T${t.tripTime}`);
  if(isNaN(tripDateTime)) return false;
  const diffHours = (new Date() - tripDateTime) / (1000 * 60 * 60);
  return diffHours >= 24;
}

/* ===============================
   COLORS
================================ */
function rowColor(tr, t){

  if(isTripPassed(t)){
    tr.style.backgroundColor = "#ffe5e5";
    tr.style.borderLeft = "4px solid #dc2626";
    return;
  }

  if (t && (t.type === "gh" || t.type === "Individual")) {
    tr.style.backgroundColor = "#e8f4ff";
  }
  else if (t && (t.type === "company" || t.type === "Company")) {
    tr.style.backgroundColor = "#fff6d6";
  }
  else if (t && (t.type === "reserved" || t.type === "Reserved")) {
    tr.style.backgroundColor = "#ecfdf5";
  }
}

/* ===============================
   NEXT RESERVED NUMBER
================================ */
function nextReservedNumber(){
  const key = "lastReservedRV";
  let last = parseInt(localStorage.getItem(key) || "1000", 10);
  last++;
  localStorage.setItem(key, String(last));
  return "RV-" + last;
}

/* ===============================
   ADD RESERVED (ONLINE)
================================ */
async function addReservedTripInline(){

  const newTrip = {
    type: "reserved",
    company: "",
    entryName: "",
    entryPhone: "",
    clientName: "",
    clientPhone: "",
    pickup: "Reserved Pickup",
    stops: [],
    dropoff: "Reserved Dropoff",
    notes: "",
    tripDate: "",
    tripTime: "",
    status: "Booked",
    createdAt: new Date().toISOString(),
    bookedAt: new Date().toISOString()
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newTrip)
  });

  if(!res.ok){
    alert("Failed to add reserved trip");
    return;
  }

  await loadHubTrips();
  render();
}

if(addBtn){
  addBtn.addEventListener("click", async function(e){
    e.preventDefault();
    await addReservedTripInline();
  });
}

/* ===============================
   DELETE
================================ */
async function deleteTripConfirm(tripNumber){

  const ok = confirm("Delete this trip?");
  if(!ok) return;

  const trip = allHubTrips.find(t => String(getTripNumber(t)) === String(tripNumber));
  if(!trip || !trip._id) return;

  const res = await fetch(`/api/trips/${trip._id}`, {
    method: "DELETE"
  });

  if(!res.ok){
    alert("Delete failed");
    return;
  }

  await loadHubTrips();
  render();
}

/* ===============================
   EDIT
================================ */
function editTripRow(btn){

  const ok = confirm("Edit this trip?");
  if(!ok) return;

  const tr = btn.closest("tr");
  const inputs = tr.querySelectorAll("input,textarea");

  inputs.forEach((el,i)=>{
    if(i === 0 || i === 1) return;
    el.disabled = false;
  });

  tr.querySelector(".edit").style.display = "none";
  tr.querySelector(".save").style.display = "inline-block";
}

/* ===============================
   SAVE
================================ */
async function saveTripRow(btn, tripNumber){

  const tr = btn.closest("tr");
  const inputs = tr.querySelectorAll("input,textarea");

  const trip = allHubTrips.find(t => String(getTripNumber(t)) === String(tripNumber));
  if(!trip || !trip._id) return;

  const updatedTrip = {
    company: inputs[3].value,
    entryName: inputs[4].value,
    entryPhone: inputs[5].value,
    clientName: inputs[6].value,
    clientPhone: inputs[7].value,
    pickup: inputs[8].value,
    stops: inputs[9].value
      ? inputs[9].value.split("→").map(s => s.trim()).filter(Boolean)
      : [],
    dropoff: inputs[10].value,
    notes: inputs[11].value,
    tripDate: inputs[12].value,
    tripTime: inputs[13].value
  };

  const res = await fetch(`/api/trips/${trip._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedTrip)
  });

  if(!res.ok){
    alert("Save failed");
    return;
  }

  await loadHubTrips();
  render();
}

/* ===============================
   RENDER
================================ */
function render(){

  hubTrips = hubTrips.filter(t => !shouldRemoveTrip(t));

  container.innerHTML = "";

  if(!hubTrips.length){
    container.innerHTML = "<p>No trips found</p>";
    return;
  }

  const table = document.createElement("table");
  table.className = "hub-table";

  table.innerHTML = `
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

  const tbody = table.querySelector("tbody");

  hubTrips.forEach(function(t, i){

    const tr = document.createElement("tr");
    rowColor(tr, t);

    const tripNum = getTripNumber(t);
    const stopsStr = Array.isArray(t.stops) ? t.stops.join(" → ") : "";

    tr.innerHTML = `
      <td>${i+1}</td>
      <td><input value="${tripNum}" disabled></td>
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
      <td>${formatDate(t.bookedAt || t.createdAt)}</td>
      <td>
        <div class="hub-actions">
          <button class="hub-btn edit" onclick="editTripRow(this)">Edit</button>
          <button class="hub-btn save" style="display:none" onclick="saveTripRow(this,'${tripNum}')">Save</button>
          <button class="hub-btn delete" onclick="deleteTripConfirm('${tripNum}')">Delete</button>
        </div>
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
  searchInput.addEventListener("input", function(){
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