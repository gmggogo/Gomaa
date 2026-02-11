/* ===============================
   INIT (DOM SAFE)
================================ */
window.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     AUTH
  ================================ */
  let loggedCompany = null;
  try {
    loggedCompany = JSON.parse(localStorage.getItem("loggedCompany"));
  } catch {}

  if (!loggedCompany) {
    location.href = "company-login.html";
    return;
  }

  /* ===============================
     ELEMENTS
  ================================ */
  const container = document.getElementById("tripsContainer");
  const searchBox = document.getElementById("searchBox");
  if (!container) return;

  /* ===============================
     DATA
  ================================ */
  let trips = [];
  try {
    trips = JSON.parse(localStorage.getItem("companyTrips")) || [];
  } catch {
    trips = [];
  }

  /* ===============================
     STYLES (UNCHANGED)
  ================================ */
  const style = document.createElement("style");
  style.innerHTML = `
    .btn{border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;color:#fff;transition:.15s}
    .btn.confirm{background:#22c55e}
    .btn.edit{background:#3b82f6}
    .btn.delete{background:#ef4444}
    .btn.cancel{background:#f59e0b}
    .btn:active{transform:scale(.95)}
    .actions{display:flex;gap:6px;justify-content:center}

    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#0f172a;color:#fff;padding:6px}
    td{border:1px solid #e5e7eb;padding:4px;text-align:center}
    h3{margin:14px 0 6px;color:#334155}
    input.editable{width:100%;font-size:12px}
  `;
  document.head.appendChild(style);

  /* ===============================
     SAVE
  ================================ */
  function saveTrips(){
    localStorage.setItem("companyTrips", JSON.stringify(trips));
  }

  /* ===============================
     TIME HELPERS
  ================================ */
  function getTripDT(t){
    if(!t.tripDate || !t.tripTime) return null;
    return new Date(`${t.tripDate}T${t.tripTime}`);
  }

  function withinTwoHours(t){
    const d = getTripDT(t);
    if(!d) return false;
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff <= 2 * 60 * 60 * 1000;
  }

  /* ===============================
     HUB
  ================================ */
  function upsertHub(trip){
    let hub = JSON.parse(localStorage.getItem("tripsHub")) || [];

    const payload = {
      tripNumber: trip.tripNumber,
      type: "Company",
      company: loggedCompany.name,
      entryName: trip.entryName,
      entryPhone: trip.entryPhone,
      clientName: trip.clientName,
      clientPhone: trip.clientPhone,
      pickup: trip.pickup,
      dropoff: trip.dropoff,
      stops: trip.stops || [],
      tripDate: trip.tripDate,
      tripTime: trip.tripTime,
      status: trip.status,
      bookedAt: new Date().toISOString()
    };

    const i = hub.findIndex(h => h.tripNumber === trip.tripNumber);
    if(i === -1) hub.push(payload);
    else hub[i] = payload;

    localStorage.setItem("tripsHub", JSON.stringify(hub));
  }

  function removeFromHub(num){
    let hub = JSON.parse(localStorage.getItem("tripsHub")) || [];
    hub = hub.filter(h => h.tripNumber !== num);
    localStorage.setItem("tripsHub", JSON.stringify(hub));
  }

  /* ===============================
     GROUP BY TRIP DATE
  ================================ */
  function groupByDate(list){
    const g = {};
    list.forEach(t=>{
      const d = t.tripDate || "No Date";
      if(!g[d]) g[d] = [];
      g[d].push(t);
    });
    return g;
  }

  /* ===============================
     SEARCH
  ================================ */
  function filteredTrips(){
    if(!searchBox || !searchBox.value) return trips;
    const q = searchBox.value.toLowerCase();
    return trips.filter(t =>
      (t.tripNumber||"").toLowerCase().includes(q) ||
      (t.clientName||"").toLowerCase().includes(q) ||
      (t.clientPhone||"").includes(q) ||
      (t.pickup||"").toLowerCase().includes(q) ||
      (t.dropoff||"").toLowerCase().includes(q)
    );
  }

  /* ===============================
     RENDER
  ================================ */
  function render(){
    container.innerHTML = "";

    const grouped = groupByDate(filteredTrips());

    Object.keys(grouped).sort().forEach(day=>{
      const h = document.createElement("h3");
      h.innerText = day;
      container.appendChild(h);

      const table = document.createElement("table");
      table.innerHTML = `
        <tr>
          <th>#</th><th>Trip</th>
          <th>Entry</th><th>Phone</th>
          <th>Client</th><th>Phone</th>
          <th>Pickup</th><th>Stops</th><th>Drop</th>
          <th>Date</th><th>Time</th>
          <th>Status</th><th>Actions</th>
        </tr>
      `;

      grouped[day].forEach(t=>{
        // ✅ FIX: reliable index (no indexOf reference bug)
        const i = trips.findIndex(x => x.tripNumber === t.tripNumber);
        const tr = document.createElement("tr");

        let actions = "";
        if (withinTwoHours(t)) {
          // داخل 120 دقيقة: Cancel فقط (نفس نظامك)
          actions = `<button class="btn cancel" onclick="cancelTrip(${i})">Cancel</button>`;
        } else {
          actions = `
            <div class="actions">
              <button class="btn confirm" onclick="confirmTrip(${i})">Confirm</button>
              <button class="btn edit" onclick="editRow(${i},this)">Edit</button>
              <button class="btn delete" onclick="deleteTrip(${i})">Delete</button>
            </div>
          `;
        }

        tr.innerHTML = `
          <td>${i+1}</td>
          <td>${t.tripNumber||"-"}</td>

          <td><input class="editable" disabled value="${t.entryName||""}"></td>
          <td><input class="editable" disabled value="${t.entryPhone||""}"></td>

          <td><input class="editable" disabled value="${t.clientName||""}"></td>
          <td><input class="editable" disabled value="${t.clientPhone||""}"></td>

          <td><input class="editable" disabled value="${t.pickup||""}"></td>
          <td><input class="editable" disabled value="${(t.stops||[]).join(" → ")}"></td>
          <td><input class="editable" disabled value="${t.dropoff||""}"></td>

          <td><input type="date" class="editable" disabled value="${t.tripDate||""}"></td>
          <td><input type="time" class="editable" disabled value="${t.tripTime||""}"></td>

          <td>${t.status||"Scheduled"}</td>
          <td>${actions}</td>
        `;
        table.appendChild(tr);
      });

      container.appendChild(table);
    });
  }

  /* ===============================
     EDIT (YOUR POLICY)
     - Edit opens fields (except trip number)
     - Save -> status back to Scheduled
     - Remove from Hub so it won't be sent until Confirm again
  ================================ */
  function editRow(i, btn){
    const trip = trips[i];
    if (!trip) return;

    if (withinTwoHours(trip)) return; // نفس السياسة

    const row = btn.closest("tr");
    const inputs = row.querySelectorAll("input.editable");

    if (btn.textContent.trim() === "Edit") {
      inputs.forEach(x => x.disabled = false);
      btn.textContent = "Save";

      // 🚫 stop sharing to hub while editing
      if (trip.tripNumber) removeFromHub(trip.tripNumber);
      return;
    }

    // Save
    trip.entryName   = inputs[0].value;
    trip.entryPhone  = inputs[1].value;
    trip.clientName  = inputs[2].value;
    trip.clientPhone = inputs[3].value;
    trip.pickup      = inputs[4].value;
    trip.stops       = inputs[5].value.split("→").map(s=>s.trim()).filter(Boolean);
    trip.dropoff     = inputs[6].value;
    trip.tripDate    = inputs[7].value;
    trip.tripTime    = inputs[8].value;

    // 🔁 Back to Scheduled after edit
    trip.status = "Scheduled";

    inputs.forEach(x => x.disabled = true);
    btn.textContent = "Edit";

    // 🚫 keep out of hub until Confirm is pressed again
    if (trip.tripNumber) removeFromHub(trip.tripNumber);

    saveTrips();
    render();
  }

  /* ===============================
     ACTIONS
  ================================ */
  function confirmTrip(i){
    const t = trips[i];
    if (!t) return;

    t.status = "Confirmed";
    upsertHub(t); // ✅ send to hub only here
    saveTrips();
    render();
  }

  function cancelTrip(i){
    const t = trips[i];
    if (!t) return;

    t.status = "Cancelled";
    upsertHub(t); // نظامك القديم كان بيحدث الهب في cancel
    saveTrips();
    render();
  }

  function deleteTrip(i){
    if(!confirm("Delete trip?")) return;
    const num = trips[i]?.tripNumber;
    trips.splice(i,1);
    saveTrips();
    if(num) removeFromHub(num);
    render();
  }

  /* ===============================
     EXPOSE (FULL)
  ================================ */
  window.editRow = editRow;
  window.confirmTrip = confirmTrip;
  window.cancelTrip = cancelTrip;
  window.deleteTrip = deleteTrip;

  if (searchBox) {
    searchBox.addEventListener("input", render);
  }

  render();
});