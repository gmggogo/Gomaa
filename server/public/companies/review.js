هديك الملف كامل على أجزاء عشان ما يتقصّش.
ابدأ بالجزء الأول واستنى الجزء الثاني قبل النسخ النهائي.

window.addEventListener("DOMContentLoaded", async () => {
const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";
if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}
const container = document.getElementById("tripsContainer");
/* ================= STATE ================= */
let activeTab = "";
let trips = [];
let COMPANY_SERVICES = [];
/* ================= HELPERS ================= */
function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{
      timeZone:"America/Phoenix"
    })
  );
}
function normalizeText(v){
  return String(v ?? "").trim();
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
function normalizeAZ(address){
  let v = normalizeText(address);
  if(!v) return "";
  v = v.replace(/\s+/g," ").trim();
  v = v
    .replace(/\btemp\b/ig,"Tempe")
    .replace(/\btempe\b/ig,"Tempe")
    .replace(/\bchandle\b/ig,"Chandler")
    .replace(/\bchandler\b/ig,"Chandler")
    .replace(/\bphoenixx\b/ig,"Phoenix");
  const lower = v.toLowerCase();
  if(
    !lower.includes(", az") &&
    !lower.includes(" az ") &&
    !lower.endsWith(" az") &&
    !lower.includes("arizona")
  ){
    v += ", AZ, USA";
  }
  return v;
}
function parseTripDateTime(tripDate, tripTime){
  const d = normalizeText(tripDate);
  let t = normalizeText(tripTime);
  if(!d || !t) return null;
  if(/^\d{1,2}:\d{2}$/.test(t)){
    const [hh,mm] = t.split(":");
    const dt = new Date(
      Number(d.split("-")[0]),
      Number(d.split("-")[1]) - 1,
      Number(d.split("-")[2]),
      Number(hh),
      Number(mm),
      0
    );
    return isNaN(dt.getTime()) ? null : dt;
  }
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(ampm){
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();
    if(ap === "PM" && h < 12) h += 12;
    if(ap === "AM" && h === 12) h = 0;
    const dt = new Date(
      Number(d.split("-")[0]),
      Number(d.split("-")[1]) - 1,
      Number(d.split("-")[2]),
      h,
      m,
      0
    );
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}
function getTripDateTime(t){
  return parseTripDateTime(t.tripDate, t.tripTime);
}
function minutesToTrip(t){
  const dt = getTripDateTime(t);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}
function isSharedTrip(t){
  return (
    t.isShared === true ||
    t.tripType === "SHARED" ||
    String(t.tripNumber || "").includes("-SH") ||
    (Array.isArray(t.passengers) && t.passengers.length > 0)
  );
}
function getTripNumber(t){
  return t.tripNumber || "";
}
function getSharedKey(t){
  return normalizeText(t.groupId) || normalizeText(t.tripNumber) || String(t._id);
}
function createEditInput(value, field, type="text"){
  return `<input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">`;
}
function createSharedEditInput(value, tripId, field, type="text"){
  return `<input class="edit-input" type="${type}" data-trip-id="${tripId}" data-field="${field}" value="${escapeHtml(value)}">`;
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
    status:t.status || "Scheduled"
  }));
}
/* ================= SERVICES ================= */
async function loadCompanyServices(){
  try{
    const res = await fetch("/api/services");
    if(!res.ok){
      throw new Error("Failed loading services");
    }
    const data = await res.json();
    COMPANY_SERVICES = Array.isArray(data)
      ? data
        .filter(s =>
          s.enabled === true &&
          s.companyEnabled === true
        )
        .map(service=>({
          key:
          normalizeText(service.serviceKey)
            .toUpperCase(),
          title:
          service.title || "",
          suffix:
          normalizeText(
            service.companySuffix ||
            service.suffix ||
            "ST"
          ).toUpperCase(),
          shared:
          service.companyShared === true,
          pricingMode:
          normalizeText(
            service.companyPricingMode ||
            service.pricingMode ||
            "MILE"
          ).toUpperCase(),
          baseFare:
          Number(
            service.companyBaseFare ??
            service.baseFare ??
            0
          ),
          includedMiles:
          Number(
            service.companyIncludedMiles ??
            service.includedMiles ??
            0
          ),
          perMile:
          Number(
            service.companyPerMile ??
            service.perMile ??
            0
          ),
          hourlyRate:
          Number(
            service.companyHourlyRate ??
            service.hourlyRate ??
            0
          ),
          hourlyBillingMode:
          normalizeText(
            service.companyHourlyBillingMode ||
            service.hourlyBillingMode ||
            "FULL"
          ).toUpperCase(),
          stopFee:
          Number(
            service.companyStopFee ??
            service.stopFee ??
            0
          ),
          noShowFee:
          Number(
            service.companyNoShowFee ??
            service.noShowFee ??
            0
          ),
          sharedPrice:
          Number(
            service.companySharedPrice ??
            service.sharedPrice ??
            0
          ),
          warningEnabled:
          service.companyWarningEnabled === true,
          warningMinutes:
          Number(
            service.companyWarningMinutes || 0
          ),
          cancelFee:
          Number(
            service.companyCancelFee || 0
          )
        }))
      : [];
  }catch(err){
    console.log(err);
    COMPANY_SERVICES = [];
  }
}
function getTripSuffix(trip){
  const tripNumber =
  normalizeText(trip.tripNumber);
  if(!tripNumber.includes("-")){
    return "";
  }
  const parts = tripNumber.split("-");
  return normalizeText(
    parts[parts.length - 1]
  ).toUpperCase();
}
function getServiceConfig(trip){
  const suffix = getTripSuffix(trip);
  let service =
  COMPANY_SERVICES.find(
    s => s.suffix === suffix
  );
  if(service){
    return service;
  }
  const serviceKey =
  normalizeText(
    trip.serviceKey ||
    trip.serviceType ||
    trip.vehicle ||
    ""
  ).toUpperCase();
  if(serviceKey){
    service =
    COMPANY_SERVICES.find(
      s => s.key === serviceKey
    );
    if(service){
      return service;
    }
  }
  if(isSharedTrip(trip)){
    return COMPANY_SERVICES.find(s=>s.shared === true) || null;
  }
  return COMPANY_SERVICES.find(s=>s.shared !== true) || null;
}
function getWarningPolicy(trip){
  const service = getServiceConfig(trip);
  if(!service){
    return {
      enabled:true,
      minutes:120,
      fee:15
    };
  }
  return {
    enabled:service.warningEnabled === true,
    minutes:Number(service.warningMinutes || 0),
    fee:Number(service.cancelFee || 0)
  };
}
function checkDynamicWarning(trip, customDate=null, customTime=null, messageType="trip"){
  const policy = getWarningPolicy(trip);
  if(policy.enabled === false){
    return true;
  }
  const dateValue =
  customDate || trip.tripDate;
  const timeValue =
  customTime || trip.tripTime;
  const tripDateTime =
  parseTripDateTime(dateValue,timeValue);
  if(!tripDateTime){
    return true;
  }
  const mins =
  (tripDateTime - getAZNow()) / 60000;
  if(
    mins !== null &&
    mins > 0 &&
    mins <= Number(policy.minutes || 0)
  ){
    const ok = confirm(
      `WARNING:\n\nThis ${messageType} is within ${policy.minutes} minutes.\nCancellation fee $${formatMoney(policy.fee)} may apply.\n\nDo you want to continue?`
    );
    return ok;
  }
  return true;
}
/* ================= GOOGLE ================= */
let googleLoadPromise = null;
function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.DirectionsService){
    return Promise.resolve();
  }
  if(googleLoadPromise){
    return googleLoadPromise;
  }
  googleLoadPromise = new Promise(async (resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      if(!res.ok){
        return reject(new Error("Google config not found"));
      }
      const data = await res.json();
      if(!data.googleKey){
        return reject(new Error("Google key missing"));
      }
      const existing =
      document.querySelector("script[data-google-maps='true']");
      if(existing){
        existing.addEventListener("load",()=>resolve());
        existing.addEventListener("error",()=>reject(new Error("Google failed")));
        return;
      }
      const script =
      document.createElement("script");
      script.src =
      `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
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
function sameRoutePoints(a,b){
  const aa =
  Array.isArray(a) ? a.map(x=>normalizeText(x).toLowerCase()) : [];
  const bb =
  Array.isArray(b) ? b.map(x=>normalizeText(x).toLowerCase()) : [];
  if(aa.length !== bb.length){
    return false;
  }
  return aa.every((v,i)=>v === bb[i]);
}
async function calculateRouteMiles(points){
  await ensureGoogleLoaded();
  const cleanPoints =
  Array.isArray(points)
    ? points.map(p=>normalizeAZ(p)).filter(Boolean)
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
  const waypoints =
  middle.map(address=>({
    location:address,
    stopover:true
  }));
  return new Promise((resolve,reject)=>{
    const service =
    new google.maps.DirectionsService();
    service.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints:true,
        travelMode:google.maps.TravelMode.DRIVING,
        drivingOptions:{
          departureTime:new Date()
        },
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
            overviewPolyline:route.overview_polyline ? route.overview_polyline.points : "",
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




/* ================= ROUTE CACHE ================= */
async function getRouteDataWithCache(trip, routePoints){
  if(
    Number(trip.miles || 0) > 0 &&
    trip.googleRoute &&
    Array.isArray(trip.routePoints) &&
    sameRoutePoints(
      trip.routePoints,
      routePoints
    )
  ){
    return {
      miles:Number(trip.miles || 0),
      distanceMeters:Number(trip.distanceMeters || 0),
      durationSeconds:Number(trip.durationSeconds || 0),
      estimatedMinutes:Number(trip.estimatedMinutes || 0),
      googleRoute:trip.googleRoute
    };
  }
  return await calculateRouteMiles(routePoints);
}
/* ================= PRICE ================= */
function calculateIndividualPrice(trip,miles){
  const service =
  getServiceConfig(trip);
  if(!service){
    return 0;
  }
  const status =
  String(trip.status || "")
    .toLowerCase();
  if(status === "noshow"){
    return Number(service.noShowFee || 0);
  }
  const totalMiles =
  Math.max(
    0,
    Number(miles || 0)
  );
  const extraMiles =
  Math.max(
    0,
    totalMiles -
    Number(service.includedMiles || 0)
  );
  const stopsCount =
  Array.isArray(trip.stops)
    ? trip.stops.filter(Boolean).length
    : 0;
  const total =
    Number(service.baseFare || 0) +
    (
      extraMiles *
      Number(service.perMile || 0)
    ) +
    (
      stopsCount *
      Number(service.stopFee || 0)
    );
  return Number(
    total.toFixed(2)
  );
}
function calculateSharedPrice(group,miles){
  const first =
  group[0] || {};
  const service =
  getServiceConfig(first);
  if(!service){
    return {
      total:0,
      pricePerPassenger:0,
      stopsCount:0
    };
  }
  const passengers =
  getRealPassengersFromGroup(group);
  const activePassengers =
  passengers.filter(p =>
    p.status !== "NoShow"
  );
  const noShowPassengers =
  passengers.filter(p =>
    p.status === "NoShow"
  );
  const count =
  activePassengers.length;
  const noShowCost =
    noShowPassengers.length *
    Number(service.noShowFee || 0);
  if(count === 0){
    return {
      total:Number(noShowCost.toFixed(2)),
      pricePerPassenger:0,
      stopsCount:0
    };
  }
  const baseTotal =
    count *
    Number(
      service.sharedPrice ||
      service.baseFare ||
      0
    );
  const freeMiles =
    count *
    Number(service.includedMiles || 0);
  const totalMiles =
  Math.max(
    0,
    Number(miles || 0)
  );
  const extraMiles =
  Math.max(
    0,
    totalMiles - freeMiles
  );
  const milesCost =
    extraMiles *
    Number(service.perMile || 0);
  const stopsCount =
  Math.max(
    0,
    count - 1
  );
  const stopsCost =
    stopsCount *
    Number(service.stopFee || 0);
  const activeTotal =
    baseTotal +
    milesCost +
    stopsCost;
  return {
    total:Number(
      (activeTotal + noShowCost).toFixed(2)
    ),
    pricePerPassenger:Number(
      (activeTotal / count).toFixed(2)
    ),
    stopsCount
  };
}
function buildPricingSnapshot(trip,miles,priceAmount){
  const service =
  getServiceConfig(trip);
  if(!service){
    return {};
  }
  return {
    serviceKey:
    service.key,
    serviceTitle:
    service.title,
    serviceSuffix:
    service.suffix,
    pricingMode:
    service.pricingMode,
    baseFare:
    service.baseFare,
    includedMiles:
    service.includedMiles,
    perMile:
    service.perMile,
    hourlyRate:
    service.hourlyRate,
    hourlyBillingMode:
    service.hourlyBillingMode,
    stopFee:
    service.stopFee,
    noShowFee:
    service.noShowFee,
    sharedPrice:
    service.sharedPrice,
    warningEnabled:
    service.warningEnabled,
    warningMinutes:
    service.warningMinutes,
    cancelFee:
    service.cancelFee,
    miles:Number(miles || 0),
    priceAmount:
    Number(priceAmount || 0),
    calculatedAt:
    new Date()
  };
}
/* ================= ROUTE POINTS ================= */
function buildIndividualRoutePoints(trip){
  const points = [];
  if(trip.pickup){
    points.push(trip.pickup);
  }
  if(Array.isArray(trip.stops)){
    trip.stops.forEach(s=>{
      if(normalizeText(s)){
        points.push(s);
      }
    });
  }
  if(trip.dropoff){
    points.push(trip.dropoff);
  }
  return points;
}
function buildSharedRoutePoints(group){
  const list =
  getRealPassengersFromGroup(group);
  const points = [];
  if(!list.length){
    return points;
  }
  const added =
  new Set();
  function addPoint(v){
    const value =
    normalizeText(v).toLowerCase();
    if(!value) return;
    if(added.has(value)) return;
    added.add(value);
    points.push(v);
  }
  const samePickup =
  list.every(p =>
    normalizeText(p.pickup).toLowerCase() ===
    normalizeText(list[0].pickup).toLowerCase()
  );
  const sameDropoff =
  list.every(p =>
    normalizeText(p.dropoff).toLowerCase() ===
    normalizeText(list[0].dropoff).toLowerCase()
  );
  if(samePickup){
    addPoint(list[0].pickup);
    const sortedDrops =
    [...list].sort((a,b)=>{
      return normalizeText(a.dropoff)
        .localeCompare(
          normalizeText(b.dropoff)
        );
    });
    sortedDrops.forEach(p=>{
      addPoint(p.dropoff);
    });
    return points;
  }
  if(sameDropoff){
    const reversedPickups =
    [...list].reverse();
    reversedPickups.forEach(p=>{
      addPoint(p.pickup);
    });
    addPoint(list[0].dropoff);
    return points;
  }
  list.forEach(p=>{
    addPoint(p.pickup);
    addPoint(p.dropoff);
  });
  return points;
}
/* ================= SERVER ================= */
async function fetchTrips(){
  const url = companyName
    ? "/api/trips/company/" +
      encodeURIComponent(companyName)
    : "/api/trips/company";
  const res =
  await fetch(url,{
    headers:{
      Authorization:
      "Bearer " + token
    }
  });
  if(!res.ok){
    container.innerHTML =
    "<div>Server Error</div>";
    return [];
  }
  return await res.json();
}
async function updateTrip(id,payload){
  const res =
  await fetch(
    "/api/trips/" + id,
    {
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:
      JSON.stringify(payload)
    }
  );
  if(!res.ok){
    const err =
    await res.json().catch(()=>({}));
    throw new Error(
      err.message ||
      "Update failed"
    );
  }
  return await res.json().catch(()=>null);
}
async function deleteTrip(id){
  const res =
  await fetch(
    "/api/trips/" + id,
    {
      method:"DELETE",
      headers:{
        Authorization:
        "Bearer " + token
      }
    }
  );
  if(!res.ok){
    const err =
    await res.json().catch(()=>({}));
    throw new Error(
      err.message ||
      "Delete failed"
    );
  }
}
/* ================= GROUPING ================= */
function groupByDate(list){
  const groups = {};
  list.forEach(t=>{
    const d =
    t.createdAt
      ? new Date(t.createdAt)
      : new Date();
    const key =
    d.toLocaleDateString();
    if(!groups[key]){
      groups[key] = [];
    }
    groups[key].push(t);
  });
  return groups;
}
function getIndividualTrips(){
  return trips.filter(t=>{
    if(isSharedTrip(t)){
      return false;
    }
    const status =
    String(t.status || "")
      .toLowerCase();
    return ![
      "completed",
      "noshow",
      "cancelled"
    ].includes(status);
  });
}
function getSharedGroups(){
  const map = {};
  trips
  .filter(t=>{
    if(!isSharedTrip(t)){
      return false;
    }
    const status =
    String(t.status || "")
      .toLowerCase();
    return ![
      "completed",
      "noshow",
      "cancelled"
    ].includes(status);
  })
  .forEach(t=>{
    const key =
    getSharedKey(t);
    if(!map[key]){
      map[key] = [];
    }
    map[key].push(t);
  });
  return Object.values(map)
  .filter(group=>{
    const hasActive =
    group.some(t=>{
      const status =
      String(t.status || "")
        .toLowerCase();
      return ![
        "completed",
        "noshow",
        "cancelled"
      ].includes(status);
    });
    return hasActive;
  })
  .map(group=>{
    return group.sort((a,b)=>{
      const ai =
      Number(a.passengerIndex || 0);
      const bi =
      Number(b.passengerIndex || 0);
      return ai - bi;
    });
  });
}
/* ================= TABS ================= */
function hasTripsServices(){
  return COMPANY_SERVICES.some(
    s => s.shared !== true
  );
}
function hasSharedServices(){
  return COMPANY_SERVICES.some(
    s => s.shared === true
  );
}
function renderTabs(){
  const hasTrips =
  hasTripsServices();
  const hasShared =
  hasSharedServices();
  if(!hasTrips && !hasShared){
    container.innerHTML = `
      <div class="empty-services">
        No Active Company Services
      </div>
    `;
    return false;
  }
  if(!activeTab){
    if(hasTrips){
      activeTab = "TRIPS";
    }else if(hasShared){
      activeTab = "SHARED";
    }
  }
  if(activeTab === "TRIPS" && !hasTrips){
    activeTab = hasShared ? "SHARED" : "";
  }
  if(activeTab === "SHARED" && !hasShared){
    activeTab = hasTrips ? "TRIPS" : "";
  }
  const tabs =
  document.createElement("div");
  tabs.className =
  "review-tabs";
  let html = "";
  if(hasTrips){
    html += `
      <button
        id="reviewTripsTab"
        class="${
          activeTab === "TRIPS"
          ? "tab-active"
          : "tab-inactive"
        }"
        type="button"
      >
        Trips
      </button>
    `;
  }
  if(hasShared){
    html += `
      <button
        id="reviewSharedTab"
        class="${
          activeTab === "SHARED"
          ? "tab-active"
          : "tab-inactive"
        }"
        type="button"
      >
        Shared
      </button>
    `;
  }
  tabs.innerHTML = html;
  container.appendChild(tabs);
  const tripsBtn =
  document.getElementById(
    "reviewTripsTab"
  );
  const sharedBtn =
  document.getElementById(
    "reviewSharedTab"
  );
  if(tripsBtn){
    tripsBtn.addEventListener(
      "click",
      ()=>{
        activeTab = "TRIPS";
        render();
      }
    );
  }
  if(sharedBtn){
    sharedBtn.addEventListener(
      "click",
      ()=>{
        activeTab = "SHARED";
        render();
      }
    );
  }
  return true;
}
/* ================= ROW COLOR ================= */
function applyRowColor(tr,t){
  const mins =
  minutesToTrip(t);
  const policy =
  getWarningPolicy(t);
  const policyMinutes =
  policy.enabled
    ? Number(policy.minutes || 0)
    : 0;
  if(t.status === "Cancelled"){
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
      if(t.status === "Confirmed"){
        tr.classList.add("trip-blink");
      }
    }else if(mins <= 60){
      tr.classList.add("red-mid");
      if(t.status === "Confirmed"){
        tr.classList.add("trip-blink");
      }
    }else if(
      policyMinutes > 0 &&
      mins <= policyMinutes
    ){
      tr.classList.add("red-light");
    }else if(
      policyMinutes > 0 &&
      mins <= policyMinutes + 60
    ){
      tr.classList.add("yellow");
    }else if(t.status === "Confirmed"){
      tr.classList.add("confirmed-row");
    }else{
      tr.classList.add("scheduled-row");
    }
  }
}
/* ================= INDIVIDUAL BUTTONS ================= */
function renderIndividualButtons(t,editing){
  const mins =
  minutesToTrip(t);
  const policy =
  getWarningPolicy(t);
  const policyMinutes =
  policy.enabled
    ? Number(policy.minutes || 0)
    : 0;
  const inPolicyWindow =
    policyMinutes > 0 &&
    mins !== null &&
    mins <= policyMinutes &&
    mins > 0;
  if(editing){
    return `
      <div class="actions-wrap">
        <button
          class="btn confirm-green"
          data-action="save-individual"
        >
          Save
        </button>
        <button
          class="btn cancel"
          data-action="cancel-edit"
        >
          Cancel Edit
        </button>
      </div>
    `;
  }
  if(t.status === "Cancelled"){
    return "";
  }
  if(!inPolicyWindow){
    return `
      <div class="actions-wrap">
        <button
          class="btn edit"
          data-action="edit"
        >
          Edit
        </button>
        <button
          class="btn delete"
          data-action="delete"
        >
          Delete
        </button>
        <button
          class="btn ${
            t.status === "Confirmed"
            ? "confirm-yellow"
            : "confirm-green"
          }"
          data-action="confirm-individual"
        >
          Confirm
        </button>
      </div>
    `;
  }
  if(
    inPolicyWindow &&
    t.status === "Scheduled"
  ){
    return `
      <div class="actions-wrap">
        <button
          class="btn confirm"
          data-action="confirm-individual"
        >
          Confirm
        </button>
        <button
          class="btn cancel"
          data-action="cancel"
        >
          Cancel
        </button>
      </div>
    `;
  }
  if(
    inPolicyWindow &&
    t.status === "Confirmed"
  ){
    return `
      <div class="actions-wrap">
        <button
          class="btn cancel"
          data-action="cancel"
        >
          Cancel
        </button>
      </div>
    `;
  }
  return "";
}



/* ================= INDIVIDUAL TABLE ================= */

function renderIndividualTable(list){

  const groups =
  groupByDate(list);

  const dates =
  Object.keys(groups)
    .sort((a,b)=>
      new Date(b) - new Date(a)
    );

  dates.forEach(date=>{

    const title =
    document.createElement("div");

    title.className =
    "date-title";

    title.innerText = date;

    container.appendChild(title);

    const tableWrap =
    document.createElement("div");

    tableWrap.className =
    "table-wrap";

    const table =
    document.createElement("table");

    table.className =
    "review-table";

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip#</th>
        <th>Service</th>
        <th>Entry</th>
        <th>Entry Phone</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Stops</th>
        <th>Drop</th>
        <th>Notes</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Price</th>
        <th>Miles</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const tr =
      document.createElement("tr");

      tr.dataset.id = t._id;

      const editing =
      t.__editing === true;

      applyRowColor(tr,t);

      const service =
      getServiceConfig(t);

      const stops =
      Array.isArray(t.stops)
        ? t.stops
        : [];

      tr.innerHTML = `
        <td>${i + 1}</td>

        <td>
          <span class="trip-number-badge">
            ${escapeHtml(getTripNumber(t))}
          </span>
        </td>

        <td>
          <strong>
            ${
              escapeHtml(
                service?.title ||
                t.serviceType ||
                "--"
              )
            }
          </strong>
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.entryName || "",
                "entryName"
              )
            : escapeHtml(
                t.entryName || ""
              )
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.entryPhone || "",
                "entryPhone"
              )
            : escapeHtml(
                t.entryPhone || ""
              )
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.clientName || "",
                "clientName"
              )
            : `
              <div class="multi-line">
                ${
                  escapeHtml(
                    t.clientName || ""
                  )
                }
              </div>
            `
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.clientPhone || "",
                "clientPhone"
              )
            : `
              <div class="multi-line">
                ${
                  escapeHtml(
                    t.clientPhone || ""
                  )
                }
              </div>
            `
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.pickup || "",
                "pickup"
              )
            : `
              <div class="multi-line">
                ${
                  escapeHtml(
                    t.pickup || ""
                  )
                }
              </div>
            `
          }
        </td>

        <td>
          ${
            editing

            ? stops.map((s,si)=>`

              <input
                class="edit-input"
                data-stop-index="${si}"
                value="${escapeHtml(s)}"
              >

            `).join("")

            : `
              <div class="multi-line">

                ${
                  stops.length
                  ? stops.map(s=>
                      escapeHtml(s)
                    ).join("<br>")
                  : "--"
                }

              </div>
            `
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.dropoff || "",
                "dropoff"
              )
            : `
              <div class="multi-line">
                ${
                  escapeHtml(
                    t.dropoff || ""
                  )
                }
              </div>
            `
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.notes || "",
                "notes"
              )
            : `
              <div class="multi-line">
                ${
                  escapeHtml(
                    t.notes || ""
                  )
                }
              </div>
            `
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.tripDate || "",
                "tripDate",
                "date"
              )
            : escapeHtml(
                t.tripDate || ""
              )
          }
        </td>

        <td>
          ${
            editing
            ? createEditInput(
                t.tripTime || "",
                "tripTime",
                "time"
              )
            : escapeHtml(
                t.tripTime || ""
              )
          }
        </td>

        <td>
          <strong>
            ${
              escapeHtml(
                t.status || "Scheduled"
              )
            }
          </strong>
        </td>

        <td>
          <span class="price-badge">
            $${formatMoney(t.priceAmount)}
          </span>
        </td>

        <td>
          <span class="miles-strong">

            ${
              t.miles !== undefined &&
              t.miles !== null &&
              t.miles !== ""

              ? Number(t.miles)
                .toFixed(1) + " mi"

              : "-- mi"
            }

          </span>
        </td>

        <td>
          ${
            renderIndividualButtons(
              t,
              editing
            )
          }
        </td>
      `;

      table.appendChild(tr);

    });

    tableWrap.appendChild(table);

    container.appendChild(tableWrap);

  });

  if(!dates.length){

    const empty =
    document.createElement("div");

    empty.style.padding =
    "20px";

    empty.style.fontWeight =
    "700";

    empty.style.color =
    "#0f172a";

    empty.innerText =
    "No trips found.";

    container.appendChild(empty);

  }

}

/* ================= SHARED STATUS ================= */

function getGroupStatus(group){

  if(
    group.every(
      t => t.status === "Cancelled"
    )
  ){
    return "Cancelled";
  }

  if(
    group.every(
      t => t.status === "Confirmed"
    )
  ){
    return "Confirmed";
  }

  if(
    group.some(
      t => t.status === "Confirmed"
    )
  ){
    return "Partially Confirmed";
  }

  return (
    group[0]?.status ||
    "Scheduled"
  );

}

function getGroupPrice(group){

  const firstWithPrice =
  group.find(t =>
    Number(t.priceAmount || 0) > 0
  );

  return firstWithPrice
    ? Number(firstWithPrice.priceAmount || 0)
    : 0;

}

/* ================= SHARED BUTTONS ================= */

function renderSharedButtons(group,editing){

  const first =
  group[0];

  const mins =
  minutesToTrip(first);

  const status =
  getGroupStatus(group);

  const policy =
  getWarningPolicy(first);

  const policyMinutes =
  policy.enabled
    ? Number(policy.minutes || 0)
    : 0;

  const inPolicyWindow =
    policyMinutes > 0 &&
    mins !== null &&
    mins <= policyMinutes &&
    mins > 0;

  if(editing){

    return `
      <div class="actions-wrap">

        <button
          class="btn confirm-green"
          data-action="save-shared"
        >
          Save
        </button>

        <button
          class="btn cancel"
          data-action="cancel-edit"
        >
          Cancel Edit
        </button>

      </div>
    `;

  }

  if(status === "Cancelled"){
    return "";
  }

  if(!inPolicyWindow){

    return `
      <div class="actions-wrap">

        <button
          class="btn edit"
          data-action="edit-shared"
        >
          Edit
        </button>

        <button
          class="btn delete"
          data-action="delete-shared"
        >
          Delete
        </button>

        <button
          class="btn ${
            status === "Confirmed"
            ? "confirm-yellow"
            : "confirm-green"
          }"
          data-action="confirm-shared"
        >
          Confirm
        </button>

      </div>
    `;

  }

  if(
    inPolicyWindow &&
    status === "Scheduled"
  ){

    return `
      <div class="actions-wrap">

        <button
          class="btn confirm"
          data-action="confirm-shared"
        >
          Confirm
        </button>

        <button
          class="btn cancel"
          data-action="cancel-shared"
        >
          Cancel
        </button>

      </div>
    `;

  }

  if(
    inPolicyWindow &&
    status === "Confirmed"
  ){

    return `
      <div class="actions-wrap">

        <button
          class="btn cancel"
          data-action="cancel-shared"
        >
          Cancel
        </button>

      </div>
    `;

  }

  return "";

}

/* ================= SHARED TABLE ================= */

function renderSharedTable(groups){

  const dateGroups = {};

  groups.forEach(group=>{

    const first = group[0];

    const d =
    first?.createdAt
      ? new Date(first.createdAt)
      : new Date();

    const key =
    d.toLocaleDateString();

    if(!dateGroups[key]){
      dateGroups[key] = [];
    }

    dateGroups[key].push(group);

  });

  const dates =
  Object.keys(dateGroups)
    .sort((a,b)=>
      new Date(b) - new Date(a)
    );

  dates.forEach(date=>{

    const title =
    document.createElement("div");

    title.className =
    "date-title";

    title.innerText = date;

    container.appendChild(title);

    const tableWrap =
    document.createElement("div");

    tableWrap.className =
    "table-wrap";

    const table =
    document.createElement("table");

    table.className =
    "review-table";

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip#</th>
        <th>Service</th>
        <th>Entry</th>
        <th>Entry Phone</th>
        <th>Clients</th>
        <th>Phones</th>
        <th>Pickups</th>
        <th>Stops</th>
        <th>Drops</th>
        <th>Notes</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Price</th>
        <th>Miles</th>
        <th>Actions</th>
      </tr>
    `;

    dateGroups[date].forEach((group,i)=>{

      const first =
      group[0];

      const tr =
      document.createElement("tr");

      tr.dataset.groupId =
      getSharedKey(first);

      const editing =
      first.__editing === true;

      applyRowColor(tr,first);

      const passengers =
      getRealPassengersFromGroup(group);

      const service =
      getServiceConfig(first);

      let clients = "";
      let phones  = "";
      let pickups = "";
      let drops   = "";

      if(editing){

        clients =
        passengers.map((p,idx)=>

          createSharedEditInput(
            p.name || p.clientName || "",
            first._id,
            `passenger_${idx}_name`
          )

        ).join("");

        phones =
        passengers.map((p,idx)=>

          createSharedEditInput(
            p.phone || p.clientPhone || "",
            first._id,
            `passenger_${idx}_phone`
          )

        ).join("");

        pickups =
        passengers.map((p,idx)=>

          createSharedEditInput(
            p.pickup || "",
            first._id,
            `passenger_${idx}_pickup`
          )

        ).join("");

        drops =
        passengers.map((p,idx)=>

          createSharedEditInput(
            p.dropoff || "",
            first._id,
            `passenger_${idx}_dropoff`
          )

        ).join("");

      }else{

        clients =
        passengers.map((p,idx)=>
          `${idx+1}. ${
            escapeHtml(
              p.name ||
              p.clientName ||
              ""
            )
          }`
        ).join("<br>");

        phones =
        passengers.map((p,idx)=>
          `${idx+1}. ${
            escapeHtml(
              p.phone ||
              p.clientPhone ||
              ""
            )
          }`
        ).join("<br>");

        pickups =
        passengers.map((p,idx)=>
          `${idx+1}. ${
            escapeHtml(
              p.pickup || ""
            )
          }`
        ).join("<br>");

        drops =
        passengers.map((p,idx)=>
          `${idx+1}. ${
            escapeHtml(
              p.dropoff || ""
            )
          }`
        ).join("<br>");

      }

      const stopsCount =
      Math.max(
        0,
        passengers.length - 1
      );

      tr.innerHTML = `
        <td>${i+1}</td>

        <td>
          <span class="trip-number-badge">
            ${escapeHtml(getTripNumber(first))}
          </span>
        </td>

        <td>
          <strong>
            ${
              escapeHtml(
                service?.title ||
                first.serviceType ||
                "--"
              )
            }
          </strong>
        </td>

        <td>
          ${
            editing
            ? createSharedEditInput(
                first.entryName || "",
                first._id,
                "entryName"
              )
            : escapeHtml(
                first.entryName || ""
              )
          }
        </td>

        <td>
          ${
            editing
            ? createSharedEditInput(
                first.entryPhone || "",
                first._id,
                "entryPhone"
              )
            : escapeHtml(
                first.entryPhone || ""
              )
          }
        </td>

        <td>
          <div class="multi-line">
            ${clients}
          </div>
        </td>

        <td>
          <div class="multi-line">
            ${phones}
          </div>
        </td>

        <td>
          <div class="multi-line">
            ${pickups}
          </div>
        </td>

        <td>
          <strong>
            ${stopsCount}
          </strong>
        </td>

        <td>
          <div class="multi-line">
            ${drops}
          </div>
        </td>

        <td>
          ${
            editing
            ? createSharedEditInput(
                first.notes || "",
                first._id,
                "notes"
              )
            : `
              <div class="multi-line">
                ${
                  escapeHtml(
                    first.notes || ""
                  )
                }
              </div>
            `
          }
        </td>

        <td>
          ${
            editing
            ? createSharedEditInput(
                first.tripDate || "",
                first._id,
                "tripDate",
                "date"
              )
            : escapeHtml(
                first.tripDate || ""
              )
          }
        </td>

        <td>
          ${
            editing
            ? createSharedEditInput(
                first.tripTime || "",
                first._id,
                "tripTime",
                "time"
              )
            : escapeHtml(
                first.tripTime || ""
              )
          }
        </td>

        <td>
          <strong>
            ${
              escapeHtml(
                getGroupStatus(group)
              )
            }
          </strong>
        </td>

        <td>
          <span class="price-badge">
            $${formatMoney(getGroupPrice(group))}
          </span>
        </td>

        <td>
          <span class="miles-strong">

            ${
              first.miles !== undefined &&
              first.miles !== null &&
              first.miles !== ""

              ? Number(first.miles)
                .toFixed(1) + " mi"

              : "-- mi"
            }

          </span>
        </td>

        <td>
          ${
            renderSharedButtons(
              group,
              editing
            )
          }
        </td>
      `;

      table.appendChild(tr);

    });

    tableWrap.appendChild(table);

    container.appendChild(tableWrap);

  });

}

/* ================= MAIN RENDER ================= */

function render(){

  container.innerHTML = "";

  const hasTabs =
  renderTabs();

  if(!hasTabs){
    return;
  }

  if(activeTab === "TRIPS"){

    renderIndividualTable(
      getIndividualTrips()
    );

  }

  if(activeTab === "SHARED"){

    renderSharedTable(
      getSharedGroups()
    );

  }

}

/* ================= LOAD ================= */

async function loadTrips(){

  await loadCompanyServices();

  trips =
  await fetchTrips();

  render();

}

/* ================= AUTO REFRESH ================= */

setInterval(async()=>{

  const hasEditing =
  trips.some(t=>t.__editing);

  if(hasEditing){
    return;
  }

  await loadCompanyServices();

  trips =
  await fetchTrips();

  render();

},30000);

/* ================= INIT ================= */

await loadTrips();

});