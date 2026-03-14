/* =====================================================
   SUNBEAM DRIVER DASHBOARD – FINAL SERVER VERSION
===================================================== */

if (window.__SUNBEAM_DASHBOARD__) {
  console.log("Dashboard already loaded");
} else {

window.__SUNBEAM_DASHBOARD__ = true;

/* ===============================
   AUTH CHECK
================================ */

let driver = null;
let token = null;

try {

const rawDriver = localStorage.getItem("loggedDriver");

if (!rawDriver) {
throw new Error("No driver session");
}

driver = JSON.parse(rawDriver);

if (!driver || !driver.token) {
throw new Error("Invalid driver session");
}

token = driver.token;

} catch (err) {

console.log("Driver session error:", err);

localStorage.removeItem("loggedDriver");

window.location.href = "/driver/login.html";

}

/* ===============================
   DRIVER NAME (SERVER FIRST)
================================ */

async function loadDriverName(){

const el = document.getElementById("driverName");

if (!el) return;

try{

const res = await fetch("/api/driver/me",{
headers:{
Authorization:"Bearer " + token
}
});

if(res.ok){

const data = await res.json();

if(data && data.name){

el.innerText = data.name;
return;

}

}

}catch(err){

console.log("Server name load failed");

}

/* fallback localStorage */

try{

const raw = localStorage.getItem("loggedDriver");

if(!raw) return;

const d = JSON.parse(raw);

el.innerText =
d.name ||
d.username ||
d.email ||
"Driver";

}catch(err){

console.log("Driver name error",err);

}

}

loadDriverName();

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
   KEEP SESSION
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