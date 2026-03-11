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

if (!container) console.error("Missing #hubContainer in HTML");

/* ===============================
   SMALL STYLE
================================ */
(function injectTinyStyle(){
  const s = document.createElement("style");
  s.innerHTML = `
    .hub-actions{
      display:flex;
      gap:6px;
      justify-content:center;
      align-items:center;
      flex-wrap:wrap;
    }
  `;
  document.head.appendChild(s);
})();

/* ===============================
   HELPERS
================================ */
function safe(v){
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeType(type){
  return String(type || "").trim().toLowerCase();
}

function normalizeStatus(status){
  return String(status || "").trim().toLowerCase();
}

function displayType(type){
  const t = normalizeType(type);
  if (t === "reserved") return "Reserved";
  if (t === "individual") return "Individual";
  if (t === "company") return "Company";
  if (t === "gh") return "GH";
  return type || "-";
}

function displayStatus(status){
  const s = normalizeStatus(status);
  if (s === "confirmed") return "Confirmed";
  if (s === "cancelled") return "Cancelled";
  if (s === "completed") return "Completed";
  if (s === "booked") return "Booked";
  if (s === "scheduled") return "Scheduled";
  return status || "Confirmed";
}

function getTripNumber(t){
  if (t && t.tripNumber) return String(t.tripNumber);
  if (t && t.id) return String(t.id);
  if (t && t.bookingNumber) return String(t.bookingNumber);
  return "-";
}

function bookedDateKey(t){
  const source = t.bookedAt || t.createdAt;
  const d = new Date(source);
  if (isNaN(d)) return "Unknown Date";
  return d.toLocaleDateString();
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
   LOAD HUB TRIPS
================================ */
async function loadHubTrips(){
  try{
    const res = await fetch(API_URL);
    const data = await res.json();
    const allTrips = Array.isArray(data) ? data : [];

    hubTrips = allTrips
      .filter(t => !shouldRemoveTrip(t))
      .filter(t => {
        const s = normalizeStatus(t.status);
        return s === "confirmed" || s === "cancelled";
      });

    filteredTrips = [...hubTrips];
  }catch(err){
    console.error("Load Trips Error:", err);
    hubTrips = [];
    filteredTrips = [];
  }
}

/* ===============================
   COLORS
================================ */
function rowColor(tr, t){
  const status = normalizeStatus(t?.status);

  if(status === "cancelled"){
    tr.style.backgroundColor = "#f1f5f9";
    tr.style.borderLeft = "4px solid #64748b";
    return;
  }

  if(isTripPassed(t)){
    tr.style.backgroundColor = "#ffe5e5";
    tr.style.borderLeft = "4px solid #dc2626";
    return;
  }

  const type = normalizeType(t?.type);

  if (type === "individual") {
    tr.style.backgroundColor = "#e8f4ff";
  }
  else if (type === "company") {
    tr.style.backgroundColor = "#fff6d6";
  }
  else if (type === "reserved") {
    tr.style.backgroundColor = "#ecfdf5";
  }
}

/* ===============================
   ADD RESERVED
================================ */
async function addReservedTripInline(){
  if (isAddingReservedTrip) return;

  isAddingReservedTrip = true;
  if (addBtn) addBtn.disabled = true;

  try{
    const newTrip = {
      type: "reserved",
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
      status: "Confirmed",
      createdAt: new Date().toISOString(),
      bookedAt: new Date().toISOString()
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTrip)
    });

    if (!res.ok) {
      throw new Error("Failed to add reserved trip");
    }

    await loadHubTrips();
    render();
  }catch(err){
    console.error("Add Reserved Trip Error:", err);
    alert("Could not add reserved trip.");
  }finally{
    isAddingReservedTrip = false;
    if (addBtn) addBtn.disabled = false;
  }
}

/* ===============================
   EDIT
================================ */
function editTripConfirm(id){
  const tr = document.getElementById(`row-${id}`);
  if (!tr) return;

  const fields = tr.querySelectorAll(
    "input[data-edit='1'], textarea[data-edit='1'], select[data-edit='1']"
  );

  fields.forEach(el => {
    el.disabled = false;
  });

  const editBtn = tr.querySelector(".edit-btn");
  const saveBtn = tr.querySelector(".save-btn");

  if (editBtn) editBtn.style.display = "none";
  if (saveBtn) saveBtn.style.display = "inline-block";
}

/* ===============================
   SAVE
================================ */
async function saveTripConfirm(id){
  const tr = document.getElementById(`row-${id}`);
  if (!tr) return;

  const stopsInput = tr.querySelector(".stops-input");
  const statusSelect = tr.querySelector(".status-input");

  const updatedTrip = {
    company: tr.querySelector(".company-input")?.value || "",
    entryName: tr.querySelector(".entryname-input")?.value || "",
    entryPhone: tr.querySelector(".entryphone-input")?.value || "",
    clientName: tr.querySelector(".clientname-input")?.value || "",
    clientPhone: tr.querySelector(".clientphone-input")?.value || "",
    pickup: tr.querySelector(".pickup-input")?.value || "",
    stops: stopsInput
      ? stopsInput.value.split("→").map(s => s.trim()).filter(Boolean)
      : [],
    dropoff: tr.querySelector(".dropoff-input")?.value || "",
    notes: tr.querySelector(".notes-input")?.value || "",
    tripDate: tr.querySelector(".tripdate-input")?.value || "",
    tripTime: tr.querySelector(".triptime-input")?.value || "",
    status: statusSelect?.value || "Confirmed"
  };

  try{
    const res = await fetch(`${API_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip)
    });

    if (!res.ok) {
      throw new Error("Failed to save trip");
    }

    await loadHubTrips();
    render();
  }catch(err){
    console.error("Save Trip Error:", err);
    alert("Could not save trip.");
  }
}

/* ===============================
   DELETE
================================ */
async function deleteTripConfirm(id){
  const ok = confirm("Delete this trip?");
  if(!ok) return;

  try{
    const res = await fetch(`${API_URL}/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      throw new Error("Failed to delete trip");
    }

    await loadHubTrips();
    render();
  }catch(err){
    console.error("Delete Trip Error:", err);
    alert("Could not delete trip.");
  }
}

/* ===============================
   GROUP BY BOOKED DATE
================================ */
function groupTripsByBookedDate(trips){
  const groups = {};

  trips.forEach(t => {
    const key = bookedDateKey(t);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  return groups;
}

/* ===============================
   RENDER
================================ */
function render(){
  container.innerHTML = "";

  if(!filteredTrips.length){
    container.innerHTML = `<p class="no-data">No trips found</p>`;
    return;
  }

  const groups = groupTripsByBookedDate(filteredTrips);

  Object.keys(groups).forEach(dateKey => {
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = dateKey;
    container.appendChild(title);

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

    groups[dateKey].forEach((t, i) => {
      const tr = document.createElement("tr");
      tr.id = `row-${t._id}`;
      rowColor(tr, t);

      const stopsStr = Array.isArray(t.stops) ? t.stops.join(" → ") : "";

      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><input value="${safe(getTripNumber(t))}" disabled></td>
        <td><input value="${safe(displayType(t.type))}" disabled></td>
        <td><input class="company-input" data-edit="1" value="${safe(t.company || "")}" disabled></td>
        <td><input class="entryname-input" data-edit="1" value="${safe(t.entryName || "")}" disabled></td>
        <td><input class="entryphone-input" data-edit="1" value="${safe(t.entryPhone || "")}" disabled></td>
        <td><input class="clientname-input" data-edit="1" value="${safe(t.clientName || "")}" disabled></td>
        <td><input class="clientphone-input" data-edit="1" value="${safe(t.clientPhone || "")}" disabled></td>
        <td><input class="pickup-input" data-edit="1" value="${safe(t.pickup || "")}" disabled></td>
        <td><input class="stops-input" data-edit="1" value="${safe(stopsStr)}" disabled></td>
        <td><input class="dropoff-input" data-edit="1" value="${safe(t.dropoff || "")}" disabled></td>
        <td><textarea class="notes-input" data-edit="1" disabled>${safe(t.notes || "")}</textarea></td>
        <td><input class="tripdate-input" data-edit="1" type="date" value="${safe(t.tripDate || "")}" disabled></td>
        <td><input class="triptime-input" data-edit="1" type="time" value="${safe(t.tripTime || "")}" disabled></td>
        <td>
          <select class="status-input" data-edit="1" disabled>
            <option value="Confirmed" ${displayStatus(t.status) === "Confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="Cancelled" ${displayStatus(t.status) === "Cancelled" ? "selected" : ""}>Cancelled</option>
            <option value="Completed" ${displayStatus(t.status) === "Completed" ? "selected" : ""}>Completed</option>
          </select>
        </td>
        <td>${safe(formatDate(t.bookedAt || t.createdAt))}</td>
        <td>
          <div class="hub-actions">
            <button class="hub-btn edit-btn edit" onclick="editTripConfirm('${t._id}')">Edit</button>
            <button class="hub-btn save-btn save" style="display:none" onclick="saveTripConfirm('${t._id}')">Save</button>
            <button class="hub-btn delete-btn delete" onclick="deleteTripConfirm('${t._id}')">Delete</button>
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
  searchInput.addEventListener("input", function(){
    const v = searchInput.value.toLowerCase().trim();

    if (!v) {
      filteredTrips = [...hubTrips];
      render();
      return;
    }

    filteredTrips = hubTrips.filter(t =>
      JSON.stringify(t).toLowerCase().includes(v)
    );

    render();
  });
}

/* ===============================
   ADD BUTTON
================================ */
if(addBtn){
  addBtn.addEventListener("click", async function(e){
    e.preventDefault();
    await addReservedTripInline();
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