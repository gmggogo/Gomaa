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
      // ✅ fallback لو السيرفر مش شغال
      trips = JSON.parse(localStorage.getItem("companyTrips") || "[]");
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
    }catch{
      // ✅ لو السيرفر مش شغال نحفظ لوكال
      localStorage.setItem("companyTrips", JSON.stringify(trips));
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
    }catch{}
  }

  /* ================= NORMALIZE ================= */
  function normalizeTrips(){
    const nowISO = new Date().toISOString();
    trips.forEach(t=>{
      if(!t.createdAt) t.createdAt = nowISO;
      if(!t.status) t.status = "Scheduled";
      if(typeof t.editing !== "boolean") t.editing = false;

      t.enteredBy ||= "";
      t.enteredPhone ||= "";
      t.clientName ||= "";
      t.clientPhone ||= "";
      t.pickup ||= "";
      t.dropoff ||= "";
      t.tripDate ||= "";
      t.tripTime ||= "";
      t.tripNumber ||= "";
      t.notes ||= "";
      if(!Array.isArray(t.stops)) t.stops = [];
    });
  }

  /* ================= KEEP 30 DAYS ================= */
  function keepLast30Days(){
    const now = new Date();
    trips = trips.filter(t=>{
      const created = new Date(t.createdAt);
      if(String(created)==="Invalid Date") return true;
      return ((now-created)/(1000*60*60*24)) <= 30;
    });
  }

  /* ================= TIME ================= */
  function getTripDateTime(t){
    if(!t.tripDate || !t.tripTime) return null;
    return new Date(`${t.tripDate}T${t.tripTime}`);
  }

  function minutesToTrip(t){
    const dt = getTripDateTime(t);
    if(!dt) return null;
    return (dt - new Date()) / 60000;
  }

  function inside120(t){
    const m = minutesToTrip(t);
    return m !== null && m > 0 && m <= 120;
  }

  function tripPassed(t){
    const m = minutesToTrip(t);
    return m !== null && m <= 0;
  }

  /* ================= RENDER ================= */
  function render(){

    if(!container) return;
    container.innerHTML = "";

    const table = document.createElement("table");

    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip #</th>
        <th>Entered By</th>
        <th>Entered Phone</th>
        <th>Client</th>
        <th>Client Phone</th>
        <th>Pickup</th>
        <th>Drop</th>
        <th>Stops</th>
        <th>Notes</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    trips.forEach((t, index)=>{

      const tr = document.createElement("tr");

      if(tripPassed(t)) tr.classList.add("red");
      else if(inside120(t)) tr.classList.add("yellow");

      const editing = t.editing;

      function cell(val, cls, type="text"){
        return editing
          ? `<input class="${cls}" type="${type}" value="${escapeHtml(val)}">`
          : escapeHtml(val);
      }

      let actions = "";

      if(t.status === "Confirmed"){
        actions = `<button class="btn cancel" onclick="cancelTrip(${index})">Cancel</button>`;
      }
      else{
        actions = `
          <button class="btn edit" onclick="editTrip(${index})">${editing?"Save":"Edit"}</button>
          <button class="btn delete" onclick="deleteTrip(${index})">Delete</button>
          <button class="btn confirm" onclick="confirmTrip(${index})">Confirm</button>
        `;
      }

      tr.innerHTML = `
        <td>${index+1}</td>
        <td>${escapeHtml(t.tripNumber)}</td>
        <td>${cell(t.enteredBy,"edit-enteredby")}</td>
        <td>${cell(t.enteredPhone,"edit-enteredphone")}</td>
        <td>${cell(t.clientName,"edit-client")}</td>
        <td>${cell(t.clientPhone,"edit-clientphone")}</td>
        <td>${cell(t.pickup,"edit-pickup")}</td>
        <td>${cell(t.dropoff,"edit-drop")}</td>
        <td>${editing
            ? `<input class="edit-stops" value="${escapeHtml(t.stops.join(" | "))}">`
            : escapeHtml(t.stops.join(" | "))
        }</td>
        <td>${cell(t.notes,"edit-notes")}</td>
        <td>${cell(t.tripDate,"edit-date","date")}</td>
        <td>${cell(t.tripTime,"edit-time","time")}</td>
        <td>${escapeHtml(t.status)}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  function escapeHtml(str){
    return String(str||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  /* ================= ACTIONS ================= */

  window.confirmTrip = async function(i){
    const t = trips[i];
    if(tripPassed(t)){
      alert("Trip time passed.");
      return;
    }
    t.status="Confirmed";
    t.editing=false;
    await sendToHub(t);
    await saveTrips();
    render();
  };

  window.cancelTrip = async function(i){
    trips[i].status="Cancelled";
    trips[i].editing=false;
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

    if(!t.editing){
      trips.forEach(x=>x.editing=false);
      t.editing=true;
      render();
      return;
    }

    const row = container.querySelectorAll("tr")[i+1];

    t.enteredBy = row.querySelector(".edit-enteredby").value;
    t.enteredPhone = row.querySelector(".edit-enteredphone").value;
    t.clientName = row.querySelector(".edit-client").value;
    t.clientPhone = row.querySelector(".edit-clientphone").value;
    t.pickup = row.querySelector(".edit-pickup").value;
    t.dropoff = row.querySelector(".edit-drop").value;
    t.notes = row.querySelector(".edit-notes").value;
    t.tripDate = row.querySelector(".edit-date").value;
    t.tripTime = row.querySelector(".edit-time").value;
    t.stops = row.querySelector(".edit-stops").value.split("|").map(s=>s.trim());

    t.status="Scheduled";
    t.editing=false;

    await saveTrips();
    render();
  };

  /* ================= INIT ================= */

  (async function(){
    await loadTrips();
    normalizeTrips();
    keepLast30Days();
    render();
  })();

});