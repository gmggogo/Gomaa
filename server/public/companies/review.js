window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");

/* ================= INLINE STYLE ================= */

(function injectReviewStyles(){

const oldStyle = document.getElementById("review-inline-style");
if(oldStyle) oldStyle.remove();

const style = document.createElement("style");
style.id = "review-inline-style";

style.innerHTML = `
  #tripsContainer .review-table{
    width:100%;
    border-collapse:collapse;
    margin-bottom:20px;
    background:#fff;
  }

  #tripsContainer .review-table th,
  #tripsContainer .review-table td{
    border:1px solid #dbe2ea;
    padding:8px;
    text-align:center;
    font-size:14px;
    vertical-align:middle;
  }

  #tripsContainer .review-table th{
    background:#0f172a;
    color:#fff;
  }

  #tripsContainer .review-table input{
    width:100%;
    box-sizing:border-box;
    padding:6px 8px;
    border:1px solid #cbd5e1;
    border-radius:6px;
    font-size:13px;
    background:#fff;
  }

  #tripsContainer .date-title{
    font-size:18px;
    font-weight:700;
    margin:20px 0 10px;
    color:#0f172a;
  }

  #tripsContainer .btn{
    border:none;
    border-radius:6px;
    padding:6px 10px;
    font-size:13px;
    font-weight:700;
    cursor:pointer;
    margin:2px;
  }

  #tripsContainer .btn.edit{background:#2563eb;color:#fff;}
  #tripsContainer .btn.delete{background:#111827;color:#fff;}
  #tripsContainer .btn.confirm{background:#16a34a;color:#fff;}
  #tripsContainer .btn.cancel{background:#dc2626;color:#fff;}

  /* ===== COLOR POLICY ===== */

  #tripsContainer tr.scheduled-row{
    background:#ffffff;
    color:#111827;
  }

  #tripsContainer tr.confirmed-row{
    background:#22c55e;
    color:#111827;
  }

  #tripsContainer tr.cancelled-row{
    background:#ef4444;
    color:#111827;
  }

  #tripsContainer tr.yellow{
    background:#fde047;
    color:#111827;
  }

  #tripsContainer tr.red-verylight{
    background:#fee2e2;
    color:#111827;
  }

  #tripsContainer tr.red-light{
    background:#fecaca;
    color:#111827;
  }

  #tripsContainer tr.red-mid{
    background:#fca5a5;
    color:#111827;
  }

  #tripsContainer tr.red-dark{
    background:#7f1d1d;
    color:#ffffff;
  }

  /* blink only for confirmed very close trips */
  @keyframes tripBlink {
    0% { opacity:1; }
    50% { opacity:.85; }
    100% { opacity:1; }
  }

  #tripsContainer tr.trip-blink{
    animation:tripBlink 2.4s infinite;
  }
`;

document.head.appendChild(style);

})();

/* ================= TIME HELPERS ================= */

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

/* ================= SERVER ================= */

async function fetchTrips(){

  const url = companyName
    ? "/api/trips/company/" + encodeURIComponent(companyName)
    : "/api/trips/company";

  const res = await fetch(url,{
    headers:{
      "Authorization":"Bearer " + token
    }
  });

  if(!res.ok){
    container.innerHTML = "<div>Server Error Loading Trips</div>";
    return [];
  }

  return await res.json();
}

async function updateTrip(id,payload){

  const res = await fetch("/api/trips/" + id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer " + token
    },
    body:JSON.stringify(payload)
  });

  if(!res.ok) throw new Error("Update failed");

  return await res.json();
}

async function deleteTrip(id){

  const res = await fetch("/api/trips/" + id,{
    method:"DELETE",
    headers:{
      "Authorization":"Bearer " + token
    }
  });

  if(!res.ok) throw new Error("Delete failed");
}

/* ================= GROUP ================= */

function keepLast30Days(list){

  const now = new Date();

  return list.filter(t=>{

    if(!t.createdAt) return true;

    const c = new Date(t.createdAt);

    if(String(c) === "Invalid Date") return true;

    return (now - c) / (1000*60*60*24) <= 30;

  });

}

function groupByCreatedDate(list){

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

  const filtered = keepLast30Days(trips);
  const groups = groupByCreatedDate(filtered);
  const dates = Object.keys(groups).sort((a,b)=>new Date(b)-new Date(a));

  if(!dates.length){
    container.innerHTML = "<div style='padding:15px'>No trips found.</div>";
    return;
  }

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
<th>Entry Name</th>
<th>Entry Phone</th>
<th>Client</th>
<th>Phone</th>
<th>Pickup</th>
<th>Drop</th>
<th>Stops</th>
<th>Date</th>
<th>Time</th>
<th>Notes</th>
<th>Status</th>
<th>Actions</th>
</tr>
`;

    groups[date].forEach((t,i)=>{

      const mins = minutesToTrip(t);

      if(mins !== null && mins < -60) return;

      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      /* ================= COLOR POLICY ================= */

      tr.className = "";
      tr.classList.add("scheduled-row");

      if(t.status === "Cancelled"){

        tr.className = "";
        tr.classList.add("cancelled-row");

      }else if(mins !== null && mins > 0 && mins <= 180){

        tr.className = "";

        if(mins <= 30){
          tr.classList.add("red-dark");
          if(t.status === "Confirmed"){
            tr.classList.add("trip-blink");
          }
        }
        else if(mins <= 60){
          tr.classList.add("red-mid");
        }
        else if(mins <= 90){
          tr.classList.add("red-light");
        }
        else if(mins <= 120){
          tr.classList.add("red-verylight");
        }
        else{
          tr.classList.add("yellow");
        }

      }else if(t.status === "Confirmed"){

        tr.className = "";
        tr.classList.add("confirmed-row");

      }

      const editing = t.__editing === true;

      function cell(val,cls,type="text"){
        if(!editing) return escapeHtml(val || "");
        return `<input type="${type}" class="${cls}" value="${escapeHtml(val || "")}">`;
      }

      const stopsText = Array.isArray(t.stops) ? t.stops.join(" | ") : "";

      /* ================= ACTION POLICY ================= */

      let actions = "";

      if(t.status === "Cancelled"){

        actions = "";

      }

      else if(t.status === "Confirmed"){

        if(mins !== null && mins <= 120){

          actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;

        }else{

          actions = editing
            ? `<button class="btn edit" data-action="edit">Save</button>`
            : `
<button class="btn edit" data-action="edit">Edit</button>
<button class="btn delete" data-action="delete">Delete</button>
<button class="btn confirm" data-action="confirm">Confirm</button>
`;

        }

      }

      else if(t.status === "Scheduled"){

        if(mins !== null && mins > 120){

          actions = editing
            ? `<button class="btn edit" data-action="edit">Save</button>`
            : `
<button class="btn edit" data-action="edit">Edit</button>
<button class="btn delete" data-action="delete">Delete</button>
<button class="btn confirm" data-action="confirm">Confirm</button>
`;

        }else if(mins !== null && mins > 0 && mins <= 120){

          actions = `
<button class="btn confirm" data-action="confirm">Confirm</button>
<button class="btn cancel" data-action="cancel">Cancel</button>
`;

        }

      }

      const stopsCell = editing
        ? `<input type="text" class="stops" value="${escapeHtml(stopsText)}">`
        : escapeHtml(stopsText);

      tr.innerHTML = `
<td>${i+1}</td>
<td>${escapeHtml(t.tripNumber || "")}</td>
<td>${cell(t.entryName,"entryName")}</td>
<td>${cell(t.entryPhone,"entryPhone")}</td>
<td>${cell(t.clientName,"clientName")}</td>
<td>${cell(t.clientPhone,"clientPhone")}</td>
<td>${cell(t.pickup,"pickup")}</td>
<td>${cell(t.dropoff,"dropoff")}</td>
<td>${stopsCell}</td>
<td>${cell(t.tripDate,"tripDate","date")}</td>
<td>${cell(t.tripTime,"tripTime","time")}</td>
<td>${cell(t.notes,"notes")}</td>
<td>${escapeHtml(t.status || "Scheduled")}</td>
<td>${actions}</td>
`;

      table.appendChild(tr);

    });

    container.appendChild(table);

  });

}

function isAnyEditing(){
  return trips.some(t=>t.__editing === true);
}

/* ================= ACTIONS ================= */

container.addEventListener("click",async(e)=>{

  const btn = e.target.closest("button");
  if(!btn) return;

  const tr = btn.closest("tr");
  if(!tr) return;

  const id = tr.dataset.id;
  const t = trips.find(x=>x._id === id);
  if(!t) return;

  const action = btn.dataset.action;

  try{

    if(action === "confirm"){

      await updateTrip(id,{status:"Confirmed"});

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "cancel"){

      if(!confirm("Cancel this trip?")) return;

      await updateTrip(id,{status:"Cancelled"});

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "delete"){

      if(!confirm("Delete this trip?")) return;

      await deleteTrip(id);

      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "edit"){

      if(!t.__editing){
        t.__editing = true;
        render();
        return;
      }

      const newDate = tr.querySelector(".tripDate")?.value || t.tripDate;
      const newTime = tr.querySelector(".tripTime")?.value || t.tripTime;

      /* ================= WARNING 120 ================= */

      const newTripTime = new Date(newDate + "T" + newTime + ":00");
      const minsToNewTrip = (newTripTime - getAZNow()) / 60000;

      if(minsToNewTrip <= 120){
        const ok = confirm("WARNING: Trip is within 120 minutes. It cannot be edited or deleted. Continue?");
        if(!ok) return;
      }

      const payload = {
        entryName: tr.querySelector(".entryName")?.value || t.entryName,
        entryPhone: tr.querySelector(".entryPhone")?.value || t.entryPhone,
        clientName: tr.querySelector(".clientName")?.value || t.clientName,
        clientPhone: tr.querySelector(".clientPhone")?.value || t.clientPhone,
        pickup: tr.querySelector(".pickup")?.value || t.pickup,
        dropoff: tr.querySelector(".dropoff")?.value || t.dropoff,
        notes: tr.querySelector(".notes")?.value || t.notes,
        stops: tr.querySelector(".stops")?.value
          ? tr.querySelector(".stops").value.split("|").map(s=>s.trim()).filter(Boolean)
          : (t.stops || []),
        tripDate: newDate,
        tripTime: newTime,
        status: "Scheduled"
      };

      t.__editing = false;

      await updateTrip(id,payload);

      trips = await fetchTrips();
      render();
      return;
    }

  }catch(err){
    alert("Server Error: " + err.message);
  }

});

/* ================= INIT ================= */

async function loadTrips(){
  try{
    trips = await fetchTrips();
    render();
  }catch(err){
    container.innerHTML = "<div>Server Load Error</div>";
  }
}

await loadTrips();

/* ================= AUTO REFRESH ================= */

setInterval(async()=>{

  if(isAnyEditing()) return;

  try{
    trips = await fetchTrips();
    render();
  }catch(err){
    console.error("Auto refresh failed",err);
  }

},30000);

});