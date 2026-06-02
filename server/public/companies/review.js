/* =========================================
FILE: review.js
COMPANY REVIEW - ONE FILE
SERVER PRICING ONLY
========================================= */

window.ReviewApp = { container:null };

window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if(!token || role !== "company"){
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");
window.ReviewApp.container = container;

if(!container){
  console.error("tripsContainer missing");
  return;
}

/* ================= STYLE ================= */

(function injectStyles(){
  const oldStyle = document.getElementById("company-review-style");
  if(oldStyle) oldStyle.remove();

  const style = document.createElement("style");
  style.id = "company-review-style";
  style.innerHTML = `
  .review-tabs{display:flex;gap:10px;margin:0 0 20px;background:#e2e8f0;padding:6px;border-radius:14px;}
  .review-tabs button{flex:1;padding:13px;border:none;border-radius:11px;font-size:14px;font-weight:700;cursor:pointer;}
  .tab-active{background:#2563eb;color:#fff;}
  .tab-inactive{background:#64748b;color:#fff;}
  .table-wrap{width:100%;overflow-x:auto;margin-bottom:20px;border-radius:12px;background:#fff;}
  .review-table{width:100%;border-collapse:collapse;background:#fff;min-width:1450px;}
  .review-table th,.review-table td{border:1px solid #dbe2ea;padding:7px;text-align:center;font-size:12px;vertical-align:middle;}
  .review-table th{background:#0f172a;color:#fff;font-weight:800;white-space:nowrap;}
  .date-title{font-size:18px;font-weight:700;margin:20px 0 10px;color:#0f172a;}
  .btn{border:none;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:800;cursor:pointer;margin:2px;white-space:nowrap;}
  .btn.edit{background:#2563eb;color:#fff;}
  .btn.delete{background:#111827;color:#fff;}
  .btn.confirm{background:#16a34a;color:#fff;}
  .btn.cancel{background:#dc2626;color:#fff;}
  .actions-wrap{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;min-width:140px;}
  .edit-input{width:100%;min-width:120px;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#fff;color:#111827;}
  .multi-line{white-space:pre-line;line-height:1.5;text-align:left;word-break:break-word;}
  .trip-number-badge{font-weight:900;color:#2563eb;white-space:nowrap;}
  .price-badge{font-weight:900;color:#15803d;white-space:nowrap;}
  .miles-strong{font-weight:900;color:#2563eb;white-space:nowrap;}
  .scheduled-row{background:#fff;color:#111827;}
  .confirmed-row{background:#dcfce7;color:#111827;}
  .cancelled-row{background:#fecaca;color:#111827;}
  .yellow{background:#fef9c3;color:#111827;}
  .red-light{background:#fecaca;color:#111827;}
  .red-mid{background:#fca5a5;color:#111827;}
  .red-dark{background:#7f1d1d;color:#fff;}
  .past-row{background:#374151;color:#e5e7eb;}
  @keyframes blinkTrip{0%{opacity:1;}50%{opacity:.82;}100%{opacity:1;}}
  .trip-blink{animation:blinkTrip 1.8s infinite;}
  @media(max-width:768px){
    .review-table{min-width:1350px;}
    .review-table th,.review-table td{font-size:10px;padding:5px;}
    .btn{font-size:10px;padding:5px 7px;}
    .edit-input{font-size:11px;min-width:110px;}
  }`;
  document.head.appendChild(style);
})();

/* ================= STATE ================= */

let activeTab = "TRIPS";
let trips = [];
let COMPANY_SERVICES = [];
let SYSTEM_REGION = "";
let SYSTEM_COUNTRY = "";
let SYSTEM_TIMEZONE = "America/Phoenix";
let googleLoadPromise = null;

/* ================= HELPERS ================= */

function normalizeText(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return String(v || "")
    .replace(/\s+/g,"")
    .toLowerCase()
    .trim();
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function formatMoney(value){
  return Number(value || 0).toFixed(2);
}

function getTripPrice(t){
  const priceAmount = Number(t.priceAmount || 0);
  const finalPrice = Number(t.finalPrice || 0);
  return priceAmount > 0 ? priceAmount : finalPrice;
}

function getPassengerPrice(p){
  const priceAmount = Number(p.priceAmount || 0);
  const finalPrice = Number(p.finalPrice || 0);
  return priceAmount > 0 ? priceAmount : finalPrice;
}

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{
      timeZone:SYSTEM_TIMEZONE || "America/Phoenix"
    })
  );
}

async function loadSystemRegion(){
  try{
    const res = await fetch("/api/system-design");
    const data = await res.json();
    SYSTEM_REGION = data?.region || "";
    SYSTEM_COUNTRY = data?.country || "";
    SYSTEM_TIMEZONE = data?.timezone || "America/Phoenix";
  }catch(err){
    console.log(err);
  }
}

function normalizeAddress(address){
  let v = normalizeText(address);
  if(!v) return "";

  v = v.replace(/\s+/g," ").trim();
  const lower = v.toLowerCase();

  if(SYSTEM_REGION && !lower.includes(SYSTEM_REGION.toLowerCase())){
    v += ", " + SYSTEM_REGION;
  }

  if(SYSTEM_COUNTRY && !lower.includes(SYSTEM_COUNTRY.toLowerCase())){
    v += ", " + SYSTEM_COUNTRY;
  }

  return v;
}

function parseTripDateTime(tripDate, tripTime){
  const d = normalizeText(tripDate);
  let t = normalizeText(tripTime);
  if(!d || !t) return null;

  const parts = d.split("-");
  if(parts.length < 3) return null;

  if(/^\d{1,2}:\d{2}$/.test(t)){
    const [hh,mm] = t.split(":");
    const dt = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]), Number(hh), Number(mm), 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(ampm){
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();

    if(ap === "PM" && h < 12) h += 12;
    if(ap === "AM" && h === 12) h = 0;

    const dt = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]), h, m, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function minutesToTrip(t){
  const dt = parseTripDateTime(t.tripDate, t.tripTime);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}

function getSharedKey(t){
  return normalizeText(t.groupId) || normalizeText(t.tripNumber) || String(t._id);
}

function groupByDate(list){
  const groups = {};
  list.forEach(t=>{
    const d = t.createdAt ? new Date(t.createdAt) : new Date();
    const key = d.toLocaleDateString();
    if(!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  return groups;
}

function createEditInput(value, field, type="text"){
  return `<input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">`;
}

function createSharedEditInput(value, field, type="text"){
  return `<input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">`;
}

function getRealPassengersFromGroup(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length > 0){
    return first.passengers;
  }

  return group.map((t,idx)=>({
    passengerId:"P" + (idx + 1),
    name:t.name || t.clientName || "",
    phone:t.phone || t.clientPhone || "",
    clientName:t.clientName || t.name || "",
    clientPhone:t.clientPhone || t.phone || "",
    pickup:t.pickup || "",
    dropoff:t.dropoff || "",
    status:t.status || "Scheduled",
    priceAmount:t.priceAmount || 0,
    finalPrice:t.finalPrice || 0
  }));
}

/* ================= SERVICES ================= */

async function loadServices(){
  try{
    const res = await fetch("/api/services?company=true",{
      headers:{ Authorization:"Bearer " + token }
    });

    if(!res.ok){
      COMPANY_SERVICES = [];
      return;
    }

    const data = await res.json();
    COMPANY_SERVICES = Array.isArray(data) ? data : [];

  }catch(err){
    console.log(err);
    COMPANY_SERVICES = [];
  }
}

function getServiceCodeFromTrip(trip){
  const direct = normalizeText(
    trip.serviceKey ||
    trip.serviceCode ||
    trip.serviceType ||
    trip.serviceSuffix ||
    trip.vehicle ||
    ""
  ).toUpperCase();

  if(direct) return direct;

  const parts = String(trip.tripNumber || "").split("-");
  return normalizeText(parts[parts.length - 1] || "").toUpperCase();
}

function isSharedService(service){
  if(!service) return false;

  return (
    service.companyShared === true ||
    service.shared === true ||
    String(service.type || "").toUpperCase() === "SHARED" ||
    String(service.serviceType || "").toUpperCase() === "SHARED" ||
    String(service.title || service.name || "").toUpperCase() === "SHARED" ||
    String(service.serviceKey || "").toUpperCase() === "SHARED" ||
    String(service.companySuffix || service.suffix || "").toUpperCase() === "SH"
  );
}

function getServiceByTrip(trip){
  if(!trip) return null;

  const code = getServiceCodeFromTrip(trip);
  const tripType = normalizeText(trip.tripType || trip.type || "").toUpperCase();

  if(
    trip.isShared === true ||
    tripType === "SHARED" ||
    String(trip.tripNumber || "").toUpperCase().includes("-SH") ||
    (Array.isArray(trip.passengers) && trip.passengers.length > 0)
  ){
    return COMPANY_SERVICES.find(s=>isSharedService(s)) || null;
  }

  return COMPANY_SERVICES.find(s=>{
    const key = normalizeText(s.serviceKey).toUpperCase();
    const suffix = normalizeText(s.companySuffix || s.suffix).toUpperCase();
    const serviceCode = normalizeText(s.serviceCode || s.code).toUpperCase();
    const title = normalizeText(s.title || s.name).toUpperCase();

    return (
      key === code ||
      suffix === code ||
      serviceCode === code ||
      title === code ||
      (code === "WH" && key === "WHEELCHAIR") ||
      (code === "WC" && key === "WHEELCHAIR")
    );
  }) || null;
}

function isSharedTrip(t){
  if(t.isShared === true) return true;
  if(String(t.tripType || "").toUpperCase() === "SHARED") return true;
  if(String(t.tripNumber || "").toUpperCase().includes("-SH")) return true;
  if(Array.isArray(t.passengers) && t.passengers.length > 0) return true;

  const service = getServiceByTrip(t);
  return isSharedService(service);
}

function sharedEnabled(){
  const hasSharedTrips = trips.some(t=>isSharedTrip(t));
  const hasSharedService = COMPANY_SERVICES.some(s=>isSharedService(s));
  return hasSharedTrips || hasSharedService;
}

function getWarningMinutes(service){
  return Number(service?.companyWarningMinutes ?? service?.warningMinutes ?? 120);
}

function warningEnabled(service){
  return (
    service?.companyDisableCancel === true ||
    service?.disableCancel === true ||
    service?.companyWarningEnabled === true ||
    service?.warningEnabled === true
  );
}

/* ================= SERVER PRICING ================= */

async function calculateServerPrice({
  serviceKey,
  miles,
  stops,
  minutes,
  passengerCount
}){

  const res = await fetch(
    "/api/pricing/calculate",
    {
      method:"POST",

      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },

      body:JSON.stringify({
        serviceKey,
        miles:Number(miles || 0),
        stops:Number(stops || 0),
        minutes:Number(minutes || 0),
        passengersCount:Number(passengerCount || 1),
        isCompany:true
      })
    }
  );

  const data =
    await res.json()
      .catch(()=>({}));

  if(
    !res.ok ||
    data.success === false
  ){
    throw new Error(
      data.message ||
      "Pricing failed"
    );
  }

  return Number(
    data.total || 0
  );
}

);

/* ================= GOOGLE ================= */

function normalizeUniqueAddress(address){
  return normalizeAddress(address);
}

function pushUnique(arr,value){
  const v = normalizeUniqueAddress(value);
  if(!v) return;

  const exists = arr.some(x => String(x).toLowerCase() === String(v).toLowerCase());
  if(!exists) arr.push(v);
}

async function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.DirectionsService){
    return;
  }

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async (resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json();

      if(!data.googleKey){
        reject(new Error("Google key missing"));
        return;
      }

      const existing = document.querySelector("script[data-google-maps='true']");

      if(existing){
        if(window.google && google.maps && google.maps.DirectionsService){
          resolve();
          return;
        }

        existing.addEventListener("load",()=>resolve());
        existing.addEventListener("error",()=>reject(new Error("Google failed")));
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;
      script.defer = true;
      script.setAttribute("data-google-maps","true");
      script.onload = ()=>resolve();
      script.onerror = ()=>reject(new Error("Google failed"));
      document.head.appendChild(script);

    }catch(err){
      reject(err);
    }
  });

  return googleLoadPromise;
}

async function getDrivingMetersBetween(origin,destination){
  await ensureGoogleLoaded();

  return new Promise((resolve)=>{
    const service = new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        travelMode:google.maps.TravelMode.DRIVING,
        unitSystem:google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){
        if(status !== "OK" || !response?.routes?.[0]){
          resolve(Number.MAX_SAFE_INTEGER);
          return;
        }

        let meters = 0;

        response.routes[0].legs.forEach(leg=>{
          meters += leg.distance ? leg.distance.value : 0;
        });

        resolve(meters);
      }
    );
  });
}

async function calculateRouteMiles(points){
  await ensureGoogleLoaded();

  const cleanPoints = Array.isArray(points)
    ? points.map(p => normalizeUniqueAddress(p)).filter(Boolean)
    : [];

  if(cleanPoints.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };
  }

  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const middle = cleanPoints.slice(1,-1);

  const waypoints = middle.map(address=>({
    location:address,
    stopover:true
  }));

  return new Promise((resolve,reject)=>{
    const service = new google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints:false,
        travelMode:google.maps.TravelMode.DRIVING,
        unitSystem:google.maps.UnitSystem.IMPERIAL
      },
      function(response,status){
        if(status !== "OK" || !response?.routes?.[0]){
          reject(new Error("Google route failed: " + status));
          return;
        }

        const route = response.routes[0];
        let meters = 0;
        let seconds = 0;

        route.legs.forEach(leg=>{
          meters += leg.distance ? leg.distance.value : 0;
          seconds += leg.duration ? leg.duration.value : 0;
        });

        resolve({
          miles:Number((meters * 0.000621371).toFixed(2)),
          distanceMeters:meters,
          durationSeconds:seconds,
          estimatedMinutes:Math.ceil(seconds / 60),
          googleRoute:{
            summary:route.summary || "",
            waypointOrder:route.waypoint_order || [],
            legs:route.legs.map((leg,index)=>({
              legIndex:index,
              startAddress:leg.start_address,
              endAddress:leg.end_address,
              distanceText:leg.distance ? leg.distance.text : "",
              distanceMeters:leg.distance ? leg.distance.value : 0,
              durationText:leg.duration ? leg.duration.text : "",
              durationSeconds:leg.duration ? leg.duration.value : 0
            }))
          }
        });
      }
    );
  });
}

/* ================= ROUTE POINTS ================= */

function buildIndividualRoutePoints(trip){
  const points = [];

  if(trip.pickup) points.push(trip.pickup);

  if(Array.isArray(trip.stops)){
    trip.stops.forEach(s=>{
      if(normalizeText(s)) points.push(s);
    });
  }

  if(trip.dropoff) points.push(trip.dropoff);

  return points;
}

async function buildSharedRoutePoints(group){
  const passengers = getRealPassengersFromGroup(group);

  const activePassengers = passengers.filter(p=>{
    const s = cleanStatus(p.status);
    return !s.includes("no") && !s.includes("cancel") && p.pickup && p.dropoff;
  });

  if(!activePassengers.length) return [];

  const route = [];
  const onboard = [];
  const waiting = activePassengers.map((p,index)=>({
    id:index,
    pickup:normalizeUniqueAddress(p.pickup),
    dropoff:normalizeUniqueAddress(p.dropoff)
  }));

  let current = waiting[0].pickup;
  pushUnique(route,current);

  for(let i=waiting.length-1;i>=0;i--){
    if(waiting[i].pickup.toLowerCase() === current.toLowerCase()){
      onboard.push(waiting[i]);
      waiting.splice(i,1);
    }
  }

  while(waiting.length || onboard.length){
    let best = null;
    let bestMeters = Number.MAX_SAFE_INTEGER;

    for(const p of waiting){
      const meters = await getDrivingMetersBetween(current,p.pickup);
      if(meters < bestMeters){
        bestMeters = meters;
        best = { type:"pickup", passenger:p, address:p.pickup };
      }
    }

    for(const p of onboard){
      const meters = await getDrivingMetersBetween(current,p.dropoff);
      if(meters < bestMeters){
        bestMeters = meters;
        best = { type:"dropoff", passenger:p, address:p.dropoff };
      }
    }

    if(!best) break;

    current = best.address;
    pushUnique(route,current);

    if(best.type === "pickup"){
      for(let i=waiting.length-1;i>=0;i--){
        if(waiting[i].pickup.toLowerCase() === current.toLowerCase()){
          onboard.push(waiting[i]);
          waiting.splice(i,1);
        }
      }
    }else{
      const idx = onboard.findIndex(x => x.id === best.passenger.id);
      if(idx > -1) onboard.splice(idx,1);
    }
  }

  return route;
}

/* ================= SERVER ================= */

async function fetchTrips(){
  let list = [];

  const url = companyName
    ? "/api/trips/company/" + encodeURIComponent(companyName)
    : "/api/trips/company";

  const res = await fetch(url,{
    headers:{ Authorization:"Bearer " + token }
  });

  if(res.ok){
    list = await res.json();
  }

  if((!Array.isArray(list) || list.length === 0) && companyName){
    const allRes = await fetch("/api/trips/company",{
      headers:{ Authorization:"Bearer " + token }
    });

    if(allRes.ok){
      const all = await allRes.json();
      list = Array.isArray(all)
        ? all.filter(t => String(t.company || "").trim().toLowerCase() === String(companyName).trim().toLowerCase())
        : [];
    }
  }

  if(!Array.isArray(list)){
    return [];
  }

  return list;
}

async function updateTrip(id,payload){
  const res = await fetch("/api/trips/" + id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || "Update failed");
  }

  return await res.json().catch(()=>null);
}

async function deleteTrip(id){
  const res = await fetch("/api/trips/" + id,{
    method:"DELETE",
    headers:{ Authorization:"Bearer " + token }
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || "Delete failed");
  }
}

/* ================= FILTERS ================= */

function isHiddenStatus(status){
  const s = cleanStatus(status);
  return (
    s.includes("complete") ||
    s.includes("cancel") ||
    s.includes("noshow") ||
    s === "no"
  );
}

function getTripsTabData(){
  return trips.filter(t=>{
    if(isSharedTrip(t)) return false;
    return !isHiddenStatus(t.status);
  });
}

function getSharedGroups(){
  const map = {};

  trips.filter(t=>{
    if(!isSharedTrip(t)) return false;
    return !isHiddenStatus(t.status);
  }).forEach(t=>{
    const key = getSharedKey(t);
    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map).map(group=>{
    return group.sort((a,b)=>Number(a.passengerIndex || 0) - Number(b.passengerIndex || 0));
  });
}

/* ================= RENDER ================= */

function renderTabs(){
  const tabs = document.createElement("div");
  tabs.className = "review-tabs";

  if(activeTab === "SHARED" && !sharedEnabled()){
    activeTab = "TRIPS";
  }

  tabs.innerHTML = `
    <button id="reviewTripsTab" class="${activeTab === "TRIPS" ? "tab-active" : "tab-inactive"}" type="button">
      Trips
    </button>
    ${
      sharedEnabled()
      ? `<button id="reviewSharedTab" class="${activeTab === "SHARED" ? "tab-active" : "tab-inactive"}" type="button">Shared</button>`
      : ""
    }
  `;

  container.appendChild(tabs);

  document.getElementById("reviewTripsTab")?.addEventListener("click",()=>{
    activeTab = "TRIPS";
    render();
  });

  document.getElementById("reviewSharedTab")?.addEventListener("click",()=>{
    activeTab = "SHARED";
    render();
  });
}

function applyRowColor(tr,t){
  const mins = minutesToTrip(t);
  const status = cleanStatus(t.status);

  if(status.includes("cancel")){
    tr.classList.add("cancelled-row");
    return;
  }

  if(mins !== null && mins <= 0){
    tr.classList.add("past-row");
    return;
  }

  if(mins !== null){
    if(mins <= 30){
      tr.classList.add("red-dark");
      if(status.includes("confirm")) tr.classList.add("trip-blink");
    }else if(mins <= 60){
      tr.classList.add("red-mid");
      if(status.includes("confirm")) tr.classList.add("trip-blink");
    }else if(mins <= 120){
      tr.classList.add("red-light");
    }else if(mins <= 180){
      tr.classList.add("yellow");
    }else if(status.includes("confirm")){
      tr.classList.add("confirmed-row");
    }else{
      tr.classList.add("scheduled-row");
    }
  }
}

function renderTripButtons(t,editing){
  const service = getServiceByTrip(t);
  const mins = minutesToTrip(t);
  const warningMinutes = warningEnabled(service) ? getWarningMinutes(service) : 0;
  const status = cleanStatus(t.status);

  if(editing){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-trip">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(status.includes("cancel")) return "";

  if(mins > warningMinutes || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-trip">Edit</button>
        <button class="btn delete" data-action="delete-trip">Delete</button>
        <button class="btn confirm" data-action="confirm-trip">Confirm</button>
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && !status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="confirm-trip">Confirm</button>
        <button class="btn cancel" data-action="cancel-trip">Cancel</button>
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn cancel" data-action="cancel-trip">Cancel</button>
      </div>
    `;
  }

  return "";
}

function getGroupStatus(group){
  if(group.every(t=>cleanStatus(t.status).includes("cancel"))) return "Cancelled";
  if(group.every(t=>cleanStatus(t.status).includes("confirm"))) return "Confirmed";
  if(group.some(t=>cleanStatus(t.status).includes("confirm"))) return "Partially Confirmed";
  return group[0]?.status || "Scheduled";
}

function getGroupPrice(group){
  const first = group[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length){
    const passengerTotal = first.passengers.reduce((sum,p)=>{
      return sum + getPassengerPrice(p);
    },0);

    if(passengerTotal > 0) return passengerTotal;
  }

  return Number(first.priceAmount || first.finalPrice || 0);
}

function renderSharedButtons(group,editing){
  const first = group[0];
  const service = getServiceByTrip(first);
  const mins = minutesToTrip(first);
  const warningMinutes = warningEnabled(service) ? getWarningMinutes(service) : 0;
  const status = cleanStatus(getGroupStatus(group));

  if(editing){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-shared">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(status.includes("cancel")) return "";

  if(mins > warningMinutes || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-shared">Edit</button>
        <button class="btn delete" data-action="delete-shared">Delete</button>
        <button class="btn confirm" data-action="confirm-shared">Confirm</button>
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && !status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="confirm-shared">Confirm</button>
        <button class="btn cancel" data-action="cancel-shared">Cancel</button>
      </div>
    `;
  }

  if(mins <= warningMinutes && mins > 0 && status.includes("confirm")){
    return `
      <div class="actions-wrap">
        <button class="btn cancel" data-action="cancel-shared">Cancel</button>
      </div>
    `;
  }

  return "";
}

function renderTripsTable(list){
  const groups = groupByDate(list);
  const dates = Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a));

  dates.forEach(date=>{
    const title = document.createElement("div");
    title.className = "date-title";
    title.innerText = date;
    container.appendChild(title);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "review-table";

    table.innerHTML = `
      <tr>
        <th>#</th><th>Trip#</th><th>Service</th><th>Entry</th><th>Entry Phone</th>
        <th>Client</th><th>Phone</th><th>Pickup</th><th>Stops</th><th>Drop</th>
        <th>Notes</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th><th>Miles</th><th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{
      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      const editing = t.__editing === true;
      const service = getServiceByTrip(t);
      const stops = Array.isArray(t.stops) ? t.stops : [];

      applyRowColor(tr,t);

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(t.tripNumber || "")}</span></td>
        <td>${escapeHtml(service?.name || service?.title || t.serviceType || "--")}</td>
        <td>${editing ? createEditInput(t.entryName || "", "entryName") : escapeHtml(t.entryName || "")}</td>
        <td>${editing ? createEditInput(t.entryPhone || "", "entryPhone") : escapeHtml(t.entryPhone || "")}</td>
        <td>${editing ? createEditInput(t.clientName || "", "clientName") : `<div class="multi-line">${escapeHtml(t.clientName || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.clientPhone || "", "clientPhone") : `<div class="multi-line">${escapeHtml(t.clientPhone || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.pickup || "", "pickup") : `<div class="multi-line">${escapeHtml(t.pickup || "")}</div>`}</td>
        <td>${
          editing
          ? stops.map((s,si)=>`<input class="edit-input" data-stop-index="${si}" value="${escapeHtml(s)}">`).join("")
          : `<div class="multi-line">${stops.length ? stops.map(s=>escapeHtml(s)).join("<br>") : "--"}</div>`
        }</td>
        <td>${editing ? createEditInput(t.dropoff || "", "dropoff") : `<div class="multi-line">${escapeHtml(t.dropoff || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.notes || "", "notes") : `<div class="multi-line">${escapeHtml(t.notes || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : escapeHtml(t.tripDate || "")}</td>
        <td>${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : escapeHtml(t.tripTime || "")}</td>
        <td><strong>${escapeHtml(t.status || "Scheduled")}</strong></td>
        <td><span class="price-badge">$${formatMoney(getTripPrice(t))}</span></td>
        <td><span class="miles-strong">${t.miles ? Number(t.miles).toFixed(1) + " mi" : "-- mi"}</span></td>
        <td>${renderTripButtons(t,editing)}</td>
      `;

      table.appendChild(tr);
    });

    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  });

  if(!dates.length){
    const empty = document.createElement("div");
    empty.style.padding = "20px";
    empty.style.fontWeight = "700";
    empty.innerText = "No trips found.";
    container.appendChild(empty);
  }
}

function renderSharedTable(groups){
  const dateGroups = {};

  groups.forEach(group=>{
    const first = group[0];
    const d = first?.createdAt ? new Date(first.createdAt) : new Date();
    const key = d.toLocaleDateString();
    if(!dateGroups[key]) dateGroups[key] = [];
    dateGroups[key].push(group);
  });

  const dates = Object.keys(dateGroups).sort((a,b)=>new Date(b)-new Date(a));

  dates.forEach(date=>{
    const title = document.createElement("div");
    title.className = "date-title";
    title.innerText = date;
    container.appendChild(title);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "review-table";

    table.innerHTML = `
      <tr>
        <th>#</th><th>Trip#</th><th>Service</th><th>Entry</th><th>Entry Phone</th>
        <th>Clients</th><th>Phones</th><th>Pickups</th><th>Stops</th><th>Drops</th>
        <th>Notes</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th><th>Miles</th><th>Actions</th>
      </tr>
    `;

    dateGroups[date].forEach((group,i)=>{
      const first = group[0];
      const tr = document.createElement("tr");
      tr.dataset.groupId = getSharedKey(first);

      const editing = first.__editing === true;
      const service = getServiceByTrip(first);
      const passengers = getRealPassengersFromGroup(group);

      applyRowColor(tr,first);

      let clients = "";
      let phones = "";
      let pickups = "";
      let drops = "";

      if(editing){
        clients = passengers.map((p,idx)=>createSharedEditInput(p.name || p.clientName || "", `passenger_${idx}_name`)).join("");
        phones  = passengers.map((p,idx)=>createSharedEditInput(p.phone || p.clientPhone || "", `passenger_${idx}_phone`)).join("");
        pickups = passengers.map((p,idx)=>createSharedEditInput(p.pickup || "", `passenger_${idx}_pickup`)).join("");
        drops   = passengers.map((p,idx)=>createSharedEditInput(p.dropoff || "", `passenger_${idx}_dropoff`)).join("");
      }else{
        clients = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.name || p.clientName || "")}`).join("\n");
        phones  = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.phone || p.clientPhone || "")}`).join("\n");
        pickups = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.pickup || "")}`).join("\n");
        drops   = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.dropoff || "")}`).join("\n");
      }

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(first.tripNumber || "")}</span></td>
        <td>${escapeHtml(service?.name || service?.title || "Shared")}</td>
        <td>${editing ? createSharedEditInput(first.entryName || "", "entryName") : escapeHtml(first.entryName || "")}</td>
        <td>${editing ? createSharedEditInput(first.entryPhone || "", "entryPhone") : escapeHtml(first.entryPhone || "")}</td>
        <td><div class="multi-line">${clients}</div></td>
        <td><div class="multi-line">${phones}</div></td>
        <td><div class="multi-line">${pickups}</div></td>
        <td><strong>${Math.max(0,passengers.length - 1)}</strong></td>
        <td><div class="multi-line">${drops}</div></td>
        <td>${editing ? createSharedEditInput(first.notes || "", "notes") : `<div class="multi-line">${escapeHtml(first.notes || "")}</div>`}</td>
        <td>${editing ? createSharedEditInput(first.tripDate || "", "tripDate", "date") : escapeHtml(first.tripDate || "")}</td>
        <td>${editing ? createSharedEditInput(first.tripTime || "", "tripTime", "time") : escapeHtml(first.tripTime || "")}</td>
        <td><strong>${escapeHtml(getGroupStatus(group))}</strong></td>
        <td><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td>
        <td><span class="miles-strong">${first.miles ? Number(first.miles).toFixed(1) + " mi" : "-- mi"}</span></td>
        <td>${renderSharedButtons(group,editing)}</td>
      `;

      table.appendChild(tr);
    });

    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  });

  if(!dates.length){
    const empty = document.createElement("div");
    empty.style.padding = "20px";
    empty.style.fontWeight = "700";
    empty.innerText = "No shared trips found.";
    container.appendChild(empty);
  }
}

function render(){
  container.innerHTML = "";
  renderTabs();

  if(activeTab === "TRIPS"){
    renderTripsTable(getTripsTabData());
  }

  if(activeTab === "SHARED"){
    renderSharedTable(getSharedGroups());
  }
}

/* ================= ACTIONS ================= */

async function reloadTrips(){
  trips = await fetchTrips();
  render();
}

async function handleEditTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t => t._id === id);
  if(!trip) return;

  const service = getServiceByTrip(trip);
  const mins = minutesToTrip(trip);
  const warningMinutes = getWarningMinutes(service);

  if(mins !== null && mins <= warningMinutes && mins > 0){
    const ok = confirm(`This trip is within ${warningMinutes} minutes.\n\nContinue editing?`);
    if(!ok) return;
  }

  trip.__editing = true;
  trip.status = "Scheduled";

  await updateTrip(id,{ status:"Scheduled" });
  render();
}

async function handleEditShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
  if(!group) return;

  const first = group[0];
  const service = getServiceByTrip(first);
  const mins = minutesToTrip(first);
  const warningMinutes = getWarningMinutes(service);

  if(mins !== null && mins <= warningMinutes && mins > 0){
    const ok = confirm(`This shared trip is within ${warningMinutes} minutes.\n\nContinue editing?`);
    if(!ok) return;
  }

  group.forEach(t=>{
    t.__editing = true;
    t.status = "Scheduled";
  });

  for(const t of group){
    await updateTrip(t._id,{ status:"Scheduled" });
  }

  render();
}

async function handleCancelEdit(){
  await reloadTrips();
}

async function handleDeleteTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  if(!id) return;

  const ok = confirm("Delete this trip?");
  if(!ok) return;

  await deleteTrip(id);
  await reloadTrips();
}

async function handleDeleteShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
  if(!group) return;

  const ok = confirm("Delete this shared trip?");
  if(!ok) return;

  for(const t of group){
    await deleteTrip(t._id);
  }

  await reloadTrips();
}

async function handleSaveTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t => t._id === id);
  if(!trip) return;

  const payload = {};
  const stops = Array.isArray(trip.stops) ? [...trip.stops] : [];

  tr.querySelectorAll(".edit-input").forEach(input=>{
    const field = input.dataset.field;
    const stopIndex = input.dataset.stopIndex;

    if(stopIndex !== undefined){
      stops[Number(stopIndex)] = normalizeAddress(input.value);
      return;
    }

    if(field === "pickup" || field === "dropoff"){
      payload[field] = normalizeAddress(input.value);
    }else if(field){
      payload[field] = input.value;
    }
  });

  payload.stops = stops;
  payload.status = "Scheduled";

  await updateTrip(id,payload);
  await reloadTrips();
}

async function handleSaveShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
  if(!group) return;

  const passengers = getRealPassengersFromGroup(group).map(p=>({...p}));
  const payload = {};

  tr.querySelectorAll(".edit-input").forEach(input=>{
    const field = input.dataset.field;
    if(!field) return;

    if(field.startsWith("passenger_")){
      const parts = field.split("_");
      const index = Number(parts[1]);
      const key = parts[2];

      if(!passengers[index]) return;

      if(key === "name"){
        passengers[index].name = input.value;
        passengers[index].clientName = input.value;
      }

      if(key === "phone"){
        passengers[index].phone = input.value;
        passengers[index].clientPhone = input.value;
      }

      if(key === "pickup"){
        passengers[index].pickup = normalizeAddress(input.value);
      }

      if(key === "dropoff"){
        passengers[index].dropoff = normalizeAddress(input.value);
      }

      return;
    }

    payload[field] = input.value;
  });

  payload.passengers = passengers;
  payload.status = "Scheduled";

  for(const t of group){
    await updateTrip(t._id,payload);
  }

  await reloadTrips();
}

async function handleConfirmTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t => t._id === id);
  if(!trip) return;

  const service = getServiceByTrip(trip);

  if(!service){
    throw new Error("Service not found for this trip");
  }

  btn.disabled = true;
  btn.textContent = "Routing...";

  const routePoints = buildIndividualRoutePoints(trip);
  const routeData = await calculateRouteMiles(routePoints);

  btn.textContent = "Pricing...";

  const serviceKey =
    service.serviceKey ||
    trip.serviceKey ||
    trip.serviceType ||
    "STANDARD";

  const stopsCount =
    Array.isArray(trip.stops) ? trip.stops.length : 0;




  await updateTrip(id,{
    status:"Confirmed",
    dispatchSelected:true,
    priceAmount:total,
    finalPrice:total,
    miles:routeData.miles,
    distanceMeters:routeData.distanceMeters,
    durationSeconds:routeData.durationSeconds,
    estimatedMinutes:routeData.estimatedMinutes,
    googleRoute:routeData.googleRoute,
    routePoints:routePoints,
    serviceName:service?.name || service?.title || "",
    serviceCode:service?.serviceKey || service?.companySuffix || service?.code || service?.serviceCode || "",
    serviceId:service?._id || ""
  });

  await reloadTrips();
}

async function handleConfirmShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
  if(!group) return;

  const first = group[0];
  const service = getServiceByTrip(first);

  if(!service){
    throw new Error("Shared service not found");
  }

  btn.disabled = true;
  btn.textContent = "Routing...";

  const passengers = getRealPassengersFromGroup(group);

  const activePassengers = passengers.filter(p=>{
    const s = cleanStatus(p.status);
    return !s.includes("no") && !s.includes("cancel");
  });

  const activeCount =
    activePassengers.length || passengers.length || 1;

  const routePoints = await buildSharedRoutePoints(group);
  const routeData = await calculateRouteMiles(routePoints);

  btn.textContent = "Pricing...";

 const total =
  await calculateServerPrice({
    serviceKey:"SHARED",
    miles:routeData.miles,
    stops:Math.max(0,activeCount - 1),
    minutes:routeData.estimatedMinutes,
    passengerCount:activeCount
  });

  const pricePerPassenger =
    Number((total / activeCount).toFixed(2));

  const updatedPassengers = passengers.map(p=>{
    const s = cleanStatus(p.status);

    if(s.includes("no") || s.includes("cancel")){
      return p;
    }

    return {
      ...p,
      status:"Confirmed",
      priceAmount:pricePerPassenger,
      finalPrice:pricePerPassenger
    };
  });

  const payload = {
    status:"Confirmed",
    dispatchSelected:true,
    isShared:true,
    tripType:"SHARED",
    serviceName:service?.name || service?.title || "Shared",
    serviceCode:service?.serviceKey || service?.companySuffix || service?.code || service?.serviceCode || "SH",
    serviceId:service?._id || "",
    passengers:updatedPassengers,
    totalPassengers:passengers.length,
    priceAmount:total,
    finalPrice:total,
    pricePerPassenger:pricePerPassenger,
    sharedStopsCount:Math.max(0,activeCount - 1),
    miles:routeData.miles,
    distanceMeters:routeData.distanceMeters,
    durationSeconds:routeData.durationSeconds,
    estimatedMinutes:routeData.estimatedMinutes,
    googleRoute:routeData.googleRoute,
    routePoints:routePoints,
    optimizedRoute:routeData.googleRoute
  };

  for(const t of group){
    await updateTrip(t._id,payload);
  }

  await reloadTrips();
}

async function handleCancelTrip(btn){
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  if(!id) return;

  const ok = confirm("Cancel this trip?");
  if(!ok) return;

  await updateTrip(id,{
    status:"Cancelled",
    cancelledAt:new Date().toISOString()
  });

  await reloadTrips();
}

async function handleCancelShared(btn){
  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
  if(!group) return;

  const ok = confirm("Cancel this shared trip?");
  if(!ok) return;

  const passengers = getRealPassengersFromGroup(group).map(p=>({
    ...p,
    status:"Cancelled"
  }));

  for(const t of group){
    await updateTrip(t._id,{
      status:"Cancelled",
      passengers,
      cancelledAt:new Date().toISOString()
    });
  }

  await reloadTrips();
}

/* ================= EVENTS ================= */

container.addEventListener("click", async e=>{
  const btn = e.target.closest("button");
  if(!btn) return;

  const action = btn.dataset.action;
  if(!action) return;

  try{
    if(action === "edit-trip") await handleEditTrip(btn);
    if(action === "edit-shared") await handleEditShared(btn);
    if(action === "cancel-edit") await handleCancelEdit();
    if(action === "delete-trip") await handleDeleteTrip(btn);
    if(action === "delete-shared") await handleDeleteShared(btn);
    if(action === "save-trip") await handleSaveTrip(btn);
    if(action === "save-shared") await handleSaveShared(btn);
    if(action === "confirm-trip") await handleConfirmTrip(btn);
    if(action === "confirm-shared") await handleConfirmShared(btn);
    if(action === "cancel-trip") await handleCancelTrip(btn);
    if(action === "cancel-shared") await handleCancelShared(btn);
  }catch(err){
    console.error(err);
    alert(err.message || "Server Error");
    await reloadTrips();
  }
});

/* ================= EXPORT ================= */

window.ReviewApp = {
  token,
  companyName,
  container,

  get trips(){ return trips; },
  set trips(v){ trips = v; },

  get COMPANY_SERVICES(){ return COMPANY_SERVICES; },

  refreshData,
  render,

  normalizeText,
  escapeHtml,
  formatMoney,
  getAZNow,
  normalizeAddress,
  parseTripDateTime,
  minutesToTrip,
  getSharedKey,
  getRealPassengersFromGroup,
  getServiceByTrip,
  isSharedTrip,
  isSharedService,
  getWarningMinutes,
  warningEnabled,
  calculateRouteMiles,
  buildIndividualRoutePoints,
  buildSharedRoutePoints,
  fetchTrips,
  updateTrip,
  deleteTrip,
  getTripsTabData,
  getSharedGroups,
  calculateServerPrice
};

/* ================= LOAD ================= */

async function refreshData(){
  await loadSystemRegion();
  await loadServices();
  trips = await fetchTrips();
  render();
}

await refreshData();

setInterval(async()=>{
  const hasEditing = trips.some(t=>t.__editing);
  if(hasEditing) return;
  await refreshData();
},30000);

});