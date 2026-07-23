

Pasted text(12).txt
Document
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
        /api/dispatch/${tripId}/driver,
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

    try{

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

    }catch(err){

      console.log(
        "SEND TRIPS ERROR:",
        err
      );

      return {
        success:false
      };

    }

  }

};

window.Store = Store;


Pasted text(13).txt
Document


Pasted text(14).txt
Document


Pasted text(15).txt
Document


Pasted text(16).txt
Document

Worked for 29s
معاك حق، أنا غلطت لما كتبت مسارات من عندي من غير ما تكون ظاهرة في الملفات.

الأسماء المؤكدة من الكود هي:

DispatchAssignment-FINAL.txt
الاسم الصحيح: DispatchAssignment.js
المسار: server/models/DispatchAssignment.js

dispatchRoutes-FINAL.txt
الاسم الصحيح: dispatchRoutes.js
المسار: server/routes/dispatchRoutes.js

أما ملفا الصفحة:

dispatch-FINAL.txt هو JavaScript الرئيسي لصفحة الديسبتش.

dispatch-store-FINAL.txt هو ملف Store الخاص بها.

لكن مسارهما واسمهما الأصليان غير مكتوبين داخل الكود، لذلك ما ينفعش أقول public/js من عندي. ابعت لي فقط صورة فولدر صفحة الديسبتش أو ملف HTML الخاص بها، وأنا أقول لك الاسمين والمسارين الحقيقيين بالضبط. ما تستبدلش ملفات الصفحة قبل ما نحددهم.


IMG_229AF39E-E2C9-47FA-9FEE-2E918AC4A712.jpeg

أيوه، الصورة وضّحت الأسماء والمسارات الحقيقية:

dispatch-FINAL.txt
ضعه باسم: dispatchengine.js
المسار:

D:\Sunbeamllc\server\public\admin\dispatchengine.js
dispatch-store-FINAL.txt
ضعه باسم: dispatch-store.js
المسار:

D:\Sunbeamllc\server\public\admin\dispatch-store.js
dispatchRoutes-FINAL.txt
ضعه باسم: dispatchRoutes.js
المسار:

D:\Sunbeamllc\server\routes\dispatchRoutes.js
DispatchAssignment-FINAL.txt
ضعه باسم: DispatchAssignment.js
المسار:

D:\Sunbeamllc\server\models\DispatchAssignment.js
يعني ملف الصفحة الرئيسي الصحيح عندك اسمه dispatchengine.js، وليس dispatch.js. استبدل الملفات القديمة بعد الاحتفاظ بنسخة احتياطية منها.


IMG_D893D1BA-34AC-4854-99CF-16953A381CD5.jpeg
 ديسبتش مسحبش الرحلات

Worked for 37s
لقيت المشكلة واتصلحت يا معلم.

السبب إن أي طلب إضافي يرجع 404 كان بيمسح الرحلات كلها من الصفحة، حتى لو /api/dispatch رجّعها صح.

نزّل الملف المعدّل:


حطه باسم:

dispatch-store.js
في المسار:

D:\Sunbeamllc\server\public\admin\dispatch-store.js
بعدها ارفع التعديل على Render واعمل تحديث قوي للصفحة بـCtrl + F5.

خطأ header.css الظاهر في الصورة خاص بالتنسيق، وليس سبب اختفاء الرحلات.


dispatch-store-FINAL.txt


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
dispatch-store-FINAL.txt


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