window.addEventListener("DOMContentLoaded", () => {

  const API_URL = "/api/trips";
  const HUB_URL = "/api/trips-hub";

  const container = document.getElementById("tripsContainer");
  const searchBox = document.getElementById("searchBox");

  let trips = [];

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

      if(!t.enteredBy) t.enteredBy = "";
      if(!t.enteredPhone) t.enteredPhone = "";

      if(!t.clientName) t.clientName = "";
      if(!t.clientPhone) t.clientPhone = "";
      if(!t.pickup) t.pickup = "";
      if(!t.dropoff) t.dropoff = "";
      if(!t.tripDate) t.tripDate = "";
      if(!t.tripTime) t.tripTime = "";
      if(!t.tripNumber) t.tripNumber = "";
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
    trips.sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
  }

  /* ================= TIME (ARIZONA) ================= */
  function getAZNow(){
    return new Date(new Date().toLocaleString("en-US",{ timeZone:"America/Phoenix" }));
  }

  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;

    const [y,m,d] = t.tripDate.split("-");
    const [hh,mm] = t.tripTime.split(":");
    if(!y || !m || !d || hh === undefined || mm === undefined) return null;

    const dt = new Date(Number(y), Number(m)-1, Number(d), Number(hh), Number(mm));
    return String(dt) === "Invalid Date" ? null : dt;
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

  /* ================= FILTER ================= */
  function getFilteredTrips(){
    const q = (searchBox?.value || "").trim().toLowerCase();
    if(!q) return trips;

    return trips.filter(t=>{
      return (
        (t.tripNumber||"").toLowerCase().includes(q) ||
        (t.clientName||"").toLowerCase().includes(q) ||
        (t.clientPhone||"").toLowerCase().includes(q) ||
        (t.pickup||"").toLowerCase().includes(q) ||
        (t.dropoff||"").toLowerCase().includes(q)
      );
    });
  }

  /* ================= RENDER ================= */
  function render(){

    if(!container) return;
    container.innerHTML = "";

    const table = document.createElement("table");

    table.innerHTML = `
      <tr>
        <th style="width:40px">#</th>
        <th style="width:90px">Trip #</th>
        <th style="width:130px">Entered By</th>
        <th style="width:130px">Entered Phone</th>
        <th>Client</th>
        <th style="width:120px">Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th style="width:110px">Date</th>
        <th style="width:90px">Time</th>
        <th style="width:95px">Status</th>
        <th style="width:220px">Actions</th>
      </tr>
    `;

    const list = getFilteredTrips();

    list.forEach((t, viewIndex)=>{

      const index = trips.indexOf(t);
      const tr = document.createElement("tr");

      const passed = tripPassed(t);
      const in120  = inside120(t);

      if(passed){
        tr.style.background = "#ffcccc";
        tr.style.borderLeft = "4px solid red";
      } else if(in120){
        tr.style.background = "#fff3cd";
        tr.style.borderLeft = "4px solid orange";
      }

      const editing = t.editing === true;

      const enteredByCell = editing
        ? `<input class="edit edit-enteredby" value="${escapeHtml(t.enteredBy||"")}" />`
        : escapeHtml(t.enteredBy||"");

      const enteredPhoneCell = editing
        ? `<input class="edit edit-enteredphone" value="${escapeHtml(t.enteredPhone||"")}" />`
        : escapeHtml(t.enteredPhone||"");

      const clientCell = editing
        ? `<input class="edit edit-client" value="${escapeHtml(t.clientName||"")}" />`
        : escapeHtml(t.clientName||"");

      const phoneCell = editing
        ? `<input class="edit edit-phone" value="${escapeHtml(t.clientPhone||"")}" />`
        : escapeHtml(t.clientPhone||"");

      const pickupCell = editing
        ? `<input class="edit edit-pickup" value="${escapeHtml(t.pickup||"")}" />`
        : escapeHtml(t.pickup||"");

      const dropCell = editing
        ? `<input class="edit edit-drop" value="${escapeHtml(t.dropoff||"")}" />`
        : escapeHtml(t.dropoff||"");

      const dateCell = editing
        ? `<input class="edit edit-date" type="date" value="${escapeHtml(t.tripDate||"")}" />`
        : escapeHtml(t.tripDate||"");

      const timeCell = editing
        ? `<input class="edit edit-time" type="time" value="${escapeHtml(t.tripTime||"")}" />`
        : escapeHtml(t.tripTime||"");

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
      else{
        actions = `
          <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
          <button class="btn edit" onclick="editTrip(${index})">${editing ? "Save" : "Edit"}</button>
          <button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>
        `;
      }

      tr.innerHTML = `
        <td>${viewIndex+1}</td>
        <td>${escapeHtml(t.tripNumber||"")}</td>
        <td>${enteredByCell}</td>
        <td>${enteredPhoneCell}</td>
        <td>${clientCell}</td>
        <td>${phoneCell}</td>
        <td>${pickupCell}</td>
        <td>${dropCell}</td>
        <td>${dateCell}</td>
        <td>${timeCell}</td>
        <td>${escapeHtml(t.status||"Scheduled")}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  window.confirmTrip = async function(i){
    const t = trips[i];
    if(tripPassed(t)){
      alert("Trip time has already passed. Cannot confirm.");
      return;
    }
    t.status = "Confirmed";
    t.editing = false;
    await sendToHub(t);
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    trips[i].status = "Cancelled";
    trips[i].editing = false;
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
    if(tripPassed(t)){
      alert("Trip time already passed.");
      return;
    }

    if(!t.editing){
      trips.forEach((x,idx)=>{ if(x && idx !== i) x.editing = false; });
      t.editing = true;
      render();
      return;
    }

    const row = container.querySelectorAll("tr")[i+1];

    const newEnteredBy = row.querySelector(".edit-enteredby")?.value ?? t.enteredBy;
    const newEnteredPhone = row.querySelector(".edit-enteredphone")?.value ?? t.enteredPhone;

    const newClient = row.querySelector(".edit-client")?.value ?? t.clientName;
    const newPhone  = row.querySelector(".edit-phone")?.value ?? t.clientPhone;
    const newPickup = row.querySelector(".edit-pickup")?.value ?? t.pickup;
    const newDrop   = row.querySelector(".edit-drop")?.value ?? t.dropoff;
    const newDate   = row.querySelector(".edit-date")?.value ?? t.tripDate;
    const newTime   = row.querySelector(".edit-time")?.value ?? t.tripTime;

    const tempTrip = { ...t, tripDate:newDate, tripTime:newTime };
    const mins = minutesToTrip(tempTrip);

    if(mins !== null && mins > 0 && mins <= 120){
      const ok = confirm(
        "⚠️ This trip is within 120 minutes of departure.\nTrips inside 120 minutes cannot be modified.\nContinue?"
      );
      if(!ok) return;
    }

    t.enteredBy = newEnteredBy;
    t.enteredPhone = newEnteredPhone;

    t.clientName  = newClient;
    t.clientPhone = newPhone;
    t.pickup      = newPickup;
    t.dropoff     = newDrop;
    t.tripDate    = newDate;
    t.tripTime    = newTime;

    t.status = "Scheduled";
    t.editing = false;

    await saveTrips();
    render();
  };

  if(searchBox){
    searchBox.addEventListener("input", () => render());
  }

  setInterval(async ()=>{
    if(anyEditing()){
      render();
      return;
    }
    await loadTrips();
    normalizeTrips();
    await keepLast30Days();
    sortTrips();
    render();
  }, 30000);

  (async function(){
    await loadTrips();
    normalizeTrips();
    await keepLast30Days();
    sortTrips();
    render();
  })();

});