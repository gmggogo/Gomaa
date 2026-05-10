window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");

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
  .btn.small-delete{background:#ef4444;color:#fff;font-size:11px;padding:4px 7px;}

  .actions-wrap{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;min-width:140px;}
  .edit-input{width:100%;min-width:120px;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#fff;color:#111827;}
  .edit-input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.15);}
  .multi-line{white-space:pre-line;line-height:1.5;text-align:left;word-break:break-word;}

  .trip-number-badge{font-weight:900;color:#2563eb;white-space:nowrap;}
  .price-badge{font-weight:900;color:#15803d;white-space:nowrap;}
  .miles-strong{font-weight:900;color:#2563eb;white-space:nowrap;}

  .scheduled-row{background:#ffffff;color:#111827;}
  .confirmed-row{background:#dcfce7;color:#111827;}
  .cancelled-row{background:#fecaca;color:#111827;}
  .yellow{background:#fef9c3;color:#111827;}
  .red-light{background:#fecaca;color:#111827;}
  .red-mid{background:#fca5a5;color:#111827;}
  .red-dark{background:#7f1d1d;color:#ffffff;}
  .past-row{background:#374151;color:#e5e7eb;}

  @keyframes blinkTrip{0%{opacity:1;}50%{opacity:.82;}100%{opacity:1;}}
  .trip-blink{animation:blinkTrip 1.8s infinite;}

  @media(max-width:768px){
    .review-table{min-width:1350px;}
    .review-table th,.review-table td{font-size:10px;padding:5px;}
    .btn{font-size:10px;padding:5px 7px;}
    .edit-input{font-size:11px;min-width:110px;}
  }
  `;

  document.head.appendChild(style);

})();

/* ================= STATE ================= */

let activeTab = "INDIVIDUAL";
let trips = [];

/* ================= HELPERS ================= */

function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"}));
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

  // 🔥 لو الوقت HH:mm
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

  // 🔥 لو الوقت AM PM
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
    String(t.tripNumber || "").includes("SH") ||
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

/* ================= GOOGLE ================= */

let googleLoadPromise = null;

function ensureGoogleLoaded(){
  if(window.google && google.maps && google.maps.DirectionsService){
    return Promise.resolve();
  }

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async (resolve, reject)=>{
    try{
      const res = await fetch("/api/config");
      if(!res.ok) return reject(new Error("Google config not found"));

      const data = await res.json();
      if(!data.googleKey) return reject(new Error("Google key missing"));

      const existing = document.querySelector("script[data-google-maps='true']");
      if(existing){
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

async function calculateRouteMiles(points){
  await ensureGoogleLoaded();

  const cleanPoints = Array.isArray(points)
    ? points.map(p => normalizeAZ(p)).filter(Boolean)
    : [];

  if(cleanPoints.length < 2){
    return { miles:0, distanceMeters:0, durationSeconds:0, estimatedMinutes:0, googleRoute:{} };
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
        optimizeWaypoints:true,
        travelMode:google.maps.TravelMode.DRIVING,
        drivingOptions:{ departureTime:new Date() },
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

/* ================= PRICE ================= */

function calculateIndividualPrice(miles, status){
  const BASE = 20;
  const INCLUDED = 3;
  const PER_MILE = 2.5;
  const NO_SHOW = 15;

  if(status === "NoShow") return NO_SHOW;

  const totalMiles = Math.max(0, Number(miles) || 0);
  const extraMiles = Math.max(0, totalMiles - INCLUDED);

  return Number((BASE + (extraMiles * PER_MILE)).toFixed(2));
}

function calculateSharedPrice(group, miles){
  const BASE = 15;
  const INCLUDED = 3;
  const PER_MILE = 2;
  const STOP_FEE = 5;
  const NO_SHOW = 15;

  const passengers = getRealPassengersFromGroup(group);
  const activePassengers = passengers.filter(p => p.status !== "NoShow");
  const noShowPassengers = passengers.filter(p => p.status === "NoShow");

  const count = activePassengers.length;

  if(count === 0){
    return {
      total:noShowPassengers.length * NO_SHOW,
      pricePerPassenger:0,
      stopsCount:0
    };
  }

  const baseTotal = count * BASE;
  const freeMiles = count * INCLUDED;
  const totalMiles = Math.max(0, Number(miles) || 0);
  const extraMiles = Math.max(0, totalMiles - freeMiles);
  const milesCost = extraMiles * PER_MILE;
  const stopsCount = Math.max(0, count - 1);
  const stopsCost = stopsCount * STOP_FEE;
  const noShowCost = noShowPassengers.length * NO_SHOW;
  const activeTotal = baseTotal + milesCost + stopsCost;

  return {
    total:Number((activeTotal + noShowCost).toFixed(2)),
    pricePerPassenger:Number((activeTotal / count).toFixed(2)),
    stopsCount
  };
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

function sameValue(list, field){
  if(!list.length) return false;
  const first = normalizeText(list[0][field]).toLowerCase();
  return list.every(x => normalizeText(x[field]).toLowerCase() === first);
}

function buildSharedRoutePoints(group){

  const list = getRealPassengersFromGroup(group);

  const points = [];

  if(!list.length) return points;

  const added = new Set();

  function addPoint(v){

    const value =
      normalizeText(v).toLowerCase();

    if(!value) return;

    if(added.has(value)) return;

    added.add(value);

    points.push(v);
  }

  // =========================
  // SAME PICKUP ?
  // =========================

  const samePickup = list.every(p =>
    normalizeText(p.pickup).toLowerCase() ===
    normalizeText(list[0].pickup).toLowerCase()
  );

  // =========================
  // SAME DROPOFF ?
  // =========================

  const sameDropoff = list.every(p =>
    normalizeText(p.dropoff).toLowerCase() ===
    normalizeText(list[0].dropoff).toLowerCase()
  );

  // ==================================================
  // CASE 1
  // SAME PICKUP
  // pickup → nearest drop → next
  // ==================================================

  if(samePickup){

    addPoint(list[0].pickup);

    const sortedDrops = [...list].sort((a,b)=>{

      return normalizeText(a.dropoff)
        .localeCompare(normalizeText(b.dropoff));

    });

    sortedDrops.forEach(p=>{
      addPoint(p.dropoff);
    });

    return points;
  }

  // ==================================================
  // CASE 2
  // SAME DROPOFF
  // farthest pickup → nearest pickup → drop
  // ==================================================

  if(sameDropoff){

    const reversedPickups = [...list].reverse();

    reversedPickups.forEach(p=>{
      addPoint(p.pickup);
    });

    addPoint(list[0].dropoff);

    return points;
  }

  // ==================================================
  // CASE 3
  // MIXED
  // pickup/drop mixed
  // ==================================================

  list.forEach(p=>{

    addPoint(p.pickup);

    addPoint(p.dropoff);

  });

  return points;
}

/* ================= SERVER ================= */

async function fetchTrips(){
  const url = companyName
    ? "/api/trips/company/" + encodeURIComponent(companyName)
    : "/api/trips/company";

  const res = await fetch(url,{
    headers:{ Authorization:"Bearer " + token }
  });

  if(!res.ok){
    container.innerHTML = "<div>Server Error</div>";
    return [];
  }

  return await res.json();
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

/* ================= GROUPING ================= */

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

function getIndividualTrips(){

  return trips.filter(t => {

    if(isSharedTrip(t)) return false;

    const status = String(t.status || "").toLowerCase();

    return ![
      "completed",
      "noshow",
      "cancelled"
    ].includes(status);

  });

}

function getSharedGroups(){
  const map = {};

trips.filter(t => {

  if(!isSharedTrip(t)) return false;

  const status = String(t.status || "").toLowerCase();

  return ![
    "completed",
    "noshow",
    "cancelled"
  ].includes(status);

}).forEach(t=>{    const key = getSharedKey(t);
    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map)

.filter(group=>{

  const hasActive = group.some(t=>{

    const status = String(t.status || "").toLowerCase();

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
      const ai = Number(a.passengerIndex || 0);
      const bi = Number(b.passengerIndex || 0);
      return ai - bi;
    });
  });
}

/* ================= TABS ================= */

function renderTabs(){
  const tabs = document.createElement("div");
  tabs.className = "review-tabs";

  tabs.innerHTML = `
    <button id="reviewIndividualTab" class="${activeTab === "INDIVIDUAL" ? "tab-active" : "tab-inactive"}" type="button">Individual</button>
    <button id="reviewSharedTab" class="${activeTab === "SHARED" ? "tab-active" : "tab-inactive"}" type="button">Shared</button>
  `;

  container.appendChild(tabs);

  document.getElementById("reviewIndividualTab").addEventListener("click",()=>{
    activeTab = "INDIVIDUAL";
    render();
  });

  document.getElementById("reviewSharedTab").addEventListener("click",()=>{
    activeTab = "SHARED";
    render();
  });
}

/* ================= ROW COLOR ================= */

function applyRowColor(tr,t){
  const mins = minutesToTrip(t);

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
      if(t.status === "Confirmed") tr.classList.add("trip-blink");
    }else if(mins <= 60){
      tr.classList.add("red-mid");
      if(t.status === "Confirmed") tr.classList.add("trip-blink");
    }else if(mins <= 120){
      tr.classList.add("red-light");
    }else if(mins <= 180){
      tr.classList.add("yellow");
    }else if(t.status === "Confirmed"){
      tr.classList.add("confirmed-row");
    }else{
      tr.classList.add("scheduled-row");
    }
  }
}

/* ================= INDIVIDUAL RENDER ================= */

function renderIndividualButtons(t, editing){
  const mins = minutesToTrip(t);

  if(editing){
    return `
      <div class="actions-wrap">
<button class="btn confirm-green" data-action="save-individual">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(t.status === "Cancelled") return "";

  if(mins > 120 || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit">Edit</button>
        <button class="btn delete" data-action="delete">Delete</button>
<button class="btn ${t.status === "Confirmed" ? "confirm-yellow" : "confirm-green"}" data-action="confirm-individual">Confirm</button>
      </div>
    `;
  }

  if(mins <= 120 && mins > 0 && t.status === "Scheduled"){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="confirm-individual">Confirm</button>
        <button class="btn cancel" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  if(mins <= 120 && mins > 0 && t.status === "Confirmed"){
    return `
      <div class="actions-wrap">
        <button class="btn cancel" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  return "";
}

function renderIndividualTable(list){
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
        <th>#</th>
        <th>Trip#</th>
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
      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      const editing = t.__editing === true;
      applyRowColor(tr,t);

      const stops = Array.isArray(t.stops) ? t.stops : [];

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(getTripNumber(t))}</span></td>
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
        <td><span class="price-badge">$${formatMoney(t.priceAmount)}</span></td>
        <td><span class="miles-strong">${
          t.miles !== undefined && t.miles !== null && t.miles !== ""
            ? Number(t.miles).toFixed(1) + " mi"
            : "-- mi"
        }</span></td>
        <td>${renderIndividualButtons(t, editing)}</td>
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
    empty.style.color = "#0f172a";
    empty.innerText = "No individual trips found.";
    container.appendChild(empty);
  }
}

/* ================= SHARED RENDER ================= */

function getGroupStatus(group){
  if(group.every(t=>t.status === "Cancelled")) return "Cancelled";
  if(group.every(t=>t.status === "Confirmed")) return "Confirmed";
  if(group.some(t=>t.status === "Confirmed")) return "Partially Confirmed";
  return group[0]?.status || "Scheduled";
}

function getGroupPrice(group){
  const firstWithPrice = group.find(t=>Number(t.priceAmount || 0) > 0);
  return firstWithPrice ? Number(firstWithPrice.priceAmount || 0) : 0;
}

function renderSharedButtons(group, editing){
  const first = group[0];
  const mins = minutesToTrip(first);
  const status = getGroupStatus(group);

  if(editing){
    return `
      <div class="actions-wrap">
   <button class="btn confirm-green" data-action="save-shared">Save</button>     
   <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(status === "Cancelled") return "";

  if(mins > 120 || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-shared">Edit</button>
        <button class="btn delete" data-action="delete-shared">Delete</button>
<button class="btn ${status === 'Confirmed' ? 'confirm-yellow' : 'confirm-green'}" data-action="confirm-shared">Confirm</button>   

   </div>
    `;
  }

  if(mins <= 120 && mins > 0 && status === "Scheduled"){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="confirm-shared">Confirm</button>
        <button class="btn cancel" data-action="cancel-shared">Cancel</button>
      </div>
    `;
  }

  if(mins <= 120 && mins > 0 && status === "Confirmed"){
    return `
      <div class="actions-wrap">
        <button class="btn cancel" data-action="cancel-shared">Cancel</button>
      </div>
    `;
  }

  return "";
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
        <th>#</th>
        <th>Trip#</th>
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
      const first = group[0];
      const tr = document.createElement("tr");
      tr.dataset.groupId = getSharedKey(first);

      const editing = first.__editing === true;
      applyRowColor(tr, first);

      const passengers = getRealPassengersFromGroup(group);

      let clients = "";
      let phones = "";
      let pickups = "";
      let drops = "";

      if(editing){
        clients = passengers.map((p,idx)=>createSharedEditInput(p.name || p.clientName || "", first._id, `passenger_${idx}_name`)).join("\n");
        phones  = passengers.map((p,idx)=>createSharedEditInput(p.phone || p.clientPhone || "", first._id, `passenger_${idx}_phone`)).join("\n");
        pickups = passengers.map((p,idx)=>createSharedEditInput(p.pickup || "", first._id, `passenger_${idx}_pickup`)).join("\n");
        drops   = passengers.map((p,idx)=>createSharedEditInput(p.dropoff || "", first._id, `passenger_${idx}_dropoff`)).join("\n");
      }else{
        clients = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.name || p.clientName || "")}`).join("\n");
        phones  = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.phone || p.clientPhone || "")}`).join("\n");
        pickups = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.pickup || "")}`).join("\n");
        drops   = passengers.map((p,idx)=>`${idx+1}. ${escapeHtml(p.dropoff || "")}`).join("\n");
      }

      const notes = editing
        ? createSharedEditInput(first.notes || "", first._id, "notes")
        : `<div class="multi-line">${escapeHtml(first.notes || "")}</div>`;

      const stopsCount = Math.max(0, passengers.length - 1);

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(getTripNumber(first))}</span></td>
        <td>${editing ? createSharedEditInput(first.entryName || "", first._id, "entryName") : escapeHtml(first.entryName || "")}</td>
        <td>${editing ? createSharedEditInput(first.entryPhone || "", first._id, "entryPhone") : escapeHtml(first.entryPhone || "")}</td>
        <td><div class="multi-line">${clients}</div></td>
        <td><div class="multi-line">${phones}</div></td>
        <td><div class="multi-line">${pickups}</div></td>
        <td><strong>${stopsCount}</strong></td>
        <td><div class="multi-line">${drops}</div></td>
        <td>${notes}</td>
        <td>${editing ? createSharedEditInput(first.tripDate || "", first._id, "tripDate", "date") : escapeHtml(first.tripDate || "")}</td>
        <td>${editing ? createSharedEditInput(first.tripTime || "", first._id, "tripTime", "time") : escapeHtml(first.tripTime || "")}</td>
        <td><strong>${escapeHtml(getGroupStatus(group))}</strong></td>
        <td><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td>
        <td><span class="miles-strong">${
          first.miles !== undefined && first.miles !== null && first.miles !== ""
            ? Number(first.miles).toFixed(1) + " mi"
            : "-- mi"
        }</span></td>
        <td>${renderSharedButtons(group, editing)}</td>
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
    empty.style.color = "#0f172a";
    empty.innerText = "No shared trips found.";
    container.appendChild(empty);
  }
}

/* ================= MAIN RENDER ================= */

function render(){
  container.innerHTML = "";
  renderTabs();

  if(activeTab === "INDIVIDUAL"){
    renderIndividualTable(getIndividualTrips());
  }else{
    renderSharedTable(getSharedGroups());
  }
}

/* ================= ACTIONS ================= */

container.addEventListener("click", async e=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const action = btn.dataset.action;

  try{

    /* ================= EDIT INDIVIDUAL ================= */

    if(action === "edit"){

      const tr = btn.closest("tr");
      const id = tr.dataset.id;

      const trip = trips.find(t=>t._id === id);
      if(!trip) return;
const mins = minutesToTrip(trip);

if(mins !== null && mins <= 120 && mins > 0){

  const ok = confirm(
    "This trip is within 120 minutes.\n\nCancellation fee may apply.\n\nDo you want to continue editing?"
  );

  if(!ok) return;
}
      trip.status = "Scheduled";

      trip.priceAmount = 0;
      trip.miles = 0;
      trip.distanceMeters = 0;
      trip.durationSeconds = 0;
      trip.estimatedMinutes = 0;

      delete trip.googleRoute;
      delete trip.routePoints;

      trip.__editing = true;

      await updateTrip(id,{
        status:"Scheduled",
        priceAmount:0,
        miles:0,
        distanceMeters:0,
        durationSeconds:0,
        estimatedMinutes:0,
        googleRoute:null,
        routePoints:[]
      });

      trips = await fetchTrips();

      const updatedTrip = trips.find(t=>t._id === id);

      if(updatedTrip){
        updatedTrip.__editing = true;
      }

      render();
      return;
    }

    /* ================= EDIT SHARED ================= */

    if(action === "edit-shared"){

      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;

      const group = getSharedGroups().find(
        g => getSharedKey(g[0]) === groupId
      );

      if(!group) return;

      btn.disabled = true;
      btn.textContent = "Loading...";

      for(const t of group){

        t.status = "Scheduled";

        t.priceAmount = 0;
        t.pricePerPassenger = 0;

        t.miles = 0;
        t.distanceMeters = 0;
        t.durationSeconds = 0;
        t.estimatedMinutes = 0;

        delete t.googleRoute;
        delete t.routePoints;
        delete t.optimizedRoute;

        t.__editing = true;

        await updateTrip(t._id,{
          status:"Scheduled",
          priceAmount:0,
          pricePerPassenger:0,
          miles:0,
          distanceMeters:0,
          durationSeconds:0,
          estimatedMinutes:0,
          googleRoute:null,
          routePoints:[],
          optimizedRoute:null
        });

      }

      trips = await fetchTrips();

      const refreshedGroup = getSharedGroups().find(
        g => getSharedKey(g[0]) === groupId
      );

      if(refreshedGroup){

        refreshedGroup.forEach(t=>{
          t.__editing = true;
        });

      }

      render();
      return;
    }

    /* ================= CANCEL EDIT ================= */

    if(action === "cancel-edit"){

      trips = await fetchTrips();
      render();
      return;
    }

    /* ================= DELETE INDIVIDUAL ================= */

    if(action === "delete"){

      const tr = btn.closest("tr");
      const id = tr.dataset.id;

      if(!id) return;

      const ok = confirm("Delete this trip?");
      if(!ok) return;

      await deleteTrip(id);

      trips = await fetchTrips();
      render();
      return;
    }

    /* ================= DELETE SHARED ================= */

    if(action === "delete-shared"){

      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;

      const group = getSharedGroups().find(
        g => getSharedKey(g[0]) === groupId
      );

      if(!group) return;

      const ok = confirm("Delete this shared trip?");
      if(!ok) return;

      for(const t of group){
        await deleteTrip(t._id);
      }

      trips = await fetchTrips();
      render();
      return;
    }

  /* ================= SAVE INDIVIDUAL ================= */

if(action === "save-individual"){

  const tr = btn.closest("tr");
  const id = tr.dataset.id;

  const original = trips.find(t=>t._id === id);
  if(!original) return;

  // 🔥 WARNING IF WITHIN 120 MINUTES
// 🔥 GET DATE/TIME FROM INPUTS
const dateInput = tr.querySelector('[data-field="tripDate"]');
const timeInput = tr.querySelector('[data-field="tripTime"]');

const editedDate = dateInput
  ? dateInput.value
  : original.tripDate;

const editedTime = timeInput
  ? timeInput.value
  : original.tripTime;

const editedTripDate = parseTripDateTime(
  editedDate,
  editedTime
);

let mins = null;

if(editedTripDate){
  mins = (editedTripDate - getAZNow()) / 60000;
}

if(mins !== null && mins <= 120){

  const ok = confirm(
    "WARNING:\n\nThis trip is within 120 minutes.\nCancellation fee may apply.\n\nDo you want to save changes?"
  );

  if(!ok){
    return;
  }

}

  const payload = {};

  const stops = Array.isArray(original.stops)
    ? [...original.stops]
    : [];

  tr.querySelectorAll(".edit-input").forEach(input=>{

    const field = input.dataset.field;
    const stopIndex = input.dataset.stopIndex;

    if(stopIndex !== undefined){

      stops[Number(stopIndex)] =
        normalizeAZ(input.value.trim());

      return;
    }

    if(field === "pickup" || field === "dropoff"){

      payload[field] =
        normalizeAZ(input.value);

    }else{

      payload[field] = input.value;

    }

  });

  payload.stops = stops;

  payload.status = "Scheduled";
  payload.priceAmount = 0;

  payload.miles = 0;
  payload.distanceMeters = 0;
  payload.durationSeconds = 0;
  payload.estimatedMinutes = 0;

  payload.googleRoute = null;
  payload.routePoints = [];

  await updateTrip(id,payload);

  trips = await fetchTrips();
  render();
  return;
}

/* ================= SAVE SHARED ================= */

if(action === "save-shared"){

  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;

  const group = getSharedGroups().find(
    g => getSharedKey(g[0]) === groupId
  );

  if(!group) return;

  /* 🔥 GET DATE/TIME FROM INPUTS */

  const dateInput = tr.querySelector('[data-field="tripDate"]');
  const timeInput = tr.querySelector('[data-field="tripTime"]');

  const editedDate = dateInput
    ? dateInput.value
    : group[0].tripDate;

  const editedTime = timeInput
    ? timeInput.value
    : group[0].tripTime;

  const editedTripDate = parseTripDateTime(
    editedDate,
    editedTime
  );

  let mins = null;

  if(editedTripDate){
    mins = (editedTripDate - getAZNow()) / 60000;
  }

  if(mins !== null && mins <= 120){

    const ok = confirm(
      "WARNING:\n\nThis shared trip is within 120 minutes.\nCancellation fee may apply.\n\nDo you want to save changes?"
    );

    if(!ok){
      return;
    }

  }

  const passengers = getRealPassengersFromGroup(group)
    .map(p=>({...p}));

  const payload = {};

  tr.querySelectorAll(".edit-input").forEach(input=>{

    const field = input.dataset.field;

    if(field && field.startsWith("passenger_")){

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
        passengers[index].pickup =
          normalizeAZ(input.value);
      }

      if(key === "dropoff"){
        passengers[index].dropoff =
          normalizeAZ(input.value);
      }

      return;
    }

    if(
      field === "tripDate" ||
      field === "tripTime" ||
      field === "entryName" ||
      field === "entryPhone" ||
      field === "notes"
    ){
      payload[field] = input.value;
    }

  });

  payload.passengers = passengers;

  payload.totalPassengers =
    passengers.length;

  payload.pickup =
    passengers[0]?.pickup || "";

  payload.dropoff =
    passengers[passengers.length - 1]?.dropoff || "";

  payload.clientName = "Shared Trip";

  payload.clientPhone =
    passengers[0]?.phone ||
    passengers[0]?.clientPhone ||
    "";

  payload.status = "Scheduled";

  payload.priceAmount = 0;
  payload.pricePerPassenger = 0;

  payload.miles = 0;
  payload.distanceMeters = 0;
  payload.durationSeconds = 0;
  payload.estimatedMinutes = 0;

  payload.googleRoute = null;
  payload.routePoints = [];
  payload.optimizedRoute = null;

  payload.isShared = true;
  payload.tripType = "SHARED";

  for(const t of group){

    await updateTrip(t._id,{
      ...payload
    });

  }

  trips = await fetchTrips();
  render();
  return;
} 

   /* ================= CONFIRM INDIVIDUAL ================= */

    if(action === "confirm-individual"){

      const tr = btn.closest("tr");
      const id = tr.dataset.id;

      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      btn.disabled = true;
      btn.textContent = "Calculating...";

      const routePoints =
        buildIndividualRoutePoints(trip);

      const routeData =
        await calculateRouteMiles(routePoints);

      if(!routeData.miles || routeData.miles <= 0){
        throw new Error("Invalid route data");
      }

      const payload = {

        priceAmount:
          calculateIndividualPrice(
            routeData.miles,
            trip.status
          ),

        miles:routeData.miles,

        distanceMeters:
          routeData.distanceMeters,

        durationSeconds:
          routeData.durationSeconds,

        estimatedMinutes:
          routeData.estimatedMinutes,

        googleRoute:
          routeData.googleRoute,

        routePoints:routePoints,

        status:"Confirmed"
      };

      await updateTrip(id,payload);

      trips = await fetchTrips();
      render();
      return;
    }

    /* ================= CONFIRM SHARED ================= */

    if(action === "confirm-shared"){

      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;

      const group = getSharedGroups().find(
        g => getSharedKey(g[0]) === groupId
      );

      if(!group) return;

      btn.disabled = true;
      btn.textContent = "Calculating...";

      const routePoints =
        buildSharedRoutePoints(group);

      const routeData =
        await calculateRouteMiles(routePoints);

      if(!routeData.miles || routeData.miles <= 0){
        throw new Error("Invalid route data");
      }

      const sharedPrice =
        calculateSharedPrice(
          group,
          routeData.miles
        );

      const payload = {

        priceAmount:
          sharedPrice.total,

        pricePerPassenger:
          sharedPrice.pricePerPassenger,

        sharedStopsCount:
          sharedPrice.stopsCount,

        miles:
          routeData.miles,

        distanceMeters:
          routeData.distanceMeters,

        durationSeconds:
          routeData.durationSeconds,

        estimatedMinutes:
          routeData.estimatedMinutes,

        googleRoute:
          routeData.googleRoute,

        routePoints:
          routePoints,

        optimizedRoute:
          routeData.googleRoute,

        status:"Confirmed",

        isShared:true,
        tripType:"SHARED"
      };

      for(const t of group){

        await updateTrip(t._id,{
          ...payload
        });

      }

      trips = await fetchTrips();
      render();
      return;
    }

    /* ================= CANCEL INDIVIDUAL ================= */

    if(action === "cancel"){

      const tr = btn.closest("tr");
      const id = tr.dataset.id;

      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      const mins = minutesToTrip(trip);

      let finalPrice = 0;

      if(mins !== null && mins > 0 && mins <= 120){
        finalPrice = 15;
      }

      await updateTrip(id,{
        status:"Cancelled",
        priceAmount:finalPrice
      });

      trips = await fetchTrips();
      render();
      return;
    }

    /* ================= CANCEL SHARED ================= */

    if(action === "cancel-shared"){

      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;

      const group = getSharedGroups().find(
        g => getSharedKey(g[0]) === groupId
      );

      if(!group) return;

      const first = group[0];

      const mins = minutesToTrip(first);

      let finalPrice = 0;

      if(mins !== null && mins > 0 && mins <= 120){
        finalPrice = 15;
      }

      for(const t of group){

        await updateTrip(t._id,{
          status:"Cancelled",
          priceAmount:finalPrice
        });

      }

      trips = await fetchTrips();
      render();
      return;
    }

  }catch(err){

    alert(err.message || "Server Error");

    console.error(err);

    trips = await fetchTrips();
    render();

  }

});

/* ================= INIT ================= */

async function loadTrips(){
  trips = await fetchTrips();
  render();
}

await loadTrips();

/* ================= AUTO REFRESH ================= */

setInterval(async()=>{
  const hasEditing = trips.some(t=>t.__editing);
  if(hasEditing) return;

  trips = await fetchTrips();
  render();
},30000);

});