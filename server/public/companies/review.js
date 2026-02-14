window.addEventListener("DOMContentLoaded", () => {

  const API_URL = "/api/trips";
  const HUB_URL = "/api/trips-hub";

  let trips = [];
  const container = document.getElementById("tripsContainer");

  /* ================= LOAD ================= */
  async function loadTrips(){
    try{
      const res = await fetch(API_URL);
      const data = await res.json();
      trips = Array.isArray(data) ? data : [];
    }catch(e){
      console.error("Load failed", e);
      trips = [];
    }
  }

  /* ================= SAVE ================= */
  async function saveTrips(){
    try{
      await fetch(API_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(trips)
      });
    }catch(e){
      console.error("Save failed",e);
    }
  }

  /* ================= SEND TO HUB ================= */
  async function sendToHub(trip){
    try{
      await fetch(HUB_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(trip)
      });
    }catch(e){
      console.error("Hub send failed",e);
    }
  }

  /* ================= KEEP 30 DAYS ================= */
  async function keepLast30Days(){
    const now = new Date();
    const beforeLen = trips.length;

    trips = trips.filter(t=>{
      if(!t.createdAt) return true; // keep if missing createdAt
      const created = new Date(t.createdAt);
      if(String(created) === "Invalid Date") return true;
      const diffDays = (now - created) / (1000*60*60*24);
      return diffDays <= 30;
    });

    if(trips.length !== beforeLen){
      await saveTrips();
    }
  }

  /* ================= SORT ================= */
  function sortTrips(){
    trips.sort((a,b)=>{
      const d1 = new Date(a.createdAt || 0).getTime();
      const d2 = new Date(b.createdAt || 0).getTime();
      return d2 - d1;
    });
  }

  /* ================= TIME (AZ) ================= */
  function getAZNow(){
    return new Date(
      new Date().toLocaleString("en-US",{timeZone:"America/Phoenix"})
    );
  }

  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;

    // parse local then convert to AZ displayed string, then Date again
    const raw = new Date(`${t.tripDate}T${t.tripTime}`);
    if(String(raw) === "Invalid Date") return null;

    return new Date(
      raw.toLocaleString("en-US",{timeZone:"America/Phoenix"})
    );
  }

  function minutesToTrip(t){
    const dt = getTripDateTime(t);
    if(!dt) return null;
    return (dt - getAZNow()) / 60000;
  }

  function inside120(t){
    const diff = minutesToTrip(t);
    return diff !== null && diff > 0 && diff <= 120;
  }

  function tripPassed(t){
    const diff = minutesToTrip(t);
    return diff !== null && diff <= 0;
  }

  function anyEditing(){
    return trips.some(t => t && t.editing);
  }

  /* ================= RENDER ================= */
  function render(){

    if(!container) return;
    container.innerHTML = "";

    const table = document.createElement("table");
    table.style.width="100%";
    table.style.tableLayout="fixed";
    table.style.borderCollapse="collapse";

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip #</th>
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

    trips.forEach((t,index)=>{

      const tr = document.createElement("tr");

      const passed = tripPassed(t);
      const in120 = inside120(t);

      // Row coloring
      if(passed){
        tr.style.background = "#ffcccc";
        tr.style.borderLeft = "4px solid red";
      } else if(in120){
        tr.style.background = "#fff3cd";
        tr.style.borderLeft = "4px solid orange";
      }

      // Cells (Edit mode uses inline inputs)
      const dateCell = t.editing
        ? `<input type="date" class="edit-date" value="${t.tripDate || ""}" />`
        : (t.tripDate || "");

      const timeCell = t.editing
        ? `<input type="time" class="edit-time" value="${t.tripTime || ""}" />`
        : (t.tripTime || "");

      // Actions policy
      let actions = "";

      if(t.status === "Cancelled" || passed){
        actions = "";
      }
      else if(t.status === "Confirmed"){

        // Confirmed + inside120 => ONLY Cancel
        if(in120){
          actions = `<button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>`;
        } else {
          // Confirmed + not inside120 => Edit + Delete + Cancel
          actions = `
            <button class="btn edit" onclick="editTrip(${index})">${t.editing ? "Save" : "Edit"}</button>
            <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
            <button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>
          `;
        }
      }
      else{
        // Scheduled => Delete + Edit/Save + Confirm
        actions = `
          <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
          <button class="btn edit" onclick="editTrip(${index})">${t.editing ? "Save" : "Edit"}</button>
          <button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>
        `;
      }

      tr.innerHTML = `
        <td>${index+1}</td>
        <td>${t.tripNumber || ""}</td>
        <td>${t.clientName || ""}</td>
        <td>${t.clientPhone || ""}</td>
        <td>${t.pickup || ""}</td>
        <td>${t.dropoff || ""}</td>
        <td>${dateCell}</td>
        <td>${timeCell}</td>
        <td>${t.status || "Scheduled"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  /* ================= ACTIONS ================= */

  window.confirmTrip = async function(i){
    const t = trips[i];
    if(!t) return;

    if(tripPassed(t)){
      alert("Trip time has already passed. Cannot confirm.");
      return;
    }

    // Confirm is the ONLY action that sends to hub
    t.status = "Confirmed";
    t.editing = false;

    await sendToHub(t);
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    const t = trips[i];
    if(!t) return;

    // Cancel allowed only while not passed (already handled by UI)
    t.status = "Cancelled";
    t.editing = false;

    await saveTrips();
    render();
  };

  window.deleteTrip = async function(i){
    if(!confirm("Delete this trip?")) return;

    trips.splice(i,1);
    await saveTrips();
    render();
  };

  window.editTrip = async function(i){
    const t = trips[i];
    if(!t) return;

    if(tripPassed(t)){
      alert("Trip time already passed.");
      return;
    }

    // Toggle ON
    if(!t.editing){
      // close others edit modes
      trips.forEach((x,idx)=>{ if(idx !== i && x) x.editing = false; });
      t.editing = true;
      render();
      return;
    }

    // SAVE mode
    const row = container.querySelectorAll("tr")[i+1];
    if(!row){
      // fallback
      t.editing = false;
      render();
      return;
    }

    const dateEl = row.querySelector(".edit-date");
    const timeEl = row.querySelector(".edit-time");

    const newDate = dateEl ? dateEl.value : t.tripDate;
    const newTime = timeEl ? timeEl.value : t.tripTime;

    if(!newDate || !newTime){
      alert("Please enter a valid date and time.");
      return;
    }

    const temp = { tripDate:newDate, tripTime:newTime };

    if(inside120(temp)){
      const ok = confirm("This trip is within 120 minutes and cannot be edited. Continue anyway?");
      if(!ok) return;
    }

    t.tripDate = newDate;
    t.tripTime = newTime;

    // stays Scheduled unless Confirm pressed
    t.status = "Scheduled";
    t.editing = false;

    await saveTrips();
    render();
  };

  /* ================= REFRESH LOOP =================
     - If user is editing: do NOT reload from server (avoid losing inputs)
     - Otherwise: reload, keep 30 days, sort, render
  ================================================== */
  setInterval(async () => {
    try{
      if(anyEditing()){
        render(); // update colors/time only
        return;
      }
      await loadTrips();
      await keepLast30Days();
      sortTrips();
      render();
    }catch(e){
      console.error("Refresh failed", e);
    }
  }, 30000);

  /* ================= INIT ================= */
  (async function(){
    await loadTrips();
    await keepLast30Days();
    sortTrips();
    render();
  })();

});