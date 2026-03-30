console.log("Driver trips loaded");

/* ================= DRIVER ================= */
const driver = JSON.parse(localStorage.getItem("user"));

if (!driver || driver.role !== "driver") {
  alert("Login first");
  window.location.href = "../login.html";
}

/* ================= ELEMENT ================= */
const tbody = document.getElementById("tbody");

/* ================= LOAD ================= */
async function loadTrips(){

  try{

    const res = await fetch(`/api/trips`);

    const allTrips = await res.json();

    const trips = allTrips.filter(t => t.driverId === driver.id);

    render(trips);

  }catch(err){
    console.error(err);
    alert("Error loading trips");
  }
}

/* ================= RENDER ================= */
function render(trips){

  tbody.innerHTML = "";

  if(!trips.length){
    tbody.innerHTML = `<tr><td colspan="10">No Trips</td></tr>`;
    return;
  }

  trips.forEach(t => {

    const tr = document.createElement("tr");

    /* STATUS CLASS */
    let cls = "";
    if(t.status === "Completed") cls = "done";
    else if(t.status === "Accepted") cls = "accepted";
    else if(t.status === "Dispatched") cls = "dispatched";

    tr.className = cls;

    /* STOPS */
    let stops = "-";
    if(t.stops && t.stops.length){
      stops = t.stops.join(" → ");
    }

    tr.innerHTML = `
      <td>${t.tripNumber || ""}</td>
      <td>${t.pickup || ""}</td>
      <td>${stops}</td>
      <td>${t.dropoff || ""}</td>
      <td>${t.tripDate || ""}</td>
      <td>${t.tripTime || ""}</td>
      <td>${t.vehicle || "-"}</td>
      <td>${t.notes || "-"}</td>
      <td>${t.status || "Scheduled"}</td>
      <td>
        ${buildButton(t)}
      </td>
    `;

    tbody.appendChild(tr);

  });
}

/* ================= BUTTON LOGIC ================= */
function buildButton(t){

  if(t.status === "Completed"){
    return `<button class="btn gray">Done</button>`;
  }

  if(t.status === "Dispatched"){
    return `<button class="btn green" onclick="accept('${t._id}')">Accept</button>`;
  }

  if(t.status === "Accepted"){
    return `<button class="btn blue" onclick="start('${t._id}')">Start</button>`;
  }

  if(t.status === "On Trip"){
    return `<button class="btn green" onclick="complete('${t._id}')">Finish</button>`;
  }

  return `<button class="btn blue" onclick="openMap('${t.pickup}')">Open</button>`;
}

/* ================= ACTIONS ================= */

async function accept(id){
  await fetch(`/api/driver/trips/${id}/accept`, { method:"PATCH" });
  loadTrips();
}

async function start(id){
  await fetch(`/api/driver/trips/${id}/start`, { method:"PATCH" });
  loadTrips();
}

async function complete(id){
  await fetch(`/api/driver/trips/${id}/complete`, { method:"PATCH" });
  loadTrips();
}

/* ================= MAP ================= */
function openMap(addr){
  window.open(
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(addr)
  );
}

/* ================= INIT ================= */
loadTrips();