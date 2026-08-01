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

    const page = String(
      window.location.pathname || ""
    )
    .split("/")
    .pop()
    .toLowerCase();

    if(page === "trips.html"){
      return "trips";
    }

    if(page === "map.html"){
      return "map";
    }

    if(page === "chat.html"){
      return "chat";
    }

    return "dashboard";

  }

  function go(key){

    const target = ROUTES[key];

    if(!target){
      return;
    }

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

    if(!root){
      return;
    }

    const active = currentPage();

    root.innerHTML = `
      <div class="nav">

        <button
          id="navHome"
          class="${active === "dashboard" ? "active" : ""}"
          type="button"
        >
          <img
            class="nav-icon"
            src="assets/home.png"
            alt=""
          />
          Home
        </button>

        <button
          id="navTrips"
          class="${active === "trips" ? "active" : ""}"
          type="button"
        >
          <img
            class="nav-icon"
            src="assets/nav-trips.png"
            alt=""
          />
          Trips
        </button>

        <button
          id="navMap"
          class="${active === "map" ? "active" : ""}"
          type="button"
        >
          <img
            class="nav-icon"
            src="assets/nav-map.png"
            alt=""
          />
          Map
        </button>

        <button
          id="navChat"
          class="${active === "chat" ? "active" : ""}"
          type="button"
        >
          <img
            class="nav-icon"
            src="assets/chat.png"
            alt=""
          />
          Chat
        </button>

        <button
          id="navLogout"
          type="button"
        >
          <img
            class="nav-icon"
            src="assets/logout.png"
            alt=""
          />
          Logout
        </button>

      </div>
    `;

    document
      .getElementById("navHome")
      ?.addEventListener(
        "click",
        ()=>go("dashboard")
      );

    document
      .getElementById("navTrips")
      ?.addEventListener(
        "click",
        ()=>go("trips")
      );

    document
      .getElementById("navMap")
      ?.addEventListener(
        "click",
        ()=>go("map")
      );

    document
      .getElementById("navChat")
      ?.addEventListener(
        "click",
        ()=>go("chat")
      );

    document
      .getElementById("navLogout")
      ?.addEventListener(
        "click",
        logout
      );

  }

  window.goHome = ()=>go("dashboard");
  window.goTrips = ()=>go("trips");
  window.goMap = ()=>go("map");
  window.goChat = ()=>go("chat");
  window.logout = logout;

  if(document.readyState === "loading"){

    document.addEventListener(
      "DOMContentLoaded",
      renderNavigation
    );

  }
  else{

    renderNavigation();

  }

})();