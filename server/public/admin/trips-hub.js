/* ===============================
   API
================================ */
const LOAD_API_URL = "/api/trips/company";
const CREATE_API_URL = "/api/trips";

/* ===============================
   STATE
================================ */
let allHubTrips = [];
let hubTrips = [];
let currentSearch = "";

/* ===============================
   ELEMENTS
================================ */
const container = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn = document.getElementById("addManualTripBtn");

/* ===============================
   LOAD TRIPS
================================ */
async function loadHubTrips() {

  try {

    const res = await fetch(LOAD_API_URL);
    const data = await res.json();

    allHubTrips = Array.isArray(data) ? data : [];

    applySearch();
    render();

  } catch (err) {

    console.error("Load trips error:", err);

  }

}

/* ===============================
   SEARCH
================================ */
function applySearch() {

  if (!currentSearch) {
    hubTrips = [...allHubTrips];
    return;
  }

  const v = currentSearch.toLowerCase();

  hubTrips = allHubTrips.filter(t =>
    JSON.stringify(t).toLowerCase().includes(v)
  );

}

/* ===============================
   ADD RESERVED
================================ */
async function addReservedTripInline() {

  const newTrip = {

    type: "reserved",

    company: "",

    entryName: "",
    entryPhone: "",

    clientName: "",
    clientPhone: "",

    pickup: "Reserved Pickup",
    dropoff: "Reserved Dropoff",

    stops: [],

    tripDate: "",
    tripTime: "",

    notes: "",

    status: "Scheduled"

  };

  try {

    const res = await fetch(CREATE_API_URL, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(newTrip)

    });

    if (!res.ok) {

      alert("Failed to create trip");
      return;

    }

    await loadHubTrips();

  } catch (err) {

    console.error("Create trip error:", err);

  }

}

if (addBtn) {
  addBtn.addEventListener("click", addReservedTripInline);
}

/* ===============================
   DELETE
================================ */
async function deleteTripConfirm(id) {

  const ok = confirm("Delete this trip?");
  if (!ok) return;

  try {

    const res = await fetch(`/api/trips/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      alert("Delete failed");
      return;
    }

    await loadHubTrips();

  } catch (err) {

    console.error("Delete error:", err);

  }

}

/* ===============================
   EDIT
================================ */
function editTripRow(btn) {

  const tr = btn.closest("tr");
  const inputs = tr.querySelectorAll("input, textarea");

  inputs.forEach((el, index) => {

    if (index === 0 || index === 1) return;

    el.disabled = false;

  });

  tr.querySelector(".edit").style.display = "none";
  tr.querySelector(".save").style.display = "inline-block";

}

/* ===============================
   SAVE
================================ */
async function saveTripRow(btn, id) {

  const tr = btn.closest("tr");
  const inputs = tr.querySelectorAll("input, textarea");

  const updatedTrip = {

    company: inputs[2].value,

    entryName: inputs[3].value,
    entryPhone: inputs[4].value,

    clientName: inputs[5].value,
    clientPhone: inputs[6].value,

    pickup: inputs[7].value,

    stops: inputs[8].value
      ? inputs[8].value.split("→").map(s => s.trim()).filter(Boolean)
      : [],

    dropoff: inputs[9].value,

    notes: inputs[10].value,

    tripDate: inputs[11].value,
    tripTime: inputs[12].value

  };

  try {

    const res = await fetch(`/api/trips/${id}`, {

      method: "PUT",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(updatedTrip)

    });

    if (!res.ok) {

      alert("Save failed");
      return;

    }

    await loadHubTrips();

  } catch (err) {

    console.error("Save error:", err);

  }

}

window.editTripRow = editTripRow;
window.saveTripRow = saveTripRow;
window.deleteTripConfirm = deleteTripConfirm;

/* ===============================
   RENDER
================================ */
function render() {

  container.innerHTML = "";

  if (!hubTrips.length) {

    container.innerHTML = "<p>No trips found</p>";
    return;

  }

  const table = document.createElement("table");
  table.className = "hub-table";

  table.innerHTML = `
<thead>
<tr>
<th>#</th>
<th>Trip</th>
<th>Type</th>
<th>Company</th>
<th>Entry</th>
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
<th>Actions</th>
</tr>
</thead>
<tbody></tbody>
`;

  const tbody = table.querySelector("tbody");

  hubTrips.forEach((t, i) => {

    const tr = document.createElement("tr");

    const stops = Array.isArray(t.stops) ? t.stops.join(" → ") : "";

    tr.innerHTML = `
<td>${i + 1}</td>

<td><input value="${t.tripNumber || ""}" disabled></td>
<td><input value="${t.type || ""}" disabled></td>

<td><input value="${t.company || ""}" disabled></td>

<td><input value="${t.entryName || ""}" disabled></td>
<td><input value="${t.entryPhone || ""}" disabled></td>

<td><input value="${t.clientName || ""}" disabled></td>
<td><input value="${t.clientPhone || ""}" disabled></td>

<td><input value="${t.pickup || ""}" disabled></td>

<td><input value="${stops}" disabled></td>

<td><input value="${t.dropoff || ""}" disabled></td>

<td><textarea disabled>${t.notes || ""}</textarea></td>

<td><input type="date" value="${t.tripDate || ""}" disabled></td>
<td><input type="time" value="${t.tripTime || ""}" disabled></td>

<td>${t.status || ""}</td>

<td>

<button class="edit" onclick="editTripRow(this)">Edit</button>

<button class="save" style="display:none"
onclick="saveTripRow(this,'${t._id}')">
Save
</button>

<button class="delete"
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
   SEARCH INPUT
================================ */
if (searchInput) {

  searchInput.addEventListener("input", function () {

    currentSearch = searchInput.value.trim();
    applySearch();
    render();

  });

}

/* ===============================
   AUTO REFRESH
================================ */
setInterval(loadHubTrips, 30000);

/* ===============================
   INIT
================================ */
loadHubTrips();