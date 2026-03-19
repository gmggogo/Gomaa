const Store = {
  API: "/api/dispatch",

  async load(){
    const res = await fetch(this.API);

    if(!res.ok){
      throw new Error("Dispatch Load Error");
    }

    const data = await res.json();

    return {
      trips: data.trips || data.data?.trips || [],
      drivers: data.drivers || data.data?.drivers || [],
      schedule: data.schedule || data.data?.schedule || {}
    };
  },

  async assignDriver(tripId, driverId){
    const res = await fetch(`/api/dispatch/${tripId}/driver`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId })
    });

    if(!res.ok){
      throw new Error("Assign Driver Error");
    }

    return res.json().catch(() => ({}));
  },

  async sendTrips(ids){
    const res = await fetch("/api/dispatch/send", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    });

    if(!res.ok){
      throw new Error("Send Trips Error");
    }

    return res.json().catch(() => ({}));
  },

  async disableTrip(id){
    const res = await fetch(`/api/trips/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: true })
    });

    if(!res.ok){
      throw new Error("Disable Trip Error");
    }

    return res.json().catch(() => ({}));
  }
};

window.Store = Store;