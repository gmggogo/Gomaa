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

.review-table{
width:100%;
border-collapse:collapse;
margin-bottom:20px;
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

.actions-wrap{
display:flex;
justify-content:center;
align-items:center;
gap:6px;
flex-wrap:nowrap;
}

.edit-input{
width:100%;
box-sizing:border-box;
padding:6px;
border:1px solid #cbd5e1;
border-radius:6px;
font-size:13px;
}

.edit-cell-wrap{
position:relative;
width:100%;
}

.suggestions{
position:absolute;
top:100%;
left:0;
right:0;
background:#ffffff;
border:1px solid #cbd5e1;
border-top:none;
z-index:9999;
max-height:220px;
overflow:auto;
box-shadow:0 10px 18px rgba(0,0,0,.08);
text-align:left;
}

.option{
padding:10px 12px;
cursor:pointer;
font-size:13px;
line-height:1.35;
border-bottom:1px solid #eef2f7;
background:#fff;
color:#111827;
}

.option:last-child{
border-bottom:none;
}

.option:hover{
background:#eff6ff;
}

.option.disabled{
cursor:default;
color:#64748b;
background:#f8fafc;
}

.review-table td{
position:relative;
}

/* COLORS */

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

/* BLINK */

@keyframes blinkTrip{
0%   { opacity:1; }
50%  { opacity:.82; }
100% { opacity:1; }
}

.trip-blink{
animation:blinkTrip 1.8s infinite;
}

`;

document.head.appendChild(style);

})();

/* ================= TIME ================= */

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

function isFiniteNumber(v){
  return typeof v === "number" && Number.isFinite(v);
}

/* ================= AUTOCOMPLETE ================= */

let editSelectedAddresses = {};

async function searchAddress(q){
  const query = normalizeText(q);
  if(query.length < 3) return [];

  try{
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if(!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }catch(err){
    console.error("Address search error:", err);
    return [];
  }
}

function createEditCellInput(value, field, type = "text"){
  return `
    <div class="edit-cell-wrap">
      <input class="edit-input" type="${type}" data-field="${field}" value="${escapeHtml(value)}">
    </div>
  `;
}

function attachEditAutocomplete(input, tripId, field){

  if(!input) return;

  const wrap = input.closest(".edit-cell-wrap") || input.parentNode;
  if(!wrap) return;

  let oldBox = wrap.querySelector(".suggestions");
  if(oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  wrap.appendChild(box);

  let debounceTimer = null;

  input.setAttribute("autocomplete", "off");

  input.addEventListener("input", async () => {

    if(!editSelectedAddresses[tripId]){
      editSelectedAddresses[tripId] = {};
    }

    editSelectedAddresses[tripId][field] = null;

    const q = input.value.trim();

    clearTimeout(debounceTimer);

    if(q.length < 3){
      box.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(async () => {
      const results = await searchAddress(q);

      if(!results.length){
        box.innerHTML = `<div class="option disabled">No address found</div>`;
        return;
      }

      box.innerHTML = results.map(r => `
        <div class="option"
             data-address="${escapeHtml(r.display_name)}"
             data-lat="${escapeHtml(r.lat)}"
             data-lng="${escapeHtml(r.lon)}">
          ${escapeHtml(r.display_name)}
        </div>
      `).join("");
    }, 250);

  });

  box.addEventListener("click", e => {
    const el = e.target.closest(".option");
    if(!el || el.classList.contains("disabled")) return;

    const obj = {
      address: el.dataset.address,
      lat: parseFloat(el.dataset.lat),
      lng: parseFloat(el.dataset.lng)
    };

    if(!editSelectedAddresses[tripId]){
      editSelectedAddresses[tripId] = {};
    }

    editSelectedAddresses[tripId][field] = obj;
    input.value = obj.address;
    box.innerHTML = "";
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      box.innerHTML = "";
    }, 180);
  });
}

function initRowAutocomplete(tripId){
  const row = document.querySelector(`tr[data-id="${tripId}"]`);
  if(!row) return;

  const pickupInput = row.querySelector('.edit-input[data-field="pickup"]');
  const dropoffInput = row.querySelector('.edit-input[data-field="dropoff"]');

  attachEditAutocomplete(pickupInput, tripId, "pickup");
  attachEditAutocomplete(dropoffInput, tripId, "dropoff");
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

/* ================= RENDER ================= */

let trips = [];

function render(){

  container.innerHTML = "";

  const groups = groupByDate(trips);
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
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const mins = minutesToTrip(t);
      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      const editing = t.__editing === true;

      /* ================= COLOR POLICY ================= */

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

      function cell(value, field, type="text"){
        if(!editing) return escapeHtml(value);
        return createEditCellInput(value, field, type);
      }

      /* ================= BUTTON POLICY ================= */

      let buttons = "";

      if(editing){

        buttons = `
          <div class="actions-wrap">
            <button class="btn confirm" data-action="save">Save</button>
          </div>
        `;

      }
      else if(t.status === "Cancelled"){

        buttons = "";

      }
      else if(mins > 120){

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
      else{

        buttons = "";

      }

      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${escapeHtml(t.tripNumber)}</td>
        <td>${cell(t.entryName,"entryName")}</td>
        <td>${cell(t.entryPhone,"entryPhone")}</td>
        <td>${cell(t.clientName,"clientName")}</td>
        <td>${cell(t.clientPhone || t.phone,"clientPhone")}</td>
        <td>${cell(t.pickup,"pickup")}</td>
        <td>${cell(t.dropoff,"dropoff")}</td>
        <td>${cell(t.tripDate,"tripDate","date")}</td>
        <td>${cell(t.tripTime,"tripTime","time")}</td>
        <td>${escapeHtml(t.status)}</td>
        <td>${buttons}</td>
      `;

      table.appendChild(tr);

    });

    container.appendChild(table);

  });

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

      editSelectedAddresses[id] = {
        pickup: trip.pickup && isFiniteNumber(Number(trip.pickupLat)) && isFiniteNumber(Number(trip.pickupLng))
          ? {
              address: trip.pickup,
              lat: Number(trip.pickupLat),
              lng: Number(trip.pickupLng)
            }
          : null,
        dropoff: trip.dropoff && isFiniteNumber(Number(trip.dropoffLat)) && isFiniteNumber(Number(trip.dropoffLng))
          ? {
              address: trip.dropoff,
              lat: Number(trip.dropoffLat),
              lng: Number(trip.dropoffLng)
            }
          : null
      };

      render();

      setTimeout(() => {
        initRowAutocomplete(id);
      }, 20);

      return;
    }

    if(action === "save"){

      const inputs = tr.querySelectorAll(".edit-input");
      const payload = {};

      inputs.forEach(input=>{
        payload[input.dataset.field] = input.value;
      });

      const tripDateValue = normalizeText(payload.tripDate);
      const tripTimeValue = normalizeText(payload.tripTime);

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

      const selected = editSelectedAddresses[id] || {};

      if(!selected.pickup || !selected.pickup.address || !isFiniteNumber(selected.pickup.lat) || !isFiniteNumber(selected.pickup.lng)){
        alert("Select pickup from suggestions ❌");
        return;
      }

      if(!selected.dropoff || !selected.dropoff.address || !isFiniteNumber(selected.dropoff.lat) || !isFiniteNumber(selected.dropoff.lng)){
        alert("Select dropoff from suggestions ❌");
        return;
      }

      payload.pickup = selected.pickup.address;
      payload.pickupLat = selected.pickup.lat;
      payload.pickupLng = selected.pickup.lng;

      payload.dropoff = selected.dropoff.address;
      payload.dropoffLat = selected.dropoff.lat;
      payload.dropoffLng = selected.dropoff.lng;

      payload.status = "Scheduled";

      await updateTrip(id,payload);

      delete editSelectedAddresses[id];
      trip.__editing = false;
      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "confirm"){
      await updateTrip(id,{...trip, status:"Confirmed"});
    }

    if(action === "cancel"){
      await updateTrip(id,{...trip, status:"Cancelled"});
    }

    if(action === "delete"){
      await deleteTrip(id);
    }

    trips = await fetchTrips();
    render();

  }catch(err){
    alert(err.message || "Server Error");
    console.error(err);
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
  trips = await fetchTrips();
  render();
},30000);

});