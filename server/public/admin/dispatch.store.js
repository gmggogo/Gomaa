/* =========================================
   DISPATCH STORE V3
========================================= */

const Store = {

  API_DISPATCH : "/api/dispatch",
  API_SERVICES : "/api/services/admin",
  API_SYSTEM   : "/api/system-design",

  headers(json = false){
    const token = localStorage.getItem("token") || "";
    return {
      ...(json ? {"Content-Type":"application/json"} : {}),
      ...(token ? {Authorization:`Bearer ${token}`} : {})
    };
  },

  async request(url,options = {}){
    const res = await fetch(url,{
      ...options,
      headers:{
        ...this.headers(Boolean(options.body)),
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(()=>({}));

    if(!res.ok){
      throw new Error(
        data.message ||
        data.error ||
        "Dispatch request failed"
      );
    }

    return data;
  },

  async load(){
    try{
      const [dispatchData,servicesData,systemData] =
        await Promise.all([
          this.request(this.API_DISPATCH),
          this.request(this.API_SERVICES),
          this.request(this.API_SYSTEM)
        ]);

      return {
        trips:Array.isArray(dispatchData?.trips)
          ? dispatchData.trips
          : [],
        drivers:Array.isArray(dispatchData?.drivers)
          ? dispatchData.drivers
          : [],
        schedule:dispatchData?.schedule || {},
        services:Array.isArray(servicesData)
          ? servicesData
          : servicesData?.services || [],
        timezone:systemData?.timezone || "America/Phoenix"
      };
    }catch(err){
      console.log("STORE LOAD ERROR:",err);
      return {
        trips:[],
        drivers:[],
        schedule:{},
        services:[],
        timezone:"America/Phoenix"
      };
    }
  },

  async saveDriver(tripId,driverId){
    try{
      return await this.request(
        `/api/dispatch/${encodeURIComponent(tripId)}/driver`,
        {
          method:"PATCH",
          body:JSON.stringify({
            driverId:driverId || "",
            assignmentType:"MANUAL"
          })
        }
      );
    }catch(err){
      return {success:false,message:err.message};
    }
  },

  async autoAssign(ids = []){
    try{
      return await this.request(
        "/api/dispatch/auto-assign",
        {
          method:"POST",
          body:JSON.stringify({ids})
        }
      );
    }catch(err){
      return {success:false,message:err.message};
    }
  },

  async sendTrips(ids){
    try{
      return await this.request(
        "/api/dispatch/send",
        {
          method:"PATCH",
          body:JSON.stringify({ids})
        }
      );
    }catch(err){
      return {success:false,message:err.message};
    }
  }
};

window.Store = Store;