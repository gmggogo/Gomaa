TARGET PATH:
server/public/companies/header.js

================ FILE CONTENT ================

(function ensureGhResponsiveStyles(){
  const href = "/css/gh-responsive.css";

  if(
    document.querySelector(
      'link[data-gh-responsive="true"]'
    )
  ){
    return;
  }

  const link =
    document.createElement("link");

  link.rel = "stylesheet";
  link.href = href;
  link.dataset.ghResponsive = "true";

  document.head.appendChild(link);
})();

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

      <a href="help-center.html" id="companyHelpNav">
        Help Center
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

/* ================= HELP CENTER SUPPORT ALERT ================= */

const companyHelpAlertStyle =
document.createElement("style");

companyHelpAlertStyle.textContent = `
@keyframes companyHelpBlink{
  0%,100%{
    filter:brightness(1);
    box-shadow:none;
  }
  50%{
    filter:brightness(1.35);
    box-shadow:
      0 0 0 3px rgba(255,220,92,.75),
      0 0 20px rgba(255,176,19,.9);
  }
}

.nav a.company-help-unread{
  position:relative;
  animation:companyHelpBlink 1s ease-in-out infinite;
}

.company-help-badge{
  position:absolute;
  right:4px;
  top:2px;
  min-width:18px;
  height:18px;
  padding:0 5px;
  border-radius:999px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#c81e1e;
  color:#fff;
  font-size:9px;
  font-weight:900;
}
`;

document.head.appendChild(
  companyHelpAlertStyle
);

let latestCompanySupportUnreadCount =
  0;

function companyHelpSeenStorageKey(){
  const scope =
    String(
      getCompanyTenantSlug() ||
      localStorage.getItem("companyTenantId") ||
      sessionStorage.getItem("companyTenantId") ||
      "company"
    )
      .trim()
      .toLowerCase();

  return (
    "companySupportSeenCount:" +
    scope
  );
}

function getCompanySupportSeenCount(){
  return Math.max(
    0,
    Number(
      sessionStorage.getItem(
        companyHelpSeenStorageKey()
      ) ||
      0
    )
  );
}

function setCompanySupportSeenCount(
  value
){
  sessionStorage.setItem(
    companyHelpSeenStorageKey(),
    String(
      Math.max(
        0,
        Number(value || 0)
      )
    )
  );
}

function clearCompanyHelpAlert(){
  const helpLink =
    document.getElementById(
      "companyHelpNav"
    );

  if(!helpLink){
    return;
  }

  setCompanySupportSeenCount(
    latestCompanySupportUnreadCount
  );

  helpLink.classList.remove(
    "company-help-unread"
  );

  helpLink
    .querySelectorAll(
      ".company-help-badge"
    )
    .forEach(
      badge=>badge.remove()
    );
}

async function refreshCompanySupportUnread(){
  const helpLink =
    document.getElementById(
      "companyHelpNav"
    );

  if(!helpLink){
    return;
  }

  try{
    const response =
      await fetch(
        "/api/company-support/unread-count",
        {
          cache:"no-store",
          headers:{
            Authorization:
              "Bearer " +
              getCompanyToken()
          }
        }
      );

    if(!response.ok){
      return;
    }

    const data =
      await response.json();

    const count =
      Math.max(
        0,
        Number(
          data?.count ||
          0
        )
      );

    latestCompanySupportUnreadCount =
      count;

    if(count === 0){
      setCompanySupportSeenCount(
        0
      );
    }

    const seenCount =
      getCompanySupportSeenCount();

    const visibleCount =
      Math.max(
        0,
        count - seenCount
      );

    helpLink.classList.toggle(
      "company-help-unread",
      visibleCount > 0
    );

    helpLink
      .querySelectorAll(
        ".company-help-badge"
      )
      .forEach(
        badge=>badge.remove()
      );

    if(visibleCount > 0){
      const badge =
        document.createElement(
          "b"
        );

      badge.className =
        "company-help-badge";

      badge.textContent =
        visibleCount > 99
          ? "99+"
          : String(
              visibleCount
            );

      helpLink.appendChild(
        badge
      );
    }

  }catch(err){}
}

const companyHelpNav =
document.getElementById(
  "companyHelpNav"
);

if(companyHelpNav){
  companyHelpNav.addEventListener(
    "click",
    ()=>{
      clearCompanyHelpAlert();
    }
  );
}

refreshCompanySupportUnread();

setInterval(
  refreshCompanySupportUnread,
  12000
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