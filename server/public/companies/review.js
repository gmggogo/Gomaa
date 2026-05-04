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
    String(t.tripType || "").toUpperCase() === "SHARED" ||
    String(t.tripNumber || "").toUpperCase().includes("SH") ||
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
  const safeGroup = Array.isArray(group) ? group : [];
  const first = safeGroup[0] || {};

  if(Array.isArray(first.passengers) && first.passengers.length > 0){
    return first.passengers;
  }

  return safeGroup.map((t,idx)=>({
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
  const v = normalizeText(address);
  const lower = v.toLowerCase();

  if(!v) return "";

  if(lower.includes(" az") || lower.includes(",az") || lower.includes("arizona")){
    return v;
  }

  return v + ", AZ, USA";
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

function calculateIndividualPrice(miles, status){
  const BASE = 20;
  const INCLUDED = 3;
  const PER_MILE = 2.5;
  const NO_SHOW = 15;

  if(status === "NoShow") return NO_SHOW;

  const extra = Math.max(0, Number(miles || 0) - INCLUDED);
  return Number((BASE + (extra * PER_MILE)).toFixed(2));
}

function calculateSharedPrice(group, miles){
  const BASE = 15;
  const INCLUDED = 3;
  const PER_MILE = 2;
  const STOP_FEE = 5;
  const NO_SHOW = 15;

  const passengers = getRealPassengersFromGroup(group);
  const count = passengers.length || group.length || 1;
  const stopsCount = Math.max(0, count - 1);
  const extra = Math.max(0, Number(miles || 0) - INCLUDED);

  let total = BASE + (extra * PER_MILE) + (stopsCount * STOP_FEE);

  passengers.forEach(p=>{
    if(p.status === "NoShow") total += NO_SHOW;
  });

  total = Number(total.toFixed(2));

  return {
    total,
    pricePerPassenger:Number((total / count).toFixed(2)),
    stopsCount
  };
}

/* ================= ROUTE BUILD ================= */

function buildIndividualRoutePoints(trip){
  const points = [];

  if(trip && normalizeText(trip.pickup)){
    points.push(trip.pickup);
  }

  if(trip && Array.isArray(trip.stops)){
    trip.stops.forEach(s=>{
      if(normalizeText(s)){
        points.push(s);
      }
    });
  }

  if(trip && normalizeText(trip.dropoff)){
    points.push(trip.dropoff);
  }

  return points;
}

function sameValue(list, field){
  if(!Array.isArray(list) || list.length === 0){
    return false;
  }

  const first = normalizeText(list[0]?.[field]).toLowerCase();
  if(!first) return false;

  return list.every(x =>
    normalizeText(x?.[field]).toLowerCase() === first
  );
}

function buildSharedRoutePoints(group){

  if(!Array.isArray(group) || group.length === 0){
    return [];
  }

  const list = getRealPassengersFromGroup(group);

  if(!Array.isArray(list) || list.length === 0){
    return [];
  }

  const points = [];

  const samePickup = sameValue(list, "pickup");
  const sameDropoff = sameValue(list, "dropoff");

  if(samePickup){
    if(list[0]?.pickup){
      points.push(list[0].pickup);
    }

    list.forEach(p=>{
      if(normalizeText(p?.dropoff)){
        points.push(p.dropoff);
      }
    });

    return points;
  }

  if(sameDropoff){
    list.forEach(p=>{
      if(normalizeText(p?.pickup)){
        points.push(p.pickup);
      }
    });

    if(list[0]?.dropoff){
      points.push(list[0].dropoff);
    }

    return points;
  }

  list.forEach(p=>{
    if(normalizeText(p?.pickup)){
      points.push(p.pickup);
    }
    if(normalizeText(p?.dropoff)){
      points.push(p.dropoff);
    }
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

/* ================= TABS ================= */

function renderTabs(){
  const tabs = document.createElement("div");
  tabs.className = "review-tabs";

  tabs.innerHTML = `
    <button id="tabIndividual" class="${activeTab==="INDIVIDUAL"?"tab-active":"tab-inactive"}">Individual</button>
    <button id="tabShared" class="${activeTab==="SHARED"?"tab-active":"tab-inactive"}">Shared</button>
  `;

  container.appendChild(tabs);

  document.getElementById("tabIndividual").onclick = ()=>{
    activeTab = "INDIVIDUAL";
    render();
  };

  document.getElementById("tabShared").onclick = ()=>{
    activeTab = "SHARED";
    render();
  };
}

/* ================= ROW COLORS ================= */

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

/* ================= GROUP HELP ================= */

function groupByDate(list){

  const groups = {};

  list.forEach(t=>{
    const d = t.tripDate || "No Date";
    if(!groups[d]) groups[d] = [];
    groups[d].push(t);
  });

  return groups;
}

function getIndividualTrips(){
  return trips.filter(t => !isSharedTrip(t));
}

function getSharedGroups(){

  const map = {};

  trips.filter(isSharedTrip).forEach(t=>{
    const key = getSharedKey(t);
    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map);
}

/* ================= INDIVIDUAL TABLE ================= */

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
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Status</th>
        <th>Price</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      applyRowColor(tr, t);

      tr.innerHTML = `
        <td>${i+1}</td>
        <td><span class="trip-number-badge">${t.tripNumber || ""}</span></td>
        <td>${t.clientName || ""}</td>
        <td>${t.clientPhone || ""}</td>
        <td>${t.pickup || ""}</td>
        <td>${t.dropoff || ""}</td>
        <td>${t.status || "Scheduled"}</td>
        <td><span class="price-badge">$${formatMoney(t.priceAmount)}</span></td>
        <td>
          <button class="btn delete" data-action="delete">Delete</button>
        </td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  });

  if(!dates.length){
    const empty = document.createElement("div");
    empty.innerText = "No trips found";
    container.appendChild(empty);
  }
}

/* ================= SHARED TABLE ================= */

function renderSharedTable(groups){

  groups.forEach((group,i)=>{

    const first = group[0];

    const box = document.createElement("div");
    box.style.border = "1px solid #ddd";
    box.style.padding = "10px";
    box.style.marginBottom = "10px";

    let passengers = "";

    group.forEach((p,idx)=>{
      passengers += `
        ${idx+1}. ${p.clientName || ""} - ${p.clientPhone || ""}<br>
        ${p.pickup} → ${p.dropoff}<br><br>
      `;
    });

    box.innerHTML = `
      <div><b>Trip#:</b> ${first.tripNumber}</div>
      <div><b>Status:</b> ${first.status}</div>
      <div><b>Passengers:</b><br>${passengers}</div>
      <div><b>Price:</b> $${formatMoney(first.priceAmount)}</div>
      <button class="btn delete" data-id="${first._id}" data-action="delete">Delete</button>
    `;

    container.appendChild(box);
  });

  if(!groups.length){
    const empty = document.createElement("div");
    empty.innerText = "No shared trips";
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

container.addEventListener("click", async (e)=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const action = btn.dataset.action;

  try{

    /* ===== DELETE ===== */
    if(action === "delete"){

      const tr = btn.closest("tr");
      let id = "";

      if(tr){
        id = tr.dataset.id;
      }else{
        id = btn.dataset.id;
      }

      const ok = confirm("Delete this trip?");
      if(!ok) return;

      await deleteTrip(id);

      trips = await fetchTrips();
      render();
      return;
    }

    /* ===== CONFIRM INDIVIDUAL ===== */
    if(action === "confirm-individual"){

      const tr = btn.closest("tr");
      const id = tr.dataset.id;

      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      btn.disabled = true;
      btn.innerText = "Calculating...";

      const routePoints = buildIndividualRoutePoints(trip);
      const routeData = await calculateRouteMiles(routePoints);

      if(!routeData.miles || routeData.miles <= 0){
        alert("Route failed ❌");
        trips = await fetchTrips();
        render();
        return;
      }

      trip.priceAmount = calculateIndividualPrice(routeData.miles, trip.status);
      trip.miles = routeData.miles;
      trip.status = "Confirmed";

      await updateTrip(id, trip);

      trips = await fetchTrips();
      render();
      return;
    }

    /* ===== CONFIRM SHARED ===== */
    if(action === "confirm-shared"){

      const id = btn.dataset.id;
      const trip = trips.find(t=>t._id === id);
      if(!trip) return;

      btn.disabled = true;
      btn.innerText = "Calculating...";

      const group = getSharedGroups().find(g=>g[0]._id === id);
      if(!group) return;

      const routePoints = buildSharedRoutePoints(group);
      const routeData = await calculateRouteMiles(routePoints);

      if(!routeData.miles || routeData.miles <= 0){
        alert("Route failed ❌");
        trips = await fetchTrips();
        render();
        return;
      }

      const price = calculateSharedPrice(group, routeData.miles);

      const updateObj = {
        ...trip,
        priceAmount: price.total,
        status: "Confirmed",
        miles: routeData.miles
      };

      await updateTrip(id, updateObj);

      trips = await fetchTrips();
      render();
      return;
    }

    /* ===== CANCEL ===== */
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

  }catch(err){
    console.error(err);
    alert("Error");
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

  // لو في تعديل شغال متعملش ريفرش
  const hasEditing = trips.some(t=>t.__editing);
  if(hasEditing) return;

  try{
    trips = await fetchTrips();
    render();
  }catch(err){
    console.error("Auto refresh error", err);
  }

},30000); // كل 30 ثانية

});
