(function () {

  if(window.__SUNBEAM_DRIVER_NAV__){
    return;
  }

  window.__SUNBEAM_DRIVER_NAV__ = true;

  const ROUTES = {
    home:"dashboard.html",
    trips:"trips.html",
    map:"map.html",
    chat:"chat.html",
    login:"login.html"
  };

  function getCurrentPage(){
    const page = String(window.location.pathname || "")
      .split("/")
      .pop()
      .toLowerCase();

    if(page === "trips.html") return "trips";
    if(page === "map.html") return "map";
    if(page === "chat.html") return "chat";

    return "home";
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

  function renderNavigation(){
    const root = document.getElementById("driverNav");
    if(!root) return;

    const active = getCurrentPage();

    root.innerHTML = `
      <div class="nav">

        <button
          id="navHome"
          class="nav-home ${active === "home" ? "active" : ""}"
          type="button"
        >
          <span>🏠</span>
          Home
        </button>

        <button
          id="navTrips"
          class="nav-trips ${active === "trips" ? "active" : ""}"
          type="button"
        >
          <span>🚗</span>
          Trips
        </button>

        <button
          id="navMap"
          class="nav-map ${active === "map" ? "active" : ""}"
          type="button"
        >
          <span>🗺️</span>
          Map
        </button>

        <button
          id="navChat"
          class="nav-chat ${active === "chat" ? "active" : ""}"
          type="button"
        >
          <span>💬</span>
          Chat
        </button>

        <button
          id="navLogout"
          class="nav-logout"
          type="button"
        >
          <span>🚪</span>
          Logout
        </button>

      </div>
    `;

    document.getElementById("navHome")?.addEventListener("click", ()=>go("home"));
    document.getElementById("navTrips")?.addEventListener("click", ()=>go("trips"));
    document.getElementById("navMap")?.addEventListener("click", ()=>go("map"));
    document.getElementById("navChat")?.addEventListener("click", ()=>go("chat"));
    document.getElementById("navLogout")?.addEventListener("click", logout);
  }

  window.goHome = ()=>go("home");
  window.goTrips = ()=>go("trips");
  window.goMap = ()=>go("map");
  window.goChat = ()=>go("chat");
  window.logout = logout;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", renderNavigation);
  }else{
    renderNavigation();
  }

})();