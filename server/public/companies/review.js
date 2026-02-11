/* ===============================
   INIT
================================ */
window.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     AUTH
  ================================ */
  let loggedCompany = null;
  try {
    loggedCompany = JSON.parse(localStorage.getItem("loggedCompany"));
  } catch {}

  if (!loggedCompany) {
    location.href = "company-login.html";
    return;
  }

  const container = document.getElementById("tripsContainer");
  const searchBox = document.getElementById("searchBox");
  if (!container) return;

  let trips = [];

  /* ===============================
     LOAD FROM SERVER
  ================================ */
  async function loadTrips(){
    const res = await fetch("/api/trips");
    const all = await res.json();

    trips = all.filter(t => t.company === loggedCompany.name);
    render();
  }

  /* ===============================
     SERVER ACTIONS
  ================================ */
  async function updateTrip(id, updates){
    await fetch(`/api/trips/${id}`,{
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(updates)
    });
  }

  async function deleteTripFromServer(id){
    await fetch(`/api/trips/${id}`,{
      method:"DELETE"
    });
  }

  /* ===============================
     HELPERS
  ================================ */
  function getTripDT(t){
    if(!t.tripDate || !t.tripTime) return null;
    return new Date(`${t.tripDate}T${t.tripTime}`);
  }

  function withinTwoHours(t){
    const d = getTripDT(t);
    if(!d) return false;
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff <= 2 * 60 * 60 * 1000;
  }

  function filteredTrips(){
    if(!searchBox || !searchBox.value) return trips;
    const q = searchBox.value.toLowerCase();
    return trips.filter(t =>
      (t.tripNumber||"").toLowerCase().includes(q) ||
      (t.clientName||"").toLowerCase().includes(q) ||
      (t.clientPhone||"").includes(q) ||
      (t.pickup||"").toLowerCase().includes(q) ||
      (t.dropoff||"").toLowerCase().includes(q)
    );
  }

  /* ===============================
     RENDER
  ================================ */
  function render(){
    container.innerHTML = "";

    const table = document.createElement("table");
    table.innerHTML = `
      <tr>
        <th>#</th>
        <th>Trip</th>
        <th>Client</th>
        <th>Pickup</th>
        <th>Stops</th>
        <th>Dropoff</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;

    filteredTrips().forEach((t,index)=>{

      let actions = "";

      if (withinTwoHours(t)) {
        actions = `
          <button onclick="cancelTrip('${t.id}')">
            Cancel
          </button>
        `;
      } else {
        actions = `
          <button onclick="confirmTrip('${t.id}')">Confirm</button>
          <button onclick="editTrip('${t.id}')">Edit</button>
          <button onclick="deleteTrip('${t.id}')">Delete</button>
        `;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index+1}</td>
        <td>${t.tripNumber||"-"}</td>
        <td>${t.clientName||""}</td>
        <td>${t.pickup||""}</td>
        <td>${(t.stops||[]).join(" → ")}</td>
        <td>${t.dropoff||""}</td>
        <td>${t.tripDate||""}</td>
        <td>${t.tripTime||""}</td>
        <td>${t.status||"Scheduled"}</td>
        <td>${actions}</td>
      `;

      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  /* ===============================
     ACTIONS
  ================================ */
  window.confirmTrip = async function(id){
    await updateTrip(id,{ status:"Confirmed" });
    loadTrips();
  }

  window.cancelTrip = async function(id){
    await updateTrip(id,{ status:"Cancelled" });
    loadTrips();
  }

  window.deleteTrip = async function(id){
    if(!confirm("Delete trip?")) return;
    await deleteTripFromServer(id);
    loadTrips();
  }

  window.editTrip = function(id){
    alert("Edit screen implementation here");
  };

  if(searchBox){
    searchBox.addEventListener("input", render);
  }

  loadTrips();
});