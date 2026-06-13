/* =========================================
   DISPATCH STORE V2
========================================= */

const Store = {

  API_TRIPS    : "/api/trips",
  API_DRIVERS  : "/api/drivers",
  API_SCHEDULE : "/api/driver-schedule",
  API_SERVICES : "/api/services/admin",
  API_SYSTEM   : "/api/system-design",

  async getJSON(url){

    try{

      const res = await fetch(url);

      if(!res.ok)
        throw new Error(url);

      return await res.json();

    }catch(err){

      console.log("STORE ERROR:",url,err);

      return null;

    }

  },

  async load(){

    const [
      tripsData,
      driversData,
      scheduleData,
      servicesData,
      systemData
    ] = await Promise.all([

      this.getJSON(this.API_TRIPS),
      this.getJSON(this.API_DRIVERS),
      this.getJSON(this.API_SCHEDULE),
      this.getJSON(this.API_SERVICES),
      this.getJSON(this.API_SYSTEM)

    ]);

    return {

      trips:
        Array.isArray(tripsData)
          ? tripsData
          : tripsData?.trips || [],

      drivers:
        Array.isArray(driversData)
          ? driversData
          : driversData?.drivers || [],

      schedule:
        scheduleData || {},

      services:
        Array.isArray(servicesData)
          ? servicesData
          : [],

      timezone:
        systemData?.timezone ||
        "America/Phoenix"

    };

  },

 async saveDriver(tripId,driverId){

  try{

    const res = await fetch(
      `/api/dispatch-assignment/${tripId}/assign`,
      {
        method:"PATCH",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          driverId
        })
      }
    );

    const data =
      await res.json();

    if(!res.ok){

      return {
        success:false,
        message:
          data.message ||
          "Driver assignment failed"
      };

    }

    return data;

  }catch(err){

    console.log(
      "SAVE DRIVER ERROR:",
      err
    );

    return {
      success:false,
      message:
        "Driver assignment failed"
    };

  }

},

  async sendTrips(ids){

    const res = await fetch(
      "/api/dispatch/send",
      {
        method:"PATCH",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          ids
        })
      }
    );

    return await res.json();

  }

};

window.Store = Store;