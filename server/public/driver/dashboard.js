// ===============================
// AUTH CHECK
// ===============================
const rawDriver = localStorage.getItem("loggedDriver");
if (!rawDriver) {
  location.href = "/driver/login.html";
}

let driver = {};
try {
  driver = JSON.parse(rawDriver);
} catch {
  location.href = "/driver/login.html";
}

// ===============================
// DRIVER NAME (SAFE)
// ===============================
(function setDriverName(){
  const el = document.getElementById("driverName");
  if (!el) return;
  el.innerText = driver.name || driver.username || "Driver";
})();

// ===============================
// DATETIME (AZ TIMEZONE) (SAFE)
// ===============================
function updateTime(){
  const el = document.getElementById("datetime");
  if (!el) return;

  const now = new Date();
  el.innerText = now.toLocaleString("en-US", { timeZone: "America/Phoenix" });
}
updateTime();
setInterval(updateTime, 1000);

// ===============================
// ROUTES MAP (EXPLICIT)
// ===============================
const ROUTES = {
  home: "/driver/dashboard.html",
  dashboard: "/driver/dashboard.html",

  trips: "/driver/trips.html",
  map: "/driver/map.html",
  chat: "/driver/chat.html",

  hours: "/driver/hours.html",
  earnings: "/driver/earnings.html",

  summary: "/driver/summary.html" // لو مش موجودة هيفتح 404 طبيعي
};

// ===============================
// NAVIGATION
// ===============================
function go(page){
  const url = ROUTES[page];

  if (!url) {
    // fallback: نفس نظامك القديم لو حد نادى صفحة جديدة
    location.href = `/driver/${page}.html`;
    return;
  }

  location.href = url;
}

// ===============================
// LOGOUT
// ===============================
function logout(){
  localStorage.removeItem("loggedDriver");
  location.href = "/driver/login.html";
}

// ===============================
// GOOGLE MAPS (FOR map.html BUTTON)
// ===============================
function openGoogle(){
  // لو map.js حاطط lat/lng في متغيرات عالمية هنستخدمها
  // غير كده هنحاول من localStorage (لو عندك تخزين)
  let lat = window.driverLat;
  let lng = window.driverLng;

  if ((typeof lat !== "number" || typeof lng !== "number") && window.currentPos) {
    lat = window.currentPos.lat;
    lng = window.currentPos.lng;
  }

  if ((typeof lat !== "number" || typeof lng !== "number")) {
    try {
      const saved = JSON.parse(localStorage.getItem("driverLiveLocation") || "null");
      if (saved && typeof saved.lat === "number" && typeof saved.lng === "number") {
        lat = saved.lat;
        lng = saved.lng;
      }
    } catch {}
  }

  // لو مفيش إحداثيات: افتح جوجل مابس عامة
  if (typeof lat !== "number" || typeof lng !== "number") {
    window.open("https://www.google.com/maps", "_blank");
    return;
  }

  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  window.open(url, "_blank");
}