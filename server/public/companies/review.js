window.addEventListener("DOMContentLoaded", () => {

/* ===============================
   AUTH
================================ */
let loggedCompany = null;
try { loggedCompany = JSON.parse(localStorage.getItem("loggedCompany")); } catch {}

if(!loggedCompany || !loggedCompany.name){
  window.location.href = "company-login.html";
  return;
}

/* ===============================
   DOM
================================ */
const container = document.getElementById("tripsContainer");

/* ================= CLOCK ================= */
function updateClock(){
  const el = document.getElementById("azDateTime");
  if(!el) return;

  el.innerText = new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Phoenix",
    year:"numeric",month:"short",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit"
  }).format(new Date());
}
setInterval(updateClock,1000);
updateClock();

/* ================= GREETING ================= */
const g = document.getElementById("greetingText");
if(g){
  const h = new Date().getHours();
  g.innerText = h<12?"Good Morning ☀️":h<18?"Good Afternoon 🌤":"Good Evening 🌙";
}

/* ================= TIME HELPERS ================= */
function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}
function getTripDT(t){
  if(!t.tripDate || !t.tripTime) return null;
  const dt = new Date(t.tripDate + "T" + t.tripTime);
  return String(dt) === "Invalid Date" ? null : dt;
}
function minutesToTrip(t){
  const dt = getTripDT(t);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}
function isWithin120(t){
  const mins = minutesToTrip(t);
  return mins !== null && mins > 0 && mins <= 120;
}

/* ================= DATA ================= */
let trips = []; // loaded from server (company only)

/* ================= SERVER API ================= */
async function fetchTrips(){
  const res = await fetch("/api/trips/company/" + encodeURIComponent(loggedCompany.name));
  if(!res.ok) throw new Error("Failed to load trips");
  trips = await res.json();

  // normalize createdAt to ISO for grouping
  trips = (Array.isArray(trips) ? trips : []).map(t => {
    if(t.createdAt && typeof t.createdAt === "string") return t;
    if(t.createdAt && typeof t.createdAt === "object") return t;
    return t;
  });
}

async function updateTrip(id, payload){
  const res = await fetch("/api/trips/" + id, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error("Update failed");
  return await res.json();
}

async function deleteTrip(id){
  const res = await fetch("/api/trips/" + id, { method:"DELETE" });
  if(!res.ok) throw new Error("Delete failed");
  return true;
}

/* ================= KEEP 30 DAYS ================= */
function keep30Days(list){
  const now = new Date();
  return list.filter(t=>{
    const c = t.createdAt ? new Date(t.createdAt) : null;
    if(!c || String(c)==="Invalid Date") return true;
    return (now - c) / (1000*60*60*24) <= 30;
  });
}

/* ================= GROUP BY CREATED DATE ================= */
function groupByCreated(list){
  const groups = {};
  list.forEach(t=>{
    const dObj = t.createdAt ? new Date(t.createdAt) : new Date();
    const key = dObj.toLocaleDateString();
    if(!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  return groups;
}

/* ================= RENDER ================= */
function render(){
  container.innerHTML = "";

  const filtered = keep30Days(trips);
  const groups = groupByCreated(filtered);

  const dates = Object.keys(groups).sort((a,b)=> new Date(b) - new Date(a));

  if(!dates.length){
    container.innerHTML = "<div style='padding:10px'>No trips found.</div>";
    return;
  }

  dates.forEach(date=>{
    const title = document.createElement("div");
    title.className = "date-title";
    title.innerText = date;
    container.appendChild(title);

    const table = document.createElement("table");

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip#</th>
        <th>Entered By</th>
        <th>Entered Phone</th>
        <th>Client</th>
        <th>Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Stops</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    groups[date].forEach((t,i)=>{

      const tr = document.createElement("tr");
      tr.dataset.id = t._id;

      const mins = minutesToTrip(t);
      if(mins!==null && mins>0 && mins<=120) tr.classList.add("yellow");
      if(mins!==null && mins<=0) tr.classList.add("red");

      const editing = t.__editing === true;

      function cell(val, cls, type="text"){
        if(!editing) return (val || "");
        return `<input type="${type}" class="edit-input ${cls}" value="${val || ""}">`;
      }

      const stopsText = Array.isArray(t.stops) ? t.stops.join(" | ") : "";

      let actions = "";
      // ✅ قوانينك:
      // داخل 120 دقيقة: Cancel فقط (حتى لو Scheduled أو Confirmed)
      // خارج 120:
      //    لو Confirmed: Cancel فقط
      //    لو غير Confirmed: Edit/Delete/Confirm
      if(isWithin120(t)){
        actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;
      }else{
        if(t.status === "Confirmed"){
          actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;
        }else{
          actions = `
            <button class="btn edit" data-action="edit">${editing ? "Save" : "Edit"}</button>
            <button class="btn delete" data-action="delete">Delete</button>
            <button class="btn confirm" data-action="confirm">Confirm</button>
          `;
        }
      }

      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${t.tripNumber || ""}</td>
        <td>${cell(t.entryName,"entryName")}</td>
        <td>${cell(t.entryPhone,"entryPhone")}</td>
        <td>${cell(t.clientName,"clientName")}</td>
        <td>${cell(t.clientPhone,"clientPhone")}</td>
        <td>${cell(t.pickup,"pickup")}</td>
        <td>${cell(t.dropoff,"dropoff")}</td>
        <td>${stopsText}</td>
        <td>${cell(t.tripDate,"tripDate","date")}</td>
        <td>${cell(t.tripTime,"tripTime","time")}</td>
        <td>${t.status || "Scheduled"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  });
}

/* ================= EVENTS (Delegation) ================= */
container.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button");
  if(!btn) return;

  const tr = e.target.closest("tr");
  if(!tr) return;

  const id = tr.dataset.id;
  if(!id) return;

  const action = btn.dataset.action;
  const t = trips.find(x => x._id === id);
  if(!t) return;

  try{

    // ===== CONFIRM =====
    if(action === "confirm"){
      t.status = "Confirmed";
      t.__editing = false;
      await updateTrip(id, { status:"Confirmed" });
      await fetchTrips();
      render();
      return;
    }

    // ===== CANCEL =====
    if(action === "cancel"){
      if(!confirm("Are you sure you want to cancel this trip?")) return;
      t.status = "Cancelled";
      t.__editing = false;
      await updateTrip(id, { status:"Cancelled" });
      await fetchTrips();
      render();
      return;
    }

    // ===== DELETE =====
    if(action === "delete"){
      if(!confirm("Delete this trip?")) return;
      await deleteTrip(id);
      await fetchTrips();
      render();
      return;
    }

    // ===== EDIT / SAVE =====
    if(action === "edit"){

      // Enter edit mode
      if(!t.__editing){
        t.__editing = true;
        render();
        return;
      }

      // Save edits
      const newDate = tr.querySelector(".tripDate")?.value || t.tripDate;
      const newTime = tr.querySelector(".tripTime")?.value || t.tripTime;

      const temp = { ...t, tripDate:newDate, tripTime:newTime };

      // ✅ تحذير 120 دقيقة عند الحفظ لو التعديل دخّلها 120
      if(isWithin120(temp)){
        const ok = confirm("WARNING:\nThis trip is within 120 minutes.\nAre you sure you want to modify it?");
        if(!ok) return;
      }

      const payload = {
        entryName:   tr.querySelector(".entryName")?.value || t.entryName,
        entryPhone:  tr.querySelector(".entryPhone")?.value || t.entryPhone,
        clientName:  tr.querySelector(".clientName")?.value || t.clientName,
        clientPhone: tr.querySelector(".clientPhone")?.value || t.clientPhone,
        pickup:      tr.querySelector(".pickup")?.value || t.pickup,
        dropoff:     tr.querySelector(".dropoff")?.value || t.dropoff,
        tripDate:    newDate,
        tripTime:    newTime,

        // ✅ قانونك: بعد التعديل يرجع Scheduled
        status: "Scheduled"
      };

      t.__editing = false;

      await updateTrip(id, payload);
      await fetchTrips();
      render();
      return;
    }

  }catch(err){
    alert("Server Error: " + err.message);
  }
});

/* ================= INIT ================= */
(async ()=>{
  try{
    await fetchTrips();
    render();
  }catch(err){
    container.innerHTML = "<div style='padding:10px'>Server Error loading trips.</div>";
  }
})();

});