/* =========================================
   DISPATCH STORE
========================================= */

const Store = {
  API_DISPATCH: "/api/dispatch",
  API_SERVICES: "/api/services/admin",
  API_SYSTEM: "/api/system-design",

  headers(json = false) {
    const token = localStorage.getItem("token") || "";

    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  },

  async request(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.headers(Boolean(options.body)),
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.message ||
        data.error ||
        `Dispatch request failed (${res.status})`
      );
    }

    return data;
  },

  async optionalRequest(url, fallback) {
    try {
      return await this.request(url);
    } catch (err) {
      console.warn("OPTIONAL DISPATCH REQUEST FAILED:", url, err);
      return fallback;
    }
  },

  async load() {
    try {
      // Dispatch data is required. Optional page data must never erase trips.
      const dispatchData = await this.request(this.API_DISPATCH);

      const [servicesData, systemData] = await Promise.all([
        this.optionalRequest(this.API_SERVICES, []),
        this.optionalRequest(this.API_SYSTEM, {})
      ]);

      return {
        trips: Array.isArray(dispatchData?.trips)
          ? dispatchData.trips
          : [],
        drivers: Array.isArray(dispatchData?.drivers)
          ? dispatchData.drivers
          : [],
        schedule: dispatchData?.schedule || {},
        services: Array.isArray(servicesData)
          ? servicesData
          : servicesData?.services || [],
        timezone:
          systemData?.timezone ||
          dispatchData?.timezone ||
          "America/Phoenix"
      };
    } catch (err) {
      console.error("DISPATCH LOAD FAILED:", err);

      return {
        trips: [],
        drivers: [],
        schedule: {},
        services: [],
        timezone: "America/Phoenix",
        error: err.message
      };
    }
  },

  async saveDriver(tripId, driverId) {
    try {
      return await this.request(
        `/api/dispatch/${encodeURIComponent(tripId)}/driver`,
        {
          method: "PATCH",
          body: JSON.stringify({
            driverId: driverId || "",
            assignmentType: "MANUAL"
          })
        }
      );
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async autoAssign(ids = []) {
    try {
      return await this.request("/api/dispatch/auto-assign", {
        method: "POST",
        body: JSON.stringify({ ids })
      });
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async sendTrips(ids = []) {
    try {
      return await this.request("/api/dispatch/send", {
        method: "PATCH",
        body: JSON.stringify({ ids })
      });
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
};

window.Store = Store;