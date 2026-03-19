const UI = {
  map: null,
  markers: [],
  polyline: null,
  selectedDriverId: null,
  toastTimer: null,

  /* ================= INIT ================= */
  init() {
    this.bindTabs();
    this.bindTopActions();
    this.initMap();
  },

  bindTabs() {
    const tabTrips = document.getElementById("tabTrips");
    const tabDrivers = document.getElementById("tabDrivers");
    const tripsPage = document.getElementById("tripsPage");
    const driversPage = document.getElementById("driversPage");

    if (tabTrips) {
      tabTrips.onclick = () => {
        tripsPage.classList.add("active");
        driversPage.classList.remove("active");
        tabTrips.classList.add("active");
        tabDrivers.classList.remove("active");
      };
    }

    if (tabDrivers) {
      tabDrivers.onclick = () => {
        tripsPage.classList.remove("active");
        driversPage.classList.add("active");
        tabTrips.classList.remove("active");
        tabDrivers.classList.add("active");

        setTimeout(() => {
          try {
            if (this.map) this.map.invalidateSize();
          } catch (e) {}
        }, 300);
      };
    }
  },

  bindTopActions() {
    const selectBtn = document.getElementById("selectBtn");
    const editBtn = document.getElementById("editBtn");
    const sendBtn = document.getElementById("sendBtn");
    const redistributeBtn = document.getElementById("redistributeBtn");

    if (selectBtn) selectBtn.onclick = () => this.toggleSelect();
    if (editBtn) editBtn.onclick = () => this.toggleEdit();
    if (sendBtn) sendBtn.onclick = () => this.sendSelected();
    if (redistributeBtn) redistributeBtn.onclick = () => this.redistribute();
  },

  /* ================= TOAST ================= */
  showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = msg;
    toast.classList.add("show");

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  },

  /* ================= HELPERS ================= */
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  getStops(t) {
    if (Array.isArray(t.stops)) return t.stops.filter(Boolean);
    if (Array.isArray(t.stopAddresses)) return t.stopAddresses.filter(Boolean);
    if (Array.isArray(t.extraStops)) return t.extraStops.filter(Boolean);
    if (typeof t.stop === "string" && t.stop.trim()) return [t.stop.trim()];
    return [];
  },

  getTripRowClass(t) {
    const ts = Engine.getTripDateTimeValue(t);
    if (!ts) return "";

    const diffMin = Math.round((ts - Date.now()) / 60000);

    if (diffMin <= 30) return "trip-urgent";
    if (diffMin <= 90) return "trip-soon";
    return "";
  },

  syncSelectButtonText() {
    const btn = document.getElementById("selectBtn");
    if (!btn) return;

    const selectedCount = Engine.trips.filter(t => t.selected).length;

    if (Engine.trips.length && selectedCount === Engine.trips.length) {
      btn.innerText = "Remove All";
    } else {
      btn.innerText = "Select All";
    }
  },

  /* ================= RENDER TRIPS ================= */
  renderTrips() {
    const body = document.getElementById("tbody");
    if (!body) return;

    body.innerHTML = "";

    Engine.trips.forEach((t, i) => {
      const stops = this.getStops(t);
      const rowClass = this.getTripRowClass(t);
      const validDrivers = Engine.getValidDriversForTrip(t);

      body.innerHTML += `
        <tr class="${rowClass}">
          <td>
            <button class="btn ${t.selected ? "green" : "blue"} select-btn" onclick="UI.toggleTrip(${i})">
              ${t.selected ? "✔" : "Select"}
            </button>
          </td>

          <td>${this.escapeHtml(t.tripNumber || i + 1)}</td>
          <td>${this.escapeHtml(t.clientName || "")}</td>
          <td>${this.escapeHtml(t.pickup || "")}</td>

          <td class="stop-list">
            ${stops.length ? stops.map(s => this.escapeHtml(s)).join("<br>") : "-"}
          </td>

          <td>${this.escapeHtml(t.dropoff || "")}</td>
          <td>${this.escapeHtml(t.tripDate || "")}</td>
          <td>${this.escapeHtml(t.tripTime || "")}</td>

          <td>
            <select ${(Engine.editMode && t.selected) ? "" : "disabled"} onchange="UI.assignDriver(${i},this.value)">
              <option value="">--</option>
              ${validDrivers.map(d => `
                <option value="${this.escapeHtml(d._id)}" ${String(t.driverId || "") === String(d._id || "") ? "selected" : ""}>
                  ${this.escapeHtml(d.name || "")}
                </option>
              `).join("")}
            </select>
          </td>

          <td id="car-${i}">${this.escapeHtml(t.vehicle || Engine.getDriverCar(t.driverId) || "")}</td>
          <td class="notes-cell">${this.escapeHtml(t.notes || "")}</td>

          <td>
            <button class="btn green send-btn" onclick="UI.sendOne(${i})">Send</button>
          </td>
        </tr>
      `;
    });

    this.syncSelectButtonText();
  },

  /* ================= MAP ================= */
  initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl || this.map) return;

    this.map = L.map("map").setView([33.4484, -112.0740], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(this.map);

    setTimeout(() => {
      try {
        this.map.invalidateSize();
      } catch (e) {}
    }, 300);
  },

  clearMap() {
    this.markers.forEach(m => {
      try {
        this.map.removeLayer(m);
      } catch (e) {}
    });
    this.markers = [];

    if (this.polyline) {
      try {
        this.map.removeLayer(this.polyline);
      } catch (e) {}
      this.polyline = null;
    }
  },

  /* ================= RENDER DRIVERS PANEL ================= */
  renderDrivers() {
    const panel = document.getElementById("driversPanel");
    if (!panel) return;

    panel.innerHTML = `<div class="panel-header">Drivers Dispatch Panel</div>`;

    const activeDrivers = Engine.getActiveDriversForPanel();

    activeDrivers.forEach((d, i) => {
      const car = Engine.getDriverCar(d._id);
      const trip = Engine.getLatestTripForDriver(d._id);
      const tripsCount = Engine.getDriverTripsCount(d._id);
      const status = Engine.getDriverStatus(d._id);
      const statusClass = status === "Busy" ? "badge-busy" : "badge-available";

      panel.innerHTML += `
        <div class="driver ${this.selectedDriverId === d._id ? "active" : ""}" data-id="${this.escapeHtml(d._id)}">
          <div class="driver-bar">
            <div class="driver-name">${i + 1} - ${this.escapeHtml(d.name || "")}</div>

            <div class="driver-right">
              <div class="driver-info">
                <span>🚗 ${this.escapeHtml(car || "-")}</span>
                <span>📦 ${this.escapeHtml(trip ? (trip.tripNumber || "-") : "-")}</span>
              </div>

              <div class="driver-meta">
                <span class="badge ${statusClass}">${this.escapeHtml(status)}</span>
                <span class="badge badge-count">${tripsCount} Trip${tripsCount === 1 ? "" : "s"}</span>
                <span class="badge badge-trip">ETA Map</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    document.querySelectorAll(".driver").forEach(el => {
      el.addEventListener("click", async () => {
        this.selectedDriverId = el.dataset.id;

        document.querySelectorAll(".driver").forEach(d => {
          d.classList.remove("active");
        });

        el.classList.add("active");
        await this.focusDriver(el.dataset.id);
      });
    });
  },

  /* ================= FOCUS DRIVER ON MAP ================= */
  async focusDriver(id) {
    const trip = Engine.getLatestTripForDriver(id);

    if (!trip) {
      this.showToast("No trip assigned to this driver");
      return;
    }

    this.clearMap();

    const stops = this.getStops(trip);
    const points = [];

    const pickup = await Engine.geocode(trip.pickup);
    if (pickup) points.push({ ...pickup, label: "Pickup" });

    for (const s of stops) {
      const g = await Engine.geocode(s);
      if (g) points.push({ ...g, label: "Stop" });
    }

    const dropoff = await Engine.geocode(trip.dropoff);
    if (dropoff) points.push({ ...dropoff, label: "Dropoff" });

    if (points.length < 2) {
      this.showToast("Not enough route points");
      return;
    }

    const route = await Engine.getRoute(points);
    if (!route) {
      this.showToast("Route not available");
      return;
    }

    points.forEach((p, idx) => {
      const label =
        idx === 0
          ? "Pickup"
          : idx === points.length - 1
            ? "Dropoff"
            : `Stop ${idx}`;

      const marker = L.marker([p.lat, p.lng]).addTo(this.map).bindPopup(label);
      this.markers.push(marker);
    });

    this.polyline = L.polyline(route.coords, { color: "blue", weight: 5 }).addTo(this.map);

    this.polyline.bindPopup(`
      <b>Distance:</b> ${this.escapeHtml(route.distance)} miles<br>
      <b>ETA:</b> ${this.escapeHtml(route.duration)} min<br>
      <b>Trip:</b> ${this.escapeHtml(trip.tripNumber || "-")}
    `).openPopup();

    this.map.fitBounds(this.polyline.getBounds(), { padding: [40, 40] });
  },

  /* ================= ACTIONS ================= */
  toggleTrip(i) {
    if (!Engine.trips[i]) return;
    Engine.trips[i].selected = !Engine.trips[i].selected;
    this.renderTrips();
  },

  toggleSelect() {
    const allSelected = Engine.trips.length > 0 && Engine.trips.every(t => t.selected);

    Engine.trips.forEach(t => {
      t.selected = !allSelected;
    });

    this.renderTrips();
    this.showToast(!allSelected ? "All trips selected" : "Selection cleared");
  },

  toggleEdit() {
    Engine.editMode = !Engine.editMode;

    const btn = document.getElementById("editBtn");
    if (btn) {
      btn.innerText = Engine.editMode ? "Save" : "Edit Selected";
    }

    this.renderTrips();
    this.showToast(Engine.editMode ? "Edit mode enabled" : "Changes saved");
  },

  assignDriver(i, id) {
    if (!Engine.trips[i]) return;

    const trip = Engine.trips[i];

    if (id) {
      if (!Engine.isDriverActiveOnDate(id, trip.tripDate)) {
        this.showToast("Driver not active on this date");
        this.renderTrips();
        return;
      }
    }

    const d = Engine.drivers.find(x => String(x._id) === String(id));

    Engine.trips[i].driverId = id ? String(id) : "";
    Engine.trips[i].vehicle = d ? Engine.getDriverCar(d._id) : "";

    const carCell = document.getElementById(`car-${i}`);
    if (carCell) {
      carCell.innerText = Engine.trips[i].vehicle || "";
    }

    this.renderTrips();
    this.renderDrivers();
    this.showToast("Driver updated");
  },

  sendSelected() {
    const selected = Engine.trips.filter(t => t.selected);
    console.log("SEND SELECTED", selected);
    this.showToast(`${selected.length} selected trip(s) ready`);
  },

  sendOne(i) {
    if (!Engine.trips[i]) return;
    console.log("SEND ONE", Engine.trips[i]);
    this.showToast(`Trip ${Engine.trips[i].tripNumber || i + 1} ready`);
  },

  redistribute() {
    const selected = Engine.trips.filter(t => t.selected);

    if (!selected.length) {
      this.showToast("Select trips first");
      return;
    }

    Engine.redistributeSelected(selected);

    this.renderTrips();
    this.renderDrivers();
    this.showToast("Trips redistributed");
  }
};

window.UI = UI;