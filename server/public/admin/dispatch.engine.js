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
let autoAssignRunning = false;
let selectionSaving = false;

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

  autoAssignNewTrips:true,
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

function getEscort(t){
  const value =
    t.escort ??
    t.hasEscort ??
    t.escortRequired ??
    t.withEscort ??
    t.passengerEscort;

  if(value === true) return "Yes";
  if(value === false) return "No";

  const text = clean(value);
  if(!text) return "No";
  if(["true","yes","1","required"].includes(lower(text))) return "Yes";
  if(["false","no","0","none"].includes(lower(text))) return "No";
  return text;
}

function getBookedDate(t){
  const raw = t.bookedDate || t.bookingDate || t.createdAt || "";
  if(!raw) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);

  const date = new Date(raw);
  if(Number.isNaN(date.getTime())) return clean(raw);

  return new Intl.DateTimeFormat("en-CA",{
    timeZone:timezone,
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).format(date);
}

function getBookedTime(t){
  const direct = clean(t.bookedTime || t.bookingTime || "");
  if(direct) return direct;

  const date = new Date(t.createdAt || "");
  if(Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US",{
    timeZone:timezone,
    hour:"numeric",
    minute:"2-digit",
    hour12:true
  }).format(date);
}

function isSentTrip(t){
  return ["sent","dispatched"].includes(
    statusKey(t.dispatchStatus || t.status)
  );
}

function isTripInProgress(t){
  const values = [
    t.dispatchStatus,
    t.status,
    t.tripStatus,
    t.driverStatus
  ].map(statusKey);

  return values.some(value=>
    ["in progress","inprogress","on trip","ontrip","started"].includes(value)
  );
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

function sharedValues(t,field){
  const passengers = getPassengers(t);

  return passengers.map((p,i)=>{
    if(field === "name") return `${i+1}. ${p.name || p.clientName || ""}`;
    if(field === "phone") return `${i+1}. ${p.phone || p.clientPhone || ""}`;
    if(field === "email") return `${i+1}. ${getEmail(t,p) || ""}`;
    if(field === "pickup") return `${i+1}. ${p.pickup || ""}`;
    if(field === "dropoff") return `${i+1}. ${p.dropoff || ""}`;
    return "";
  });
}

function sharedCell(t,field){
  return sharedValues(t,field).join("\n");
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

async function autoAssign(options={}){
  const silent = options.silent === true;

  if(autoAssignRunning) return;

  if(SMART.enabled === false){
    if(!silent) toast("Smart Dispatch is disabled");
    return;
  }

  const sortedTrips = trips
    .filter(t=>!clean(t.driverId))
    .sort((a,b)=>getTripTimeValue(a)-getTripTimeValue(b));

  if(!sortedTrips.length){
    if(!silent) toast("No unassigned trips");
    return;
  }

  autoAssignRunning = true;

  try{
    /*
      The page never chooses the driver.
      Smart Dispatch runs on the server and saves the full result atomically.
    */
    const result = await Store.autoAssign(
      sortedTrips.map(trip=>trip._id)
    );

    if(!result || result.success === false){
      if(!silent) toast(result?.message || "Smart assignment failed");
      return;
    }

    await loadAll();
    renderAll();

    if(!silent || Number(result.assignedCount || 0) > 0){
      toast(
        `${Number(result.assignedCount || 0)} trip(s) smart assigned`
      );
    }

  }catch(err){
    console.log("SMART AUTO ASSIGN ERROR:",err);
    if(!silent) toast("Smart assignment failed");
  }finally{
    autoAssignRunning = false;
  }
}

async function autoAssignNewTrips(){
  if(
    SMART.enabled === false ||
    SMART.autoAssignNewTrips !== true ||
    autoAssignRunning ||
    !trips.some(trip=>!clean(trip.driverId))
  ){
    return;
  }

  await autoAssign({silent:true});
}

async function saveAssignment(trip,driverId,manual=true){
  driverId = clean(driverId);

  if(isTripInProgress(trip)){
    toast("Driver cannot be changed while trip is in progress");
    renderAll();
    return;
  }

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
      t.status = "SENT";
      t.dispatchStatus = "SENT";
      t.dispatchSelected = false;
      t.selected = false;
      selectedIds.delete(t._id);
    });

    renderAll();
    toast(`${ids.length} trip(s) sent`);

  }catch(err){
    console.log(err);
    toast("Send failed");
  }
}

function sendSelected(){
  const ids = trips
    .filter(t=>selectedIds.has(t._id) && !isSentTrip(t))
    .map(t=>t._id);
  sendTrips(ids);
}

function sendAll(){
  const ids = trips
    .filter(t=>clean(t.driverId) && !isSentTrip(t))
    .map(t=>t._id);
  sendTrips(ids);
}

function sendOne(id){
  sendTrips([String(id)]);
}

/* ================= SELECTION ================= */

async function persistSelection(trip,selected){
  const result = await Store.saveSelection(trip._id,selected);

  if(!result || result.success === false){
    throw new Error(result?.message || "Selection save failed");
  }

  trip.dispatchSelected = selected;
  trip.selected = selected;
}

async function toggleSelectAll(){
  if(selectionSaving) return;

  /*
    SENT only blocks a second send. It must stay selectable so dispatch can
    replace the driver until the trip actually starts.
  */
  const selectable = trips.filter(t=>!isTripInProgress(t));
  const allAreSelected =
    selectable.length &&
    selectable.every(t=>selectedIds.has(t._id));
  const nextSelected = !allAreSelected;
  const previous = new Set(selectedIds);

  selectionSaving = true;

  if(nextSelected){
    selectable.forEach(t=>selectedIds.add(t._id));
  }else{
    selectable.forEach(t=>selectedIds.delete(t._id));
  }

  renderAll();

  try{
    const results = await Promise.all(
      selectable.map(trip=>persistSelection(trip,nextSelected))
    );

    if(results.some(result=>result?.success === false)){
      throw new Error("One or more selections were not saved");
    }

    toast(nextSelected ? "All trips selected" : "All trips removed");
  }catch(err){
    selectedIds = previous;
    renderAll();
    toast(err.message || "Selection save failed");
  }finally{
    selectionSaving = false;
  }
}

async function toggleTrip(id){
  if(selectionSaving) return;

  id = String(id);
  const trip = trips.find(t=>String(t._id) === id);
  if(!trip) return;
  if(isTripInProgress(trip)){
    toast("Trip in progress cannot be edited");
    return;
  }

  const wasSelected = selectedIds.has(id);
  const nextSelected = !wasSelected;

  if(nextSelected) selectedIds.add(id);
  else selectedIds.delete(id);
  renderAll();

  selectionSaving = true;

  try{
    await persistSelection(trip,nextSelected);
    toast(nextSelected ? "Trip selected" : "Trip removed");
  }catch(err){
    if(wasSelected) selectedIds.add(id);
    else selectedIds.delete(id);
    renderAll();
    toast(err.message || "Selection save failed");
  }finally{
    selectionSaving = false;
  }
}

function toggleEdit(){
  if(!editMode && !selectedIds.size){
    toast("Select a trip to edit");
    return;
  }

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
    const selectable = trips.filter(t=>!isTripInProgress(t));
    const allSelected =
      selectable.length &&
      selectable.every(t=>selectedIds.has(t._id));
    btn.textContent = allSelected ? "Remove All" : "Select All";
  }

  const editBtn = document.getElementById("editBtn");
  if(editBtn){
    editBtn.textContent = editMode ? "Save Edit" : "Edit Selected";
  }
}

function driverOptions(t){
  const currentId = clean(t.driverId);
  const ranked = rankDriversForTrip(t);
  const rankedById = new Map(
    ranked.map(item=>[String(item.driverId),item])
  );

  /*
    The saved assignment is the source of truth. Manual edit must never make
    the browser silently display a different first option when the saved
    driver is no longer present in the current smart-ranking result.
  */
  const options = [];

  if(currentId){
    const savedRank = rankedById.get(currentId);
    options.push(
      savedRank || {
        driverId:currentId,
        driverName:t.driverName || getDriverName(currentId) || "Saved driver",
        vehicle:t.vehicle || getDriverVehicle(currentId) || "-",
        score:t.smartScore || "-"
      }
    );
  }

  ranked.forEach(item=>{
    if(String(item.driverId) !== currentId) options.push(item);
  });

  const canEdit =
    editMode &&
    selectedIds.has(String(t._id)) &&
    !isTripInProgress(t);

  return `
    <select class="driver-select"
      ${canEdit ? "" : "disabled"}
      onchange="assignDriver('${safe(t._id)}',this.value)">
      <option value="">--</option>
      ${options.map(x=>{
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

function cellBox(value){
  const items = Array.isArray(value) ? value : [value];

  return `
    <div class="cell-box">
      ${items.map(item=>`
        <div class="cell-item">${item || "--"}</div>
      `).join("")}
    </div>
  `;
}

function viewLine(label,value){
  return `
    <div class="view-line">
      <div class="view-label">${safe(label)}</div>
      <div class="view-value">${safe(value || "--")}</div>
    </div>
  `;
}

function openTripView(id){
  const t = trips.find(trip=>String(trip._id) === String(id));
  if(!t) return;

  closeTripView();

  const overlay = document.createElement("div");
  overlay.id = "dispatchViewOverlay";
  overlay.className = "hub-view-overlay";
  overlay.innerHTML = `
    <div class="hub-view-box" role="dialog" aria-modal="true">
      <div class="hub-view-head">
        <div>Trip Details</div>
        <button class="hub-view-close" type="button" onclick="closeTripView()">×</button>
      </div>
      <div class="hub-view-body">
        ${viewLine("Service",getServiceTitle(getTripServiceCode(t)))}
        ${viewLine("Type",isSharedTrip(t) ? "Shared" : getTripKind(t))}
        ${viewLine("Entry Name",t.entryName || "")}
        ${viewLine("Entry Phone",t.entryPhone || "")}
        ${viewLine("Client Email",isSharedTrip(t) ? sharedCell(t,"email") : getEmail(t))}
        ${viewLine("Booked Date",getBookedDate(t))}
        ${viewLine("Booked Time",getBookedTime(t))}
      </div>
    </div>
  `;

  overlay.addEventListener("click",event=>{
    if(event.target === overlay) closeTripView();
  });

  document.body.appendChild(overlay);
}

function closeTripView(){
  document.getElementById("dispatchViewOverlay")?.remove();
}

function renderTripRow(t,index){
  const shared = isSharedTrip(t);

  if(shared){
    return renderSharedTripRows(t,index);
  }

  const passengerName = t.clientName || t.name || "";
  const phone = t.clientPhone || t.phone || "";
  const email = getEmail(t);
  const pickup = t.pickup || "";
  const dropoff = t.dropoff || "";

  const cls = [
    rowClass(t),
    clean(t.driverId) ? "" : "row-unassigned",
    isSentTrip(t) ? "row-dispatched" : "",
    "trip-divider"
  ].join(" ");

  return `
    <tr class="${cls}">
      <td>${index}</td>

      <td>
        <input type="checkbox"
          ${selectedIds.has(t._id) ? "checked" : ""}
          ${isTripInProgress(t) ? "disabled" : ""}
          onchange="toggleTrip('${safe(t._id)}')">
      </td>

      <td>${cellBox(`<span class="trip-number-badge">${safe(getTripNumber(t))}</span>`)}</td>

      <td>${cellBox(`<span class="service-pill">${safe(getServiceTitle(getTripServiceCode(t)))}</span>`)}</td>

      <td>${cellBox(safe(getTripKind(t)))}</td>

      <td>${cellBox(safe(t.company || t.companyName || t.facilityName || "--"))}</td>

      <td class="wide-client">${
        cellBox(
          safe(passengerName || "--")
        )
      }</td>

      <td class="wide-phone">${
        cellBox(
          safe(phone || "--")
        )
      }</td>

      <td class="wide-address">${
        cellBox(
          safe(pickup || "--")
        )
      }</td>

      <td class="wide-address">${cellBox(safe(stopsText(t)))}</td>

      <td class="wide-address">${
        cellBox(
          safe(dropoff || "--")
        )
      }</td>

      <td class="wide-notes">${cellBox(safe(getNotes(t) || "--"))}</td>

      <td>${cellBox(safe(getEscort(t)))}</td>

      <td>${cellBox(safe(t.tripDate || "--"))}</td>

      <td>${cellBox(safe(t.tripTime || "--"))}</td>

      <td>${cellBox(driverOptions(t))}</td>

      <td>${cellBox(`<span class="vehicle-pill">${safe(t.vehicle || getDriverVehicle(t.driverId) || "-")}</span>`)}</td>

      <td>${cellBox(`
        <span class="status-pill">
          ${safe(t.smartScore ? `Score ${t.smartScore}` : "-")}
        </span>
      `)}</td>

      <td>${cellBox(`<span class="status-pill">${safe(isSentTrip(t) ? "SENT" : (t.status || "Scheduled"))}</span>`)}</td>

      <td>
        <button class="eye-btn" type="button" title="View"
          onclick="openTripView('${safe(t._id)}')">👁️</button>
      </td>

      <td>
        ${
          isSentTrip(t)
            ? `<button class="btn sent-btn" type="button" disabled>Sent</button>`
            : `<button class="btn green" type="button" onclick="sendOne('${safe(t._id)}')">Send</button>`
        }
      </td>
    </tr>
  `;
}

function passengerNotes(t,p){
  return p?.notes ?? p?.tripNotes ?? p?.note ?? getNotes(t) ?? "";
}

function passengerEscort(t,p){
  const passengerValue =
    p?.escort ??
    p?.hasEscort ??
    p?.escortRequired ??
    p?.withEscort ??
    p?.passengerEscort;

  return passengerValue === undefined || passengerValue === null
    ? getEscort(t)
    : getEscort({...t,escort:passengerValue});
}

function passengerStops(t,p){
  const ownStops =
    Array.isArray(p?.stops) ? p.stops :
    Array.isArray(p?.stopAddresses) ? p.stopAddresses :
    Array.isArray(p?.extraStops) ? p.extraStops :
    [];

  if(ownStops.length){
    return ownStops.map(stopText).filter(Boolean)
      .map((value,i)=>`${i+1}. ${value}`).join("\n") || "-";
  }

  return "Route optimized";
}

function renderSharedTripRows(t,index){
  const passengers = getPassengers(t);
  const cls = [
    rowClass(t),
    clean(t.driverId) ? "" : "row-unassigned",
    isSentTrip(t) ? "row-dispatched" : "",
    "shared-trip-group",
    "trip-divider"
  ].join(" ");

  const passengerItems = (getter,emptyValue="--") =>
    passengers.map((passenger,passengerIndex)=>{
      const value = getter(passenger);
      return `${passengerIndex + 1}. ${safe(value || emptyValue)}`;
    });

  const names = passengerItems(p=>p.name || p.clientName);
  const phones = passengerItems(p=>p.phone || p.clientPhone);
  const pickups = passengerItems(p=>p.pickup);
  const dropoffs = passengerItems(p=>p.dropoff);
  const notes = passengerItems(p=>passengerNotes(t,p));
  const escorts = passengerItems(p=>passengerEscort(t,p),"-");

  return `
    <tr class="${cls}">
      <td>${index}</td>

      <td>
      <input type="checkbox"
        ${selectedIds.has(t._id) ? "checked" : ""}
        ${isTripInProgress(t) ? "disabled" : ""}
        onchange="toggleTrip('${safe(t._id)}')">
      </td>

      <td>${cellBox(`<span class="trip-number-badge">${safe(getTripNumber(t))}</span>`)}</td>
      <td>${cellBox(`<span class="service-pill">${safe(getServiceTitle(getTripServiceCode(t)))}</span>`)}</td>
      <td>${cellBox("Shared")}</td>
      <td>${cellBox(safe(t.company || t.companyName || t.facilityName || "--"))}</td>

      <td class="wide-client">${cellBox(names)}</td>
      <td class="wide-phone">${cellBox(phones)}</td>
      <td class="wide-address">${cellBox(pickups)}</td>
      <td class="wide-stops">${cellBox("Route optimized per passenger")}</td>
      <td class="wide-address">${cellBox(dropoffs)}</td>
      <td class="wide-notes">${cellBox(notes)}</td>
      <td>${cellBox(escorts)}</td>

      <td>${cellBox(safe(t.tripDate || "--"))}</td>
      <td>${cellBox(safe(t.tripTime || "--"))}</td>
      <td>${cellBox(driverOptions(t))}</td>
      <td>${cellBox(`<span class="vehicle-pill">${safe(t.vehicle || getDriverVehicle(t.driverId) || "-")}</span>`)}</td>
      <td>${cellBox(`<span class="status-pill">${safe(t.smartScore ? `Score ${t.smartScore}` : "-")}</span>`)}</td>
      <td>${cellBox(`<span class="status-pill">${safe(isSentTrip(t) ? "SENT" : (t.status || "Scheduled"))}</span>`)}</td>
      <td>
      <button class="eye-btn" type="button" title="View"
        onclick="openTripView('${safe(t._id)}')">👁️</button>
      </td>
      <td>
        ${
          isSentTrip(t)
            ? `<button class="btn sent-btn" type="button" disabled>Sent</button>`
            : `<button class="btn green" type="button" onclick="sendOne('${safe(t._id)}')">Send</button>`
        }
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
window.openTripView = openTripView;
window.closeTripView = closeTripView;

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
  await autoAssignNewTrips();

  if(refreshTimer) clearInterval(refreshTimer);

  refreshTimer = setInterval(async()=>{
    if(editMode) return;
    await refresh();
    await autoAssignNewTrips();
  },30000);
});