/* ===============================
   API
================================ */
const API_URL = "/api/trips/company";

/* ===============================
   STATE
================================ */
let allHubTrips = [];
let hubTrips = [];
let currentSearch = "";

const container   = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn      = document.getElementById("addManualTripBtn");

if (!container) console.error("Missing #hubContainer");

/* ===============================
   STYLE
================================ */
(function injectTinyStyle(){
  if (document.getElementById("tripHopTinyStyle")) return;

  const s = document.createElement("style");
  s.id = "tripHopTinyStyle";
  s.innerHTML = `
    .hub-table{width:100%;border-collapse:collapse;font-size:11px}
    .hub-table th{background:#0f172a;color:#fff;padding:6px;position:sticky;top:0;z-index:2}
    .hub-table td{border:1px solid #e5e7eb;padding:3px;vertical-align:middle}
    .hub-table input,.hub-table select,.hub-table textarea{
      width:100%;font-size:11px;padding:2px 4px;box-sizing:border-box
    }
    .hub-table textarea{resize:vertical}
    .hub-actions{display:flex;gap:6px;justify-content:center;align-items:center}
    .hub-btn{
      border:none;border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;
      color:#fff;opacity:.9
    }
    .hub-btn:active{transform:scale(.97)}
    .hub-btn.edit{background:#3b82f6}
    .hub-btn.save{background:#16a34a}
    .hub-btn.delete{background:#ef4444}
  `;
  document.head.appendChild(s);
})();

/* ===============================
   HELPERS
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

function getTripNumber(t){
  if (t && t.tripNumber) return String(t.tripNumber);
  if (t && t.id) return String(t.id);
  if (t && t.bookingNumber) return String(t.bookingNumber);
  return "-";
}

function getBookedAt(t){
  return t?.bookedAt || t?.createdAt || "";
}

function getTripTypeLabel(t){
  if (!t) return "-";
  if (t.type === "gh") return "Individual";
  if (t.type === "reserved") return "Reserved";
  if (t.type === "Reserved") return "Reserved";
  return "Company";
}

function isTripPassed(t){
  if(!t || !t.tripDate || !t.tripTime) return false;
  const tripDateTime = new Date(`${t.tripDate}T${t.tripTime}`);
  if(isNaN(tripDateTime)) return false;
  return new Date() >= tripDateTime;
}

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

  if (t && t.type === "gh") {
    tr.style.backgroundColor = "#e8f4ff";
  }
  else if (t && (t.type === "reserved" || t.type === "Reserved")) {
    tr.style.backgroundColor = "#ecfdf5";
  }
  else {
    tr.style.backgroundColor = "#fff6d6";
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
   LOAD HUB TRIPS
================================ */
async function loadHubTrips(){
  try{
    const res = await fetch(API_URL);
    const data = await res.json();
    allHubTrips = Array.isArray(data) ? data : [];
    applySearch();
  }catch(err){
    console.error("Load trips error:", err);
    allHubTrips = [];
    hubTrips = [];
  }
}

/* ===============================
   SEARCH APPLY
================================ */
function applySearch(){
  const baseTrips = [...allHubTrips].filter(t => !shouldRemoveTrip(t));

  if(!currentSearch){
    hubTrips = baseTrips;
    return;
  }

  const v = currentSearch.toLowerCase();
  hubTrips = baseTrips.filter(t =>
    JSON.stringify(t).toLowerCase().includes(v)
  );
}

/* ===============================
   ADD RESERVED
   IMPORTANT:
   backend must support type:"reserved"
================================ */
async function addReservedTripInline(){

  const reservedNumber = nextReservedNumber();

  const newTrip = {
    tripNumber: reservedNumber,
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
    createdAt: new Date().toISOString()
  };

  try{
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTrip)
    });

    const data = await res.json();

    if(!res.ok){
      alert(data.message || "Failed to add reserved trip");
      return;
    }

    await loadHubTrips();
    render();
  }catch(err){
    console.error("Add reserved error:", err);
    alert("Failed to add reserved trip");
  }
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

  try{
    await fetch(`/api/trips/${trip._id}`, {
      method: "DELETE"
    });

    await loadHubTrips();
    render();
  }catch(err){
    console.error("Delete error:", err);
    alert("Delete failed");
  }
}

/* ===============================
   EDIT
================================ */
function editTripRow(btn){
  const tr = btn.closest("tr");
  if(!tr) return;

  const inputs = tr.querySelectorAll("input, textarea");

  inputs.forEach((el, index) => {
    /* لا نفتح Trip# ولا Type */
    if(index === 0 || index === 1) return;
    el.disabled = false;
  });

  const saveBtn = tr.querySelector(".save");
  const editBtn = tr.querySelector(".edit");

  if(saveBtn) saveBtn.style.display = "inline-block";
  if(editBtn) editBtn.style.display = "none";
}

/* ===============================
   SAVE
================================ */
async function saveTripRow(btn, id){

  const tr = btn.closest("tr");
  if(!tr) return;

  const inputs = tr.querySelectorAll("input, textarea");

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

  try{
    await fetch("/api/trips/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip)
    });

    await loadHubTrips();
    render();
  }catch(err){
    console.error("Save error:", err);
    alert("Save failed");
  }
}

/* expose for inline onclick */
window.deleteTripConfirm = deleteTripConfirm;
window.editTripRow = editTripRow;
window.saveTripRow = saveTripRow;

/* ===============================
   RENDER
================================ */
function render(){

  applySearch();

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
      <td><input value="${getTripTypeLabel(t)}" disabled></td>
      <td><input value="${t.company || ""}" disabled></td>
      <td><input value="${t.entryName || ""}" disabled></td>
      <td><input value="${t.entryPhone || ""}" disabled></td>
      <td><input value="${t.clientName || ""}" disabled></td>
      <td><input value="${t.clientPhone || ""}" disabled></td>
      <td><input value="${t.pickup || ""}" disabled></td>
      <td><input value="${stopsStr}" disabled></td>
      <td><input value="${t.dropoff || ""}" disabled></td>
      <td><textarea disabled>${t.notes || ""}</textarea></td>
      <td><input type="date" value="${t.tripDate || ""}" disabled></td>
      <td><input type="time" value="${t.tripTime || ""}" disabled></td>
      <td>${t.status || "Booked"}</td>
      <td>${formatDate(getBookedAt(t))}</td>
      <td>
        <div class="hub-actions">
          <button class="hub-btn edit" onclick="editTripRow(this)">Edit</button>
          <button class="hub-btn save save" style="display:none" onclick="saveTripRow(this,'${t._id}')">Save</button>
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
    currentSearch = searchInput.value.trim();
    render();
  });
}

/* ===============================
   AUTO REFRESH
================================ */
setInterval(async function(){
  await loadHubTrips();
  render();
}, 60000);

/* ===============================
   INIT
================================ */
(async function(){
  await loadHubTrips();
  render();
})();