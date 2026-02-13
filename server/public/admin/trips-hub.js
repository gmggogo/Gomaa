/* ===============================
   API
================================ */
const API_URL = "/api/trips";

/* ===============================
   LOAD HUB TRIPS (ONLINE)
================================ */
let hubTrips = [];

async function loadHubTrips(){
  try{
    const res = await fetch(API_URL);
    const data = await res.json();
    hubTrips = Array.isArray(data) ? data : [];
  }catch{
    hubTrips = [];
  }
}

async function saveHubTrips(){
  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hubTrips)
  });
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
      color:#fff;opacity:.8
    }
    .hub-btn:active{transform:scale(.97)}
    .hub-btn.edit{background:#3b82f6}
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

  if (t && t.type === "Individual") {
    tr.style.backgroundColor = "#e8f4ff";
  }
  else if (t && t.type === "Company") {
    tr.style.backgroundColor = "#fff6d6";
  }
  else if (t && t.type === "Reserved") {
    tr.style.backgroundColor = "#ecfdf5";
  }
}

/* ===============================
   NEXT RESERVED NUMBER
================================ */
function nextReservedNumber(){
  const key = "lastReservedRE";
  let last = parseInt(localStorage.getItem(key) || "1000", 10);
  last++;
  localStorage.setItem(key, String(last));
  return "RE-" + last;
}

/* ===============================
   ADD RESERVED
================================ */
async function addReservedTripInline(){

  const newTrip = {
    tripNumber: nextReservedNumber(),
    type: "Reserved",
    company: "",
    entryName: "",
    entryPhone: "",
    clientName: "",
    clientPhone: "",
    pickup: "",
    stops: [],
    dropoff: "",
    notes: "",
    tripDate: "",
    tripTime: "",
    status: "Booked",
    bookedAt: new Date().toISOString()
  };

  hubTrips.unshift(newTrip);
  await saveHubTrips();
  render();
}

if(addBtn){
  addBtn.addEventListener("click", async function(e){
    e.preventDefault();
    await addReservedTripInline();
  });
}

/* ===============================
   RENDER
================================ */
async function render(){

  hubTrips = hubTrips.filter(function(t){
    return !shouldRemoveTrip(t);
  });

  await saveHubTrips();

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
      <td><input class="editField" value="${t.company||""}" disabled></td>
      <td><input class="editField" value="${t.entryName||""}" disabled></td>
      <td><input class="editField" value="${t.entryPhone||""}" disabled></td>
      <td><input class="editField" value="${t.clientName||""}" disabled></td>
      <td><input class="editField" value="${t.clientPhone||""}" disabled></td>
      <td><input class="editField" value="${t.pickup||""}" disabled></td>
      <td><input class="editField" value="${stopsStr}" disabled></td>
      <td><input class="editField" value="${t.dropoff||""}" disabled></td>
      <td><textarea class="editField" disabled>${t.notes||""}</textarea></td>
      <td><input class="editField" type="date" value="${t.tripDate||""}" disabled></td>
      <td><input class="editField" type="time" value="${t.tripTime||""}" disabled></td>
      <td>${t.status||"Booked"}</td>
      <td>${formatDate(t.bookedAt)}</td>
      <td>
        <div class="hub-actions">
          <button class="hub-btn edit" onclick="editTripInline(this,'${tripNum}')">✏️ Edit</button>
          <button class="hub-btn delete" onclick="deleteTripConfirm('${tripNum}')">🗑 Delete</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  container.appendChild(table);
}

/* ===============================
   INIT
================================ */
(async function(){
  await loadHubTrips();
  await render();
})();