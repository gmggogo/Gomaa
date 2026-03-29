/* ===============================
   API
================================ */
const API = "/api/trips";
const container = document.getElementById("tripsContainer");

let trips = [];

/* ===============================
   SMALL STYLE
================================ */
(function injectTinyStyle(){
  const oldStyle = document.getElementById("admin-trips-inline-style");
  if(oldStyle) oldStyle.remove();

  const s = document.createElement("style");
  s.id = "admin-trips-inline-style";
  s.innerHTML = `
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
      z-index:99999;
      max-height:220px;
      overflow:auto;
      box-shadow:0 12px 24px rgba(0,0,0,.12);
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
      color:#64748b;
      background:#f8fafc;
      cursor:default;
    }

    .stop-row{
      display:flex;
      align-items:center;
      gap:6px;
      margin-bottom:6px;
    }

    .stop-row .input-wrap{
      flex:1;
    }

    .stop-remove{
      cursor:pointer;
      color:#dc2626;
      font-weight:700;
      padding:0 6px;
      user-select:none;
    }

    .add-stop{
      margin-top:6px;
      padding:4px 8px;
      border:none;
      border-radius:6px;
      background:#e5e7eb;
      cursor:pointer;
      font-size:12px;
    }

    .actions{
      white-space:nowrap;
    }
  `;
  document.head.appendChild(s);
})();

/* ===============================
   ARIZONA TIME
================================ */
function getArizonaTime(){
  return new Date(
    new Date().toLocaleString("en-US", { timeZone:"America/Phoenix" })
  );
}

function formatArizonaDate(dateObj){
  return dateObj.toLocaleDateString("en-CA", { timeZone:"America/Phoenix" });
}

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

function normalizeText(v){
  return String(v ?? "").trim();
}

function parseTripDateTime(dateStr, timeStr){
  if(!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function isFutureTrip(dateStr, timeStr){
  const tripDateTime = parseTripDateTime(dateStr, timeStr);
  if(!tripDateTime) return false;
  return tripDateTime > getArizonaTime();
}

/* ===============================
   AUTOCOMPLETE STATE
================================ */
const selectedMap = new WeakMap();

/* ===============================
   AUTOCOMPLETE API
================================ */
async function searchAddress(q){
  const query = normalizeText(q);
  if(query.length < 3) return [];

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us&viewbox=-115,35.5,-108.5,31&bounded=1`
    );

    if(!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }catch(err){
    console.error("searchAddress error:", err);
    return [];
  }
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

function ensureWrapped(input){
  if(!input) return null;

  if(input.parentElement && input.parentElement.classList.contains("input-wrap")){
    return input.parentElement;
  }

  const wrap = document.createElement("div");
  wrap.className = "input-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  return wrap;
}

function attachAutocomplete(input){
  if(!input) return;

  const wrap = ensureWrapped(input);
  if(!wrap) return;

  let oldBox = wrap.querySelector(".suggestions");
  if(oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);

  let timer = null;

  input.setAttribute("autocomplete", "off");

  input.addEventListener("focus", async function(){
    const q = normalizeText(input.value);
    if(q.length < 3) return;

    const results = await searchAddress(q);
    renderSuggestions(box, results);
  });

  input.addEventListener("input", function(){
    selectedMap.set(input, null);
    clearTimeout(timer);

    const q = normalizeText(input.value);

    if(q.length < 3){
      box.innerHTML = "";
      return;
    }

    timer = setTimeout(async () => {
      const results = await searchAddress(q);
      renderSuggestions(box, results);
    }, 250);
  });

  box.addEventListener("click", e => {
    const el = e.target.closest(".option");
    if(!el || el.classList.contains("disabled")) return;

    const obj = {
      address: el.dataset.address,
      lat: Number(el.dataset.lat),
      lng: Number(el.dataset.lng)
    };

    input.value = obj.address;
    selectedMap.set(input, obj);
    box.innerHTML = "";
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      box.innerHTML = "";
    }, 180);
  });
}

/* ===============================
   LOAD TRIPS
================================ */
async function loadTrips(){
  const res = await fetch(API);
  const data = await res.json();
  trips = Array.isArray(data) ? data : [];
  renderTrips();
}

/* ===============================
   DATES
================================ */
function getDates(){
  const now = getArizonaTime();

  const today = new Date(now);
  today.setHours(0,0,0,0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate()+1);

  return { today, tomorrow };
}

/* ===============================
   GROUP TRIPS
================================ */
function groupTrips(){
  const { today, tomorrow } = getDates();

  const groups = {
    today: [],
    tomorrow: []
  };

  trips.forEach(t => {
    const date = t.tripDate;
    if(!date) return;

    const p = date.split("-");
    if(p.length !== 3) return;

    const d = new Date(p[0], p[1]-1, p[2]);
    d.setHours(0,0,0,0);

    if(d.getTime() === today.getTime()){
      groups.today.push(t);
    }else if(d.getTime() === tomorrow.getTime()){
      groups.tomorrow.push(t);
    }
  });

  return groups;
}

/* ===============================
   ROW COLOR
================================ */
function rowColor(type){
  type = (type || "").toLowerCase();

  if(type === "company") return "row-company";
  if(type === "individual") return "row-individual";
  if(type === "reserved") return "row-reserved";

  return "";
}

/* ===============================
   RENDER
================================ */
function renderTrips(){
  container.innerHTML = "";

  const groups = groupTrips();
  const { today, tomorrow } = getDates();

  drawGroup("Today – " + formatArizonaDate(today), groups.today);
  drawGroup("Tomorrow – " + formatArizonaDate(tomorrow), groups.tomorrow);
}

/* ===============================
   DRAW GROUP
================================ */
function drawGroup(title, list){
  const header = document.createElement("div");
  header.className = "group-title";
  header.innerText = title;

  container.appendChild(header);

  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";

  const table = document.createElement("table");
  table.className = "trip-table";

  table.innerHTML = `
    <tr>
      <th>Dispatch</th>
      <th>#</th>
      <th>Trip</th>
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
      <th>Notes</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  `;

  if(!list.length){
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="17" style="text-align:center;padding:20px">No Trips</td>`;
    table.appendChild(row);
  }else{
    list.forEach((t, i) => {
      const tr = document.createElement("tr");
      tr.className = rowColor(t.type);

      if(t.disabled){
        tr.style.opacity = "0.5";
      }

      tr.dataset.tripId = t._id;

      tr.innerHTML = `
        <td>
          <input type="checkbox"
            ${t.dispatchSelected ? "checked" : ""}
            ${t.disabled ? "disabled" : ""}
            onchange="sendDispatch('${t._id}',this.checked)">
        </td>

        <td>${i+1}</td>
        <td>${safe(t.tripNumber || "")}</td>
        <td>${safe(t.type || "")}</td>
        <td><input class="edit-field company" disabled value="${safe(t.company || "")}"></td>

        <td><input class="edit-field entryName" disabled value="${safe(t.entryName || "")}"></td>
        <td><input class="edit-field entryPhone" disabled value="${safe(t.entryPhone || "")}"></td>

        <td><input class="edit-field clientName" disabled value="${safe(t.clientName || "")}"></td>
        <td><input class="edit-field clientPhone" disabled value="${safe(t.clientPhone || "")}"></td>

        <td><input class="edit-field pickup" disabled value="${safe(t.pickup || "")}"></td>

        <td>
          <div class="stops">
            ${(t.stops || []).map(s => `
              <div class="stop-row">
                <input class="stop edit-field" disabled value="${safe(s)}">
                <span class="stop-remove" onclick="removeStop(this)">✖</span>
              </div>
            `).join("")}
          </div>
          <button class="add-stop" onclick="addStop(this)">+ Stop</button>
        </td>

        <td><input class="edit-field dropoff" disabled value="${safe(t.dropoff || "")}"></td>
        <td><input class="edit-field tripDate" disabled type="date" value="${safe(t.tripDate || "")}"></td>
        <td><input class="edit-field tripTime" disabled type="time" value="${safe(t.tripTime || "")}"></td>
        <td><input class="edit-field notes" disabled value="${safe(t.notes || "")}"></td>
        <td>${safe(t.status || "Confirmed")}</td>

        <td class="actions">
          <button class="btn btn-edit" onclick="editTrip('${t._id}',this)">Edit</button>
          <button class="btn btn-disable" onclick="toggleTrip('${t._id}',this)">
            ${t.disabled ? "Enable" : "Disable"}
          </button>
          <button class="btn btn-delete" onclick="deleteTrip('${t._id}')">Delete</button>
        </td>
      `;

      table.appendChild(tr);
    });
  }

  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

/* ===============================
   STOPS
================================ */
function addStop(btn){
  const stopsDiv = btn.parentElement.querySelector(".stops");
  const count = stopsDiv.querySelectorAll(".stop-row").length;

  if(count >= 5){
    alert("Maximum 5 stops");
    return;
  }

  const row = document.createElement("div");
  row.className = "stop-row";

  row.innerHTML = `
    <input class="stop edit-field" disabled placeholder="Stop address">
    <span class="stop-remove" onclick="removeStop(this)">✖</span>
  `;

  stopsDiv.appendChild(row);

  const tripRow = btn.closest("tr");
  const editBtn = tripRow?.querySelector(".btn-edit");

  if(editBtn && editBtn.innerText === "Save"){
    const stopInput = row.querySelector(".stop");
    if(stopInput){
      stopInput.disabled = false;
      attachAutocomplete(stopInput);
    }
  }
}

function removeStop(el){
  el.closest(".stop-row").remove();
}

/* ===============================
   EDIT
================================ */
async function editTrip(id, btn){
  const row = btn.closest("tr");
  const fields = row.querySelectorAll(".edit-field");

  if(btn.innerText === "Edit"){
    fields.forEach(f => f.disabled = false);

    const pickupInput = row.querySelector(".pickup");
    const dropoffInput = row.querySelector(".dropoff");

    if(pickupInput) attachAutocomplete(pickupInput);
    if(dropoffInput) attachAutocomplete(dropoffInput);

    row.querySelectorAll(".stop").forEach(stopInput => {
      attachAutocomplete(stopInput);
    });

    btn.innerText = "Save";
    return;
  }

  const pickupInput = row.querySelector(".pickup");
  const dropoffInput = row.querySelector(".dropoff");

  const pickupSelected = selectedMap.get(pickupInput);
  const dropoffSelected = selectedMap.get(dropoffInput);

  const payload = {
    company: row.querySelector(".company").value,
    entryName: row.querySelector(".entryName").value,
    entryPhone: row.querySelector(".entryPhone").value,
    clientName: row.querySelector(".clientName").value,
    clientPhone: row.querySelector(".clientPhone").value,

    pickup: pickupInput.value,
    dropoff: dropoffInput.value,

    tripDate: row.querySelector(".tripDate").value,
    tripTime: row.querySelector(".tripTime").value,
    notes: row.querySelector(".notes").value,

    stops: Array.from(row.querySelectorAll(".stop"))
      .map(s => s.value.trim())
      .filter(Boolean)
  };

  /* ===============================
     VALIDATE TIME
  ================================ */
  if(!isFutureTrip(payload.tripDate, payload.tripTime)){
    alert("❌ Cannot save trip in the past");
    return;
  }

  /* ===============================
     VALIDATE PICKUP / DROPOFF
  ================================ */
  if(normalizeText(payload.pickup) && !pickupSelected){
    alert("Select pickup from suggestions ❌");
    pickupInput.focus();
    return;
  }

  if(normalizeText(payload.dropoff) && !dropoffSelected){
    alert("Select dropoff from suggestions ❌");
    dropoffInput.focus();
    return;
  }

  if(pickupSelected){
    payload.pickup = pickupSelected.address;
    payload.pickupLat = Number(pickupSelected.lat);
    payload.pickupLng = Number(pickupSelected.lng);
  }

  if(dropoffSelected){
    payload.dropoff = dropoffSelected.address;
    payload.dropoffLat = Number(dropoffSelected.lat);
    payload.dropoffLng = Number(dropoffSelected.lng);
  }

  /* ===============================
     VALIDATE STOPS
  ================================ */
  const stopInputs = Array.from(row.querySelectorAll(".stop"));
  const stopsGeo = [];

  for(const stopInput of stopInputs){
    const stopVal = normalizeText(stopInput.value);
    if(!stopVal) continue;

    const stopSelected = selectedMap.get(stopInput);

    if(!stopSelected){
      alert("Select each stop from suggestions ❌");
      stopInput.focus();
      return;
    }

    stopsGeo.push({
      address: stopSelected.address,
      lat: Number(stopSelected.lat),
      lng: Number(stopSelected.lng)
    });
  }

  payload.stops = stopsGeo.map(s => s.address);
  payload.stopsGeo = stopsGeo;

  await fetch(API + "/" + id, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify(payload)
  });

  fields.forEach(f => f.disabled = true);
  btn.innerText = "Edit";

  loadTrips();
}

/* ===============================
   DELETE
================================ */
async function deleteTrip(id){
  if(!confirm("Delete trip?")) return;

  await fetch(API + "/" + id, { method:"DELETE" });
  loadTrips();
}

/* ===============================
   DISABLE
================================ */
async function toggleTrip(id, btn){
  const disabled = btn.innerText === "Disable";

  await fetch(API + "/" + id, {
    method:"PUT",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      disabled: disabled,
      dispatchSelected: false
    })
  });

  loadTrips();
}

/* ===============================
   DISPATCH
================================ */
async function sendDispatch(id, val){
  await fetch(API + "/" + id, {
    method:"PUT",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      dispatchSelected: val
    })
  });
}

/* ===============================
   START
================================ */
loadTrips();