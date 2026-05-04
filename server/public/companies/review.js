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

  .review-tabs{
    display:flex;
    gap:10px;
    margin:0 0 20px;
    background:#e2e8f0;
    padding:6px;
    border-radius:14px;
  }

  .review-tabs button{
    flex:1;
    padding:13px;
    border:none;
    border-radius:11px;
    font-size:14px;
    font-weight:700;
    cursor:pointer;
  }

  .tab-active{
    background:#2563eb;
    color:#fff;
  }

  .tab-inactive{
    background:#64748b;
    color:#fff;
  }

  .review-table{
    width:100%;
    border-collapse:collapse;
    margin-bottom:20px;
    background:#fff;
  }

  .review-table th,
  .review-table td{
    border:1px solid #dbe2ea;
    padding:8px;
    text-align:center;
    font-size:14px;
    vertical-align:middle;
  }

  .review-table th{
    background:#0f172a;
    color:#fff;
  }

  .date-title{
    font-size:18px;
    font-weight:700;
    margin:20px 0 10px;
    color:#0f172a;
  }

  .btn{
    border:none;
    padding:6px 10px;
    border-radius:6px;
    font-size:13px;
    font-weight:700;
    cursor:pointer;
    margin:2px;
    white-space:nowrap;
  }

  .btn.edit{background:#2563eb;color:#fff;}
  .btn.delete{background:#111827;color:#fff;}
  .btn.confirm{background:#16a34a;color:#fff;}
  .btn.cancel{background:#dc2626;color:#fff;}
  .btn.small-delete{background:#ef4444;color:#fff;font-size:11px;padding:4px 7px;}

  .actions-wrap{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:6px;
    flex-wrap:wrap;
  }

  .edit-input{
    width:100%;
    box-sizing:border-box;
    padding:6px;
    border:1px solid #cbd5e1;
    border-radius:6px;
    font-size:13px;
  }

  .multi-line{
    white-space:pre-line;
    line-height:1.65;
    text-align:left;
  }

  .trip-number-badge{
    display:inline-block;
    background:#0ea5e9;
    color:#fff;
    padding:6px 10px;
    border-radius:8px;
    font-weight:800;
  }

  .price-badge{
    display:inline-block;
    background:#bbf7d0;
    color:#14532d;
    padding:6px 10px;
    border-radius:8px;
    font-weight:900;
    box-shadow:0 0 12px rgba(34,197,94,.35);
  }

  .scheduled-row{
    background:#ffffff;
    color:#111827;
  }

  .confirmed-row{
    background:#22c55e;
    color:#111827;
  }

  .cancelled-row{
    background:#ef4444;
    color:#111827;
  }

  .yellow{
    background:#fde047;
    color:#111827;
  }

  .red-light{
    background:#fecaca;
    color:#111827;
  }

  .red-mid{
    background:#f87171;
    color:#111827;
  }

  .red-dark{
    background:#7f1d1d;
    color:#ffffff;
  }

  .past-row{
    background:#374151;
    color:#e5e7eb;
  }

  @keyframes blinkTrip{
    0%   { opacity:1; }
    50%  { opacity:.82; }
    100% { opacity:1; }
  }

  .trip-blink{
    animation:blinkTrip 1.8s infinite;
  }

  @media(max-width:768px){
    .review-table th,
    .review-table td{
      font-size:11px;
      padding:6px;
    }
  }

  `;

  document.head.appendChild(style);

})();

/* ================= STATE ================= */

let activeTab = "INDIVIDUAL";
let trips = [];

/* ================= HELPERS ================= */

function getAZNow(){
  return new Date(
    new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
  );
}

function getTripDateTime(t){
  if(!t.tripDate || !t.tripTime) return null;
  const dt = new Date(t.tripDate + "T" + t.tripTime + ":00");
  return String(dt) === "Invalid Date" ? null : dt;
}

function minutesToTrip(t){
  const dt = getTripDateTime(t);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function normalizeText(v){
  return String(v ?? "").trim();
}

function formatMoney(value){
  return Number(value || 0).toFixed(2);
}

function isSharedTrip(t){
  return (
    t.isShared === true ||
    t.tripType === "SHARED" ||
    String(t.tripNumber || "").includes("SH") ||
    normalizeText(t.groupId) !== ""
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
      if(!res.ok){
        reject(new Error("Google config not found"));
        return;
      }

      const data = await res.json();
      if(!data.googleKey){
        reject(new Error("Google key missing"));
        return;
      }

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

function normalizeAZ(address){
  const v = normalizeText(address);
  const lower = v.toLowerCase();

  if(
    lower.includes(" az") ||
    lower.includes(",az") ||
    lower.includes("arizona")
  ){
    return v;
  }

  return v + ", AZ, USA";
}

async function calculateRouteMiles(points){
  await ensureGoogleLoaded();

  if(!Array.isArray(points) || points.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };
  }

  const cleanPoints = points.map(normalizeText).filter(Boolean);

  if(cleanPoints.length < 2){
    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };
  }

  const origin = normalizeAZ(cleanPoints[0]);
  const destination = normalizeAZ(cleanPoints[cleanPoints.length - 1]);
  const middle = cleanPoints.slice(1, -1);

  const waypoints = middle.map(address => ({
    location: normalizeAZ(address),
    stopover:true
  }));

  return new Promise((resolve, reject)=>{
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
        if(status !== "OK" || !response || !response.routes || !response.routes[0]){
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

        const miles = Number((meters * 0.000621371).toFixed(2));

        resolve({
          miles,
          distanceMeters:meters,
          durationSeconds:seconds,
          estimatedMinutes:Math.ceil(seconds / 60),
          googleRoute:{
            overviewPolyline:route.overview_polyline ? route.overview_polyline.points : "",
            summary:route.summary || "",
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

  if(status === "NoShow"){
    return NO_SHOW;
  }

  const extra = Math.max(0, Number(miles || 0) - INCLUDED);
  return Number((BASE + (extra * PER_MILE)).toFixed(2));
}

function calculateSharedPrice(group, miles){
  const BASE = 15;
  const INCLUDED = 3;
  const PER_MILE = 2;
  const STOP_FEE = 5;
  const NO_SHOW = 15;

  const count = group.length || 1;
  const stopsCount = Math.max(0, count - 1);
  const extra = Math.max(0, Number(miles || 0) - INCLUDED);

  let total = BASE + (extra * PER_MILE) + (stopsCount * STOP_FEE);

  group.forEach(t=>{
    if(t.status === "NoShow"){
      total += NO_SHOW;
    }
  });

  total = Number(total.toFixed(2));

  return {
    total,
    pricePerPassenger:Number((total / count).toFixed(2)),
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
  const list = Array.isArray(group) ? group : [];
  const points = [];

  if(!list.length) return points;

  const samePickup = sameValue(list, "pickup");
  const sameDropoff = sameValue(list, "dropoff");

  if(samePickup){
    points.push(list[0].pickup);
    list.forEach(t=>{
      if(normalizeText(t.dropoff)) points.push(t.dropoff);
    });
    return points;
  }

  if(sameDropoff){
    list.forEach(t=>{
      if(normalizeText(t.pickup)) points.push(t.pickup);
    });
    points.push(list[0].dropoff);
    return points;
  }

  list.forEach(t=>{
    if(normalizeText(t.pickup)) points.push(t.pickup);
  });

  list.forEach(t=>{
    if(normalizeText(t.dropoff)) points.push(t.dropoff);
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Update failed");
  }

  return await res.json().catch(() => null);
}

async function deleteTrip(id){

  const res = await fetch("/api/trips/" + id,{
    method:"DELETE",
    headers:{ Authorization:"Bearer " + token }
  });

  if(!res.ok){
    const err = await res.json().catch(() => ({}));
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
  return trips.filter(t => !isSharedTrip(t));
}

function getSharedGroups(){
  const map = {};

  trips
    .filter(t => isSharedTrip(t))
    .forEach(t=>{
      const key = getSharedKey(t);

      if(!map[key]) map[key] = [];
      map[key].push(t);
    });

  return Object.values(map).map(group=>{
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
    <button id="reviewIndividualTab" class="${activeTab === "INDIVIDUAL" ? "tab-active" : "tab-inactive"}" type="button">
      Individual
    </button>
    <button id="reviewSharedTab" class="${activeTab === "SHARED" ? "tab-active" : "tab-inactive"}" type="button">
      Shared
    </button>
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

function applyRowColor(tr, t){
  const mins = minutesToTrip(t);

  if(t.status === "Cancelled"){
    tr.classList.add("cancelled-row");
  }
  else if(mins !== null && mins <= 0){
    tr.classList.add("past-row");
  }
  else{
    if(mins !== null){
      if(mins <= 30){
        tr.classList.add("red-dark");
        if(t.status === "Confirmed"){
          tr.classList.add("trip-blink");
        }
      }
      else if(mins <= 60){
        tr.classList.add("red-mid");
        if(t.status === "Confirmed"){
          tr.classList.add("trip-blink");
        }
      }
      else if(mins <= 120){
        tr.classList.add("red-light");
      }
      else if(mins <= 180){
        tr.classList.add("yellow");
      }
      else{
        if(t.status === "Confirmed"){
          tr.classList.add("confirmed-row");
        }else{
          tr.classList.add("scheduled-row");
        }
      }
    }
  }
}

/* ================= INDIVIDUAL RENDER ================= */

function renderIndividualButtons(t, editing){
  const mins = minutesToTrip(t);

  if(editing){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-individual">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(t.status === "Cancelled"){
    return "";
  }

  if(mins > 120 || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit">Edit</button>
        <button class="btn delete" data-action="delete">Delete</button>
        <button class="btn confirm" data-action="confirm-individual">Confirm</button>
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
        <th>Drop</th>
        <th>Stops</th>
        <th>Notes</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Price</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      const editing = t.__editing === true;
      applyRowColor(tr, t);

      const stops = Array.isArray(t.stops) ? t.stops : [];

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(getTripNumber(t))}</span></td>
        <td>${editing ? createEditInput(t.entryName || "", "entryName") : escapeHtml(t.entryName || "")}</td>
        <td>${editing ? createEditInput(t.entryPhone || "", "entryPhone") : escapeHtml(t.entryPhone || "")}</td>
        <td>${editing ? createEditInput(t.clientName || "", "clientName") : `<div class="multi-line">${escapeHtml(t.clientName || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.clientPhone || "", "clientPhone") : `<div class="multi-line">${escapeHtml(t.clientPhone || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.pickup || "", "pickup") : `<div class="multi-line">${escapeHtml(t.pickup || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.dropoff || "", "dropoff") : `<div class="multi-line">${escapeHtml(t.dropoff || "")}</div>`}</td>
        <td>${
          editing
            ? stops.map((s,si)=>`<input class="edit-input" data-stop-index="${si}" value="${escapeHtml(s)}">`).join("")
            : `<div class="multi-line">${stops.map(s=>escapeHtml(s)).join("\n")}</div>`
        }</td>
        <td>${editing ? createEditInput(t.notes || "", "notes") : `<div class="multi-line">${escapeHtml(t.notes || "")}</div>`}</td>
        <td>${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : escapeHtml(t.tripDate || "")}</td>
        <td>${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : escapeHtml(t.tripTime || "")}</td>
        <td>${escapeHtml(t.status || "")}</td>
        <td><span class="price-badge">$${formatMoney(t.priceAmount)}</span></td>
        <td>${renderIndividualButtons(t, editing)}</td>
      `;

      table.appendChild(tr);

    });

    container.appendChild(table);

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
  const firstWithPrice = group.find(t => Number(t.priceAmount || 0) > 0);
  return firstWithPrice ? Number(firstWithPrice.priceAmount || 0) : 0;
}

function renderSharedButtons(group, editing){
  const first = group[0];
  const mins = minutesToTrip(first);
  const status = getGroupStatus(group);

  if(editing){
    return `
      <div class="actions-wrap">
        <button class="btn confirm" data-action="save-shared">Save</button>
        <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
      </div>
    `;
  }

  if(status === "Cancelled"){
    return "";
  }

  if(mins > 120 || mins === null){
    return `
      <div class="actions-wrap">
        <button class="btn edit" data-action="edit-shared">Edit</button>
        <button class="btn delete" data-action="delete-shared">Delete</button>
        <button class="btn confirm" data-action="confirm-shared">Confirm</button>
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

  const flatForDates = groups.map(g => g[0]).filter(Boolean);
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
        <th>Drop</th>
        <th>Stops</th>
        <th>Notes</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Price</th>
        <th>Actions</th>
      </tr>
    `;

    dateGroups[date].forEach((group,i)=>{

      const first = group[0];
      const tr = document.createElement("tr");
      tr.dataset.groupId = getSharedKey(first);

      const editing = first.__editing === true;

      applyRowColor(tr, first);

      const clients = group.map((t,idx)=>{
        if(editing){
          return createSharedEditInput(t.clientName || "", t._id, "clientName");
        }
        return `${idx+1}. ${escapeHtml(t.clientName || "")}`;
      }).join("\n");

      const phones = group.map((t,idx)=>{
        if(editing){
          return createSharedEditInput(t.clientPhone || "", t._id, "clientPhone");
        }
        return `${idx+1}. ${escapeHtml(t.clientPhone || "")}`;
      }).join("\n");

      const pickups = group.map((t,idx)=>{
        if(editing){
          return createSharedEditInput(t.pickup || "", t._id, "pickup");
        }
        return `${idx+1}. ${escapeHtml(t.pickup || "")}`;
      }).join("\n");

      const drops = group.map((t,idx)=>{
        if(editing){
          return `
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
              ${createSharedEditInput(t.dropoff || "", t._id, "dropoff")}
              <button class="btn small-delete" data-action="delete-shared-passenger" data-trip-id="${t._id}" type="button">Delete</button>
            </div>
          `;
        }
        return `${idx+1}. ${escapeHtml(t.dropoff || "")}`;
      }).join("\n");

      const notes = editing
        ? createSharedEditInput(first.notes || "", first._id, "notes")
        : `<div class="multi-line">${escapeHtml(first.notes || "")}</div>`;

      const stopsCount = Math.max(0, group.length - 1);

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(getTripNumber(first))}</span></td>
        <td>${editing ? createSharedEditInput(first.entryName || "", first._id, "entryName") : escapeHtml(first.entryName || "")}</td>
        <td>${editing ? createSharedEditInput(first.entryPhone || "", first._id, "entryPhone") : escapeHtml(first.entryPhone || "")}</td>
        <td><div class="multi-line">${clients}</div></td>
        <td><div class="multi-line">${phones}</div></td>
        <td><div class="multi-line">${pickups}</div></td>
        <td><div class="multi-line">${drops}</div></td>
        <td><strong>${stopsCount}</strong></td>
        <td>${notes}</td>
        <td>${editing ? createSharedEditInput(first.tripDate || "", first._id, "tripDate", "date") : escapeHtml(first.tripDate || "")}</td>
        <td>${editing ? createSharedEditInput(first.tripTime || "", first._id, "tripTime", "time") : escapeHtml(first.tripTime || "")}</td>
        <td>${escapeHtml(getGroupStatus(group))}</td>
        <td><span class="price-badge">$${formatMoney(getGroupPrice(group))}</span></td>
        <td>${renderSharedButtons(group, editing)}</td>
      `;

      table.appendChild(tr);

    });

    container.appendChild(table);

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

    /* INDIVIDUAL ACTIONS */

    if(action === "edit"){
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      trip.__editing = true;
      render();
      return;
    }

    if(action === "save-individual"){
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      const inputs = tr.querySelectorAll(".edit-input");

      inputs.forEach(input=>{
        const field = input.dataset.field;
        const stopIndex = input.dataset.stopIndex;

        if(stopIndex !== undefined){
          if(!Array.isArray(trip.stops)) trip.stops = [];
          trip.stops[Number(stopIndex)] = input.value;
          return;
        }

        trip[field] = input.value;
      });

      const newTrip = new Date(normalizeText(trip.tripDate) + "T" + normalizeText(trip.tripTime) + ":00");
      const now = getAZNow();

      if(isNaN(newTrip.getTime())){
        alert("Invalid date/time");
        return;
      }

      if(newTrip <= now){
        alert("Cannot set trip in the past ❌");
        return;
      }

      trip.status = "Scheduled";
      trip.priceAmount = 0;
      trip.__editing = false;

      await updateTrip(id, trip);

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "confirm-individual"){
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      btn.disabled = true;
      btn.textContent = "Calculating...";

      const routePoints = buildIndividualRoutePoints(trip);
      const routeData = await calculateRouteMiles(routePoints);

      trip.priceAmount = calculateIndividualPrice(routeData.miles, trip.status);
      trip.miles = routeData.miles;
      trip.distanceMeters = routeData.distanceMeters;
      trip.durationSeconds = routeData.durationSeconds;
      trip.estimatedMinutes = routeData.estimatedMinutes;
      trip.googleRoute = routeData.googleRoute;
      trip.status = "Confirmed";

      await updateTrip(id, trip);

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "cancel"){
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      await updateTrip(id,{ ...trip, status:"Cancelled" });

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "delete"){
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const ok = confirm("Delete this trip?");
      if(!ok) return;

      await deleteTrip(id);

      trips = await fetchTrips();
      render();
      return;
    }

    /* SHARED ACTIONS */

    if(action === "edit-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      group.forEach(t=>{
        const real = trips.find(x=>x._id === t._id);
        if(real) real.__editing = true;
      });

      render();
      return;
    }

    if(action === "save-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      const inputs = tr.querySelectorAll(".edit-input");
      const updateMap = {};

      group.forEach(t=>{
        updateMap[t._id] = { ...t };
      });

      inputs.forEach(input=>{
        const tripId = input.dataset.tripId;
        const field = input.dataset.field;

        if(!tripId || !field) return;
        if(!updateMap[tripId]) return;

        updateMap[tripId][field] = input.value;
      });

      const updatedTrips = Object.values(updateMap);

      const firstDate = normalizeText(updatedTrips[0]?.tripDate);
      const firstTime = normalizeText(updatedTrips[0]?.tripTime);
      const newTrip = new Date(firstDate + "T" + firstTime + ":00");
      const now = getAZNow();

      if(isNaN(newTrip.getTime())){
        alert("Invalid date/time");
        return;
      }

      if(newTrip <= now){
        alert("Cannot set trip in the past ❌");
        return;
      }

      for(const t of updatedTrips){
        t.status = "Scheduled";
        t.priceAmount = 0;
        t.pricePerPassenger = 0;
        t.isShared = true;
        t.tripType = "SHARED";
        t.__editing = false;
        await updateTrip(t._id, t);
      }

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "confirm-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      btn.disabled = true;
      btn.textContent = "Calculating...";

      const routePoints = buildSharedRoutePoints(group);
      const routeData = await calculateRouteMiles(routePoints);
      const sharedPrice = calculateSharedPrice(group, routeData.miles);

      for(const t of group){
        t.priceAmount = sharedPrice.total;
        t.pricePerPassenger = sharedPrice.pricePerPassenger;
        t.sharedStopsCount = sharedPrice.stopsCount;
        t.miles = routeData.miles;
        t.distanceMeters = routeData.distanceMeters;
        t.durationSeconds = routeData.durationSeconds;
        t.estimatedMinutes = routeData.estimatedMinutes;
        t.googleRoute = routeData.googleRoute;
        t.status = "Confirmed";
        t.isShared = true;
        t.tripType = "SHARED";

        await updateTrip(t._id, t);
      }

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "cancel-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      for(const t of group){
        await updateTrip(t._id,{ ...t, status:"Cancelled" });
      }

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "delete-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
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

    if(action === "delete-shared-passenger"){
      const tripId = btn.dataset.tripId;
      const trip = trips.find(t=>t._id === tripId);
      if(!trip) return;

      const group = getSharedGroups().find(g => g.some(x=>x._id === tripId));
      if(group && group.length <= 2){
        alert("Shared trip must have at least 2 passengers.");
        return;
      }

      const ok = confirm("Delete this passenger?");
      if(!ok) return;

      await deleteTrip(tripId);

      trips = await fetchTrips();

      const newGroup = getSharedGroups().find(g => g.some(x=>getSharedKey(x) === getSharedKey(trip)));
      if(newGroup){
        newGroup.forEach(t=>{
          const real = trips.find(x=>x._id === t._id);
          if(real) real.__editing = true;
        });
      }

      render();
      return;
    }

    if(action === "cancel-edit"){
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