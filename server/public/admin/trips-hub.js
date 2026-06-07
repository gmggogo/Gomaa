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
  const oldStyle = document.getElementById("hub-inline-style");
  if(oldStyle) oldStyle.remove();

  const s = document.createElement("style");
  s.id = "hub-inline-style";
  s.innerHTML = `
    .hub-actions{
      display:flex;
      gap:6px;
      justify-content:center;
      align-items:center;
      flex-wrap:wrap;
    }

    .input-wrap{
      position:relative;
      width:100%;
    }

    .suggestions{
      position:absolute;
      top:100%;
      left:0;
      right:0;
      background:#fff;
      border:1px solid #cbd5e1;
      border-radius:8px;
      z-index:9999;
      max-height:220px;
      overflow:auto;
      box-shadow:0 12px 24px rgba(0,0,0,.10);
      margin-top:4px;
      text-align:left;
    }

    .option{
      padding:10px 12px;
      cursor:pointer;
      font-size:13px;
      line-height:1.35;
      border-bottom:1px solid #eef2f7;
      background:#fff;
      color:#111827;
    }

    .option:last-child{
      border-bottom:none;
    }

    .option:hover{
      background:#eff6ff;
    }

    .option.disabled{
      cursor:default;
      color:#64748b;
      background:#f8fafc;
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

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
}

function getTripDateTime(t){
  if(!t || !t.tripDate || !t.tripTime) return null;
  const dt = new Date(`${t.tripDate}T${t.tripTime}:00`);
  return isNaN(dt) ? null : dt;
}

function isTripPassed(t){
  const tripDateTime = getTripDateTime(t);
  if(!tripDateTime) return false;
  return getAZNow() >= tripDateTime;
}

function shouldRemoveTrip(t){
  const tripDateTime = getTripDateTime(t);
  if(!tripDateTime) return false;
  const diffHours = (getAZNow() - tripDateTime) / (1000 * 60 * 60);
  return diffHours >= 24;
}

function validateFutureTrip(dateStr, timeStr){
  if(!dateStr || !timeStr) return { ok:false, message:"Missing trip date or time" };

  const tripDateTime = new Date(`${dateStr}T${timeStr}:00`);
  if(isNaN(tripDateTime)) return { ok:false, message:"Invalid trip date/time" };

  const now = getAZNow();
  if(tripDateTime <= now){
    return { ok:false, message:"❌ Cannot save trip in the past" };
  }

  return { ok:true };
}

function wrapEditableInput(value, cls, type="text"){
  return `
    <div class="input-wrap">
      <input class="${cls}" data-edit="1" type="${type}" value="${safe(value)}" disabled>
    </div>
  `;
}

/* ===============================
   AUTOCOMPLETE
================================ */
const editSelectedAddresses = {};

async function searchAddress(q){
  const query = String(q || "").trim();
  if(!query || query.length < 3) return [];

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us&viewbox=-115,35.5,-108.5,31&bounded=1`
    );

    if(!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }catch(err){
    console.error("Address search error:", err);
    return [];
  }
}

function attachAutocomplete(input, tripId, field){
  if(!input) return;

  const wrap = input.closest(".input-wrap") || input.parentNode;
  if(!wrap) return;

  let oldBox = wrap.querySelector(".suggestions");
  if(oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);

  let timer = null;
  input.setAttribute("autocomplete", "off");

  input.addEventListener("focus", async function(){
    const q = input.value.trim();
    if(q.length < 3) return;

    const results = await searchAddress(q);
    renderSuggestions(box, results);
  });

  input.addEventListener("input", function(){
    if(!editSelectedAddresses[tripId]){
      editSelectedAddresses[tripId] = {};
    }
    editSelectedAddresses[tripId][field] = null;

    clearTimeout(timer);

    const q = input.value.trim();
    if(q.length < 3){
      box.innerHTML = "";
      return;
    }

    timer = setTimeout(async () => {
      const results = await searchAddress(q);
      renderSuggestions(box, results);
    }, 250);
  });

  box.addEventListener("click", function(e){
    const el = e.target.closest(".option");
    if(!el || el.classList.contains("disabled")) return;

    const obj = {
      address: el.dataset.address,
      lat: Number(el.dataset.lat),
      lng: Number(el.dataset.lng)
    };

    if(!editSelectedAddresses[tripId]){
      editSelectedAddresses[tripId] = {};
    }

    editSelectedAddresses[tripId][field] = obj;
    input.value = obj.address;
    box.innerHTML = "";
  });

  input.addEventListener("blur", function(){
    setTimeout(() => {
      box.innerHTML = "";
    }, 180);
  });
}

function renderSuggestions(box, results){
  if(!box) return;

  if(!results.length){
    box.innerHTML = `<div class="option disabled">No results</div>`;
    return;
  }

  box.innerHTML = results.map(r => `
    <div class="option"
         data-address="${safe(r.display_name)}"
         data-lat="${safe(r.lat)}"
         data-lng="${safe(r.lon)}">
      ${safe(r.display_name)}
    </div>
  `).join("");
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

  const trip = hubTrips.find(x => x._id === id);

  editSelectedAddresses[id] = {
    pickup: trip?.pickup && trip?.pickupLat != null && trip?.pickupLng != null
      ? {
          address: trip.pickup,
          lat: Number(trip.pickupLat),
          lng: Number(trip.pickupLng)
        }
      : null,
    dropoff: trip?.dropoff && trip?.dropoffLat != null && trip?.dropoffLng != null
      ? {
          address: trip.dropoff,
          lat: Number(trip.dropoffLat),
          lng: Number(trip.dropoffLng)
        }
      : null
  };

  const pickup = tr.querySelector(".pickup-input");
  const dropoff = tr.querySelector(".dropoff-input");

  if(pickup) attachAutocomplete(pickup, id, "pickup");
  if(dropoff) attachAutocomplete(dropoff, id, "dropoff");

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

  const validTime = validateFutureTrip(updatedTrip.tripDate, updatedTrip.tripTime);
  if(!validTime.ok){
    alert(validTime.message);
    return;
  }

  const selected = editSelectedAddresses[id] || {};

  if(!selected.pickup || !selected.pickup.address){
    alert("Select pickup from suggestions ❌");
    return;
  }

  if(!selected.dropoff || !selected.dropoff.address){
    alert("Select dropoff from suggestions ❌");
    return;
  }

  updatedTrip.pickup = selected.pickup.address;
  updatedTrip.pickupLat = Number(selected.pickup.lat);
  updatedTrip.pickupLng = Number(selected.pickup.lng);

  updatedTrip.dropoff = selected.dropoff.address;
  updatedTrip.dropoffLat = Number(selected.dropoff.lat);
  updatedTrip.dropoffLng = Number(selected.dropoff.lng);

  try{
    const res = await fetch(`${API_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedTrip)
    });

    if (!res.ok) {
      throw new Error("Failed to save trip");
    }

    delete editSelectedAddresses[id];
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
        <td>${wrapEditableInput(t.company || "", "company-input")}</td>
        <td>${wrapEditableInput(t.entryName || "", "entryname-input")}</td>
        <td>${wrapEditableInput(t.entryPhone || "", "entryphone-input")}</td>
        <td>${wrapEditableInput(t.clientName || "", "clientname-input")}</td>
        <td>${wrapEditableInput(t.clientPhone || "", "clientphone-input")}</td>
        <td>${wrapEditableInput(t.pickup || "", "pickup-input")}</td>
        <td>${wrapEditableInput(stopsStr, "stops-input")}</td>
        <td>${wrapEditableInput(t.dropoff || "", "dropoff-input")}</td>
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
   GLOBALS
================================ */
window.editTripConfirm = editTripConfirm;
window.saveTripConfirm = saveTripConfirm;
window.deleteTripConfirm = deleteTripConfirm;

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