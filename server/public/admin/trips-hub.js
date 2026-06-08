/* ==========================================================================
   TRIPS HUB V2 - CLEAN INBOX
   Admin / SuperAdmin / Dispatcher
   ========================================================================== */

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services";

const role = localStorage.getItem("role") || "";

if (!["superadmin", "admin", "dispatcher"].includes(role)) {
  window.location.href = "/admin/login.html";
}

/* ===============================
   STATE
================================ */
let hubTrips = [];
let services = [];
let displayItems = [];
let activeService = "ALL";
let editingKey = null;

const selectedItems = new Set();

const container = document.getElementById("hubContainer");
const searchInput = document.getElementById("searchInput");
const addBtn = document.getElementById("addManualTripBtn");

const individualTab = document.getElementById("individualTab");
const sharedTab = document.getElementById("sharedTab");

if (individualTab?.parentElement) individualTab.parentElement.style.display = "none";
if (sharedTab?.parentElement) sharedTab.parentElement.style.display = "none";
if (!container) console.error("Missing #hubContainer");

/* ===============================
   UI
================================ */
(function buildUI() {
  const page = document.querySelector(".page-content");
  if (!page || !container) return;

  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) roleBadge.innerText = role.toUpperCase();

  if (addBtn) {
    addBtn.textContent = "+ Add Trip";
    addBtn.onclick = e => {
      e.preventDefault();
      window.location.href = "/admin/add-trip.html";
    };
  }

  if (!document.getElementById("hubActionBar")) {
    const bar = document.createElement("div");
    bar.id = "hubActionBar";
    bar.className = "hub-action-bar";
    bar.innerHTML = `
      <button id="editSelectedBtn" class="hub-action-btn edit" disabled>Edit Selected</button>
      <button id="deleteSelectedBtn" class="hub-action-btn delete" disabled>Delete Selected</button>
    `;
    page.insertBefore(bar, container);
  }

  const oldDateFilters = document.getElementById("dateFilters");
  if (oldDateFilters) oldDateFilters.remove();

  if (!document.getElementById("serviceTabs")) {
    const tabs = document.createElement("div");
    tabs.id = "serviceTabs";
    tabs.className = "service-tabs";
    page.insertBefore(tabs, container);
  }
})();

(function injectStyle() {
  if (document.getElementById("trips-hub-v2-style")) return;

  const style = document.createElement("style");
  style.id = "trips-hub-v2-style";
  style.innerHTML = `
    .hub-action-bar{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      margin:0 0 12px;
      align-items:center;
    }

    .hub-action-btn{
      border:none;
      border-radius:9px;
      padding:8px 13px;
      font-size:12px;
      font-weight:900;
      cursor:pointer;
      color:#fff;
    }

    .hub-action-btn:disabled{
      opacity:.4;
      cursor:not-allowed;
    }

    .hub-action-btn.edit{background:#2563eb;}
    .hub-action-btn.delete{background:#dc2626;}

    .service-tabs{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(105px,1fr));
      gap:8px;
      margin:0 0 14px;
    }

    .service-tab{
      border:1px solid #dbe3ee;
      background:#fff;
      color:#0f172a;
      border-radius:12px;
      padding:8px 6px;
      cursor:pointer;
      font-weight:900;
      box-shadow:0 5px 14px rgba(15,23,42,.06);
      text-align:center;
      min-height:68px;
    }

   .service-tab.active{
  background:#2563eb;
  color:#fff;
}

    .service-title{
      font-size:11px;
      line-height:1.15;
      margin-bottom:4px;
    }

    .service-total{
      font-size:17px;
      line-height:1.1;
    }

    .service-source{
      font-size:9px;
      line-height:1.15;
      opacity:.85;
    }

    .table-wrap{
      width:100%;
      overflow-x:auto;
      margin-bottom:22px;
      border-radius:14px;
      background:#fff;
      box-shadow:0 8px 22px rgba(15,23,42,.08);
    }

    .hub-table{
      width:100%;
      border-collapse:collapse;
      background:#fff;
      min-width:1250px;
    }

    .hub-table th,
.hub-table td{
  border:1px solid #dbe3ee;
  padding:7px;
  text-align:center;
  font-size:13px;
  vertical-align:middle;
  line-height:1.4;
}

.hub-table th{
  background:#2563eb;
  color:#fff;
  font-weight:900;
  white-space:nowrap;
  font-size:13px;
}

    .wide-address{
      min-width:210px;
      max-width:310px;
      text-align:left!important;
      white-space:pre-line;
      word-break:break-word;
    }

    .wide-client{
      min-width:160px;
      max-width:240px;
      text-align:left!important;
      white-space:pre-line;
      word-break:break-word;
    }

    .trip-number-badge{
      font-weight:900;
      color:#2563eb;
      white-space:nowrap;
    }

    .service-pill{
      display:inline-flex;
      padding:3px 7px;
      border-radius:999px;
      background:#e0edff;
      color:#1d4ed8;
      font-size:10px;
      font-weight:900;
      white-space:nowrap;
    }

    .source-pill{
      display:inline-flex;
      padding:3px 7px;
      border-radius:999px;
      background:#f1f5f9;
      color:#0f172a;
      font-size:10px;
      font-weight:900;
      white-space:nowrap;
    }

    .edit-input{
      width:100%;
      min-width:85px;
      padding:5px;
      border:1px solid #cbd5e1;
      border-radius:6px;
      font-size:10.5px;
      font-weight:700;
      box-sizing:border-box;
    }

    .actions-wrap{
      display:flex;
      justify-content:center;
      align-items:center;
      gap:4px;
      flex-wrap:wrap;
    }

    .btn{
      border:none;
      padding:5px 8px;
      border-radius:6px;
      font-size:10px;
      font-weight:900;
      cursor:pointer;
      white-space:nowrap;
    }

    .save{background:#16a34a;color:#fff;}
    .cancel{background:#64748b;color:#fff;}

    .scheduled-row{background:#fff;}
    .confirmed-row{background:#dcfce7;}
    .cancelled-row{background:#fecaca;}
    .completed-row{background:#e0f2fe;}
    .past-row{background:#f3f4f6;}
    .new-trip-row td{background:#dcfce7!important;}

    .no-data{
      background:#fff;
      padding:18px;
      border-radius:14px;
      box-shadow:0 6px 16px rgba(15,23,42,.08);
      color:#475569;
      font-weight:900;
    }

    @media(max-width:768px){
      .hub-table{min-width:1150px;}
.hub-table th,
.hub-table td{
  font-size:11px;
  padding:6px;
}      .service-tabs{grid-template-columns:repeat(auto-fit,minmax(92px,1fr));}
    }
  `;
  document.head.appendChild(style);
})();

/* ===============================
   HELPERS
================================ */
function safe(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeText(v) {
  return String(v ?? "").trim();
}

function cleanStatus(v) {
  return String(v || "").replace(/\s+/g, "").toLowerCase().trim();
}

function getTripNumber(t) {
  return String(t?.tripNumber || t?.bookingNumber || t?.id || "-");
}

function getCreatedDate(t) {
  return new Date(t?.bookedAt || t?.createdAt || t?.updatedAt || Date.now());
}

function getAZNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" }));
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isNewTrip(t) {
  const d = getCreatedDate(t);
  return !isNaN(d) && Date.now() - d.getTime() <= 2 * 60 * 60 * 1000;
}

function parseTripDateTime(date, time) {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  return isNaN(dt) ? null : dt;
}

function shouldRemoveTrip(t) {
  const dt = parseTripDateTime(t.tripDate, t.tripTime);
  return dt ? (getAZNow() - dt) / 3600000 >= 24 : false;
}

function validateFutureTrip(date, time) {
  if (!date || !time) return { ok:false, message:"Missing trip date or time" };
  const dt = parseTripDateTime(date, time);
  if (!dt) return { ok:false, message:"Invalid trip date/time" };
  if (dt <= getAZNow()) return { ok:false, message:"Cannot save trip in the past" };
  return { ok:true };
}

function createEditInput(value, field, type = "text") {
  return `<input class="edit-input" data-field="${field}" type="${type}" value="${safe(value)}">`;
}

function getSourceCode(t) {
  const raw = [
    t?.source,
    t?.from,
    t?.bookingSource,
    t?.createdBy,
    t?.company ? "company" : ""
  ].join(" ").toLowerCase();

  if (raw.includes("quote") || raw.includes("gq") || raw.includes("website") || raw.includes("public")) return "GQ";
  if (raw.includes("company") || raw.includes("portal") || t?.company) return "CO";
  return "GQ";
}

/* ===============================
   SERVICES
================================ */
function getServiceCodeFromService(service) {
  const suffix = normalizeText(service?.companySuffix || service?.suffix || "").toUpperCase();
  if (suffix) return suffix;

  const key = normalizeText(
    service?.serviceKey ||
    service?.key ||
    service?.code ||
    service?.title ||
    service?.name ||
    ""
  ).toUpperCase();

  if (key === "STANDARD") return "ST";
  if (key === "WHEELCHAIR") return "WH";
  if (key === "SHARED") return "SH";
  if (["LIMOUSINE", "LIMO"].includes(key)) return "LM";
  if (key === "TAXI") return "TX";
  if (key === "XL") return "XL";

  return key || "ST";
}

function getServiceCodeFromTrip(t) {
  const direct = normalizeText(
    t?.serviceKey ||
    t?.serviceCode ||
    t?.serviceType ||
    t?.serviceSuffix ||
    t?.service ||
    ""
  ).toUpperCase();

  if (direct) {
    if (direct === "STANDARD") return "ST";
    if (["WHEELCHAIR", "WC"].includes(direct)) return "WH";
    if (direct === "SHARED") return "SH";
    if (["LIMOUSINE", "LIMO"].includes(direct)) return "LM";
    if (direct === "TAXI") return "TX";
    if (direct === "XL") return "XL";
    return direct;
  }

  const num = normalizeText(t?.tripNumber).toUpperCase();

  if (num.includes("-SH") || isSharedTrip(t)) return "SH";
  if (num.includes("-XL")) return "XL";
  if (num.includes("-WH")) return "WH";
  if (num.includes("-TX")) return "TX";
  if (num.includes("-LM")) return "LM";
  if (num.includes("-ST")) return "ST";

  return "ST";
}

function getServiceTitleByCode(code) {
  const c = normalizeText(code).toUpperCase();
  const service = services.find(s => getServiceCodeFromService(s) === c);

  if (service) {
    return service.title || service.name || service.serviceName || service.serviceKey || c;
  }

  if (c === "ALL") return "ALL";
  if (c === "ST") return "Standard";
  if (c === "XL") return "XL";
  if (c === "WH") return "Wheelchair";
  if (c === "TX") return "Taxi";
  if (c === "LM") return "Limo";
  if (c === "SH") return "Shared";

  return c;
}

/* ===============================
   SHARED
================================ */
function isSharedTrip(t) {
  return (
    t?.isShared === true ||
    String(t?.tripType || "").toUpperCase() === "SHARED" ||
    String(t?.type || "").toLowerCase() === "shared" ||
    normalizeText(t?.tripNumber).toUpperCase().includes("-SH") ||
    (Array.isArray(t?.passengers) && t.passengers.length > 0)
  );
}

function getSharedKey(t) {
  return normalizeText(t?.groupId) || normalizeText(t?.tripNumber) || String(t?._id);
}

function getRealPassengersFromGroup(group) {
  const first = group[0] || {};

  if (Array.isArray(first.passengers) && first.passengers.length) {
    return first.passengers;
  }

  return group.map((t, i) => ({
    passengerId:"P" + (i + 1),
    name:t.name || t.clientName || "",
    phone:t.phone || t.clientPhone || "",
    clientName:t.clientName || t.name || "",
    clientPhone:t.clientPhone || t.phone || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled"
  }));
}

function getSharedGroups(list = hubTrips) {
  const map = {};

  list.filter(isSharedTrip).forEach(t => {
    const key = getSharedKey(t);
    if (!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map).map(group =>
    group.sort((a, b) => Number(a.passengerIndex || 0) - Number(b.passengerIndex || 0))
  );
}

function getGroupStatus(group) {
  const passengers = getRealPassengersFromGroup(group);

  if (passengers.length) {
    if (passengers.every(p => cleanStatus(p.status).includes("cancel"))) return "Cancelled";
    if (passengers.every(p => cleanStatus(p.status).includes("confirm"))) return "Confirmed";
    if (passengers.some(p => cleanStatus(p.status).includes("confirm"))) return "Partially Confirmed";
  }

  return group[0]?.status || "Scheduled";
}

/* ===============================
   API
================================ */
async function loadServices() {

  try {

    const token =
      localStorage.getItem("token") || "";

    const res =
      await fetch(
        "/api/services?company=true",
        {
          headers:{
            Authorization:"Bearer " + token
          }
        }
      );

    if(!res.ok){
      throw new Error();
    }

    const data =
      await res.json();

    services =
      Array.isArray(data)
      ? data.filter(s =>
          s &&
          s.enabled !== false &&
          s.companyEnabled !== false
        )
      : [];

  } catch {

    services = [];

  }

}

async function loadHubTrips() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    hubTrips = (Array.isArray(data) ? data : [])
      .filter(t => !shouldRemoveTrip(t))
      .sort((a, b) => getCreatedDate(b) - getCreatedDate(a));

    applyFilters();
  } catch {
    hubTrips = [];
    displayItems = [];
    render();
  }
}

/* ===============================
   FILTERS
================================ */
function buildDisplayItems(trips) {
  const items = [];
  const usedShared = new Set();

  trips.forEach(t => {
    if (isSharedTrip(t)) {
      const key = getSharedKey(t);
      if (usedShared.has(key)) return;

      usedShared.add(key);

      const group =
        getSharedGroups(trips).find(g => getSharedKey(g[0]) === key) || [t];

      items.push({
        kind:"shared",
        key,
        date:getCreatedDate(group[0]),
        group
      });

      return;
    }

    items.push({
      kind:"trip",
      key:String(t._id),
      date:getCreatedDate(t),
      trip:t
    });
  });

  return items.sort((a, b) => b.date - a.date);
}

function searchableText(item) {
  if (item.kind === "trip") {
    const t = item.trip;
    return [
      getTripNumber(t),
      t.company,
      t.entryName,
      t.entryPhone,
      t.clientName,
      t.clientPhone,
      t.pickup,
      t.dropoff,
      t.tripDate,
      t.tripTime,
      t.status
    ].join(" ").toLowerCase();
  }

  const first = item.group[0] || {};
  const passengers = getRealPassengersFromGroup(item.group);

  return [
    getTripNumber(first),
    first.company,
    first.entryName,
    first.entryPhone,
    first.tripDate,
    first.tripTime,
    getGroupStatus(item.group),
    JSON.stringify(passengers)
  ].join(" ").toLowerCase();
}

function applyFilters() {
  let trips = hubTrips;

  if (activeService !== "ALL") {
    trips = trips.filter(t => getServiceCodeFromTrip(t) === activeService);
  }

  displayItems = buildDisplayItems(trips);

  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
  if (q) {
    displayItems = displayItems.filter(item => searchableText(item).includes(q));
  }

  renderServiceTabs();
  updateSelectionButtons();
  render();
}

/* ===============================
   SERVICE SUMMARY TABS
================================ */
function countItemsByService(code) {
  const baseItems = buildDisplayItems(hubTrips);
  const selected = code === "ALL"
    ? baseItems
    : baseItems.filter(item => {
        const t = item.kind === "trip" ? item.trip : item.group[0];
        return getServiceCodeFromTrip(t) === code;
      });

  return {
    total:selected.length,
    gq:selected.filter(item => getSourceCode(item.kind === "trip" ? item.trip : item.group[0]) === "GQ").length,
    co:selected.filter(item => getSourceCode(item.kind === "trip" ? item.trip : item.group[0]) === "CO").length
  };
}

function renderServiceTabs() {
  const wrap = document.getElementById("serviceTabs");
  if (!wrap) return;

  const map = new Map([["ALL", "ALL"]]);

  services.forEach(s => {
    const code = getServiceCodeFromService(s);
    map.set(code, s.title || s.name || s.serviceName || code);
  });

  hubTrips.forEach(t => {
    const code = getServiceCodeFromTrip(t);
    if (!map.has(code)) map.set(code, getServiceTitleByCode(code));
  });

  wrap.innerHTML = Array.from(map.entries()).map(([code, title]) => {
    const c = countItemsByService(code);

    return `
      <button class="service-tab ${activeService === code ? "active" : ""}" data-service="${safe(code)}" type="button">
        <div class="service-title">${safe(title)}</div>
        <div class="service-total">${c.total}</div>
        <div class="service-source">GQ ${c.gq} | CO ${c.co}</div>
      </button>
    `;
  }).join("");

  wrap.querySelectorAll(".service-tab").forEach(btn => {
    btn.onclick = () => {
      activeService = btn.dataset.service || "ALL";
      selectedItems.clear();
      editingKey = null;
      applyFilters();
    };
  });
}

/* ===============================
   SELECTION
================================ */
function toggleSelection(key) {
  if (selectedItems.has(key)) {
    selectedItems.delete(key);
  } else {
    selectedItems.add(key);
  }

  updateSelectionButtons();
}

function updateSelectionButtons() {
  const editBtn = document.getElementById("editSelectedBtn");
  const deleteBtn = document.getElementById("deleteSelectedBtn");

  if (editBtn) editBtn.disabled = selectedItems.size !== 1;
  if (deleteBtn) deleteBtn.disabled = selectedItems.size < 1;
}

function getSelectedItem() {
  const key = Array.from(selectedItems)[0];
  return displayItems.find(item => item.key === key);
}

/* ===============================
   MUTATIONS
================================ */
async function editSelected() {
  if (selectedItems.size !== 1) {
    alert("Please select one trip to edit.");
    return;
  }

  const item = getSelectedItem();
  if (!item) return;

  if (!confirm("Edit selected trip?")) return;

  editingKey = item.key;
  render();
}

async function deleteSelected() {
  if (!selectedItems.size) {
    alert("Please select trip(s) first.");
    return;
  }

  if (!confirm("WARNING\n\nYou are about to permanently delete the selected reservation(s).\n\nThis action cannot be undone.")) {
    return;
  }

  try {
    for (const key of selectedItems) {
      const item = displayItems.find(x => x.key === key);
      if (!item) continue;

      if (item.kind === "trip") {
        await fetch(`${API_URL}/${item.trip._id}`, { method:"DELETE" });
      } else {
        for (const t of item.group) {
          await fetch(`${API_URL}/${t._id}`, { method:"DELETE" });
        }
      }
    }

    selectedItems.clear();
    editingKey = null;
    await loadHubTrips();
  } catch {
    alert("Could not delete selected reservation(s).");
  }
}

async function saveTrip(id) {
  const row = document.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
  const oldTrip = hubTrips.find(t => String(t._id) === String(id));
  if (!row || !oldTrip) return;

  const payload = {};

  row.querySelectorAll(".edit-input").forEach(input => {
    if (input.dataset.field) payload[input.dataset.field] = input.value;
  });

  const valid = validateFutureTrip(
    payload.tripDate || oldTrip.tripDate,
    payload.tripTime || oldTrip.tripTime
  );

  if (!valid.ok) {
    alert(valid.message);
    return;
  }

  try {
    const res = await fetch(`${API_URL}/${id}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(payload)
    });

    if (!res.ok) throw new Error();

    editingKey = null;
    selectedItems.clear();
    await loadHubTrips();
  } catch {
    alert("Could not save trip.");
  }
}

async function saveShared(groupId) {
  const item = displayItems.find(x => x.key === groupId && x.kind === "shared");
  const row = document.querySelector(`tr[data-group-id="${CSS.escape(String(groupId))}"]`);

  if (!item || !row) return;

  const first = item.group[0];
  const passengers = getRealPassengersFromGroup(item.group).map(p => ({ ...p }));
  const payload = {};

  row.querySelectorAll(".edit-input").forEach(input => {
    const field = input.dataset.field;
    if (!field) return;

    if (field.startsWith("p_")) {
      const [, idx, key] = field.split("_");
      const i = Number(idx);

      if (!passengers[i]) return;

      if (key === "name") {
        passengers[i].name = input.value;
        passengers[i].clientName = input.value;
      }

      if (key === "phone") {
        passengers[i].phone = input.value;
        passengers[i].clientPhone = input.value;
      }

      if (key === "pickup") passengers[i].pickup = input.value;
      if (key === "dropoff") passengers[i].dropoff = input.value;

      return;
    }

    payload[field] = input.value;
  });

  payload.passengers = passengers;
  payload.totalPassengers = passengers.length;
  payload.isShared = true;
  payload.tripType = "SHARED";

  const valid = validateFutureTrip(
    payload.tripDate || first.tripDate,
    payload.tripTime || first.tripTime
  );

  if (!valid.ok) {
    alert(valid.message);
    return;
  }

  try {
    for (const t of item.group) {
      const res = await fetch(`${API_URL}/${t._id}`, {
        method:"PUT",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload)
      });

      if (!res.ok) throw new Error();
    }

    editingKey = null;
    selectedItems.clear();
    await loadHubTrips();
  } catch {
    alert("Could not save shared group.");
  }
}

function cancelEdit() {
  editingKey = null;
  render();
}

/* ===============================
   RENDER
================================ */
function rowClass(t) {
  const s = cleanStatus(t.status);

  if (isNewTrip(t)) return "new-trip-row";
  if (s.includes("cancel")) return "cancelled-row";
  if (s.includes("complete")) return "completed-row";
  if (s.includes("confirm")) return "confirmed-row";

  const dt = parseTripDateTime(t.tripDate, t.tripTime);
  if (dt && dt < getAZNow()) return "past-row";

  return "scheduled-row";
}

function render() {
  if (!container) return;

  container.innerHTML = "";

  if (!displayItems.length) {
    container.innerHTML = `<p class="no-data">No trips found</p>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "hub-table";

  table.innerHTML = `
    <tr>
      <th>Select</th>
      <th>#</th>
      <th>Trip #</th>
      <th>Service</th>
      <th>Source</th>
      <th>Type</th>
      <th>Company</th>
      <th>Entry</th>
      <th>Phone</th>
      <th>Client / Passengers</th>
      <th>Pickup</th>
      <th>Stops</th>
      <th>Dropoff</th>
      <th>Date</th>
      <th>Time</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  `;

  displayItems.forEach((item, index) => {
    table.appendChild(
      item.kind === "shared"
        ? renderSharedRow(item, index + 1)
        : renderTripRow(item, index + 1)
    );
  });

  wrap.appendChild(table);
  container.appendChild(wrap);

  updateSelectionButtons();
}

function renderTripRow(item, index) {
  const t = item.trip;
  const editing = editingKey === item.key;
  const tr = document.createElement("tr");

  tr.dataset.id = String(t._id);
  tr.className = rowClass(t);

  const stops = Array.isArray(t.stops) ? t.stops : [];

  tr.innerHTML = `
    <td>
      <input type="checkbox" ${selectedItems.has(item.key) ? "checked" : ""} onchange="toggleSelection('${item.key}')">
    </td>
    <td>${index}</td>
    <td><span class="trip-number-badge">${safe(getTripNumber(t))}</span></td>
    <td><span class="service-pill">${safe(getServiceTitleByCode(getServiceCodeFromTrip(t)))}</span></td>
    <td><span class="source-pill">${safe(getSourceCode(t))}</span></td>
    <td>${safe(t.type || "Trip")}</td>
    <td>${editing ? createEditInput(t.company || "", "company") : safe(t.company || "")}</td>
    <td>${editing ? createEditInput(t.entryName || "", "entryName") : safe(t.entryName || "")}</td>
    <td>${editing ? createEditInput(t.entryPhone || "", "entryPhone") : safe(t.entryPhone || t.clientPhone || "")}</td>
    <td class="wide-client">${editing ? createEditInput(t.clientName || "", "clientName") : safe(t.clientName || "")}</td>
    <td class="wide-address">${editing ? createEditInput(t.pickup || "", "pickup") : safe(t.pickup || "")}</td>
    <td class="wide-address">${stops.length ? stops.map(safe).join("<br>") : "--"}</td>
    <td class="wide-address">${editing ? createEditInput(t.dropoff || "", "dropoff") : safe(t.dropoff || "")}</td>
    <td>${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : safe(t.tripDate || "")}</td>
    <td>${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : safe(t.tripTime || "")}</td>
    <td><strong>${safe(t.status || "Scheduled")}</strong></td>
    <td>
      <div class="actions-wrap">
        ${
          editing
            ? `<button class="btn save" onclick="saveTrip('${t._id}')">Save</button>
               <button class="btn cancel" onclick="cancelEdit()">Cancel</button>`
            : `--`
        }
      </div>
    </td>
  `;

  return tr;
}

function renderSharedRow(item, index) {
  const group = item.group;
  const first = group[0] || {};
  const passengers = getRealPassengersFromGroup(group);
  const editing = editingKey === item.key;

  const tr = document.createElement("tr");
  tr.dataset.groupId = item.key;
  tr.className = rowClass(first);

  const passengerNames = editing
    ? passengers.map((p, i) => createEditInput(p.name || p.clientName || "", `p_${i}_name`)).join("")
    : passengers.map((p, i) => `${i + 1}. ${safe(p.name || p.clientName || "")}`).join("\n");

  const passengerPhones = editing
    ? passengers.map((p, i) => createEditInput(p.phone || p.clientPhone || "", `p_${i}_phone`)).join("")
    : passengers.map((p, i) => `${i + 1}. ${safe(p.phone || p.clientPhone || "")}`).join("\n");

  const pickups = editing
    ? passengers.map((p, i) => createEditInput(p.pickup || "", `p_${i}_pickup`)).join("")
    : passengers.map((p, i) => `${i + 1}. ${safe(p.pickup || "")}`).join("\n");

  const dropoffs = editing
    ? passengers.map((p, i) => createEditInput(p.dropoff || "", `p_${i}_dropoff`)).join("")
    : passengers.map((p, i) => `${i + 1}. ${safe(p.dropoff || "")}`).join("\n");

  tr.innerHTML = `
    <td>
      <input type="checkbox" ${selectedItems.has(item.key) ? "checked" : ""} onchange="toggleSelection('${item.key}')">
    </td>
    <td>${index}</td>
    <td><span class="trip-number-badge">${safe(getTripNumber(first))}</span></td>
    <td><span class="service-pill">Shared</span></td>
    <td><span class="source-pill">${safe(getSourceCode(first))}</span></td>
    <td>Shared (${passengers.length})</td>
    <td>${editing ? createEditInput(first.company || "", "company") : safe(first.company || "")}</td>
    <td>${editing ? createEditInput(first.entryName || "", "entryName") : safe(first.entryName || "")}</td>
    <td class="wide-client">${passengerPhones}</td>
    <td class="wide-client">${passengerNames}</td>
    <td class="wide-address">${pickups}</td>
    <td>--</td>
    <td class="wide-address">${dropoffs}</td>
    <td>${editing ? createEditInput(first.tripDate || "", "tripDate", "date") : safe(first.tripDate || "")}</td>
    <td>${editing ? createEditInput(first.tripTime || "", "tripTime", "time") : safe(first.tripTime || "")}</td>
    <td><strong>${safe(getGroupStatus(group))}</strong></td>
    <td>
      <div class="actions-wrap">
        ${
          editing
            ? `<button class="btn save" onclick="saveShared('${item.key}')">Save</button>
               <button class="btn cancel" onclick="cancelEdit()">Cancel</button>`
            : `--`
        }
      </div>
    </td>
  `;

  return tr;
}

/* ===============================
   EVENTS
================================ */
searchInput?.addEventListener("input", applyFilters);

document.getElementById("editSelectedBtn")?.addEventListener("click", editSelected);
document.getElementById("deleteSelectedBtn")?.addEventListener("click", deleteSelected);

Object.assign(window, {
  toggleSelection,
  saveTrip,
  saveShared,
  cancelEdit
});

/* ===============================
   INIT
================================ */
async function refreshEverything() {
  if (editingKey) return;

  await loadServices();
  await loadHubTrips();
}

(async function initHub() {
  await refreshEverything();
  setInterval(refreshEverything, 30000);
})();