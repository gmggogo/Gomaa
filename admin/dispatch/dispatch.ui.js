import { loadDispatchTrips, loadDrivers } from "./dispatch-store.js";
import { assignDriver, removeFromDispatch } from "./dispatch-engine.js";

const tbody = document.getElementById("tbody");

export function renderDispatch(){
  const trips = loadDispatchTrips();
  const drivers = loadDrivers();

  tbody.innerHTML = "";

  if(!trips.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:20px;font-weight:bold">
          No trips selected from Trips page
        </td>
      </tr>
    `;
    return;
  }

  trips.forEach((t,i)=>{
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><input type="checkbox" class="row-check"></td>
      <td>${t.tripNumber}</td>
      <td>${t.clientName}</td>
      <td>${t.pickup}</td>
      <td>${(t.stops||[]).join(" | ")}</td>
      <td>${t.dropoff}</td>

      <td>
        <select onchange="window.assignDriver(${i}, this.value)">
          <option value="">Select Driver</option>
          ${drivers.map(d=>`
            <option value="${d.id}" ${t.driverId===d.id?"selected":""}>
              ${d.name}
            </option>
          `).join("")}
        </select>
      </td>

      <td>
        <button onclick="window.removeFromDispatch(${i})">Remove</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}