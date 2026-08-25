function companySessionValue(key){
  return String(
    sessionStorage.getItem(key) ||
    localStorage.getItem(key) ||
    ""
  ).trim();
}

function syncCompanyLegacyStorage(){

  [
    "companyToken",
    "companyRole",
    "companyName",
    "companyTenantId",
    "companyTenantSlug",
    "companyUserId",
    "companyFacilityId"
  ].forEach(key=>{

    const value=
      String(
        sessionStorage.getItem(key) ||
        ""
      ).trim();

    if(value){
      localStorage.setItem(
        key,
        value
      );
    }
  });
}

function getCompanyToken(){
  return companySessionValue(
    "companyToken"
  );
}

function getCompanyRole(){
  return companySessionValue(
    "companyRole"
  );
}

function getCompanyName(){
  return companySessionValue(
    "companyName"
  );
}

function getCompanyTenantSlug(){
  return companySessionValue(
    "companyTenantSlug"
  ).toLowerCase();
}

function companyLoginUrl(){
  const slug = getCompanyTenantSlug();

  return slug
    ? `/companies/company-login.html?tenant=${encodeURIComponent(slug)}`
    : "/companies/company-login.html";
}

function companyStorageKey(baseKey){
  const scope =
    getCompanyTenantSlug() ||
    companySessionValue(
      "companyTenantId"
    ) ||
    "company";

  return `${baseKey}:${scope}`;
}

document.addEventListener("DOMContentLoaded", async () => {

syncCompanyLegacyStorage();

window.addEventListener(
  "focus",
  syncCompanyLegacyStorage
);

window.addEventListener(
  "pageshow",
  syncCompanyLegacyStorage
);

document.addEventListener(
  "visibilitychange",
  ()=>{
    if(!document.hidden){
      syncCompanyLegacyStorage();
    }
  }
);

const container =
document.getElementById(
  "layoutHeader"
);

if(!container) return;

/* ================= HTML ================= */

container.innerHTML = `

<div class="header">

  <div class="header-inner">

    <!-- ================= TOP ================= -->

    <div class="top-section">

      <!-- LEFT -->

      <div class="company-block">

        <img class="logo app-logo">

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

        </div>

      </div>

      <!-- RIGHT -->

      <div class="time-block">

        <div
          class="clock"
          id="azDateTime"
        >
        </div>

      </div>

    </div>

    <!-- ================= NAV ================= -->

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

      <a
        href="#"
        id="logoutBtn"
      >
        Logout
      </a>

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

      setTimeout(
        resolve,
        500
      );

      return;

    }

    const brandingScript =
    document.createElement(
      "script"
    );

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

/* ================= CLOCK ================= */

function startClock(elementId){

  const el =
    document.getElementById(
      elementId
    );

  if(!el) return;

  function updateClock(){

    const timezone =

      window.Branding?.data?.timezone ||

      "America/Phoenix";

    const now =
      new Date();

    const date =
      now.toLocaleDateString(
        "en-US",
        {
          timeZone: timezone
        }
      );

    const time =
      now.toLocaleTimeString(
        "en-US",
        {
          timeZone: timezone,
          hour:"2-digit",
          minute:"2-digit",
          second:"2-digit"
        }
      );

    el.innerHTML =

      `
      <div style="
        font-size:13px;
        color:#facc15;
        font-weight:700;
      ">
        ${date}
      </div>

      <div style="
        font-size:18px;
        color:white;
        font-weight:900;
      ">
        ${time}
      </div>
      `;

  }

  updateClock();

  setInterval(
    updateClock,
    1000
  );

}

/* ================= AUTH ================= */

const token = getCompanyToken();

const role = getCompanyRole();

const name = getCompanyName();

if(
  !token ||
  role !== "company"
){

  window.location.replace(companyLoginUrl());

  return;

}

/* ================= ACTIVE LINK ================= */

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

/* ================= COMPANY NAME ================= */

document.getElementById(
  "companyName"
).innerText =

name || "Company";

/* ================= LOGOUT ================= */

document
.getElementById(
  "logoutBtn"
)
.addEventListener(
  "click",
  e=>{

    e.preventDefault();

    const currentToken =
      String(
        sessionStorage.getItem("companyToken") ||
        ""
      ).trim();

    const loginUrl =
      companyLoginUrl();

    [
      "companyToken",
      "companyRole",
      "companyName",
      "companyTenantId",
      "companyUserId",
      "companyFacilityId"
    ].forEach(
      key=>sessionStorage.removeItem(key)
    );

    /*
      Keep companyTenantSlug in this tab so logout returns to
      the same tenant company-login link.
    */

    if(
      currentToken &&
      String(
        localStorage.getItem("companyToken") || ""
      ).trim() === currentToken
    ){
      [
        "companyToken",
        "companyRole",
        "companyName",
        "companyTenantId",
        "companyUserId",
        "companyFacilityId"
      ].forEach(
        key=>localStorage.removeItem(key)
      );
    }

    window.location.replace(
      loginUrl
    );

  }
);

/* ================= START CLOCK ================= */

startClock("azDateTime");

/* ================= GREETING ================= */

function updateGreeting(){

  const timezone =

    window.Branding?.data?.timezone ||

    "America/Phoenix";

  const now =
    new Date();

  const currentHour =
  Number(

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

setInterval(
  updateGreeting,
  60000
);

});