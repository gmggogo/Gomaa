document.addEventListener("DOMContentLoaded", async () => {

const container = document.getElementById("layoutHeader");

if(!container) return;

/* ================= DEFAULT LOGO ================= */

if(!localStorage.getItem("appLogo")){

  localStorage.setItem(
    "appLogo",
    "/assets/logo.png"
  );

}

container.innerHTML = `

<div class="header">

  <div class="header-inner">

    <!-- ================= TOP ================= -->

    <div class="top-section">

      <!-- LEFT -->

      <div class="company-block">

        <img class="logo app-logo">

        <div class="company-text">

          <div class="logged-company" id="companyName">
            Loading...
          </div>

          <div class="greeting" id="greetingText">
          </div>

        </div>

      </div>

      <!-- RIGHT -->

      <div class="time-block">

        <div class="clock" id="azDateTime">
        </div>

      </div>

    </div>

    <!-- ================= NAV ================= -->

    <div class="nav">

      <a href="dashboard.html">Dashboard</a>

      <a href="add-trip.html">Add Trip</a>

      <a href="review.html">Review</a>

      <a href="summary.html">Summary</a>

      <a href="payment.html">Payment</a>

      <a href="taxes.html">Taxes</a>

      <a href="#" id="logoutBtn">Logout</a>

    </div>

    <!-- ================= POWERED ================= -->

    <div class="powered-footer">

      Powered by GH Mobility

    </div>

  </div>

</div>

`;

/* ================= LOAD BRANDING ================= */

async function loadBranding(){

  return new Promise((resolve)=>{

    if(window.Branding){

      resolve();
      return;

    }

    const oldScript =
    document.querySelector(
      'script[src="/core/branding.js"]'
    );

    if(oldScript){

      oldScript.onload =
      ()=>resolve();

      setTimeout(resolve,500);

      return;

    }

    const brandingScript =
    document.createElement("script");

    brandingScript.src =
    "/core/branding.js";

    brandingScript.onload =
    ()=>resolve();

    document.body.appendChild(
      brandingScript
    );

  });

}

await loadBranding();

if(window.Branding){

  await Branding.load();

}

/* ================= AUTH ================= */

const token = localStorage.getItem("token");
const role  = localStorage.getItem("role");
const name  = localStorage.getItem("name");

if(!token || role !== "company"){

  window.location.replace("company-login.html");

  return;

}

/* ================= ACTIVE LINK ================= */

const currentPage =
window.location.pathname.split("/").pop();

document.querySelectorAll(".nav a").forEach(link=>{

  if(link.getAttribute("href") === currentPage){

    link.classList.add("active");

  }

});

/* ================= COMPANY NAME ================= */

document.getElementById("companyName").innerText =
  name || "Company";

/* ================= LOGOUT ================= */

document.getElementById("logoutBtn")
.addEventListener("click",e=>{

  e.preventDefault();

  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");

  window.location.replace("company-login.html");

});

/* ================= GLOBAL CLOCK ================= */

function startGlobalClock(){

  if(typeof startClock === "function"){

    startClock("azDateTime");

    return true;

  }

  return false;

}

const waitClock = setInterval(()=>{

  if(startGlobalClock()){

    clearInterval(waitClock);

  }

},200);

/* ================= GREETING ================= */

function updateGreeting(){

  const timezone =

    window.Branding?.data?.timezone ||

    "America/Phoenix";

  const now = new Date();

  const currentHour = Number(

    new Intl.DateTimeFormat(
      "en-US",
      {
        hour:"numeric",
        hour12:false,
        timeZone: timezone
      }
    ).format(now)

  );

  let greeting =
    "Good Evening";

  if(currentHour < 12){

    greeting =
      "Good Morning";

  }

  else if(currentHour < 18){

    greeting =
      "Good Afternoon";

  }

  document.getElementById(
    "greetingText"
  ).innerText = greeting;

}

updateGreeting();

setInterval(updateGreeting,60000);

});