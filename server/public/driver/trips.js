const API = "";
const driverId = localStorage.getItem("userId");

if(!driverId){
  alert("Driver not logged in");
  window.location.href = "login.html";
}

const tbody = document.getElementById("tbody");

/* ================= LOAD ================= */

async function loadTrips(){

  try{

    const res = await fetch(`${API}/api/driver/my-trips/${driverId}`);
    const trips = await res.json();

    render(trips);

  }catch(err){
    console.log(err);
  }

}

/* ================= RENDER ================= */

function render(trips){

  tbody.innerHTML = "";

  if(!trips.length){
    tbody.innerHTML = `<tr><td colspan="7">No trips</td></tr>`;
    return;
  }

  trips.forEach(t=>{

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.tripNumber || ""}</td>
      <td>${t.clientName || "-"}</td>
      <td>${t.pickup}</td>
      <td>${t.dropoff}</td>
      <td>${t.tripDate} ${t.tripTime}</td>

      <td>
        <span class="status ${statusClass(t.status)}">
          ${t.status}
        </span>
      </td>

      <td>
        ${actionBtn(t)}
      </td>
    `;

    tbody.appendChild(tr);

  });

}

/* ================= STATUS ================= */

function statusClass(s){
  if(s === "Dispatched") return "dispatched";
  if(s === "Accepted") return "accepted";
  if(s === "On Trip") return "ontrip";
  if(s === "Completed") return "completed";
  return "scheduled";
}

/* ================= BUTTON ================= */

function actionBtn(t){

  if(t.status === "Completed"){
    return `<button class="trip-btn done">Done</button>`;
  }

  return `
    <button class="trip-btn" onclick="openTrip('${t._id}','${t.status}')">
      Open
    </button>
  `;
}

/* ================= OPEN ================= */

async function openTrip(id,status){

  if(status === "Dispatched"){
    await fetch(`/api/driver/trips/${id}/accept`, { method:"PATCH" });
  }

  if(status === "Accepted"){
    await fetch(`/api/driver/trips/${id}/start`, { method:"PATCH" });
  }

  if(status === "On Trip"){
    await fetch(`/api/driver/trips/${id}/complete`, { method:"PATCH" });
  }

  // يروح الخريطة
  window.location.href = `map.html?tripId=${id}`;

}

/* ================= AUTO REFRESH ================= */

setInterval(loadTrips, 5000);

loadTrips();