(function () {

  if(window.SUNBEAM_DRIVER_DASHBOARD){
    return;
  }

  window.SUNBEAM_DRIVER_DASHBOARD = true;

  const ROUTES = {
    dashboard:"dashboard.html",
    trips:"trips.html",
    history:"trip-history.html",
    map:"map.html",
    hours:"work-hours.html",
    earnings:"Earnings.html",
    summary:"summary.html",
    chat:"chat.html",
    login:"login.html"
  };

  function $(id){
    return document.getElementById(id);
  }

  function safeParse(json,fallback = null){
    try{
      return JSON.parse(json);
    }catch{
      return fallback;
    }
  }

  function getLoggedDriver(){
    return safeParse(
      localStorage.getItem("loggedDriver"),
      {}
    );
  }

  function loadDriverName(){

    const el = $("driverName");
    if(!el) return;

    const driver = getLoggedDriver();

    el.textContent =
      driver?.name ||
      driver?.fullName ||
      driver?.username ||
      driver?.email ||
      "Driver";
  }

  /* =========================
     SUMMARY CARD NAME
     summary.html is now the Earnings Summary page.
  ========================= */

  function syncSummaryCardName(){

    const card =
      $("cardSummary");

    if(!card){
      return;
    }

    const title =
      card.querySelector(
        ".summary-title"
      );

    if(title){
      title.textContent =
        "Earnings Summary";
      return;
    }

    /*
      Fallback for an older dashboard version
      where cardSummary may contain plain text.
    */
    const textNodes =
      Array.from(
        card.childNodes
      )
      .filter(
        node=>
          node.nodeType ===
          Node.TEXT_NODE
      );

    if(textNodes.length){
      textNodes.forEach(
        node=>
          node.textContent = ""
      );

      card.appendChild(
        document.createTextNode(
          " Earnings Summary"
        )
      );
    }
  }

  function go(pageKey){

    const target = ROUTES[pageKey];
    if(!target) return;

    window.location.href = target;
  }

  function logout(){

    localStorage.removeItem("driverToken");
    localStorage.removeItem("loggedDriver");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("driverName");
    localStorage.removeItem("companyName");
    localStorage.removeItem("systemTimezone");
    localStorage.removeItem("appTimezone");

    window.location.href = ROUTES.login;
  }

  function ensureSession(){

    const driver = getLoggedDriver();

    if(
      !driver ||
      Object.keys(driver).length === 0
    ){
      window.location.href = ROUTES.login;
      return false;
    }

    return true;
  }

  function bindClick(id,handler){

    const el = $(id);

    if(el){
      el.addEventListener(
        "click",
        handler
      );
    }
  }

  function bindNavigation(){

    bindClick("cardTrips",()=>go("trips"));
    bindClick("cardMap",()=>go("map"));
    bindClick("cardHistory",()=>go("history"));
    bindClick("cardHours",()=>go("hours"));
    bindClick("cardEarnings",()=>go("earnings"));
    bindClick("cardSummary",()=>go("summary"));

    bindClick("navHome",()=>go("dashboard"));
    bindClick("navTrips",()=>go("trips"));
    bindClick("navMap",()=>go("map"));
    bindClick("navChat",()=>go("chat"));
    bindClick("navLogout",logout);
  }

  function exposeGlobals(){

    window.goTrips = ()=>go("trips");
    window.goMap = ()=>go("map");
    window.goHistory = ()=>go("history");
    window.goHours = ()=>go("hours");
    window.goEarnings = ()=>go("earnings");
    window.goSummary = ()=>go("summary");
    window.goChat = ()=>go("chat");
    window.logout = logout;
  }

  function init(){

    if(!ensureSession()){
      return;
    }

    loadDriverName();

    /*
      Keep dashboard label aligned with the new file purpose.
      The destination remains summary.html.
    */
    syncSummaryCardName();

    bindNavigation();
    exposeGlobals();

    document.addEventListener(
      "visibilitychange",
      function(){

        if(!document.hidden){
          ensureSession();
          loadDriverName();
          syncSummaryCardName();
        }

      }
    );
  }

  if(document.readyState === "loading"){

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  }else{

    init();

  }

})();