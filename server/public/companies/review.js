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
      console.error("Save failed", e);
    }
  }

  /* ================= SEND TO HUB (CONFIRM ONLY) ================= */
  async function sendToHub(trip){
    try{
      await fetch(HUB_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(trip)
      });
    }catch(e){
      console.error("Hub send failed", e);
    }
  }

  /* ================= NORMALIZE ================= */
  function normalizeTrips(){
    const nowISO = new Date().toISOString();
    trips.forEach(t=>{
      if(!t.createdAt) t.createdAt = nowISO;
      if(!t.status) t.status = "Scheduled";
      if(typeof t.editing !== "boolean") t.editing = false;
    });
  }

  /* ================= KEEP 30 DAYS ================= */
  async function keepLast30Days(){
    const now = new Date();
    const before = trips.length;

    trips = trips.filter(t=>{
      if(!t.createdAt) return true;
      const created = new Date(t.createdAt);
      if(String(created) === "Invalid Date") return true;
      const diffDays = (now - created) / (1000*60*60*24);
      return diffDays <= 30;
    });

    if(trips.length !== before){
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

  /* ================= TIME (ARIZONA) ================= */
  function getAZNow(){
    return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
  }

  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;

    // Treat tripDate/time as Arizona local time
    const raw = new Date(`${t.tripDate}T${t.tripTime}`);
    if(String(raw) === "Invalid Date") return null;

    return new Date(raw.toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
  }

  function minutesToTrip(t){
    const dt = getTripDateTime(t);
    if(!dt) return null;
    return (dt - getAZNow()) / 60000;
  }

  function inside120(t){
    const m = minutesToTrip(t);
    return m !== null && m > 0 && m <= 120;
  }

  function tripPassed(t){
    const m = minutesToTrip(t);
    return m !== null && m <= 0;
  }

  function anyEditing(){
    return trips.some(t => t && t.editing);
  }

  /* ================= RENDER ================= */
  function render(){

    if(!container) return;
    container.innerHTML = "";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.tableLayout = "fixed";
    table.style.borderCollapse = "collapse";

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
      const in120  = inside120(t);

      // Row colors
      if(passed){
        tr.style.background = "#ffcccc";
        tr.style.borderLeft = "4px solid red";
      }else if(in120){
        tr.style.background = "#fff3cd";
        tr.style.borderLeft = "4px solid orange";
      }

      const editing = t.editing === true;

      // Editable cells (EXCEPT Trip Number)
      const clientCell = editing
        ? `<input class="edit-client" value="${t.clientName||""}"/>`
        : (t.clientName||"");

      const phoneCell = editing
        ? `<input class="edit-phone" value="${t.clientPhone||""}"/>`
        : (t.clientPhone||"");

      const pickupCell = editing
        ? `<input class="edit-pickup" value="${t.pickup||""}"/>`
        : (t.pickup||"");

      const dropCell = editing
        ? `<input class="edit-drop" value="${t.dropoff||""}"/>`
        : (t.dropoff||"");

      const dateCell = editing
        ? `<input type="date" class="edit-date" value="${t.tripDate||""}"/>`
        : (t.tripDate||"");

      const timeCell = editing
        ? `<input type="time" class="edit-time" value="${t.tripTime||""}"/>`
        : (t.tripTime||"");

      /* ================= BUTTON POLICY =================
         - Passed or Cancelled => no actions
         - Scheduled (any time before passed) => Delete + Edit/Save + Confirm
         - Confirmed + inside120 => ONLY Cancel
         - Confirmed + >120 => Edit/Save + Delete + Cancel
         - Confirm sends to Hub and switches to Confirmed
      ================================================== */
      let actions = "";

      if(t.status === "Cancelled" || passed){
        actions = "";
      }
      else if(t.status === "Confirmed"){
        if(in120){
          actions = `<button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>`;
        }else{
          actions = `
            <button class="btn edit" onclick="editTrip(${index})">${editing ? "Save" : "Edit"}</button>
            <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
            <button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>
          `;
        }
      }
      else { // Scheduled
        actions = `
          <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
          <button class="btn edit" onclick="editTrip(${index})">${editing ? "Save" : "Edit"}</button>
          <button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>
        `;
      }

      tr.innerHTML = `
        <td>${index+1}</td>
        <td>${t.tripNumber||""}</td>
        <td>${clientCell}</td>
        <td>${phoneCell}</td>
        <td>${pickupCell}</td>
        <td>${dropCell}</td>
        <td>${dateCell}</td>
        <td>${timeCell}</td>
        <td>${t.status||"Scheduled"}</td>
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

    // Confirm ONLY sends to Hub
    t.status = "Confirmed";
    t.editing = false;

    await sendToHub(t);
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    const t = trips[i];
    if(!t) return;

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

    // Toggle ON (Edit mode)
    if(!t.editing){
      // Close other rows editing
      trips.forEach((x,idx)=>{ if(x && idx !== i) x.editing = false; });
      t.editing = true;
      render();
      return;
    }

    // SAVE mode
    const row = container.querySelectorAll("tr")[i+1];
    if(!row){
      t.editing = false;
      render();
      return;
    }

    const newClient = row.querySelector(".edit-client")?.value ?? (t.clientName||"");
    const newPhone  = row.querySelector(".edit-phone")?.value ?? (t.clientPhone||"");
    const newPickup = row.querySelector(".edit-pickup")?.value ?? (t.pickup||"");
    const newDrop   = row.querySelector(".edit-drop")?.value ?? (t.dropoff||"");
    const newDate   = row.querySelector(".edit-date")?.value ?? (t.tripDate||"");
    const newTime   = row.querySelector(".edit-time")?.value ?? (t.tripTime||"");

    if(!newDate || !newTime){
      alert("Please enter a valid date and time.");
      return;
    }

    // Warning when saving changes that make trip <=120 minutes
    const tempTrip = { ...t, tripDate:newDate, tripTime:newTime };
    const mins = minutesToTrip(tempTrip);

    if(mins !== null && mins > 0 && mins <= 120){
      const ok = confirm(
        "⚠️ This trip is within 120 minutes of departure and cannot be modified.\n" +
        "Do you want to continue?"
      );
      if(!ok) return;
    }

    // Apply changes (Trip Number stays locked)
    t.clientName  = newClient;
    t.clientPhone = newPhone;
    t.pickup      = newPickup;
    t.dropoff     = newDrop;
    t.tripDate    = newDate;
    t.tripTime    = newTime;

    // Editing always resets to Scheduled until Confirm
    t.status = "Scheduled";
    t.editing = false;

    await saveTrips();
    render();
  };

  /* ================= AUTO REFRESH =================
     - If editing: only render (avoid losing inputs)
     - If not editing: reload from server + keep 30 days + sort + render
  ================================================= */
  setInterval(async () => {
    try{
      if(anyEditing()){
        render();
        return;
      }
      await loadTrips();
      normalizeTrips();
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
    normalizeTrips();
    await keepLast30Days();
    sortTrips();
    render();
  })();

});