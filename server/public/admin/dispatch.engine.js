/* =====================================================
   DISPATCH ENGINE V2
   Trips Selected -> Auto / Manual Assign -> Send
===================================================== */

/* ================= SECURITY ================= */

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ================= STATE ================= */

let trips = [];
let drivers = [];
let services = [];
let schedule = {};
let timezone = "America/Phoenix";

let selectedIds = new Set();
let editMode = false;
let activeTab = "dispatch";
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

const ACTIVE_STATUSES = [
  "scheduled",
  "confirmed",
  "paid",
  "dispatched"
];

/* ================= HELPERS ================= */

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
  return lower(v).replace(/[_-]/g," ").replace(/\s+/g," ").trim();
}

function isClosedTrip(t){
  const s = statusKey(t.status);
  return CLOSED_STATUSES.includes(s);
}

function isActiveTrip(t){
  const s = statusKey(t.status || "scheduled");
  return ACTIVE_STATUSES.includes(s) && !isClosedTrip(t);
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
  base.setDate(base.getDate()+offset);

  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,"0")}-${String(base.getDate()).padStart(2,"0")}`;
}

function todayKey(){ return getSystemDate(0); }
function tomorrowKey(){ return getSystemDate(1); }

function isToday(t){
  return clean(t.tripDate) === todayKey();
}

function isTomorrow(t){
  return clean(t.tripDate) === tomorrowKey();
}

function parseTripDateTime(t){
  const d = clean(t.tripDate);
  let time = clean(t.tripTime || "00:00");
  if(!d) return null;
  if(!time) time = "00:00";

  let dt = new Date(`${d}T${time}:00`);
  if(isNaN(dt.getTime())) dt = new Date(`${d} ${time}`);
  return isNaN(dt.getTime()) ? null : dt;
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
  return x || "ST";
}

function isSharedTrip(t){
  return (
    t.isShared === true ||
    normalizeService(t.serviceKey) === "SH" ||
    normalizeService(t.serviceCode) === "SH" ||
    normalizeService(t.serviceType) === "SH" ||
    normalizeService(t.tripType) === "SH" ||
    lower(t.type) === "shared" ||
    clean(t.groupId) !== "" ||
    clean(t.tripNumber).toUpperCase().includes("-SH") ||
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
  const s = services.find(x=>normalizeService(
    x.serviceKey || x.code || x.suffix || x.companySuffix || x.title || x.name
  ) === code);

  return s?.title || s?.name || s?.serviceName || code;
}

function getTripKind(t){
  if(isSharedTrip(t)) return "SH";

  const raw = [
    t.type,
    t.source,
    t.bookingSource,
    t.createdBy,
    t.from,
    t.tripType,
    t.reservationStatus,
    t.tripNumber,
    t.company ? "facility" : ""
  ].join(" ").toLowerCase();

  if(raw.includes("reserved") || raw.includes("reservation") || raw.includes("rv")) return "RV";
  if(raw.includes("company") || raw.includes("facility") || raw.includes("portal") || t.company) return "FA";
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

function getEmail(t,p=null){
  return p?.clientEmail || p?.passengerEmail || p?.email ||
    t.clientEmail || t.passengerEmail || t.entryEmail || t.email || "";
}

function getNotes(t){
  return t.notes ?? t.tripNotes ?? t.note ?? "";
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
  if(Array.isArray(t.passengers) && t.passengers.length) return t.passengers;

  return [{
    name:t.clientName || t.name || "",
    clientName:t.clientName || t.name || "",
    phone:t.clientPhone || t.phone || "",
    clientPhone:t.clientPhone || t.phone || "",
    email:t.clientEmail || t.email || "",
    clientEmail:t.clientEmail || t.email || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled"
  }];
}

function sharedCell(t,field){
  const passengers = getPassengers(t);

  return passengers.map((p,i)=>{
    if(field === "name") return `${i+1}. ${p.name || p.clientName || ""}`;
    if(field === "phone") return `${i+1}. ${p.phone || p.clientPhone || ""}`;
    if(field === "email") return `${i+1}. ${getEmail(t,p) || ""}`;
    if(field === "pickup") return `${i+1}. ${p.pickup || ""}`;
    if(field === "dropoff") return `${i+1}. ${p.dropoff || ""}`;
    return "";
  }).join("\n");
}

function getTripPickup(t){
  if(isSharedTrip(t)) return getPassengers(t)[0]?.pickup || t.pickup || "";
  return t.pickup || "";
}

function getTripDropoff(t){
  if(isSharedTrip(t)){
    const p = getPassengers(t);
    return p[p.length-1]?.dropoff || t.dropoff || "";
  }
  return t.dropoff || "";
}

/* ================= DRIVER HELPERS ================= */

function getSchedule(id){
  return schedule[String(id)] || {};
}

function getDriverName(id){
  const d = drivers.find(x=>String(x._id) === String(id));
  return d?.name || d?.fullName || "";
}

function getDriverVehicle(id){
  const s = getSchedule(id);
  const d = drivers.find(x=>String(x._id) === String(id));

  return (
    s.vehicleNumber ||
    s.carNumber ||
    d?.vehicleNumber ||
    d?.carNumber ||
    ""
  );
}

function getDriverServices(id){
  const s = getSchedule(id);
  const arr = Array.isArray(s.services) && s.services.length ? s.services : ["ALL"];
  return arr.map(x=>normalizeService(x));
}

function serviceMatchesDriver(driverId,trip){
  const driverServices = getDriverServices(driverId);
  const code = getTripServiceCode(trip);
  return driverServices.includes("ALL") || driverServices.includes(code);
}

function dayKeyFromDate(dateStr){
  const d = new Date(`${dateStr}T00:00:00`);
  if(isNaN(d.getTime())) return "";
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()];
}

function isDriverActiveForTrip(driverId,trip){
  const s = getSchedule(driverId);

  if(s.enabled !== true) return false;

  const day = dayKeyFromDate(trip.tripDate);
  if(!day) return true;

  const days = s.days || s.weekly || {};
  if(!Object.keys(days).length) return true;

  return days[day] === true;
}

function getActiveDriversForTrip(trip){
  return drivers.filter(d=>{
    const id = String(d._id || d.id || "");
    if(!id) return false;
    return isDriverActiveForTrip(id,trip) && serviceMatchesDriver(id,trip);
  });
}

function getDriverHomeAddress(driverId){
  const s = getSchedule(driverId);
  const d = drivers.find(x=>String(x._id) === String(driverId));

  return (
    s.address ||
    d?.address ||
    d?.homeAddress ||
    d?.currentAddress ||
    d?.locationAddress ||
    ""
  );
}

function getDriverStartAddress(driverId,dayTrips){
  const assigned = dayTrips
    .filter(t=>String(t.driverId || "") === String(driverId))
    .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b));

  if(!assigned.length) return getDriverHomeAddress(driverId);

  return getTripDropoff(assigned[assigned.length-1]);
}

function driverTripCount(driverId){
  return trips.filter(t=>String(t.driverId || "") === String(driverId)).length;
}

function driverTripCountByDate(driverId,date){
  return trips.filter(t=>
    String(t.driverId || "") === String(driverId) &&
    clean(t.tripDate) === clean(date)
  ).length;
}

/* ================= GOOGLE DISTANCE ================= */

async function googleDistanceMiles(origin,destination){
  origin = clean(origin);
  destination = clean(destination);

  if(!origin || !destination) return 999999;

  try{
    if(window.google && google.maps && google.maps.DistanceMatrixService){
      return await new Promise(resolve=>{
        const service = new google.maps.DistanceMatrixService();

        service.getDistanceMatrix({
          origins:[origin],
          destinations:[destination],
          travelMode:google.maps.TravelMode.DRIVING,
          unitSystem:google.maps.UnitSystem.IMPERIAL
        },(response,status)=>{
          if(status !== "OK"){
            resolve(999999);
            return;
          }

          const el = response?.rows?.[0]?.elements?.[0];
          if(!el || el.status !== "OK"){
            resolve(999999);
            return;
          }

          resolve(Number((el.distance.value * 0.000621371).toFixed(2)));
        });
      });
    }
  }catch(err){
    console.log("Google distance failed",err);
  }

  return fallbackDistance(origin,destination);
}

function fallbackDistance(a,b){
  a = lower(a);
  b = lower(b);

  const cities = ["chandler","mesa","tempe","gilbert","phoenix","scottsdale","queen creek","glendale","peoria"];

  for(const c of cities){
    if(a.includes(c) && b.includes(c)) return 3;
  }

  return 25;
}

/* ================= LOAD GOOGLE ================= */

async function loadGoogle(){
  if(window.google && google.maps && google.maps.DistanceMatrixService) return;

  try{
    const res = await fetch("/api/config");
    const data = await res.json();

    if(!data.googleKey) return;

    if(document.querySelector("script[data-dispatch-google='true']")){
      return;
    }

    await new Promise((resolve,reject)=>{
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;
      script.defer = true;
      script.dataset.dispatchGoogle = "true";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

  }catch(err){
    console.log("Google load failed",err);
  }
}

/* ================= DATA BUILD ================= */

function normalizeDriver(d){
  const id = String(d._id || d.id || "");
  return {
    ...d,
    _id:id
  };
}

function normalizeTrip(t){
  return {
    ...t,
    _id:String(t._id || t.id || ""),
    selected:selectedIds.has(String(t._id || t.id || "")),
    driverId:t.driverId ? String(t.driverId) : "",
    driverName:t.driverName || "",
    vehicle:t.vehicle || "",
    manual:t.manualAssigned === true || t.manual === true
  };
}

function filterTrips(rawTrips){
  const seen = new Set();

  return rawTrips
    .filter(t=>{
      const id = String(t._id || t.id || "");
      if(!id || seen.has(id)) return false;
      seen.add(id);

      if(t.dispatchSelected !== true) return false;
      if(t.disabled === true) return false;
      if(!isActiveTrip(t)) return false;
      if(!isToday(t) && !isTomorrow(t)) return false;

      return true;
    })
    .map(normalizeTrip)
    .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b));
}

async function loadAll(){
  const data = await Store.load();

  timezone = data.timezone || "America/Phoenix";
  services = Array.isArray(data.services) ? data.services : [];
  schedule = data.schedule || {};

  drivers = (Array.isArray(data.drivers) ? data.drivers : [])
    .map(normalizeDriver)
    .filter(d=>{
      const s = getSchedule(d._id);
      return s.enabled === true;
    });

  trips = filterTrips(Array.isArray(data.trips) ? data.trips : []);

  await loadGoogle();
}

/* ================= ASSIGNMENT ================= */

async function autoAssign(){
  const dayGroups = {
    [todayKey()]: trips.filter(isToday).sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b)),
    [tomorrowKey()]: trips.filter(isTomorrow).sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b))
  };

  for(const date of Object.keys(dayGroups)){
    const dayTrips = dayGroups[date];

    for(const trip of dayTrips){
      if(trip.manual === true && trip.driverId) continue;

      trip.driverId = "";
      trip.driverName = "";
      trip.vehicle = "";

      const validDrivers = getActiveDriversForTrip(trip);
      if(!validDrivers.length) continue;

      let bestDriver = null;
      let bestScore = Infinity;
      let bestMiles = 999999;

      for(const driver of validDrivers){
        const id = String(driver._id);
        const startAddress = getDriverStartAddress(id,dayTrips);
        const pickup = getTripPickup(trip);

        const miles = await googleDistanceMiles(startAddress,pickup);
        const count = driverTripCountByDate(id,date);

        const score = miles + (count * 8);

        if(score < bestScore){
          bestScore = score;
          bestMiles = miles;
          bestDriver = driver;
        }
      }

      if(bestDriver){
        const id = String(bestDriver._id);

        trip.driverId = id;
        trip.driverName = bestDriver.name || bestDriver.fullName || "";
        trip.vehicle = getDriverVehicle(id);
        trip.autoAssigned = true;
        trip.distanceMiles = bestMiles;
      }
    }
  }

  renderAll();
  toast("Auto assignment completed");
}

async function saveAssignment(trip,driverId,manual=true){
  driverId = clean(driverId);

  if(driverId){
    if(!isDriverActiveForTrip(driverId,trip)){
      toast("Driver is not active for this day");
      renderAll();
      return;
    }

    if(!serviceMatchesDriver(driverId,trip)){
      toast("Driver service does not match trip");
      renderAll();
      return;
    }
  }

  trip.driverId = driverId;
  trip.driverName = driverId ? getDriverName(driverId) : "";
  trip.vehicle = driverId ? getDriverVehicle(driverId) : "";
  trip.manual = manual === true;
  trip.manualAssigned = manual === true;

  if(driverId){
    const res = await Store.saveDriver(trip._id,driverId);
    if(res && res.success === false){
      toast(res.message || "Driver save failed");
      return;
    }
  }

  renderAll();
  toast("Driver updated");
}

/* ================= SEND ================= */

async function sendTrips(ids){
  ids = ids.filter(Boolean);

  if(!ids.length){
    toast("No trips to send");
    return;
  }

  const selectedTrips = trips.filter(t=>ids.includes(t._id));

  for(const t of selectedTrips){
    if(!clean(t.driverId)){
      toast(`Trip ${getTripNumber(t)} has no driver`);
      return;
    }
  }

  const res = await Store.sendTrips(ids);

  if(res && res.success === false){
    toast(res.message || "Send failed");
    return;
  }

  selectedTrips.forEach(t=>{
    t.status = "Dispatched";
    t.selected = false;
    selectedIds.delete(t._id);
  });

  renderAll();
  toast(`${ids.length} trip(s) sent`);
}

function sendSelected(){
  const ids = trips.filter(t=>selectedIds.has(t._id)).map(t=>t._id);
  sendTrips(ids);
}

function sendAll(){
  const ids = trips.filter(t=>clean(t.driverId)).map(t=>t._id);
  sendTrips(ids);
}

function sendOne(id){
  sendTrips([String(id)]);
}

/* ================= SELECTION ================= */

function toggleSelectAll(){
  const allVisible = trips;
  const allAreSelected = allVisible.length && allVisible.every(t=>selectedIds.has(t._id));

  if(allAreSelected){
    allVisible.forEach(t=>selectedIds.delete(t._id));
  }else{
    allVisible.forEach(t=>selectedIds.add(t._id));
  }

  renderAll();
}

function toggleTrip(id){
  id = String(id);
  if(selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderAll();
}

function toggleEdit(){
  editMode = !editMode;
  renderAll();
  toast(editMode ? "Edit mode enabled" : "Edit mode disabled");
}

/* ================= RENDER ================= */

function setText(id,val){
  const el = document.getElementById(id);
  if(el) el.textContent = val;
}

function renderStats(){
  const total = trips.length;
  const assigned = trips.filter(t=>clean(t.driverId)).length;
  const unassigned = total - assigned;
  const today = trips.filter(isToday).length;
  const tomorrow = trips.filter(isTomorrow).length;

  setText("statTotalTrips",total);
  setText("statAssignedTrips",assigned);
  setText("statUnassignedTrips",unassigned);
  setText("statActiveDrivers",drivers.length);
  setText("statTodayTrips",today);
  setText("statTomorrowTrips",tomorrow);

  setText("driversTabActive",drivers.length);
  setText("driversTabAssigned",assigned);
  setText("driversTabUnassigned",unassigned);

  const btn = document.getElementById("selectBtn");
  if(btn){
    const allSelected = trips.length && trips.every(t=>selectedIds.has(t._id));
    btn.textContent = allSelected ? "Remove All" : "Select All";
  }

  const editBtn = document.getElementById("editBtn");
  if(editBtn){
    editBtn.textContent = editMode ? "Save Edit" : "Edit Selected";
  }
}

function renderDriverMiniCards(){
  const wrap = document.getElementById("driverMiniCards");
  if(!wrap) return;

  if(!drivers.length){
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = drivers.map(d=>{
    const id = String(d._id);
    const count = driverTripCount(id);
    const service = getDriverServices(id).join(", ");
    const vehicle = getDriverVehicle(id) || "-";

    return `
      <div class="driver-mini-card">
        <div class="driver-mini-name">${safe(d.name || d.fullName || "-")}</div>
        <div class="driver-mini-line">Vehicle: ${safe(vehicle)}</div>
        <div class="driver-mini-line">Service: ${safe(service)}</div>
        <div class="driver-mini-line">Trips: ${count}</div>
      </div>
    `;
  }).join("");
}

function driverOptions(t){
  const valid = getActiveDriversForTrip(t);

  return `
    <select class="driver-select"
      ${editMode ? "" : "disabled"}
      onchange="assignDriver('${safe(t._id)}',this.value)">
      <option value="">--</option>
      ${valid.map(d=>{
        const id = String(d._id);
        return `
          <option value="${safe(id)}" ${String(t.driverId)===id ? "selected" : ""}>
            ${safe(d.name || d.fullName || "")} - ${safe(getDriverVehicle(id))}
          </option>
        `;
      }).join("")}
    </select>
  `;
}

function renderTripRow(t,index){
  const shared = isSharedTrip(t);

  const passengerName = shared
    ? sharedCell(t,"name")
    : (t.clientName || t.name || "");

  const phone = shared
    ? sharedCell(t,"phone")
    : (t.clientPhone || t.phone || "");

  const email = shared
    ? sharedCell(t,"email")
    : getEmail(t);

  const pickup = shared
    ? sharedCell(t,"pickup")
    : (t.pickup || "");

  const dropoff = shared
    ? sharedCell(t,"dropoff")
    : (t.dropoff || "");

  const cls = [
    rowClass(t),
    clean(t.driverId) ? "" : "row-unassigned",
    statusKey(t.status)==="dispatched" ? "row-dispatched" : ""
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
        <span class="trip-number-badge">${safe(getTripNumber(t))}</span>
      </td>

      <td>
        <span class="service-pill">${safe(getServiceTitle(getTripServiceCode(t)))}</span>
      </td>

      <td>${safe(shared ? "Shared" : (t.type || getTripKind(t)))}</td>

      <td>${safe(t.company || "")}</td>

      <td>${safe(t.entryName || "")}</td>

      <td>${safe(t.entryPhone || "")}</td>

      <td class="wide-client">${safe(passengerName)}</td>

      <td class="wide-phone">${safe(phone)}</td>

      <td class="wide-email">${safe(email)}</td>

      <td class="wide-address">${safe(pickup)}</td>

      <td class="wide-address">${safe(shared ? "Route optimized per passenger" : stopsText(t))}</td>

      <td class="wide-address">${safe(dropoff)}</td>

      <td>${safe(t.tripDate || "")}</td>

      <td>${safe(t.tripTime || "")}</td>

      <td>${driverOptions(t)}</td>

      <td>
        <span class="vehicle-pill">${safe(t.vehicle || getDriverVehicle(t.driverId) || "-")}</span>
      </td>

      <td class="wide-notes">${safe(getNotes(t) || "")}</td>

      <td>
        <span class="status-pill">${safe(t.status || "Scheduled")}</span>
      </td>

      <td>
        <button class="btn green" onclick="sendOne('${safe(t._id)}')">
          Send
        </button>
      </td>
    </tr>
  `;
}

function renderTable(bodyId,list){
  const body = document.getElementById(bodyId);
  if(!body) return;

  if(!list.length){
    body.innerHTML = `
      <tr>
        <td colspan="21" class="empty-row">No Trips</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = list
    .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b))
    .map((t,i)=>renderTripRow(t,i+1))
    .join("");
}

function renderDriversTab(){
  const wrap = document.getElementById("driversContainer");
  if(!wrap) return;

  if(!drivers.length){
    wrap.innerHTML = `<div class="driver-card">No active drivers</div>`;
    return;
  }

  wrap.innerHTML = drivers.map(d=>{
    const id = String(d._id);
    const driverTrips = trips
      .filter(t=>String(t.driverId || "") === id)
      .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b));

    return `
      <div class="driver-card">
        <div class="driver-card-name">${safe(d.name || d.fullName || "-")}</div>
        <div class="driver-card-line">Vehicle: ${safe(getDriverVehicle(id) || "-")}</div>
        <div class="driver-card-line">Phone: ${safe(getSchedule(id).phone || d.phone || "-")}</div>
        <div class="driver-card-line">Services: ${safe(getDriverServices(id).join(", "))}</div>
        <div class="driver-card-line">Trips: ${driverTrips.length}</div>

        <div class="driver-card-trips">
          ${
            driverTrips.length
            ? driverTrips.map((t,i)=>`${i+1}. ${getTripNumber(t)} - ${t.tripTime || ""} - ${getTripServiceCode(t)}`).join("\n")
            : "No trips assigned"
          }
        </div>
      </div>
    `;
  }).join("");
}

function renderAll(){
  trips = trips.filter(t=>!isClosedTrip(t) && isActiveTrip(t));

  renderStats();
  renderDriverMiniCards();

  renderTable("todayDispatchBody",trips.filter(isToday));
  renderTable("tomorrowDispatchBody",trips.filter(isTomorrow));

  renderDriversTab();
}

/* ================= TABS ================= */

function bindTabs(){
  const tabDispatch = document.getElementById("tabDispatch");
  const tabDrivers = document.getElementById("tabDrivers");
  const dispatchPage = document.getElementById("dispatchPage");
  const driversPage = document.getElementById("driversPage");

  if(!tabDispatch || !tabDrivers || !dispatchPage || !driversPage) return;

  tabDispatch.onclick = ()=>{
    activeTab = "dispatch";
    tabDispatch.classList.add("active");
    tabDrivers.classList.remove("active");
    dispatchPage.classList.add("active");
    driversPage.classList.remove("active");
  };

  tabDrivers.onclick = ()=>{
    activeTab = "drivers";
    tabDrivers.classList.add("active");
    tabDispatch.classList.remove("active");
    driversPage.classList.add("active");
    dispatchPage.classList.remove("active");
  };
}

/* ================= EVENTS ================= */

function bindActions(){
  document.getElementById("selectBtn")?.addEventListener("click",toggleSelectAll);
  document.getElementById("editBtn")?.addEventListener("click",toggleEdit);
  document.getElementById("autoAssignBtn")?.addEventListener("click",autoAssign);
  document.getElementById("sendSelectedBtn")?.addEventListener("click",sendSelected);
  document.getElementById("sendAllBtn")?.addEventListener("click",sendAll);
}

function toast(msg){
  const el = document.getElementById("toast");
  if(!el) return;

  el.textContent = msg;
  el.classList.add("show");

  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove("show"),1800);
}

/* ================= GLOBAL ================= */

window.toggleTrip = toggleTrip;
window.assignDriver = function(id,driverId){
  const trip = trips.find(t=>String(t._id) === String(id));
  if(trip) saveAssignment(trip,driverId,true);
};
window.sendOne = sendOne;
window.autoAssign = autoAssign;
window.sendSelected = sendSelected;
window.sendAll = sendAll;

/* ================= INIT ================= */

async function refresh(){
  const keepSelected = new Set(selectedIds);
  await loadAll();
  selectedIds = new Set([...keepSelected].filter(id=>trips.some(t=>t._id===id)));
  renderAll();
}

document.addEventListener("DOMContentLoaded",async()=>{
  bindTabs();
  bindActions();

  await refresh();

  if(refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async()=>{
    if(editMode) return;
    await refresh();
  },30000);
});