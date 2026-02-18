
/* =====================
   AUTH
===================== */
const userRaw = localStorage.getItem("loggedUser");
if (!userRaw) location.href = "login.html";

const user = JSON.parse(userRaw);

/* =====================
   WELCOME
===================== */
document.getElementById("welcomeText").innerText =
  `Welcome, ${user.name}`;

/* =====================
   CLOCK
===================== */
function updateClock(){
  const now = new Date();
  document.getElementById("clock").innerText =
    now.toLocaleDateString() + " | " + now.toLocaleTimeString();
}
setInterval(updateClock,1000);
updateClock();

/* =====================
   DASHBOARD DATA
===================== */
const trips = JSON.parse(localStorage.getItem("companyTrips")) || [];
const drivers = JSON.parse(localStorage.getItem("drivers")) || [];
const companies = JSON.parse(localStorage.getItem("companies")) || [];

document.getElementById("totalTrips").innerText = trips.length;
document.getElementById("pendingTrips").innerText =
  trips.filter(t=>t.status==="Pending").length;
document.getElementById("driversCount").innerText = drivers.length;
document.getElementById("companiesCount").innerText = companies.length;

/* =====================
   LOGOUT
===================== */
function logout(){
  localStorage.removeItem("loggedUser");
  location.href = "login.html";
}