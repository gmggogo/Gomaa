// =========================================
// review.js (FULL FILE - SERVER CONTROLLED)
// =========================================

window.ReviewApp = { container:null };

window.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
const companyName = localStorage.getItem("name") || "";

if(!token || role !== "company"){
  window.location.replace("company-login.html");
  return;
}

const container = document.getElementById("tripsContainer");
window.ReviewApp.container = container;

let trips = [];

/* ================= HELPERS ================= */

function text(v){ return String(v || "").trim(); }
function money(v){ return Number(v || 0).toFixed(2); }

function isSharedTrip(t){
  return (
    t.isShared === true ||
    String(t.tripType || "").toUpperCase() === "SHARED"
  );
}

function getSharedKey(t){
  return t.groupId || t.tripNumber || t._id;
}

/* ================= SERVER ================= */

async function fetchTrips(){
  const res = await fetch("/api/trips/company/" + encodeURIComponent(companyName),{
    headers:{ Authorization:"Bearer " + token }
  });

  if(!res.ok) return [];
  return await res.json();
}

async function updateTrip(id,payload){
  await fetch("/api/trips/" + id,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer " + token
    },
    body:JSON.stringify(payload)
  });
}

/* ================= GROUP ================= */

function getSharedGroups(){
  const map = {};

  trips.forEach(t=>{
    if(!isSharedTrip(t)) return;

    const key = getSharedKey(t);

    if(!map[key]) map[key] = [];
    map[key].push(t);
  });

  return Object.values(map);
}

/* ================= RENDER ================= */

function render(){

  container.innerHTML = "";

  const table = document.createElement("table");
  table.style.width = "100%";
  table.border = "1";

  table.innerHTML = `
    <tr>
      <th>#</th>
      <th>Trip</th>
      <th>Passengers</th>
      <th>Pickup</th>
      <th>Dropoff</th>
      <th>Status</th>
      <th>Price</th>
      <th>Miles</th>
      <th>Action</th>
    </tr>
  `;

  let i = 1;

  trips.filter(t => !isSharedTrip(t)).forEach(t => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i++}</td>
      <td>${t.tripNumber || ""}</td>
      <td>${t.clientName || ""}</td>
      <td>${t.pickup || ""}</td>
      <td>${t.dropoff || ""}</td>
      <td>${t.status || ""}</td>
      <td>$${money(t.priceAmount)}</td>
      <td>${t.miles || 0}</td>
      <td>
        <button onclick="confirmTrip('${t._id}')">
          Confirm
        </button>
      </td>
    `;

    table.appendChild(tr);
  });

  getSharedGroups().forEach(group => {

    const first = group[0];

    const passengers =
      (first.passengers || []).sort((a,b)=>
        Number(a.routeOrder || 0) - Number(b.routeOrder || 0)
      );

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i++}</td>

      <td>
        ${first.tripNumber || ""}
        ${first.routeLocked ? "<br><b>Locked</b>" : ""}
      </td>

      <td>
        ${passengers.map(p =>
          `${p.name || p.clientName || "--"}`
        ).join("<br>")}
      </td>

      <td>
        ${passengers.map(p =>
          `${p.pickup || "--"}`
        ).join("<br>")}
      </td>

      <td>
        ${passengers.map(p =>
          `${p.dropoff || "--"}`
        ).join("<br>")}
      </td>

      <td>${first.status || ""}</td>

      <td>$${money(first.priceAmount)}</td>

      <td>${first.miles || 0}</td>

      <td>
        <button onclick="confirmShared('${getSharedKey(first)}')">
          Confirm
        </button>
      </td>
    `;

    table.appendChild(tr);
  });

  container.appendChild(table);
}

/* ================= CONFIRM ================= */

window.confirmTrip = async function(id){

  const trip = trips.find(t => t._id === id);
  if(!trip) return;

  const routePoints = trip.routePoints || [];

  await updateTrip(id,{
    status:"Confirmed",
    routeLocked:true,
    routeFinalized:true,
    routePoints:routePoints
  });

  await load();
};

window.confirmShared = async function(groupId){

  const group =
    getSharedGroups().find(g =>
      getSharedKey(g[0]) === groupId
    );

  if(!group) return;

  const first = group[0];

  const routePoints =
    first.routePoints ||
    first.sharedRoutePlan ||
    [];

  const passengers =
    first.passengers || [];

  const payload = {
    status:"Confirmed",

    isShared:true,
    tripType:"SHARED",

    passengers:passengers,
    routePoints:routePoints,

    routeLocked:true,
    routeFinalized:true
  };

  for(const t of group){
    await updateTrip(t._id,payload);
  }

  await load();
};

/* ================= LOAD ================= */

async function load(){
  trips = await fetchTrips();
  render();
}

await load();

});
