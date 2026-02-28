/* =====================
   AUTH CHECK
===================== */
const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
const name = localStorage.getItem("name");

if(!token || role !== "admin"){
  window.location.replace("/login.html");
}

/* =====================
   WELCOME
===================== */
document.getElementById("welcomeText").innerText =
  `Welcome, ${name}`;

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
   LOGOUT
===================== */
function logout(){
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  window.location.replace("/login.html");
}