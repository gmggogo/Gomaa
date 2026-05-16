document.addEventListener("DOMContentLoaded", async () => {

  const headerContainer =
    document.getElementById("adminHeader") ||
    document.getElementById("headerContainer") ||
    document.getElementById("header-container");

  if (!headerContainer) return;

  const res = await fetch("header.html");
  const html = await res.text();

  headerContainer.innerHTML = html;

  /* =========================
     DEFAULT LOGO
  ========================= */

  if (!localStorage.getItem("appLogo")) {

    localStorage.setItem(
      "appLogo",
      "/assets/logo.png"
    );

  }

  /* =========================
     LOAD BRANDING
  ========================= */

  if (!document.querySelector('script[src="/core/branding.js"]')) {

    const brandingScript =
      document.createElement("script");

    brandingScript.src =
      "/core/branding.js";

    document.body.appendChild(
      brandingScript
    );

  }

  /* =========================
     🔥 LOAD LOGO ONLY
  ========================= */

  setTimeout(async ()=>{

    if(window.Branding){

      await Branding.load();

    }

  },200);

  /* =========================
     DYNAMIC COMPANY NAME
  ========================= */

  const companyEl =
    document.getElementById(
      "dynamicCompanyName"
    );

  if (companyEl) {

    companyEl.innerText =

      localStorage.getItem(
        "companyName"
      ) ||

      localStorage.getItem(
        "name"
      ) ||

      "Company";

  }

  /* =========================
     DYNAMIC TIME
  ========================= */

  function updateAdminTime() {

    const timezone =

      localStorage.getItem(
        "systemTimezone"
      ) ||

      localStorage.getItem(
        "appTimezone"
      ) ||

      "America/Phoenix";

    const now = new Date();

    const date =
      now.toLocaleDateString(
        "en-US",
        {
          timeZone: timezone,
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric"
        }
      );

    const time =
      now.toLocaleTimeString(
        "en-US",
        {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true
        }
      );

    const el =
      document.getElementById(
        "azTime"
      );

    if (el) {

      el.innerHTML =
        `${date}<br>${time}`;

    }

  }

  updateAdminTime();

  setInterval(
    updateAdminTime,
    1000
  );

  /* =========================
     WELCOME MESSAGE
  ========================= */

  function updateWelcome() {

    const timezone =

      localStorage.getItem(
        "systemTimezone"
      ) ||

      localStorage.getItem(
        "appTimezone"
      ) ||

      "America/Phoenix";

    const now = new Date();

    const hour = Number(

      new Intl.DateTimeFormat(
        "en-US",
        {
          hour: "numeric",
          hour12: false,
          timeZone: timezone
        }
      ).format(now)

    );

    let message =
      "Good Evening";

    let icon = "🌙";

    if (hour < 12) {

      message =
        "Good Morning";

      icon = "☀️";

    }

    else if (hour < 18) {

      message =
        "Good Afternoon";

      icon = "🌤️";

    }

    const welcomeEl =
      document.getElementById(
        "welcomeMessage"
      );

    const iconEl =
      document.getElementById(
        "weatherIcon"
      );

    if (welcomeEl)
      welcomeEl.innerText =
        message;

    if (iconEl)
      iconEl.innerText =
        icon;

  }

  updateWelcome();

  setInterval(
    updateWelcome,
    60000
  );

  /* =========================
     ACTIVE NAV
  ========================= */

  const currentPage =

    window.location.pathname
    .split("/")
    .pop();

  document
    .querySelectorAll(
      ".admin-nav .nav-btn"
    )
    .forEach(link => {

      if (
        link.getAttribute("href")
        === currentPage
      ) {

        link.classList.add(
          "active"
        );

      }

    });

});

/* =========================
   GLOBAL LOGOUT
========================= */

function logout(){

  localStorage.removeItem(
    "token"
  );

  localStorage.removeItem(
    "role"
  );

  localStorage.removeItem(
    "name"
  );

  localStorage.removeItem(
    "companyName"
  );

  window.location.href =
  "/login.html";

}