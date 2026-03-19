const UI = {
  render(){
    this.renderTrips();
    this.renderDrivers();
    this.syncTopButtons();
  },

  showToast(msg){
    const toast = document.getElementById("toast");
    if(!toast) return;

    toast.textContent = msg;
    toast.classList.add("show");

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  },

  syncTopButtons(){
    const selectBtn = document.getElementById("selectBtn");
    const editBtn = document.getElementById("editBtn");

    if(selectBtn){
      const total = Engine.trips.length;
      const selected = Engine.getSelectedTrips().length;
      selectBtn.innerText = total && selected === total ? "Remove All" : "Select All";
    }

    if(editBtn){
      editBtn.innerText = Engine.editMode ? "Save" : "Edit Selected";
    }
  },

  getTripRowClass(trip){
    const ts = Engine.getTripDateValue(trip);
    if(!ts) return "";

    const diffMin = Math.round((ts - Date.now()) / 60000);

    if(diffMin <= 30) return "trip-urgent";
    if(diffMin <= 90) return "trip-soon";
    return "";
  },

  renderTrips(){
    const tbody = document.getElementById("tbody");
    if(!tbody) return;

    tbody.innerHTML = "";

    if(!Engine.trips.length){
      tbody.innerHTML = `<tr><td colspan="12" class="empty-row">No Trips</td></tr>`;
      return;
    }

    Engine.trips.forEach((trip, index) => {
      const tr = document.createElement("tr");
      tr.className = this.getTripRowClass(trip);

      const stops = Engine.getStops(trip);
      const validDrivers = Engine.getAvailableDrivers(trip);

      tr.innerHTML = `
        <td>
          <button
            class="btn ${Engine.selected[trip._id] ? "green" : "blue"} select-btn"
            onclick="Engine.toggleSelect('${Engine.escapeHtml(trip._id)}')">
            ${Engine.selected[trip._id] ? "✔" : "Select"}
          </button>
        </td>

        <td>${Engine.escapeHtml(trip.tripNumber || index + 1)}</td>
        <td>${Engine.escapeHtml(trip.clientName || "-")}</td>
        <td>${Engine.escapeHtml(trip.pickup || "-")}</td>

        <td class="stop-list">
          ${
            stops.length
              ? stops.map(s => Engine.escapeHtml(s)).join("<br>")
              : "-"
          }
        </td>

        <td>${Engine.escapeHtml(trip.dropoff || "-")}</td>
        <td>${Engine.escapeHtml(trip.tripDate || "-")}</td>
        <td>${Engine.escapeHtml(trip.tripTime || "-")}</td>

        <td>
          <select
            ${Engine.editMode && Engine.selected[trip._id] ? "" : "disabled"}
            onchange="Engine.assignManual('${Engine.escapeHtml(trip._id)}', this.value)">
            <option value="">--</option>
            ${validDrivers.map(driver => `
              <option
                value="${Engine.escapeHtml(driver._id)}"
                ${String(trip.driverId || "") === String(driver._id || "") ? "selected" : ""}>
                ${Engine.escapeHtml(driver.name || "")}
              </option>
            `).join("")}
          </select>
        </td>

        <td>${Engine.escapeHtml(trip.vehicle || Engine.getDriverVehicle(trip.driverId) || "-")}</td>
        <td class="notes-cell">${Engine.escapeHtml(trip.notes || "-")}</td>

        <td>
          <div class="action-cell">
            <button class="btn green send-btn" onclick="Engine.sendOne('${Engine.escapeHtml(trip._id)}')">Send</button>
            <button class="btn red" onclick="Engine.disable('${Engine.escapeHtml(trip._id)}')">Disable</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });
  },

  renderDrivers(){
    const panel = document.getElementById("driversPanel");
    if(!panel) return;

    panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`;

    const activeDrivers = Engine.getActiveDriversForPanel();

    if(!activeDrivers.length){
      panel.innerHTML += `
        <div class="driver">
          <div class="driver-name">No active drivers for current trips</div>
          <div class="small-muted">Check driver schedule or trip dates</div>
        </div>
      `;
      return;
    }

    activeDrivers.forEach((driver, i) => {
      const car = Engine.getDriverVehicle(driver._id);
      const latestTrip = Engine.getLatestTripForDriver(driver._id);
      const tripsCount = Engine.getDriverTripsCount(driver._id);
      const status = Engine.getDriverStatus(driver._id);
      const statusClass = status === "Busy" ? "badge-busy" : "badge-available";

      const card = document.createElement("div");
      card.className = `driver ${Engine.selectedDriverId === driver._id ? "active" : ""}`;
      card.dataset.id = driver._id;

      card.innerHTML = `
        <div class="driver-bar">
          <div class="driver-name">${i + 1} - ${Engine.escapeHtml(driver.name || "")}</div>

          <div class="driver-right">
            <div class="driver-info">
              <span>🚗 ${Engine.escapeHtml(car || "-")}</span>
              <span>📦 ${Engine.escapeHtml(latestTrip ? (latestTrip.tripNumber || "-") : "-")}</span>
            </div>

            <div class="driver-meta">
              <span class="badge ${statusClass}">${Engine.escapeHtml(status)}</span>
              <span class="badge badge-count">${tripsCount} Trip${tripsCount === 1 ? "" : "s"}</span>
              <span class="badge badge-trip">ETA Map</span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener("click", async () => {
        Engine.selectedDriverId = driver._id;

        document.querySelectorAll(".driver").forEach(el => el.classList.remove("active"));
        card.classList.add("active");

        await Engine.focusDriver(driver._id);
      });

      panel.appendChild(card);
    });
  },

  bindTabs(){
    const tabTrips = document.getElementById("tabTrips");
    const tabDrivers = document.getElementById("tabDrivers");
    const tripsPage = document.getElementById("tripsPage");
    const driversPage = document.getElementById("driversPage");

    if(tabTrips){
      tabTrips.onclick = () => {
        tripsPage?.classList.add("active");
        driversPage?.classList.remove("active");
        tabTrips.classList.add("active");
        tabDrivers?.classList.remove("active");
      };
    }

    if(tabDrivers){
      tabDrivers.onclick = () => {
        tripsPage?.classList.remove("active");
        driversPage?.classList.add("active");
        tabTrips?.classList.remove("active");
        tabDrivers.classList.add("active");

        setTimeout(() => {
          try{
            Engine.map?.invalidateSize();
          }catch(err){}
        }, 300);
      };
    }
  }
};

window.UI = UI;