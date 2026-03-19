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

      const tripsRaw = Array.isArray(data?.trips)
        ? data.trips
        : Array.isArray(data?.data?.trips)
          ? data.data.trips
          : [];

      const driversRaw = Array.isArray(data?.drivers)
        ? data.drivers
        : Array.isArray(data?.data?.drivers)
          ? data.data.drivers
          : [];

      const scheduleRaw = data?.schedule || data?.data?.schedule || {};

      this.trips = tripsRaw.map(t => ({
        ...t,
        _id: String(t._id || ""),
        driverId: t.driverId ? String(t.driverId) : "",
        driverName: t.driverName || "",
        vehicle: t.vehicle || "",
        driverAddress: t.driverAddress || "",
        disabled: t.disabled === true,
        dispatchSelected: t.dispatchSelected === true
      }));

      this.drivers = driversRaw.map(d => ({
        ...d,
        _id: String(d._id || "")
      }));

      this.schedule = scheduleRaw || {};
      this.selected = {};

      this.trips.forEach(t => {
        this.selected[t._id] = false;
      });

      this.sortTrips();

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

    if (!Number.isNaN(d.getTime())) return d.getTime();

    const d2 = this.parseTripDateOnly(dateStr);
    if (!d2) return 0;

    if (timeStr) {
      const parsedTime = this.applyTimeToDate(d2, timeStr);
      return parsedTime ? parsedTime.getTime() : d2.getTime();
    }

    return d2.getTime();
  },

  parseTripDateOnly(value) {
    if (!value) return null;

    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct;

    const str = String(value).trim();

    const slash = str.split("/");
    if (slash.length === 3) {
      const a = parseInt(slash[0], 10);
      const b = parseInt(slash[1], 10);
      const c = parseInt(slash[2], 10);

      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) {
        if (String(slash[0]).length === 4) {
          const d1 = new Date(a, b - 1, c);
          if (!Number.isNaN(d1.getTime())) return d1;
        } else {
          const d2 = new Date(c, a - 1, b);
          if (!Number.isNaN(d2.getTime())) return d2;
        }
      }
    }

    const dash = str.split("-");
    if (dash.length === 3) {
      const a = parseInt(dash[0], 10);
      const b = parseInt(dash[1], 10);
      const c = parseInt(dash[2], 10);

      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) {
        if (String(dash[0]).length === 4) {
          const d3 = new Date(a, b - 1, c);
          if (!Number.isNaN(d3.getTime())) return d3;
        } else {
          const d4 = new Date(c, a - 1, b);
          if (!Number.isNaN(d4.getTime())) return d4;
        }
      }
    }

    return null;
  },

  applyTimeToDate(dateObj, timeStr) {
    const base = new Date(dateObj);
    const txt = String(timeStr || "").trim().toLowerCase();
    if (!txt) return base;

    const m12 = txt.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (m12) {
      let hour = parseInt(m12[1], 10);
      const minute = parseInt(m12[2], 10);
      const ampm = m12[3].toLowerCase();

      if (ampm === "pm" && hour !== 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;

      base.setHours(hour, minute, 0, 0);
      return base;
    }

    const m24 = txt.match(/^(\d{1,2}):(\d{2})$/);
    if (m24) {
      const hour = parseInt(m24[1], 10);
      const minute = parseInt(m24[2], 10);
      base.setHours(hour, minute, 0, 0);
      return base;
    }

    return base;
  },

  getTripDayInfo(trip) {
    const d = this.parseTripDateOnly(trip?.tripDate);
    if (!d) return null;

    const shortDay = d.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
    const fullDay = d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();

    return {
      date: d,
      shortDay,
      fullDay,
      month,
      day,
      year,
      keys: [
        shortDay,
        fullDay,
        `${month}/${day}`,
        `${month}/${day}/${year}`,
        `${month}-${day}`,
        `${month}-${day}-${year}`,
        `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
        `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`,
        `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}-${year}`,
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      ]
    };
  },

  normalizeScheduleValue(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === 1) return true;
    if (value === 0) return false;

    const txt = String(value || "").trim().toLowerCase();

    if (!txt) return false;

    return [
      "true",
      "1",
      "yes",
      "y",
      "on",
      "active",
      "selected",
      "work",
      "working",
      "available"
    ].includes(txt);
  },

  getDriverSchedule(driverId) {
    return this.schedule[String(driverId)] || null;
  },

  getDriverVehicle(driverId) {
    const id = String(driverId || "");
    const s = this.getDriverSchedule(id) || {};
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

  getDriverAddress(driverId) {
    const id = String(driverId || "");
    const s = this.getDriverSchedule(id) || {};
    const d = this.drivers.find(x => String(x._id) === id) || {};

    return s.address || d.address || "";
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
      if (t.disabled === true) return false;
      return String(t.driverId || "") === id;
    }).length;
  },

  isDriverEnabled(driverId) {
    const d = this.getDriverById(driverId);
    if (!d) return false;
    if (d.active === false) return false;

    const s = this.getDriverSchedule(driverId);

    if (!s) return true;
    if (s.enabled === false) return false;

    return true;
  },

  isDriverActiveOnTripDay(driverId, trip) {
    const id = String(driverId || "");
    const d = this.getDriverById(id);

    if (!d) return false;
    if (d.active === false) return false;

    const s = this.getDriverSchedule(id);
    if (!s) return true;
    if (s.enabled === false) return false;

    const info = this.getTripDayInfo(trip);
    if (!info) return false;

    const days = s.days || {};

    for (const key of info.keys) {
      if (Object.prototype.hasOwnProperty.call(days, key)) {
        return this.normalizeScheduleValue(days[key]);
      }
    }

    for (const key in days) {
      if (!Object.prototype.hasOwnProperty.call(days, key)) continue;

      const cleanKey = String(key).trim().toLowerCase();
      if (info.keys.includes(cleanKey)) {
        return this.normalizeScheduleValue(days[key]);
      }
    }

    return false;
  },

  getAvailableDrivers(trip) {
    if (!trip) return [];

    return this.drivers
      .filter(d => this.isDriverActiveOnTripDay(d._id, trip))
      .sort((a, b) => {
        const aCount = this.countDriverTrips(a._id, trip._id);
        const bCount = this.countDriverTrips(b._id, trip._id);

        if (aCount !== bCount) return aCount - bCount;

        const aName = String(a.name || "").toLowerCase();
        const bName = String(b.name || "").toLowerCase();

        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
      });
  },

  /* ================= AUTO ASSIGN ================= */
  async autoAssignAll() {
    if (!this.drivers.length || !this.trips.length) return;

    let index = 0;

    for (const trip of this.trips) {
      if (trip.disabled === true) continue;

      if (trip.driverId) {
        if (this.isDriverActiveOnTripDay(trip.driverId, trip)) {
          trip.vehicle = this.getDriverVehicle(trip.driverId);
          trip.driverAddress = this.getDriverAddress(trip.driverId);

          const existingDriver = this.getDriverById(trip.driverId);
          if (existingDriver) {
            trip.driverName = existingDriver.name || trip.driverName || "";
          }

          continue;
        } else {
          trip.driverId = "";
          trip.driverName = "";
          trip.vehicle = "";
          trip.driverAddress = "";
        }
      }

      const validDrivers = this.getAvailableDrivers(trip);

      if (!validDrivers.length) {
        trip.driverId = "";
        trip.driverName = "";
        trip.vehicle = "";
        trip.driverAddress = "";
        continue;
      }

      const driver = validDrivers[index % validDrivers.length];

      trip.driverId = String(driver._id);
      trip.driverName = driver.name || "";
      trip.vehicle = this.getDriverVehicle(driver._id);
      trip.driverAddress = this.getDriverAddress(driver._id);

      index++;
    }
  },

  async redistributeSelected() {
    const selectedTrips = this.getSelectedTrips();
    if (!selectedTrips.length || !this.drivers.length) return;

    let index = 0;

    for (const trip of selectedTrips) {
      if (trip.disabled === true) continue;

      const validDrivers = this.getAvailableDrivers(trip);

      if (!validDrivers.length) {
        trip.driverId = "";
        trip.driverName = "";
        trip.vehicle = "";
        trip.driverAddress = "";
        continue;
      }

      const driver = validDrivers[index % validDrivers.length];

      trip.driverId = String(driver._id);
      trip.driverName = driver.name || "";
      trip.vehicle = this.getDriverVehicle(driver._id);
      trip.driverAddress = this.getDriverAddress(driver._id);

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
      trip.driverName = "";
      trip.vehicle = "";
      trip.driverAddress = "";
      UI.render();
      return;
    }

    if (!this.isDriverActiveOnTripDay(id, trip)) {
      alert("Driver not active on trip date");
      return;
    }

    const driver = this.getDriverById(id);

    trip.driverId = id;
    trip.driverName = driver?.name || "";
    trip.vehicle = this.getDriverVehicle(id);
    trip.driverAddress = this.getDriverAddress(id);

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