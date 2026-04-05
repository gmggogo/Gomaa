(function () {
  if (window.__SUNBEAM_DRIVER_DASHBOARD__) return;
  window.__SUNBEAM_DRIVER_DASHBOARD__ = true;

  const ROUTES = {
    dashboard: "dashboard.html",
    trips: "trips.html",
    map: "map.html",
    hours: "work-hours.html",
    earnings: "earnings.html",
    summary: "summary.html",
    chat: "chat.html",
    login: "login.html"
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeParse(json, fallback = null) {
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }

  function getLoggedDriver() {
    return safeParse(localStorage.getItem("loggedDriver"), {});
  }

  function updateTime() {
    const el = $("datetime");
    if (!el) return;

    const now = new Date();
    el.textContent = now.toLocaleString("en-US", {
      timeZone: "America/Phoenix"
    });
  }

  function loadDriverName() {
    const el = $("driverName");
    if (!el) return;

    const driver = getLoggedDriver();
    el.textContent =
      driver?.name ||
      driver?.username ||
      driver?.email ||
      "Driver";
  }

  function go(pageKey) {
    const target = ROUTES[pageKey];
    if (!target) return;
    window.location.href = target;
  }

  function logout() {
    localStorage.removeItem("driverToken");
    localStorage.removeItem("loggedDriver");
    window.location.href = ROUTES.login;
  }

  function ensureSession() {
    const driver = getLoggedDriver();
    if (!driver || Object.keys(driver).length === 0) {
      window.location.href = ROUTES.login;
      return false;
    }
    return true;
  }

  function bindClick(id, handler) {
    const el = $(id);
    if (el) el.addEventListener("click", handler);
  }

  function bindNavigation() {
    bindClick("cardTrips", () => go("trips"));
    bindClick("cardMap", () => go("map"));
    bindClick("cardHours", () => go("hours"));
    bindClick("cardEarnings", () => go("earnings"));
    bindClick("cardSummary", () => go("summary"));

    bindClick("navHome", () => go("dashboard"));
    bindClick("navTrips", () => go("trips"));
    bindClick("navMap", () => go("map"));
    bindClick("navChat", () => go("chat"));
    bindClick("navLogout", logout);
  }

  function exposeGlobals() {
    window.goTrips = () => go("trips");
    window.goMap = () => go("map");
    window.goHours = () => go("hours");
    window.goEarnings = () => go("earnings");
    window.goSummary = () => go("summary");
    window.goChat = () => go("chat");
    window.logout = logout;
  }

  function init() {
    if (!ensureSession()) return;

    updateTime();
    loadDriverName();
    bindNavigation();
    exposeGlobals();

    setInterval(updateTime, 1000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        ensureSession();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();