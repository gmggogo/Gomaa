/* ===============================
   ADMIN TRIPS V2
================================ */

const API = "/api/trips";
const SERVICES_API = "/api/services/admin";

const container = document.getElementById("tripsContainer");
const statsCards = document.getElementById("statsCards");
const serviceCards = document.getElementById("serviceCards");

let trips = [];
let services = [];
let activeService = "ALL";
let SYSTEM_TIMEZONE = "America/Phoenix";

const role = localStorage.getItem("role") || "";
const token = localStorage.getItem("token") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ===============================
   HELPERS
================================ */

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function clean(v){
  return String(v ?? "").trim();
}

function upper(v){
  return clean(v).toUpperCase();
}

function isServiceVisible(s){
  return !(s.enabled === false && s.companyEnabled === false);
}

function serviceCodeFromValue(v){
  const x = upper(v).replace(/\s+/g,"");

  if(["ST","STANDARD","X"].includes(x)) return "ST";
  if(["XL"].includes(x)) return "XL";
  if(["TX","TAXI"].includes(x)) return "TX";
  if(["LM","LIMO"].includes(x)) return "LM";
  if(["WH","WHEELCHAIR"].includes(x)) return "WH";
  if(["SH","SHARED"].includes(x)) return "SH";

  return x || "ST";
}

function getServiceCodeFromService(s){
  return serviceCodeFromValue(
    s.serviceKey ||
    s.serviceCode ||
    s.serviceType ||
    s.key ||
    s.code ||
    s.name ||
    s.title
  );
}

function getTripServiceCode(t){
  if(t.isShared === true || upper(t.tripType) === "SHARED") return "SH";

  return serviceCodeFromValue(
    t.serviceKey ||
    t.serviceCode ||
    t.serviceType ||
    t.vehicleTypeFromQuote ||
    t.vehicle ||
    ""
  );
}

function getEnabledServiceCodes(){
  return new Set(
    services
      .filter(isServiceVisible)
      .map(getServiceCodeFromService)
      .filter(Boolean)
  );
}

function isTripAllowedByService(t){
  const code = getTripServiceCode(t);
  const enabled = getEnabledServiceCodes();

  if(!enabled.size) return true;
  return enabled.has(code);
}

function getTripKind(t){
  const type = clean(t.type).toLowerCase();
  const num = upper(t.tripNumber);
  const source = upper(t.source || t.bookingSource || "");
  const reservation = upper(t.reservationStatus || "");

  if(type === "reserved" || num.startsWith("RV-") || reservation) return "RV";
  if(type === "quote" || source.includes("QUOTE") || source.includes("GETQUOTE") || num.startsWith("GQ-")) return "GQ";

  return "FA";
}

function isSharedTrip(t){
  return (
    t.isShared === true ||
    upper(t.tripType) === "SHARED" ||
    upper(t.serviceKey) === "SHARED" ||
    upper(t.tripNumber).includes("-SH") ||
    clean(t.groupId) !== ""
  );
}

/* ===============================
   SYSTEM TIMEZONE
================================ */

async function loadSystemTimezone(){
  try{
    const res = await fetch("/api/system-design");
    if(!res.ok) return;

    const data = await res.json();

    SYSTEM_TIMEZONE =
      data.timezone ||
      data.systemTimezone ||
      data?.settings?.timezone ||
      "America/Phoenix";
  }catch(err){
    SYSTEM_TIMEZONE = "America/Phoenix";
  }
}

function getSystemDateParts(offsetDays = 0){
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA",{
    timeZone:SYSTEM_TIMEZONE,
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(now);

  const y = Number(parts.find(p=>p.type==="year")?.value);
  const m = Number(parts.find(p=>p.type==="month")?.value);
  const d = Number(parts.find(p=>p.type==="day")?.value);

  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + offsetDays);

  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2,"0");
  const dd = String(base.getDate()).padStart(2,"0");

  return `${yy}-${mm}-${dd}`;
}

function todayKey(){
  return getSystemDateParts(0);
}

function tomorrowKey(){
  return getSystemDateParts(1);
}

function isTodayTrip(t){
  return clean(t.tripDate) === todayKey();
}

function isTomorrowTrip(t){
  return clean(t.tripDate) === tomorrowKey();
}

/* ===============================
   FILTERING
================================ */

function baseTrips(){
  return trips.filter(t => {
    if(t.disabled === true) return false;
    if(!isTripAllowedByService(t)) return false;
    if(!isTodayTrip(t) && !isTomorrowTrip(t)) return false;
    return true;
  });
}

function filterTripsByService(list = baseTrips()){
  if(activeService === "ALL") return list;
  return list.filter(t => getTripServiceCode(t) === activeService);
}

/* ===============================
   STATS
================================ */

function countKinds(list){
  const out = { total:0, fa:0, gq:0, rv:0 };

  list.forEach(t => {
    out.total++;

    const kind = getTripKind(t);
    if(kind === "FA") out.fa++;
    if(kind === "GQ") out.gq++;
    if(kind === "RV") out.rv++;
  });

  return out;
}

function renderStats(){
  const all = baseTrips();

  const data = [
    ["TOTAL TRIPS", all.length],
    ["TODAY TRIPS", all.filter(isTodayTrip).length],
    ["TOMORROW TRIPS", all.filter(isTomorrowTrip).length],
    ["NEW TRIPS (FA)", all.filter(t => getTripKind(t) === "FA").length],
    ["GET QUOTE (GQ)", all.filter(t => getTripKind(t) === "GQ").length],
    ["RESERVATIONS (RV)", all.filter(t => getTripKind(t) === "RV").length]
  ];

  statsCards.innerHTML = data.map(x => `
    <div class="stat-card">
      <div class="stat-label">${safe(x[0])}</div>
      <div class="stat-value">${x[1]}</div>
    </div>
  `).join("");
}

function renderServiceCards(){
  const all = baseTrips();
  const visibleServices = services.filter(isServiceVisible);

  const cards = [];

  const allCounts = countKinds(all);
  cards.push({
    code:"ALL",
    total:allCounts.total,
    fa:allCounts.fa,
    gq:allCounts.gq,
    rv:allCounts.rv
  });

  visibleServices.forEach(s => {
    const code = getServiceCodeFromService(s);
    if(!code) return;

    const serviceTrips = all.filter(t => getTripServiceCode(t) === code);
    const c = countKinds(serviceTrips);

    cards.push({
      code,
      total:c.total,
      fa:c.fa,
      gq:c.gq,
      rv:c.rv
    });
  });

  const unique = [];
  const used = new Set();

  cards.forEach(c => {
    if(used.has(c.code)) return;
    used.add(c.code);
    unique.push(c);
  });

  serviceCards.innerHTML = unique.map(c => `
    <div class="service-card ${activeService === c.code ? "active" : ""}"
         onclick="setActiveService('${safe(c.code)}')">
      <div class="service-name">${safe(c.code)}</div>
      <div class="service-total">${c.total}</div>
      <div class="service-mini">
        <span>FA ${c.fa}</span>
        <span>GQ ${c.gq}</span>
        <span>RV ${c.rv}</span>
      </div>
    </div>
  `).join("");
}

function setActiveService(code){
  activeService = code || "ALL";
  renderAll();
}

/* ===============================
   SELECTION BUTTONS
================================ */

function currentTrips(){
  return filterTripsByService(baseTrips());
}

function allSelected(list){
  if(!list.length) return false;
  return list.every(t => t.dispatchSelected === true);
}

function updateSelectionButtons(){
  const all = currentTrips();
  const today = all.filter(isTodayTrip);
  const tomorrow = all.filter(isTomorrowTrip);

  const bAll = document.getElementById("selectAllBtn");
  const bToday = document.getElementById("selectTodayBtn");
  const bTomorrow = document.getElementById("selectTomorrowBtn");

  if(bAll) bAll.innerText = allSelected(all) ? "REMOVE ALL" : "SELECT ALL";
  if(bToday) bToday.innerText = allSelected(today) ? "REMOVE TODAY" : "SELECT TODAY";
  if(bTomorrow) bTomorrow.innerText = allSelected(tomorrow) ? "REMOVE TOMORROW" : "SELECT TOMORROW";
}

async function bulkSetSelected(list, val){
  await Promise.all(
    list.map(t =>
      fetch(API + "/" + t._id, {
        method:"PUT",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ dispatchSelected:val })
      })
    )
  );

  await loadTrips();
}

function toggleSelectAll(){
  const list = currentTrips();
  bulkSetSelected(list, !allSelected(list));
}

function toggleSelectToday(){
  const list = currentTrips().filter(isTodayTrip);
  bulkSetSelected(list, !allSelected(list));
}

function toggleSelectTomorrow(){
  const list = currentTrips().filter(isTomorrowTrip);
  bulkSetSelected(list, !allSelected(list));
}

/* ===============================
   AUTOCOMPLETE
================================ */

const selectedMap = new WeakMap();

async function searchAddress(q){
  const query = clean(q);
  if(query.length < 3) return [];

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`
    );

    if(!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }catch(err){
    return [];
  }
}

function ensureWrapped(input){
  if(!input) return null;

  if(input.parentElement?.classList.contains("input-wrap")){
    return input.parentElement;
  }

  const wrap = document.createElement("div");
  wrap.className = "input-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  return wrap;
}

function renderSuggestions(box, results){
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

function attachAutocomplete(input){
  if(!input) return;

  const wrap = ensureWrapped(input);
  let old = wrap.querySelector(".suggestions");
  if(old) old.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);

  let timer = null;
  input.setAttribute("autocomplete","off");

  input.addEventListener("input", () => {
    selectedMap.set(input, null);
    clearTimeout(timer);

    const q = clean(input.value);
    if(q.length < 3){
      box.innerHTML = "";
      return;
    }

    timer = setTimeout(async () => {
      renderSuggestions(box, await searchAddress(q));
    }, 250);
  });

  box.addEventListener("click", e => {
    const el = e.target.closest(".option");
    if(!el || el.classList.contains("disabled")) return;

    const obj = {
      address:el.dataset.address,
      lat:Number(el.dataset.lat),
      lng:Number(el.dataset.lng)
    };

    input.value = obj.address;
    selectedMap.set(input, obj);
    box.innerHTML = "";
  });

  input.addEventListener("blur", () => {
    setTimeout(()=> box.innerHTML = "", 180);
  });
}

/* ===============================
   LOAD
================================ */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_API);
    const data = await res.json();
    services = Array.isArray(data) ? data : [];
  }catch(err){
    services = [];
  }
}

async function loadTrips(){
  const res = await fetch(API);
  const data = await res.json();
  trips = Array.isArray(data) ? data : [];
  renderAll();
}

/* ===============================
   RENDER
================================ */

function renderAll(){
  renderStats();
  renderServiceCards();
  renderTrips();
  updateSelectionButtons();
}

function rowColor(t){
  const type = clean(t.type).toLowerCase();

  if(type === "company") return "row-company";
  if(type === "individual") return "row-individual";
  if(type === "reserved") return "row-reserved";
  if(type === "quote") return "row-quote";

  return "";
}

function renderTrips(){
  container.innerHTML = "";

  const list = currentTrips();

  const today = list.filter(isTodayTrip).sort(sortByTime);
  const tomorrow = list.filter(isTomorrowTrip).sort(sortByTime);

  drawGroup("Today – " + todayKey(), today);
  drawGroup("Tomorrow – " + tomorrowKey(), tomorrow);
}

function sortByTime(a,b){
  return clean(a.tripTime).localeCompare(clean(b.tripTime)) ||
         clean(a.tripNumber).localeCompare(clean(b.tripNumber));
}

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
      tr.className = rowColor(t);
      tr.dataset.tripId = t._id;

      const clientName = isSharedTrip(t) ? buildSharedClientName(t) : clean(t.clientName);
      const clientPhone = isSharedTrip(t) ? buildSharedClientPhone(t) : clean(t.clientPhone);
      const notes = isSharedTrip(t) ? buildSharedNotes(t) : clean(t.notes);

      tr.innerHTML = `
        <td>
          <input class="dispatch-check" type="checkbox"
            ${t.dispatchSelected ? "checked" : ""}
            onchange="sendDispatch('${t._id}',this.checked)">
        </td>

        <td>${i + 1}</td>
        <td>${safe(t.tripNumber || "")}</td>
        <td>${safe(t.type || "")}</td>

        <td><input class="edit-field company" disabled value="${safe(t.company || "")}"></td>
        <td><input class="edit-field entryName" disabled value="${safe(t.entryName || "")}"></td>
        <td><input class="edit-field entryPhone" disabled value="${safe(t.entryPhone || "")}"></td>

        <td><input class="edit-field clientName" disabled value="${safe(clientName)}"></td>
        <td><input class="edit-field clientPhone" disabled value="${safe(clientPhone)}"></td>

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
        <td><input class="edit-field notes" disabled value="${safe(notes)}"></td>
        <td>${safe(t.status || "Scheduled")}</td>

        <td class="actions">
          <button class="btn btn-edit" onclick="editTrip('${t._id}',this)">Edit</button>
          <button class="btn btn-disable" onclick="toggleTrip('${t._id}',this)">Disable</button>
          <button class="btn btn-delete" onclick="deleteTrip('${t._id}')">Delete</button>
        </td>
      `;

      table.appendChild(tr);
    });
  }

  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function buildSharedClientName(t){
  if(Array.isArray(t.passengers) && t.passengers.length){
    return t.passengers.map(p => p.clientName || p.name || "").filter(Boolean).join(" / ");
  }
  return t.clientName || "Shared Trip";
}

function buildSharedClientPhone(t){
  if(Array.isArray(t.passengers) && t.passengers.length){
    return t.passengers.map(p => p.clientPhone || p.phone || "").filter(Boolean).join(" / ");
  }
  return t.clientPhone || "";
}

function buildSharedNotes(t){
  const base = clean(t.notes);

  if(!Array.isArray(t.passengers) || !t.passengers.length){
    return base;
  }

  const pText = t.passengers.map((p,i)=>{
    return `P${i+1}: ${p.clientName || p.name || ""} ${p.status ? "(" + p.status + ")" : ""}`;
  }).join(" | ");

  return [base, pText].filter(Boolean).join(" | ");
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
    stopInput.disabled = false;
    attachAutocomplete(stopInput);
  }
}

function removeStop(el){
  el.closest(".stop-row").remove();
}

/* ===============================
   EDIT
================================ */

function parseTripDateTime(dateStr, timeStr){
  if(!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function getSystemNow(){
  return new Date(new Date().toLocaleString("en-US", { timeZone:SYSTEM_TIMEZONE }));
}

function isFutureTrip(dateStr,timeStr){
  const dt = parseTripDateTime(dateStr,timeStr);
  if(!dt) return false;
  return dt > getSystemNow();
}

async function editTrip(id, btn){
  const row = btn.closest("tr");
  const fields = row.querySelectorAll(".edit-field");

  if(btn.innerText === "Edit"){
    fields.forEach(f => f.disabled = false);

    attachAutocomplete(row.querySelector(".pickup"));
    attachAutocomplete(row.querySelector(".dropoff"));
    row.querySelectorAll(".stop").forEach(attachAutocomplete);

    btn.innerText = "Save";
    return;
  }

  const pickupInput = row.querySelector(".pickup");
  const dropoffInput = row.querySelector(".dropoff");

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
    stops: Array.from(row.querySelectorAll(".stop")).map(s => s.value.trim()).filter(Boolean)
  };

  if(!isFutureTrip(payload.tripDate,payload.tripTime)){
    alert("❌ Cannot save trip in the past");
    return;
  }

  const pickupSelected = selectedMap.get(pickupInput);
  const dropoffSelected = selectedMap.get(dropoffInput);

  if(pickupSelected){
    payload.pickup = pickupSelected.address;
    payload.pickupLat = pickupSelected.lat;
    payload.pickupLng = pickupSelected.lng;
  }

  if(dropoffSelected){
    payload.dropoff = dropoffSelected.address;
    payload.dropoffLat = dropoffSelected.lat;
    payload.dropoffLng = dropoffSelected.lng;
  }

  const stopInputs = Array.from(row.querySelectorAll(".stop"));
  const stopsGeo = [];

  for(const stopInput of stopInputs){
    const val = clean(stopInput.value);
    if(!val) continue;

    const selected = selectedMap.get(stopInput);
    if(selected){
      stopsGeo.push({
        address:selected.address,
        lat:selected.lat,
        lng:selected.lng
      });
    }
  }

  if(stopsGeo.length){
    payload.stops = stopsGeo.map(s => s.address);
    payload.stopCoords = stopsGeo;
  }

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
   ACTIONS
================================ */

async function deleteTrip(id){
  if(!confirm("Delete trip?")) return;

  await fetch(API + "/" + id, { method:"DELETE" });
  loadTrips();
}

async function toggleTrip(id){
  await fetch(API + "/" + id, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      disabled:true,
      dispatchSelected:false
    })
  });

  loadTrips();
}

async function sendDispatch(id,val){
  await fetch(API + "/" + id, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ dispatchSelected:val })
  });

  const t = trips.find(x => String(x._id) === String(id));
  if(t) t.dispatchSelected = val;

  updateSelectionButtons();
}

/* ===============================
   START
================================ */

(async function start(){
  await loadSystemTimezone();
  await loadServices();
  await loadTrips();
})();