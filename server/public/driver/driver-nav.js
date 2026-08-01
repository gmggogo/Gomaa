(function () {
  if (window.__SUNBEAM_DRIVER_NAV__) return;
  window.__SUNBEAM_DRIVER_NAV__ = true;

  const ROUTES = {
    dashboard: "dashboard.html",
    trips: "trips.html",
    map: "map.html",
    chat: "chat.html",
    login: "login.html"
  };

  function currentPage() {
    const page = String(window.location.pathname || "").split("/").pop().toLowerCase();
    if (page === "trips.html") return "trips";
    if (page === "map.html") return "map";
    if (page === "chat.html") return "chat";
    return "dashboard";
  }

  function setActive() {
    const page = currentPage();
    document.getElementById("navHome")?.classList.toggle("active", page === "dashboard");
    document.getElementById("navTrips")?.classList.toggle("active", page === "trips");
    document.getElementById("navMap")?.classList.toggle("active", page === "map");
    document.getElementById("navChat")?.classList.toggle("active", page === "chat");
  }

  function go(key) {
    const target = ROUTES[key];
    if (target) window.location.href = target;
  }

  function logout() {
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

  function bind() {
    setActive();
    document.getElementById("navHome")?.addEventListener("click", () => go("dashboard"));
    document.getElementById("navTrips")?.addEventListener("click", () => go("trips"));
    document.getElementById("navMap")?.addEventListener("click", () => go("map"));
    document.getElementById("navChat")?.addEventListener("click", () => go("chat"));
    document.getElementById("navLogout")?.addEventListener("click", logout);
  }

  window.goHome = () => go("dashboard");
  window.goTrips = () => go("trips");
  window.goMap = () => go("map");
  window.goChat = () => go("chat");
  window.logout = logout;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();