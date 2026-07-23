/* =====================================================
   DISPATCH ENGINE V4 - SMART CLEAN BUILD
   Dispatch = تشغيل الانجن + إرسال الرحلات
   Smart Dispatch Page = إعدادات فقط
===================================================== */

/* ================= SECURITY ================= */

const token = localStorage.getItem("token") || "";
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
}

/* ================= STATE ================= */

let trips = [];
let allDrivers = [];
let drivers = [];
let services = [];
let schedule = {};
let timezone = "America/Phoenix";
let SMART = {};

let selectedIds = new Set();
let editMode = false;
let activeTab = "dispatch";
let refreshTimer = null;

/* ================= DEFAULT SMART SETTINGS ================= */

const SMART_DEFAULTS = {
  enabled:true,
  strategy:"SMART",

  requireActiveDriver:true,
  requireScheduleMatch:false,
requireServiceMatch:false,

  maxPickupDistanceMiles:50,
  maxDeadheadMiles:25,
  useGoogleDistance:false,
  topDriversToCheck:3,

  minBufferMinutes:30,
  maxTripsPerDriver:20,
  enableTimeConflict:true,

  enableFairDistribution:true,
  maxDriverLoadPercent:80,

  autoAssignNewTrips:false,
  autoReassignUnassigned:true,
  autoAssignSharedTrips:true,

  distanceWeight:40,
  travelTimeWeight:30,
  loadWeight:20,
  conflictWeight:10
};

const CLOSED_STATUSES = [
  "completed","complete",
  "cancelled","canceled",
  "no show","noshow",
  "not completed","notcompleted"
];

const ACTIVE_STATUSES = [
  "unassigned",
  "scheduled",
  "confirmed",
  "paid",
  "rv",
  "reserved",
  "review",
  "assigned",
  "dispatched",
  "sent",
  "accepted",
  "on trip"
];
/* ================= BASIC HELPERS ================= */

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

function num(v,def=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
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

function isActiveTrip(t){

  const status =
    statusKey(
      t.dispatchStatus ||
      t.status ||
      "scheduled"
    );

  return (
    ACTIVE_STATUSES.includes(status) &&
    !isClosedTrip(t)
  );
}

/* ================= SYSTEM DATE ================= */

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

function getSystemDayKeyByDate(dateStr){
  const date = clean(dateStr) || todayKey();

  const day = new Intl.DateTimeFormat("en-US",{
    weekday:"short",
    timeZone:timezone
  }).format(new Date(`${date}T12:00:00`)).toLowerCase();

  if(day.startsWith("sun")) return "sun";
  if(day.startsWith("mon")) return "mon";
  if(day.startsWith("tue")) return "tue";
  if(day.startsWith("wed")) return "wed";
  if(day.startsWith("thu")) return "thu";
  if(day.startsWith("fri")) return "fri";
  return "sat";
}

function isToday(t){
  return clean(t.tripDate) === todayKey();
}

function isTomorrow(t){
  return clean(t.tripDate) === tomorrowKey();
}

function parseTripDateTime(t){
  const d = clean(t.tripDate);
  const tm = clean(t.tripTime || "00:00");
  if(!d) return null;

  const dt = new Date(`${d}T${tm}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function getTripTimeValue(t){
  const dt = parseTripDateTime(t);
  return dt ? dt.getTime() : 0;
}

/* ================= SERVICES ================= */

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

/* ================= TRIP HELPERS ================= */

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

/* ================= LOCATION HELPERS ================= */

function extractLat(obj){
  return num(
    obj?.lat ??
    obj?.latitude ??
    obj?.pickupLat ??
    obj?.pickupLatitude ??
    obj?.pickup?.lat ??
    obj?.pickup?.latitude,
    null
  );
}

function extractLng(obj){
  return num(
    obj?.lng ??
    obj?.lon ??
    obj?.longitude ??
    obj?.pickupLng ??
    obj?.pickupLon ??
    obj?.pickupLongitude ??
    obj?.pickup?.lng ??
    obj?.pickup?.lon ??
    obj?.pickup?.longitude,
    null
  );
}

function getTripPickupLatLng(t){
  return {
    lat:extractLat(t),
    lng:extractLng(t)
  };
}

function getDriverLatLng(driverId){
  const s = getSchedule(driverId);
  return {
    lat:num(s.lat,null),
    lng:num(s.lng,null)
  };
}

function haversineMiles(a,b){
  if(
    a.lat === null || a.lng === null ||
    b.lat === null || b.lng === null
  ){
    return null;
  }

  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat/2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLng/2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

/* ================= DRIVER HELPERS ================= */

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
    days:{
      sun:false,
      mon:false,
      tue:false,
      wed:false,
      thu:false,
      fri:false,
      sat:false,
      ...(row.days || row.weekly || {})
    },
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
    s.carNumber ||
    d?.vehicleNumber ||
    d?.carNumber ||
    ""
  );
}

function getDriverServices(id){
  const s = normalizeScheduleRow(getSchedule(id));
  return s.services.length ? s.services : ["ALL"];
}

function isDriverActiveForDate(driverId,dateStr){
  const s = normalizeScheduleRow(getSchedule(driverId));

  if(SMART.requireActiveDriver !== false){
    if(s.enabled !== true) return false;
  }

  if(SMART.requireScheduleMatch === false){
    return true;
  }

  const day = getSystemDayKeyByDate(dateStr);
  return s.days?.[day] === true;
}

function serviceMatchesDriver(driverId,trip){
  if(SMART.requireServiceMatch === false) return true;

  const driverServices = getDriverServices(driverId);
  const code = getTripServiceCode(trip);

  return driverServices.includes("ALL") || driverServices.includes(code);
}

function driverTripCountByDate(driverId,date){
  return trips.filter(t=>
    String(t.driverId || "") === String(driverId) &&
    clean(t.tripDate) === clean(date)
  ).length;
}

function driverTripCount(driverId){
  return trips.filter(t=>String(t.driverId || "") === String(driverId)).length;
}

function getTodayActiveDrivers(){
  return allDrivers.filter(d=>{
    const id = String(d._id || "");
    return id && isDriverActiveForDate(id,todayKey());
  });
}

/* ================= SMART ENGINE ================= */

async function loadSmartEngine(){
  try{
    const res = await fetch("/api/smart-dispatch-engine");
    if(!res.ok) throw new Error("Smart engine load failed");

    const data = await res.json();

    SMART = {
      ...SMART_DEFAULTS,
      ...(data || {})
    };

  }catch(err){
    console.log("SMART ENGINE LOAD ERROR:",err);
    SMART = {...SMART_DEFAULTS};
  }
}

function hasTimeConflict(driverId,trip){
  if(SMART.enableTimeConflict === false) return false;

  const target = parseTripDateTime(trip);
  if(!target) return false;

  const buffer = num(SMART.minBufferMinutes,30) * 60 * 1000;

  return trips.some(t=>{
    if(String(t.driverId || "") !== String(driverId)) return false;
    if(String(t._id) === String(trip._id)) return false;
    if(clean(t.tripDate) !== clean(trip.tripDate)) return false;

    const other = parseTripDateTime(t);
    if(!other) return false;

    return Math.abs(target.getTime() - other.getTime()) < buffer;
  });
}

function getEligibleDrivers(trip){
  return allDrivers
    .map(d=>normalizeDriver(d))
    .filter(d=>{
      const id = String(d._id || "");
      if(!id) return false;

      if(isSharedTrip(trip) && SMART.autoAssignSharedTrips === false){
        return false;
      }

      if(!isDriverActiveForDate(id,trip.tripDate)){
        return false;
      }

      if(!serviceMatchesDriver(id,trip)){
        return false;
      }

      if(
        num(SMART.maxTripsPerDriver,20) > 0 &&
        driverTripCountByDate(id,trip.tripDate) >= num(SMART.maxTripsPerDriver,20)
      ){
        return false;
      }

      if(hasTimeConflict(id,trip)){
        return false;
      }

      return true;
    });
}

function scoreDriver(driver,trip){
  const id = String(driver._id);

  const tripsToday = driverTripCountByDate(id,trip.tripDate);
  const maxTrips = Math.max(num(SMART.maxTripsPerDriver,20),1);

  const loadScore =
    Math.max(0,100 - ((tripsToday / maxTrips) * 100));

  const driverPoint = getDriverLatLng(id);
  const pickupPoint = getTripPickupLatLng(trip);

  const distanceMiles = haversineMiles(driverPoint,pickupPoint);

  const maxPickup = Math.max(num(SMART.maxPickupDistanceMiles,50),1);

  let distanceScore = 50;

  if(distanceMiles !== null){
    distanceScore =
      Math.max(0,100 - ((distanceMiles / maxPickup) * 100));
  }

  const travelTimeScore = distanceMiles !== null
    ? Math.max(0,100 - (((distanceMiles * 2) / 60) * 100))
    : 50;

  const conflictScore = hasTimeConflict(id,trip) ? 0 : 100;

  let score = 0;
  let reason = "";

  if(SMART.strategy === "DISTANCE"){
    score = distanceScore;
    reason = "Distance First";
  }else if(SMART.strategy === "TIME"){
    score = travelTimeScore;
    reason = "Time First";
  }else if(SMART.strategy === "BALANCED"){
    score = loadScore;
    reason = "Balanced Dispatch";
  }else{
    const dw = num(SMART.distanceWeight,40);
    const tw = num(SMART.travelTimeWeight,30);
    const lw = num(SMART.loadWeight,20);
    const cw = num(SMART.conflictWeight,10);

    score =
      (distanceScore * dw / 100) +
      (travelTimeScore * tw / 100) +
      (loadScore * lw / 100) +
      (conflictScore * cw / 100);

    reason = "Smart Score";
  }

  return {
    driver,
    driverId:id,
    driverName:driver.name || driver.fullName || "",
    vehicle:getDriverVehicle(id),
    score:Math.round(score),
    distanceMiles:distanceMiles === null ? null : Number(distanceMiles.toFixed(2)),
    tripsToday,
    reason
  };
}

function rankDriversForTrip(trip){
  const eligible = getEligibleDrivers(trip);

  return eligible
    .map(d=>scoreDriver(d,trip))
    .sort((a,b)=>{
      if(b.score !== a.score) return b.score - a.score;

      if(a.distanceMiles !== null && b.distanceMiles !== null){
        return a.distanceMiles - b.distanceMiles;
      }

      return clean(a.driverName).localeCompare(clean(b.driverName));
    });
}

function pickBestDriver(trip){
  const ranked = rankDriversForTrip(trip);
  return ranked[0] || null;
}

/* ================= DATA ================= */

function normalizeTrip(t){
  const id = String(t._id || t.id || "");

  return {
    ...t,
    _id:id,
    selected:selectedIds.has(id),
    driverId:t.driverId ? String(t.driverId) : "",
    driverName:t.driverName || "",
    vehicle:t.vehicle || "",
    smartScore:t.smartScore || "",
    smartReason:t.smartReason || "",
    smartDistance:t.smartDistance || "",
    manual:t.manualAssigned === true || t.manual === true
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

      return true;

    })
    .map(normalizeTrip)
    .sort((a,b)=>
      getTripTimeValue(a)-getTripTimeValue(b)
    );
}

async function loadAll(){
  const data = await Store.load();

  timezone = data.timezone || "America/Phoenix";
  services = Array.isArray(data.services) ? data.services : [];

  schedule = {};
  Object.keys(data.schedule || {}).forEach(id=>{
    schedule[String(id)] = normalizeScheduleRow(data.schedule[id]);
  });

  allDrivers = (Array.isArray(data.drivers) ? data.drivers : [])
    .map(normalizeDriver)
    .filter(d=>d._id);

  drivers = getTodayActiveDrivers();

  trips = filterTrips(Array.isArray(data.trips) ? data.trips : []);
}

/* ================= ASSIGNMENT ================= */

async function autoAssign(){
  if(SMART.enabled === false){
    toast("Smart Dispatch is disabled");
    return;
  }

  const sortedTrips = trips
    .filter(t=>!clean(t.driverId))
    .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b));

  if(!sortedTrips.length){
    toast("No unassigned trips");
    return;
  }

  try{
    /*
      The page never chooses the driver.
      Smart Dispatch runs on the server and saves the full result atomically.
    */
    const result = await Store.autoAssign(
      sortedTrips.map(trip=>trip._id)
    );

    if(!result || result.success === false){
      toast(result?.message || "Smart assignment failed");
      return;
    }

    await loadAll();
    renderAll();

    toast(
      `${Number(result.assignedCount || 0)} trip(s) smart assigned`
    );

  }catch(err){
    console.log("SMART AUTO ASSIGN ERROR:",err);
    toast("Smart assignment failed");
  }
}

async function saveAssignment(trip,driverId,manual=true){
  driverId = clean(driverId);

  if(driverId){
    if(!isDriverActiveForDate(driverId,trip.tripDate)){
      toast("Driver is not active for this trip date");
      renderAll();
      return;
    }

    if(!serviceMatchesDriver(driverId,trip)){
      toast("Driver service does not match trip");
      renderAll();
      return;
    }

    if(hasTimeConflict(driverId,trip)){
      toast("Driver has time conflict");
      renderAll();
      return;
    }
  }

  const oldDriver = trip.driverId;
  const oldName = trip.driverName;
  const oldVehicle = trip.vehicle;

  trip.driverId = driverId;
  trip.driverName = driverId ? getDriverName(driverId) : "";
  trip.vehicle = driverId ? getDriverVehicle(driverId) : "";
  trip.manual = manual === true;
  trip.manualAssigned = manual === true;

  try{
    const res = await Store.saveDriver(trip._id,driverId);

    if(res && res.success === false){
      trip.driverId = oldDriver;
      trip.driverName = oldName;
      trip.vehicle = oldVehicle;
      toast(res.message || "Driver save failed");
      renderAll();
      return;
    }

    toast("Driver updated");

  }catch(err){
    trip.driverId = oldDriver;
    trip.driverName = oldName;
    trip.vehicle = oldVehicle;
    toast("Driver save failed");
  }

  renderAll();
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

  try{
    const res = await Store.sendTrips(ids);

    if(res && res.success === false){
      toast(res.message || "Send failed");
      return;
    }

    selectedTrips.forEach(t=>{
      t.status = "Dispatched";
      t.dispatchSelected = false;
      t.selected = false;
      selectedIds.delete(t._id);
    });

    trips = trips.filter(t=>!ids.includes(t._id));

    renderAll();
    toast(`${ids.length} trip(s) sent`);

  }catch(err){
    console.log(err);
    toast("Send failed");
  }
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
  const allAreSelected = trips.length && trips.every(t=>selectedIds.has(t._id));

  if(allAreSelected){
    trips.forEach(t=>selectedIds.delete(t._id));
  }else{
    trips.forEach(t=>selectedIds.add(t._id));
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

function driverOptions(t){
  const valid = rankDriversForTrip(t);

  return `
    <select class="driver-select"
      ${editMode ? "" : "disabled"}
      onchange="assignDriver('${safe(t._id)}',this.value)">
      <option value="">--</option>
      ${valid.map(x=>{
        const id = String(x.driverId);
        return `
          <option value="${safe(id)}" ${String(t.driverId)===id ? "selected" : ""}>
            ${safe(x.driverName || "")} - ${safe(x.vehicle || "-")} | Score ${safe(x.score)}
          </option>
        `;
      }).join("")}
    </select>
  `;
}

function renderTripRow(t,index){
  const shared = isSharedTrip(t);

  const passengerName = shared ? sharedCell(t,"name") : (t.clientName || t.name || "");
  const phone = shared ? sharedCell(t,"phone") : (t.clientPhone || t.phone || "");
  const email = shared ? sharedCell(t,"email") : getEmail(t);
  const pickup = shared ? sharedCell(t,"pickup") : (t.pickup || "");
  const dropoff = shared ? sharedCell(t,"dropoff") : (t.dropoff || "");

  const cls = [
    rowClass(t),
    clean(t.driverId) ? "" : "row-unassigned"
  ].join(" ");

  return `
    <tr class="${cls}">
      <td>
        <input type="checkbox"
          ${selectedIds.has(t._id) ? "checked" : ""}
          onchange="toggleTrip('${safe(t._id)}')">
      </td>

      <td>${index}</td>

      <td><span class="trip-number-badge">${safe(getTripNumber(t))}</span></td>

      <td><span class="service-pill">${safe(getServiceTitle(getTripServiceCode(t)))}</span></td>

      <td>${safe(shared ? "Shared" : getTripKind(t))}</td>

      <td>${safe(t.company || t.companyName || t.facilityName || "")}</td>

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

      <td><span class="vehicle-pill">${safe(t.vehicle || getDriverVehicle(t.driverId) || "-")}</span></td>

      <td>
        <span class="status-pill">
          ${safe(t.smartScore ? `Score ${t.smartScore}` : "-")}
        </span>
      </td>

      <td class="wide-notes">${safe(getNotes(t) || "")}</td>

      <td><span class="status-pill">${safe(t.status || "Scheduled")}</span></td>

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
        <td colspan="22" class="empty-row">No Trips</td>
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
    wrap.innerHTML = `<div class="driver-card">No active drivers today</div>`;
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
              ? driverTrips.map((t,i)=>
                  `${i+1}. ${getTripNumber(t)} - ${t.tripTime || ""} - ${getTripServiceCode(t)}`
                ).join("\n")
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
    renderDriversTab();
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
  if(!el){
    console.log(msg);
    return;
  }

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

  await loadSmartEngine();
  await loadAll();

  selectedIds = new Set(
    [...keepSelected].filter(id=>trips.some(t=>t._id === id))
  );

  renderAll();
}

document.addEventListener("DOMContentLoaded",async()=>{
  bindTabs();
  bindActions();

  await refresh();

  /*
    New trips are auto-assigned only when the Admin setting is enabled.
    Existing manual assignments are never replaced.
  */
  if(
    SMART.enabled !== false &&
    SMART.autoAssignNewTrips === true &&
    trips.some(trip=>!clean(trip.driverId))
  ){
    await autoAssign();
  }

  if(refreshTimer) clearInterval(refreshTimer);

  refreshTimer = setInterval(async()=>{
    if(editMode) return;
    await refresh();
  },30000);
});