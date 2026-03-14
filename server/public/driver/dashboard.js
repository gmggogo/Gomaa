/* =====================================================
   SUNBEAM DRIVER DASHBOARD – STABLE VERSION
===================================================== */

/* ===============================
   PREVENT DOUBLE LOAD
================================ */

if (window.__SUNBEAM_DASHBOARD__) {
  console.log("Dashboard already loaded");
} else {

window.__SUNBEAM_DASHBOARD__ = true;

/* ===============================
   AUTH CHECK (SAFE)
================================ */

let driver = null;

try {

const rawDriver = localStorage.getItem("loggedDriver");

if (!rawDriver) {
throw new Error("No driver session");
}

driver = JSON.parse(rawDriver);

if (!driver || !driver.token) {
throw new Error("Invalid driver session");
}

} catch (err) {

console.log("Driver session error:", err);

localStorage.removeItem("loggedDriver");

window.location.href = "/driver/login.html";

}

/* ===============================
   DRIVER NAME
================================ */

(function(){

const el = document.getElementById("driverName");

if (!el) return;

el.innerText = driver.name || driver.username || "Driver";

})();

/* ===============================
   DATETIME (ARIZONA)
================================ */

function updateTime(){

const el = document.getElementById("datetime");

if (!el) return;

const now = new Date();

el.innerText = now.toLocaleString("en-US", {
timeZone:"America/Phoenix"
});

}

updateTime();
setInterval(updateTime,1000);

/* ===============================
   ROUTES
================================ */

const ROUTES = {

home:"/driver/dashboard.html",
dashboard:"/driver/dashboard.html",
trips:"/driver/trips.html",
map:"/driver/map.html",
chat:"/driver/chat.html",
hours:"/driver/hours.html",
earnings:"/driver/earnings.html",
summary:"/driver/summary.html"

};

/* ===============================
   NAVIGATION
================================ */

window.go = function(page){

const url = ROUTES[page];

if(url){

location.href = url;

}else{

location.href = "/driver/" + page + ".html";

}

};

/* ===============================
   LOGOUT
================================ */

window.logout = function(){

localStorage.removeItem("loggedDriver");

location.href="/driver/login.html";

};

/* ===============================
   GOOGLE MAPS
================================ */

window.openGoogle = function(){

let lat = window.driverLat;
let lng = window.driverLng;

if(
(typeof lat !== "number" || typeof lng !== "number") &&
window.currentPos
){

lat = window.currentPos.lat;
lng = window.currentPos.lng;

}

if(typeof lat !== "number" || typeof lng !== "number"){

window.open("https://www.google.com/maps","_blank");
return;

}

window.open(
`https://www.google.com/maps?q=${lat},${lng}`,
"_blank"
);

};

/* ===============================
   KEEP SESSION WHEN RETURNING
================================ */

document.addEventListener("visibilitychange", function(){

if (!document.hidden){

const raw = localStorage.getItem("loggedDriver");

if(!raw){

window.location.href="/driver/login.html";

}

}

});

}