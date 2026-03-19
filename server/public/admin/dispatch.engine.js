/* ================= ENGINE ================= */

const Engine = {
  trips: [],
  drivers: [],
  schedule: {},
  selected: {},
  editMode: false,
  loading: false,

  /* ================= INIT / LOAD ================= */
  async load() {
    try {
      this.loading = true;

      const data = await Store.load();

      this.trips = Array.isArray(data.trips) ? data.trips.map(t => ({
        ...t,
        _id: String(t._id),
        driverId: t.driverId ? String(t.driverId) : "",
        vehicle: t.vehicle || ""
      })) : [];

      this.drivers = Array.isArray(data.drivers) ? data.drivers.map(d => ({
        ...d,
        _id: String(d._id)
      })) : [];

      this.schedule = data.schedule || {};
      this.selected = {};

      this.trips.forEach(t => {
        this.selected[t._id] = false;
      });

      this.sortTrips();

      // auto assign لكل الرحلات من غير ما يحتاج select
      await this.autoAssignAll();

      UI.render();
    } catch (err) {
      console.error("Engine Load Error:", err);
    } finally {
      this.loading = false;
    }
  },

  /* ================= HELPERS ================= */
  sortTrips() {
    this.trips.sort((a, b) => {
      const da = this.getTripDateValue(a);
      const db = this.getTripDateValue(b);
      return da - db;
    });
  },

  getTripDateValue(trip) {
    const raw = `${trip.tripDate || ""} ${trip.tripTime || ""}`.trim();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  },

  getDriverVehicle(driverId) {
    const id = String(driverId || "");
    const s = this.schedule[id] || {};
    const d = this.drivers.find(x => String(x._id) === id) || {};

    return (
      s.vehicleNumber ||
      s.carNumber ||
      s.car ||
      d.vehicleNumber ||
      d.carNumber ||
      d.vehicle ||
      d.car ||
      ""
    );
  },

  getTripById(tripId) {
    return this.trips.find(t => String(t._id) === String(tripId));
  },

  getDriverById(driverId) {
    return this.drivers.find(d => String(d._id) === String(driverId));
  },

  getSelectedTrips() {
    return this.trips.filter(t => this.selected[t._id]);
  },

  countDriverTrips(driverId, excludeTripId = "") {
    const id = String(driverId || "");
    return this.trips.filter(t => {
      if (excludeTripId && String(t._id) === String(excludeTripId)) return false;
      return String(t.driverId || "") === id;
    }).length;
  },

  /* ================= AUTO ASSIGN ================= */
  async autoAssignAll() {
    if (!this.drivers.length || !this.trips.length) return;

    let index = 0;

    for (const trip of this.trips) {
      // لو فيه سواق متعين بالفعل، سيبه لكن ظبط العربية
      if (trip.driverId) {
        trip.vehicle = this.getDriverVehicle(trip.driverId);
        continue;
      }

      const driver = this.drivers[index];
      if (!driver) continue;

      trip.driverId = String(driver._id);
      trip.vehicle = this.getDriverVehicle(driver._id);

      index++;
      if (index >= this.drivers.length) index = 0;
    }
  },

  async redistributeSelected() {
    const selectedTrips = this.getSelectedTrips();
    if (!selectedTrips.length || !this.drivers.length) return;

    let index = 0;

    for (const trip of selectedTrips) {
      const driver = this.drivers[index];
      if (!driver) continue;

      trip.driverId = String(driver._id);
      trip.vehicle = this.getDriverVehicle(driver._id);

      try {
        await Store.assignDriver(trip._id, driver._id);
      } catch (err) {
        console.error("Redistribute save error:", err);
      }

      index++;
      if (index >= this.drivers.length) index = 0;
    }

    UI.render();
  },

  /* ================= UI ACTIONS ================= */
  toggleSelect(tripId) {
    const id = String(tripId);
    this.selected[id] = !this.selected[id];
    UI.render();
  },

  toggleSelectAll() {
    const allTrips = this.trips.length;
    if (!allTrips) return;

    const selectedCount = this.getSelectedTrips().length;
    const shouldSelectAll = selectedCount !== allTrips;

    this.trips.forEach(t => {
      this.selected[t._id] = shouldSelectAll;
    });

    UI.render();
  },

  toggleEdit() {
    this.editMode = !this.editMode;
    UI.render();
  },

  async assignManual(tripId, driverId) {
    const trip = this.getTripById(tripId);
    if (!trip) return;

    const id = String(driverId || "");

    trip.driverId = id;
    trip.vehicle = id ? this.getDriverVehicle(id) : "";

    try {
      if (id) {
        await Store.assignDriver(trip._id, id);
      }
    } catch (err) {
      console.error("Manual assign save error:", err);
    }

    UI.render();
  },

  getAvailableDrivers(trip) {
    if (!trip) return this.drivers;

    // كل السواقين متاحين، لكن نرتبهم بالأقل حمل
    return [...this.drivers].sort((a, b) => {
      const aCount = this.countDriverTrips(a._id, trip._id);
      const bCount = this.countDriverTrips(b._id, trip._id);
      return aCount - bCount;
    });
  },

  /* ================= SEND / DISABLE ================= */
  async sendOne(tripId) {
    try {
      await Store.sendTrips([tripId]);
      console.log("Trip sent:", tripId);
    } catch (err) {
      console.error("Send one error:", err);
    }
  },

  async sendSelected() {
    try {
      const ids = this.getSelectedTrips().map(t => t._id);
      if (!ids.length) return;

      await Store.sendTrips(ids);
      console.log("Selected trips sent:", ids);
    } catch (err) {
      console.error("Send selected error:", err);
    }
  },

  async disable(tripId) {
    try {
      await Store.disableTrip(tripId);

      const trip = this.getTripById(tripId);
      if (trip) {
        trip.disabled = true;
      }

      this.trips = this.trips.filter(t => String(t._id) !== String(tripId));
      delete this.selected[String(tripId)];

      UI.render();
    } catch (err) {
      console.error("Disable trip error:", err);
    }
  }
};

/* ================= OPTIONAL GLOBAL HELPERS ================= */
/* لو أزرار الصفحة مربوطة مباشرة بدل UI.js */
window.Engine = Engine;

window.sendSelected = () => Engine.sendSelected();
window.redistribute = () => Engine.redistributeSelected();
window.toggleSelectAll = () => Engine.toggleSelectAll();
window.toggleEdit = () => Engine.toggleEdit();

/* ================= START ================= */
document.addEventListener("DOMContentLoaded", () => {
  Engine.load();
});