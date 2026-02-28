window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");

if (!token || role !== "company") {
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");

/* ================= TIME HELPERS ================= */

function getAZNow(){
  return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
}

function getTripDateTime(t){
  if(!t.tripDate || !t.tripTime) return null;
  const dt = new Date(t.tripDate + "T" + t.tripTime);
  return String(dt) === "Invalid Date" ? null : dt;
}

function minutesToTrip(t){
  const dt = getTripDateTime(t);
  if(!dt) return null;
  return (dt - getAZNow()) / 60000;
}

function isWithin120(t){
  const mins = minutesToTrip(t);
  return mins !== null && mins > 0 && mins <= 120;
}

/* ================= SERVER ================= */

async function fetchTrips(){
  const res = await fetch("/api/trips/company", {
    headers: {
      "Authorization": "Bearer " + token
    }
  });

  if(!res.ok){
    container.innerHTML = "<div>Server Error Loading Trips</div>";
    return [];
  }

  return await res.json();
}

async function updateTrip(id, payload){
  const res = await fetch("/api/trips/" + id, {
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer " + token
    },
    body: JSON.stringify(payload)
  });

  if(!res.ok) throw new Error("Update failed");
  return await res.json();
}

async function deleteTrip(id){
  const res = await fetch("/api/trips/" + id, {
    method:"DELETE",
    headers:{ "Authorization":"Bearer " + token }
  });

  if(!res.ok) throw new Error("Delete failed");
}

/* ================= GROUP + FILTER ================= */

function keepLast30Days(list){
  const now = new Date();
  return list.filter(t=>{
    if(!t.createdAt) return true;
    const c = new Date(t.createdAt);
    if(String(c)==="Invalid Date") return true;
    return (now - c)/(1000*60*60*24) <= 30;
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
  const dates = Object.keys(groups).sort((a,b)=> new Date(b) - new Date(a));

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
        return `<input type="${type}" class="${cls}" value="${val || ""}">`;
      }

      const stopsText = Array.isArray(t.stops)
        ? t.stops.join(" | ")
        : "";

      let actions = "";

      if(isWithin120(t)){
        actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;
      } else {
        if(t.status === "Confirmed"){
          actions = `<button class="btn cancel" data-action="cancel">Cancel</button>`;
        } else {
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

/* ================= ACTIONS ================= */

container.addEventListener("click", async (e)=>{

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
      await updateTrip(id,{ status:"Confirmed" });
      trips = await fetchTrips();
      render();
      return;
    }

    if(action === "cancel"){
      if(!confirm("Cancel this trip?")) return;
      await updateTrip(id,{ status:"Cancelled" });
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

      const temp = { ...t, tripDate:newDate, tripTime:newTime };

      if(isWithin120(temp)){
        const ok = confirm("WARNING: Trip is within 120 minutes. Continue?");
        if(!ok) return;
      }

      const payload = {
        entryName: tr.querySelector(".entryName")?.value || t.entryName,
        entryPhone: tr.querySelector(".entryPhone")?.value || t.entryPhone,
        clientName: tr.querySelector(".clientName")?.value || t.clientName,
        clientPhone: tr.querySelector(".clientPhone")?.value || t.clientPhone,
        pickup: tr.querySelector(".pickup")?.value || t.pickup,
        dropoff: tr.querySelector(".dropoff")?.value || t.dropoff,
        tripDate:newDate,
        tripTime:newTime,
        status:"Scheduled"
      };

      t.__editing = false;

      await updateTrip(id,payload);
      trips = await fetchTrips();
      render();
    }

  }catch(err){
    alert("Server Error: " + err.message);
  }

});

/* ================= INIT ================= */

try{
  trips = await fetchTrips();
  render();
}catch(err){
  container.innerHTML = "<div>Server Load Error</div>";
}

});