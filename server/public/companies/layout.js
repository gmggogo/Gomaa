document.addEventListener("DOMContentLoaded", async () => {

const container =
document.getElementById("layoutHeader");

if(!container) return;

/* =========================================
DEFAULT LOGO
========================================= */

if(!localStorage.getItem("appLogo")){

  localStorage.setItem(
    "appLogo",
    "/assets/logo.png"
  );

}

/* =========================================
HEADER HTML
========================================= */

container.innerHTML = `

<div class="header">

  <div class="header-inner">

    <!-- ================= LEFT ================= -->

    <div class="company-block">

      <img
        src="${
          localStorage.getItem("appLogo")
        }"
        class="logo app-logo"
      >

      <div class="company-text">

        <div
          class="logged-company"
          id="companyName"
        >
          Loading...
        </div>

        <div
          class="greeting"
          id="greetingText"
        >
        </div>

        <div class="powered-footer">
          Powered by GH Mobility
        </div>

      </div>

    </div>

    <!-- ================= CENTER ================= -->

    <div class="nav">

      <a href="dashboard.html">
        Dashboard
      </a>

      <a href="add-trip.html">
        Add Trip
      </a>

      <a href="review.html">
        Review
      </a>

      <a href="summary.html">
        Summary
      </a>

      <a href="payment.html">
        Payment
      </a>

      <a href="taxes.html">
        Taxes
      </a>

      <a href="#" id="logoutBtn">
        Logout
      </a>

    </div>

    <!-- ================= RIGHT ================= -->

    <div class="time-block">

      <div
        class="clock"
        id="worldClock"
      >
      </div>

    </div>

  </div>

</div>

<style>

/* =========================================
HEADER
========================================= */

.header{

  width:100%;

  background:
  linear-gradient(
    90deg,
    #1e3a8a,
    #312e81
  );

  color:#fff;

  box-shadow:
  0 4px 20px rgba(0,0,0,.18);

}

.header-inner{

  width:100%;

  display:flex;

  justify-content:space-between;

  align-items:flex-start;

  gap:20px;

  padding:14px 24px;

  flex-wrap:wrap;

}

/* =========================================
LEFT SIDE
========================================= */

.company-block{

  display:flex;

  align-items:flex-start;

  justify-content:flex-start;

  gap:14px;

  text-align:left;

  min-width:250px;

}

.logo{

  width:58px;

  height:58px;

  object-fit:contain;

}

.company-text{

  display:flex;

  flex-direction:column;

  align-items:flex-start;

  justify-content:flex-start;

  line-height:1.4;

}

.logged-company{

  font-size:20px;

  font-weight:900;

  color:#facc15;

}

.greeting{

  font-size:13px;

  opacity:.92;

  margin-top:2px;

}

.powered-footer{

  margin-top:12px;

  font-size:12px;

  opacity:.88;

}

/* =========================================
NAV
========================================= */

.nav{

  display:flex;

  align-items:center;

  justify-content:center;

  gap:8px;

  flex-wrap:wrap;

  flex:1;

  margin-top:6px;

}

.nav a{

  text-decoration:none;

  color:#fff;

  background:
  rgba(255,255,255,.12);

  padding:10px 15px;

  border-radius:10px;

  font-size:13px;

  font-weight:800;

  transition:.2s;

}

.nav a:hover{

  background:#2563eb;

  transform:translateY(-1px);

}

.nav a.active{

  background:#facc15;

  color:#111827;

}

/* =========================================
CLOCK
========================================= */

.time-block{

  min-width:220px;

  display:flex;

  justify-content:flex-end;

  align-items:flex-start;

}

.clock{

  font-size:13px;

  font-weight:800;

  line-height:1.7;

  text-align:right;

}

/* =========================================
MOBILE
========================================= */

@media(max-width:768px){

  .header-inner{

    flex-direction:column;

    align-items:flex-start;

    padding:12px;

  }

  .nav{

    justify-content:flex-start;

    width:100%;

  }

  .nav a{

    font-size:11px;

    padding:8px 12px;

  }

  .time-block{

    width:100%;

    justify-content:flex-start;

  }

  .clock{

    text-align:left;

    font-size:12px;

  }

}

</style>

`;

/* =========================================
AUTH
========================================= */

const token =
localStorage.getItem("token");

const role =
localStorage.getItem("role");

const name =
localStorage.getItem("name");

if(!token || role !== "company"){

  window.location.replace(
    "company-login.html"
  );

  return;

}

/* =========================================
ACTIVE PAGE
========================================= */

const currentPage =
window.location.pathname
.split("/")
.pop();

document
.querySelectorAll(".nav a")
.forEach(link=>{

  if(
    link.getAttribute("href")
    === currentPage
  ){

    link.classList.add(
      "active"
    );

  }

});

/* =========================================
COMPANY NAME
========================================= */

document.getElementById(
  "companyName"
).innerText =
name || "Company";

/* =========================================
GREETING
========================================= */

function updateGreeting(){

  const now = new Date();

  const phoenixHour =
  Number(

    new Intl.DateTimeFormat(
      "en-US",
      {
        hour:"numeric",
        hour12:false,
        timeZone:"America/Phoenix"
      }
    ).format(now)

  );

  let greeting =
  "Good Evening";

  if(phoenixHour < 12){

    greeting =
    "Good Morning";

  }

  else if(phoenixHour < 18){

    greeting =
    "Good Afternoon";

  }

  document.getElementById(
    "greetingText"
  ).innerText =
  greeting;

}

updateGreeting();

setInterval(
  updateGreeting,
  60000
);

/* =========================================
WORLD CLOCK
========================================= */

function updateWorldClock(){

  const now = new Date();

  function getTime(zone){

    return new Intl.DateTimeFormat(
      "en-US",
      {
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hour12:true,
        timeZone:zone
      }
    ).format(now);

  }

  const html = `

    Arizona:
    ${getTime("America/Phoenix")}
    <br>

    New York:
    ${getTime("America/New_York")}
    <br>

    Cairo:
    ${getTime("Africa/Cairo")}
    <br>

    London:
    ${getTime("Europe/London")}

  `;

  const el =
  document.getElementById(
    "worldClock"
  );

  if(el){

    el.innerHTML =
    html;

  }

}

updateWorldClock();

setInterval(
  updateWorldClock,
  1000
);

/* =========================================
LOGOUT
========================================= */

document
.getElementById("logoutBtn")
.addEventListener(
  "click",
  e=>{

    e.preventDefault();

    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "role"
    );

    localStorage.removeItem(
      "name"
    );

    window.location.replace(
      "company-login.html"
    );

  }
);

});