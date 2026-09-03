(function () {
  "use strict";

  if (window.SUNBEAM_DRIVER_DASHBOARD) {
    return;
  }

  window.SUNBEAM_DRIVER_DASHBOARD = true;

  const ROUTES = {
    dashboard: "dashboard.html",
    trips: "trips.html",
    history: "trip-history.html",
    map: "map.html",
    hours: "work-hours.html",
    earnings: "Earnings.html",
    summary: "summary.html",
    chat: "chat.html",
    login: "login.html"
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function safeParse(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function getLoggedDriver() {
    return safeParse(localStorage.getItem("loggedDriver"), {});
  }

  function ensureSession() {
    const driver = getLoggedDriver();

    if (!driver || Object.keys(driver).length === 0) {
      window.location.href = ROUTES.login;
      return false;
    }

    return true;
  }

  function loadDriverName() {
    const element = byId("driverName");

    if (!element) {
      return;
    }

    const driver = getLoggedDriver();

    element.textContent =
      driver?.name ||
      driver?.fullName ||
      driver?.username ||
      driver?.email ||
      "Driver";
  }

  function syncSummaryCardName() {
    const card = byId("cardSummary");

    if (!card) {
      return;
    }

    const title = card.querySelector(".summary-title");

    if (title) {
      title.textContent = "Earnings Summary";
    }
  }

  function go(routeKey) {
    const target = ROUTES[routeKey];

    if (!target) {
      return;
    }

    window.location.href = target;
  }

  function logout() {
    [
      "driverToken",
      "loggedDriver",
      "token",
      "role",
      "driverName",
      "companyName",
      "systemTimezone",
      "appTimezone"
    ].forEach((key) => {
      localStorage.removeItem(key);
    });

    window.location.href = ROUTES.login;
  }

  function bindClick(id, handler) {
    const element = byId(id);

    if (element) {
      element.addEventListener("click", handler);
    }
  }

  function bindNavigation() {
    bindClick("cardTrips", () => go("trips"));
    bindClick("cardMap", () => go("map"));
    bindClick("cardHistory", () => go("history"));
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
    window.goHistory = () => go("history");
    window.goHours = () => go("hours");
    window.goEarnings = () => go("earnings");
    window.goSummary = () => go("summary");
    window.goChat = () => go("chat");
    window.logout = logout;
  }

  function refreshIdentity() {
    ensureSession();
    loadDriverName();
    syncSummaryCardName();
  }

  function init() {
    if (!ensureSession()) {
      return;
    }

    loadDriverName();
    syncSummaryCardName();
    bindNavigation();
    exposeGlobals();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshIdentity();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
