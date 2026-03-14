import { loadDispatchTrips, loadDrivers } from "./dispatch.store.js";
import { autoRedistribute } from "./dispatch.engine.js";

const tbody = document.getElementById("tbody");

/* =========================
   RENDER TABLE
========================= */

export function renderDispatch(){

  const trips = loadDispatchTrips();
  const drivers = loadDrivers();

  tbody.innerHTML = "";

  if(!trips.length){

    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding:20px;font-weight:bold">
          No trips selected from Trips page
        </td>
      </tr>
    `;

    return;
  }

  trips.forEach((t,i)=>{

    const tr = document.createElement("tr");

    const driver = drivers.find(d => d.id === t.driverId);

    const driverName = driver ? driver.name : "-";
    const vehicle = driver ? driver.vehicleNumber : "-";

    tr.innerHTML = `

      <td>
        <input type="checkbox" class="row-check">
      </td>

      <td>${t.tripNumber || "-"}</td>

      <td>${t.clientName || "-"}</td>

      <td>${t.pickup || "-"}</td>

      <td>${(t.stops || []).join(" | ")}</td>

      <td>${t.dropoff || "-"}</td>

      <td>${driverName}</td>

      <td>${vehicle}</td>

      <td>
        <button onclick="removeFromDispatch(${i})">
          Remove
        </button>
      </td>

    `;

    tbody.appendChild(tr);

  });

}

/* =========================
   REMOVE TRIP
========================= */

window.removeFromDispatch = function(index){

  const trips = loadDispatchTrips();

  trips.splice(index,1);

  localStorage.setItem("dispatchTrips", JSON.stringify(trips));

  renderDispatch();

};

/* =========================
   AUTO BUTTON
========================= */

window.autoRedistribute = function(){

  autoRedistribute();

};

/* =========================
   INIT
========================= */

window.addEventListener("DOMContentLoaded", renderDispatch);