/* =====================================================
   DISPATCH ENGINE - CLEAN ORIGINAL BUILD
===================================================== */

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

let trips = [];
let drivers = [];
let allDrivers = [];
let services = [];
let schedule = {};
let timezone = "America/Phoenix";

let selectedIds = new Set();
let editMode = false;
let refreshTimer = null;

const CLOSED_STATUSES = [
  "completed",
  "complete",
  "cancelled",
  "canceled",
  "no show",
  "noshow",
  "not completed",
  "notcompleted"
];

function clean(v){
  return String(v ?? "").trim();
}

function lower(v){
  return clean(v).toLowerCase();
}

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function statusKey(v){
  return lower(v)
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function isClosedTrip(t){
  return CLOSED_STATUSES.includes(statusKey(t.status));
}

function getDateOnly(v){
  return clean(v).substring(0,10);
}

function getSystemDate(offset=0){
  const parts = new Intl.DateTimeFormat("en-CA",{
    timeZone:timezone,
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(new Date());

  const y = Number(parts.find(p=>p.type==="year")?.value);
  const m = Number(parts.find(p=>p.type==="month")?.value);
  const d = Number(parts.find(p=>p.type==="day")?.value);

  const base = new Date(y,m-1,d);
  base.setDate(base.getDate() + offset);

  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,"0")}-${String(base.getDate()).padStart(2,"0")}`;
}

function todayKey(){
  return getSystemDate(0);
}

function tomorrowKey(){
  return getSystemDate(1);
}

function isToday(t){
  return getDateOnly(t.tripDate) === todayKey();
}

function isTomorrow(t){
  return getDateOnly(t.tripDate) === tomorrowKey();
}

function parseTripDateTime(t){
  const d = getDateOnly(t.tripDate);
  const tm = clean(t.tripTime || "00:00");

  if(!d) return null;

  const dt = new Date(`${d}T${tm}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getTripTimeValue(t){
  const dt = parseTripDateTime(t);
  return dt ? dt.getTime() : 0;
}

function normalizeService(v){
  const x = clean(v).toUpperCase().replace(/\s+/g,"");

  if(["STANDARD","ST","X"].includes(x)) return "ST";
  if(["WHEELCHAIR","WH","WC"].includes(x)) return "WH";
  if(["SHARED","SH"].includes(x)) return "SH";
  if(["LIMO","LIMOUSINE","LM"].includes(x)) return "LM";
  if(["TAXI","TX"].includes(x)) return "TX";
  if(["XL"].includes(x)) return "XL";
  if(["ALL"].includes(x)) return "ALL";

  return x || "ST";
}

function isSharedTrip(t){
  return (
    t.isShared === true ||
    normalizeService(t.serviceKey) === "SH" ||
    normalizeService(t.serviceCode) === "SH" ||
    normalizeService(t.serviceType) === "SH" ||
    lower(t.type) === "shared" ||
    clean(t.groupId) !== "" ||
    (Array.isArray(t.passengers) && t.passengers.length > 0)
  );
}

function getTripServiceCode(t){
  if(isSharedTrip(t)) return "SH";

  return normalizeService(
    t.serviceKey ||
    t.serviceCode ||
    t.serviceType ||
    t.serviceSuffix ||
    t.vehicleTypeFromQuote ||
    t.vehicle ||
    ""
  );
}

function getServiceTitle(code){
  code = normalizeService(code);

  const s = services.find(x=>{
    return normalizeService(
      x.serviceKey ||
      x.code ||
      x.suffix ||
      x.companySuffix ||
      x.title ||
      x.name
    ) === code;
  });

  return s?.title || s?.name || s?.serviceName || code;
}

function getTripKind(t){
  if(isSharedTrip(t)) return "SH";

  const raw = [
    t.type,
    t.source,
    t.bookingSource,
    t.reservationStatus,
    t.tripNumber,
    t.company ? "facility" : ""
  ].join(" ").toLowerCase();

  if(raw.includes("reserved") || raw.includes("reservation") || raw.includes("rv")) return "RV";
  if(raw.includes("company") || raw.includes("facility") || t.company) return "FA";

  return "GQ";
}

function rowClass(t){
  if(isSharedTrip(t)) return "row-shared";

  const k = getTripKind(t);

  if(k === "FA") return "row-facility";
  if(k === "RV") return "row-rv";

  return "row-gq";
}

function getTripNumber(t){
  return clean(t.tripNumber || t.bookingNumber || t._id || "-");
}

function getTripNotes(t){
  return clean(t.notes || "");
}

function getStops(t){
  if(Array.isArray(t.stops)) return t.stops;
  if(Array.isArray(t.stopAddresses)) return t.stopAddresses;
  if(Array.isArray(t.extraStops)) return t.extraStops;
  return [];
}

function stopText(s){
  if(!s) return "";
  if(typeof s === "string") return s;
  return s.address || s.location || s.name || "";
}

function stopsText(t){
  const arr = getStops(t).map(stopText).filter(Boolean);
  return arr.length ? arr.map((x,i)=>`${i+1}. ${x}`).join("\n") : "-";
}

function getPassengers(t){
  if(Array.isArray(t.passengers) && t.passengers.length){
    return t.passengers;
  }

  return [{
    name:t.clientName || t.name || "",
    phone:t.clientPhone || t.phone || "",
    email:t.clientEmail || t.email || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || ""
  }];
}

function sharedCell(t,field){
  return getPassengers(t).map((p,i)=>{
    if(field === "name") return `${i+1}. ${p.name || p.clientName || ""}`;
    if(field === "phone") return `${i+1}. ${p.phone || p.clientPhone || ""}`;
    if(field === "email") return `${i+1}. ${p.email || p.clientEmail || ""}`;
    if(field === "pickup") return `${i+1}. ${p.pickup || ""}`;
    if(field === "dropoff") return `${i+1}. ${p.dropoff || ""}`;
    return "";
  }).join("\n");
}

function normalizeDriver(d){
  return {
    ...d,
    _id:String(d._id || d.id || "")
  };
}

function normalizeScheduleRow(row){
  row = row || {};

  return {
    phone:row.phone || "",
    address:row.address || "",
    lat:row.lat ?? null,
    lng:row.lng ?? null,
    vehicleNumber:row.vehicleNumber || row.vehicle || row.carNumber || "",
    enabled:row.enabled !== false,
    days:row.days || row.weekly || {},
    services:
      Array.isArray(row.services) && row.services.length
        ? row.services.map(normalizeService)
        : ["ALL"]
  };
}

function getSchedule(id){
  return schedule[String(id)] || {};
}

function getDriverName(id){
  const d = allDrivers.find(x=>String(x._id) === String(id));
  return d?.name || d?.fullName || "";
}

function getDriverVehicle(id){
  const s = getSchedule(id);
  const d = allDrivers.find(x=>String(x._id) === String(id));

  return (
    s.vehicleNumber ||
    d?.vehicleNumber ||
    d?.carNumber ||
    ""
  );
}

function getDriverServices(id){
  const s = normalizeScheduleRow(getSchedule(id));
  return s.services.length ? s.services : ["ALL"];
}

function normalizeTrip(t){
  const id = String(t._id || t.id || "");

  return {
    ...t,
    _id:id,
    tripDate:getDateOnly(t.tripDate),
    selected:selectedIds.has(id),
    driverId:t.driverId ? String(t.driverId) : "",
    driverName:t.driverName || "",
    vehicle:t.vehicle || t.vehicleNumber || "",
    dispatchStatus:t.dispatchStatus || "UNASSIGNED",
    smartScore:t.smartScore || "",
    smartReason:t.smartReason || "",
    smartDistance:t.smartDistance || ""
  };
}

function filterTrips(rawTrips){

  const seen = new Set();

  return rawTrips
    .filter(t=>{

      const id = String(t._id || t.id || "");

      if(!id || seen.has(id))
        return false;

      seen.add(id);

      if(t.disabled === true)
        return false;

      if(isClosedTrip(t))
        return false;

      return true;

    })
    .map(normalizeTrip)
    .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b));

}

async function loadSmartEngine(){

  try{

    const res = await fetch("/api/smart-dispatch-engine");

    if(!res.ok)
      throw new Error("Smart engine load failed");

    const data = await res.json();

    SMART = {
      ...SMART_DEFAULTS,
      ...(data || {})
    };

  }catch(err){

    console.log("SMART ENGINE LOAD ERROR:",err);

    SMART = {
      ...SMART_DEFAULTS
    };

  }

}

async function loadAll(){

  const data = await Store.load();

  timezone =
    data.timezone ||
    "America/Phoenix";

  services =
    Array.isArray(data.services)
      ? data.services
      : [];

  schedule = {};

  Object.keys(data.schedule || {}).forEach(id=>{
    schedule[String(id)] =
      normalizeScheduleRow(data.schedule[id]);
  });

  allDrivers =
    (Array.isArray(data.drivers) ? data.drivers : [])
    .map(normalizeDriver)
    .filter(d=>d._id);

  drivers = allDrivers;

  trips =
    filterTrips(
      Array.isArray(data.trips)
        ? data.trips
        : []
    );

}

/* ================= ASSIGNMENT ================= */

function driverMatchesTrip(driverId,trip){

  if(!driverId)
    return true;

  const driverServices =
    getDriverServices(driverId);

  const tripService =
    getTripServiceCode(trip);

  return (
    driverServices.includes("ALL") ||
    driverServices.includes(tripService)
  );

}

async function saveAssignment(trip,driverId,manual=true){

  driverId = clean(driverId);

  const oldDriverId =
    trip.driverId;

  const oldDriverName =
    trip.driverName;

  const oldVehicle =
    trip.vehicle;

  if(driverId && !driverMatchesTrip(driverId,trip)){
    toast("Driver service does not match trip");
    renderAll();
    return;
  }

  trip.driverId =
    driverId;

  trip.driverName =
    driverId
      ? getDriverName(driverId)
      : "";

  trip.vehicle =
    driverId
      ? getDriverVehicle(driverId)
      : "";

  trip.dispatchStatus =
    driverId
      ? "ASSIGNED"
      : "UNASSIGNED";

  try{

    const res =
      await Store.saveDriver(
        trip._id,
        driverId
      );

    if(res && res.success === false){

      trip.driverId =
        oldDriverId;

      trip.driverName =
        oldDriverName;

      trip.vehicle =
        oldVehicle;

      toast(
        res.message ||
        "Driver save failed"
      );

      renderAll();

      return;

    }

    toast(
      driverId
        ? "Driver assigned"
        : "Driver removed"
    );

  }catch(err){

    console.log(
      "SAVE ASSIGNMENT ERROR:",
      err
    );

    trip.driverId =
      oldDriverId;

    trip.driverName =
      oldDriverName;

    trip.vehicle =
      oldVehicle;

    toast("Driver save failed");

  }

  renderAll();

}

function getAvailableDriversForTrip(trip){

  return allDrivers
    .filter(d=>{

      const id =
        String(d._id || "");

      if(!id)
        return false;

      return driverMatchesTrip(
        id,
        trip
      );

    })
    .sort((a,b)=>
      clean(a.name || a.fullName)
      .localeCompare(
        clean(b.name || b.fullName)
      )
    );

}

async function autoAssign(){

  const list =
    trips
    .filter(t=>!clean(t.driverId))
    .sort((a,b)=>
      getTripTimeValue(a) -
      getTripTimeValue(b)
    );

  if(!list.length){
    toast("No unassigned trips");
    return;
  }

  let assigned = 0;

  for(const trip of list){

    const available =
      getAvailableDriversForTrip(trip);

    const driver =
      available[0];

    if(!driver)
      continue;

    const driverId =
      String(driver._id);

    trip.driverId =
      driverId;

    trip.driverName =
      driver.name ||
      driver.fullName ||
      "";

    trip.vehicle =
      getDriverVehicle(driverId);

    trip.dispatchStatus =
      "ASSIGNED";

    try{

      const res =
        await Store.saveDriver(
          trip._id,
          driverId
        );

      if(res && res.success === false){

        trip.driverId = "";
        trip.driverName = "";
        trip.vehicle = "";
        trip.dispatchStatus = "UNASSIGNED";

        continue;

      }

      assigned++;

    }catch(err){

      console.log(
        "AUTO ASSIGN ERROR:",
        err
      );

      trip.driverId = "";
      trip.driverName = "";
      trip.vehicle = "";
      trip.dispatchStatus = "UNASSIGNED";

    }

  }

  renderAll();

  toast(`${assigned} trip(s) assigned`);

}

/* ================= SEND ================= */

async function sendTrips(ids){

  ids =
    ids.map(String)
    .filter(Boolean);

  if(!ids.length){
    toast("No trips selected");
    return;
  }

  const selectedTrips =
    trips.filter(t=>
      ids.includes(String(t._id))
    );

  for(const t of selectedTrips){

    if(!clean(t.driverId)){
      toast(
        `Trip ${getTripNumber(t)} has no driver`
      );
      return;
    }

  }

  try{

    const res =
      await Store.sendTrips(ids);

    if(res && res.success === false){
      toast(res.message || "Send failed");
      return;
    }

    selectedTrips.forEach(t=>{

      t.status =
        "Dispatched";

      t.dispatchStatus =
        "SENT";

      t.dispatchSelected =
        false;

      selectedIds.delete(t._id);

    });

    trips =
      trips.filter(t=>
        !ids.includes(String(t._id))
      );

    renderAll();

    toast(`${ids.length} trip(s) sent`);

  }catch(err){

    console.log(
      "SEND TRIPS ERROR:",
      err
    );

    toast("Send failed");

  }

}

function sendSelected(){

  const ids =
    trips
    .filter(t=>
      selectedIds.has(t._id)
    )
    .map(t=>t._id);

  sendTrips(ids);

}

function sendAll(){

  const ids =
    trips
    .filter(t=>
      clean(t.driverId)
    )
    .map(t=>t._id);

  sendTrips(ids);

}

function sendOne(id){

  sendTrips([
    String(id)
  ]);

}

/* ================= SELECTION ================= */

function toggleSelectAll(){

  const allSelected =
    trips.length &&
    trips.every(t=>
      selectedIds.has(t._id)
    );

  if(allSelected){

    trips.forEach(t=>
      selectedIds.delete(t._id)
    );

  }else{

    trips.forEach(t=>
      selectedIds.add(t._id)
    );

  }

  renderAll();

}

function toggleTrip(id){

  id = String(id);

  if(selectedIds.has(id)){
    selectedIds.delete(id);
  }else{
    selectedIds.add(id);
  }

  renderAll();

}

function toggleEdit(){

  editMode =
    !editMode;

  renderAll();

  toast(
    editMode
      ? "Edit mode enabled"
      : "Edit mode disabled"
  );

}

/* ================= RENDER HELPERS ================= */

function setText(id,value){

  const el =
    document.getElementById(id);

  if(el)
    el.textContent = value;

}

function renderStats(){

  const total =
    trips.length;

  const assigned =
    trips.filter(t=>
      clean(t.driverId)
    ).length;

  const unassigned =
    total - assigned;

  const today =
    trips.filter(isToday).length;

  const tomorrow =
    trips.filter(isTomorrow).length;

  setText("statTotalTrips",total);
  setText("statAssignedTrips",assigned);
  setText("statUnassignedTrips",unassigned);
  setText("statActiveDrivers",drivers.length);
  setText("statTodayTrips",today);
  setText("statTomorrowTrips",tomorrow);

  setText("driversTabActive",drivers.length);
  setText("driversTabAssigned",assigned);
  setText("driversTabUnassigned",unassigned);

  const selectBtn =
    document.getElementById("selectBtn");

  if(selectBtn){

    const allSelected =
      trips.length &&
      trips.every(t=>
        selectedIds.has(t._id)
      );

    selectBtn.textContent =
      allSelected
        ? "Remove All"
        : "Select All";

  }

  const editBtn =
    document.getElementById("editBtn");

  if(editBtn){

    editBtn.textContent =
      editMode
        ? "Save Edit"
        : "Edit Selected";

  }

}

function driverOptions(t){

  const list =
    getAvailableDriversForTrip(t);

  return `
    <select class="driver-select"
      ${editMode ? "" : "disabled"}
      onchange="assignDriver('${safe(t._id)}',this.value)">
      <option value="">--</option>

      ${list.map(d=>{

        const id =
          String(d._id);

        const name =
          d.name ||
          d.fullName ||
          "";

        const vehicle =
          getDriverVehicle(id) ||
          "-";

        return `
          <option value="${safe(id)}"
            ${String(t.driverId) === id ? "selected" : ""}>
            ${safe(name)} - ${safe(vehicle)}
          </option>
        `;

      }).join("")}

    </select>
  `;

}

function renderTripRow(t,index){

  const shared =
    isSharedTrip(t);

  const passengerName =
    shared
      ? sharedCell(t,"name")
      : (t.clientName || t.name || "");

  const phone =
    shared
      ? sharedCell(t,"phone")
      : (t.clientPhone || t.phone || "");

  const email =
    shared
      ? sharedCell(t,"email")
      : (t.clientEmail || t.email || "");

  const pickup =
    shared
      ? sharedCell(t,"pickup")
      : (t.pickup || "");

  const dropoff =
    shared
      ? sharedCell(t,"dropoff")
      : (t.dropoff || "");

  const cls =
    [
      rowClass(t),
      clean(t.driverId)
        ? "row-assigned"
        : "row-unassigned"
    ].join(" ");

  return `
    <tr class="${cls}">

      <td>
        <input type="checkbox"
          ${selectedIds.has(t._id) ? "checked" : ""}
          onchange="toggleTrip('${safe(t._id)}')">
      </td>

      <td>${index}</td>

      <td>
        <span class="trip-number-badge">
          ${safe(getTripNumber(t))}
        </span>
      </td>

      <td>
        <span class="service-pill">
          ${safe(getServiceTitle(getTripServiceCode(t)))}
        </span>
      </td>

      <td>${safe(shared ? "Shared" : getTripKind(t))}</td>

      <td>${safe(t.company || t.companyName || t.facilityName || "")}</td>

      <td>${safe(t.entryName || "")}</td>

      <td>${safe(t.entryPhone || "")}</td>

      <td class="wide-client">${safe(passengerName)}</td>

      <td class="wide-phone">${safe(phone)}</td>

      <td class="wide-email">${safe(email)}</td>

      <td class="wide-address">${safe(pickup)}</td>

      <td class="wide-address">
        ${safe(shared ? "Route optimized per passenger" : stopsText(t))}
      </td>

      <td class="wide-address">${safe(dropoff)}</td>

      <td>${safe(t.tripDate || "")}</td>

      <td>${safe(t.tripTime || "")}</td>

      <td>${driverOptions(t)}</td>

      <td>
        <span class="vehicle-pill">
          ${safe(t.vehicle || getDriverVehicle(t.driverId) || "-")}
        </span>
      </td>

      <td>
        <span class="status-pill">
          ${safe(t.dispatchStatus || "UNASSIGNED")}
        </span>
      </td>

      <td class="wide-notes">
        ${safe(getTripNotes(t))}
      </td>

      <td>
        <span class="status-pill">
          ${safe(t.status || "Scheduled")}
        </span>
      </td>

      <td>
        <button class="btn green"
          onclick="sendOne('${safe(t._id)}')">
          Send
        </button>
      </td>

    </tr>
  `;

}

/* ================= TABLES ================= */

function renderTable(bodyId,list){

  const body =
    document.getElementById(bodyId);

  if(!body)
    return;

  if(!list.length){

    body.innerHTML = `
      <tr>
        <td colspan="22" class="empty-row">
          No Trips
        </td>
      </tr>
    `;

    return;

  }

  body.innerHTML =
    list
    .sort((a,b)=>
      getTripTimeValue(a) -
      getTripTimeValue(b)
    )
    .map((t,i)=>
      renderTripRow(t,i+1)
    )
    .join("");

}

function renderDriversTab(){

  const wrap =
    document.getElementById(
      "driversContainer"
    );

  if(!wrap)
    return;

  if(!drivers.length){

    wrap.innerHTML = `
      <div class="driver-card">
        No Drivers
      </div>
    `;

    return;

  }

  wrap.innerHTML =
    drivers.map(driver=>{

      const id =
        String(driver._id);

      const driverTrips =
        trips
        .filter(t=>
          String(t.driverId) === id
        )
        .sort((a,b)=>
          getTripTimeValue(a) -
          getTripTimeValue(b)
        );

      return `
        <div class="driver-card">

          <div class="driver-card-name">
            ${safe(
              driver.name ||
              driver.fullName ||
              "-"
            )}
          </div>

          <div class="driver-card-line">
            Vehicle:
            ${safe(
              getDriverVehicle(id) || "-"
            )}
          </div>

          <div class="driver-card-line">
            Trips:
            ${driverTrips.length}
          </div>

          <div class="driver-card-line">
            Services:
            ${safe(
              getDriverServices(id)
              .join(", ")
            )}
          </div>

          <div class="driver-card-trips">

            ${
              driverTrips.length
              ? driverTrips.map((t,i)=>`
                  ${i+1}.
                  ${getTripNumber(t)}
                  -
                  ${t.tripTime}
                `).join("<br>")
              : "No Trips Assigned"
            }

          </div>

        </div>
      `;

    }).join("");

}

/* ================= MAIN RENDER ================= */

function renderAll(){

  renderStats();

  renderTable(
    "todayDispatchBody",
    trips.filter(isToday)
  );

  renderTable(
    "tomorrowDispatchBody",
    trips.filter(isTomorrow)
  );

  renderDriversTab();

}

/* ================= TABS ================= */

function bindTabs(){

  const dispatchTab =
    document.getElementById(
      "tabDispatch"
    );

  const driversTab =
    document.getElementById(
      "tabDrivers"
    );

  const dispatchPage =
    document.getElementById(
      "dispatchPage"
    );

  const driversPage =
    document.getElementById(
      "driversPage"
    );

  if(
    !dispatchTab ||
    !driversTab ||
    !dispatchPage ||
    !driversPage
  ){
    return;
  }

  dispatchTab.onclick = ()=>{

    dispatchTab.classList.add(
      "active"
    );

    driversTab.classList.remove(
      "active"
    );

    dispatchPage.classList.add(
      "active"
    );

    driversPage.classList.remove(
      "active"
    );

  };

  driversTab.onclick = ()=>{

    driversTab.classList.add(
      "active"
    );

    dispatchTab.classList.remove(
      "active"
    );

    driversPage.classList.add(
      "active"
    );

    dispatchPage.classList.remove(
      "active"
    );

    renderDriversTab();

  };

}

/* ================= ACTIONS ================= */

function bindActions(){

  document
    .getElementById("selectBtn")
    ?.addEventListener(
      "click",
      toggleSelectAll
    );

  document
    .getElementById("editBtn")
    ?.addEventListener(
      "click",
      toggleEdit
    );

  document
    .getElementById("autoAssignBtn")
    ?.addEventListener(
      "click",
      autoAssign
    );

  document
    .getElementById("sendSelectedBtn")
    ?.addEventListener(
      "click",
      sendSelected
    );

  document
    .getElementById("sendAllBtn")
    ?.addEventListener(
      "click",
      sendAll
    );

}

/* ================= TOAST ================= */

function toast(msg){

  const el =
    document.getElementById(
      "toast"
    );

  if(!el){

    console.log(msg);
    return;

  }

  el.textContent = msg;

  el.classList.add(
    "show"
  );

  clearTimeout(
    toast._timer
  );

  toast._timer =
    setTimeout(()=>{

      el.classList.remove(
        "show"
      );

    },2000);

}

/* ================= GLOBAL ================= */

window.toggleTrip =
  toggleTrip;

window.sendOne =
  sendOne;

window.sendSelected =
  sendSelected;

window.sendAll =
  sendAll;

window.autoAssign =
  autoAssign;

window.assignDriver =
  function(id,driverId){

    const trip =
      trips.find(t=>
        String(t._id) ===
        String(id)
      );

    if(trip){

      saveAssignment(
        trip,
        driverId,
        true
      );

    }

  };

/* ================= REFRESH ================= */

async function refresh(){

  const keepSelected =
    new Set(selectedIds);

  await loadSmartEngine();
  await loadAll();

  selectedIds =
    new Set(
      [...keepSelected]
      .filter(id=>
        trips.some(t=>
          t._id === id
        )
      )
    );

  renderAll();

}

/* ================= INIT ================= */

document.addEventListener(
  "DOMContentLoaded",
  async()=>{

    bindTabs();
    bindActions();

    await refresh();

    if(refreshTimer){
      clearInterval(
        refreshTimer
      );
    }

    refreshTimer =
      setInterval(
        async()=>{

          if(editMode)
            return;

          await refresh();

        },
        30000
      );

  }
);