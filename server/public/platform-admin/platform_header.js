document.addEventListener("DOMContentLoaded", async () => {

  /* =========================
     PLATFORM ADMIN GUARD
  ========================= */

  const role =
    localStorage.getItem("role") || "";

  if(role !== "PLATFORM_ADMIN"){

    window.location.replace(
      "/login.html"
    );

    return;
  }

  /* =========================
     HEADER CONTAINER
  ========================= */

  const headerContainer =
    document.getElementById("platformHeader") ||
    document.getElementById("headerContainer") ||
    document.getElementById("header-container");

  if(!headerContainer) return;

  /* =========================
     LOAD HEADER HTML
  ========================= */

  try{

    const res =
      await fetch("/platform-admin/platform_header.html");

    if(!res.ok){
      throw new Error(
        "Header load failed"
      );
    }

    const html =
      await res.text();

    headerContainer.innerHTML =
      html;

  }catch(err){

    console.log(
      "PLATFORM HEADER LOAD ERROR:",
      err
    );

    return;
  }

  /* =========================
     PLATFORM TITLE
  ========================= */

  const title =
    document.getElementById(
      "platformTitle"
    );

  if(title){

    title.innerText =
      "GH Mobility Platform";

  }

  /* =========================
     DYNAMIC TIME
  ========================= */

  function updatePlatformTime(){

    const timezone =
      localStorage.getItem(
        "platformTimezone"
      ) ||
      localStorage.getItem(
        "systemTimezone"
      ) ||
      "America/Phoenix";

    const now =
      new Date();

    const date =
      now.toLocaleDateString(
        "en-US",
        {
          timeZone:timezone,
          weekday:"short",
          month:"short",
          day:"numeric",
          year:"numeric"
        }
      );

    const time =
      now.toLocaleTimeString(
        "en-US",
        {
          timeZone:timezone,
          hour:"numeric",
          minute:"2-digit",
          second:"2-digit",
          hour12:true
        }
      );

    const el =
      document.getElementById(
        "platformTime"
      );

    if(el){

      el.innerHTML =
        `${date}<br>${time}`;

    }

  }

  updatePlatformTime();

  setInterval(
    updatePlatformTime,
    1000
  );

  /* =========================
     WELCOME MESSAGE
  ========================= */

  function updatePlatformWelcome(){

    const timezone =
      localStorage.getItem(
        "platformTimezone"
      ) ||
      localStorage.getItem(
        "systemTimezone"
      ) ||
      "America/Phoenix";

    const now =
      new Date();

    const hour =
      Number(
        new Intl.DateTimeFormat(
          "en-US",
          {
            hour:"numeric",
            hour12:false,
            timeZone:timezone
          }
        ).format(now)
      );

    let message =
      "Good Evening";

    let icon =
      "🌙";

    if(hour < 12){

      message =
        "Good Morning";

      icon =
        "☀️";

    }else if(hour < 18){

      message =
        "Good Afternoon";

      icon =
        "🌤️";

    }

    const welcomeEl =
      document.getElementById(
        "platformWelcomeMessage"
      );

    const iconEl =
      document.getElementById(
        "platformWeatherIcon"
      );

    if(welcomeEl){

      welcomeEl.innerText =
        message;

    }

    if(iconEl){

      iconEl.innerText =
        icon;

    }

  }

  updatePlatformWelcome();

  setInterval(
    updatePlatformWelcome,
    60000
  );

  /* =========================
     ACTIVE NAV
  ========================= */

  function setPlatformActiveNav(){

    const currentPage =
      window.location.pathname
        .split("/")
        .pop();

    document
      .querySelectorAll(
        ".platform-nav .platform-nav-btn, .platform-mobile-side-nav a"
      )
      .forEach(link=>{

        const href =
          link.getAttribute("href") || "";

        if(href === currentPage){

          link.classList.add(
            "active"
          );

        }else{

          link.classList.remove(
            "active"
          );

        }

      });

  }

  /* =========================
     BUILD MOBILE MENU
  ========================= */

  function buildPlatformMobileMenu(){

    const desktopNav =
      document.getElementById(
        "platformDesktopNav"
      );

    const mobileNav =
      document.getElementById(
        "platformMobileSideNav"
      );

    if(
      !desktopNav ||
      !mobileNav
    ) return;

    mobileNav.innerHTML = "";

    const links =
      desktopNav.querySelectorAll(
        "a.platform-nav-btn"
      );

    links.forEach(link=>{

      const a =
        document.createElement("a");

      a.href =
        link.getAttribute("href") || "#";

      a.innerText =
        link.innerText.trim();

      if(
        link.classList.contains(
          "active"
        )
      ){

        a.classList.add(
          "active"
        );

      }

      mobileNav.appendChild(a);

    });

    setPlatformActiveNav();

  }

  buildPlatformMobileMenu();

  /* =========================
     MOBILE MENU
  ========================= */

  const mobileMenuBtn =
    document.getElementById(
      "platformMobileMenuBtn"
    );

  const mobileCloseBtn =
    document.getElementById(
      "platformMobileCloseBtn"
    );

  const mobileOverlay =
    document.getElementById(
      "platformMobileOverlay"
    );

  const mobileSideMenu =
    document.getElementById(
      "platformMobileSideMenu"
    );

  function openPlatformMobileMenu(){

    if(mobileOverlay){

      mobileOverlay.classList.add(
        "show"
      );

    }

    if(mobileSideMenu){

      mobileSideMenu.classList.add(
        "show"
      );

    }

    document.body.style.overflow =
      "hidden";

  }

  function closePlatformMobileMenu(){

    if(mobileOverlay){

      mobileOverlay.classList.remove(
        "show"
      );

    }

    if(mobileSideMenu){

      mobileSideMenu.classList.remove(
        "show"
      );

    }

    document.body.style.overflow =
      "";

  }

  if(mobileMenuBtn){

    mobileMenuBtn.addEventListener(
      "click",
      e=>{

        e.preventDefault();

        openPlatformMobileMenu();

      }
    );

  }

  if(mobileCloseBtn){

    mobileCloseBtn.addEventListener(
      "click",
      e=>{

        e.preventDefault();

        closePlatformMobileMenu();

      }
    );

  }

  if(mobileOverlay){

    mobileOverlay.addEventListener(
      "click",
      closePlatformMobileMenu
    );

  }

  document.addEventListener(
    "keydown",
    e=>{

      if(e.key === "Escape"){

        closePlatformMobileMenu();

      }

    }
  );

  const mobileNav =
    document.getElementById(
      "platformMobileSideNav"
    );

  if(mobileNav){

    mobileNav.addEventListener(
      "click",
      e=>{

        const link =
          e.target.closest("a");

        if(link){

          closePlatformMobileMenu();

        }

      }
    );

  }

  setPlatformActiveNav();

});


/* =========================
   PLATFORM LOGOUT
========================= */

function platformLogout(){

  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  localStorage.removeItem("tenantId");

  window.location.href =
    "/login.html";

}