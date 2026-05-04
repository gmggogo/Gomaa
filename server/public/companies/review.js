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

  .edit-line{
    display:flex;
    gap:6px;
    align-items:center;
    margin-bottom:6px;
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

/* ================= HELPERS ================= */

let activeTab = "INDIVIDUAL";
let trips = [];

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

function isSharedTrip(t){
  return (
    t.type === "SHARED" ||
    t.tripType === "shared" ||
    (Array.isArray(t.passengers) && t.passengers.length > 0)
  );
}

function formatMoney(value){
  return Number(value || 0).toFixed(2);
}

function getTripNumber(t){
  let n = t.tripNumber || "";
  if(isSharedTrip(t) && !n.includes("SH")){
    n += "-SH";
  }
  return n;
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

  if(lower.includes(" az") || lower.includes(",az") || lower.includes("arizona")){
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
      estimatedMinutes:0
    };
  }

  const origin = normalizeAZ(points[0]);
  const destination = normalizeAZ(points[points.length - 1]);
  const middle = points.slice(1, -1);

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

function calculateSharedPrice(trip, miles){
  const BASE = 15;
  const INCLUDED = 3;
  const PER_MILE = 2;
  const STOP_FEE = 5;
  const NO_SHOW = 15;

  const passengers = Array.isArray(trip.passengers) ? trip.passengers : [];
  const count = passengers.length || 1;

  const stopsCount = Math.max(0, count - 1);
  const extra = Math.max(0, Number(miles || 0) - INCLUDED);

  let total = BASE + (extra * PER_MILE) + (stopsCount * STOP_FEE);

  passengers.forEach(p=>{
    if(p.status === "NoShow"){
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

function buildSharedRoutePoints(trip){
  const passengers = Array.isArray(trip.passengers) ? trip.passengers : [];
  const points = [];

  if(!passengers.length) return points;

  const firstPickup = passengers[0].pickup || trip.pickup || "";
  const samePickup = passengers.every(p => normalizeText(p.pickup).toLowerCase() === normalizeText(firstPickup).toLowerCase());

  const firstDrop = passengers[0].dropoff || trip.dropoff || "";
  const sameDrop = passengers.every(p => normalizeText(p.dropoff).toLowerCase() === normalizeText(firstDrop).toLowerCase());

  if(samePickup){
    points.push(firstPickup);
    passengers.forEach(p=>{
      if(normalizeText(p.dropoff)) points.push(p.dropoff);
    });
    return points;
  }

  if(sameDrop){
    passengers.forEach(p=>{
      if(normalizeText(p.pickup)) points.push(p.pickup);
    });
    points.push(firstDrop);
    return points;
  }

  passengers.forEach(p=>{
    if(normalizeText(p.pickup)) points.push(p.pickup);
  });

  passengers.forEach(p=>{
    if(normalizeText(p.dropoff)) points.push(p.dropoff);
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

/* ================= GROUP ================= */

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

/* ================= RENDER CELLS ================= */

function createEditInput(value, field, type="text"){
  return `<input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">`;
}

function createPassengerEditInput(value, index, field){
  return `<input class="edit-input" data-index="${index}" data-field="${field}" value="${escapeHtml(value)}">`;
}

function renderClientCell(t, editing){
  if(!isSharedTrip(t)){
    if(editing) return createEditInput(t.clientName || "", "clientName");
    return `<div class="multi-line">${escapeHtml(t.clientName || "")}</div>`;
  }

  const passengers = Array.isArray(t.passengers) ? t.passengers : [];

  if(editing){
    return passengers.map((p,i)=>`
      <div class="edit-line">
        ${createPassengerEditInput(p.clientName || "", i, "clientName")}
      </div>
    `).join("");
  }

  return `<div class="multi-line">${
    passengers.map(p=>escapeHtml(p.clientName || "")).join("\n")
  }</div>`;
}

function renderPhoneCell(t, editing){
  if(!isSharedTrip(t)){
    if(editing) return createEditInput(t.clientPhone || t.phone || "", "clientPhone");
    return `<div class="multi-line">${escapeHtml(t.clientPhone || t.phone || "")}</div>`;
  }

  const passengers = Array.isArray(t.passengers) ? t.passengers : [];

  if(editing){
    return passengers.map((p,i)=>`
      <div class="edit-line">
        ${createPassengerEditInput(p.clientPhone || "", i, "clientPhone")}
      </div>
    `).join("");
  }

  return `<div class="multi-line">${
    passengers.map(p=>escapeHtml(p.clientPhone || "")).join("\n")
  }</div>`;
}

function renderPickupCell(t, editing){
  if(!isSharedTrip(t)){
    if(editing) return createEditInput(t.pickup || "", "pickup");
    return `<div class="multi-line">${escapeHtml(t.pickup || "")}</div>`;
  }

  const passengers = Array.isArray(t.passengers) ? t.passengers : [];

  if(editing){
    return passengers.map((p,i)=>`
      <div class="edit-line">
        ${createPassengerEditInput(p.pickup || "", i, "pickup")}
      </div>
    `).join("");
  }

  return `<div class="multi-line">${
    passengers.map(p=>escapeHtml(p.pickup || "")).join("\n")
  }</div>`;
}

function renderDropCell(t, editing){
  if(!isSharedTrip(t)){
    if(editing) return createEditInput(t.dropoff || "", "dropoff");
    return `<div class="multi-line">${escapeHtml(t.dropoff || "")}</div>`;
  }

  const passengers = Array.isArray(t.passengers) ? t.passengers : [];

  if(editing){
    return passengers.map((p,i)=>`
      <div class="edit-line">
        ${createPassengerEditInput(p.dropoff || "", i, "dropoff")}
        <button class="btn small-delete" data-action="delete-passenger" data-index="${i}" type="button">Delete</button>
      </div>
    `).join("");
  }

  return `<div class="multi-line">${
    passengers.map(p=>escapeHtml(p.dropoff || "")).join("\n")
  }</div>`;
}

function renderStopsCell(t, editing){
  if(isSharedTrip(t)){
    const passengers = Array.isArray(t.passengers) ? t.passengers : [];
    const stopsCount = Math.max(0, passengers.length - 1);
    return `<strong>${stopsCount}</strong>`;
  }

  const stops = Array.isArray(t.stops) ? t.stops : [];

  if(editing){
    return stops.map((s,i)=>`
      <div class="edit-line">
        <input class="edit-input" data-stop-index="${i}" value="${escapeHtml(s)}">
      </div>
    `).join("");
  }

  return `<div class="multi-line">${stops.map(s=>escapeHtml(s)).join("\n")}</div>`;
}

function renderNotesCell(t, editing){
  if(editing){
    return createEditInput(t.notes || "", "notes");
  }

  return `<div class="multi-line">${escapeHtml(t.notes || "")}</div>`;
}

/* ================= RENDER ================= */

function render(){

  container.innerHTML = "";

  renderTabs();

  const filtered = trips.filter(t=>{
    if(activeTab === "INDIVIDUAL") return !isSharedTrip(t);
    return isSharedTrip(t);
  });

  const groups = groupByDate(filtered);
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

      const mins = minutesToTrip(t);
      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      const editing = t.__editing === true;

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

      let buttons = "";

      if(editing){
        buttons = `
          <div class="actions-wrap">
            <button class="btn confirm" data-action="save">Save</button>
            <button class="btn cancel" data-action="cancel-edit">Cancel Edit</button>
          </div>
        `;
      }
      else if(t.status === "Cancelled"){
        buttons = "";
      }
      else if(mins > 120 || mins === null){
        buttons = `
          <div class="actions-wrap">
            <button class="btn edit" data-action="edit">Edit</button>
            <button class="btn delete" data-action="delete">Delete</button>
            <button class="btn confirm" data-action="confirm">Confirm</button>
          </div>
        `;
      }
      else if(mins <= 120 && mins > 0 && t.status === "Scheduled"){
        buttons = `
          <div class="actions-wrap">
            <button class="btn confirm" data-action="confirm">Confirm</button>
            <button class="btn cancel" data-action="cancel">Cancel</button>
          </div>
        `;
      }
      else if(mins <= 120 && mins > 0 && t.status === "Confirmed"){
        buttons = `
          <div class="actions-wrap">
            <button class="btn cancel" data-action="cancel">Cancel</button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${escapeHtml(getTripNumber(t))}</span></td>
        <td>${editing ? createEditInput(t.entryName || "", "entryName") : escapeHtml(t.entryName || "")}</td>
        <td>${editing ? createEditInput(t.entryPhone || "", "entryPhone") : escapeHtml(t.entryPhone || "")}</td>
        <td>${renderClientCell(t, editing)}</td>
        <td>${renderPhoneCell(t, editing)}</td>
        <td>${renderPickupCell(t, editing)}</td>
        <td>${renderDropCell(t, editing)}</td>
        <td>${renderStopsCell(t, editing)}</td>
        <td>${renderNotesCell(t, editing)}</td>
        <td>${editing ? createEditInput(t.tripDate || "", "tripDate", "date") : escapeHtml(t.tripDate || "")}</td>
        <td>${editing ? createEditInput(t.tripTime || "", "tripTime", "time") : escapeHtml(t.tripTime || "")}</td>
        <td>${escapeHtml(t.status || "")}</td>
        <td><span class="price-badge">$${formatMoney(t.priceAmount)}</span></td>
        <td>${buttons}</td>
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
    empty.innerText = activeTab === "INDIVIDUAL"
      ? "No individual trips found."
      : "No shared trips found.";
    container.appendChild(empty);
  }
}

/* ================= ACTIONS ================= */

container.addEventListener("click", async e=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const tr = btn.closest("tr");
  if(!tr) return;

  const id = tr.dataset.id;
  const action = btn.dataset.action;
  const trip = trips.find(t=>t._id === id);

  if(!trip) return;

  try{

    if(action === "edit"){
      trip.__editing = true;
      render();
      return;
    }

    if(action === "cancel-edit"){
      trip.__editing = false;
      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "delete-passenger"){
      const index = Number(btn.dataset.index);

      if(!Array.isArray(trip.passengers)) return;

      if(trip.passengers.length <= 2){
        alert("Shared trip must have at least 2 passengers.");
        return;
      }

      const ok = confirm("Delete this passenger from shared trip?");
      if(!ok) return;

      trip.passengers.splice(index,1);
      trip.passengerCount = trip.passengers.length;
      trip.status = "Scheduled";
      trip.priceAmount = 0;
      trip.pricePerPassenger = 0;

      await updateTrip(id, trip);
      trips = await fetchTrips();

      const updated = trips.find(t=>t._id === id);
      if(updated) updated.__editing = true;

      render();
      return;
    }

    if(action === "save"){

      const inputs = tr.querySelectorAll(".edit-input");

      inputs.forEach(input=>{
        const index = input.dataset.index;
        const field = input.dataset.field;
        const stopIndex = input.dataset.stopIndex;

        if(stopIndex !== undefined){
          if(!Array.isArray(trip.stops)) trip.stops = [];
          trip.stops[Number(stopIndex)] = input.value;
          return;
        }

        if(index !== undefined){
          if(!Array.isArray(trip.passengers)) trip.passengers = [];
          if(!trip.passengers[Number(index)]) trip.passengers[Number(index)] = {};
          trip.passengers[Number(index)][field] = input.value;
          return;
        }

        trip[field] = input.value;
      });

      const tripDateValue = normalizeText(trip.tripDate);
      const tripTimeValue = normalizeText(trip.tripTime);

      const newTrip = new Date(tripDateValue + "T" + tripTimeValue + ":00");
      const now = getAZNow();

      if(isNaN(newTrip.getTime())){
        alert("Invalid date/time");
        return;
      }

      if(newTrip <= now){
        alert("Cannot set trip in the past ❌");
        return;
      }

      const mins = (newTrip - now) / 60000;

      if(mins <= 120){
        const ok = confirm("WARNING: Trip is within 120 minutes. Continue?");
        if(!ok) return;
      }

      trip.status = "Scheduled";
      trip.priceAmount = 0;
      trip.pricePerPassenger = 0;
      trip.__editing = false;

      await updateTrip(id, trip);

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "confirm"){

      btn.disabled = true;
      btn.textContent = "Calculating...";

      let routePoints = [];
      let routeData = {
        miles:0,
        distanceMeters:0,
        durationSeconds:0,
        estimatedMinutes:0,
        googleRoute:{}
      };

      if(isSharedTrip(trip)){
        routePoints = buildSharedRoutePoints(trip);
      }else{
        routePoints = buildIndividualRoutePoints(trip);
      }

      if(routePoints.length >= 2){
        routeData = await calculateRouteMiles(routePoints);
      }

      if(isSharedTrip(trip)){
        const sharedPrice = calculateSharedPrice(trip, routeData.miles);

        trip.priceAmount = sharedPrice.total;
        trip.pricePerPassenger = sharedPrice.pricePerPassenger;
        trip.sharedStopsCount = sharedPrice.stopsCount;
      }else{
        trip.priceAmount = calculateIndividualPrice(routeData.miles, trip.status);
      }

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
      await updateTrip(id,{ ...trip, status:"Cancelled" });
    }

    if(action === "delete"){
      const ok = confirm("Delete this trip?");
      if(!ok) return;

      await deleteTrip(id);
    }

    trips = await fetchTrips();
    render();

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