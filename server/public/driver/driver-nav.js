(function () {

  if(window.__SUNBEAM_DRIVER_NAV__){
    return;
  }

  window.__SUNBEAM_DRIVER_NAV__ = true;

  const ROUTES = {
    dashboard:"dashboard.html",
    trips:"trips.html",
    map:"map.html",
    chat:"chat.html",
    login:"login.html"
  };

  function currentPage(){

    const page = String(window.location.pathname || "")
      .split("/")
      .pop()
      .toLowerCase();

    if(page === "trips.html") return "trips";
    if(page === "map.html") return "map";
    if(page === "chat.html") return "chat";

    return "dashboard";
  }

  function go(key){
    const target = ROUTES[key];
    if(target) window.location.href = target;
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

  function homeSvg(){
    return `
      <span class="nav-svg nav-home" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3.5 11.2 12 4l8.5 7.2v8.8a1 1 0 0 1-1 1h-5.5v-6h-4v6H4.5a1 1 0 0 1-1-1z"></path>
        </svg>
      </span>
    `;
  }

  function tripsSvg(){
    return `
      <span class="nav-svg nav-trips" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 8.5 8 5.8h8L18 8.5h1a2 2 0 0 1 2 2v4.7a1 1 0 0 1-1 1h-1v1.8a1 1 0 0 1-1 1h-1.2a1 1 0 0 1-1-1v-1.8H8.2v1.8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.8H4a1 1 0 0 1-1-1v-4.7a2 2 0 0 1 2-2zm2.6 0h6.8l-1.1-1.7H9.7zM7 14.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"></path>
        </svg>
      </span>
    `;
  }

  function mapSvg(){
    return `
      <span class="nav-svg nav-map" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"></path>
        </svg>
      </span>
    `;
  }

  function chatSvg(){
    return `
      <span class="nav-svg nav-chat" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 4c4.9 0 8.8 3.3 8.8 7.4 0 4.1-3.9 7.4-8.8 7.4-1.1 0-2.2-.2-3.2-.5L4 20l1.5-4.1c-1.5-1.3-2.3-2.8-2.3-4.5C3.2 7.3 7.1 4 12 4zm-3.3 6.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3.3 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path>
        </svg>
      </span>
    `;
  }

  function logoutSvg(){
    return `
      <span class="nav-svg nav-logout" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 3h7a1 1 0 0 1 0 2H7v14h6a1 1 0 0 1 0 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"></path>
          <path d="M13 8.2a1 1 0 0 1 1.4 0l3.6 3.6-3.6 3.6a1 1 0 0 1-1.4-1.4l1.9-1.8H10a1 1 0 1 1 0-2h4.9L13 9.6a1 1 0 0 1 0-1.4z"></path>
        </svg>
      </span>
    `;
  }

  function renderNavigation(){

    const root = document.getElementById("driverNav");
    if(!root) return;

    const active = currentPage();

    root.innerHTML = `
      <div class="nav">

        <button id="navHome" class="${active === "dashboard" ? "active" : ""}" type="button">
          ${homeSvg()}
          Home
        </button>

        <button id="navTrips" class="${active === "trips" ? "active" : ""}" type="button">
          ${tripsSvg()}
          Trips
        </button>

        <button id="navMap" class="${active === "map" ? "active" : ""}" type="button">
          ${mapSvg()}
          Map
        </button>

        <button id="navChat" class="${active === "chat" ? "active" : ""}" type="button">
          ${chatSvg()}
          Chat
        </button>

        <button id="navLogout" type="button">
          ${logoutSvg()}
          Logout
        </button>

      </div>
    `;

    document.getElementById("navHome")?.addEventListener("click", ()=>go("dashboard"));
    document.getElementById("navTrips")?.addEventListener("click", ()=>go("trips"));
    document.getElementById("navMap")?.addEventListener("click", ()=>go("map"));
    document.getElementById("navChat")?.addEventListener("click", ()=>go("chat"));
    document.getElementById("navLogout")?.addEventListener("click", logout);
  }

  window.goHome = ()=>go("dashboard");
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