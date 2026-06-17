(function(){

  if(window.__SUNBEAM_DRIVER_LOCATION_TRACKER__){
    return;
  }

  window.__SUNBEAM_DRIVER_LOCATION_TRACKER__ = true;

  console.log("driver/location.js loaded");

  /* ===============================
     SESSION
  =============================== */

  function safeParse(v){
    try{
      return JSON.parse(v);
    }catch(err){
      return null;
    }
  }

  const driver =
    safeParse(localStorage.getItem("loggedDriver")) ||
    safeParse(localStorage.getItem("loggedUser")) ||
    safeParse(localStorage.getItem("loggedUser")) ||
    safeParse(localStorage.getItem("user")) ||
    null;

  if(!driver){
    console.log("NO DRIVER SESSION");
    return;
  }

  const role =
    String(
      driver.role ||
      localStorage.getItem("role") ||
      "driver"
    ).toLowerCase();

  if(role !== "driver"){
    console.log("NOT DRIVER SESSION");
    return;
  }

  /* ===============================
     CONFIG
  =============================== */

  const API_URL = "/api/driver/location";
  const INTERVAL_MS = 15000;
  const MOVE_FILTER = 0.0005;

  /* ===============================
     DRIVER DATA
  =============================== */

  const DRIVER_ID =
    String(
      driver._id ||
      driver.id ||
      driver.driverId ||
      driver.userId ||
      localStorage.getItem("driverId") ||
      localStorage.getItem("userId") ||
      ""
    );

  const DRIVER_NAME =
    driver.name ||
    driver.username ||
    localStorage.getItem("driverName") ||
    "Driver";

  const DRIVER_PHONE =
    driver.phone ||
    localStorage.getItem("phone") ||
    "";

  const VEHICLE_NUMBER =
    driver.vehicleNumber ||
    localStorage.getItem("vehicleNumber") ||
    "";

  if(!DRIVER_ID){
    console.log("NO DRIVER_ID FOUND");
    return;
  }

  /* ===============================
     STATE
  =============================== */

  let lastSentTime = 0;
  let lastLat = null;
  let lastLng = null;
  let watchId = null;

  /* ===============================
     HELPERS
  =============================== */

  function getActiveTripId(){

    const params =
      new URLSearchParams(window.location.search);

    return (
      params.get("tripId") ||
      localStorage.getItem("activeDriverTripId") ||
      ""
    );

  }

  function shouldSend(lat,lng){

    const now = Date.now();

    if(!lastSentTime){
      return true;
    }

    if(now - lastSentTime >= INTERVAL_MS){
      return true;
    }

    if(lastLat !== null && lastLng !== null){

      const moved =
        Math.abs(lat - lastLat) +
        Math.abs(lng - lastLng);

      if(moved >= MOVE_FILTER){
        return true;
      }

    }

    return false;

  }

  /* ===============================
     SEND TO MONGO THROUGH SERVER
  =============================== */

  async function sendLocation(lat,lng){

    if(!Number.isFinite(lat) || !Number.isFinite(lng)){
      return;
    }

    if(!shouldSend(lat,lng)){
      return;
    }

    try{

      const res =
        await fetch(API_URL,{
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            driverId: DRIVER_ID,
            name: DRIVER_NAME,
            phone: DRIVER_PHONE,
            vehicleNumber: VEHICLE_NUMBER,
            tripId: getActiveTripId(),
            routeMode: localStorage.getItem("driverRouteMode") || "",
            lat,
            lng
          })
        });

      const data =
        await res.json().catch(()=>null);

      console.log("LIVE LOCATION SAVED:", {
        status: res.status,
        ok: res.ok,
        data
      });

      if(res.ok){
        lastSentTime = Date.now();
        lastLat = lat;
        lastLng = lng;
      }

    }catch(err){
      console.log("LOCATION SEND ERROR:", err);
    }

  }

  /* ===============================
     START GPS
  =============================== */

  function startLocation(){

    if(!navigator.geolocation){
      console.log("GPS NOT SUPPORTED");
      return;
    }

    if(watchId !== null){
      return;
    }

    watchId =
      navigator.geolocation.watchPosition(

        pos => {

          const lat =
            Number(pos.coords.latitude);

          const lng =
            Number(pos.coords.longitude);

          sendLocation(lat,lng);

        },

        err => {
          console.log("GPS ERROR:", err);
        },

        {
          enableHighAccuracy:true,
          timeout:15000,
          maximumAge:3000
        }

      );

  }

  /* ===============================
     PAGE VISIBILITY
  =============================== */

  document.addEventListener("visibilitychange",()=>{

    if(!document.hidden){
      startLocation();
    }

  });

  window.addEventListener("beforeunload",()=>{

    if(watchId !== null){
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

  });

  /* ===============================
     START
  =============================== */

  startLocation();

})();