/* ===============================
   Login Protection
================================ */
const loggedCompany = JSON.parse(localStorage.getItem("loggedCompany"));

if (!loggedCompany) {
  window.location.href = "company-login.html";
}

/* ===============================
   Company Name
================================ */
const companyNameEl = document.getElementById("companyName");
const welcomeTitleEl = document.getElementById("welcomeTitle");

if (loggedCompany) {
  if (companyNameEl) companyNameEl.innerText = loggedCompany.name;
  if (welcomeTitleEl) welcomeTitleEl.innerText = `Welcome, ${loggedCompany.name}`;
}

/* ===============================
   Greeting + Clock
================================ */
function updateTime() {
  const now = new Date();
  const h = now.getHours();

  const greeting =
    h < 12 ? "Good Morning" :
    h < 18 ? "Good Afternoon" :
             "Good Evening";

  const greetingEl = document.getElementById("greeting");
  const clockEl = document.getElementById("clock");

  if (greetingEl) greetingEl.innerText = greeting;
  if (clockEl) clockEl.innerText = now.toLocaleString();
}

setInterval(updateTime, 1000);
updateTime();