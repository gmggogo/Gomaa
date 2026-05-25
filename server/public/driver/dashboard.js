(function () {

  if(window.__SUNBEAM_DRIVER_DASHBOARD__)
    return;

  window.__SUNBEAM_DRIVER_DASHBOARD__ =
    true;

  /* =====================================================
     ROUTES
  ===================================================== */

  const ROUTES = {

    dashboard:
    "dashboard.html",

    trips:
    "trips.html",

    map:
    "map.html",

    hours:
    "work-hours.html",

    earnings:
    "earnings.html",

    summary:
    "summary.html",

    chat:
    "chat.html",

    login:
    "login.html"

  };

  /* =====================================================
     HELPERS
  ===================================================== */

  function $(id){

    return document.getElementById(id);

  }

  function safeParse(
    json,
    fallback = null
  ){

    try{

      return JSON.parse(json);

    }

    catch{

      return fallback;

    }

  }

  /* =====================================================
     DRIVER SESSION
  ===================================================== */

  function getLoggedDriver(){

    return safeParse(

      localStorage.getItem(
        "loggedDriver"
      ),

      {}

    );

  }

  /* =====================================================
     TIMEZONE
  ===================================================== */

  function getTimezone(){

    const driver =
      getLoggedDriver();

    return (

      driver?.timezone ||

      localStorage.getItem(
        "systemTimezone"
      ) ||

      "America/Phoenix"

    );

  }

/* =====================================================
   GET TIMEZONE
===================================================== */

function getTimezone(){

  return (

    localStorage.getItem(
      "systemTimezone"
    ) ||

    localStorage.getItem(
      "appTimezone"
    ) ||

    "America/Phoenix"

  );

}

/* =====================================================
   GET TIMEZONE
===================================================== */

function getTimezone(){

  return (

    /* SERVER BRANDING */

    window.Branding?.data?.timezone ||

    /* FALLBACK */

    localStorage.getItem(
      "systemTimezone"
    ) ||

    localStorage.getItem(
      "appTimezone"
    ) ||

    "America/Phoenix"

  );

}

  /* =====================================================
     DRIVER NAME
  ===================================================== */

  function loadDriverName(){

    const el =
      $("driverName");

    if(!el) return;

    const driver =
      getLoggedDriver();

    el.textContent =

      driver?.name ||

      driver?.username ||

      driver?.email ||

      "Driver";

  }

  /* =====================================================
     NAVIGATION
  ===================================================== */

  function go(pageKey){

    const target =
      ROUTES[pageKey];

    if(!target) return;

    window.location.href =
      target;

  }

  /* =====================================================
     LOGOUT
  ===================================================== */

  function logout(){

    localStorage.removeItem(
      "driverToken"
    );

    localStorage.removeItem(
      "loggedDriver"
    );

    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "role"
    );

    localStorage.removeItem(
      "driverName"
    );

    localStorage.removeItem(
      "companyName"
    );

    window.location.href =
      ROUTES.login;

  }

  /* =====================================================
     SESSION CHECK
  ===================================================== */

  function ensureSession(){

    const driver =
      getLoggedDriver();

    if(
      !driver ||

      Object.keys(driver)
      .length === 0
    ){

      window.location.href =
        ROUTES.login;

      return false;

    }

    return true;

  }

  /* =====================================================
     BIND CLICK
  ===================================================== */

  function bindClick(
    id,
    handler
  ){

    const el =
      $(id);

    if(el){

      el.addEventListener(
        "click",
        handler
      );

    }

  }

  /* =====================================================
     NAVIGATION EVENTS
  ===================================================== */

  function bindNavigation(){

    bindClick(
      "cardTrips",
      ()=>go("trips")
    );

    bindClick(
      "cardMap",
      ()=>go("map")
    );

    bindClick(
      "cardHours",
      ()=>go("hours")
    );

    bindClick(
      "cardEarnings",
      ()=>go("earnings")
    );

    bindClick(
      "cardSummary",
      ()=>go("summary")
    );

    bindClick(
      "navHome",
      ()=>go("dashboard")
    );

    bindClick(
      "navTrips",
      ()=>go("trips")
    );

    bindClick(
      "navMap",
      ()=>go("map")
    );

    bindClick(
      "navChat",
      ()=>go("chat")
    );

    bindClick(
      "navLogout",
      logout
    );

  }

  /* =====================================================
     GLOBAL FUNCTIONS
  ===================================================== */

  function exposeGlobals(){

    window.goTrips =
      ()=>go("trips");

    window.goMap =
      ()=>go("map");

    window.goHours =
      ()=>go("hours");

    window.goEarnings =
      ()=>go("earnings");

    window.goSummary =
      ()=>go("summary");

    window.goChat =
      ()=>go("chat");

    window.logout =
      logout;

  }

  /* =====================================================
     GREETING
  ===================================================== */

  function updateGreeting(){

    const timezone =
      getTimezone();

    const now =
      new Date();

    const hour =
      Number(

        new Intl.DateTimeFormat(
          "en-US",
          {
            hour:"numeric",
            hour12:false,
            timeZone: timezone
          }
        ).format(now)

      );

    let greeting =
      "Good Evening";

    if(hour < 12){

      greeting =
        "Good Morning";

    }

    else if(hour < 18){

      greeting =
        "Good Afternoon";

    }

    const el =
      $("greetingText");

    if(el){

      el.innerText =
        greeting;

    }

  }

  /* =====================================================
     INIT
  ===================================================== */

  function init(){

    if(
      !ensureSession()
    ) return;

    updateTime();

    updateGreeting();

    loadDriverName();

    bindNavigation();

    exposeGlobals();

    setInterval(
      updateTime,
      1000
    );

    setInterval(
      updateGreeting,
      60000
    );

    document.addEventListener(
      "visibilitychange",
      function(){

        if(!document.hidden){

          ensureSession();

          updateTime();

          updateGreeting();

        }

      }
    );

  }

  /* =====================================================
     START
  ===================================================== */

  if(
    document.readyState
    === "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  }

  else{

    init();

  }

})();