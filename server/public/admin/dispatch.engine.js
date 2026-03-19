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

      const tripsRaw = data.trips || data.data?.trips || [];
      const driversRaw = data.drivers || data.data?.drivers || [];

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
      return this.getTripDateValue(a) - this.getTripDateValue(b);
    });
  },

  getTripDateValue(trip) {
    const d = new Date(`${trip.tripDate || ""} ${trip.tripTime || ""}`);
    return isNaN(d) ? 0 : d.getTime();
  },

  getDriverVehicle(driverId) {
    const s = this.schedule[String(driverId)] || {};
    const d = this.drivers.find(x => String(x._id) === String(driverId)) || {};

    return (
      s.carNumber ||
      s.vehicleNumber ||
      s.car ||
      d.carNumber ||
      d.vehicle ||
      ""
    );
  },

  getTripById(id) {
    return this.trips.find(t => String(t._id) === String(id));
  },

  getSelectedTrips() {
    return this.trips.filter(t => this.selected[t._id]);
  },

  countDriverTrips(driverId, excludeId = "") {
    return this.trips.filter(t => {
      if (excludeId && t._id === excludeId) return false;
      return String(t.driverId) === String(driverId);
    }).length;
  },

  /* ================= 🔥 DATE BASED ACTIVE CHECK ================= */

  isDriverActiveOnTripDay(driverId, trip) {

    const s = this.schedule[String(driverId)];
    if (!s) return false;

    // حالة السواق
    const status = String(s.status || "").toLowerCase();
    if (status.includes("not")) return false;

    if (!trip.tripDate) return false;

    const date = new Date(trip.tripDate);
    if (isNaN(date)) return false;

    const key = `${date.getMonth() + 1}/${date.getDate()}`; // 3/19

    // 🔥 search in schedule بأي شكل
    for (const k in s) {
      if (k.includes(key)) {
        const val = String(s[k]).toLowerCase();
        if (
          val === "true" ||
          val === "1" ||
          val === "yes" ||
          val === "on"
        ) {
          return true;
        }
      }
    }

    return false;
  },

  /* ================= FILTER DRIVERS ================= */

  getAvailableDrivers(trip) {

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

    let index = 0;

    for (const trip of this.trips) {

      // لو فيه سواق → تأكد إنه شغال
      if (trip.driverId) {

        if (this.isDriverActiveOnTripDay(trip.driverId, trip)) {
          trip.vehicle = this.getDriverVehicle(trip.driverId);
          continue;
        } else {
          trip.driverId = "";
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

  /* ================= REDISTRIBUTE ================= */

  async redistributeSelected() {

    const selected = this.getSelectedTrips();
    if (!selected.length) return;

    let index = 0;

    for (const trip of selected) {

      const validDrivers = this.getAvailableDrivers(trip);

      if (!validDrivers.length) continue;

      const driver = validDrivers[index % validDrivers.length];

      trip.driverId = driver._id;
      trip.vehicle = this.getDriverVehicle(driver._id);

      try {
        await Store.assignDriver(trip._id, driver._id);
      } catch (e) {
        console.error(e);
      }

      index++;
    }

    UI.render();
  },

  /* ================= UI ================= */

  toggleSelect(id) {
    this.selected[id] = !this.selected[id];
    UI.render();
  },

  toggleSelectAll() {
    const all = this.trips.length;
    const selected = this.getSelectedTrips().length;

    const flag = selected !== all;

    this.trips.forEach(t => {
      this.selected[t._id] = flag;
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

    if (!this.isDriverActiveOnTripDay(driverId, trip)) {
      alert("Driver not active this day");
      return;
    }

    trip.driverId = driverId;
    trip.vehicle = this.getDriverVehicle(driverId);

    try {
      await Store.assignDriver(trip._id, driverId);
    } catch (e) {
      console.error(e);
    }

    UI.render();
  },

  /* ================= SEND ================= */

  async sendSelected() {
    const ids = this.getSelectedTrips().map(t => t._id);
    if (!ids.length) return;

    await Store.sendTrips(ids);
  },

  async sendOne(id) {
    await Store.sendTrips([id]);
  }
};

/* ================= GLOBAL ================= */

window.Engine = Engine;

window.redistribute = () => Engine.redistributeSelected();
window.sendSelected = () => Engine.sendSelected();
window.toggleSelectAll = () => Engine.toggleSelectAll();
window.toggleEdit = () => Engine.toggleEdit();

/* ================= START ================= */

document.addEventListener("DOMContentLoaded", () => {
  Engine.load();
});