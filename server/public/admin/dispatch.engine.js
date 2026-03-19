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

      const tripsRaw = Array.isArray(data.trips)
        ? data.trips
        : Array.isArray(data.data?.trips)
          ? data.data.trips
          : [];

      const driversRaw = Array.isArray(data.drivers)
        ? data.drivers
        : Array.isArray(data.data?.drivers)
          ? data.data.drivers
          : [];

      this.trips = tripsRaw.map(t => ({
        ...t,
        _id: String(t._id || ""),
        driverId: t.driverId ? String(t.driverId) : "",
        vehicle: t.vehicle || ""
      }));

      this.drivers = driversRaw.map(d => ({
        ...d,
        _id: String(d._id || "")
      }));

      this.schedule = data.schedule || data.data?.schedule || {};
      this.selected = {};

      this.trips.forEach(t => {
        this.selected[t._id] = false;
      });

      this.sortTrips();

      /* auto assign لكل الرحلات من غير ما يحتاج select */
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
    const dateStr = String(trip?.tripDate || "").trim();
    const timeStr = String(trip?.tripTime || "").trim();

    if (!dateStr && !timeStr) return 0;

    const raw = `${dateStr} ${timeStr}`.trim();
    const d = new Date(raw);

    if (!isNaN(d.getTime())) return d.getTime();

    const d2 = new Date(dateStr);
    if (!isNaN(d2.getTime())) return d2.getTime();

    return 0;
  },

  getTripDayKey(trip) {
    if (!trip || !trip.tripDate) return "";

    const date = new Date(trip.tripDate);
    if (isNaN(date.getTime())) return "";

    const day = date.toLocaleDateString("en-US", { weekday: "short" });

    const map = {
      Sun: "sun",
      Mon: "mon",
      Tue: "tue",
      Wed: "wed",
      Thu: "thu",
      Fri: "fri",
      Sat: "sat"
    };

    return map[day] || "";
  },

  normalizeScheduleValue(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === 1) return true;
    if (value === 0) return false;

    const v = String(value || "").trim().toLowerCase();

    if (!v) return false;

    return [
      "1",
      "true",
      "yes",
      "y",
      "on",
      "active",
      "work",
      "working",
      "available"
    ].includes(v);
  },

  isDriverActiveOnTripDay(driverId, trip) {
    const id = String(driverId || "");
    const s = this.schedule[id];

    if (!s) return false;

    const status = String(s.status || "").trim().toUpperCase();
    if (status === "NOT ACTIVE" || status === "DISABLED" || status === "OFF") {
      return false;
    }

    const dayKey = this.getTripDayKey(trip);
    if (!dayKey) return false;

    return this.normalizeScheduleValue(s[dayKey]);
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

  getAvailableDrivers(trip) {
    if (!trip) return [];

    return this.drivers
      .filter(d => this.isDriverActiveOnTripDay(d._id, trip))
      .sort((a, b) => {
        const aCount = this.countDriverTrips(a._id, trip._id);
        const bCount = this.countDriverTrips(b._id, trip._id);
        return aCount - bCount;
      });
  },

  /* ================= AUTO ASSIGN ================= */
  async autoAssignAll() {
    if (!this.drivers.length || !this.trips.length) return;

    let index = 0;

    for (const trip of this.trips) {
      /* لو فيه سواق متعين بالفعل، سيبه فقط لو شغال في يوم الرحلة */
      if (trip.driverId) {
        if (this.isDriverActiveOnTripDay(trip.driverId, trip)) {
          trip.vehicle = this.getDriverVehicle(trip.driverId);
          continue;
        } else {
          trip.driverId = "";
          trip.vehicle = "";
        }
      }

      const validDrivers = this.getAvailableDrivers(trip);

      if (!validDrivers.length) {
        trip.driverId = "";
        trip.vehicle = "";
        continue;
      }

      const driver = validDrivers[index % validDrivers.length];

      trip.driverId = String(driver._id);
      trip.vehicle = this.getDriverVehicle(driver._id);

      index++;
    }
  },

  async redistributeSelected() {
    const selectedTrips = this.getSelectedTrips();
    if (!selectedTrips.length || !this.drivers.length) return;

    let index = 0;

    for (const trip of selectedTrips) {
      const validDrivers = this.getAvailableDrivers(trip);

      if (!validDrivers.length) {
        trip.driverId = "";
        trip.vehicle = "";
        continue;
      }

      const driver = validDrivers[index % validDrivers.length];

      trip.driverId = String(driver._id);
      trip.vehicle = this.getDriverVehicle(driver._id);

      try {
        await Store.assignDriver(trip._id, driver._id);
      } catch (err) {
        console.error("Redistribute save error:", err);
      }

      index++;
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

    if (!id) {
      trip.driverId = "";
      trip.vehicle = "";
      UI.render();
      return;
    }

    if (!this.isDriverActiveOnTripDay(id, trip)) {
      console.warn("Driver is not active on trip day:", id, trip.tripDate);
      UI.render();
      return;
    }

    trip.driverId = id;
    trip.vehicle = this.getDriverVehicle(id);

    try {
      await Store.assignDriver(trip._id, id);
    } catch (err) {
      console.error("Manual assign save error:", err);
    }

    UI.render();
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