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

  .review-table{width:100%;border-collapse:collapse;margin-bottom:20px;background:#fff;}
  .review-table th,.review-table td{border:1px solid #dbe2ea;padding:8px;text-align:center;font-size:14px;vertical-align:middle;}
  .review-table th{background:#0f172a;color:#fff;}

  .date-title{font-size:18px;font-weight:700;margin:20px 0 10px;color:#0f172a;}

  .btn{border:none;padding:6px 10px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;margin:2px;white-space:nowrap;}
  .btn.edit{background:#2563eb;color:#fff;}
  .btn.delete{background:#111827;color:#fff;}
  .btn.confirm{background:#16a34a;color:#fff;}
  .btn.cancel{background:#dc2626;color:#fff;}
  .btn.small-delete{background:#ef4444;color:#fff;font-size:11px;padding:4px 7px;}

  .actions-wrap{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;}
  .edit-input{width:100%;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;}
  .multi-line{white-space:pre-line;line-height:1.65;text-align:left;}

  .trip-number-badge{display:inline-block;background:#0ea5e9;color:#fff;padding:6px 10px;border-radius:8px;font-weight:800;}
  .price-badge{display:inline-block;background:#bbf7d0;color:#14532d;padding:6px 10px;border-radius:8px;font-weight:900;box-shadow:0 0 12px rgba(34,197,94,.35);}

  .scheduled-row{background:#ffffff;color:#111827;}
  .confirmed-row{background:#22c55e;color:#111827;}
  .cancelled-row{background:#ef4444;color:#111827;}
  .yellow{background:#fde047;color:#111827;}
  .red-light{background:#fecaca;color:#111827;}
  .red-mid{background:#f87171;color:#111827;}
  .red-dark{background:#7f1d1d;color:#ffffff;}
  .past-row{background:#374151;color:#e5e7eb;}

  @keyframes blinkTrip{0%{opacity:1;}50%{opacity:.82;}100%{opacity:1;}}
  .trip-blink{animation:blinkTrip 1.8s infinite;}

  @media(max-width:768px){
    .review-table th,.review-table td{font-size:11px;padding:6px;}
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
    passengerId: "P" + (idx + 1),
    name: t.name || t.clientName || "",
    phone: t.phone || t.clientPhone || "",
    clientName: t.clientName || t.name || "",
    clientPhone: t.clientPhone || t.phone || "",
    pickup: t.pickup || "",
    dropoff: t.dropoff || "",
    status: t.status || "Scheduled"
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

function normalizeAZ(address){

  let v = normalizeText(address);

  if(!v) return "";

  // 🔥 تنظيف المسافات
  v = v.replace(/\s+/g," ").trim();

  // 🔥 إصلاح أسماء المدن
  v = v
    .replace(/\btemp\b/ig,"Tempe")
    .replace(/\btempe\b/ig,"Tempe")
    .replace(/\bchandle\b/ig,"Chandler")
    .replace(/\bchandler\b/ig,"Chandler")
    .replace(/\bphoenixx\b/ig,"Phoenix");

  const lower = v.toLowerCase();

  // 🔥 لو مفيش AZ ضيفها
  if(
    !lower.includes(" az") &&
    !lower.includes(", az") &&
    !lower.includes(" arizona")
  ){
    v += ", Chandler, AZ 85225, USA";
  }

  return v;
}

async function calculateRouteMiles(points){
  await ensureGoogleLoaded();

  const cleanPoints = Array.isArray(points)
    ? points.map(p => normalizeAZ(normalizeText(p))).filter(Boolean)
    : [];

  if(cleanPoints.length < 2){
    return { miles:0, distanceMeters:0, durationSeconds:0, estimatedMinutes:0, googleRoute:{} };
  }

  const origin = cleanPoints[0];
  const destination = cleanPoints[cleanPoints.length - 1];
  const middle = cleanPoints.slice(1, -1);

  const waypoints = middle.map(address => ({
    location: address,
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

// 🔵 INDIVIDUAL
function calculateIndividualPrice(miles, status){
  const BASE = 20;
  const INCLUDED = 3;
  const PER_MILE = 2.5;
  const NO_SHOW = 15;

  // 🚨 No Show
  if(status === "NoShow") return NO_SHOW;

  const totalMiles = Math.max(0, Number(miles) || 0);
  const extraMiles = Math.max(0, totalMiles - INCLUDED);

  const total = BASE + (extraMiles * PER_MILE);

  return Number(total.toFixed(2));
}


// 🟢 SHARED (GROUP BASED)
function calculateSharedPrice(group, miles){
  const BASE = 15;        // لكل راكب
  const INCLUDED = 3;     // لكل راكب (free miles)
  const PER_MILE = 2;
  const STOP_FEE = 5;
  const NO_SHOW = 15;

  const passengers = getRealPassengersFromGroup(group);

  // 🟢 ركاب فعليين
  const activePassengers = passengers.filter(p => p.status !== "NoShow");

  // 🔴 نو شو
  const noShowPassengers = passengers.filter(p => p.status === "NoShow");

  const count = activePassengers.length;

  // 🧠 لو كلهم No Show
  if(count === 0){
    return {
      total: noShowPassengers.length * NO_SHOW,
      pricePerPassenger: 0,
      stopsCount: 0
    };
  }

  // 💰 base
  const baseTotal = count * BASE;

  // 🛣️ free miles
  const freeMiles = count * INCLUDED;

  // 📏 extra miles
  const totalMiles = Math.max(0, Number(miles) || 0);
  const extraMiles = Math.max(0, totalMiles - freeMiles);
  const milesCost = extraMiles * PER_MILE;

  // 📍 stops
  const stopsCount = Math.max(0, count - 1);
  const stopsCost = stopsCount * STOP_FEE;

  // 🚨 No Show (منفصل)
  const noShowCost = noShowPassengers.length * NO_SHOW;

  // 🔥 المهم (بدون NoShow)
  const activeTotal = baseTotal + milesCost + stopsCost;

  // 🧾 total النهائي
  const total = Number((activeTotal + noShowCost).toFixed(2));

  return {
    total,
    pricePerPassenger: Number((activeTotal / count).toFixed(2)),
    stopsCount,
    breakdown:{
      baseTotal,
      freeMiles,
      extraMiles,
      milesCost,
      stopsCost,
      noShowCost,
      activePassengers: count,
      noShowPassengers: noShowPassengers.length
    }
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

  const samePickup = sameValue(list, "pickup");
  const sameDropoff = sameValue(list, "dropoff");

  if(samePickup){
    points.push(list[0].pickup);
    list.forEach(p=>{
      if(normalizeText(p.dropoff)) points.push(p.dropoff);
    });
    return points;
  }

  if(sameDropoff){
    list.forEach(p=>{
      if(normalizeText(p.pickup)) points.push(p.pickup);
    });
    points.push(list[0].dropoff);
    return points;
  }

  list.forEach(p=>{
    if(normalizeText(p.pickup)) points.push(p.pickup);
  });

  list.forEach(p=>{
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

  trips.filter(t => isSharedTrip(t)).forEach(t=>{
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
        <button class="btn confirm" data-action="save-individual">Save</button>
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

  const dates = Object.keys(groups)
    .sort((a,b)=>new Date(b)-new Date(a));

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

      applyRowColor(tr, t);

      const stops = Array.isArray(t.stops)
        ? t.stops
        : [];

      tr.innerHTML = `

        <td>${i+1}</td>

        <td>
          ${escapeHtml(getTripNumber(t))}
        </td>

        <td>
          ${
            editing
              ? createEditInput(t.entryName || "", "entryName")
              : escapeHtml(t.entryName || "")
          }
        </td>

        <td>
          ${
            editing
              ? createEditInput(t.entryPhone || "", "entryPhone")
              : escapeHtml(t.entryPhone || "")
          }
        </td>

        <td>
          ${
            editing
              ? createEditInput(t.clientName || "", "clientName")
              : `<div class="multi-line">${escapeHtml(t.clientName || "")}</div>`
          }
        </td>

        <td>
          ${
            editing
              ? createEditInput(t.clientPhone || "", "clientPhone")
              : `<div class="multi-line">${escapeHtml(t.clientPhone || "")}</div>`
          }
        </td>

        <!-- PICKUP -->
        <td>
          ${
            editing
              ? createEditInput(t.pickup || "", "pickup")
              : `<div class="multi-line">${escapeHtml(t.pickup || "")}</div>`
          }
        </td>

        <!-- STOPS -->
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
                    ${stops.length
                      ? stops.map(s=>escapeHtml(s)).join("<br>")
                      : "--"}
                  </div>
                `
          }
        </td>

        <!-- DROPOFF -->
        <td>
          ${
            editing
              ? createEditInput(t.dropoff || "", "dropoff")
              : `<div class="multi-line">${escapeHtml(t.dropoff || "")}</div>`
          }
        </td>

        <!-- NOTES -->
        <td>
          ${
            editing
              ? createEditInput(t.notes || "", "notes")
              : `<div class="multi-line">${escapeHtml(t.notes || "")}</div>`
          }
        </td>

        <!-- DATE -->
        <td>
          ${
            editing
              ? createEditInput(t.tripDate || "", "tripDate", "date")
              : escapeHtml(t.tripDate || "")
          }
        </td>

        <!-- TIME -->
        <td>
          ${
            editing
              ? createEditInput(t.tripTime || "", "tripTime", "time")
              : escapeHtml(t.tripTime || "")
          }
        </td>

        <!-- STATUS -->
        <td>
          <strong>
            ${escapeHtml(t.status || "Scheduled")}
          </strong>
        </td>

        <!-- PRICE -->
        <td>
          $${formatMoney(t.priceAmount)}
        </td>

        <!-- MILES -->
        <td>
          ${
            t.miles !== undefined &&
            t.miles !== null &&
            t.miles !== ""
              ? Number(t.miles).toFixed(1) + " mi"
              : "-- mi"
          }
        </td>

        <!-- ACTIONS -->
        <td>
          ${renderIndividualButtons(t, editing)}
        </td>
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

  if(group.every(t=>t.status === "Cancelled")){
    return "Cancelled";
  }

  if(group.every(t=>t.status === "Confirmed")){
    return "Confirmed";
  }

  if(group.some(t=>t.status === "Confirmed")){
    return "Partially Confirmed";
  }

  return group[0]?.status || "Scheduled";
}

function getGroupPrice(group){

  const firstWithPrice = group.find(
    t => Number(t.priceAmount || 0) > 0
  );

  return firstWithPrice
    ? Number(firstWithPrice.priceAmount || 0)
    : 0;
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

  if(status === "Cancelled") return "";

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

  const dateGroups = {};

  groups.forEach(group=>{

    const first = group[0];

    const d = first?.createdAt
      ? new Date(first.createdAt)
      : new Date();

    const key = d.toLocaleDateString();

    if(!dateGroups[key]){
      dateGroups[key] = [];
    }

    dateGroups[key].push(group);
  });

  const dates = Object.keys(dateGroups)
    .sort((a,b)=>new Date(b)-new Date(a));

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

        clients = passengers.map((p,idx)=>
          createSharedEditInput(
            p.name || p.clientName || "",
            first._id,
            `passenger_${idx}_name`
          )
        ).join("\n");

        phones = passengers.map((p,idx)=>
          createSharedEditInput(
            p.phone || p.clientPhone || "",
            first._id,
            `passenger_${idx}_phone`
          )
        ).join("\n");

        pickups = passengers.map((p,idx)=>
          createSharedEditInput(
            p.pickup || "",
            first._id,
            `passenger_${idx}_pickup`
          )
        ).join("\n");

        drops = passengers.map((p,idx)=>
          createSharedEditInput(
            p.dropoff || "",
            first._id,
            `passenger_${idx}_dropoff`
          )
        ).join("\n");

      }else{

        clients = passengers
          .map((p,idx)=>`${idx+1}. ${escapeHtml(p.name || p.clientName || "")}`)
          .join("\n");

        phones = passengers
          .map((p,idx)=>`${idx+1}. ${escapeHtml(p.phone || p.clientPhone || "")}`)
          .join("\n");

        pickups = passengers
          .map((p,idx)=>`${idx+1}. ${escapeHtml(p.pickup || "")}`)
          .join("\n");

        drops = passengers
          .map((p,idx)=>`${idx+1}. ${escapeHtml(p.dropoff || "")}`)
          .join("\n");
      }

      const notes = editing
        ? createSharedEditInput(first.notes || "", first._id, "notes")
        : `<div class="multi-line">${escapeHtml(first.notes || "")}</div>`;

      const stopsCount = Math.max(0, passengers.length - 1);

      tr.innerHTML = `

        <td>${i+1}</td>

        <td>
          ${escapeHtml(getTripNumber(first))}
        </td>

        <td>
          ${
            editing
              ? createSharedEditInput(first.entryName || "", first._id, "entryName")
              : escapeHtml(first.entryName || "")
          }
        </td>

        <td>
          ${
            editing
              ? createSharedEditInput(first.entryPhone || "", first._id, "entryPhone")
              : escapeHtml(first.entryPhone || "")
          }
        </td>

        <td>
          <div class="multi-line">${clients}</div>
        </td>

        <td>
          <div class="multi-line">${phones}</div>
        </td>

        <td>
          <div class="multi-line">${pickups}</div>
        </td>

        <td>
          <strong>${stopsCount}</strong>
        </td>

        <td>
          <div class="multi-line">${drops}</div>
        </td>

        <td>
          ${notes}
        </td>

        <td>
          ${
            editing
              ? createSharedEditInput(first.tripDate || "", first._id, "tripDate", "date")
              : escapeHtml(first.tripDate || "")
          }
        </td>

        <td>
          ${
            editing
              ? createSharedEditInput(first.tripTime || "", first._id, "tripTime", "time")
              : escapeHtml(first.tripTime || "")
          }
        </td>

        <td>
          <strong>
            ${escapeHtml(getGroupStatus(group))}
          </strong>
        </td>

        <td>
          $${formatMoney(getGroupPrice(group))}
        </td>

        <td>
          ${
            first.miles !== undefined &&
            first.miles !== null &&
            first.miles !== ""
              ? Number(first.miles).toFixed(1) + " mi"
              : "-- mi"
          }
        </td>

        <td>
          ${renderSharedButtons(group, editing)}
        </td>
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

}/* ================= MAIN RENDER ================= */

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

    if(action === "edit"){
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      const mins = minutesToTrip(trip);
      if(mins !== null && mins <= 120 && mins > 0){
        const ok = confirm("WARNING: Trip is within 120 minutes. Continue editing?");
        if(!ok) return;
      }

      trip.__editing = true;
      render();
      return;
    }

    if(action === "edit-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      const mins = minutesToTrip(group[0]);
      if(mins !== null && mins <= 120 && mins > 0){
        const ok = confirm("WARNING: Shared trip is within 120 minutes. Continue editing?");
        if(!ok) return;
      }

      group.forEach(t=>{
        const real = trips.find(x=>x._id === t._id);
        if(real) real.__editing = true;
      });

      render();
      return;
    }

    if(action === "remove-passenger"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      const first = group[0];
      const passengers = getRealPassengersFromGroup(group).map(p=>({ ...p }));

      if(passengers.length <= 2){
        alert("Shared trip must have at least 2 passengers.");
        return;
      }

      const index = Number(btn.dataset.index);
      passengers.splice(index, 1);

      first.passengers = passengers;
      first.totalPassengers = passengers.length;
      first.pickup = passengers[0]?.pickup || "";
      first.dropoff = passengers[passengers.length - 1]?.dropoff || "";
      first.status = "Scheduled";
      first.priceAmount = 0;
      first.pricePerPassenger = 0;
      first.isShared = true;
      first.tripType = "SHARED";

      await updateTrip(first._id, first);

      trips = await fetchTrips();

      const updated = trips.find(t=>t._id === first._id);
      if(updated) updated.__editing = true;

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
          trip.stops[Number(stopIndex)] = normalizeAZ(input.value);
          return;
        }

      if(field === "pickup" || field === "dropoff"){
  trip[field] = normalizeAZ(input.value);
}else{
  trip[field] = input.value;
}
      });
trip.miles = 0;
trip.distanceMeters = 0;
trip.durationSeconds = 0;
trip.estimatedMinutes = 0;

trip.googleRoute = {};
trip.routePoints = [];

trip.priceAmount = 0;

trip.status = "Scheduled";

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

      const mins = (newTrip - now) / 60000;
      if(mins <= 120){
        const ok = confirm("WARNING: Trip is within 120 minutes. Continue saving?");
        if(!ok) return;
      }

      trip.status = "Scheduled";
      trip.priceAmount = 0;
      trip.__editing = false;
delete trip.googleRoute;
delete trip.routePoints;
delete trip.distanceMeters;
delete trip.durationSeconds;
delete trip.estimatedMinutes;
      console.log("SAVING:", trip);
alert("SAVE CLICKED");

await updateTrip(id, trip);

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "save-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      const first = group[0];
      const updateObj = { ...first };
      const passengers = getRealPassengersFromGroup(group).map(p=>({ ...p }));

      const inputs = tr.querySelectorAll(".edit-input");

      inputs.forEach(input=>{
        const field = input.dataset.field;

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
            passengers[index].pickup = input.value;
          }

          if(key === "dropoff"){
            passengers[index].dropoff = input.value;
          }

          return;
        }

        updateObj[field] = input.value;
      });

      const newTrip = new Date(normalizeText(updateObj.tripDate) + "T" + normalizeText(updateObj.tripTime) + ":00");
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
        const ok = confirm("WARNING: Shared trip is within 120 minutes. Continue saving?");
        if(!ok) return;
      }

      updateObj.passengers = passengers;
      updateObj.totalPassengers = passengers.length;
      updateObj.pickup = passengers[0]?.pickup || "";
      updateObj.dropoff = passengers[passengers.length - 1]?.dropoff || "";
      updateObj.clientName = "Shared Trip";
      updateObj.clientPhone = passengers[0]?.phone || passengers[0]?.clientPhone || "";
      updateObj.status = "Scheduled";
      updateObj.priceAmount = 0;
      updateObj.pricePerPassenger = 0;
      updateObj.isShared = true;
      updateObj.tripType = "SHARED";
      updateObj.__editing = false;

      await updateTrip(first._id, updateObj);

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

      if(!routeData.miles || routeData.miles <= 0){
        alert("Route calculation failed ❌");
        trips = await fetchTrips();
        render();
        return;
      }

      trip.priceAmount = calculateIndividualPrice(routeData.miles, trip.status);
      trip.miles = routeData.miles;
      trip.distanceMeters = routeData.distanceMeters;
      trip.durationSeconds = routeData.durationSeconds;
      trip.estimatedMinutes = routeData.estimatedMinutes;
      trip.googleRoute = routeData.googleRoute;
      trip.routePoints = routePoints;
      trip.status = "Confirmed";

      await updateTrip(id, trip);

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "confirm-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      const first = group[0];

      btn.disabled = true;
      btn.textContent = "Calculating...";

      const routePoints = buildSharedRoutePoints(group);
      const routeData = await calculateRouteMiles(routePoints);

      if(!routeData.miles || routeData.miles <= 0){
        alert("Route calculation failed ❌");
        trips = await fetchTrips();
        render();
        return;
      }

      const sharedPrice = calculateSharedPrice(group, routeData.miles);

      const updateObj = {
        ...first,
        priceAmount: sharedPrice.total,
        pricePerPassenger: sharedPrice.pricePerPassenger,
        sharedStopsCount: sharedPrice.stopsCount,
        miles: routeData.miles,
        distanceMeters: routeData.distanceMeters,
        durationSeconds: routeData.durationSeconds,
        estimatedMinutes: routeData.estimatedMinutes,
        googleRoute: routeData.googleRoute,
        routePoints: routePoints,
        optimizedRoute: routeData.googleRoute,
        status: "Confirmed",
        isShared: true,
        tripType: "SHARED"
      };

      await updateTrip(first._id, updateObj);

      trips = await fetchTrips();
      render();
      return;
    }

if(action === "cancel"){

  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const trip = trips.find(t=>t._id === id);
  if(!trip) return;

  const mins = minutesToTrip(trip);

  let finalPrice = 0;

  // 🔥 لو داخل 120 دقيقة
  if(mins !== null && mins > 0 && mins <= 120){
    finalPrice = 15;
  }

  await updateTrip(id,{
    ...trip,
    status:"Cancelled",
    priceAmount: finalPrice
  });

  trips = await fetchTrips();
  render();
}

  if(action === "cancel-shared"){

  const tr = btn.closest("tr");
  const groupId = tr.dataset.groupId;
  const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
  if(!group) return;

  const first = group[0];

  const mins = minutesToTrip(first);

  let finalPrice = 0;

  if(mins !== null && mins > 0 && mins <= 120){
    finalPrice = 15;
  }

  await updateTrip(first._id,{
    ...first,
    status:"Cancelled",
    priceAmount: finalPrice
  });

  trips = await fetchTrips();
  render();
}

    if(action === "delete-shared"){
      const tr = btn.closest("tr");
      const groupId = tr.dataset.groupId;
      const group = getSharedGroups().find(g => getSharedKey(g[0]) === groupId);
      if(!group) return;

      const ok = confirm("Delete this shared trip?");
      if(!ok) return;

      await deleteTrip(group[0]._id);

      trips = await fetchTrips();
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