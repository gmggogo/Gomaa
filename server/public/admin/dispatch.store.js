/* =========================================
   DISPATCH STORE V3
========================================= */

const Store = {

  API_DISPATCH : "/api/dispatch",
  API_SERVICES : "/api/services/admin",
  API_SYSTEM   : "/api/system-design",

  async getJSON(url){

    try{

      const res = await fetch(url);

      if(!res.ok)
        throw new Error(url);

      return await res.json();

    }catch(err){

      console.log(
        "STORE ERROR:",
        url,
        err
      );

      return null;

    }

  },

  /* =========================
     LOAD DISPATCH
  ========================= */

  async load(){

    const [
      dispatchData,
      servicesData,
      systemData
    ] = await Promise.all([

      this.getJSON(
        this.API_DISPATCH
      ),

      this.getJSON(
        this.API_SERVICES
      ),

      this.getJSON(
        this.API_SYSTEM
      )

    ]);

    return {

      trips:
        Array.isArray(
          dispatchData?.trips
        )
          ? dispatchData.trips
          : [],

      drivers:
        Array.isArray(
          dispatchData?.drivers
        )
          ? dispatchData.drivers
          : [],

      schedule:
        dispatchData?.schedule || {},

      services:
        Array.isArray(
          servicesData
        )
          ? servicesData
          : [],

      timezone:
        systemData?.timezone ||
        "America/Phoenix"

    };

  },

  /* =========================
     ASSIGN DRIVER
  ========================= */

  async saveDriver(
    tripId,
    driverId
  ){

    try{

      const res =
        await fetch(

          `/api/dispatch/${tripId}/driver`,

          {
            method:"PATCH",

            headers:{
              "Content-Type":
                "application/json"
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

  /* =========================
     SEND TRIPS
  ========================= */

  async sendTrips(ids){

    try{

      const res =
        await fetch(

          "/api/dispatch/send",

          {
            method:"PATCH",

            headers:{
              "Content-Type":
                "application/json"
            },

            body:JSON.stringify({
              ids
            })
          }

        );

      const data =
        await res.json();

      return data;

    }catch(err){

      console.log(
        "SEND TRIPS ERROR:",
        err
      );

      return {

        success:false,

        message:
          "Send failed"

      };

    }

  }

};

window.Store = Store;