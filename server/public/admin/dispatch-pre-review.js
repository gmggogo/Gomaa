/* =========================================
FILE: dispatch-review.js
DISPATCH REVIEW - CLEAN BUILD
Mongo Review -> Edit / Delete / Confirm -> Trips Hub
========================================= */

(function(){

const API_URL = "/api/trips";
const SERVICES_URL = "/api/services/admin";

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role") || "";

if(!token || !["superadmin","admin","dispatcher"].includes(role)){
  window.location.href = "/admin/login.html";
  return;
}

let trips = [];
let services = [];
let editingId = null;
let googleLoadPromise = null;

const container =
  document.getElementById("dispatchTripsContainer") ||
  document.getElementById("dispatchReviewList") ||
  document.getElementById("tripsContainer");

function safe(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function clean(v){
  return String(v ?? "").trim();
}

function getId(t){
  return String(t?._id || t?.id || "");
}

function isReviewTrip(t){
  return (
    clean(t.status).toLowerCase() === "review" ||
    clean(t.reservationStatus).toLowerCase() === "review" ||
    t.reviewOnly === true
  );
}

function serviceLabel(t){
  return (
    t.serviceTitle ||
    t.serviceName ||
    t.serviceType ||
    t.serviceKey ||
    t.serviceCode ||
    "-"
  );
}

function stopsText(stops){
  if(!Array.isArray(stops)) return "";
  return stops.map(s=>{
    if(typeof s === "string") return s;
    return s?.address || "";
  }).filter(Boolean).join("\n");
}

function parseStops(text){
  return String(text || "")
    .split("\n")
    .map(x=>x.trim())
    .filter(Boolean);
}

/* ================= GOOGLE ================= */

async function ensureGoogle(){
  if(window.google && google.maps && google.maps.Geocoder) return;

  if(googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise(async(resolve,reject)=>{
    try{
      const res = await fetch("/api/config");
      const data = await res.json();

      if(!data.googleKey){
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.googleKey}`;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    }catch(e){
      resolve();
    }
  });

  return googleLoadPromise;
}

async function geocodeAddress(address){
  await ensureGoogle();

  if(!(window.google && google.maps && google.maps.Geocoder)){
    return {lat:null,lng:null};
  }

  return new Promise(resolve=>{
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({address},(results,status)=>{
      if(status !== "OK" || !results?.length){
        resolve({lat:null,lng:null});
        return;
      }

      const loc = results[0].geometry.location;
      resolve({
        lat:loc.lat(),
        lng:loc.lng()
      });
    });
  });
}

/* ================= LOAD ================= */

async function loadServices(){
  try{
    const res = await fetch(SERVICES_URL,{
      headers:{Authorization:"Bearer " + token}
    });
    const data = await res.json();

    services = Array.isArray(data)
      ? data
      : Array.isArray(data.services)
        ? data.services
        : Array.isArray(data.data)
          ? data.data
          : [];
  }catch(e){
    services = [];
  }
}

async function loadTrips(){
  if(!container) return;

  container.innerHTML = `<div style="font-weight:900;color:#64748b;">Loading review trips...</div>`;

  try{
    const res = await fetch(API_URL,{
      headers:{Authorization:"Bearer " + token}
    });

    const data = await res.json();

    if(!res.ok){
      throw new Error(data.message || "Failed loading trips");
    }

    trips = (Array.isArray(data) ? data : [])
      .filter(isReviewTrip)
      .sort((a,b)=>new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    render();

  }catch(err){
    console.error(err);
    container.innerHTML = `<div style="font-weight:900;color:#dc2626;">${safe(err.message || "Load failed")}</div>`;
  }
}

/* ================= RENDER ================= */

function render(){
  if(!container) return;

  if(!trips.length){
    container.innerHTML = `<div style="font-weight:900;color:#64748b;">No trips in review.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="width:100%;overflow-x:auto;background:#fff;border-radius:14px;border:1px solid #dbe3ee;">
      <table style="width:max-content;min-width:1800px;border-collapse:collapse;background:#fff;">
        <thead>
          <tr>
            <th>#</th>
            <th>Trip #</th>
            <th>Type</th>
            <th>Service</th>
            <th>Entry</th>
            <th>Entry Phone</th>
            <th>Client / Passengers</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Pickup</th>
            <th>Stops</th>
            <th>Dropoff</th>
            <th>Date</th>
            <th>Time</th>
            <th>Notes</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${trips.map((t,i)=>renderRow(t,i)).join("")}
        </tbody>
      </table>
    </div>
  `;

  injectTableStyle();
}

function renderRow(t,i){
  const id = getId(t);
  const editing = editingId === id;
  const isShared = t.isShared === true || String(t.tripType).toUpperCase() === "SHARED";

  if(editing){
    return renderEditRow(t,i,isShared);
  }

  const names = isShared
    ? (t.passengers || []).map((p,x)=>`${x+1}. ${safe(p.clientName || p.name || "")}`).join("<br>")
    : safe(t.clientName || "");

  const phones = isShared
    ? (t.passengers || []).map((p,x)=>`${x+1}. ${safe(p.clientPhone || p.phone || "")}`).join("<br>")
    : safe(t.clientPhone || "");

  const pickups = isShared
    ? (t.passengers || []).map((p,x)=>`${x+1}. ${safe(p.pickup || "")}`).join("<br>")
    : safe(t.pickup || "");

  const dropoffs = isShared
    ? (t.passengers || []).map((p,x)=>`${x+1}. ${safe(p.dropoff || "")}`).join("<br>")
    : safe(t.dropoff || "");

  return `
    <tr>
      <td>${i+1}</td>
      <td><b style="color:#1d4ed8;">${safe(t.tripNumber || "-")}</b></td>
      <td><b>${isShared ? "SHARED" : "INDIVIDUAL"}</b></td>
      <td>${safe(serviceLabel(t))}</td>
      <td>${safe(t.entryName || "")}</td>
      <td>${safe(t.entryPhone || "")}</td>
      <td class="wide">${names}</td>
      <td class="wide">${phones}</td>
      <td class="wide">${safe(t.clientEmail || "")}</td>
      <td class="wide">${pickups}</td>
      <td class="wide">${safe(stopsText(t.stops) || "-").replace(/\n/g,"<br>")}</td>
      <td class="wide">${dropoffs}</td>
      <td>${safe(t.tripDate || "")}</td>
      <td>${safe(t.tripTime || "")}</td>
      <td class="wide">${safe(t.notes || "")}</td>
      <td><b>Review</b></td>
      <td>
        <button class="editBtn" onclick="DispatchReview.edit('${id}')">Edit</button>
        <button class="confirmBtn" onclick="DispatchReview.confirm('${id}')">Confirm</button>
        <button class="deleteBtn" onclick="DispatchReview.delete('${id}')">Delete</button>
      </td>
    </tr>
  `;
}

function renderEditRow(t,i,isShared){
  const id = getId(t);

  if(isShared){
    return `
      <tr>
        <td>${i+1}</td>
        <td><b>${safe(t.tripNumber || "-")}</b></td>
        <td><b>SHARED</b></td>
        <td>${safe(serviceLabel(t))}</td>
        <td><input data-field="entryName" value="${safe(t.entryName || "")}"></td>
        <td><input data-field="entryPhone" value="${safe(t.entryPhone || "")}"></td>
        <td class="wide" colspan="6">
          ${(t.passengers || []).map((p,x)=>`
            <div style="border:1px solid #dbe3ee;border-radius:10px;padding:8px;margin-bottom:8px;">
              <b>Passenger ${x+1}</b><br>
              <input data-p="${x}" data-pfield="clientName" placeholder="Name" value="${safe(p.clientName || p.name || "")}">
              <input data-p="${x}" data-pfield="clientPhone" placeholder="Phone" value="${safe(p.clientPhone || p.phone || "")}">
              <input data-p="${x}" data-pfield="pickup" placeholder="Pickup" value="${safe(p.pickup || "")}">
              <input data-p="${x}" data-pfield="dropoff" placeholder="Dropoff" value="${safe(p.dropoff || "")}">
            </div>
          `).join("")}
        </td>
        <td><input type="date" data-field="tripDate" value="${safe(t.tripDate || "")}"></td>
        <td><input type="time" data-field="tripTime" value="${safe(t.tripTime || "")}"></td>
        <td class="wide"><textarea data-field="notes">${safe(t.notes || "")}</textarea></td>
        <td><b>Editing</b></td>
        <td>
          <button class="confirmBtn" onclick="DispatchReview.save('${id}')">Save</button>
          <button class="deleteBtn" onclick="DispatchReview.cancelEdit()">Cancel</button>
        </td>
      </tr>
    `;
  }

  return `
    <tr>
      <td>${i+1}</td>
      <td><b>${safe(t.tripNumber || "-")}</b></td>
      <td><b>INDIVIDUAL</b></td>
      <td>${safe(serviceLabel(t))}</td>
      <td><input data-field="entryName" value="${safe(t.entryName || "")}"></td>
      <td><input data-field="entryPhone" value="${safe(t.entryPhone || "")}"></td>
      <td class="wide"><input data-field="clientName" value="${safe(t.clientName || "")}"></td>
      <td class="wide"><input data-field="clientPhone" value="${safe(t.clientPhone || "")}"></td>
      <td class="wide"><input type="email" data-field="clientEmail" value="${safe(t.clientEmail || "")}"></td>
      <td class="wide"><textarea data-field="pickup">${safe(t.pickup || "")}</textarea></td>
      <td class="wide"><textarea data-field="stops">${safe(stopsText(t.stops))}</textarea></td>
      <td class="wide"><textarea data-field="dropoff">${safe(t.dropoff || "")}</textarea></td>
      <td><input type="date" data-field="tripDate" value="${safe(t.tripDate || "")}"></td>
      <td><input type="time" data-field="tripTime" value="${safe(t.tripTime || "")}"></td>
      <td class="wide"><textarea data-field="notes">${safe(t.notes || "")}</textarea></td>
      <td><b>Editing</b></td>
      <td>
        <button class="confirmBtn" onclick="DispatchReview.save('${id}')">Save</button>
        <button class="deleteBtn" onclick="DispatchReview.cancelEdit()">Cancel</button>
      </td>
    </tr>
  `;
}

/* ================= ACTIONS ================= */

async function confirmTrip(id){
  const trip = trips.find(t=>getId(t) === id);
  if(!trip) return;

  if(!confirm(`Confirm trip ${trip.tripNumber || ""}?`)) return;

  try{
    const res = await fetch(`${API_URL}/${id}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify({
        status:"RV",
        reservationStatus:"RV",
        reviewOnly:false,
        dispatchSelected:false,
        disabled:false
      })
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(data.message || "Confirm failed");
    }

    await loadTrips();
    alert("Trip sent to Trips Hub ✔");

  }catch(err){
    console.error(err);
    alert(err.message || "Confirm failed");
  }
}

async function deleteTrip(id){
  const trip = trips.find(t=>getId(t) === id);
  if(!trip) return;

  if(!confirm(`Delete trip ${trip.tripNumber || ""}?`)) return;

  try{
    const res = await fetch(`${API_URL}/${id}`,{
      method:"DELETE",
      headers:{Authorization:"Bearer " + token}
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(data.message || "Delete failed");
    }

    await loadTrips();

  }catch(err){
    console.error(err);
    alert(err.message || "Delete failed");
  }
}

function editTrip(id){
  editingId = id;
  render();
}

function cancelEdit(){
  editingId = null;
  render();
}

async function saveTrip(id){
  const row = document.querySelector(`tr input, tr textarea`)?.closest("tr");
  const trip = trips.find(t=>getId(t) === id);
  if(!trip) return;

  const editRow = [...document.querySelectorAll("tr")]
    .find(tr=>tr.innerHTML.includes(`DispatchReview.save('${id}')`));

  if(!editRow) return;

  const payload = {
    status:"Review",
    reservationStatus:"Review",
    reviewOnly:true
  };

  editRow.querySelectorAll("[data-field]").forEach(el=>{
    const field = el.dataset.field;

    if(field === "stops"){
      payload.stops = parseStops(el.value);
    }else{
      payload[field] = el.value;
    }
  });

  const oldPickup = clean(trip.pickup);
  const oldDropoff = clean(trip.dropoff);

  if(payload.pickup && clean(payload.pickup) !== oldPickup){
    const geo = await geocodeAddress(payload.pickup);
    payload.pickupLat = geo.lat;
    payload.pickupLng = geo.lng;
  }

  if(payload.dropoff && clean(payload.dropoff) !== oldDropoff){
    const geo = await geocodeAddress(payload.dropoff);
    payload.dropoffLat = geo.lat;
    payload.dropoffLng = geo.lng;
  }

  if(trip.isShared){
    const passengers = (trip.passengers || []).map(p=>({...p}));

    editRow.querySelectorAll("[data-p]").forEach(el=>{
      const i = Number(el.dataset.p);
      const f = el.dataset.pfield;

      if(!passengers[i]) return;
      passengers[i][f] = el.value;

      if(f === "clientName") passengers[i].name = el.value;
      if(f === "clientPhone") passengers[i].phone = el.value;
    });

    payload.passengers = passengers;
    payload.totalPassengers = passengers.length;
  }

  try{
    const res = await fetch(`${API_URL}/${id}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer " + token
      },
      body:JSON.stringify(payload)
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(data.message || "Save failed");
    }

    editingId = null;
    await loadTrips();

  }catch(err){
    console.error(err);
    alert(err.message || "Save failed");
  }
}

/* ================= STYLE ================= */

function injectTableStyle(){
  if(document.getElementById("dispatch-review-v2-style")) return;

  const style = document.createElement("style");
  style.id = "dispatch-review-v2-style";
  style.innerHTML = `
    table th{
      background:#2563eb;
      color:#fff;
      padding:8px;
      border:1px solid #dbe3ee;
      font-size:13px;
      white-space:nowrap;
    }
    table td{
      padding:8px;
      border:1px solid #dbe3ee;
      font-size:13px;
      text-align:center;
      vertical-align:top;
    }
    .wide{
      min-width:180px;
      max-width:300px;
      text-align:left;
      white-space:normal;
      word-break:break-word;
    }
    input,textarea{
      width:100%;
      padding:7px;
      border:1px solid #cbd5e1;
      border-radius:8px;
      font-weight:700;
      box-sizing:border-box;
    }
    textarea{
      min-height:60px;
      resize:vertical;
    }
    button{
      border:none;
      border-radius:8px;
      padding:8px 11px;
      margin:2px;
      font-weight:900;
      cursor:pointer;
      color:#fff;
    }
    .editBtn{background:#2563eb;}
    .confirmBtn{background:#16a34a;}
    .deleteBtn{background:#dc2626;}
  `;
  document.head.appendChild(style);
}

/* ================= EXPORT ================= */

window.DispatchReview = {
  edit:editTrip,
  save:saveTrip,
  confirm:confirmTrip,
  delete:deleteTrip,
  cancelEdit,
  reload:loadTrips
};

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded",async()=>{
  await loadServices();
  await loadTrips();
});

})();