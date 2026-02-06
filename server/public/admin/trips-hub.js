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
const addBtn      = document.getElementById("addManualTripBtn"); // top button

if (!container) console.error("Missing #hubContainer in HTML");

/* ===============================
   SMALL STYLE (optional inline)
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
    .hub-actions{display:flex;gap:6px;justify-content:center;align-items:center}
    .hub-btn{
      border:none;border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;
      color:#fff;opacity:.65
    }
    .hub-btn:active{transform:scale(.97)}
    .hub-btn.edit{background:#3b82f6}
    .hub-btn.save{background:#16a34a}
    .hub-btn.delete{background:#ef4444}
  `;
  document.head.appendChild(s);
})();

/* ===============================
   NAV
================================ */
function goBack(){
  window.location.href = "dashboard.html";
}

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
   MIGRATION (READ ONLY)
================================ */
(function migrateIndividualTripNumbers(){
  let changed = false;

  hubTrips.forEach(t => {
    if (t && t.type === "Individual" && (!t.tripNumber || String(t.tripNumber).trim() === "") && t.id) {
      t.tripNumber = t.id;
      changed = true;
    }
  });

  if (changed) localStorage.setItem(hubKey, JSON.stringify(hubTrips));
})();

/* ===============================
   GET TRIP NUMBER (READ ONLY)
================================ */
function getTripNumber(t){
  if (t && t.tripNumber && String(t.tripNumber).trim() !== "") return String(t.tripNumber);
  if (t && t.id && String(t.id).trim() !== "") return String(t.id);
  if (t && t.bookingNumber && String(t.bookingNumber).trim() !== "") return String(t.bookingNumber);
  return "-";
}

/* ===============================
   ARIZONA DATE (YYYY-MM-DD)
================================ */
function phoenixISODate(){
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const y = parts.find(p=>p.type==="year").value;
  const m = parts.find(p=>p.type==="month").value;
  const d = parts.find(p=>p.type==="day").value;
  return `${y}-${m}-${d}`;
}

/* ===============================
   RESERVED TRIP NUMBER (RE-)
================================ */
function nextReservedNumber(){
  const key = "lastReservedRE";
  let last = parseInt(localStorage.getItem(key) || "1000", 10);
  last++;
  localStorage.setItem(key, String(last));
  return "RE-" + last;
}

/* ===============================
   ADD RESERVED TRIP (INLINE)
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
    tripDate: phoenixISODate(),
    tripTime: "",
    status: "Booked",
    bookedAt: new Date().toISOString()
  };

  hubTrips.unshift(newTrip);
  localStorage.setItem(hubKey, JSON.stringify(hubTrips));
  render(hubTrips);

  const firstEditBtn = container.querySelector(
    `button[data-trip="${newTrip.tripNumber}"].editBtn`
  );
  if(firstEditBtn) firstEditBtn.click();
}

if(addBtn){
  addBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    addReservedTripInline();
  });
}

/* ===============================
   SEND TODAY & TOMORROW
================================ */
function sendTodayAndTomorrowTrips(){
  const today = new Date();
  today.setHours(0,0,0,0);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  const filtered = hubTrips.filter(t => {
    if(!t || !t.tripDate) return false;
    const d = new Date(t.tripDate);
    if(isNaN(d)) return false;
    d.setHours(0,0,0,0);
    return d >= today && d < dayAfterTomorrow;
  });

  localStorage.setItem("adminTrips", JSON.stringify(filtered));
  localStorage.setItem("dispatcherTrips", JSON.stringify(filtered));

  return filtered;
}

/* ===============================
   COLORS
================================ */
function rowColor(tr, t){
  if (t && t.type === "Individual") tr.style.backgroundColor = "#e8f4ff";
  else if (t && t.type === "Company") tr.style.backgroundColor = "#fff6d6";
  else if (t && t.type === "Reserved") tr.style.backgroundColor = "#ecfdf5";
}

/* ===============================
   RENDER
================================ */
function render(list){
  if(!container) return;

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
    const stopsStr = Array.isArray(t.stops) && t.stops.length ? t.stops.join(" → ") : "";

    tr.innerHTML = `
      <td>${i + 1}</td>

      <td>
        <input value="${tripNum}" disabled data-locked="true">
      </td>

      <td>
        <input value="${t.type || "-"}" disabled data-locked="true">
      </td>

      <td><input class="editField" value="${t.company || ""}" disabled></td>

      <td><input class="editField" value="${t.entryName || ""}" disabled></td>
      <td><input class="editField" value="${t.entryPhone || ""}" disabled></td>

      <td><input class="editField" value="${t.clientName || ""}" disabled></td>
      <td><input class="editField" value="${t.clientPhone || ""}" disabled></td>

      <td><input class="editField" value="${t.pickup || ""}" disabled></td>
      <td><input class="editField" value="${stopsStr}" disabled></td>
      <td><input class="editField" value="${t.dropoff || ""}" disabled></td>

      <td><input class="editField" type="date" value="${t.tripDate || ""}" disabled></td>
      <td><input class="editField" type="time" value="${t.tripTime || ""}" disabled></td>

      <td>
        <select class="editField" disabled>
          ${["Booked","Scheduled","On Board","Arrived","Completed","No Show","Cancelled"]
            .map(s=>`<option ${s===t.status?"selected":""}>${s}</option>`).join("")}
        </select>
      </td>

      <td>${formatDate(t.bookedAt)}</td>

      <td>
        <div class="hub-actions">
          <button type="button"
            class="hub-btn edit editBtn"
            data-trip="${tripNum}"
            onclick="editTripInline(this,'${tripNum}')"
            title="Edit (with confirmation)"
          >✏️ Edit</button>

          <button type="button"
            class="hub-btn delete"
            onclick="deleteTripConfirm('${tripNum}')"
            title="Delete (with confirmation)"
          >🗑 Delete</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  container.appendChild(table);
}

/* ===============================
   EDIT INLINE (WITH CONFIRM)
================================ */
function editTripInline(btn, tripNumber){
  if(btn.dataset.mode !== "edit"){
    const ok = confirm("⚠️ Are you sure you want to edit this trip?");
    if(!ok) return;
  }

  const row = btn.closest("tr");
  const fields = row.querySelectorAll(".editField");

  if(btn.dataset.mode !== "edit"){
    fields.forEach(el => el.disabled = false);

    btn.dataset.mode = "edit";
    btn.classList.remove("edit");
    btn.classList.add("save");
    btn.style.opacity = "1";
    btn.innerText = "💾 Save";
  } else {
    const inputs = row.querySelectorAll("input.editField, select.editField");

    const company     = inputs[0].value;
    const entryName   = inputs[1].value;
    const entryPhone  = inputs[2].value;
    const clientName  = inputs[3].value;
    const clientPhone = inputs[4].value;
    const pickup      = inputs[5].value;
    const stopsText   = inputs[6].value;
    const dropoff     = inputs[7].value;
    const tripDate    = inputs[8].value;
    const tripTime    = inputs[9].value;
    const status      = inputs[10].value;

    const stopsArr = stopsText
      ? stopsText.split("→").map(x=>x.trim()).filter(Boolean)
      : [];

    const idx = hubTrips.findIndex(x => String(getTripNumber(x)) === String(tripNumber));
    if(idx !== -1){
      hubTrips[idx] = {
        ...hubTrips[idx],
        company,
        entryName,
        entryPhone,
        clientName,
        clientPhone,
        pickup,
        stops: stopsArr,
        dropoff,
        tripDate,
        tripTime,
        status
      };
      localStorage.setItem(hubKey, JSON.stringify(hubTrips));
    }

    fields.forEach(el => el.disabled = true);

    btn.dataset.mode = "";
    btn.classList.remove("save");
    btn.classList.add("edit");
    btn.style.opacity = "1";
    btn.innerText = "✏️ Edit";

    render(hubTrips);
  }
}

/* ===============================
   DELETE (WITH CONFIRM)
================================ */
function deleteTripConfirm(tripNumber){
  const ok = confirm("⚠️ Are you sure you want to delete this trip?");
  if(!ok) return;

  hubTrips = hubTrips.filter(t => String(getTripNumber(t)) !== String(tripNumber));
  localStorage.setItem(hubKey, JSON.stringify(hubTrips));

  render(hubTrips);
  sendTodayAndTomorrowTrips();
}

/* ===============================
   SEARCH
================================ */
if(searchInput){
  searchInput.addEventListener("input", () => {
    const v = (searchInput.value || "").toLowerCase();
    render(
      hubTrips.filter(t => JSON.stringify(t).toLowerCase().includes(v))
    );
  });
} else {
  console.error("Missing #searchInput in HTML");
}

/* ===============================
   EXPOSE
================================ */
window.editTripInline = editTripInline;
window.deleteTripConfirm = deleteTripConfirm;

/* ===============================
   INIT
================================ */
render(hubTrips);
sendTodayAndTomorrowTrips();