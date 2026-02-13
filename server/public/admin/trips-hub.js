/* ===============================
   LOAD HUB TRIPS
================================ */
const hubKey = "tripsHub";
let hubTrips = [];

try {
  hubTrips = JSON.parse(localStorage.getItem(hubKey)) || [];
} catch {
  hubTrips = [];
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
   CHECK IF TRIP EXPIRED (AFTER 24 HOURS)
================================ */
function isTripExpired(t){
  if(!t || !t.tripDate || !t.tripTime) return false;

  const tripDateTime = new Date(`${t.tripDate}T${t.tripTime}`);
  if(isNaN(tripDateTime)) return false;

  const now = new Date();
  const diffHours = (now - tripDateTime) / (1000 * 60 * 60);

  return diffHours >= 24;
}

/* ===============================
   COLORS
================================ */
function rowColor(tr, t){

  if(isTripExpired(t)){
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
   ADD RESERVED TRIP
================================ */
function addReservedTripInline(){
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
  localStorage.setItem(hubKey, JSON.stringify(hubTrips));
  render(hubTrips);
}

if(addBtn){
  addBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    addReservedTripInline();
  });
}

/* ===============================
   RENDER
================================ */
function render(list){

  container.innerHTML = "";

  if(!list || !list.length){
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

  list.forEach((t, i) => {

    const tr = document.createElement("tr");
    rowColor(tr, t);

    const tripNum = getTripNumber(t);
    const stopsStr = Array.isArray(t.stops) && t.stops.length
      ? t.stops.join(" → ")
      : "";

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
   EDIT
================================ */
function editTripInline(btn, tripNumber){

  const row = btn.closest("tr");
  const fields = row.querySelectorAll(".editField");

  if(btn.dataset.mode !== "edit"){

    const ok = confirm("⚠️ Edit this trip?");
    if(!ok) return;

    fields.forEach(el => el.disabled = false);

    btn.dataset.mode = "edit";
    btn.classList.remove("edit");
    btn.classList.add("save");
    btn.innerText = "💾 Save";

  } else {

    const inputs = row.querySelectorAll(".editField");

    const stopsArr = inputs[6].value
      ? inputs[6].value.split("→").map(x=>x.trim()).filter(Boolean)
      : [];

    const idx = hubTrips.findIndex(x =>
      String(getTripNumber(x)) === String(tripNumber)
    );

    if(idx !== -1){
      hubTrips[idx] = {
        ...hubTrips[idx],
        company: inputs[0].value,
        entryName: inputs[1].value,
        entryPhone: inputs[2].value,
        clientName: inputs[3].value,
        clientPhone: inputs[4].value,
        pickup: inputs[5].value,
        stops: stopsArr,
        dropoff: inputs[7].value,
        notes: inputs[8].value,
        tripDate: inputs[9].value,
        tripTime: inputs[10].value
      };

      localStorage.setItem(hubKey, JSON.stringify(hubTrips));
    }

    fields.forEach(el => el.disabled = true);

    btn.dataset.mode = "";
    btn.classList.remove("save");
    btn.classList.add("edit");
    btn.innerText = "✏️ Edit";

    render(hubTrips);
  }
}

/* ===============================
   DELETE
================================ */
function deleteTripConfirm(tripNumber){
  const ok = confirm("Delete this trip?");
  if(!ok) return;

  hubTrips = hubTrips.filter(t =>
    String(getTripNumber(t)) !== String(tripNumber)
  );

  localStorage.setItem(hubKey, JSON.stringify(hubTrips));
  render(hubTrips);
}

/* ===============================
   SEARCH
================================ */
if(searchInput){
  searchInput.addEventListener("input", ()=>{
    const v = searchInput.value.toLowerCase();
    render(
      hubTrips.filter(t =>
        JSON.stringify(t).toLowerCase().includes(v)
      )
    );
  });
}

/* ===============================
   AUTO REFRESH COLOR
================================ */
setInterval(()=>{
  render(hubTrips);
},60000);

/* ===============================
   INIT
================================ */
render(hubTrips);